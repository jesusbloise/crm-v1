// Script para diagnosticar permisos y roles en la base de datos
require('dotenv').config();
const db = require('../db/connection');

async function main() {
  console.log('\n🔍 DIAGNÓSTICO DE PERMISOS\n');
  console.log('=' .repeat(80));
  
  // 1. Listar todos los usuarios
  console.log('\n📋 USUARIOS:');
  const users = await db.prepare(
    'SELECT id, email, name, created_at FROM users ORDER BY email'
  ).all();
  
  users.forEach(u => {
    console.log(`  - ${u.email} (${u.name}) [ID: ${u.id}]`);
  });
  
  // 2. Listar todos los workspaces
  console.log('\n📋 WORKSPACES:');
  const tenants = await db.prepare(
    `SELECT t.id, t.name, t.created_by, u.email as creator_email
     FROM tenants t
     LEFT JOIN users u ON u.id = t.created_by
     ORDER BY t.id`
  ).all();
  
  tenants.forEach(t => {
    console.log(`  - ${t.id} (${t.name}) - Creado por: ${t.creator_email || 'N/A'}`);
  });
  
  // 3. Listar todas las memberships
  console.log('\n📋 MEMBERSHIPS (Usuario → Workspace → Rol):');
  const memberships = await db.prepare(
    `SELECT u.email, m.tenant_id, t.name as tenant_name, m.role, m.created_at
     FROM memberships m
     JOIN users u ON u.id = m.user_id
     JOIN tenants t ON t.id = m.tenant_id
     ORDER BY u.email, m.tenant_id`
  ).all();
  
  memberships.forEach(m => {
    const roleEmoji = m.role === 'owner' ? '👑' : m.role === 'admin' ? '🔑' : '👤';
    console.log(`  ${roleEmoji} ${m.email} → ${m.tenant_id} (${m.tenant_name}) → ${m.role.toUpperCase()}`);
  });
  
  // 4. Detectar problemas
  console.log('\n⚠️ PROBLEMAS DETECTADOS:');
  let hasIssues = false;
  
  // 4.1 Usuarios con rol admin/owner en workspace demo
  const demoAdmins = memberships.filter(m => 
    m.tenant_id === 'demo' && (m.role === 'admin' || m.role === 'owner')
  );
  if (demoAdmins.length > 0) {
    hasIssues = true;
    console.log('\n  ❌ Usuarios con rol admin/owner en workspace "demo":');
    demoAdmins.forEach(m => {
      console.log(`     - ${m.email} tiene rol ${m.role.toUpperCase()} en demo`);
    });
    console.log('     💡 Todos deberían ser "member" en demo');
  }
  
  // 4.2 Usuarios que NO son jesusbloise con rol owner
  const nonJesusOwners = memberships.filter(m => 
    m.role === 'owner' && !m.email.includes('jesusbloise')
  );
  if (nonJesusOwners.length > 0) {
    hasIssues = true;
    console.log('\n  ⚠️ Usuarios con rol owner (que NO son jesusbloise):');
    nonJesusOwners.forEach(m => {
      console.log(`     - ${m.email} es OWNER en ${m.tenant_id}`);
    });
    console.log('     💡 Verifica si esto es intencional');
  }
  
  // 4.3 Usuarios sin ninguna membership
  const usersWithoutMemberships = users.filter(u => 
    !memberships.some(m => m.email === u.email)
  );
  if (usersWithoutMemberships.length > 0) {
    hasIssues = true;
    console.log('\n  ❌ Usuarios SIN memberships:');
    usersWithoutMemberships.forEach(u => {
      console.log(`     - ${u.email} (${u.name})`);
    });
  }
  
  if (!hasIssues) {
    console.log('  ✅ No se detectaron problemas evidentes');
  }
  
  // 5. Resumen de roles
  console.log('\n📊 RESUMEN POR ROL:');
  const roleCount = {};
  memberships.forEach(m => {
    roleCount[m.role] = (roleCount[m.role] || 0) + 1;
  });
  Object.keys(roleCount).sort().forEach(role => {
    const roleEmoji = role === 'owner' ? '👑' : role === 'admin' ? '🔑' : '👤';
    console.log(`  ${roleEmoji} ${role.toUpperCase()}: ${roleCount[role]} memberships`);
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Diagnóstico completado\n');
  
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
