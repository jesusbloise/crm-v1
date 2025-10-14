const { Router } = require("express");
const db = require("../db/connection");
const wrap = require("../lib/wrap");

const router = Router();

router.get("/notes", wrap(async (req, res) => {
  const { deal_id, contact_id, account_id, lead_id } = req.query;
  const where = [];
  const params = [];
  if (deal_id)    { where.push("deal_id = ?"); params.push(deal_id); }
  if (contact_id) { where.push("contact_id = ?"); params.push(contact_id); }
  if (account_id) { where.push("account_id = ?"); params.push(account_id); }
  if (lead_id)    { where.push("lead_id = ?"); params.push(lead_id); }
  const sql = `
    SELECT * FROM notes
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY updated_at DESC
  `;
  res.json(db.prepare(sql).all(...params));
}));

router.post("/notes", wrap(async (req, res) => {
  const { id, body, account_id, contact_id, lead_id, deal_id } = req.body || {};
  if (!id || !body) return res.status(400).json({ error: "id y body requeridos" });
  const now = Date.now();
  db.prepare(`
    INSERT INTO notes (id,body,account_id,contact_id,lead_id,deal_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(id, body, account_id ?? null, contact_id ?? null, lead_id ?? null, deal_id ?? null, now, now);
  res.status(201).json({ ok: true });
}));

router.delete("/notes/:id", wrap(async (req, res) => {
  db.prepare("DELETE FROM notes WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
