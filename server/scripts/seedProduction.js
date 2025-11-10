// server/scripts/seedProduction.js
/**
 * Script para poblar Railway con los datos de desarrollo
 * Ejecutar: node server/scripts/seedProduction.js
 * 
 * IMPORTANTE: Ejecuta esto SOLO UNA VEZ después de cada deploy a Railway
 */

const db = require("../db/connection");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const now = () => Date.now();

console.log("\n🌱 Iniciando seed de producción...\n");

// ============================================
// 1. CREAR USUARIOS
// ============================================

console.log("👤 Creando usuarios...");

const users = [
  {
    id: "02bfdb38-6083-4b6c-a009-b82005ff3e9a",
    email: "jesusbloise@gmail.com",
    name: "jesus",
    password: "jesus123", // Cambia esto por la contraseña real
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

const insertUser = db.prepare(`
  INSERT OR REPLACE INTO users (id, email, name, password_hash, is_active, created_at, updated_at)
  VALUES (?, ?, ?, ?, 1, ?, ?)
`);

users.forEach((user) => {
  const hash = bcrypt.hashSync(user.password, 10);
  insertUser.run(user.id, user.email, user.name, hash, now(), now());
  console.log(`  ✅ Usuario creado: ${user.email}`);
});

// ============================================
// 2. CREAR WORKSPACES (TENANTS)
// ============================================

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

const insertTenant = db.prepare(`
  INSERT OR REPLACE INTO tenants (id, name, created_at, updated_at, created_by)
  VALUES (?, ?, ?, ?, ?)
`);

tenants.forEach((tenant) => {
  insertTenant.run(tenant.id, tenant.name, now(), now(), tenant.created_by);
  console.log(`  ✅ Workspace creado: ${tenant.name} (${tenant.id})`);
});

// ============================================
// 3. CREAR MEMBERSHIPS (Usuarios en Workspaces)
// ============================================

console.log("\n🔗 Creando memberships...");

const memberships = [
  // jesusbloise - owner en todos
  { user_id: "02bfdb38-6083-4b6c-a009-b82005ff3e9a", tenant_id: "demo", role: "owner" },
  { user_id: "02bfdb38-6083-4b6c-a009-b82005ff3e9a", tenant_id: "jesus", role: "owner" },
  { user_id: "02bfdb38-6083-4b6c-a009-b82005ff3e9a", tenant_id: "luis", role: "owner" },
  
  // luisa - member en demo y luis
  { user_id: users[1].id, tenant_id: "demo", role: "member" },
  { user_id: users[1].id, tenant_id: "luis", role: "member" },
  
  // carolina - member en demo
  { user_id: users[2].id, tenant_id: "demo", role: "member" },
];

const insertMembership = db.prepare(`
  INSERT OR REPLACE INTO memberships (user_id, tenant_id, role, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
`);

memberships.forEach((m) => {
  insertMembership.run(m.user_id, m.tenant_id, m.role, now(), now());
  const userEmail = users.find(u => u.id === m.user_id)?.email || "jesusbloise@gmail.com";
  console.log(`  ✅ ${userEmail} → ${m.tenant_id} (${m.role})`);
});

// ============================================
// VERIFICACIÓN
// ============================================

console.log("\n📊 Verificando datos...\n");

const allUsers = db.prepare("SELECT id, email, name FROM users").all();
console.log(`Total usuarios: ${allUsers.length}`);
allUsers.forEach(u => console.log(`  - ${u.email} (${u.name})`));

const allTenants = db.prepare("SELECT id, name FROM tenants").all();
console.log(`\nTotal workspaces: ${allTenants.length}`);
allTenants.forEach(t => console.log(`  - ${t.name} (${t.id})`));

const allMemberships = db.prepare(`
  SELECT u.email, t.name as workspace, m.role 
  FROM memberships m 
  JOIN users u ON u.id = m.user_id 
  JOIN tenants t ON t.id = m.tenant_id
  ORDER BY u.email, t.name
`).all();
console.log(`\nTotal memberships: ${allMemberships.length}`);
console.table(allMemberships);

console.log("\n✅ Seed completado exitosamente!\n");
console.log("🔐 Contraseñas de prueba:");
console.log("  - jesusbloise@gmail.com: jesus123");
console.log("  - luisa@gmail.com: luisa123");
console.log("  - carolina@gmail.com: carolina123");
console.log("\n⚠️  IMPORTANTE: Cambia estas contraseñas en producción!\n");
