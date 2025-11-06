// server/scripts/updateAdminRoles.js
const db = require("../db/connection");

console.log("\n=== Actualizando roles de administradores ===\n");

// 1. Actualizar jesusbloise a 'admin' en todos sus workspaces
const jesusId = "02bfdb38-6083-4b6c-a009-b82005ff3e9a";
const updateJesus = db.prepare(`
  UPDATE memberships 
  SET role = 'admin', updated_at = ?
  WHERE user_id = ?
`);

const resultJesus = updateJesus.run(Date.now(), jesusId);
console.log(`✅ Actualizado jesusbloise: ${resultJesus.changes} membresías cambiadas a 'admin'`);

// 2. Actualizar demo-admin a 'owner' o 'admin'
const updateDemoAdmin = db.prepare(`
  UPDATE memberships 
  SET role = 'owner', updated_at = ?
  WHERE user_id = 'demo-admin'
`);

const resultDemo = updateDemoAdmin.run(Date.now());
console.log(`✅ Actualizado demo-admin: ${resultDemo.changes} membresías cambiadas a 'owner'`);

// 3. Verificar los cambios
console.log("\n=== Verificando cambios ===\n");

const jesusRoles = db.prepare(`
  SELECT t.name as tenant_name, m.role
  FROM memberships m
  JOIN tenants t ON t.id = m.tenant_id
  WHERE m.user_id = ?
  ORDER BY t.name
`).all(jesusId);

console.log("Roles de jesusbloise:");
jesusRoles.forEach(r => console.log(`  - ${r.tenant_name}: ${r.role}`));

const demoRoles = db.prepare(`
  SELECT t.name as tenant_name, m.role
  FROM memberships m
  JOIN tenants t ON t.id = m.tenant_id
  WHERE m.user_id = 'demo-admin'
  ORDER BY t.name
`).all();

console.log("\nRoles de demo-admin:");
demoRoles.forEach(r => console.log(`  - ${r.tenant_name}: ${r.role}`));

console.log("\n=== ¡Listo! ===\n");
