// server/db/migrate-pg.js
const { pool } = require("./connection");
const fs = require("fs");
const path = require("path");

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
    // 🔄 Asegurar columna assigned_to incluso si la tabla ya existía antes
    await client.query(`
      ALTER TABLE activities
      ADD COLUMN IF NOT EXISTS assigned_to TEXT;
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_activities_updated_at ON activities(updated_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_activities_remind_at ON activities(remind_at_ms);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_activities_tenant ON activities(tenant_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_activities_tenant_remind ON activities(tenant_id, remind_at_ms);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_activities_created_by ON activities(created_by);`);
    // 👇 NUEVO índice para asignaciones (por tenant + usuario asignado)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_activities_assigned_to
      ON activities(tenant_id, assigned_to);
    `);

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
    // TABLA DE CONTROL DE MIGRACIONES
    // ========================================
    
    // Tabla: migrations_log
    // Registra qué archivos .sql se han ejecutado
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations_log (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at BIGINT NOT NULL
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_migrations_filename ON migrations_log(filename);`);

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

/**
 * 📦 EJECUTA MIGRACIONES SQL AUTOMÁTICAS
 * - Lee archivos .sql de la carpeta migrations/
 * - Ejecuta solo los que no están en migrations_log
 * - Idempotente: puede ejecutarse múltiples veces sin problemas
 */
async function runSQLMigrations() {
  const client = await pool.connect();
  
  try {
    const migrationsDir = path.join(__dirname, 'migrations');
    
    // Verificar si existe la carpeta
    if (!fs.existsSync(migrationsDir)) {
      console.log('📁 No existe carpeta migrations/, saltando migraciones SQL');
      return;
    }
    
    // Leer archivos .sql y ordenarlos
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Los archivos deben tener formato: 001_name.sql, 002_name.sql, etc.
    
    if (files.length === 0) {
      console.log('📦 No hay archivos .sql en migrations/');
      return;
    }
    
    console.log(`📦 Encontrados ${files.length} archivos de migración SQL`);
    
    for (const file of files) {
      // Verificar si ya fue ejecutado
      const exists = await client.query(
        'SELECT 1 FROM migrations_log WHERE filename = $1 LIMIT 1',
        [file]
      );
      
      if (exists.rows.length > 0) {
        console.log(`⏭️  Saltando ${file} (ya aplicada)`);
        continue;
      }
      
      // Ejecutar migración
      console.log(`🔄 Ejecutando migración: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO migrations_log (filename, applied_at) VALUES ($1, $2)',
          [file, Date.now()]
        );
        await client.query('COMMIT');
        console.log(`✅ Migración aplicada: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ Error ejecutando ${file}:`, err.message);
        throw err;
      }
    }
    
    console.log('✅ Todas las migraciones SQL completadas');
    
  } catch (err) {
    console.error('❌ Error en runSQLMigrations:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { runMigrations, runSQLMigrations };


// // server/db/seed.js
// const db = require("./connection");

// const DEFAULT_TENANT = process.env.DEFAULT_TENANT || "demo";

// function nowPlus(minutes) {
//   return Date.now() + minutes * 60 * 1000;
// }

// function upsertActivity(a) {
//   const exists = db
//     .prepare(`SELECT 1 FROM activities WHERE id = ? AND tenant_id = ? LIMIT 1`)
//     .get(a.id, a.tenant_id);
//   const ts = Date.now();
//   if (exists) {
//     db.prepare(
//       `
//       UPDATE activities SET
//         type=?, title=?, due_date=?, remind_at_ms=?, status=?, notes=?,
//         account_id=?, contact_id=?, lead_id=?, deal_id=?, updated_at=?
//       WHERE id=? AND tenant_id=?
//     `
//     ).run(
//       a.type, a.title, a.due_date ?? null, a.remind_at_ms ?? null, a.status, a.notes ?? null,
//       a.account_id ?? null, a.contact_id ?? null, a.lead_id ?? null, a.deal_id ?? null,
//       ts, a.id, a.tenant_id
//     );
//   } else {
//     db.prepare(
//       `
//       INSERT INTO activities (
//         id, type, title, due_date, remind_at_ms, status, notes,
//         account_id, contact_id, lead_id, deal_id,
//         tenant_id, created_at, updated_at
//       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
//     `
//     ).run(
//       a.id, a.type, a.title, a.due_date ?? null, a.remind_at_ms ?? null, a.status, a.notes ?? null,
//       a.account_id ?? null, a.contact_id ?? null, a.lead_id ?? null, a.deal_id ?? null,
//       a.tenant_id, ts, ts
//     );
//   }
// }

// function run() {
//   db.exec("BEGIN");
//   try {
//     // Asegura tenant base
//     const t = db
//       .prepare(`SELECT 1 FROM tenants WHERE id = ? LIMIT 1`)
//       .get(DEFAULT_TENANT);
//     if (!t) {
//       const ts = Date.now();
//       db.prepare(
//         `INSERT INTO tenants (id, name, created_at, updated_at, created_by) VALUES (?,?,?,?,?)`
//       ).run(DEFAULT_TENANT, "Demo", ts, ts, "seed");
//     }

//     // Datos demo (10 y 30 min al futuro)
//     const items = [
//       {
//         id: "seed-call-001",
//         type: "call",
//         title: "Llamar a cliente demo",
//         due_date: null,
//         remind_at_ms: nowPlus(10),
//         status: "open",
//         notes: "Hablar sobre propuesta",
//         account_id: null,
//         contact_id: null,
//         lead_id: null,
//         deal_id: null,
//         tenant_id: DEFAULT_TENANT,
//       },
//       {
//         id: "seed-task-002",
//         type: "task",
//         title: "Enviar cotización",
//         due_date: null,
//         remind_at_ms: nowPlus(30),
//         status: "open",
//         notes: "Adjuntar PDF",
//         account_id: null,
//         contact_id: null,
//         lead_id: null,
//         deal_id: null,
//         tenant_id: DEFAULT_TENANT,
//       },
//       {
//         id: "seed-note-003",
//         type: "note",
//         title: "Nota de seguimiento",
//         due_date: null,
//         remind_at_ms: nowPlus(1), // dispara rápido para probar
//         status: "open",
//         notes: "Recordar puntos clave",
//         account_id: null,
//         contact_id: null,
//         lead_id: null,
//         deal_id: null,
//         tenant_id: DEFAULT_TENANT,
//       },
//     ];

//     items.forEach(upsertActivity);

//     db.exec("COMMIT");
//     console.log("✅ Seed de activities insertado/actualizado");
//   } catch (e) {
//     db.exec("ROLLBACK");
//     console.error("❌ Seed falló:", e);
//     process.exitCode = 1;
//   }
// }

// run();
