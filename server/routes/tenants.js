// server/routes/tenants.js - SIMPLIFICADO (solo rol global)
const { Router } = require("express");
const db = require("../db/connection");
const requireAuth = require("../lib/requireAuth");
const { requireRole, isAdmin, isOwner } = require("../lib/authorize");
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
   GET /tenants → lista workspaces
   - Admin/Owner GLOBALES: ven todos los workspaces
   - Members: solo ven los que crearon
========================================================= */
r.get("/tenants", async (req, res) => {
  try {
    const uid = resolveUserId(req);
    
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
    
    // Si no es admin GLOBAL, solo mostrar workspaces que creó
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
        `SELECT 
          t.id, 
          t.name, 
          t.created_by,
          u.name AS owner_name,
          u.email AS owner_email
        FROM tenants t
        LEFT JOIN users u ON u.id = t.created_by
        WHERE t.id = ?`
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
   🔑 Solo ADMIN u OWNER globales pueden crear workspaces
   - Members NO pueden crear workspaces
========================================================= */
r.post("/tenants", requireRole(['admin', 'owner']), async (req, res) => {
  const requesterId = resolveUserId(req);
  
  console.log('✅ [POST /tenants] Admin/Owner creando workspace:', requesterId);
  
  const { id, name } = req.body || {};
  if (!id || !name) {
    return res.status(400).json({ error: "id_and_name_required" });
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return res.status(400).json({ error: "invalid_tenant_id" });
  }

  try {
    const exists = await db
      .prepare("SELECT 1 FROM tenants WHERE id = ? LIMIT 1")
      .get(id);
    if (exists) return res.status(409).json({ error: "tenant_exists" });

    const now = Date.now();

    // Crear workspace (sin memberships)
    await db.prepare(
      `INSERT INTO tenants (id, name, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?)`
    ).run(id, name, requesterId, now, now);

    console.log(`✅ Workspace '${name}' (${id}) creado por ${requesterId}`);
    
    // 📝 Audit: workspace creado
    auditLog({ 
      userId: requesterId, 
      tenantId: id,
      action: ACTIONS.CREATE_WORKSPACE,
      resourceType: "workspace",
      resourceId: id,
      details: { 
        workspace_id: id,
        workspace_name: name
      }
    }, req);
    
    return res.status(201).json({
      id,
      name,
      created_by: requesterId
    });
  } catch (e) {
    console.error("POST /tenants error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/* =========================================================
   POST /tenants/switch → cambiar workspace activo
   - Cualquier usuario puede cambiar a cualquier workspace (sin memberships)
========================================================= */
r.post("/tenants/switch", async (req, res) => {
  const { tenant_id } = req.body || {};
  if (!tenant_id)
    return res.status(400).json({ error: "tenant_id_required" });

  try {
    // ✅ Placeholder PostgreSQL ($1)
    const tenant = await db
      .prepare("SELECT id, name FROM tenants WHERE id = $1")
      .get(tenant_id);

    if (!tenant) return res.status(404).json({ error: "tenant_not_found" });

    console.log('🔄 Switch tenant:', { from: req.tenantId, to: tenant_id, user: req.user?.id });
    
    return res.json({ 
      ok: true, 
      active_tenant: tenant_id,
      tenant_id, 
      tenant_name: tenant.name 
    });
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
    console.log('🔍 /tenants/discover - query:', q);
    
    if (!q) return res.json({ items: [] });

    const userId = resolveUserId(req);
    const searchPattern = `%${q}%`;
    
    const rows = await db
      .prepare(
        `SELECT 
          t.id, 
          t.name, 
          t.created_by,
          u.name AS owner_name,
          u.email AS owner_email,
          (t.created_by = $1) AS is_creator
        FROM tenants t
        LEFT JOIN users u ON u.id = t.created_by
        WHERE t.id LIKE $2 OR t.name LIKE $3
        ORDER BY t.name ASC
        LIMIT 20`
      )
      .all(userId, searchPattern, searchPattern);

    console.log('✅ Found workspaces:', rows?.length || 0);
    
    return res.json({ items: rows || [] });
  } catch (e) {
    console.error("GET /tenants/discover error:", e);
    return res.status(500).json({ error: "internal_error", message: e.message });
  }
});

/* =========================================================
   DELETE /tenants/:id → eliminar workspace
   � Solo ADMIN u OWNER GLOBALES pueden eliminar workspaces
   - Members NO pueden eliminar workspaces (ni siquiera los que crearon)
   - Elimina todos los datos relacionados (leads, contacts, etc.)
   - No se puede eliminar el workspace 'demo' por seguridad
========================================================= */
r.delete("/tenants/:id", async (req, res) => {
  try {
    const tenantId = String(req.params.id || "").trim();
    console.log("\n🗑️ DELETE /tenants/:id");
    console.log("   Tenant ID:", tenantId);
    
    if (!tenantId) {
      return res.status(400).json({ error: "tenant_id_required" });
    }

    const tenant = db
      .prepare("SELECT id, name, created_by FROM tenants WHERE id = ?")
      .get(tenantId);
    
    if (!tenant) {
      return res.status(404).json({ error: "tenant_not_found" });
    }

    // Protección: No permitir eliminar el workspace demo
    if (tenantId === "demo") {
      return res.status(403).json({ 
        error: "cannot_delete_demo_workspace",
        message: "El workspace 'demo' no puede ser eliminado"
      });
    }

    const requesterId = resolveUserId(req);
    
    // 🔑 Solo ADMIN u OWNER GLOBALES pueden eliminar workspaces
    const isAdminOrOwner = await isAdmin(requesterId);
    
    if (!isAdminOrOwner) {
      return res.status(403).json({ 
        error: "forbidden_admin_or_owner_required",
        message: "Solo usuarios con rol admin u owner pueden eliminar workspaces"
      });
    }

    console.log(`🗑️ Eliminando workspace '${tenant.name}' (${tenant.id})...`);

    // Eliminar todo lo relacionado al workspace
    await db.prepare("DELETE FROM leads WHERE tenant_id = ?").run(tenantId);
    await db.prepare("DELETE FROM contacts WHERE tenant_id = ?").run(tenantId);
    await db.prepare("DELETE FROM accounts WHERE tenant_id = ?").run(tenantId);
    await db.prepare("DELETE FROM deals WHERE tenant_id = ?").run(tenantId);
    await db.prepare("DELETE FROM notes WHERE tenant_id = ?").run(tenantId);
    await db.prepare("DELETE FROM activities WHERE tenant_id = ?").run(tenantId);
    await db.prepare("DELETE FROM events WHERE tenant_id = ?").run(tenantId);
    await db.prepare("DELETE FROM audit_logs WHERE tenant_id = ?").run(tenantId);
    await db.prepare("DELETE FROM tenants WHERE id = ?").run(tenantId);

    // 📝 Audit: workspace eliminado
    auditLog({ 
      userId: requesterId, 
      tenantId: null,
      action: ACTIONS.DELETE_WORKSPACE,
      resourceType: "workspace",
      resourceId: tenantId,
      details: { 
        workspace_id: tenantId,
        workspace_name: tenant.name
      }
    }, req);

    console.log(`✅ Workspace '${tenant.name}' eliminado`);

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

module.exports = r;
