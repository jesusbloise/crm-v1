// server/routes/workspaceMembers.js
const express = require("express");
const db = require("../db/connection");
const { resolveUserId } = require("../lib/authorize");

const router = express.Router();

router.get("/workspace/members", async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const userId = resolveUserId(req);

    if (!userId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    if (!tenantId) {
      return res.status(400).json({ error: "missing_tenant" });
    }

    const requester = await db.prepare(`
      SELECT
        u.role,
        (
          EXISTS (
            SELECT 1
            FROM tenant_memberships tm
            WHERE tm.tenant_id = ?
              AND tm.user_id = u.id
          )
          OR EXISTS (
            SELECT 1
            FROM memberships m
            WHERE m.tenant_id = ?
              AND m.user_id = u.id
          )
          OR EXISTS (
            SELECT 1
            FROM tenants t
            WHERE t.id = ?
              AND t.created_by = u.id
          )
        ) AS belongs_to_workspace
      FROM users u
      WHERE u.id = ?
        AND COALESCE(u.active, TRUE) = TRUE
      LIMIT 1
    `).get(tenantId, tenantId, tenantId, userId);

    if (!requester) {
      return res.status(403).json({ error: "forbidden" });
    }

    const role = String(requester.role || "member").toLowerCase();
    const isAdmin = role === "admin" || role === "owner";

    if (!isAdmin && !requester.belongs_to_workspace) {
      return res.status(403).json({ error: "not_member_of_workspace" });
    }

    // db.query() devuelve directamente un array, no { rows }.
    const members = await db.query(`
      SELECT
        u.id,
        COALESCE(
          NULLIF(BTRIM(u.name), ''),
          split_part(u.email, '@', 1)
        ) AS name,
        u.email
      FROM users u
      JOIN (
        SELECT user_id
        FROM tenant_memberships
        WHERE tenant_id = $1

        UNION

        SELECT user_id
        FROM memberships
        WHERE tenant_id = $1

        UNION

        SELECT created_by AS user_id
        FROM tenants
        WHERE id = $1
      ) members ON members.user_id = u.id
      WHERE COALESCE(u.active, TRUE) = TRUE
      ORDER BY LOWER(
        COALESCE(NULLIF(BTRIM(u.name), ''), u.email)
      ), u.id
    `, [tenantId]);

    res.setHeader("Cache-Control", "no-store");
    return res.json(members);
  } catch (err) {
    console.error("[workspace/members] error:", err);
    return next(err);
  }
});

module.exports = router;