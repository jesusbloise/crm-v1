// server/scripts/checkAdminAuth.js
const db = require("../db/connection");

const userId = "02bfdb38-6083-4b6c-a009-b82005ff3e9a"; // jesusbloise

console.log("\n=== Verificando permisos de admin para jesusbloise ===\n");

// 1. Verificar todas las membresías
const allMemberships = db.prepare(`
  SELECT 
    t.name as tenant_name,
    m.role
  FROM memberships m
  JOIN tenants t ON t.id = m.tenant_id
  WHERE m.user_id = ?
  ORDER BY t.name
`).all(userId);

console.log(`Total membresías: ${allMemberships.length}`);
console.log("Membresías:", JSON.stringify(allMemberships, null, 2));

// 2. Verificar membresías con rol admin/owner
const adminMemberships = db.prepare(`
  SELECT role 
  FROM memberships 
  WHERE user_id = ? AND role IN ('admin', 'owner')
`).all(userId);

console.log(`\nMembresías admin/owner: ${adminMemberships.length}`);
console.log("Admin memberships:", JSON.stringify(adminMemberships, null, 2));

// 3. Verificar con LIMIT 1 (como en isAdminOrOwner)
const firstAdminMembership = db.prepare(`
  SELECT role 
  FROM memberships 
  WHERE user_id = ? AND role IN ('admin', 'owner') 
  LIMIT 1
`).get(userId);

console.log("\nPrimera membership (LIMIT 1):", JSON.stringify(firstAdminMembership, null, 2));
console.log("¿Es admin/owner?:", !!firstAdminMembership);

console.log("\n===================================================\n");
