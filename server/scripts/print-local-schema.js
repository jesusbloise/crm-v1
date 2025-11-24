// server/scripts/print-local-schema.js
require("dotenv").config();
const { Pool } = require("pg");

/**
 * 🔧 PRIORIDAD:
 * 1) Usa PGHOST / PGUSER / etc si están en el .env
 * 2) Si no, usa DATABASE_URL
 * 3) Si tampoco, usa tu fallback local
 */

const LOCAL_DB_URL =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}` ||
  "postgresql://postgres:atomica@localhost:5432/crm-v1";

const pool = new Pool({ connectionString: LOCAL_DB_URL });

async function main() {
  const client = await pool.connect();
  try {
    console.log("📦 Conectado a:", LOCAL_DB_URL.replace(/:[^:@]+@/, ':***@'));

    // ================================
    // LISTA DE TABLAS
    // ================================
    const tablesRes = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log("\n📋 Tablas en 'public':");
    for (const row of tablesRes.rows) {
      console.log(" -", row.table_name);
    }

    // ================================
    // COLUMNAS DE CADA TABLA
    // ================================
    const colsRes = await client.query(`
      SELECT 
        table_name,
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position;
    `);

    console.log("\n📑 Columnas por tabla:\n");
    let currentTable = null;
    for (const row of colsRes.rows) {
      if (row.table_name !== currentTable) {
        currentTable = row.table_name;
        console.log(`\n🔹 ${currentTable}`);
      }
      console.log(
        `   - ${row.column_name} :: ${row.data_type}` +
        ` | nullable=${row.is_nullable}` +
        (row.column_default ? ` | default=${row.column_default}` : "")
      );
    }
  } catch (err) {
    console.error("❌ Error consultando esquema:", err);
  } finally {
    await pool.end();
  }
}

main();
