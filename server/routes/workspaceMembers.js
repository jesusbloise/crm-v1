// server/routes/workspaceMembers.js
const express = require("express");
const router = express.Router();
const db = require("../db/connection");

router.get("/workspace/members", async (req, res, next) => {
  try {
    // 1) Tenant desde el middleware (si existe)
    const tenantFromMW =
      req.tenant && (req.tenant.id || req.tenant.tenant || null);

    // 2) Fallback: tenant desde los headers (igual que usa el front)
    const headerTenantRaw =
      req.headers["x-tenant-id"] ||
      req.headers["tenant"] ||
      req.headers["Tenant"] ||
      null;

    const headerTenant =
      typeof headerTenantRaw === "string" ? headerTenantRaw.trim() : null;

    const tenantId = tenantFromMW || headerTenant;

    if (!tenantId) {
      console.warn("[workspace/members] tenant no resuelto", {
        user: req.user || null,
        tenantFromMW,
        headerTenant,
      });

      return res.status(401).json({
        error: "tenant_not_set",
        message:
          "No se pudo determinar el tenant para este usuario en /workspace/members.",
      });
    }

    // ⚠️ IMPORTANTE: en Postgres usamos $1, no "?"
    const rows = await db.query(
      `
      SELECT u.id, u.name, u.email
      FROM users u
      JOIN memberships m ON m.user_id = u.id
      WHERE m.tenant_id = $1
      ORDER BY u.name ASC, u.email ASC
      `,
      [tenantId]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
