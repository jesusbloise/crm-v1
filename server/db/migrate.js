// server/db/migrate.js
const db = require("./connection");

/** Util */
function hasColumn(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
}

/** Crea tablas de negocio e índices (idempotente). */
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

/** Núcleo multi-tenant (tenants / users / memberships) — idempotente y robusto. */
function ensureTenantCore() {
  // 1) Crea tablas si faltan (no asume esquema previo)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      password_hash TEXT, -- simple dev auth; en prod usa IdP externo
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memberships (
      user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      role TEXT NOT NULL, -- owner | admin | member
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, tenant_id)
    );
  `);

  // 2) Asegura columnas clave si la DB existía sin ellas
  const ensureCol = (table, col, type) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!cols.includes(col)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
      if (col === "created_at" || col === "updated_at") {
        const now = Date.now();
        db.exec(`UPDATE ${table} SET ${col} = ${now} WHERE ${col} IS NULL`);
      }
    }
  };

  ensureCol("tenants", "created_at", "INTEGER");
  ensureCol("tenants", "updated_at", "INTEGER");
  ensureCol("users", "created_at", "INTEGER");
  ensureCol("users", "updated_at", "INTEGER");
  ensureCol("memberships", "created_at", "INTEGER");

  // 3) Índices (después de asegurar columnas)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tenants_updated_at ON tenants(updated_at);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
    CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON memberships(tenant_id);
  `);

  // 4) Seeds mínimos (idempotentes)
  const now = Date.now();
  db.prepare(`
    INSERT OR IGNORE INTO tenants (id, name, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run("demo", "Demo", now, now);

  db.prepare(`
    INSERT OR IGNORE INTO users (id, email, name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run("demo-admin", "admin@demo.local", "Demo Admin", now, now);

  db.prepare(`
    INSERT OR IGNORE INTO memberships (user_id, tenant_id, role, created_at)
    VALUES (?, ?, ?, ?)
  `).run("demo-admin", "demo", "owner", now);
}

/** ALTER idempotente: agrega contacts.account_id + índice si no existe. */
function ensureContactsAccountId() {
  if (!hasColumn("contacts", "account_id")) {
    db.exec(`ALTER TABLE contacts ADD COLUMN account_id TEXT`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts(account_id)`);
  }
}

/** 🔑 ALTER idempotente: agrega tenant_id a todas las tablas si falta, indexa y backfill 'demo'. */
function ensureTenantColumns() {
  const tables = [
    "leads",
    "contacts",
    "accounts",
    "deals",
    "activities",
    "notes",
    "events",
  ];

  for (const t of tables) {
    if (!hasColumn(t, "tenant_id")) {
      db.exec(`ALTER TABLE ${t} ADD COLUMN tenant_id TEXT`);
      // backfill para filas existentes
      db.exec(`UPDATE ${t} SET tenant_id = 'demo' WHERE tenant_id IS NULL`);
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_${t}_tenant ON ${t}(tenant_id)`);
  }
}

module.exports = {
  runMigrations,
  ensureContactsAccountId,
  ensureTenantColumns,
  ensureTenantCore,
};




// const db = require("./connection");

// /** Crea tablas e índices (idempotente). */
// function runMigrations() {
//   // --- Leads ---
//   db.exec(`
//   CREATE TABLE IF NOT EXISTS leads (
//     id TEXT PRIMARY KEY,
//     name TEXT NOT NULL,
//     email TEXT,
//     phone TEXT,
//     company TEXT,
//     status TEXT,
//     created_at INTEGER NOT NULL,
//     updated_at INTEGER NOT NULL
//   );
//   CREATE INDEX IF NOT EXISTS idx_leads_updated_at ON leads(updated_at);
//   `);

//   // --- Contacts ---
//   db.exec(`
//   CREATE TABLE IF NOT EXISTS contacts (
//     id TEXT PRIMARY KEY,
//     name TEXT NOT NULL,
//     email TEXT,
//     phone TEXT,
//     company TEXT,          -- opcional, luego lo reemplazamos por account_id
//     position TEXT,
//     created_at INTEGER NOT NULL,
//     updated_at INTEGER NOT NULL
//   );
//   CREATE INDEX IF NOT EXISTS idx_contacts_updated_at ON contacts(updated_at);
//   `);

//   // --- Accounts ---
//   db.exec(`
//   CREATE TABLE IF NOT EXISTS accounts (
//     id TEXT PRIMARY KEY,
//     name TEXT NOT NULL,
//     website TEXT,
//     phone TEXT,
//     created_at INTEGER NOT NULL,
//     updated_at INTEGER NOT NULL
//   );
//   CREATE INDEX IF NOT EXISTS idx_accounts_updated_at ON accounts(updated_at);
//   `);

//   // --- Deals ---
//   db.exec(`
//   CREATE TABLE IF NOT EXISTS deals (
//     id TEXT PRIMARY KEY,
//     title TEXT NOT NULL,
//     amount INTEGER,
//     stage TEXT NOT NULL,          -- nuevo | calificado | propuesta | negociacion | ganado | perdido
//     account_id TEXT,
//     contact_id TEXT,
//     close_date INTEGER,
//     created_at INTEGER NOT NULL,
//     updated_at INTEGER NOT NULL
//   );
//   CREATE INDEX IF NOT EXISTS idx_deals_updated_at ON deals(updated_at);
//   CREATE INDEX IF NOT EXISTS idx_deals_account_id ON deals(account_id);
//   CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
//   `);

//   // --- Activities ---
//   db.exec(`
//   CREATE TABLE IF NOT EXISTS activities (
//     id TEXT PRIMARY KEY,
//     type TEXT NOT NULL,         -- task | call | meeting
//     title TEXT NOT NULL,
//     due_date INTEGER,
//     status TEXT NOT NULL,       -- open | done | canceled
//     notes TEXT,
//     account_id TEXT,
//     contact_id TEXT,
//     lead_id TEXT,
//     deal_id TEXT,
//     created_at INTEGER NOT NULL,
//     updated_at INTEGER NOT NULL
//   );
//   CREATE INDEX IF NOT EXISTS idx_activities_updated_at ON activities(updated_at);
//   CREATE INDEX IF NOT EXISTS idx_activities_deal ON activities(deal_id);
//   CREATE INDEX IF NOT EXISTS idx_activities_contact ON activities(contact_id);
//   CREATE INDEX IF NOT EXISTS idx_activities_account ON activities(account_id);
//   CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities(lead_id);
//   `);

//   // --- Notes ---
//   db.exec(`
//   CREATE TABLE IF NOT EXISTS notes (
//     id TEXT PRIMARY KEY,
//     body TEXT NOT NULL,
//     account_id TEXT,
//     contact_id TEXT,
//     lead_id TEXT,
//     deal_id TEXT,
//     created_at INTEGER NOT NULL,
//     updated_at INTEGER NOT NULL
//   );
//   CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);
//   CREATE INDEX IF NOT EXISTS idx_notes_deal ON notes(deal_id);
//   CREATE INDEX IF NOT EXISTS idx_notes_contact ON notes(contact_id);
//   CREATE INDEX IF NOT EXISTS idx_notes_account ON notes(account_id);
//   CREATE INDEX IF NOT EXISTS idx_notes_lead ON notes(lead_id);
//   `);

//   // --- Events (audit log) ---
//   db.exec(`
//   CREATE TABLE IF NOT EXISTS events (
//     id TEXT PRIMARY KEY,
//     type TEXT NOT NULL,
//     entity TEXT NOT NULL,
//     entity_id TEXT NOT NULL,
//     description TEXT NOT NULL,
//     actor TEXT,
//     meta TEXT,
//     created_at INTEGER NOT NULL
//   );
//   CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
//   CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity, entity_id);
//   `);
// }

// /** ALTER idempotente: agrega contacts.account_id + índice si no existe. */
// function ensureContactsAccountId() {
//   const hasAccountId = db
//     .prepare(`PRAGMA table_info(contacts)`)
//     .all()
//     .some((c) => c.name === "account_id");
//   if (!hasAccountId) {
//     db.exec(`ALTER TABLE contacts ADD COLUMN account_id TEXT`);
//     db.exec(`CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts(account_id)`);
//   }
// }

// module.exports = { runMigrations, ensureContactsAccountId };
