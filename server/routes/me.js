// server/routes/me.js
const { Router } = require("express");
const db = require("../db/connection");
const requireAuth = require("../lib/requireAuth");

const r = Router();

r.use(requireAuth);

// Lista tenants del usuario
r.get("/me/tenants", (req, res) => {
  const rows = db.prepare(`
    SELECT t.id, t.name
    FROM memberships m
    JOIN tenants t ON t.id = m.tenant_id
    WHERE m.user_id = ?
    ORDER BY t.name
  `).all(req.auth.sub);
  res.json(rows);
});

// Cambia el tenant activo → devuelve NUEVO JWT
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

r.post("/me/tenant/switch", (req, res) => {
  const { tenant_id } = req.body || {};
  if (!tenant_id) return res.status(400).json({ error: "tenant_id_required" });

  const membership = db.prepare(`
    SELECT 1 FROM memberships WHERE user_id = ? AND tenant_id = ?
  `).get(req.auth.sub, tenant_id);
  if (!membership) return res.status(403).json({ error: "not_member" });

  const newToken = jwt.sign(
    {
      sub: req.auth.sub,
      email: req.auth.email,
      roles: req.auth.roles || {},
      active_tenant: tenant_id,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
  res.json({ token: newToken, active_tenant: tenant_id });
});

module.exports = r;
