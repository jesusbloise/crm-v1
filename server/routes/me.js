// server/routes/me.js
const { Router } = require("express");
const db = require("../db/connection");
const requireAuth = require("../lib/requireAuth");
const jwt = require("jsonwebtoken");

const r = Router();
r.use(requireAuth);

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// Resuelve el ID de usuario compatible con tus middlewares (req.user o req.auth)
function resolveUserId(req) {
  return req.user?.id || req.auth?.sub;
}

/**
 * GET /me/tenants
 * Lista los tenants del usuario + rol e indicador de activo según req.tenantId.
 */
r.get("/me/tenants", (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthorized" });

  const rows = db
    .prepare(
      `
      SELECT t.id, t.name, m.role
      FROM memberships m
      JOIN tenants t ON t.id = m.tenant_id
      WHERE m.user_id = ?
      ORDER BY t.name COLLATE NOCASE ASC
    `
    )
    .all(userId);

  const activeId = req.tenantId || null;
  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    is_active: activeId === r.id,
  }));

  res.json({ items, active_tenant: activeId });
});

/**
 * POST /me/tenant/switch
 * Cambia el tenant "activo" y devuelve NUEVO JWT.
 * Body: { tenant_id }
 *
 * Nota importante: aunque devolvemos token con active_tenant,
 * el cliente igual debe enviar X-Tenant-Id en cada request.
 */
r.post("/me/tenant/switch", (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthorized" });

  const { tenant_id } = req.body || {};
  if (!tenant_id) return res.status(400).json({ error: "tenant_id_required" });

  const membership = db
    .prepare(
      `SELECT m.role, t.name
       FROM memberships m
       JOIN tenants t ON t.id = m.tenant_id
       WHERE m.user_id = ? AND m.tenant_id = ?
       LIMIT 1`
    )
    .get(userId, tenant_id);

  if (!membership) return res.status(403).json({ error: "not_member" });

  // Conserva payload original si viene de requireAuth
  const basePayload = {
    sub: req.auth?.sub || req.user?.id || userId,
    email: req.auth?.email || req.user?.email || undefined,
    roles: req.auth?.roles || req.user?.roles || {},
    active_tenant: tenant_id,
  };

  const token = jwt.sign(basePayload, JWT_SECRET, { expiresIn: "7d" });

  res.json({
    token,
    active_tenant: tenant_id,
    tenant: { id: tenant_id, name: membership.name, role: membership.role },
  });
});

module.exports = r;



// // server/routes/me.js
// const { Router } = require("express");
// const db = require("../db/connection");
// const requireAuth = require("../lib/requireAuth");

// const r = Router();

// r.use(requireAuth);

// // Lista tenants del usuario
// r.get("/me/tenants", (req, res) => {
//   const rows = db.prepare(`
//     SELECT t.id, t.name
//     FROM memberships m
//     JOIN tenants t ON t.id = m.tenant_id
//     WHERE m.user_id = ?
//     ORDER BY t.name
//   `).all(req.auth.sub);
//   res.json(rows);
// });

// // Cambia el tenant activo → devuelve NUEVO JWT
// const jwt = require("jsonwebtoken");
// const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// r.post("/me/tenant/switch", (req, res) => {
//   const { tenant_id } = req.body || {};
//   if (!tenant_id) return res.status(400).json({ error: "tenant_id_required" });

//   const membership = db.prepare(`
//     SELECT 1 FROM memberships WHERE user_id = ? AND tenant_id = ?
//   `).get(req.auth.sub, tenant_id);
//   if (!membership) return res.status(403).json({ error: "not_member" });

//   const newToken = jwt.sign(
//     {
//       sub: req.auth.sub,
//       email: req.auth.email,
//       roles: req.auth.roles || {},
//       active_tenant: tenant_id,
//     },
//     JWT_SECRET,
//     { expiresIn: "7d" }
//   );
//   res.json({ token: newToken, active_tenant: tenant_id });
// });

// module.exports = r;
