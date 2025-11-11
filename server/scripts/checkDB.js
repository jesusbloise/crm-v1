// server/scripts/checkDB.js
/**
 * Script para verificar qué hay en la base de datos de Railway
 */

require("dotenv").config();
const db = require("../db/connection");

const USE_POSTGRES = !!process.env.DATABASE_URL;

async function check() {
  console.log(`\n🔍 Verificando base de datos (${USE_POSTGRES ? "PostgreSQL" : "SQLite"})...\n`);

  try {
    let users, tenants, memberships;

    if (USE_POSTGRES) {
      users = await db.prepare("SELECT id, email, name FROM users ORDER BY email").all();
      tenants = await db.prepare("SELECT id, name, created_by FROM tenants ORDER BY id").all();
      memberships = await db.prepare(`
        SELECT m.user_id, u.email, m.tenant_id, t.name as workspace, m.role
        FROM memberships m
        JOIN users u ON u.id = m.user_id
        JOIN tenants t ON t.id = m.tenant_id
        ORDER BY u.email, t.name
      `).all();
    } else {
      users = db.prepare("SELECT id, email, name FROM users ORDER BY email").all();
      tenants = db.prepare("SELECT id, name, created_by FROM tenants ORDER BY id").all();
      memberships = db.prepare(`
        SELECT m.user_id, u.email, m.tenant_id, t.name as workspace, m.role
        FROM memberships m
        JOIN users u ON u.id = m.user_id
        JOIN tenants t ON t.id = m.tenant_id
        ORDER BY u.email, t.name
      `).all();
    }

    console.log("👤 USUARIOS:");
    console.table(users);

    console.log("\n📁 WORKSPACES:");
    console.table(tenants);

    console.log("\n🔗 MEMBERSHIPS:");
    console.table(memberships);

    console.log("\n📊 RESUMEN:");
    console.log(`  - Usuarios: ${users.length}`);
    console.log(`  - Workspaces: ${tenants.length}`);
    console.log(`  - Memberships: ${memberships.length}`);

    // Verificar específicamente jesusbloise
    console.log("\n🔎 WORKSPACES DE jesusbloise@gmail.com:");
    const jesusWorkspaces = memberships.filter(m => m.email === "jesusbloise@gmail.com");
    console.table(jesusWorkspaces);

    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

check();
