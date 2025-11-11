// server/scripts/seedProduction.js
/**
 * 🌱 Script UNIVERSAL para poblar Railway (PostgreSQL) o Local (SQLite)
 * Ejecutar: node server/scripts/seedProduction.js
 * 
 * Detecta automáticamente el tipo de DB y usa la sintaxis correcta
 */

require("dotenv").config();
const db = require("../db/connection");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const now = () => Date.now();
const USE_POSTGRES = !!process.env.DATABASE_URL;

console.log(`\n🌱 Iniciando seed de ${USE_POSTGRES ? "PostgreSQL (Railway)" : "SQLite (Local)"}...\n`);

// ============================================
// 1. CREAR USUARIOS
// ============================================

async function seedUsers() {
  console.log("👤 Creando usuarios...");

  const users = [
    {
      id: "02bfdb38-6083-4b6c-a009-b82005ff3e9a",
      email: "jesusbloise@gmail.com",
      name: "jesus",
      password: "jesus123",
    },
    {
      id: crypto.randomUUID(),
      email: "luisa@gmail.com",
      name: "luisa",
      password: "luisa123",
    },
    {
      id: crypto.randomUUID(),
      email: "carolina@gmail.com",
      name: "carolina",
      password: "carolina123",
    },
  ];

  if (USE_POSTGRES) {
    for (const user of users) {
      const hash = bcrypt.hashSync(user.password, 10);
      await db.prepare(`
        INSERT INTO users (id, email, name, password_hash, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 1, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          name = EXCLUDED.name,
          password_hash = EXCLUDED.password_hash,
          updated_at = EXCLUDED.updated_at
      `).run(user.id, user.email, user.name, hash, now(), now());
      console.log(`  ✅ Usuario: ${user.email}`);
    }
  } else {
    const insertUser = db.prepare(`
      INSERT OR REPLACE INTO users (id, email, name, password_hash, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `);
    users.forEach((user) => {
      const hash = bcrypt.hashSync(user.password, 10);
      insertUser.run(user.id, user.email, user.name, hash, now(), now());
      console.log(`  ✅ Usuario: ${user.email}`);
    });
  }
}

// ============================================
// 2. CREAR WORKSPACES (TENANTS)
// ============================================

async function seedTenants() {
  console.log("\n📁 Creando workspaces...");

  const tenants = [
    {
      id: "demo",
      name: "Demo",
      created_by: "02bfdb38-6083-4b6c-a009-b82005ff3e9a",
    },
    {
      id: "jesus",
      name: "publicidad",
      created_by: "02bfdb38-6083-4b6c-a009-b82005ff3e9a",
    },
    {
      id: "luis",
      name: "edicion",
      created_by: "02bfdb38-6083-4b6c-a009-b82005ff3e9a",
    },
  ];

  if (USE_POSTGRES) {
    for (const tenant of tenants) {
      await db.prepare(`
        INSERT INTO tenants (id, name, created_at, updated_at, created_by)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          updated_at = EXCLUDED.updated_at
      `).run(tenant.id, tenant.name, now(), now(), tenant.created_by);
      console.log(`  ✅ Workspace: ${tenant.name} (${tenant.id})`);
    }
  } else {
    const insertTenant = db.prepare(`
      INSERT OR REPLACE INTO tenants (id, name, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?)
    `);
    tenants.forEach((tenant) => {
      insertTenant.run(tenant.id, tenant.name, now(), now(), tenant.created_by);
      console.log(`  ✅ Workspace: ${tenant.name} (${tenant.id})`);
    });
  }
}

// ============================================
// 3. CREAR MEMBERSHIPS (Usuarios en Workspaces)
// ============================================

async function seedMemberships() {
  console.log("\n🔗 Creando memberships...");

  // Primero obtenemos los IDs reales de luisa y carolina de la DB
  let luisaId, carolinaId;
  
  if (USE_POSTGRES) {
    const luisa = await db.prepare("SELECT id FROM users WHERE email = $1").get("luisa@gmail.com");
    const carolina = await db.prepare("SELECT id FROM users WHERE email = $1").get("carolina@gmail.com");
    luisaId = luisa?.id;
    carolinaId = carolina?.id;
  } else {
    const luisa = db.prepare("SELECT id FROM users WHERE email = ?").get("luisa@gmail.com");
    const carolina = db.prepare("SELECT id FROM users WHERE email = ?").get("carolina@gmail.com");
    luisaId = luisa?.id;
    carolinaId = carolina?.id;
  }

  const memberships = [
    // jesusbloise - owner en todos
    { user_id: "02bfdb38-6083-4b6c-a009-b82005ff3e9a", tenant_id: "demo", role: "owner", email: "jesusbloise@gmail.com" },
    { user_id: "02bfdb38-6083-4b6c-a009-b82005ff3e9a", tenant_id: "jesus", role: "owner", email: "jesusbloise@gmail.com" },
    { user_id: "02bfdb38-6083-4b6c-a009-b82005ff3e9a", tenant_id: "luis", role: "owner", email: "jesusbloise@gmail.com" },
    
    // luisa - member en demo y luis
    { user_id: luisaId, tenant_id: "demo", role: "member", email: "luisa@gmail.com" },
    { user_id: luisaId, tenant_id: "luis", role: "member", email: "luisa@gmail.com" },
    
    // carolina - member en demo
    { user_id: carolinaId, tenant_id: "demo", role: "member", email: "carolina@gmail.com" },
  ];

  if (USE_POSTGRES) {
    for (const m of memberships) {
      await db.prepare(`
        INSERT INTO memberships (user_id, tenant_id, role, created_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role
      `).run(m.user_id, m.tenant_id, m.role, now());
      console.log(`  ✅ ${m.email} → ${m.tenant_id} (${m.role})`);
    }
  } else {
    const insertMembership = db.prepare(`
      INSERT OR REPLACE INTO memberships (user_id, tenant_id, role, created_at)
      VALUES (?, ?, ?, ?)
    `);
    memberships.forEach((m) => {
      insertMembership.run(m.user_id, m.tenant_id, m.role, now());
      console.log(`  ✅ ${m.email} → ${m.tenant_id} (${m.role})`);
    });
  }
}

// ============================================
// VERIFICACIÓN
// ============================================

async function verify() {
  console.log("\n📊 Verificando datos...\n");

  let allUsers, allTenants, allMemberships;
  
  if (USE_POSTGRES) {
    allUsers = await db.prepare("SELECT id, email, name FROM users").all();
    allTenants = await db.prepare("SELECT id, name FROM tenants").all();
    allMemberships = await db.prepare(`
      SELECT u.email, t.name as workspace, m.role 
      FROM memberships m 
      JOIN users u ON u.id = m.user_id 
      JOIN tenants t ON t.id = m.tenant_id
      ORDER BY u.email, t.name
    `).all();
  } else {
    allUsers = db.prepare("SELECT id, email, name FROM users").all();
    allTenants = db.prepare("SELECT id, name FROM tenants").all();
    allMemberships = db.prepare(`
      SELECT u.email, t.name as workspace, m.role 
      FROM memberships m 
      JOIN users u ON u.id = m.user_id 
      JOIN tenants t ON t.id = m.tenant_id
      ORDER BY u.email, t.name
    `).all();
  }

  console.log(`Total usuarios: ${allUsers.length}`);
  allUsers.forEach(u => console.log(`  - ${u.email} (${u.name})`));

  console.log(`\nTotal workspaces: ${allTenants.length}`);
  allTenants.forEach(t => console.log(`  - ${t.name} (${t.id})`));

  console.log(`\nTotal memberships: ${allMemberships.length}`);
  console.table(allMemberships);

  console.log("\n✅ Seed completado exitosamente!\n");
  console.log("🔐 Contraseñas de prueba:");
  console.log("  - jesusbloise@gmail.com: jesus123");
  console.log("  - luisa@gmail.com: luisa123");
  console.log("  - carolina@gmail.com: carolina123");
}

// ============================================
// MAIN
// ============================================

(async () => {
  try {
    await seedUsers();
    await seedTenants();
    await seedMemberships();
    await verify();
    process.exit(0);
  } catch (err) {
    console.error("❌ Error en seed:", err);
    process.exit(1);
  }
})();
console.log("  - luisa@gmail.com: luisa123");
console.log("  - carolina@gmail.com: carolina123");
console.log("\n⚠️  IMPORTANTE: Cambia estas contraseñas en producción!\n");
