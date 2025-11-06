// server/routes/tenants.js
const { Router } = require("express");
const db = require("../db/connection");
const requireAuth = require("../lib/requireAuth");

const r = Router();

// Protección adicional por si reutilizan este router en otro lado.
r.use(requireAuth);

const ALLOW_SELF_JOIN = process.env.ALLOW_SELF_JOIN === "1";

/**
 * GET /tenants
 * Lista los tenants a los que pertenece el usuario autenticado.
 */
r.get("/tenants", (req, res) => {
  try {
    const rows = db
      .prepare(
        `
        SELECT
          t.id,
          t.name,
          m.role,
          t.created_at,
          t.updated_at,
          u.name as owner_name,
          u.email as owner_email
        FROM memberships m
        JOIN tenants t ON t.id = m.tenant_id
        LEFT JOIN users u ON u.id = t.created_by
        WHERE m.user_id = ?
        ORDER BY t.name COLLATE NOCASE ASC
      `
      )
      .all(req.user.id);

    return res.json({ items: rows });
  } catch (e) {
    console.error("GET /tenants error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * GET /tenants/current
 * Devuelve el tenant activo (resuelto por header X-Tenant-Id o token).
 */
r.get("/tenants/current", (req, res) => {
  try {
    if (!req.tenantId) return res.json({ tenant: null });

    const tenant = db
      .prepare(`
        SELECT 
          t.id, 
          t.name, 
          t.created_by,
          u.name as owner_name,
          u.email as owner_email
        FROM tenants t
        LEFT JOIN users u ON u.id = t.created_by
        WHERE t.id = ?
      `)
      .get(req.tenantId);

    return res.json({ tenant: tenant || null });
  } catch (e) {
    console.error("GET /tenants/current error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /tenants
 * Crea un tenant nuevo y agrega al usuario actual como owner.
 * Body: { id, name }
 *
 * ⚠️ Ahora guarda también tenants.created_by = req.user.id
 */
r.post("/tenants", (req, res) => {
  // Permitimos que cualquier usuario autenticado pueda crear workspaces
  if (!req.user?.id && !req.auth?.sub) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { id, name } = req.body || {};
  if (!id || !name) return res.status(400).json({ error: "id_and_name_required" });

  // Validación simple del id (alfa, guion y guion_bajo)
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return res.status(400).json({ error: "invalid_tenant_id" });
  }

  try {
    const exists = db
      .prepare(`SELECT 1 AS one FROM tenants WHERE id = ? LIMIT 1`)
      .get(id);
    if (exists) return res.status(409).json({ error: "tenant_exists" });

    const now = Date.now();
    const creatorId = req.user?.id || req.auth?.sub;
    
    // Obtener el email del usuario creador
    const creator = db
      .prepare(`SELECT email FROM users WHERE id = ?`)
      .get(creatorId);
    
    // jesusbloise@gmail.com es admin cuando crea workspaces, todos los demás son member
    const creatorRole = creator?.email === "jesusbloise@gmail.com" ? "admin" : "member";

    const txn = db.transaction(() => {
      db.prepare(
        `
        INSERT INTO tenants (id, name, created_by, created_at, updated_at)
        VALUES (?,?,?,?,?)
      `
      ).run(id, name, creatorId, now, now);

      // Asignar rol según el usuario
      db.prepare(
        `
        INSERT INTO memberships (user_id, tenant_id, role, created_at, updated_at)
        VALUES (?,?,?,?,?)
      `
      ).run(creatorId, id, creatorRole, now, now);
      
      // Si el creador NO es jesusbloise, agregar a jesusbloise como owner
      if (creator?.email !== "jesusbloise@gmail.com") {
        const jesusUser = db
          .prepare(`SELECT id FROM users WHERE email = 'jesusbloise@gmail.com'`)
          .get();
        
        if (jesusUser) {
          db.prepare(
            `
            INSERT OR IGNORE INTO memberships (user_id, tenant_id, role, created_at, updated_at)
            VALUES (?,?,?,?,?)
          `
          ).run(jesusUser.id, id, "owner", now, now);
        }
      }
    });

    txn();
    return res.status(201).json({ id, name, created_by: creatorId, creator_role: creatorRole });
  } catch (e) {
    console.error("POST /tenants error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /tenants/switch
 * Valida que el usuario pertenezca al tenant y confirma el cambio.
 * Body: { tenant_id }
 *
 * Nota: el “switch real” lo haces enviando el header X-Tenant-Id desde el cliente.
 */
r.post("/tenants/switch", (req, res) => {
  const { tenant_id } = req.body || {};
  if (!tenant_id) return res.status(400).json({ error: "tenant_id_required" });

  try {
    const membership = db
      .prepare(
        `
        SELECT role
        FROM memberships
        WHERE user_id = ? AND tenant_id = ?
        LIMIT 1
      `
      )
      .get(req.user.id, tenant_id);

    if (!membership) {
      return res.status(403).json({ error: "forbidden_tenant" });
    }

    return res.json({ ok: true, tenant_id, role: membership.role });
  } catch (e) {
    console.error("POST /tenants/switch error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/* =========================================================
   Descubrir tenants y Unirse por ID (auto-join opcional)
   Controlado por env ALLOW_SELF_JOIN=1
========================================================= */

/**
 * GET /tenants/discover?query=ac
 * Búsqueda acotada por id o name (prefijo/substring). Máx 20 resultados.
 * Devuelve solo { id, name } para evitar filtrar data sensible.
 */
r.get("/tenants/discover", (req, res) => {
  try {
    const q = String(req.query.query || "").trim();
    if (!q) return res.json({ items: [] });
    const limit = 20;

    const rows = db
      .prepare(
        `
        SELECT 
          t.id, 
          t.name, 
          t.created_by,
          u.name as owner_name,
          u.email as owner_email,
          (t.created_by = ?) as is_creator
        FROM tenants t
        LEFT JOIN users u ON u.id = t.created_by
        WHERE t.id LIKE ? OR t.name LIKE ?
        ORDER BY t.name COLLATE NOCASE ASC
        LIMIT ?
      `
      )
      .all(req.user.id, `%${q}%`, `%${q}%`, limit);

    return res.json({ items: rows });
  } catch (e) {
    console.error("GET /tenants/discover error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /tenants/join
 * Body: { tenant_id }
 * Si ALLOW_SELF_JOIN=1 → crea membership (member) si no existía.
 * Si =0 → 403 (usar invitaciones).
 */
r.post("/tenants/join", (req, res) => {
  try {
    const { tenant_id } = req.body || {};
    if (!tenant_id) return res.status(400).json({ error: "tenant_id_required" });

    const t = db
      .prepare(`SELECT id, name FROM tenants WHERE id = ?`)
      .get(tenant_id);
    if (!t) return res.status(404).json({ error: "tenant_not_found" });

    if (!ALLOW_SELF_JOIN) {
      return res
        .status(403)
        .json({ error: "self_join_disabled_use_invitations" });
    }

    const userId = req.user?.id || req.auth?.sub;
    if (!userId) return res.status(401).json({ error: "unauthorized" });

    const exists = db
      .prepare(
        `SELECT 1 FROM memberships WHERE user_id = ? AND tenant_id = ? LIMIT 1`
      )
      .get(userId, t.id);
    if (exists) {
      return res.json({ ok: true, joined: false, message: "already_member" });
    }

    const now = Date.now();
    db.prepare(
      `INSERT INTO memberships (user_id, tenant_id, role, created_at, updated_at)
       VALUES (?, ?, 'member', ?, ?)`
    ).run(userId, t.id, now, now);

    return res
      .status(201)
      .json({ ok: true, joined: true, tenant: { id: t.id, name: t.name } });
  } catch (e) {
    console.error("POST /tenants/join error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/* =========================================================
   NUEVO: Miembros del workspace
   GET /tenants/:id/members   (requiere ser miembro del tenant)
========================================================= */

r.get("/tenants/:id/members", (req, res) => {
  try {
    const tenantId = String(req.params.id || "").trim();
    if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });

    const t = db
      .prepare(`SELECT id, name, created_by, created_at FROM tenants WHERE id = ?`)
      .get(tenantId);
    if (!t) return res.status(404).json({ error: "tenant_not_found" });

    // Debe pertenecer al tenant para ver miembros
    const isMember = db
      .prepare(
        `SELECT role FROM memberships WHERE user_id = ? AND tenant_id = ? LIMIT 1`
      )
      .get(req.user.id, tenantId);
    if (!isMember) return res.status(403).json({ error: "forbidden_tenant" });

    // Lista de miembros con datos de perfil básicos
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
          u.name COLLATE NOCASE ASC
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
   NUEVO: Cambiar rol de un miembro
   PATCH /tenants/:id/members/:user_id
   Solo owner/admin pueden cambiar roles
   Solo owner puede asignar rol "owner"
========================================================= */
r.patch("/tenants/:id/members/:user_id", (req, res) => {
  try {
    const tenantId = String(req.params.id || "").trim();
    const targetUserId = String(req.params.user_id || "").trim();
    const { role } = req.body || {};

    if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });
    if (!targetUserId) return res.status(400).json({ error: "user_id_required" });
    if (!role) return res.status(400).json({ error: "role_required" });

    const VALID_ROLES = ["owner", "admin", "member"];
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: "invalid_role", valid_roles: VALID_ROLES });
    }

    // Verificar que el tenant existe
    const tenant = db
      .prepare(`SELECT id, name, created_by FROM tenants WHERE id = ?`)
      .get(tenantId);
    if (!tenant) return res.status(404).json({ error: "tenant_not_found" });

    // Verificar que el usuario que hace el cambio es jesusbloise@gmail.com
    const requesterId = req.user.id;
    const requester = db
      .prepare(`SELECT email FROM users WHERE id = ?`)
      .get(requesterId);
    
    if (!requester || requester.email !== "jesusbloise@gmail.com") {
      return res.status(403).json({ error: "forbidden_only_jesusbloise_can_change_roles" });
    }

    // Verificar que el usuario target existe en el workspace
    const targetMembership = db
      .prepare(`SELECT role FROM memberships WHERE user_id = ? AND tenant_id = ? LIMIT 1`)
      .get(targetUserId, tenantId);

    if (!targetMembership) {
      return res.status(404).json({ error: "user_not_member_of_workspace" });
    }

    // No permitir que jesusbloise se cambie su propio rol de owner
    if (requesterId === targetUserId && role !== "owner") {
      return res.status(403).json({ error: "cannot_change_own_role_from_owner" });
    }

    // Actualizar el rol
    const now = Date.now();
    db.prepare(
      `UPDATE memberships
       SET role = ?, updated_at = ?
       WHERE user_id = ? AND tenant_id = ?`
    ).run(role, now, targetUserId, tenantId);

    // Obtener datos actualizados del usuario
    const updatedMember = db
      .prepare(
        `SELECT 
          u.id,
          u.name,
          u.email,
          u.avatar_url,
          m.role,
          m.updated_at
        FROM memberships m
        JOIN users u ON u.id = m.user_id
        WHERE m.user_id = ? AND m.tenant_id = ?`
      )
      .get(targetUserId, tenantId);

    return res.json({
      ok: true,
      message: "role_updated",
      member: updatedMember,
    });
  } catch (e) {
    console.error("PATCH /tenants/:id/members/:user_id error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

module.exports = r;

