const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");

const db = new Database("./crm.db"); // archivo junto a /server
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// --- Esquema ---
db.exec(`
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  status TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_updated_at ON leads(updated_at);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,          -- opcional, luego lo reemplazamos por account_id
  position TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contacts_updated_at ON contacts(updated_at);
`);

// --- Accounts ---
db.exec(`
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  website TEXT,
  phone TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_accounts_updated_at ON accounts(updated_at);
`);
// --- Deals ---
db.exec(`
CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  amount INTEGER,
  stage TEXT NOT NULL,             -- nuevo | calificado | propuesta | negociacion | ganado | perdido
  account_id TEXT,
  contact_id TEXT,
  close_date INTEGER,              -- opcional (timestamp)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deals_updated_at ON deals(updated_at);
CREATE INDEX IF NOT EXISTS idx_deals_account_id ON deals(account_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
`);

// Añadir columna account_id a contacts (idempotente)
const hasAccountId = db
  .prepare(`PRAGMA table_info(contacts)`)
  .all()
  .some((c) => c.name === "account_id");
if (!hasAccountId) {
  db.exec(`ALTER TABLE contacts ADD COLUMN account_id TEXT`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts(account_id)`);
}

const app = express();
app.use(cors());
app.use(express.json());

// util simple para try/catch
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

app.get("/health", (_req, res) => res.json({ ok: true }));

// ------- Leads -------
app.get("/leads", wrap(async (_req, res) => {
  const rows = db.prepare("SELECT * FROM leads ORDER BY updated_at DESC").all();
  res.json(rows);
}));

app.get("/leads/:id", wrap(async (req, res) => {
  const row = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
}));

app.post("/leads", wrap(async (req, res) => {
  const { id, name, email, phone, company, status } = req.body || {};
  if (!id || !name) return res.status(400).json({ error: "id and name required" });
  const now = Date.now();
  db.prepare(
    `INSERT INTO leads (id,name,email,phone,company,status,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(id, name, email ?? null, phone ?? null, company ?? null, status ?? "nuevo", now, now);
  res.status(201).json({ ok: true });
}));

app.patch("/leads/:id", wrap(async (req, res) => {
  const found = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
  if (!found) return res.status(404).json({ error: "not found" });

  const next = { ...found, ...req.body, updated_at: Date.now() };
  db.prepare(
    `UPDATE leads SET name=?, email=?, phone=?, company=?, status=?, updated_at=? WHERE id=?`
  ).run(
    next.name, next.email ?? null, next.phone ?? null, next.company ?? null,
    next.status ?? "nuevo", next.updated_at, req.params.id
  );
  res.json({ ok: true });
}));

app.delete("/leads/:id", wrap(async (req, res) => {
  db.prepare("DELETE FROM leads WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
}));

// ------- Contacts -------
app.get("/contacts", wrap(async (_req, res) => {
  const rows = db.prepare("SELECT * FROM contacts ORDER BY updated_at DESC").all();
  res.json(rows);
}));

app.get("/contacts/:id", wrap(async (req, res) => {
  const row = db.prepare("SELECT * FROM contacts WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
}));

// ✅ incluye account_id en INSERT
app.post("/contacts", wrap(async (req, res) => {
  const { id, name, email, phone, company, position, account_id } = req.body || {};
  if (!id || !name) return res.status(400).json({ error: "id and name required" });
  const now = Date.now();
  db.prepare(
    `INSERT INTO contacts (id,name,email,phone,company,position,account_id,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(
    id, name, email ?? null, phone ?? null, company ?? null, position ?? null,
    account_id ?? null, now, now
  );
  res.status(201).json({ ok: true });
}));

// ✅ incluye account_id en UPDATE
app.patch("/contacts/:id", wrap(async (req, res) => {
  const found = db.prepare("SELECT * FROM contacts WHERE id = ?").get(req.params.id);
  if (!found) return res.status(404).json({ error: "not found" });

  const next = { ...found, ...req.body, updated_at: Date.now() };
  db.prepare(
    `UPDATE contacts SET name=?, email=?, phone=?, company=?, position=?, account_id=?, updated_at=? WHERE id=?`
  ).run(
    next.name, next.email ?? null, next.phone ?? null, next.company ?? null,
    next.position ?? null, next.account_id ?? null, next.updated_at, req.params.id
  );
  res.json({ ok: true });
}));

app.delete("/contacts/:id", wrap(async (req, res) => {
  db.prepare("DELETE FROM contacts WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
}));

// ------- Accounts -------
app.get("/accounts", wrap(async (_req, res) => {
  const rows = db.prepare("SELECT * FROM accounts ORDER BY updated_at DESC").all();
  res.json(rows);
}));

app.get("/accounts/:id", wrap(async (req, res) => {
  const row = db.prepare("SELECT * FROM accounts WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
}));

app.post("/accounts", wrap(async (req, res) => {
  const { id, name, website, phone } = req.body || {};
  if (!id || !name) return res.status(400).json({ error: "id and name required" });
  const now = Date.now();
  db.prepare(
    `INSERT INTO accounts (id,name,website,phone,created_at,updated_at)
     VALUES (?,?,?,?,?,?)`
  ).run(id, name, website ?? null, phone ?? null, now, now);
  res.status(201).json({ ok: true });
}));

app.patch("/accounts/:id", wrap(async (req, res) => {
  const found = db.prepare("SELECT * FROM accounts WHERE id = ?").get(req.params.id);
  if (!found) return res.status(404).json({ error: "not found" });
  const next = { ...found, ...req.body, updated_at: Date.now() };
  db.prepare(
    `UPDATE accounts SET name=?, website=?, phone=?, updated_at=? WHERE id=?`
  ).run(next.name, next.website ?? null, next.phone ?? null, next.updated_at, req.params.id);
  res.json({ ok: true });
}));

app.delete("/accounts/:id", wrap(async (req, res) => {
  // (opcional) impedir borrar si hay contactos enlazados:
  const cnt = db.prepare("SELECT COUNT(*) AS n FROM contacts WHERE account_id = ?").get(req.params.id).n;
  if (cnt > 0) return res.status(409).json({ error: "account_has_contacts" });
  db.prepare("DELETE FROM accounts WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
}));

// ------- Deals -------
app.get("/deals", wrap(async (_req, res) => {
  const rows = db.prepare("SELECT * FROM deals ORDER BY updated_at DESC").all();
  res.json(rows);
}));

app.get("/deals/:id", wrap(async (req, res) => {
  const row = db.prepare("SELECT * FROM deals WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
}));

app.post("/deals", wrap(async (req, res) => {
  const { id, title, amount, stage, account_id, contact_id, close_date } = req.body || {};
  if (!id || !title) return res.status(400).json({ error: "id and title required" });
  const now = Date.now();
  const s = stage || "nuevo";
  db.prepare(
    `INSERT INTO deals (id,title,amount,stage,account_id,contact_id,close_date,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(id, title, amount ?? null, s, account_id ?? null, contact_id ?? null, close_date ?? null, now, now);
  res.status(201).json({ ok: true });
}));

app.patch("/deals/:id", wrap(async (req, res) => {
  const found = db.prepare("SELECT * FROM deals WHERE id = ?").get(req.params.id);
  if (!found) return res.status(404).json({ error: "not found" });
  const next = { ...found, ...req.body, updated_at: Date.now() };
  db.prepare(
    `UPDATE deals SET title=?, amount=?, stage=?, account_id=?, contact_id=?, close_date=?, updated_at=? WHERE id=?`
  ).run(
    next.title, next.amount ?? null, next.stage ?? "nuevo", next.account_id ?? null,
    next.contact_id ?? null, next.close_date ?? null, next.updated_at, req.params.id
  );
  res.json({ ok: true });
}));

app.delete("/deals/:id", wrap(async (req, res) => {
  db.prepare("DELETE FROM deals WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
}));
// ⬇️ Estos dos middlewares deben ir AL FINAL, después de TODAS las rutas
app.use((_req, res) => res.status(404).json({ error: "not found" }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
