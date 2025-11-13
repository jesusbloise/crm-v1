// scripts/forceFixAuditLogs.js
require("dotenv").config();
const { Pool } = require("pg");

// Construir URL directamente desde .env
const host = process.env.PGHOST || 'localhost';
const port = process.env.PGPORT || 5432;
const user = process.env.PGUSER || 'postgres';
const password = process.env.PGPASSWORD || 'postgres';
const database = process.env.PGDATABASE || 'crm_db';

const DATABASE_URL = `postgresql://${user}:${password}@${host}:${port}/${database}`;

console.log("🔧 FORZANDO RECREACIÓN DE TABLA audit_logs\n");
console.log("📋 Conectando a:", DATABASE_URL.replace(/:[^:@]+@/, ':****@'));
console.log("");

const pool = new Pool({ 
  connectionString: DATABASE_URL,
  ssl: false
});

async function forceFixAuditLogs() {
  const client = await pool.connect();
  
  try {
    // 1. Verificar base de datos actual
    const dbCheck = await client.query("SELECT current_database()");
    console.log(`✅ Conectado a base de datos: ${dbCheck.rows[0].current_database}\n`);
    
    // 2. Ver esquema actual de audit_logs
    console.log("🔍 Esquema ANTES del cambio:");
    const beforeSchema = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'audit_logs'
      ORDER BY ordinal_position;
    `);
    
    if (beforeSchema.rows.length === 0) {
      console.log("   ⚠️  Tabla audit_logs NO EXISTE\n");
    } else {
      beforeSchema.rows.forEach(col => {
        const marker = col.column_name === 'created_at' 
          ? (col.data_type === 'bigint' ? ' ✅ CORRECTO' : ' ❌ PROBLEMA')
          : '';
        console.log(`   ${col.column_name}: ${col.data_type}${marker}`);
      });
      console.log("");
    }
    
    // 3. FORZAR recreación
    console.log("🔨 ELIMINANDO tabla audit_logs...");
    await client.query("DROP TABLE IF EXISTS audit_logs CASCADE");
    console.log("   ✅ Tabla eliminada\n");
    
    console.log("🔨 CREANDO tabla audit_logs con BIGINT...");
    await client.query(`
      CREATE TABLE audit_logs (
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
    console.log("   ✅ Tabla creada\n");
    
    console.log("🔨 CREANDO índices...");
    await client.query(`CREATE INDEX idx_audit_user ON audit_logs(user_id);`);
    await client.query(`CREATE INDEX idx_audit_tenant ON audit_logs(tenant_id);`);
    await client.query(`CREATE INDEX idx_audit_action ON audit_logs(action);`);
    await client.query(`CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);`);
    await client.query(`CREATE INDEX idx_audit_user_tenant ON audit_logs(user_id, tenant_id, created_at DESC);`);
    console.log("   ✅ Índices creados\n");
    
    // 4. Verificar resultado final
    console.log("🔍 Esquema DESPUÉS del cambio:");
    const afterSchema = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'audit_logs'
      ORDER BY ordinal_position;
    `);
    
    afterSchema.rows.forEach(col => {
      const marker = col.column_name === 'created_at' 
        ? (col.data_type === 'bigint' ? ' ✅ CORRECTO' : ' ❌ TODAVÍA MAL')
        : '';
      console.log(`   ${col.column_name}: ${col.data_type}${marker}`);
    });
    
    console.log("\n✅ ¡COMPLETADO! Reinicia el servidor con Ctrl+C y npm run dev\n");
    
  } catch (err) {
    console.error("\n❌ ERROR:", err.message);
    console.error("\nDetalles:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

forceFixAuditLogs();
