// server/db/migrate-pg.js
const { pool } = require("./connection");

/**
 * 🐘 MIGRACIONES POSTGRESQL
 * - Crea todas las tablas necesarias
 * - Usa BIGINT para timestamps (Date.now() > 2^31)
 * - Compatible con sintaxis PostgreSQL
 */

async function runMigrations() {
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");

    // ========================================
    // TABLAS PRINCIPALES
    // ========================================

    // Tabla: leads
    await client.query(`
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
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_leads_updated_at ON leads(updated_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_leads_tenant_updated ON leads(tenant_id, updated_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_leads_created_by ON leads(created_by);`);

    // Tabla: contacts
    await client.query(`
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
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_contacts_updated_at ON contacts(updated_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_contacts_tenant_account ON contacts(tenant_id, account_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_contacts_created_by ON contacts(created_by);`);

    // Tabla: accounts
    await client.query(`
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
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_accounts_updated_at ON accounts(updated_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_accounts_name ON accounts(name);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_accounts_tenant ON accounts(tenant_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_accounts_created_by ON accounts(created_by);`);

    // Tabla: deals
    await client.query(`
      CREATE TABLE IF NOT EXISTS deals (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        amount BIGINT,
        stage TEXT NOT NULL DEFAULT 'nuevo',
        account_id TEXT,
        contact_id TEXT,
        close_date BIGINT,
        tenant_id TEXT,
        created_by TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_deals_updated_at ON deals(updated_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_deals_account_id ON deals(account_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_deals_tenant ON deals(tenant_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_deals_tenant_stage ON deals(tenant_id, stage);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_deals_created_by ON deals(created_by);`);

    // Tabla: activities
    await client.query(`
      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        due_date BIGINT,
        remind_at_ms BIGINT,
        status TEXT NOT NULL DEFAULT 'open',
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
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_activities_updated_at ON activities(updated_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_activities_remind_at ON activities(remind_at_ms);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_activities_tenant ON activities(tenant_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_activities_tenant_remind ON activities(tenant_id, remind_at_ms);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_activities_created_by ON activities(created_by);`);

    // Tabla: notes
    await client.query(`
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
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notes_tenant ON notes(tenant_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notes_created_by ON notes(created_by);`);

    // Tabla: events
    await client.query(`
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
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity, entity_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_events_tenant ON events(tenant_id);`);

    // ========================================
    // MULTI-TENANCY
    // ========================================

    // Tabla: tenants
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_by TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tenants_updated_at ON tenants(updated_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tenants_created_by ON tenants(created_by);`);

    // Tabla: users
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        password_hash TEXT NOT NULL,
        active BOOLEAN DEFAULT true,
        google_ics_url TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_name ON users(name);`);

    // Tabla: memberships
    await client.query(`
      CREATE TABLE IF NOT EXISTS memberships (
        user_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT,
        PRIMARY KEY (user_id, tenant_id)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON memberships(tenant_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_memberships_role ON memberships(role);`);

    // Tabla: audit_logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        tenant_id TEXT,
        action TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at BIGINT NOT NULL
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);`);

    // ========================================
    // DATOS INICIALES
    // ========================================

    // Tenant demo
    const tenantExists = await client.query(
      `SELECT 1 FROM tenants WHERE id = $1 LIMIT 1`,
      ['demo']
    );
    
    if (tenantExists.rows.length === 0) {
      const now = Date.now();
      await client.query(
        `INSERT INTO tenants (id, name, created_at, updated_at, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        ['demo', 'Demo', now, now, 'demo-admin']
      );
      
      await client.query(
        `INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['demo-admin', 'admin@demo.local', 'Demo Admin', '', now, now]
      );
      
      await client.query(
        `INSERT INTO memberships (user_id, tenant_id, role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)`,
        ['demo-admin', 'demo', 'owner', now, now]
      );
      
      console.log('✅ Tenant demo creado');
    }

    await client.query("COMMIT");
    console.log("✅ Migraciones PostgreSQL completadas");
    
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error en migraciones PostgreSQL:", err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };
