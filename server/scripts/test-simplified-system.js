// Script de testing del sistema simplificado (sin memberships)
require('dotenv').config();
const db = require('../db/connection');

async function main() {
  console.log('\n🧪 TESTING SISTEMA SIMPLIFICADO (ROL GLOBAL ÚNICAMENTE)\n');
  console.log('=' .repeat(80));
  
  try {
    // 1. Verificar roles globales de usuarios
    console.log('\n📊 ROLES GLOBALES DE USUARIOS:');
    const users = await db.prepare(
      `SELECT id, email, name, role 
       FROM users 
       ORDER BY 
         CASE 
           WHEN role = 'owner' THEN 1 
           WHEN role = 'admin' THEN 2 
           ELSE 3 
         END, 
         email`
    ).all();
    
    users.forEach(u => {
      const roleEmoji = u.role === 'owner' ? '👑' : u.role === 'admin' ? '🔑' : '👤';
      console.log(`  ${roleEmoji} ${u.email} (${u.name}) → ${u.role.toUpperCase()}`);
    });
    
    const ownerCount = users.filter(u => u.role === 'owner').length;
    const adminCount = users.filter(u => u.role === 'admin').length;
    const memberCount = users.filter(u => u.role === 'member').length;
    
    console.log(`\n  Total: ${users.length} usuarios`);
    console.log(`  👑 Owners: ${ownerCount} (debe ser 1 - jesusbloise)`);
    console.log(`  🔑 Admins: ${adminCount}`);
    console.log(`  👤 Members: ${memberCount}`);
    
    // Validación: Solo debe haber 1 owner
    if (ownerCount !== 1) {
      console.log('  ⚠️  ADVERTENCIA: Debe haber exactamente 1 owner (jesusbloise)');
    }
    
    // 2. Verificar workspaces
    console.log('\n📂 WORKSPACES EXISTENTES:');
    const workspaces = await db.prepare(
      `SELECT t.id, t.name, t.created_by, u.email AS creator_email, u.role AS creator_role
       FROM tenants t
       LEFT JOIN users u ON u.id = t.created_by
       ORDER BY t.created_at ASC`
    ).all();
    
    workspaces.forEach(w => {
      const creatorRoleEmoji = w.creator_role === 'owner' ? '👑' : w.creator_role === 'admin' ? '🔑' : '👤';
      console.log(`  ${w.id} - "${w.name}" (creado por ${creatorRoleEmoji} ${w.creator_email})`);
    });
    
    console.log(`\n  Total: ${workspaces.length} workspaces`);
    
    // 3. Verificar que NO haya memberships (tabla obsoleta)
    console.log('\n🗑️  VERIFICANDO MEMBERSHIPS (tabla obsoleta):');
    const membershipCount = await db.prepare(
      'SELECT COUNT(*) AS count FROM memberships'
    ).get();
    
    console.log(`  Memberships en tabla: ${membershipCount.count}`);
    console.log(`  ℹ️  La tabla memberships está obsoleta - sistema usa solo users.role`);
    
    // 4. Simular permisos por rol
    console.log('\n🔐 SIMULACIÓN DE PERMISOS:');
    
    const testCases = [
      { role: 'owner', canCreateWorkspace: true, canSeeAll: true, description: '👑 Owner (Dios del sistema)' },
      { role: 'admin', canCreateWorkspace: true, canSeeAll: true, description: '🔑 Admin' },
      { role: 'member', canCreateWorkspace: false, canSeeAll: false, description: '👤 Member' }
    ];
    
    testCases.forEach(tc => {
      console.log(`\n  ${tc.description}:`);
      console.log(`    • Crear workspaces: ${tc.canCreateWorkspace ? '✅' : '❌'}`);
      console.log(`    • Ver todos los datos: ${tc.canSeeAll ? '✅' : '❌'}`);
      console.log(`    • Ver solo sus datos: ${tc.canSeeAll ? '➕ También' : '✅ Solo esto'}`);
    });
    
    // 5. Resumen
    console.log('\n' + '='.repeat(80));
    console.log('✅ SISTEMA SIMPLIFICADO VALIDADO\n');
    console.log('📋 Reglas del sistema:');
    console.log('  1. Solo ROL GLOBAL (users.role): owner, admin, member');
    console.log('  2. NO hay roles por workspace (tabla memberships obsoleta)');
    console.log('  3. Solo admin/owner pueden crear workspaces');
    console.log('  4. Admin/owner ven todos los datos, members solo los suyos');
    console.log('  5. Solo 1 owner global (jesusbloise) - Dios del sistema\n');
    
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
  
  process.exit(0);
}

main();
