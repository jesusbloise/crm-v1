const db = require("./connection");

/** Crea tablas e índices (idempotente). */
function runMigrations() {
  // --- Leads ---
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

  // --- Contacts ---
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
    stage TEXT NOT NULL,          -- nuevo | calificado | propuesta | negociacion | ganado | perdido
    account_id TEXT,
    contact_id TEXT,
    close_date INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_deals_updated_at ON deals(updated_at);
  CREATE INDEX IF NOT EXISTS idx_deals_account_id ON deals(account_id);
  CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
  `);

  // --- Activities ---
  db.exec(`
  CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,         -- task | call | meeting
    title TEXT NOT NULL,
    due_date INTEGER,
    status TEXT NOT NULL,       -- open | done | canceled
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

  // --- Notes ---
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

  // --- Events (audit log) ---
  db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    description TEXT NOT NULL,
    actor TEXT,
    meta TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity, entity_id);
  `);
}

/** ALTER idempotente: agrega contacts.account_id + índice si no existe. */
function ensureContactsAccountId() {
  const hasAccountId = db
    .prepare(`PRAGMA table_info(contacts)`)
    .all()
    .some((c) => c.name === "account_id");
  if (!hasAccountId) {
    db.exec(`ALTER TABLE contacts ADD COLUMN account_id TEXT`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts(account_id)`);
  }
}

module.exports = { runMigrations, ensureContactsAccountId };
