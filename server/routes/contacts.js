const { Router } = require("express");
const db = require("../db/connection");
const wrap = require("../lib/wrap");

const router = Router();

router.get("/contacts", wrap(async (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM contacts WHERE tenant_id = ? ORDER BY updated_at DESC"
  ).all(req.tenantId);
  res.json(rows);
}));

router.get("/contacts/:id", wrap(async (req, res) => {
  const row = db.prepare(
    "SELECT * FROM contacts WHERE id = ? AND tenant_id = ?"
  ).get(req.params.id, req.tenantId);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
}));

router.post("/contacts", wrap(async (req, res) => {
  const { id, name, email, phone, company, position, account_id } = req.body || {};
  if (!id || !name) return res.status(400).json({ error: "id and name required" });
  const now = Date.now();
  db.prepare(`
    INSERT INTO contacts (id, name, email, phone, company, position, account_id, tenant_id, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(id, name, email ?? null, phone ?? null, company ?? null, position ?? null, account_id ?? null, req.tenantId, now, now);
  res.status(201).json({ ok: true });
}));

router.patch("/contacts/:id", wrap(async (req, res) => {
  const found = db.prepare(
    "SELECT * FROM contacts WHERE id = ? AND tenant_id = ?"
  ).get(req.params.id, req.tenantId);
  if (!found) return res.status(404).json({ error: "not found" });

  const next = { ...found, ...req.body, updated_at: Date.now() };
  db.prepare(`
    UPDATE contacts SET name=?, email=?, phone=?, company=?, position=?, account_id=?, updated_at=?
    WHERE id=? AND tenant_id=?
  `).run(next.name, next.email ?? null, next.phone ?? null, next.company ?? null, next.position ?? null,
         next.account_id ?? null, next.updated_at, req.params.id, req.tenantId);

  res.json({ ok: true });
}));

router.delete("/contacts/:id", wrap(async (req, res) => {
  db.prepare("DELETE FROM contacts WHERE id = ? AND tenant_id = ?")
    .run(req.params.id, req.tenantId);
  res.json({ ok: true });
}));

module.exports = router;


// const { Router } = require("express");
// const db = require("../db/connection");
// const wrap = require("../lib/wrap");
// const { enc, dec } = require("../lib/cursor");

// const router = Router();

// router.get("/contacts", wrap(async (_req, res) => {
//   const rows = db.prepare("SELECT * FROM contacts ORDER BY updated_at DESC").all();
//   res.json(rows);
// }));

// router.get("/contacts/:id", wrap(async (req, res) => {
//   const row = db.prepare("SELECT * FROM contacts WHERE id = ?").get(req.params.id);
//   if (!row) return res.status(404).json({ error: "not found" });
//   res.json(row);
// }));

// // INSERT incluye account_id
// router.post("/contacts", wrap(async (req, res) => {
//   const { id, name, email, phone, company, position, account_id } = req.body || {};
//   if (!id || !name) return res.status(400).json({ error: "id and name required" });
//   const now = Date.now();
//   db.prepare(`
//     INSERT INTO contacts (id,name,email,phone,company,position,account_id,created_at,updated_at)
//     VALUES (?,?,?,?,?,?,?,?,?)
//   `).run(
//     id, name, email ?? null, phone ?? null, company ?? null, position ?? null,
//     account_id ?? null, now, now
//   );
//   res.status(201).json({ ok: true });
// }));

// // UPDATE incluye account_id
// router.patch("/contacts/:id", wrap(async (req, res) => {
//   const found = db.prepare("SELECT * FROM contacts WHERE id = ?").get(req.params.id);
//   if (!found) return res.status(404).json({ error: "not found" });
//   const next = { ...found, ...req.body, updated_at: Date.now() };
//   db.prepare(`
//     UPDATE contacts
//     SET name=?, email=?, phone=?, company=?, position=?, account_id=?, updated_at=?
//     WHERE id=?
//   `).run(
//     next.name, next.email ?? null, next.phone ?? null, next.company ?? null,
//     next.position ?? null, next.account_id ?? null, next.updated_at, req.params.id
//   );
//   res.json({ ok: true });
// }));

// router.delete("/contacts/:id", wrap(async (req, res) => {
//   db.prepare("DELETE FROM contacts WHERE id = ?").run(req.params.id);
//   res.json({ ok: true });
// }));

// // ------- Contacts SEARCH/PAGED -------
// router.get("/contacts.search", wrap(async (req, res) => {
//   const q = String(req.query.q ?? "").trim();
//   const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10) || 20, 100);

//   const cursorRaw = req.query.cursor ? dec(req.query.cursor) : null;
//   const params = [];
//   const where = [];

//   if (q) {
//     where.push(`(name LIKE ? OR IFNULL(email,'') LIKE ? OR IFNULL(phone,'') LIKE ? OR IFNULL(company,'') LIKE ?)`);
//     const like = `%${q}%`;
//     params.push(like, like, like, like);
//   }

//   let cursorClause = "";
//   if (cursorRaw && Number.isFinite(cursorRaw.updated_at) && cursorRaw.id) {
//     cursorClause = `${where.length ? "AND " : "WHERE "}(updated_at < ? OR (updated_at = ? AND id < ?))`;
//     params.push(cursorRaw.updated_at, cursorRaw.updated_at, cursorRaw.id);
//   }

//   const sql = `
//     SELECT id, name, email, phone, company, account_id, created_at, updated_at
//     FROM contacts
//     ${where.length ? "WHERE " + where.join(" AND ") : ""}
//     ${cursorClause}
//     ORDER BY updated_at DESC, id DESC
//     LIMIT ?
//   `;
//   const rows = db.prepare(sql).all(...params, limit);

//   let nextCursor = null;
//   if (rows.length === limit) {
//     const last = rows[rows.length - 1];
//     nextCursor = enc({ updated_at: last.updated_at, id: last.id });
//   }

//   res.json({ items: rows, nextCursor });
// }));

// module.exports = router;
