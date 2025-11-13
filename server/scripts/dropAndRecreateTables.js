// scripts/dropAndRecreateTables.js
require("dotenv").config();
const { pool } = require("../db/connection");

async function dropAndRecreateTables() {
  const client = await pool.connect();
  try {
    console.log("🔧 Eliminando y recreando tablas problemáticas...\n");
    
    await client.query("BEGIN");
    
    // Eliminar audit_logs (tiene INTEGER en lugar de BIGINT)
    console.log("1. Eliminando tabla audit_logs...");
    await client.query("DROP TABLE IF EXISTS audit_logs CASCADE");
    console.log("   ✅ Tabla audit_logs eliminada\n");
    
    // Recrear audit_logs con BIGINT
    console.log("2. Recreando tabla audit_logs con BIGINT...");
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
    
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_user_tenant ON audit_logs(user_id, tenant_id, created_at DESC);`);
    console.log("   ✅ Tabla audit_logs recreada con BIGINT\n");
    
    await client.query("COMMIT");
    
    // Verificar
    const verify = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'audit_logs' AND column_name = 'created_at';
    `);
    
    console.log("3. Verificando...");
    if (verify.rows.length > 0) {
      console.log(`   ✅ created_at: ${verify.rows[0].data_type.toUpperCase()}`);
    }
    
    console.log("\n✅ ¡Todo listo! El servidor puede reiniciarse ahora.");
    
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error:", err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

dropAndRecreateTables();
