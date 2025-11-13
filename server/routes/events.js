// server/routes/events.js
const { Router } = require("express");
const db = require("../db/connection");
const wrap = require("../lib/wrap");

const router = Router();

/**
 * GET /events
 * Filtros opcionales:
 *   ?limit=50
 *   ?since=<timestamp>   -> created_at >= since
 *   ?entity=deal|lead|account|contact|activity|note|tenant|auth|...
 *   ?entity_id=<id>
 *   ?type=<string>
 *   ?actor=<user_id|email>
 *
 * Siempre filtra por tenant_id (scoped al workspace actual).
 */
router.get(
  "/events",
  wrap(async (req, res) => {
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);

    const sinceRaw = String(req.query.since ?? "0");
    const since = Number.isFinite(Number(sinceRaw)) ? parseInt(sinceRaw, 10) : 0;

    const entity = req.query.entity ? String(req.query.entity).trim() : null;
    const entity_id = req.query.entity_id ? String(req.query.entity_id).trim() : null;
    const type = req.query.type ? String(req.query.type).trim() : null;
    const actor = req.query.actor ? String(req.query.actor).trim() : null;

    const where = ["tenant_id = ?"];
    const params = [req.tenantId];

    if (since > 0) { where.push("created_at >= ?"); params.push(since); }
    if (entity)    { where.push("entity = ?");      params.push(entity); }
    if (entity_id) { where.push("entity_id = ?");   params.push(entity_id); }
    if (type)      { where.push("type = ?");        params.push(type); }
    if (actor)     { where.push("actor = ?");       params.push(actor); }

    const sql = `
      SELECT id, type, entity, entity_id, description, actor, meta, created_at
      FROM events
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC, id ASC
      LIMIT ?
    `;

    const rows = await db.prepare(sql).all(...params, limit);
    const parsedRows = rows.map((r) => {
      let meta = null;
      if (r.meta) {
        try { meta = JSON.parse(r.meta); } catch { meta = null; }
      }
      return { ...r, meta };
    });

    res.json(parsedRows);
  })
);

module.exports = router;
