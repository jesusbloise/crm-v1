// server/routes/tenants.js
const { Router } = require("express");
const db = require("../db/connection");
const requireAuth = require("../lib/requireAuth");
const { requireRole, isAdmin } = require("../lib/authorize");
const { log: auditLog, ACTIONS } = require("../lib/auditLog");

const r = Router();
r.use(requireAuth);

/* =========================================================
   Helpers
========================================================= */
function noStore(res) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
}

function resolveUserId(req) {
  return req.user?.id || req.auth?.sub;
}

/** Resuelve tenant activo (header tiene prioridad; si no, el del token) */
r.use((req, _res, next) => {
  const headerTenant =
    (req.get("x-tenant-id") || req.get("tenant") || "").trim() || null;
  const tokenTenant = req.auth?.active_tenant || null;
  req.tenantId = headerTenant || tokenTenant || null;
  next();
});

/* =========================================================
   GET /tenants → lista todos los workspaces (admin/owner ven todos, member solo los que creó)
========================================================= */
r.get("/tenants", async (req, res) => {
  try {
    const uid = resolveUserId(req);
    
    // Admin/Owner ven todos los workspaces
    // Members solo ven los que crearon
    let query = `
      SELECT
        t.id,
        t.name,
        t.created_by,
        t.created_at,
        t.updated_at,
        u.name AS owner_name,
        u.email AS owner_email,
        (t.created_by = ?) AS is_owner
      FROM tenants t
      LEFT JOIN users u ON u.id = t.created_by
    `;
    
    const params = [uid];
    
    // Si no es admin, solo mostrar workspaces que creó
    if (!(await isAdmin(uid))) {
      query += ` WHERE t.created_by = ?`;
      params.push(uid);
    }
    
    query += ` ORDER BY t.name ASC`;
    
    const rows = db.prepare(query).all(...params);

    const activeTenant = req.tenantId || rows[0]?.id || null;

    noStore(res);
    return res.json({ items: rows, active_tenant: activeTenant });
  } catch (e) {
    console.error("GET /tenants error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/* =========================================================
   GET /tenants/current → workspace activo
========================================================= */
r.get("/tenants/current", async (req, res) => {
  try {
    if (!req.tenantId) {
      noStore(res);
      return res.json({ tenant: null });
    }

    const tenant = db
      .prepare(
        `
      SELECT 
        t.id, 
        t.name, 
        t.created_by,
        u.name AS owner_name,
        u.email AS owner_email
      FROM tenants t
      LEFT JOIN users u ON u.id = t.created_by
      WHERE t.id = ?
    `
      )
      .get(req.tenantId);

    noStore(res);
    return res.json({ tenant: tenant || null });
  } catch (e) {
    console.error("GET /tenants/current error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/* =========================================================
   POST /tenants → crea un nuevo workspace
   � CUALQUIER usuario autenticado puede crear workspaces
   - Al crear, el usuario se convierte en OWNER del workspace
   - jesusbloise@gmail.com también se agrega como owner automáticamente
========================================================= */
r.post("/tenants", async (req, res) => {
  const requesterId = resolveUserId(req);
  
  // 🔍 DEBUG: Log al inicio del handler
  console.log('🔍 [POST /tenants] Handler started:', {
    requesterId,
    body: req.body,
    tenantId: req.tenantId,
    'req.user.id': req.user?.id,
    'req.auth.sub': req.auth?.sub
  });
  
  if (!requesterId) {
    console.log('❌ [POST /tenants] No requesterId');
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id, name } = req.body || {};
  if (!id || !name) {
    console.log('❌ [POST /tenants] Missing id or name');
    return res.status(400).json({ error: "id_and_name_required" });
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    console.log('❌ [POST /tenants] Invalid tenant_id format');
    return res.status(400).json({ error: "invalid_tenant_id" });
  }

  try {
    console.log(`✅ [POST /tenants] User ${requesterId} creating workspace...`);
    
    // 🔑 REGLA SIMPLE: Al crear workspace, el usuario es OWNER (igual que SQLite)
    const requester = await db
      .prepare("SELECT email FROM users WHERE id = ?")
      .get(requesterId);
    
    const isJesus = requester?.email === "jesusbloise@gmail.com";
    const creatorRole = "owner"; // Siempre owner al crear workspace
    
    console.log(`📋 [POST /tenants] Creador: ${requester?.email}, Rol asignado: ${creatorRole}`);

    const exists = await db
      .prepare("SELECT 1 FROM tenants WHERE id = ? LIMIT 1")
      .get(id);
    if (exists) return res.status(409).json({ error: "tenant_exists" });

    const now = Date.now();

    // PostgreSQL: ejecutar las inserciones secuencialmente
    await db.prepare(
      `INSERT INTO tenants (id, name, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?)`
    ).run(id, name, requesterId, now, now);

    await db.prepare(
      `INSERT INTO memberships (user_id, tenant_id, role, created_at, updated_at)
       VALUES (?,?,?,?,?)`
    ).run(requesterId, id, creatorRole, now, now);

    // Asegura que jesusbloise quede como owner también
    if (!isJesus) {
      const jesus = await db
        .prepare("SELECT id FROM users WHERE email = 'jesusbloise@gmail.com' LIMIT 1")
        .get();
      if (jesus) {
        // INSERT ON CONFLICT DO NOTHING en PostgreSQL
        await db.prepare(
          `INSERT INTO memberships (user_id, tenant_id, role, created_at, updated_at)
           VALUES (?,?,?,?,?)
           ON CONFLICT (user_id, tenant_id) DO NOTHING`
        ).run(jesus.id, id, "owner", now, now);
      }
    }
    
    // 📝 Audit: workspace creado
    auditLog({ 
      userId: requesterId, 
      tenantId: id,
      action: ACTIONS.CREATE_WORKSPACE,
      resourceType: "workspace",
      resourceId: id,
      details: { 
        workspace_id: id,
        workspace_name: name,
        creator_role: creatorRole
      }
    }, req);
    
    return res.status(201).json({
      id,
      name,
      created_by: requesterId,
      creator_role: creatorRole,
    });
  } catch (e) {
    console.error("POST /tenants error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/* =========================================================
   (Opcional) POST /tenants/switch → valida y cambia workspace activo
   *Tu front usa /me/tenant/switch, pero dejamos este por compat*
========================================================= */
r.post("/tenants/switch", async (req, res) => {
  const { tenant_id } = req.body || {};
  if (!tenant_id)
    return res.status(400).json({ error: "tenant_id_required" });

  try {
    const membership = await db
      .prepare(
        `SELECT role
         FROM memberships
         WHERE user_id = ? AND tenant_id = ?
         LIMIT 1`
      )
      .get(resolveUserId(req), tenant_id);

    if (!membership) return res.status(403).json({ error: "forbidden_tenant" });

    return res.json({ ok: true, tenant_id, role: membership.role });
  } catch (e) {
    console.error("POST /tenants/switch error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/* =========================================================
   GET /tenants/discover → búsqueda de workspaces
========================================================= */
r.get("/tenants/discover", async (req, res) => {
  try {
    const q = String(req.query.query || "").trim();
    if (!q) return res.json({ items: [] });

    const rows = db
      .prepare(
        `
      SELECT 
        t.id, 
        t.name, 
        t.created_by,
        u.name AS owner_name,
        u.email AS owner_email,
        (t.created_by = ?) AS is_creator
      FROM tenants t
      LEFT JOIN users u ON u.id = t.created_by
      WHERE t.id LIKE ? OR t.name LIKE ?
      ORDER BY t.name  ASC
      LIMIT 20
    `
      )
      .all(resolveUserId(req), `%${q}%`, `%${q}%`);

    return res.json({ items: rows });
  } catch (e) {
    console.error("GET /tenants/discover error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/* =========================================================
   POST /tenants/join → unirse a workspace con solo el ID
   🔓 CUALQUIER usuario puede unirse si conoce el ID del workspace
   - Primera vez: se crea membership como 'member'
   - Ya miembro: retorna rol actual
   - Creador: se une como 'owner'
========================================================= */
r.post("/tenants/join", async (req, res) => {
  try {
    const { tenant_id } = req.body || {};
    if (!tenant_id)
      return res.status(400).json({ error: "tenant_id_required" });

    const t = await db
      .prepare("SELECT id, name, created_by FROM tenants WHERE id = ?")
      .get(tenant_id);
    if (!t) return res.status(404).json({ error: "tenant_not_found" });

    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "unauthorized" });

    // Verificar si ya es miembro
    const exists = await db
      .prepare(
        "SELECT role FROM memberships WHERE user_id = ? AND tenant_id = ? LIMIT 1"
      )
      .get(userId, t.id);
    
    if (exists) {
      // Ya es miembro, retornar success
      return res.json({ ok: true, joined: false, message: "already_member", role: exists.role });
    }

    // � Determinar rol al unirse:
    // - Si es el creador → owner
    // - Si no → member
    const now = Date.now();
    let role = "member";
    
    if (t.created_by === userId) {
      role = "owner"; // Creador siempre owner
    }
    
    console.log(`👤 [POST /tenants/join] Usuario ${userId} uniéndose a ${tenant_id} como ${role}`);
    
    await db.prepare(
      `INSERT INTO memberships (user_id, tenant_id, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(userId, t.id, role, now, now);

    return res.status(201).json({
      ok: true,
      joined: true,
      tenant: { id: t.id, name: t.name },
      role: role,
    });
    
  } catch (e) {
    console.error("POST /tenants/join error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/* =========================================================
   GET /tenants/:id/members → lista miembros del workspace
========================================================= */
r.get("/tenants/:id/members", async (req, res) => {
  try {
    const tenantId = String(req.params.id || "").trim();
    if (!tenantId)
      return res.status(400).json({ error: "tenant_id_required" });

    const t = db
      .prepare(
        "SELECT id, name, created_by, created_at FROM tenants WHERE id = ?"
      )
      .get(tenantId);
    if (!t) return res.status(404).json({ error: "tenant_not_found" });

    // Debe ser miembro
    const isMember = db
      .prepare(
        `SELECT role FROM memberships WHERE user_id = ? AND tenant_id = ? LIMIT 1`
      )
      .get(resolveUserId(req), tenantId);
    if (!isMember) return res.status(403).json({ error: "forbidden_tenant" });

    const rows = db
      .prepare(
        `
      SELECT
        u.id,
        u.name,
        u.email,
        u.avatar_url,
        u.headline,
        m.role,
        m.created_at AS member_since,
        m.updated_at AS member_updated_at
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      WHERE m.tenant_id = ?
      ORDER BY
        CASE m.role
          WHEN 'owner' THEN 0
          WHEN 'admin' THEN 1
          ELSE 2
        END,
        u.name  ASC
    `
      )
      .all(tenantId);

    return res.json({
      tenant: {
        id: t.id,
        name: t.name,
        created_by: t.created_by,
        created_at: t.created_at,
      },
      items: rows,
    });
  } catch (e) {
    console.error("GET /tenants/:id/members error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/* =========================================================
   DELETE /tenants/:id → eliminar workspace
   🔒 SOLO admin/owner del workspace específico pueden eliminarlo
   - Verifica que el usuario sea admin o owner en ESE workspace
   - Elimina todos los datos relacionados (memberships, leads, etc.)
   - No se puede eliminar el workspace 'demo' por seguridad
========================================================= */
r.delete("/tenants/:id", async (req, res) => {
  try {
    const tenantId = String(req.params.id || "").trim();
    console.log("\n🗑️ DELETE /tenants/:id");
    console.log("   Tenant ID solicitado:", tenantId);
    console.log("   Usuario:", resolveUserId(req));
    
    if (!tenantId) {
      console.log("   ❌ Error: tenant_id vacío");
      return res.status(400).json({ error: "tenant_id_required" });
    }

    // Verificar que el workspace existe
    const tenant = db
      .prepare("SELECT id, name, created_by FROM tenants WHERE id = ?")
      .get(tenantId);
    
    console.log("   Workspace encontrado:", tenant ? `${tenant.name} (${tenant.id})` : "NO EXISTE");
    
    if (!tenant) {
      console.log("   ❌ Error: workspace no existe en DB");
      return res.status(404).json({ error: "tenant_not_found" });
    }

    // Protección: No permitir eliminar el workspace demo
    if (tenantId === "demo") {
      return res.status(403).json({ 
        error: "cannot_delete_demo_workspace",
        message: "El workspace 'demo' no puede ser eliminado"
      });
    }

    // Verificar que el usuario sea admin o owner en ESE workspace específico
    const requesterId = resolveUserId(req);
    const requesterRole = await getRequesterRole(req, tenantId);
    
    if (!requesterRole) {
      return res.status(403).json({ 
        error: "forbidden_not_member",
        message: "No eres miembro de este workspace"
      });
    }

    if (requesterRole !== "admin" && requesterRole !== "owner") {
      return res.status(403).json({ 
        error: "forbidden_requires_admin_or_owner",
        message: "Solo admin u owner pueden eliminar workspaces"
      });
    }

    // Eliminar secuencialmente todo lo relacionado al workspace (PostgreSQL)
    // 1. Eliminar memberships
    await db.prepare("DELETE FROM memberships WHERE tenant_id = ?").run(tenantId);
    
    // 2. Eliminar leads
    await db.prepare("DELETE FROM leads WHERE tenant_id = ?").run(tenantId);
    
    // 3. Eliminar contacts
    await db.prepare("DELETE FROM contacts WHERE tenant_id = ?").run(tenantId);
    
    // 4. Eliminar accounts
    await db.prepare("DELETE FROM accounts WHERE tenant_id = ?").run(tenantId);
    
    // 5. Eliminar deals
    await db.prepare("DELETE FROM deals WHERE tenant_id = ?").run(tenantId);
    
    // 6. Eliminar notes
    await db.prepare("DELETE FROM notes WHERE tenant_id = ?").run(tenantId);
    
    // 7. Eliminar activities
    await db.prepare("DELETE FROM activities WHERE tenant_id = ?").run(tenantId);
    
    // 8. Eliminar events
    await db.prepare("DELETE FROM events WHERE tenant_id = ?").run(tenantId);
    
    // 9. Eliminar audit logs del workspace
    await db.prepare("DELETE FROM audit_logs WHERE tenant_id = ?").run(tenantId);
    
    // 10. Finalmente eliminar el tenant
    await db.prepare("DELETE FROM tenants WHERE id = ?").run(tenantId);

    // 📝 Audit: workspace eliminado (se guarda en NULL tenant ya que el workspace fue eliminado)
    auditLog({ 
      userId: requesterId, 
      tenantId: null, // El tenant ya no existe
      action: ACTIONS.DELETE_WORKSPACE,
      resourceType: "workspace",
      resourceId: tenantId,
      details: { 
        workspace_id: tenantId,
        workspace_name: tenant.name,
        deleted_by_role: requesterRole
      }
    }, req);

    return res.json({ 
      ok: true, 
      message: "workspace_deleted",
      deleted_workspace: {
        id: tenant.id,
        name: tenant.name
      }
    });

  } catch (e) {
    console.error("DELETE /tenants/:id error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/* =========================================================
   PATCH /tenants/:id/members/:user_id → cambiar rol
   Reglas:
   - OWNER puede todo (asignar/quitar owner, admin, member)
   - ADMIN solo puede: member ⇄ admin
   - Nadie puede degradar/eliminar al owner (salvo otro owner)
   - Nadie puede cambiarse a sí mismo de owner a otro rol
========================================================= */
r.patch("/tenants/:id/members/:user_id", async (req, res) => {
  try {
    const tenantId = String(req.params.id || "").trim();
    const targetUserId = String(req.params.user_id || "").trim();
    const { role } = req.body || {};

    if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });
    if (!targetUserId) return res.status(400).json({ error: "user_id_required" });
    if (!role) return res.status(400).json({ error: "role_required" });

    const VALID_ROLES = ["owner", "admin", "member"];
    if (!VALID_ROLES.includes(role))
      return res
        .status(400)
        .json({ error: "invalid_role", valid_roles: VALID_ROLES });

    const tenant = db
      .prepare("SELECT id, name, created_by FROM tenants WHERE id = ?")
      .get(tenantId);
    if (!tenant) return res.status(404).json({ error: "tenant_not_found" });

    const requesterId = resolveUserId(req);
    const requesterRole = await getRequesterRole(req, tenantId);
    if (!requesterRole)
      return res.status(403).json({ error: "forbidden_tenant" });

    // El target debe ser miembro del tenant
    const targetMembership = db
      .prepare(
        `
      SELECT role FROM memberships WHERE user_id = ? AND tenant_id = ? LIMIT 1
    `
      )
      .get(targetUserId, tenantId);
    if (!targetMembership)
      return res.status(404).json({ error: "user_not_member_of_workspace" });

    // No permitir cambiarse a sí mismo desde owner a otro rol
    if (requesterId === targetUserId && requesterRole === "owner" && role !== "owner") {
      return res.status(403).json({ error: "cannot_change_own_role_from_owner" });
    }

    // Reglas de mutación:
    if (requesterRole === "admin") {
      // Admin NO puede tocar owner ni otorgar/quitar owner
      if (targetMembership.role === "owner" || role === "owner") {
        return res
          .status(403)
          .json({ error: "admin_cannot_assign_or_modify_owner" });
      }
      // Admin solo puede alternar entre member y admin
      if (!(role === "member" || role === "admin")) {
        return res
          .status(403)
          .json({ error: "admin_can_only_set_member_or_admin" });
      }
    } else if (requesterRole !== "owner") {
      // Miembros no pueden cambiar roles
      return res.status(403).json({ error: "forbidden_requires_admin_or_owner" });
    }
    // Si es owner: puede todo (incluido setear owner)

    const now = Date.now();
    await db.prepare(
      `
      UPDATE memberships
         SET role = ?, updated_at = ?
       WHERE user_id = ? AND tenant_id = ?
    `
    ).run(role, now, targetUserId, tenantId);

    const updatedMember = db
      .prepare(
        `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.avatar_url,
        m.role,
        m.updated_at
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      WHERE m.user_id = ? AND m.tenant_id = ?
    `
      )
      .get(targetUserId, tenantId);

    return res.json({ ok: true, message: "role_updated", member: updatedMember });
  } catch (e) {
    console.error("PATCH /tenants/:id/members/:user_id error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

module.exports = r;

