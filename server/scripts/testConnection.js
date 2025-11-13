// scripts/testConnection.js
require("dotenv").config();
const { Pool } = require("pg");

console.log("📋 Variables de entorno:");
console.log("  PGHOST:", process.env.PGHOST);
console.log("  PGPORT:", process.env.PGPORT);
console.log("  PGUSER:", process.env.PGUSER);
console.log("  PGPASSWORD:", process.env.PGPASSWORD ? "***" + process.env.PGPASSWORD.slice(-4) : "NO CONFIGURADA");
console.log("  PGDATABASE:", process.env.PGDATABASE);
console.log("");

const DATABASE_URL = process.env.DATABASE_URL || 
  `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;

console.log("🔗 URL de conexión:");
console.log("  ", DATABASE_URL.replace(/:[^:@]+@/, ':****@'));
console.log("");

const pool = new Pool({ connectionString: DATABASE_URL });

async function test() {
  try {
    const client = await pool.connect();
    console.log("✅ Conexión exitosa!");
    
    const result = await client.query("SELECT current_database(), current_user, version()");
    console.log("\n📊 Información de la conexión:");
    console.log("  Base de datos:", result.rows[0].current_database);
    console.log("  Usuario:", result.rows[0].current_user);
    console.log("  Versión:", result.rows[0].version.split('\n')[0]);
    
    // Listar todas las tablas
    const tables = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename;
    `);
    
    console.log("\n📋 Tablas en la base de datos:");
    tables.rows.forEach(t => console.log(`  - ${t.tablename}`));
    
    // Verificar audit_logs
    const auditCheck = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'audit_logs'
      ORDER BY ordinal_position;
    `);
    
    if (auditCheck.rows.length > 0) {
      console.log("\n🔍 Esquema de audit_logs:");
      auditCheck.rows.forEach(col => {
        const marker = col.column_name === 'created_at' 
          ? (col.data_type === 'bigint' ? ' ✅' : ' ❌ PROBLEMA')
          : '';
        console.log(`  - ${col.column_name}: ${col.data_type}${marker}`);
      });
    } else {
      console.log("\n⚠️  Tabla audit_logs NO EXISTE");
    }
    
    client.release();
    await pool.end();
  } catch (err) {
    console.error("\n❌ Error de conexión:");
    console.error("  ", err.message);
    process.exit(1);
  }
}

test();
