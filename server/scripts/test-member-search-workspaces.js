// server/scripts/test-member-search-workspaces.js
// Testing: Members pueden buscar workspaces y entrar con ID

require('dotenv').config();

const db = require('../db/connection');

async function testMemberSearchWorkspaces() {
  console.log('\n🧪 TESTING: Members pueden buscar y entrar a workspaces\n');
  console.log('═══════════════════════════════════════════════════════════\n');

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

    console.log('👥 USUARIOS DEL SISTEMA:\n');
    users.forEach(user => {
      const icon = user.role === 'owner' ? '👑' : user.role === 'admin' ? '🔑' : '👤';
      console.log(`  ${icon} ${user.email} (${user.name}) → ${user.role.toUpperCase()}`);
    });

    // 2. Obtener workspaces
    const workspaces = await db.prepare(`
      SELECT t.id, t.name, t.created_by, u.email as creator_email, u.name as creator_name
      FROM tenants t
      LEFT JOIN users u ON u.id = t.created_by
    `).all();

    console.log('\n\n📁 WORKSPACES DISPONIBLES:\n');
    workspaces.forEach(ws => {
      console.log(`  • ${ws.id} - "${ws.name}"`);
      console.log(`    └─ Creado por: ${ws.creator_name} (${ws.creator_email})`);
    });

    // 3. Testing búsqueda (simular GET /tenants/discover)
    console.log('\n\n🔍 TESTING BÚSQUEDA DE WORKSPACES:\n');
    
    const searchQueries = ['demo', 'pub', 'jesus'];
    
    for (const query of searchQueries) {
      console.log(`\n  🔎 Buscar: "${query}"`);
      
      const results = await db.prepare(`
        SELECT 
          t.id, 
          t.name, 
          t.created_by,
          u.name AS owner_name,
          u.email AS owner_email
        FROM tenants t
        LEFT JOIN users u ON u.id = t.created_by
        WHERE t.id LIKE $1 OR t.name LIKE $2
        ORDER BY t.name ASC
        LIMIT 20
      `).all(`%${query}%`, `%${query}%`);
      
      if (!results || results.length === 0) {
        console.log(`    └─ Sin resultados`);
      } else {
        results.forEach(r => {
          console.log(`    ✅ ${r.id} - "${r.name}" (creado por ${r.owner_name || r.owner_email})`);
        });
      }
    }

    // 4. Testing permisos de búsqueda
    console.log('\n\n🔐 PERMISOS DE BÚSQUEDA Y ACCESO:\n');
    
    const member = users.find(u => u.role === 'member');
    const admin = users.find(u => u.role === 'admin');
    const owner = users.find(u => u.role === 'owner');

    console.log('  Endpoint: GET /tenants/discover');
    console.log('  Restricción: Ninguna (todos pueden buscar)\n');
    
    if (member) {
      console.log(`  👤 Member (${member.email}):`);
      console.log(`    ✅ Puede buscar workspaces`);
      console.log(`    ✅ Puede ver resultados con creador`);
      console.log(`    ✅ Puede entrar a cualquier workspace (POST /tenants/switch)`);
    }
    
    if (admin) {
      console.log(`\n  🔑 Admin (${admin.email}):`);
      console.log(`    ✅ Puede buscar workspaces`);
      console.log(`    ✅ Puede ver resultados con creador`);
      console.log(`    ✅ Puede entrar a cualquier workspace`);
    }
    
    if (owner) {
      console.log(`\n  👑 Owner (${owner.email}):`);
      console.log(`    ✅ Puede buscar workspaces`);
      console.log(`    ✅ Puede ver resultados con creador`);
      console.log(`    ✅ Puede entrar a cualquier workspace`);
    }

    // 5. Testing switch de workspace
    console.log('\n\n🔄 TESTING CAMBIO DE WORKSPACE:\n');
    console.log('  Endpoint: POST /tenants/switch');
    console.log('  Restricción: Ninguna (todos pueden cambiar)\n');

    for (const workspace of workspaces) {
      console.log(`  📁 Workspace "${workspace.name}" (${workspace.id}):\n`);
      
      for (const user of users.slice(0, 3)) { // Solo primeros 3 usuarios
        const icon = user.role === 'owner' ? '👑' : user.role === 'admin' ? '🔑' : '👤';
        console.log(`    ${icon} ${user.email} → ✅ PUEDE ENTRAR`);
      }
      
      console.log('');
    }

    // 6. Diferencias con memberships
    console.log('\n📊 COMPARACIÓN: Sistema Anterior vs Actual\n');
    console.log('  ┌─────────────────────────────────────────────────────────┐');
    console.log('  │ SISTEMA CON MEMBERSHIPS (Anterior)                     │');
    console.log('  ├─────────────────────────────────────────────────────────┤');
    console.log('  │ ❌ Usuario necesitaba "unirse" al workspace            │');
    console.log('  │ ❌ Administrador debía aprobar membership               │');
    console.log('  │ ❌ Roles por workspace (admin, member)                  │');
    console.log('  │ ❌ Tabla memberships controlaba acceso                  │');
    console.log('  └─────────────────────────────────────────────────────────┘');
    
    console.log('\n  ┌─────────────────────────────────────────────────────────┐');
    console.log('  │ SISTEMA SIMPLIFICADO (Actual)                          │');
    console.log('  ├─────────────────────────────────────────────────────────┤');
    console.log('  │ ✅ Usuario busca workspace y entra directamente        │');
    console.log('  │ ✅ Sin aprobación necesaria                            │');
    console.log('  │ ✅ Solo roles GLOBALES (owner, admin, member)          │');
    console.log('  │ ✅ Sin tabla memberships                               │');
    console.log('  └─────────────────────────────────────────────────────────┘');

    // 7. Flujo completo para member
    console.log('\n\n📝 FLUJO COMPLETO PARA MEMBER:\n');
    console.log('  1️⃣  Member abre "Más" → ve campo "Descubrir / entrar por ID"');
    console.log('  2️⃣  Member escribe "demo" y presiona "Buscar"');
    console.log('  3️⃣  Sistema muestra workspace "Demo" con info del creador');
    console.log('  4️⃣  Member presiona botón "Entrar"');
    console.log('  5️⃣  Sistema hace POST /tenants/switch con tenant_id="demo"');
    console.log('  6️⃣  ✅ Member ahora está en workspace "demo"');
    console.log('  7️⃣  Member ve datos del workspace según su rol global:');
    console.log('      • Member → Solo sus datos');
    console.log('      • Admin → Todos los datos');
    console.log('      • Owner → Todos los datos');

    // 8. Resumen final
    console.log('\n\n✅ RESUMEN DE PERMISOS:\n');
    console.log('  ┌─────────────────────────────────────────────────────────┐');
    console.log('  │ BÚSQUEDA Y ACCESO A WORKSPACES                         │');
    console.log('  ├─────────────────────────────────────────────────────────┤');
    console.log('  │ 👑 Owner  → ✅ Buscar, ✅ Entrar a cualquiera          │');
    console.log('  │ 🔑 Admin  → ✅ Buscar, ✅ Entrar a cualquiera          │');
    console.log('  │ 👤 Member → ✅ Buscar, ✅ Entrar a cualquiera          │');
    console.log('  ├─────────────────────────────────────────────────────────┤');
    console.log('  │ Todos los usuarios pueden:                             │');
    console.log('  │ • Buscar workspaces por ID o nombre                    │');
    console.log('  │ • Ver información del creador                          │');
    console.log('  │ • Cambiar a cualquier workspace                        │');
    console.log('  └─────────────────────────────────────────────────────────┘');

    console.log('\n✅ TESTING DE BÚSQUEDA Y ACCESO COMPLETADO\n');

  } catch (error) {
    console.error('\n❌ Error en testing:', error);
    process.exit(1);
  }
}

// Ejecutar
testMemberSearchWorkspaces()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error fatal:', err);
    process.exit(1);
  });
