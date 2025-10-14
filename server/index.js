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

// --- Activities (nuevo, simple) ---
db.exec(`
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,           -- task | call | meeting
  title TEXT NOT NULL,
  due_date INTEGER,             -- opcional (timestamp)
  status TEXT NOT NULL,         -- open | done | canceled
  notes TEXT,
  account_id TEXT,
  contact_id TEXT,
  lead_id TEXT,
  deal_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_updated_at ON activities(updated_at);
CREATE INDEX IF NOT EXISTS idx_activities_deal ON activities(deal_id);
CREATE INDEX IF NOT EXISTS idx_activities_contact ON activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_activities_account ON activities(account_id);
CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities(lead_id);
`);

// --- Notes (nuevo, simple) ---
db.exec(`
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  account_id TEXT,
  contact_id TEXT,
  lead_id TEXT,
  deal_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);
CREATE INDEX IF NOT EXISTS idx_notes_deal ON notes(deal_id);
CREATE INDEX IF NOT EXISTS idx_notes_contact ON notes(contact_id);
CREATE INDEX IF NOT EXISTS idx_notes_account ON notes(account_id);
CREATE INDEX IF NOT EXISTS idx_notes_lead ON notes(lead_id);
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

// incluye account_id en INSERT
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

// incluye account_id en UPDATE
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

// PATCH con automatización: si pasa a "propuesta" crear tarea para mañana
app.patch("/deals/:id", wrap(async (req, res) => {
  const found = db.prepare("SELECT * FROM deals WHERE id = ?").get(req.params.id);
  if (!found) return res.status(404).json({ error: "not found" });
  const prevStage = found.stage;
  const next = { ...found, ...req.body, updated_at: Date.now() };

  db.prepare(
    `UPDATE deals SET title=?, amount=?, stage=?, account_id=?, contact_id=?, close_date=?, updated_at=? WHERE id=?`
  ).run(
    next.title, next.amount ?? null, next.stage ?? "nuevo", next.account_id ?? null,
    next.contact_id ?? null, next.close_date ?? null, next.updated_at, req.params.id
  );

  if (prevStage !== "propuesta" && next.stage === "propuesta") {
    const in24h = Date.now() + 24 * 60 * 60 * 1000;
    const aid = Math.random().toString(36).slice(2) + Date.now().toString(36);
    db.prepare(`
      INSERT INTO activities (id,type,title,due_date,status,deal_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(aid, "task", "Enviar propuesta", in24h, "open", req.params.id, Date.now(), Date.now());
  }

  res.json({ ok: true });
}));

app.delete("/deals/:id", wrap(async (req, res) => {
  db.prepare("DELETE FROM deals WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
}));

// ------- Activities API (nuevo) -------
app.get("/activities", wrap(async (req, res) => {
  const { deal_id, contact_id, account_id, lead_id, status } = req.query;
  const where = [];
  const params = [];
  if (deal_id)    { where.push("deal_id = ?"); params.push(deal_id); }
  if (contact_id) { where.push("contact_id = ?"); params.push(contact_id); }
  if (account_id) { where.push("account_id = ?"); params.push(account_id); }
  if (lead_id)    { where.push("lead_id = ?"); params.push(lead_id); }
  if (status)     { where.push("status = ?"); params.push(status); }
  const sql = `
    SELECT * FROM activities
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY (CASE status WHEN 'open' THEN 0 ELSE 1 END),
             due_date IS NULL, due_date ASC, updated_at DESC
  `;
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
}));

app.post("/activities", wrap(async (req, res) => {
  const { id, type, title, due_date, notes, status, account_id, contact_id, lead_id, deal_id } = req.body || {};
  if (!id || !type || !title) return res.status(400).json({ error: "id, type y title requeridos" });
  const now = Date.now();
  db.prepare(`
    INSERT INTO activities (id,type,title,due_date,status,notes,account_id,contact_id,lead_id,deal_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, type, title, due_date ?? null, status ?? "open", notes ?? null, account_id ?? null, contact_id ?? null, lead_id ?? null, deal_id ?? null, now, now);
  res.status(201).json({ ok: true });
}));

app.patch("/activities/:id", wrap(async (req, res) => {
  const found = db.prepare("SELECT * FROM activities WHERE id = ?").get(req.params.id);
  if (!found) return res.status(404).json({ error: "not found" });
  const next = { ...found, ...req.body, updated_at: Date.now() };
  db.prepare(`
    UPDATE activities
    SET type=?, title=?, due_date=?, status=?, notes=?, account_id=?, contact_id=?, lead_id=?, deal_id=?, updated_at=?
    WHERE id=?
  `).run(next.type, next.title, next.due_date ?? null, next.status, next.notes ?? null, next.account_id ?? null, next.contact_id ?? null, next.lead_id ?? null, next.deal_id ?? null, next.updated_at, req.params.id);
  res.json({ ok: true });
}));

app.delete("/activities/:id", wrap(async (req, res) => {
  db.prepare("DELETE FROM activities WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
}));

// ------- Notes API (nuevo) -------
app.get("/notes", wrap(async (req, res) => {
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

app.post("/notes", wrap(async (req, res) => {
  const { id, body, account_id, contact_id, lead_id, deal_id } = req.body || {};
  if (!id || !body) return res.status(400).json({ error: "id y body requeridos" });
  const now = Date.now();
  db.prepare(`
    INSERT INTO notes (id,body,account_id,contact_id,lead_id,deal_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(id, body, account_id ?? null, contact_id ?? null, lead_id ?? null, deal_id ?? null, now, now);
  res.status(201).json({ ok: true });
}));

app.delete("/notes/:id", wrap(async (req, res) => {
  db.prepare("DELETE FROM notes WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
}));

// ⬇️ Middlewares finales
app.use((_req, res) => res.status(404).json({ error: "not found" }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));

// --- helpers de cursor (arriba de las rutas, una sola vez si no existen) ---
function enc(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}
function dec(s) {
  try { return JSON.parse(Buffer.from(String(s), "base64url").toString("utf8")); }
  catch { return null; }
}

// ------- Contacts SEARCH/PAGED -------
app.get("/contacts.search", wrap(async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10) || 20, 100);

  // cursor = { updated_at, id }
  const cursorRaw = req.query.cursor ? dec(req.query.cursor) : null;
  const params = [];
  const where = [];

  if (q) {
    // busca en name/email/phone/company
    where.push(`(name LIKE ? OR IFNULL(email,'') LIKE ? OR IFNULL(phone,'') LIKE ? OR IFNULL(company,'') LIKE ?)`);
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  let order = `ORDER BY updated_at DESC, id DESC`;
  let cursorClause = "";
  if (cursorRaw && Number.isFinite(cursorRaw.updated_at) && cursorRaw.id) {
    // pagina hacia adelante: "menor" en el orden (updated_at,id)
    cursorClause = `(${where.length ? "AND " : "WHERE "}(updated_at < ? OR (updated_at = ? AND id < ?)))`;
    params.push(cursorRaw.updated_at, cursorRaw.updated_at, cursorRaw.id);
  }

  const sql = `
    SELECT id, name, email, phone, company, account_id, created_at, updated_at
    FROM contacts
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ${cursorClause}
    ${order}
    LIMIT ?
  `;
  const rows = db.prepare(sql).all(...params, limit);

  let nextCursor = null;
  if (rows.length === limit) {
    const last = rows[rows.length - 1];
    nextCursor = enc({ updated_at: last.updated_at, id: last.id });
  }

  res.json({ items: rows, nextCursor });
}));


// const express = require("express");
// const cors = require("cors");
// const Database = require("better-sqlite3");

// const db = new Database("./crm.db"); // archivo junto a /server
// db.pragma("journal_mode = WAL");
// db.pragma("foreign_keys = ON");

// // --- Esquema ---
// db.exec(`
// CREATE TABLE IF NOT EXISTS leads (
//   id TEXT PRIMARY KEY,
//   name TEXT NOT NULL,
//   email TEXT,
//   phone TEXT,
//   company TEXT,
//   status TEXT,
//   created_at INTEGER NOT NULL,
//   updated_at INTEGER NOT NULL
// );
// CREATE INDEX IF NOT EXISTS idx_leads_updated_at ON leads(updated_at);
// `);

// db.exec(`
// CREATE TABLE IF NOT EXISTS contacts (
//   id TEXT PRIMARY KEY,
//   name TEXT NOT NULL,
//   email TEXT,
//   phone TEXT,
//   company TEXT,          -- opcional, luego lo reemplazamos por account_id
//   position TEXT,
//   created_at INTEGER NOT NULL,
//   updated_at INTEGER NOT NULL
// );
// CREATE INDEX IF NOT EXISTS idx_contacts_updated_at ON contacts(updated_at);
// `);

// // --- Accounts ---
// db.exec(`
// CREATE TABLE IF NOT EXISTS accounts (
//   id TEXT PRIMARY KEY,
//   name TEXT NOT NULL,
//   website TEXT,
//   phone TEXT,
//   created_at INTEGER NOT NULL,
//   updated_at INTEGER NOT NULL
// );
// CREATE INDEX IF NOT EXISTS idx_accounts_updated_at ON accounts(updated_at);
// `);

// // --- Deals ---
// db.exec(`
// CREATE TABLE IF NOT EXISTS deals (
//   id TEXT PRIMARY KEY,
//   title TEXT NOT NULL,
//   amount INTEGER,
//   stage TEXT NOT NULL,             -- nuevo | calificado | propuesta | negociacion | ganado | perdido
//   account_id TEXT,
//   contact_id TEXT,
//   close_date INTEGER,              -- opcional (timestamp)
//   created_at INTEGER NOT NULL,
//   updated_at INTEGER NOT NULL
// );
// CREATE INDEX IF NOT EXISTS idx_deals_updated_at ON deals(updated_at);
// CREATE INDEX IF NOT EXISTS idx_deals_account_id ON deals(account_id);
// CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
// `);

// // --- Activities (nuevo) ---
// db.exec(`
// CREATE TABLE IF NOT EXISTS activities (
//   id TEXT PRIMARY KEY,
//   type TEXT NOT NULL,           -- task | call | meeting
//   title TEXT NOT NULL,
//   due_date INTEGER,             -- opcional (timestamp)
//   status TEXT NOT NULL,         -- open | done | canceled
//   notes TEXT,
//   account_id TEXT,
//   contact_id TEXT,
//   lead_id TEXT,
//   deal_id TEXT,
//   created_at INTEGER NOT NULL,
//   updated_at INTEGER NOT NULL
// );
// CREATE INDEX IF NOT EXISTS idx_activities_updated_at ON activities(updated_at);
// CREATE INDEX IF NOT EXISTS idx_activities_deal ON activities(deal_id);
// CREATE INDEX IF NOT EXISTS idx_activities_contact ON activities(contact_id);
// CREATE INDEX IF NOT EXISTS idx_activities_account ON activities(account_id);
// CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities(lead_id);
// `);

// // --- Notes (nuevo) ---
// db.exec(`
// CREATE TABLE IF NOT EXISTS notes (
//   id TEXT PRIMARY KEY,
//   body TEXT NOT NULL,
//   account_id TEXT,
//   contact_id TEXT,
//   lead_id TEXT,
//   deal_id TEXT,
//   created_at INTEGER NOT NULL,
//   updated_at INTEGER NOT NULL
// );
// CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);
// CREATE INDEX IF NOT EXISTS idx_notes_deal ON notes(deal_id);
// CREATE INDEX IF NOT EXISTS idx_notes_contact ON notes(contact_id);
// CREATE INDEX IF NOT EXISTS idx_notes_account ON notes(account_id);
// CREATE INDEX IF NOT EXISTS idx_notes_lead ON notes(lead_id);
// `);

// // Añadir columna account_id a contacts (idempotente)
// const hasAccountId = db
//   .prepare(`PRAGMA table_info(contacts)`)
//   .all()
//   .some((c) => c.name === "account_id");
// if (!hasAccountId) {
//   db.exec(`ALTER TABLE contacts ADD COLUMN account_id TEXT`);
//   db.exec(
//     `CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts(account_id)`
//   );
// }

// const app = express();
// app.use(cors());
// app.use(express.json());

// // util simple para try/catch
// const wrap = (fn) => (req, res, next) =>
//   Promise.resolve(fn(req, res)).catch(next);

// app.get("/health", (_req, res) => res.json({ ok: true }));

// // ------- Leads -------
// app.get(
//   "/leads",
//   wrap(async (_req, res) => {
//     const rows = db
//       .prepare("SELECT * FROM leads ORDER BY updated_at DESC")
//       .all();
//     res.json(rows);
//   })
// );

// app.get(
//   "/leads/:id",
//   wrap(async (req, res) => {
//     const row = db
//       .prepare("SELECT * FROM leads WHERE id = ?")
//       .get(req.params.id);
//     if (!row) return res.status(404).json({ error: "not found" });
//     res.json(row);
//   })
// );

// app.post(
//   "/leads",
//   wrap(async (req, res) => {
//     const { id, name, email, phone, company, status } = req.body || {};
//     if (!id || !name)
//       return res.status(400).json({ error: "id and name required" });
//     const now = Date.now();
//     db.prepare(
//       `INSERT INTO leads (id,name,email,phone,company,status,created_at,updated_at)
//      VALUES (?,?,?,?,?,?,?,?)`
//     ).run(
//       id,
//       name,
//       email ?? null,
//       phone ?? null,
//       company ?? null,
//       status ?? "nuevo",
//       now,
//       now
//     );
//     res.status(201).json({ ok: true });
//   })
// );

// app.patch(
//   "/leads/:id",
//   wrap(async (req, res) => {
//     const found = db
//       .prepare("SELECT * FROM leads WHERE id = ?")
//       .get(req.params.id);
//     if (!found) return res.status(404).json({ error: "not found" });

//     const next = { ...found, ...req.body, updated_at: Date.now() };
//     db.prepare(
//       `UPDATE leads SET name=?, email=?, phone=?, company=?, status=?, updated_at=? WHERE id=?`
//     ).run(
//       next.name,
//       next.email ?? null,
//       next.phone ?? null,
//       next.company ?? null,
//       next.status ?? "nuevo",
//       next.updated_at,
//       req.params.id
//     );
//     res.json({ ok: true });
//   })
// );

// app.delete(
//   "/leads/:id",
//   wrap(async (req, res) => {
//     db.prepare("DELETE FROM leads WHERE id = ?").run(req.params.id);
//     res.json({ ok: true });
//   })
// );

// // ------- Contacts -------
// app.get(
//   "/contacts",
//   wrap(async (_req, res) => {
//     const rows = db
//       .prepare("SELECT * FROM contacts ORDER BY updated_at DESC")
//       .all();
//     res.json(rows);
//   })
// );

// app.get(
//   "/contacts/:id",
//   wrap(async (req, res) => {
//     const row = db
//       .prepare("SELECT * FROM contacts WHERE id = ?")
//       .get(req.params.id);
//     if (!row) return res.status(404).json({ error: "not found" });
//     res.json(row);
//   })
// );

// // ✅ incluye account_id en INSERT
// app.post(
//   "/contacts",
//   wrap(async (req, res) => {
//     const { id, name, email, phone, company, position, account_id } =
//       req.body || {};
//     if (!id || !name)
//       return res.status(400).json({ error: "id and name required" });
//     const now = Date.now();
//     db.prepare(
//       `INSERT INTO contacts (id,name,email,phone,company,position,account_id,created_at,updated_at)
//      VALUES (?,?,?,?,?,?,?,?,?)`
//     ).run(
//       id,
//       name,
//       email ?? null,
//       phone ?? null,
//       company ?? null,
//       position ?? null,
//       account_id ?? null,
//       now,
//       now
//     );
//     res.status(201).json({ ok: true });
//   })
// );

// // ✅ incluye account_id en UPDATE
// app.patch(
//   "/contacts/:id",
//   wrap(async (req, res) => {
//     const found = db
//       .prepare("SELECT * FROM contacts WHERE id = ?")
//       .get(req.params.id);
//     if (!found) return res.status(404).json({ error: "not found" });

//     const next = { ...found, ...req.body, updated_at: Date.now() };
//     db.prepare(
//       `UPDATE contacts SET name=?, email=?, phone=?, company=?, position=?, account_id=?, updated_at=? WHERE id=?`
//     ).run(
//       next.name,
//       next.email ?? null,
//       next.phone ?? null,
//       next.company ?? null,
//       next.position ?? null,
//       next.account_id ?? null,
//       next.updated_at,
//       req.params.id
//     );
//     res.json({ ok: true });
//   })
// );

// app.delete(
//   "/contacts/:id",
//   wrap(async (req, res) => {
//     db.prepare("DELETE FROM contacts WHERE id = ?").run(req.params.id);
//     res.json({ ok: true });
//   })
// );

// // ------- Accounts -------
// app.get(
//   "/accounts",
//   wrap(async (_req, res) => {
//     const rows = db
//       .prepare("SELECT * FROM accounts ORDER BY updated_at DESC")
//       .all();
//     res.json(rows);
//   })
// );

// app.get(
//   "/accounts/:id",
//   wrap(async (req, res) => {
//     const row = db
//       .prepare("SELECT * FROM accounts WHERE id = ?")
//       .get(req.params.id);
//     if (!row) return res.status(404).json({ error: "not found" });
//     res.json(row);
//   })
// );

// app.post(
//   "/accounts",
//   wrap(async (req, res) => {
//     const { id, name, website, phone } = req.body || {};
//     if (!id || !name)
//       return res.status(400).json({ error: "id and name required" });
//     const now = Date.now();
//     db.prepare(
//       `INSERT INTO accounts (id,name,website,phone,created_at,updated_at)
//      VALUES (?,?,?,?,?,?)`
//     ).run(id, name, website ?? null, phone ?? null, now, now);
//     res.status(201).json({ ok: true });
//   })
// );

// app.patch(
//   "/accounts/:id",
//   wrap(async (req, res) => {
//     const found = db
//       .prepare("SELECT * FROM accounts WHERE id = ?")
//       .get(req.params.id);
//     if (!found) return res.status(404).json({ error: "not found" });
//     const next = { ...found, ...req.body, updated_at: Date.now() };
//     db.prepare(
//       `UPDATE accounts SET name=?, website=?, phone=?, updated_at=? WHERE id=?`
//     ).run(next.name, next.website ?? null, next.phone ?? null, next.updated_at, req.params.id);
//     res.json({ ok: true });
//   })
// );

// app.delete(
//   "/accounts/:id",
//   wrap(async (req, res) => {
//     // (opcional) impedir borrar si hay contactos enlazados:
//     const cnt = db
//       .prepare("SELECT COUNT(*) AS n FROM contacts WHERE account_id = ?")
//       .get(req.params.id).n;
//     if (cnt > 0) return res.status(409).json({ error: "account_has_contacts" });
//     db.prepare("DELETE FROM accounts WHERE id = ?").run(req.params.id);
//     res.json({ ok: true });
//   })
// );

// // ------- Deals -------
// app.get(
//   "/deals",
//   wrap(async (_req, res) => {
//     const rows = db
//       .prepare("SELECT * FROM deals ORDER BY updated_at DESC")
//       .all();
//     res.json(rows);
//   })
// );

// app.get(
//   "/deals/:id",
//   wrap(async (req, res) => {
//     const row = db
//       .prepare("SELECT * FROM deals WHERE id = ?")
//       .get(req.params.id);
//     if (!row) return res.status(404).json({ error: "not found" });
//     res.json(row);
//   })
// );

// app.post(
//   "/deals",
//   wrap(async (req, res) => {
//     const { id, title, amount, stage, account_id, contact_id, close_date } =
//       req.body || {};
//     if (!id || !title)
//       return res.status(400).json({ error: "id and title required" });
//     const now = Date.now();
//     const s = stage || "nuevo";
//     db.prepare(
//       `INSERT INTO deals (id,title,amount,stage,account_id,contact_id,close_date,created_at,updated_at)
//      VALUES (?,?,?,?,?,?,?,?,?)`
//     ).run(
//       id,
//       title,
//       amount ?? null,
//       s,
//       account_id ?? null,
//       contact_id ?? null,
//       close_date ?? null,
//       now,
//       now
//     );
//     res.status(201).json({ ok: true });
//   })
// );

// // PATCH con automatización: si pasa a "propuesta" crear tarea para mañana
// app.patch(
//   "/deals/:id",
//   wrap(async (req, res) => {
//     const found = db
//       .prepare("SELECT * FROM deals WHERE id = ?")
//       .get(req.params.id);
//     if (!found) return res.status(404).json({ error: "not found" });

//     const prevStage = found.stage;
//     const next = { ...found, ...req.body, updated_at: Date.now() };
//     db.prepare(
//       `UPDATE deals SET title=?, amount=?, stage=?, account_id=?, contact_id=?, close_date=?, updated_at=? WHERE id=?`
//     ).run(
//       next.title,
//       next.amount ?? null,
//       next.stage ?? "nuevo",
//       next.account_id ?? null,
//       next.contact_id ?? null,
//       next.close_date ?? null,
//       next.updated_at,
//       req.params.id
//     );

//     // Automatización simple
//     if (prevStage !== "propuesta" && next.stage === "propuesta") {
//       const in24h = Date.now() + 24 * 60 * 60 * 1000;
//       const aid =
//         Math.random().toString(36).slice(2) + Date.now().toString(36);
//       db.prepare(
//         `
//         INSERT INTO activities (id,type,title,due_date,status,deal_id,created_at,updated_at)
//         VALUES (?,?,?,?,?,?,?,?)
//       `
//       ).run(
//         aid,
//         "task",
//         "Enviar propuesta",
//         in24h,
//         "open",
//         req.params.id,
//         Date.now(),
//         Date.now()
//       );
//     }

//     res.json({ ok: true });
//   })
// );

// app.delete(
//   "/deals/:id",
//   wrap(async (req, res) => {
//     db.prepare("DELETE FROM deals WHERE id = ?").run(req.params.id);
//     res.json({ ok: true });
//   })
// );

// // ------- Activities API -------
// app.get(
//   "/activities",
//   wrap(async (req, res) => {
//     const { deal_id, contact_id, account_id, lead_id, status } = req.query;
//     const where = [];
//     const params = [];
//     if (deal_id) {
//       where.push("deal_id = ?");
//       params.push(deal_id);
//     }
//     if (contact_id) {
//       where.push("contact_id = ?");
//       params.push(contact_id);
//     }
//     if (account_id) {
//       where.push("account_id = ?");
//       params.push(account_id);
//     }
//     if (lead_id) {
//       where.push("lead_id = ?");
//       params.push(lead_id);
//     }
//     if (status) {
//       where.push("status = ?");
//       params.push(status);
//     }
//     const sql = `
//       SELECT * FROM activities
//       ${where.length ? "WHERE " + where.join(" AND ") : ""}
//       ORDER BY (CASE status WHEN 'open' THEN 0 ELSE 1 END), due_date IS NULL, due_date ASC, updated_at DESC
//     `;
//     const rows = db.prepare(sql).all(...params);
//     res.json(rows);
//   })
// );

// app.post(
//   "/activities",
//   wrap(async (req, res) => {
//     const {
//       id,
//       type,
//       title,
//       due_date,
//       notes,
//       status,
//       account_id,
//       contact_id,
//       lead_id,
//       deal_id,
//     } = req.body || {};
//     if (!id || !type || !title)
//       return res.status(400).json({ error: "id, type y title requeridos" });
//     const now = Date.now();
//     db.prepare(
//       `
//       INSERT INTO activities (id,type,title,due_date,status,notes,account_id,contact_id,lead_id,deal_id,created_at,updated_at)
//       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
//     `
//     ).run(
//       id,
//       type,
//       title,
//       due_date ?? null,
//       status ?? "open",
//       notes ?? null,
//       account_id ?? null,
//       contact_id ?? null,
//       lead_id ?? null,
//       deal_id ?? null,
//       now,
//       now
//     );
//     res.status(201).json({ ok: true });
//   })
// );

// app.patch(
//   "/activities/:id",
//   wrap(async (req, res) => {
//     const found = db
//       .prepare("SELECT * FROM activities WHERE id = ?")
//       .get(req.params.id);
//     if (!found) return res.status(404).json({ error: "not found" });
//     const next = { ...found, ...req.body, updated_at: Date.now() };
//     db.prepare(
//       `
//       UPDATE activities
//       SET type=?, title=?, due_date=?, status=?, notes=?, account_id=?, contact_id=?, lead_id=?, deal_id=?, updated_at=?
//       WHERE id=?
//     `
//     ).run(
//       next.type,
//       next.title,
//       next.due_date ?? null,
//       next.status,
//       next.notes ?? null,
//       next.account_id ?? null,
//       next.contact_id ?? null,
//       next.lead_id ?? null,
//       next.deal_id ?? null,
//       next.updated_at,
//       req.params.id
//     );
//     res.json({ ok: true });
//   })
// );

// app.delete(
//   "/activities/:id",
//   wrap(async (req, res) => {
//     db.prepare("DELETE FROM activities WHERE id = ?").run(req.params.id);
//     res.json({ ok: true });
//   })
// );

// // ------- Notes API -------
// app.get(
//   "/notes",
//   wrap(async (req, res) => {
//     const { deal_id, contact_id, account_id, lead_id } = req.query;
//     const where = [];
//     const params = [];
//     if (deal_id) {
//       where.push("deal_id = ?");
//       params.push(deal_id);
//     }
//     if (contact_id) {
//       where.push("contact_id = ?");
//       params.push(contact_id);
//     }
//     if (account_id) {
//       where.push("account_id = ?");
//       params.push(account_id);
//     }
//     if (lead_id) {
//       where.push("lead_id = ?");
//       params.push(lead_id);
//     }
//     const sql = `
//       SELECT * FROM notes
//       ${where.length ? "WHERE " + where.join(" AND ") : ""}
//       ORDER BY updated_at DESC
//     `;
//     res.json(db.prepare(sql).all(...params));
//   })
// );

// app.post(
//   "/notes",
//   wrap(async (req, res) => {
//     const { id, body, account_id, contact_id, lead_id, deal_id } =
//       req.body || {};
//     if (!id || !body)
//       return res.status(400).json({ error: "id y body requeridos" });
//     const now = Date.now();
//     db.prepare(
//       `
//       INSERT INTO notes (id,body,account_id,contact_id,lead_id,deal_id,created_at,updated_at)
//       VALUES (?,?,?,?,?,?,?,?)
//     `
//     ).run(
//       id,
//       body,
//       account_id ?? null,
//       contact_id ?? null,
//       lead_id ?? null,
//       deal_id ?? null,
//       now,
//       now
//     );
//     res.status(201).json({ ok: true });
//   })
// );

// app.delete(
//   "/notes/:id",
//   wrap(async (req, res) => {
//     db.prepare("DELETE FROM notes WHERE id = ?").run(req.params.id);
//     res.json({ ok: true });
//   })
// );

// // ⬇️ Estos dos middlewares deben ir AL FINAL, después de TODAS las rutas
// app.use((_req, res) => res.status(404).json({ error: "not found" }));

// app.use((err, _req, res, _next) => {
//   console.error(err);
//   res.status(500).json({ error: "internal_error" });
// });

// const PORT = process.env.PORT || 4000;
// app.listen(PORT, () =>
//   console.log(`API running on http://localhost:${PORT}`)
// );

