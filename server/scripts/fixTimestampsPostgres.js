#!/usr/bin/env node
/**
 * 🔧 FIX: Convertir columnas de timestamps de INTEGER a BIGINT en PostgreSQL
 * Ejecutar solo UNA VEZ después de que las tablas ya existen
 */

require("dotenv").config();
const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL no está configurada");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("railway.app") || DATABASE_URL.includes("render.com")
    ? { rejectUnauthorized: false }
    : false,
});

async function fixTimestamps() {
  const client = await pool.connect();
  
  try {
    console.log("\n🔧 Convirtiendo timestamps de INTEGER a BIGINT...\n");

    const tables = [
      { name: "tenants", columns: ["created_at", "updated_at"] },
      { name: "users", columns: ["created_at", "updated_at", "last_login_at", "google_connected_at"] },
      { name: "memberships", columns: ["created_at"] },
      { name: "leads", columns: ["created_at", "updated_at"] },
      { name: "contacts", columns: ["created_at", "updated_at"] },
      { name: "accounts", columns: ["created_at", "updated_at"] },
      { name: "deals", columns: ["created_at", "updated_at", "close_date"] },
      { name: "activities", columns: ["created_at", "updated_at", "due_date", "remind_at_ms"] },
      { name: "notes", columns: ["created_at", "updated_at"] },
      { name: "events", columns: ["created_at"] },
    ];

    for (const table of tables) {
      console.log(`📋 Tabla: ${table.name}`);
      
      for (const column of table.columns) {
        try {
          // Verificar si la columna existe
          const checkColumn = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = $1 AND column_name = $2
          `, [table.name, column]);

          if (checkColumn.rows.length === 0) {
            console.log(`  ⏭️  ${column}: no existe, saltando...`);
            continue;
          }

          const currentType = checkColumn.rows[0].data_type;
          
          if (currentType === "bigint") {
            console.log(`  ✅ ${column}: ya es BIGINT`);
            continue;
          }

          // Convertir a BIGINT
          await client.query(`
            ALTER TABLE ${table.name} 
            ALTER COLUMN ${column} TYPE BIGINT
          `);
          
          console.log(`  ✅ ${column}: ${currentType} → BIGINT`);
        } catch (err) {
          console.error(`  ❌ ${column}: ${err.message}`);
        }
      }
      
      console.log("");
    }

    console.log("✅ Conversión completada!\n");
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

fixTimestamps();
