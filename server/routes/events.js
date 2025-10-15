// server/routes/events.js
const { Router } = require("express");
const db = require("../db/connection");
const wrap = require("../lib/wrap");

const router = Router();

// GET /events?limit=50&since=<ts>&entity=deal
router.get("/events", wrap(async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
  const since = parseInt(String(req.query.since ?? "0"), 10) || 0;
  const entity = req.query.entity ? String(req.query.entity) : null;

  // 🔒 Siempre limitar por tenant
  const where = ["tenant_id = ?"];
  const params = [req.tenantId];

  if (since > 0) { where.push("created_at >= ?"); params.push(since); }
  if (entity)    { where.push("entity = ?");      params.push(entity); }

  const sql = `
    SELECT id, type, entity, entity_id, description, actor, meta, created_at
    FROM events
    WHERE ${where.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT ?
  `;

  const rows = db.prepare(sql).all(...params, limit).map(r => ({
    ...r,
    meta: r.meta ? JSON.parse(r.meta) : null,
  }));

  res.json(rows);
}));

module.exports = router;
// const { Router } = require("express");
// const db = require("../db/connection");
// const wrap = require("../lib/wrap");

// const router = Router();

// // GET /events?limit=50&since=<ts>&entity=deal
// router.get("/events", wrap(async (req, res) => {
//   const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
//   const since = parseInt(String(req.query.since ?? "0"), 10) || 0;
//   const entity = req.query.entity ? String(req.query.entity) : null;

//   const where = [];
//   const params = [];
//   if (since > 0) { where.push("created_at >= ?"); params.push(since); }
//   if (entity)    { where.push("entity = ?"); params.push(entity); }

//   const sql = `
//     SELECT id, type, entity, entity_id, description, actor, meta, created_at
//     FROM events
//     ${where.length ? "WHERE " + where.join(" AND ") : ""}
//     ORDER BY created_at DESC
//     LIMIT ?
//   `;
//   const rows = db.prepare(sql).all(...params, limit).map(r => ({
//     ...r,
//     meta: r.meta ? JSON.parse(r.meta) : null,
//   }));
//   res.json(rows);
// }));

// module.exports = router;
