const { Router } = require("express");
const db = require("../db/connection");
const wrap = require("../lib/wrap");

const router = Router();

router.get("/leads", wrap(async (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM leads WHERE tenant_id = ? ORDER BY updated_at DESC"
  ).all(req.tenantId);
  res.json(rows);
}));

router.get("/leads/:id", wrap(async (req, res) => {
  const row = db.prepare(
    "SELECT * FROM leads WHERE id = ? AND tenant_id = ?"
  ).get(req.params.id, req.tenantId);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
}));

router.post("/leads", wrap(async (req, res) => {
  const { id, name, email, phone, company, status } = req.body || {};
  if (!id || !name) return res.status(400).json({ error: "id and name required" });
  const now = Date.now();
  db.prepare(`
    INSERT INTO leads (id, name, email, phone, company, status, tenant_id, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(id, name, email ?? null, phone ?? null, company ?? null, status ?? null, req.tenantId, now, now);
  res.status(201).json({ ok: true });
}));

router.patch("/leads/:id", wrap(async (req, res) => {
  const found = db.prepare(
    "SELECT * FROM leads WHERE id = ? AND tenant_id = ?"
  ).get(req.params.id, req.tenantId);
  if (!found) return res.status(404).json({ error: "not found" });

  const next = { ...found, ...req.body, updated_at: Date.now() };
  db.prepare(`
    UPDATE leads SET name=?, email=?, phone=?, company=?, status=?, updated_at=? WHERE id=? AND tenant_id=?
  `).run(next.name, next.email ?? null, next.phone ?? null, next.company ?? null, next.status ?? null,
         next.updated_at, req.params.id, req.tenantId);

  res.json({ ok: true });
}));

router.delete("/leads/:id", wrap(async (req, res) => {
  db.prepare("DELETE FROM leads WHERE id = ? AND tenant_id = ?")
    .run(req.params.id, req.tenantId);
  res.json({ ok: true });
}));

module.exports = router;


// const { Router } = require("express");
// const db = require("../db/connection");
// const wrap = require("../lib/wrap");

// const router = Router();

// router.get("/leads", wrap(async (_req, res) => {
//   const rows = db.prepare("SELECT * FROM leads ORDER BY updated_at DESC").all();
//   res.json(rows);
// }));

// router.get("/leads/:id", wrap(async (req, res) => {
//   const row = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
//   if (!row) return res.status(404).json({ error: "not found" });
//   res.json(row);
// }));

// router.post("/leads", wrap(async (req, res) => {
//   const { id, name, email, phone, company, status } = req.body || {};
//   if (!id || !name) return res.status(400).json({ error: "id and name required" });
//   const now = Date.now();
//   db.prepare(`
//     INSERT INTO leads (id,name,email,phone,company,status,created_at,updated_at)
//     VALUES (?,?,?,?,?,?,?,?)
//   `).run(id, name, email ?? null, phone ?? null, company ?? null, status ?? "nuevo", now, now);
//   res.status(201).json({ ok: true });
// }));

// router.patch("/leads/:id", wrap(async (req, res) => {
//   const found = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
//   if (!found) return res.status(404).json({ error: "not found" });
//   const next = { ...found, ...req.body, updated_at: Date.now() };
//   db.prepare(`
//     UPDATE leads SET name=?, email=?, phone=?, company=?, status=?, updated_at=? WHERE id=?
//   `).run(
//     next.name, next.email ?? null, next.phone ?? null, next.company ?? null,
//     next.status ?? "nuevo", next.updated_at, req.params.id
//   );
//   res.json({ ok: true });
// }));

// router.delete("/leads/:id", wrap(async (req, res) => {
//   db.prepare("DELETE FROM leads WHERE id = ?").run(req.params.id);
//   res.json({ ok: true });
// }));

// module.exports = router;
