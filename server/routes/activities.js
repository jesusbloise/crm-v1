const { Router } = require("express");
const db = require("../db/connection");
const wrap = require("../lib/wrap");

const router = Router();

// GET con filtros opcionales (?deal_id=...&contact_id=...&account_id=...&lead_id=...)
router.get("/activities", wrap(async (req, res) => {
  const { deal_id, contact_id, account_id, lead_id } = req.query || {};
  const clauses = ["tenant_id = ?"];
  const params = [req.tenantId];
  if (deal_id)    { clauses.push("deal_id = ?");    params.push(String(deal_id)); }
  if (contact_id) { clauses.push("contact_id = ?"); params.push(String(contact_id)); }
  if (account_id) { clauses.push("account_id = ?"); params.push(String(account_id)); }
  if (lead_id)    { clauses.push("lead_id = ?");    params.push(String(lead_id)); }

  const sql = `SELECT * FROM activities WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC`;
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
}));

router.post("/activities", wrap(async (req, res) => {
  const { id, type, title, due_date, status, notes, account_id, contact_id, lead_id, deal_id } = req.body || {};
  if (!id || !type || !title) return res.status(400).json({ error: "id, type, title required" });
  const now = Date.now();
  db.prepare(`
    INSERT INTO activities (
      id, type, title, due_date, status, notes, account_id, contact_id, lead_id, deal_id, tenant_id, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, type, title, due_date ?? null, status ?? "open", notes ?? null,
         account_id ?? null, contact_id ?? null, lead_id ?? null, deal_id ?? null,
         req.tenantId, now, now);
  res.status(201).json({ ok: true });
}));

router.patch("/activities/:id", wrap(async (req, res) => {
  const found = db.prepare(
    "SELECT * FROM activities WHERE id = ? AND tenant_id = ?"
  ).get(req.params.id, req.tenantId);
  if (!found) return res.status(404).json({ error: "not found" });

  const next = { ...found, ...req.body, updated_at: Date.now() };
  db.prepare(`
    UPDATE activities SET type=?, title=?, due_date=?, status=?, notes=?,
      account_id=?, contact_id=?, lead_id=?, deal_id=?, updated_at=?
    WHERE id=? AND tenant_id=?
  `).run(next.type, next.title, next.due_date ?? null, next.status ?? "open", next.notes ?? null,
         next.account_id ?? null, next.contact_id ?? null, next.lead_id ?? null, next.deal_id ?? null,
         next.updated_at, req.params.id, req.tenantId);

  res.json({ ok: true });
}));

router.delete("/activities/:id", wrap(async (req, res) => {
  db.prepare("DELETE FROM activities WHERE id = ? AND tenant_id = ?")
    .run(req.params.id, req.tenantId);
  res.json({ ok: true });
}));

module.exports = router;


// const { Router } = require("express");
// const db = require("../db/connection");
// const wrap = require("../lib/wrap");

// const router = Router();

// router.get("/activities", wrap(async (req, res) => {
//   const { deal_id, contact_id, account_id, lead_id, status } = req.query;
//   const where = [];
//   const params = [];
//   if (deal_id)    { where.push("deal_id = ?"); params.push(deal_id); }
//   if (contact_id) { where.push("contact_id = ?"); params.push(contact_id); }
//   if (account_id) { where.push("account_id = ?"); params.push(account_id); }
//   if (lead_id)    { where.push("lead_id = ?"); params.push(lead_id); }
//   if (status)     { where.push("status = ?"); params.push(status); }

//   const sql = `
//     SELECT * FROM activities
//     ${where.length ? "WHERE " + where.join(" AND ") : ""}
//     ORDER BY (CASE status WHEN 'open' THEN 0 ELSE 1 END),
//              due_date IS NULL, due_date ASC, updated_at DESC
//   `;
//   const rows = db.prepare(sql).all(...params);
//   res.json(rows);
// }));

// router.post("/activities", wrap(async (req, res) => {
//   const { id, type, title, due_date, notes, status, account_id, contact_id, lead_id, deal_id } = req.body || {};
//   if (!id || !type || !title) return res.status(400).json({ error: "id, type y title requeridos" });
//   const now = Date.now();
//   db.prepare(`
//     INSERT INTO activities (id,type,title,due_date,status,notes,account_id,contact_id,lead_id,deal_id,created_at,updated_at)
//     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
//   `).run(id, type, title, due_date ?? null, status ?? "open", notes ?? null, account_id ?? null, contact_id ?? null, lead_id ?? null, deal_id ?? null, now, now);
//   res.status(201).json({ ok: true });
// }));

// router.patch("/activities/:id", wrap(async (req, res) => {
//   const found = db.prepare("SELECT * FROM activities WHERE id = ?").get(req.params.id);
//   if (!found) return res.status(404).json({ error: "not found" });
//   const next = { ...found, ...req.body, updated_at: Date.now() };
//   db.prepare(`
//     UPDATE activities
//     SET type=?, title=?, due_date=?, status=?, notes=?, account_id=?, contact_id=?, lead_id=?, deal_id=?, updated_at=?
//     WHERE id=?
//   `).run(
//     next.type, next.title, next.due_date ?? null, next.status, next.notes ?? null,
//     next.account_id ?? null, next.contact_id ?? null, next.lead_id ?? null, next.deal_id ?? null,
//     next.updated_at, req.params.id
//   );
//   res.json({ ok: true });
// }));

// router.delete("/activities/:id", wrap(async (req, res) => {
//   db.prepare("DELETE FROM activities WHERE id = ?").run(req.params.id);
//   res.json({ ok: true });
// }));

// module.exports = router;
