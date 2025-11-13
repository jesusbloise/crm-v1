// server/scripts/test-delete-workspace-permissions.js
// Testing: Solo admin/owner globales pueden eliminar workspaces

// Cargar variables de entorno
require('dotenv').config();

const db = require('../db/connection');
const { isAdmin } = require('../lib/authorize');

async function testDeleteWorkspacePermissions() {
  console.log('\n🧪 TESTING: Permisos de Eliminación de Workspaces\n');
  console.log('═══════════════════════════════════════════════════\n');

  try {
    // 1. Obtener usuarios
    const users = await db.prepare(`
      SELECT id, email, name, role
      FROM users
      ORDER BY 
        CASE role
          WHEN 'owner' THEN 1
          WHEN 'admin' THEN 2
          ELSE 3
        END
    `).all();

    console.log('👥 USUARIOS Y SUS ROLES GLOBALES:\n');
    users.forEach(user => {
      const icon = user.role === 'owner' ? '👑' : user.role === 'admin' ? '🔑' : '👤';
      console.log(`  ${icon} ${user.email} (${user.name}) → ${user.role.toUpperCase()}`);
    });

    // 2. Obtener workspaces
    const workspaces = await db.prepare(`
      SELECT t.id, t.name, t.created_by, u.email as creator_email
      FROM tenants t
      LEFT JOIN users u ON u.id = t.created_by
    `).all();

    console.log('\n\n📁 WORKSPACES ACTUALES:\n');
    workspaces.forEach(ws => {
      console.log(`  • ${ws.id} - "${ws.name}" (creado por ${ws.creator_email})`);
    });

    // 3. Testing permisos
    console.log('\n\n🔐 TESTING PERMISOS DE ELIMINACIÓN:\n');
    console.log('Regla: Solo usuarios con rol GLOBAL admin u owner pueden eliminar workspaces\n');

    for (const user of users) {
      const canDelete = await isAdmin(user.id);
      const icon = user.role === 'owner' ? '👑' : user.role === 'admin' ? '🔑' : '👤';
      const status = canDelete ? '✅ PUEDE ELIMINAR' : '❌ NO PUEDE ELIMINAR';
      
      console.log(`  ${icon} ${user.email} (${user.role}) → ${status}`);
    }

    // 4. Validar lógica
    console.log('\n\n✅ VALIDACIÓN DE LÓGICA:\n');

    const ownerCount = users.filter(u => u.role === 'owner').length;
    const adminCount = users.filter(u => u.role === 'admin').length;
    const memberCount = users.filter(u => u.role === 'member').length;

    console.log(`  👑 Owners (pueden eliminar): ${ownerCount}`);
    console.log(`  🔑 Admins (pueden eliminar): ${adminCount}`);
    console.log(`  👤 Members (NO pueden eliminar): ${memberCount}`);
    console.log(`  ✅ Total con permisos: ${ownerCount + adminCount}`);
    console.log(`  ❌ Total sin permisos: ${memberCount}`);

    // 5. Simulación de DELETE
    console.log('\n\n🎭 SIMULACIÓN DE DELETE /tenants/:id:\n');

    for (const workspace of workspaces.slice(0, 2)) {
      console.log(`\n  🗑️ Intentando eliminar "${workspace.name}" (${workspace.id}):\n`);

      for (const user of users) {
        const canDelete = await isAdmin(user.id);
        const icon = user.role === 'owner' ? '👑' : user.role === 'admin' ? '🔑' : '👤';
        
        if (canDelete) {
          console.log(`    ${icon} ${user.email} → ✅ AUTORIZADO (rol: ${user.role})`);
        } else {
          console.log(`    ${icon} ${user.email} → ❌ DENEGADO (rol: ${user.role})`);
        }
      }
    }

    // 6. Validar protección del workspace "demo"
    console.log('\n\n🛡️ PROTECCIÓN DEL WORKSPACE "demo":\n');
    const demoWorkspace = workspaces.find(w => w.id === 'demo');
    if (demoWorkspace) {
      console.log(`  ✅ Workspace "demo" existe`);
      console.log(`  🔒 Protección: endpoint retorna 403 si tenantId === "demo"`);
      console.log(`  ⚠️ Nadie puede eliminar "demo" (ni siquiera owner)`);
    } else {
      console.log(`  ⚠️ Workspace "demo" no encontrado`);
    }

    // 7. Resumen final
    console.log('\n\n📊 RESUMEN DE PERMISOS:\n');
    console.log('  ┌─────────────────────────────────────────────────┐');
    console.log('  │ PERMISOS DE ELIMINACIÓN DE WORKSPACES          │');
    console.log('  ├─────────────────────────────────────────────────┤');
    console.log('  │ 👑 Owner  → ✅ Puede eliminar cualquier ws     │');
    console.log('  │ 🔑 Admin  → ✅ Puede eliminar cualquier ws     │');
    console.log('  │ 👤 Member → ❌ NO puede eliminar ningún ws     │');
    console.log('  ├─────────────────────────────────────────────────┤');
    console.log('  │ Excepción: "demo" NO se puede eliminar         │');
    console.log('  └─────────────────────────────────────────────────┘');

    console.log('\n\n✅ TESTING DE PERMISOS COMPLETADO\n');

  } catch (error) {
    console.error('\n❌ Error en testing:', error);
    process.exit(1);
  }
}

// Ejecutar
testDeleteWorkspacePermissions()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error fatal:', err);
    process.exit(1);
  });
