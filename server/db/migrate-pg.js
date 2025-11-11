// server/db/migrate-pg.js
/**
 * 🐘 Migraciones para PostgreSQL (Railway)
 * Compatible con el formato de SQLite pero usando sintaxis de Postgres
 */

const db = require("./connection");
const DEFAULT_TENANT = process.env.DEFAULT_TENANT || "demo";

async function runMigrations() {
  const client = await db.prepare("SELECT 1").get(); // Warm up connection
  
  console.log("🐘 Ejecutando migraciones de PostgreSQL...");

  // Tenants
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      created_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tenants_updated_at ON tenants(updated_at);
    CREATE INDEX IF NOT EXISTS idx_tenants_created_by ON tenants(created_by);
  `);

  // Users
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      password_hash TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      avatar_url TEXT,
      headline TEXT,
      bio TEXT,
      location TEXT,
      company TEXT,
      website TEXT,
      twitter TEXT,
      linkedin TEXT,
      github TEXT,
      phone TEXT,
      timezone TEXT,
      last_login_at BIGINT,
      google_email TEXT,
      google_refresh_token TEXT,
      google_calendar_id TEXT,
      google_ics_url TEXT,
      google_connected_at BIGINT,
      is_active INTEGER DEFAULT 1,
      active INTEGER DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_name ON users(name);
    CREATE INDEX IF NOT EXISTS idx_users_google_email ON users(google_email);
  `);

  // Memberships
  await db.exec(`
    CREATE TABLE IF NOT EXISTS memberships (
      user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, tenant_id)
    );
    CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
    CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON memberships(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_memberships_role ON memberships(role);
  `);

  // Leads
  await db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      company TEXT,
      status TEXT,
      tenant_id TEXT,
      created_by TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_leads_updated_at ON leads(updated_at);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_leads_created_by ON leads(created_by);
  `);

  // Contacts
  await db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      company TEXT,
      position TEXT,
      account_id TEXT,
      tenant_id TEXT,
      created_by TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_contacts_updated_at ON contacts(updated_at);
    CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
    CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts(account_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_created_by ON contacts(created_by);
  `);

  // Accounts
  await db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      website TEXT,
      phone TEXT,
      tenant_id TEXT,
      created_by TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_updated_at ON accounts(updated_at);
    CREATE INDEX IF NOT EXISTS idx_accounts_name ON accounts(name);
    CREATE INDEX IF NOT EXISTS idx_accounts_tenant ON accounts(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_created_by ON accounts(created_by);
  `);

  // Deals
  await db.exec(`
    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      amount BIGINT,
      stage TEXT NOT NULL,
      account_id TEXT,
      contact_id TEXT,
      close_date BIGINT,
      tenant_id TEXT,
      created_by TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_deals_updated_at ON deals(updated_at);
    CREATE INDEX IF NOT EXISTS idx_deals_account_id ON deals(account_id);
    CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
    CREATE INDEX IF NOT EXISTS idx_deals_tenant ON deals(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_deals_created_by ON deals(created_by);
  `);

  // Activities
  await db.exec(`
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      due_date BIGINT,
      remind_at_ms BIGINT,
      status TEXT NOT NULL,
      notes TEXT,
      account_id TEXT,
      contact_id TEXT,
      lead_id TEXT,
      deal_id TEXT,
      tenant_id TEXT,
      created_by TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_activities_updated_at ON activities(updated_at);
    CREATE INDEX IF NOT EXISTS idx_activities_deal ON activities(deal_id);
    CREATE INDEX IF NOT EXISTS idx_activities_contact ON activities(contact_id);
    CREATE INDEX IF NOT EXISTS idx_activities_account ON activities(account_id);
    CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities(lead_id);
    CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);
    CREATE INDEX IF NOT EXISTS idx_activities_remind_at ON activities(remind_at_ms);
    CREATE INDEX IF NOT EXISTS idx_activities_tenant ON activities(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_activities_created_by ON activities(created_by);
  `);

  // Notes
  await db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      body TEXT NOT NULL,
      account_id TEXT,
      contact_id TEXT,
      lead_id TEXT,
      deal_id TEXT,
      tenant_id TEXT,
      created_by TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);
    CREATE INDEX IF NOT EXISTS idx_notes_deal ON notes(deal_id);
    CREATE INDEX IF NOT EXISTS idx_notes_contact ON notes(contact_id);
    CREATE INDEX IF NOT EXISTS idx_notes_account ON notes(account_id);
    CREATE INDEX IF NOT EXISTS idx_notes_lead ON notes(lead_id);
    CREATE INDEX IF NOT EXISTS idx_notes_tenant ON notes(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_notes_created_by ON notes(created_by);
  `);

  // Events
  await db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      description TEXT NOT NULL,
      actor TEXT,
      meta TEXT,
      tenant_id TEXT,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
    CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity, entity_id);
    CREATE INDEX IF NOT EXISTS idx_events_tenant ON events(tenant_id);
  `);

  // Seeds mínimos
  const ts = Date.now();
  await db.prepare(`
    INSERT INTO tenants (id, name, created_at, updated_at, created_by)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (id) DO NOTHING
  `).run(DEFAULT_TENANT, "Demo", ts, ts, "demo-admin");

  await db.prepare(`
    INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO NOTHING
  `).run("demo-admin", "admin@demo.local", "Demo Admin", "", ts, ts);

  await db.prepare(`
    INSERT INTO memberships (user_id, tenant_id, role, created_at)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, tenant_id) DO NOTHING
  `).run("demo-admin", DEFAULT_TENANT, "owner", ts);

  console.log("✅ Migraciones de PostgreSQL completadas");
}

module.exports = { runMigrations };
