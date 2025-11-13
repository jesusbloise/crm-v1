// Script para corregir permisos incorrectos
require('dotenv').config();
const db = require('../db/connection');

async function main() {
  console.log('\n🔧 CORRIGIENDO PERMISOS\n');
  console.log('=' .repeat(80));
  
  const now = Date.now();
  
  // 1. Todos los usuarios en workspace 'demo' deben ser 'member' (excepto demo-admin)
  console.log('\n📝 Corrigiendo roles en workspace "demo"...');
  
  const demoMemberships = await db.prepare(
    `SELECT m.user_id, u.email, m.role 
     FROM memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.tenant_id = 'demo' AND m.role != 'member' AND u.id != 'demo-admin'`
  ).all();
  
  if (demoMemberships.length > 0) {
    console.log(`   Encontrados ${demoMemberships.length} usuarios con rol incorrecto en demo:`);
    
    for (const m of demoMemberships) {
      console.log(`   - ${m.email}: ${m.role} → member`);
      await db.prepare(
        `UPDATE memberships 
         SET role = 'member', updated_at = ?
         WHERE user_id = ? AND tenant_id = 'demo'`
      ).run(now, m.user_id);
    }
    
    console.log('   ✅ Roles corregidos en workspace "demo"');
  } else {
    console.log('   ✅ No hay roles incorrectos en workspace "demo"');
  }
  
  // 2. Verificar que jesusbloise@gmail.com sea owner en workspaces que creó
  console.log('\n📝 Verificando roles de jesusbloise@gmail.com...');
  
  const jesus = await db.prepare(
    `SELECT id FROM users WHERE email = 'jesusbloise@gmail.com' LIMIT 1`
  ).get();
  
  if (jesus) {
    // Obtener workspaces donde jesusbloise NO es owner pero debería serlo
    const tenantsCreatedByJesus = await db.prepare(
      `SELECT t.id, t.name, m.role
       FROM tenants t
       LEFT JOIN memberships m ON m.user_id = ? AND m.tenant_id = t.id
       WHERE t.created_by = ?`
    ).all(jesus.id, jesus.id);
    
    for (const t of tenantsCreatedByJesus) {
      if (t.role !== 'owner') {
        console.log(`   - Corrigiendo rol en workspace "${t.id}": ${t.role || 'sin membership'} → owner`);
        
        if (t.role) {
          // Ya tiene membership, actualizar rol
          await db.prepare(
            `UPDATE memberships 
             SET role = 'owner', updated_at = ?
             WHERE user_id = ? AND tenant_id = ?`
          ).run(now, jesus.id, t.id);
        } else {
          // No tiene membership, crear
          await db.prepare(
            `INSERT INTO memberships (user_id, tenant_id, role, created_at, updated_at)
             VALUES (?, ?, 'owner', ?, ?)`
          ).run(jesus.id, t.id, now, now);
        }
      } else {
        console.log(`   ✅ Rol correcto en workspace "${t.id}": owner`);
      }
    }
  }
  
  // 3. Mostrar estado final
  console.log('\n📊 ESTADO FINAL:');
  const memberships = await db.prepare(
    `SELECT u.email, m.tenant_id, t.name as tenant_name, m.role
     FROM memberships m
     JOIN users u ON u.id = m.user_id
     JOIN tenants t ON t.id = m.tenant_id
     ORDER BY u.email, m.tenant_id`
  ).all();
  
  memberships.forEach(m => {
    const roleEmoji = m.role === 'owner' ? '👑' : m.role === 'admin' ? '🔑' : '👤';
    console.log(`  ${roleEmoji} ${m.email} → ${m.tenant_id} (${m.tenant_name}) → ${m.role.toUpperCase()}`);
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Corrección completada\n');
  
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
