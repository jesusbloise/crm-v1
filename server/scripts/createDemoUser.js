// scripts/createDemoUser.js
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL || 
  `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;

const pool = new Pool({ connectionString: DATABASE_URL });

async function createDemoUser() {
  const client = await pool.connect();
  try {
    console.log("🔧 Creando usuario demo...");
    
    // 1. Verificar que existe el tenant demo (buscar por ID o name)
    const tenantResult = await client.query(
      "SELECT id, name FROM tenants WHERE id = $1 OR name = $2 LIMIT 1",
      ["demo", "Demo"]
    );
    
    if (tenantResult.rows.length === 0) {
      console.log("❌ No existe el tenant 'demo'. Ejecuta las migraciones primero.");
      process.exit(1);
    }
    
    const tenant = tenantResult.rows[0];
    console.log(`✅ Tenant encontrado: ${tenant.name} (ID: ${tenant.id})`);
    
    // 2. Eliminar usuario existente si existe
    await client.query("DELETE FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email = $1)", ["jesus@demo.com"]);
    await client.query("DELETE FROM users WHERE email = $1", ["jesus@demo.com"]);
    console.log("🗑️  Usuario anterior eliminado (si existía)");
    
    // 3. Crear nuevo usuario
    const hashedPassword = await bcrypt.hash("jesusbloise", 10);
    const now = Date.now();
    const userId = `usr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await client.query(
      `INSERT INTO users (id, email, password_hash, name, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, "jesus@demo.com", hashedPassword, "Jesus Bloise", true, now, now]
    );
    
    console.log(`✅ Usuario creado: jesus@demo.com (ID: ${userId})`);
    
    // 4. Crear membresía (asignar usuario al tenant demo como admin)
    await client.query(
      `INSERT INTO memberships (user_id, tenant_id, role, created_at)
       VALUES ($1, $2, $3, $4)`,
      [userId, tenant.id, "admin", now]
    );
    
    console.log("✅ Membresía creada: admin en tenant 'demo'");
    console.log("\n📝 Credenciales de acceso:");
    console.log("   Email: jesus@demo.com");
    console.log("   Password: jesusbloise");
    console.log("   Tenant: demo (o 'Demo' en el selector)");
    
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

createDemoUser();
