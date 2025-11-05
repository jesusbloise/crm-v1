// server/db/migrate.js
const db = require("./connection");

const DEFAULT_TENANT = process.env.DEFAULT_TENANT || "demo";

/** Util */
function hasColumn(table, col) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((c) => c.name === col);
}

/** Opcional: habilita chequeo de FKs si en algún momento declaras foreign keys */
function enableForeignKeys() {
  try {
    db.exec(`PRAGMA foreign_keys = ON;`);
  } catch (_) {}
}

/** Crea tablas de negocio e índices (idempotente). */
function runMigrations() {
  enableForeignKeys();
  db.exec("BEGIN");
  try {
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
      CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
      CREATE INDEX IF NOT EXISTS idx_leads_id ON leads(id);
    `);

    // --- Contacts ---
    db.exec(`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        company TEXT,
        position TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_contacts_updated_at ON contacts(updated_at);
      CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
      CREATE INDEX IF NOT EXISTS idx_contacts_id ON contacts(id);
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
      CREATE INDEX IF NOT EXISTS idx_accounts_name ON accounts(name);
      CREATE INDEX IF NOT EXISTS idx_accounts_id ON accounts(id);
    `);

    // --- Deals ---
    db.exec(`
      CREATE TABLE IF NOT EXISTS deals (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        amount INTEGER,
        stage TEXT NOT NULL,
        account_id TEXT,
        contact_id TEXT,
        close_date INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_deals_updated_at ON deals(updated_at);
      CREATE INDEX IF NOT EXISTS idx_deals_account_id ON deals(account_id);
      CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
      CREATE INDEX IF NOT EXISTS idx_deals_id ON deals(id);
    `);
    db.exec(`UPDATE deals SET stage = 'nuevo' WHERE stage IS NULL;`);

    // --- Activities ---
    db.exec(`
      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        due_date INTEGER,
        remind_at_ms INTEGER,         -- incluye la col. para DBs nuevas
        status TEXT NOT NULL,
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
      CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);
      CREATE INDEX IF NOT EXISTS idx_activities_id ON activities(id);
    `);
    db.exec(`UPDATE activities SET status = 'open' WHERE status IS NULL;`);

    // Idempotente: si la DB existía sin remind_at_ms, agrégala
    if (!hasColumn("activities", "remind_at_ms")) {
      db.exec(`ALTER TABLE activities ADD COLUMN remind_at_ms INTEGER;`);
    }

    // Índices que dependen de remind_at_ms (crearlos DESPUÉS de asegurar la columna)
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_activities_remind_at ON activities(remind_at_ms);`
    );

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
      CREATE INDEX IF NOT EXISTS idx_notes_id ON notes(id);
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
      CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
      CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity, entity_id);
      CREATE INDEX IF NOT EXISTS idx_events_id ON events(id);
    `);

    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** Núcleo multi-tenant (tenants / users / memberships) — idempotente y robusto. */
function ensureTenantCore() {
  db.exec("BEGIN");
  try {
    // 1) Crea tablas si faltan
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
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memberships (
        user_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, tenant_id)
      );
    `);

    // 2) Asegura columnas clave si la DB existía sin ellas
    const ensureCol = (table, col, type, backfillFn) => {
      const cols = db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((c) => c.name);
      if (!cols.includes(col)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
        if (typeof backfillFn === "function") backfillFn(table, col);
      }
    };

    const backfillNow = (table, col) => {
      const ts = Date.now();
      db.exec(`UPDATE ${table} SET ${col} = ${ts} WHERE ${col} IS NULL`);
    };

    const backfillEmptyHash = () =>
      db.exec(
        `UPDATE users SET password_hash = '' WHERE password_hash IS NULL`
      );

    // --- tenants extras ---
    ensureCol("tenants", "created_at", "INTEGER", backfillNow);
    ensureCol("tenants", "updated_at", "INTEGER", backfillNow);
    ensureCol("tenants", "created_by", "TEXT", () => {
      db.exec(
        `UPDATE tenants SET created_by = 'demo-admin' WHERE created_by IS NULL OR created_by = ''`
      );
    });

    // --- users extras (perfil ampliado; todo opcional) ---
    ensureCol("users", "created_at", "INTEGER", backfillNow);
    ensureCol("users", "updated_at", "INTEGER", backfillNow);
    ensureCol("users", "password_hash", "TEXT NOT NULL", backfillEmptyHash);

    ensureCol("users", "avatar_url", "TEXT");
    ensureCol("users", "headline", "TEXT");
    ensureCol("users", "bio", "TEXT");
    ensureCol("users", "location", "TEXT");
    ensureCol("users", "company", "TEXT");
    ensureCol("users", "website", "TEXT");
    ensureCol("users", "twitter", "TEXT");
    ensureCol("users", "linkedin", "TEXT");
    ensureCol("users", "github", "TEXT");
    ensureCol("users", "phone", "TEXT");
    ensureCol("users", "timezone", "TEXT");
    ensureCol("users", "last_login_at", "INTEGER");

    // --- columnas Google OAuth / Calendar (idempotentes) ---
    ensureCol("users", "google_email", "TEXT");
    ensureCol("users", "google_refresh_token", "TEXT");
    ensureCol("users", "google_calendar_id", "TEXT");

    // ⬇️ NUEVO: URL del feed ICS (solo lectura)
    ensureCol("users", "google_ics_url", "TEXT");

    // Índices
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tenants_updated_at ON tenants(updated_at);
      CREATE INDEX IF NOT EXISTS idx_tenants_created_by ON tenants(created_by);

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_name ON users(name);
      CREATE INDEX IF NOT EXISTS idx_users_google_email ON users(google_email);

      CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
      CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON memberships(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_memberships_role ON memberships(role);
    `);

    // 4) Seeds mínimos
    const ts = Date.now();
    db.prepare(
      `INSERT OR IGNORE INTO tenants (id, name, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?)`
    ).run(DEFAULT_TENANT, "Demo", ts, ts, "demo-admin");

    db.prepare(
      `INSERT OR IGNORE INTO users (id, email, name, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run("demo-admin", "admin@demo.local", "Demo Admin", "", ts, ts);

    db.prepare(
      `INSERT OR IGNORE INTO memberships (user_id, tenant_id, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run("demo-admin", DEFAULT_TENANT, "owner", ts, ts);

    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** ALTER idempotente: agrega contacts.account_id + índice si no existe. */
function ensureContactsAccountId() {
  if (!hasColumn("contacts", "account_id")) {
    db.exec("BEGIN");
    try {
      db.exec(`ALTER TABLE contacts ADD COLUMN account_id TEXT`);
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts(account_id)`
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}

/**
 * 🔑 ALTER idempotente: agrega created_by a todas las tablas de recursos
 * para permitir control de acceso basado en ownership + roles.
 */
function ensureCreatedByColumns() {
  const tables = [
    "leads",
    "contacts",
    "accounts",
    "deals",
    "activities",
    "notes",
  ];

  db.exec("BEGIN");
  try {
    for (const t of tables) {
      if (!hasColumn(t, "created_by")) {
        db.exec(`ALTER TABLE ${t} ADD COLUMN created_by TEXT`);
        // Backfill: asignar al primer admin del tenant o dejar NULL
        // (se corregirá con script de migración)
      }

      // Índice para queries filtrados por created_by
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_${t}_created_by ON ${t}(created_by)`
      );
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_${t}_tenant_created_by ON ${t}(tenant_id, created_by)`
      );
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/**
 * 🔑 ALTER idempotente: agrega tenant_id a todas las tablas si falta,
 * indexa y backfill DEFAULT_TENANT.
 */
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

  db.exec("BEGIN");
  try {
    for (const t of tables) {
      if (!hasColumn(t, "tenant_id")) {
        db.exec(`ALTER TABLE ${t} ADD COLUMN tenant_id TEXT`);
        db.exec(
          `UPDATE ${t} SET tenant_id = '${DEFAULT_TENANT}' WHERE tenant_id IS NULL`
        );
      }

      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_${t}_tenant ON ${t}(tenant_id)`
      );

      const idxs = {
        leads: [
          `CREATE INDEX IF NOT EXISTS idx_leads_tenant_updated ON leads(tenant_id, updated_at)`,
          `CREATE INDEX IF NOT EXISTS idx_leads_tenant_id ON leads(tenant_id, id)`,
          `CREATE INDEX IF NOT EXISTS idx_leads_tenant_status ON leads(tenant_id, status)`,
        ],
        contacts: [
          `CREATE INDEX IF NOT EXISTS idx_contacts_tenant_updated ON contacts(tenant_id, updated_at)`,
          `CREATE INDEX IF NOT EXISTS idx_contacts_tenant_id ON contacts(tenant_id, id)`,
          `CREATE INDEX IF NOT EXISTS idx_contacts_tenant_email ON contacts(tenant_id, email)`,
          `CREATE INDEX IF NOT EXISTS idx_contacts_tenant_account ON contacts(tenant_id, account_id)`,
        ],
        accounts: [
          `CREATE INDEX IF NOT EXISTS idx_accounts_tenant_updated ON accounts(tenant_id, updated_at)`,
          `CREATE INDEX IF NOT EXISTS idx_accounts_tenant_id ON accounts(tenant_id, id)`,
          `CREATE INDEX IF NOT EXISTS idx_accounts_tenant_name ON accounts(tenant_id, name)`,
        ],
        deals: [
          `CREATE INDEX IF NOT EXISTS idx_deals_tenant_updated ON deals(tenant_id, updated_at)`,
          `CREATE INDEX IF NOT EXISTS idx_deals_tenant_id ON deals(tenant_id, id)`,
          `CREATE INDEX IF NOT EXISTS idx_deals_tenant_stage ON deals(tenant_id, stage)`,
          `CREATE INDEX IF NOT EXISTS idx_deals_tenant_account ON deals(tenant_id, account_id)`,
          `CREATE INDEX IF NOT EXISTS idx_deals_tenant_contact ON deals(tenant_id, contact_id)`,
        ],
        activities: [
          `CREATE INDEX IF NOT EXISTS idx_activities_tenant_updated ON activities(tenant_id, updated_at)`,
          `CREATE INDEX IF NOT EXISTS idx_activities_tenant_id ON activities(tenant_id, id)`,
          `CREATE INDEX IF NOT EXISTS idx_activities_tenant_status ON activities(tenant_id, status)`,
          `CREATE INDEX IF NOT EXISTS idx_activities_tenant_deal ON activities(tenant_id, deal_id)`,
          `CREATE INDEX IF NOT EXISTS idx_activities_tenant_contact ON activities(tenant_id, contact_id)`,
          `CREATE INDEX IF NOT EXISTS idx_activities_tenant_account ON activities(tenant_id, account_id)`,
          `CREATE INDEX IF NOT EXISTS idx_activities_tenant_lead ON activities(tenant_id, lead_id)`,
          // el índice por remind_at_ms sólo si existe la columna
        ],
        notes: [
          `CREATE INDEX IF NOT EXISTS idx_notes_tenant_updated ON notes(tenant_id, updated_at)`,
          `CREATE INDEX IF NOT EXISTS idx_notes_tenant_id ON notes(tenant_id, id)`,
          `CREATE INDEX IF NOT EXISTS idx_notes_tenant_deal ON notes(tenant_id, deal_id)`,
          `CREATE INDEX IF NOT EXISTS idx_notes_tenant_contact ON notes(tenant_id, contact_id)`,
          `CREATE INDEX IF NOT EXISTS idx_notes_tenant_account ON notes(tenant_id, account_id)`,
          `CREATE INDEX IF NOT EXISTS idx_notes_tenant_lead ON notes(tenant_id, lead_id)`,
        ],
        events: [
          `CREATE INDEX IF NOT EXISTS idx_events_tenant_created ON events(tenant_id, created_at)`,
          `CREATE INDEX IF NOT EXISTS idx_events_tenant_entity ON events(tenant_id, entity, entity_id, created_at)`,
          `CREATE INDEX IF NOT EXISTS idx_events_tenant_id ON events(tenant_id, id)`,
        ],
      };

      if (t === "activities" && hasColumn("activities", "remind_at_ms")) {
        db.exec(
          `CREATE INDEX IF NOT EXISTS idx_activities_tenant_remind ON activities(tenant_id, remind_at_ms)`
        );
      }

      for (const sql of idxs[t] || []) db.exec(sql);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

module.exports = {
  runMigrations,
  ensureContactsAccountId,
  ensureTenantColumns,
  ensureTenantCore,
  ensureCreatedByColumns,
};

// // server/db/migrate.js
// const db = require("./connection");

// const DEFAULT_TENANT = process.env.DEFAULT_TENANT || "demo";

// /** Util */
// function hasColumn(table, col) {
//   return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
// }

// /** Opcional: habilita chequeo de FKs si en algún momento declaras foreign keys */
// function enableForeignKeys() {
//   try {
//     db.exec(`PRAGMA foreign_keys = ON;`);
//   } catch (_) {}
// }

// /** Crea tablas de negocio e índices (idempotente). */
// function runMigrations() {
//   enableForeignKeys();
//   db.exec("BEGIN");
//   try {
//     // --- Leads ---
//     db.exec(`
//       CREATE TABLE IF NOT EXISTS leads (
//         id TEXT PRIMARY KEY,
//         name TEXT NOT NULL,
//         email TEXT,
//         phone TEXT,
//         company TEXT,
//         status TEXT,
//         created_at INTEGER NOT NULL,
//         updated_at INTEGER NOT NULL
//       );
//       CREATE INDEX IF NOT EXISTS idx_leads_updated_at ON leads(updated_at);
//       CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
//       CREATE INDEX IF NOT EXISTS idx_leads_id ON leads(id);
//     `);

//     // --- Contacts ---
//     db.exec(`
//       CREATE TABLE IF NOT EXISTS contacts (
//         id TEXT PRIMARY KEY,
//         name TEXT NOT NULL,
//         email TEXT,
//         phone TEXT,
//         company TEXT,
//         position TEXT,
//         created_at INTEGER NOT NULL,
//         updated_at INTEGER NOT NULL
//       );
//       CREATE INDEX IF NOT EXISTS idx_contacts_updated_at ON contacts(updated_at);
//       CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
//       CREATE INDEX IF NOT EXISTS idx_contacts_id ON contacts(id);
//     `);

//     // --- Accounts ---
//     db.exec(`
//       CREATE TABLE IF NOT EXISTS accounts (
//         id TEXT PRIMARY KEY,
//         name TEXT NOT NULL,
//         website TEXT,
//         phone TEXT,
//         created_at INTEGER NOT NULL,
//         updated_at INTEGER NOT NULL
//       );
//       CREATE INDEX IF NOT EXISTS idx_accounts_updated_at ON accounts(updated_at);
//       CREATE INDEX IF NOT EXISTS idx_accounts_name ON accounts(name);
//       CREATE INDEX IF NOT EXISTS idx_accounts_id ON accounts(id);
//     `);

//     // --- Deals ---
//     db.exec(`
//       CREATE TABLE IF NOT EXISTS deals (
//         id TEXT PRIMARY KEY,
//         title TEXT NOT NULL,
//         amount INTEGER,
//         stage TEXT NOT NULL,
//         account_id TEXT,
//         contact_id TEXT,
//         close_date INTEGER,
//         created_at INTEGER NOT NULL,
//         updated_at INTEGER NOT NULL
//       );
//       CREATE INDEX IF NOT EXISTS idx_deals_updated_at ON deals(updated_at);
//       CREATE INDEX IF NOT EXISTS idx_deals_account_id ON deals(account_id);
//       CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
//       CREATE INDEX IF NOT EXISTS idx_deals_id ON deals(id);
//     `);
//     db.exec(`UPDATE deals SET stage = 'nuevo' WHERE stage IS NULL;`);

//     // --- Activities ---
//     db.exec(`
//       CREATE TABLE IF NOT EXISTS activities (
//         id TEXT PRIMARY KEY,
//         type TEXT NOT NULL,
//         title TEXT NOT NULL,
//         due_date INTEGER,
//         status TEXT NOT NULL,
//         notes TEXT,
//         account_id TEXT,
//         contact_id TEXT,
//         lead_id TEXT,
//         deal_id TEXT,
//         created_at INTEGER NOT NULL,
//         updated_at INTEGER NOT NULL
//       );
//       CREATE INDEX IF NOT EXISTS idx_activities_updated_at ON activities(updated_at);
//       CREATE INDEX IF NOT EXISTS idx_activities_deal ON activities(deal_id);
//       CREATE INDEX IF NOT EXISTS idx_activities_contact ON activities(contact_id);
//       CREATE INDEX IF NOT EXISTS idx_activities_account ON activities(account_id);
//       CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities(lead_id);
//       CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);
//       CREATE INDEX IF NOT EXISTS idx_activities_id ON activities(id);
//     `);
//     db.exec(`UPDATE activities SET status = 'open' WHERE status IS NULL;`);

//     // --- Notes ---
//     db.exec(`
//       CREATE TABLE IF NOT EXISTS notes (
//         id TEXT PRIMARY KEY,
//         body TEXT NOT NULL,
//         account_id TEXT,
//         contact_id TEXT,
//         lead_id TEXT,
//         deal_id TEXT,
//         created_at INTEGER NOT NULL,
//         updated_at INTEGER NOT NULL
//       );
//       CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);
//       CREATE INDEX IF NOT EXISTS idx_notes_deal ON notes(deal_id);
//       CREATE INDEX IF NOT EXISTS idx_notes_contact ON notes(contact_id);
//       CREATE INDEX IF NOT EXISTS idx_notes_account ON notes(account_id);
//       CREATE INDEX IF NOT EXISTS idx_notes_lead ON notes(lead_id);
//       CREATE INDEX IF NOT EXISTS idx_notes_id ON notes(id);
//     `);

//     // --- Events (audit log) ---
//     db.exec(`
//       CREATE TABLE IF NOT EXISTS events (
//         id TEXT PRIMARY KEY,
//         type TEXT NOT NULL,
//         entity TEXT NOT NULL,
//         entity_id TEXT NOT NULL,
//         description TEXT NOT NULL,
//         actor TEXT,
//         meta TEXT,
//         created_at INTEGER NOT NULL
//       );
//       CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
//       CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity, entity_id);
//       CREATE INDEX IF NOT EXISTS idx_events_id ON events(id);
//     `);

//     db.exec("COMMIT");
//   } catch (e) {
//     db.exec("ROLLBACK");
//     throw e;
//   }
// }

// /** Núcleo multi-tenant (tenants / users / memberships) — idempotente y robusto. */
// function ensureTenantCore() {
//   db.exec("BEGIN");
//   try {
//     // 1) Crea tablas si faltan
//     db.exec(`
//       CREATE TABLE IF NOT EXISTS tenants (
//         id TEXT PRIMARY KEY,
//         name TEXT NOT NULL,
//         created_at INTEGER NOT NULL,
//         updated_at INTEGER NOT NULL
//       );

//       CREATE TABLE IF NOT EXISTS users (
//         id TEXT PRIMARY KEY,
//         email TEXT NOT NULL UNIQUE,
//         name TEXT,
//         password_hash TEXT NOT NULL,
//         created_at INTEGER NOT NULL,
//         updated_at INTEGER NOT NULL
//       );

//       CREATE TABLE IF NOT EXISTS memberships (
//         user_id TEXT NOT NULL,
//         tenant_id TEXT NOT NULL,
//         role TEXT NOT NULL,
//         created_at INTEGER NOT NULL,
//         PRIMARY KEY (user_id, tenant_id)
//       );
//     `);

//     // 2) Asegura columnas clave si la DB existía sin ellas
//     const ensureCol = (table, col, type, backfillFn) => {
//       const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
//       if (!cols.includes(col)) {
//         db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
//         if (typeof backfillFn === "function") backfillFn(table, col);
//       }
//     };

//     const backfillNow = (table, col) => {
//       const ts = Date.now();
//       db.exec(`UPDATE ${table} SET ${col} = ${ts} WHERE ${col} IS NULL`);
//     };

//     const backfillEmptyHash = () =>
//       db.exec(`UPDATE users SET password_hash = '' WHERE password_hash IS NULL`);

//     // --- tenants extras ---
//     ensureCol("tenants", "created_at", "INTEGER", backfillNow);
//     ensureCol("tenants", "updated_at", "INTEGER", backfillNow);
//     ensureCol("tenants", "created_by", "TEXT", () => {
//       db.exec(
//         `UPDATE tenants SET created_by = 'demo-admin' WHERE created_by IS NULL OR created_by = ''`
//       );
//     });

//     // --- users extras (perfil ampliado; todo opcional) ---
//     ensureCol("users", "created_at", "INTEGER", backfillNow);
//     ensureCol("users", "updated_at", "INTEGER", backfillNow);
//     ensureCol("users", "password_hash", "TEXT NOT NULL", backfillEmptyHash);

//     ensureCol("users", "avatar_url", "TEXT");
//     ensureCol("users", "headline", "TEXT");
//     ensureCol("users", "bio", "TEXT");
//     ensureCol("users", "location", "TEXT");
//     ensureCol("users", "company", "TEXT");
//     ensureCol("users", "website", "TEXT");
//     ensureCol("users", "twitter", "TEXT");
//     ensureCol("users", "linkedin", "TEXT");
//     ensureCol("users", "github", "TEXT");
//     ensureCol("users", "phone", "TEXT");
//     ensureCol("users", "timezone", "TEXT");
//     ensureCol("users", "last_login_at", "INTEGER");

//     // --- memberships extras ---
//     ensureCol("memberships", "created_at", "INTEGER", backfillNow);
//     ensureCol("memberships", "updated_at", "INTEGER", backfillNow);

//     // 3) Índices
//     db.exec(`
//       CREATE INDEX IF NOT EXISTS idx_tenants_updated_at ON tenants(updated_at);
//       CREATE INDEX IF NOT EXISTS idx_tenants_created_by ON tenants(created_by);

//       CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
//       CREATE INDEX IF NOT EXISTS idx_users_name ON users(name);

//       CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
//       CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON memberships(tenant_id);
//       CREATE INDEX IF NOT EXISTS idx_memberships_role ON memberships(role);
//     `);

//     // 4) Seeds mínimos
//     const ts = Date.now();
//     db.prepare(
//       `INSERT OR IGNORE INTO tenants (id, name, created_at, updated_at, created_by)
//        VALUES (?, ?, ?, ?, ?)`
//     ).run(DEFAULT_TENANT, "Demo", ts, ts, "demo-admin");

//     db.prepare(
//       `INSERT OR IGNORE INTO users (id, email, name, password_hash, created_at, updated_at)
//        VALUES (?, ?, ?, ?, ?, ?)`
//     ).run("demo-admin", "admin@demo.local", "Demo Admin", "", ts, ts);

//     db.prepare(
//       `INSERT OR IGNORE INTO memberships (user_id, tenant_id, role, created_at, updated_at)
//        VALUES (?, ?, ?, ?, ?)`
//     ).run("demo-admin", DEFAULT_TENANT, "owner", ts, ts);

//     db.exec("COMMIT");
//   } catch (e) {
//     db.exec("ROLLBACK");
//     throw e;
//   }
// }

// /** ALTER idempotente: agrega contacts.account_id + índice si no existe. */
// function ensureContactsAccountId() {
//   if (!hasColumn("contacts", "account_id")) {
//     db.exec("BEGIN");
//     try {
//       db.exec(`ALTER TABLE contacts ADD COLUMN account_id TEXT`);
//       db.exec(`CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts(account_id)`);
//       db.exec("COMMIT");
//     } catch (e) {
//       db.exec("ROLLBACK");
//       throw e;
//     }
//   }
// }

// /**
//  * 🔑 ALTER idempotente: agrega tenant_id a todas las tablas si falta,
//  * indexa y backfill DEFAULT_TENANT.
//  */
// function ensureTenantColumns() {
//   const tables = ["leads", "contacts", "accounts", "deals", "activities", "notes", "events"];

//   db.exec("BEGIN");
//   try {
//     for (const t of tables) {
//       if (!hasColumn(t, "tenant_id")) {
//         db.exec(`ALTER TABLE ${t} ADD COLUMN tenant_id TEXT`);
//         db.exec(`UPDATE ${t} SET tenant_id = '${DEFAULT_TENANT}' WHERE tenant_id IS NULL`);
//       }

//       db.exec(`CREATE INDEX IF NOT EXISTS idx_${t}_tenant ON ${t}(tenant_id)`);

//       const idxs = {
//         leads: [
//           `CREATE INDEX IF NOT EXISTS idx_leads_tenant_updated ON leads(tenant_id, updated_at)`,
//           `CREATE INDEX IF NOT EXISTS idx_leads_tenant_id ON leads(tenant_id, id)`,
//           `CREATE INDEX IF NOT EXISTS idx_leads_tenant_status ON leads(tenant_id, status)`,
//         ],
//         contacts: [
//           `CREATE INDEX IF NOT EXISTS idx_contacts_tenant_updated ON contacts(tenant_id, updated_at)`,
//           `CREATE INDEX IF NOT EXISTS idx_contacts_tenant_id ON contacts(tenant_id, id)`,
//           `CREATE INDEX IF NOT EXISTS idx_contacts_tenant_email ON contacts(tenant_id, email)`,
//           `CREATE INDEX IF NOT EXISTS idx_contacts_tenant_account ON contacts(tenant_id, account_id)`,
//         ],
//         accounts: [
//           `CREATE INDEX IF NOT EXISTS idx_accounts_tenant_updated ON accounts(tenant_id, updated_at)`,
//           `CREATE INDEX IF NOT EXISTS idx_accounts_tenant_id ON accounts(tenant_id, id)`,
//           `CREATE INDEX IF NOT EXISTS idx_accounts_tenant_name ON accounts(tenant_id, name)`,
//         ],
//         deals: [
//           `CREATE INDEX IF NOT EXISTS idx_deals_tenant_updated ON deals(tenant_id, updated_at)`,
//           `CREATE INDEX IF NOT EXISTS idx_deals_tenant_id ON deals(tenant_id, id)`,
//           `CREATE INDEX IF NOT EXISTS idx_deals_tenant_stage ON deals(tenant_id, stage)`,
//           `CREATE INDEX IF NOT EXISTS idx_deals_tenant_account ON deals(tenant_id, account_id)`,
//           `CREATE INDEX IF NOT EXISTS idx_deals_tenant_contact ON deals(tenant_id, contact_id)`,
//         ],
//         activities: [
//           `CREATE INDEX IF NOT EXISTS idx_activities_tenant_updated ON activities(tenant_id, updated_at)`,
//           `CREATE INDEX IF NOT EXISTS idx_activities_tenant_id ON activities(tenant_id, id)`,
//           `CREATE INDEX IF NOT EXISTS idx_activities_tenant_status ON activities(tenant_id, status)`,
//           `CREATE INDEX IF NOT EXISTS idx_activities_tenant_deal ON activities(tenant_id, deal_id)`,
//           `CREATE INDEX IF NOT EXISTS idx_activities_tenant_contact ON activities(tenant_id, contact_id)`,
//           `CREATE INDEX IF NOT EXISTS idx_activities_tenant_account ON activities(tenant_id, account_id)`,
//           `CREATE INDEX IF NOT EXISTS idx_activities_tenant_lead ON activities(tenant_id, lead_id)`,
//         ],
//         notes: [
//           `CREATE INDEX IF NOT EXISTS idx_notes_tenant_updated ON notes(tenant_id, updated_at)`,
//           `CREATE INDEX IF NOT EXISTS idx_notes_tenant_id ON notes(tenant_id, id)`,
//           `CREATE INDEX IF NOT EXISTS idx_notes_tenant_deal ON notes(tenant_id, deal_id)`,
//           `CREATE INDEX IF NOT EXISTS idx_notes_tenant_contact ON notes(tenant_id, contact_id)`,
//           `CREATE INDEX IF NOT EXISTS idx_notes_tenant_account ON notes(tenant_id, account_id)`,
//           `CREATE INDEX IF NOT EXISTS idx_notes_tenant_lead ON notes(tenant_id, lead_id)`,
//         ],
//         events: [
//           `CREATE INDEX IF NOT EXISTS idx_events_tenant_created ON events(tenant_id, created_at)`,
//           `CREATE INDEX IF NOT EXISTS idx_events_tenant_entity ON events(tenant_id, entity, entity_id, created_at)`,
//           `CREATE INDEX IF NOT EXISTS idx_events_tenant_id ON events(tenant_id, id)`,
//         ],
//       };

//       for (const sql of idxs[t] || []) db.exec(sql);
//     }
//     db.exec("COMMIT");
//   } catch (e) {
//     db.exec("ROLLBACK");
//     throw e;
//   }
// }

// module.exports = {
//   runMigrations,
//   ensureContactsAccountId,
//   ensureTenantColumns,
//   ensureTenantCore,
// };

