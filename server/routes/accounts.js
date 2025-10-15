const { Router } = require("express");
const db = require("../db/connection");
const wrap = require("../lib/wrap");

const router = Router();

router.get("/accounts", wrap(async (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM accounts WHERE tenant_id = ? ORDER BY updated_at DESC"
  ).all(req.tenantId);
  res.json(rows);
}));

router.get("/accounts/:id", wrap(async (req, res) => {
  const row = db.prepare(
    "SELECT * FROM accounts WHERE id = ? AND tenant_id = ?"
  ).get(req.params.id, req.tenantId);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
}));

router.post("/accounts", wrap(async (req, res) => {
  const { id, name, website, phone } = req.body || {};
  if (!id || !name) return res.status(400).json({ error: "id and name required" });
  const now = Date.now();
  db.prepare(`
    INSERT INTO accounts (id, name, website, phone, tenant_id, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?)
  `).run(id, name, website ?? null, phone ?? null, req.tenantId, now, now);
  res.status(201).json({ ok: true });
}));

router.patch("/accounts/:id", wrap(async (req, res) => {
  const found = db.prepare(
    "SELECT * FROM accounts WHERE id = ? AND tenant_id = ?"
  ).get(req.params.id, req.tenantId);
  if (!found) return res.status(404).json({ error: "not found" });

  const next = { ...found, ...req.body, updated_at: Date.now() };
  db.prepare(`
    UPDATE accounts SET name=?, website=?, phone=?, updated_at=? WHERE id=? AND tenant_id=?
  `).run(next.name, next.website ?? null, next.phone ?? null, next.updated_at, req.params.id, req.tenantId);

  res.json({ ok: true });
}));

router.delete("/accounts/:id", wrap(async (req, res) => {
  db.prepare("DELETE FROM accounts WHERE id = ? AND tenant_id = ?")
    .run(req.params.id, req.tenantId);
  res.json({ ok: true });
}));

module.exports = router;


// const { Router } = require("express");
// const db = require("../db/connection");
// const wrap = require("../lib/wrap");

// const router = Router();

// router.get("/accounts", wrap(async (_req, res) => {
//   const rows = db.prepare("SELECT * FROM accounts ORDER BY updated_at DESC").all();
//   res.json(rows);
// }));

// router.get("/accounts/:id", wrap(async (req, res) => {
//   const row = db.prepare("SELECT * FROM accounts WHERE id = ?").get(req.params.id);
//   if (!row) return res.status(404).json({ error: "not found" });
//   res.json(row);
// }));

// router.post("/accounts", wrap(async (req, res) => {
//   const { id, name, website, phone } = req.body || {};
//   if (!id || !name) return res.status(400).json({ error: "id and name required" });
//   const now = Date.now();
//   db.prepare(`
//     INSERT INTO accounts (id,name,website,phone,created_at,updated_at)
//     VALUES (?,?,?,?,?,?)
//   `).run(id, name, website ?? null, phone ?? null, now, now);
//   res.status(201).json({ ok: true });
// }));

// router.patch("/accounts/:id", wrap(async (req, res) => {
//   const found = db.prepare("SELECT * FROM accounts WHERE id = ?").get(req.params.id);
//   if (!found) return res.status(404).json({ error: "not found" });
//   const next = { ...found, ...req.body, updated_at: Date.now() };
//   db.prepare(`
//     UPDATE accounts SET name=?, website=?, phone=?, updated_at=? WHERE id=?
//   `).run(next.name, next.website ?? null, next.phone ?? null, next.updated_at, req.params.id);
//   res.json({ ok: true });
// }));

// router.delete("/accounts/:id", wrap(async (req, res) => {
//   const cnt = db.prepare("SELECT COUNT(*) AS n FROM contacts WHERE account_id = ?").get(req.params.id).n;
//   if (cnt > 0) return res.status(409).json({ error: "account_has_contacts" });
//   db.prepare("DELETE FROM accounts WHERE id = ?").run(req.params.id);
//   res.json({ ok: true });
// }));

// module.exports = router;
