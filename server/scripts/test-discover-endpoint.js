// server/scripts/test-discover-endpoint.js
// Testing rápido del endpoint /tenants/discover

require('dotenv').config();

const db = require('../db/connection');

async function testDiscoverEndpoint() {
  console.log('\n🧪 TESTING: Endpoint /tenants/discover\n');

  try {
    // Simular búsqueda
    const queries = ['demo', 'pub', 'jesus', 'xyz123'];

    for (const q of queries) {
      console.log(`\n🔍 Búsqueda: "${q}"`);
      
      const userId = 'test-user-id';
      const searchPattern = `%${q}%`;
      
      const rows = await db.prepare(`
        SELECT 
          t.id, 
          t.name, 
          t.created_by,
          u.name AS owner_name,
          u.email AS owner_email,
          (t.created_by = $1) AS is_creator
        FROM tenants t
        LEFT JOIN users u ON u.id = t.created_by
        WHERE t.id LIKE $2 OR t.name LIKE $3
        ORDER BY t.name ASC
        LIMIT 20
      `).all(userId, searchPattern, searchPattern);

      if (!rows || rows.length === 0) {
        console.log('  └─ ❌ Sin resultados');
      } else {
        console.log(`  └─ ✅ ${rows.length} resultado(s):`);
        rows.forEach(r => {
          console.log(`     • ${r.id} - "${r.name}" (creado por ${r.owner_name || r.owner_email})`);
        });
      }
    }

    console.log('\n✅ TESTING COMPLETADO\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

testDiscoverEndpoint();
