// server/routes/notes.js
const { Router } = require("express");
const crypto = require("crypto");
const db = require("../db/connection");
const wrap = require("../lib/wrap");
const {
  resolveUserId,
  canDelete,
} = require("../lib/authorize");
const {
  linkedContactVisibilityFilter,
  canAccessContactLinks,
} = require("../lib/contactAccess");

const router = Router();

const coerceStr = (value) =>
  typeof value === "string" ? value.trim() || null : null;

/** GET /notes */
router.get(
  "/notes",
  wrap(async (req, res) => {
    if (!resolveUserId(req) || !req.tenantId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(requestedLimit, 200))
      : 100;

    const filter = linkedContactVisibilityFilter(req, "n");
    const clauses = [filter.sql];
    const params = [...filter.params];

    for (const field of [
      "deal_id",
      "contact_id",
      "account_id",
      "lead_id",
    ]) {
      const value = coerceStr(req.query[field]);

      if (value) {
        clauses.push(`n.${field} = ?`);
        params.push(value);
      }
    }

    const rows = await db.prepare(`
      SELECT
        n.*,
        u.name AS created_by_name,
        u.email AS created_by_email
      FROM notes n
      LEFT JOIN users u ON u.id = n.created_by
      WHERE ${clauses.join(" AND ")}
      ORDER BY n.updated_at DESC, n.id ASC
      LIMIT ?
    `).all(...params, limit);

    res.setHeader("Cache-Control", "no-store");
    return res.json(rows);
  })
);

/** POST /notes */
router.post(
  "/notes",
  wrap(async (req, res) => {
    const userId = resolveUserId(req);

    if (!userId || !req.tenantId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const input = req.body || {};
    const body = coerceStr(input.body);
    const accountId = coerceStr(input.account_id);
    const contactId = coerceStr(input.contact_id);
    const leadId = coerceStr(input.lead_id);
    const dealId = coerceStr(input.deal_id);

    if (!body) {
      return res.status(400).json({ error: "body_required" });
    }

    // Misma respuesta para vínculos inexistentes y sin acceso.
    if (!(await canAccessContactLinks(req, contactId, dealId))) {
      return res.status(400).json({ error: "invalid_contact_links" });
    }

    // Las tablas provienen de esta lista fija del backend.
    for (const [table, value, field] of [
      ["accounts", accountId, "account_id"],
      ["leads", leadId, "lead_id"],
    ]) {
      if (!value) continue;

      const exists = await db.prepare(`
        SELECT 1
        FROM ${table}
        WHERE id = ? AND tenant_id = ?
        LIMIT 1
      `).get(value, req.tenantId);

      if (!exists) {
        return res.status(400).json({ error: `invalid_${field}` });
      }
    }

    const id = crypto.randomUUID();
    const now = Date.now();

    await db.prepare(`
      INSERT INTO notes (
        id, body, account_id, contact_id, lead_id, deal_id,
        tenant_id, created_by, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body,
      accountId,
      contactId,
      leadId,
      dealId,
      req.tenantId,
      userId,
      now,
      now
    );

    // Revalida al responder por si el acceso cambió durante la creación.
    const filter = linkedContactVisibilityFilter(req, "n");

    const created = await db.prepare(`
      SELECT
        n.*,
        u.name AS created_by_name,
        u.email AS created_by_email
      FROM notes n
      LEFT JOIN users u ON u.id = n.created_by
      WHERE n.id = ?
        AND ${filter.sql}
    `).get(id, ...filter.params);

    if (!created) {
      return res.status(404).json({ error: "not_found" });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(201).json(created);
  })
);

/** DELETE /notes/:id */
router.delete(
  "/notes/:id",
  canDelete("notes"),
  wrap(async (req, res) => {
    const filter = linkedContactVisibilityFilter(req, "n");

    // El borrado comprueba visibilidad en la propia sentencia.
    const info = await db.prepare(`
      DELETE FROM notes AS n
      WHERE n.id = ?
        AND ${filter.sql}
    `).run(req.params.id, ...filter.params);

    if (info.changes === 0) {
      return res.status(404).json({ error: "not_found" });
    }

    return res.json({ ok: true });
  })
);

module.exports = router;