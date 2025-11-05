const db = require('better-sqlite3')('crm.db');

console.log('\n=== ANTES DE LA CORRECCIÓN ===');
const beforeTenants = db.prepare(`
  SELECT t.id, t.name, t.created_by, u.name as creator_name 
  FROM tenants t 
  LEFT JOIN users u ON u.id = t.created_by
  WHERE t.id IN ('jesus', 'luis')
`).all();
console.table(beforeTenants);

// Obtener los IDs correctos de los usuarios
const jesus = db.prepare("SELECT id FROM users WHERE email = 'jesusbloise@gmail.com'").get();
const luisa = db.prepare("SELECT id FROM users WHERE email = 'luisa@gmail.com'").get();

console.log('\nUsuarios encontrados:');
console.log('Jesús ID:', jesus?.id);
console.log('Luisa ID:', luisa?.id);

if (!jesus || !luisa) {
  console.error('❌ No se encontraron los usuarios necesarios');
  process.exit(1);
}

// Actualizar los workspaces
console.log('\n=== APLICANDO CORRECCIONES ===');

// Corregir "publicidad" - creado por Jesús
const updatePublicidad = db.prepare(`
  UPDATE tenants 
  SET created_by = ? 
  WHERE id = 'jesus'
`);
const result1 = updatePublicidad.run(jesus.id);
console.log('✅ Workspace "publicidad" actualizado. Filas afectadas:', result1.changes);

// Corregir "edicion" - creado por Luisa
const updateEdicion = db.prepare(`
  UPDATE tenants 
  SET created_by = ? 
  WHERE id = 'luis'
`);
const result2 = updateEdicion.run(luisa.id);
console.log('✅ Workspace "edicion" actualizado. Filas afectadas:', result2.changes);

// También actualizar las memberships para que sean owners
const updateMembershipPublicidad = db.prepare(`
  UPDATE memberships 
  SET user_id = ?, role = 'owner' 
  WHERE tenant_id = 'jesus' AND user_id = 'demo-admin'
`);
const result3 = updateMembershipPublicidad.run(jesus.id);
console.log('✅ Membership "publicidad" actualizado. Filas afectadas:', result3.changes);

const updateMembershipEdicion = db.prepare(`
  UPDATE memberships 
  SET user_id = ?, role = 'owner' 
  WHERE tenant_id = 'luis' AND user_id = 'demo-admin'
`);
const result4 = updateMembershipEdicion.run(luisa.id);
console.log('✅ Membership "edicion" actualizado. Filas afectadas:', result4.changes);

console.log('\n=== DESPUÉS DE LA CORRECCIÓN ===');
const afterTenants = db.prepare(`
  SELECT t.id, t.name, t.created_by, u.name as creator_name, u.email as creator_email
  FROM tenants t 
  LEFT JOIN users u ON u.id = t.created_by
  WHERE t.id IN ('jesus', 'luis')
`).all();
console.table(afterTenants);

console.log('\n=== MEMBERSHIPS ACTUALIZADOS ===');
const memberships = db.prepare(`
  SELECT m.tenant_id, t.name as tenant_name, m.user_id, u.name as user_name, u.email, m.role
  FROM memberships m
  LEFT JOIN users u ON u.id = m.user_id
  LEFT JOIN tenants t ON t.id = m.tenant_id
  WHERE m.tenant_id IN ('jesus', 'luis')
`).all();
console.table(memberships);

db.close();
console.log('\n✅ Correcciones aplicadas exitosamente');
