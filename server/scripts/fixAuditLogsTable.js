// scripts/fixAuditLogsTable.js
require("dotenv").config();
const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL || 
  `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;

const pool = new Pool({ connectionString: DATABASE_URL });

async function fixAuditLogsTable() {
  const client = await pool.connect();
  try {
    console.log("🔍 Verificando tabla audit_logs...");
    
    // 1. Ver el esquema actual
    const schemaCheck = await client.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'audit_logs'
      ORDER BY ordinal_position;
    `);
    
    console.log("\n📊 Esquema actual de audit_logs:");
    schemaCheck.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}${col.character_maximum_length ? `(${col.character_maximum_length})` : ''}`);
    });
    
    // 2. Verificar si created_at es INTEGER
    const createdAtCol = schemaCheck.rows.find(r => r.column_name === 'created_at');
    
    if (createdAtCol && createdAtCol.data_type === 'integer') {
      console.log("\n⚠️  created_at es INTEGER, necesita ser BIGINT");
      console.log("🔧 Recreando tabla con BIGINT...");
      
      // 3. Hacer backup de datos existentes
      const backupResult = await client.query("SELECT COUNT(*) FROM audit_logs");
      const count = parseInt(backupResult.rows[0].count);
      console.log(`📦 ${count} registros encontrados`);
      
      // 4. Eliminar y recrear la tabla
      await client.query("BEGIN");
      
      await client.query("DROP TABLE IF EXISTS audit_logs CASCADE");
      console.log("✅ Tabla audit_logs eliminada");
      
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
      console.log("✅ Tabla audit_logs recreada con BIGINT");
      
      // Recrear índices
      await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_user_tenant ON audit_logs(user_id, tenant_id, created_at DESC);`);
      console.log("✅ Índices recreados");
      
      await client.query("COMMIT");
      console.log("\n✅ Tabla audit_logs corregida exitosamente");
      
    } else if (createdAtCol && createdAtCol.data_type === 'bigint') {
      console.log("\n✅ created_at ya es BIGINT - Todo correcto");
    } else {
      console.log("\n❌ No se encontró la columna created_at");
    }
    
    // 5. Verificar esquema final
    const finalSchema = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'audit_logs' AND column_name = 'created_at';
    `);
    
    if (finalSchema.rows.length > 0) {
      console.log(`\n🎯 Tipo final de created_at: ${finalSchema.rows[0].data_type.toUpperCase()}`);
    }
    
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error:", err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

fixAuditLogsTable();
