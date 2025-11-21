const express = require("express");
const router = express.Router();
const db = require("../db/connection");

router.get("/workspace/members", async (req, res, next) => {
  try {
    const tenantId =
      (req.tenant && (req.tenant.id || req.tenant.tenant)) ||
      req.tenantId ||
      null;

    if (!tenantId) {
      return res.status(400).json({ error: "missing_tenant" });
    }

    const { rows } = await db.query(
      `
      SELECT 
        u.id,
        COALESCE(u.name, split_part(u.email, '@', 1)) AS name,
        u.email
      FROM memberships m
      JOIN users u
        ON u.id = m.user_id
      WHERE m.tenant_id = $1
      ORDER BY name ASC, email ASC
    `,
      [tenantId]
    );

    return res.json(rows || []);
  } catch (err) {
    console.error("[workspace/members] error:", err);
    next(err);
  }
});

module.exports = router;
