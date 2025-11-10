#!/usr/bin/env node
const db = require('../db/connection');

console.log('═══════════════════════════════════════════════════════════');
console.log('   📊 ANÁLISIS DE WORKSPACES CREADOS');
console.log('═══════════════════════════════════════════════════════════\n');

// Total de workspaces
const total = db.prepare('SELECT COUNT(*) as count FROM tenants').get();
console.log(`✅ Total de workspaces: ${total.count}\n`);

// Workspaces por creador
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('WORKSPACES POR CREADOR');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const byCreator = db.prepare(`
  SELECT 
    created_by,
    COUNT(*) as count,
    MIN(created_at) as first_created,
    MAX(created_at) as last_created
  FROM tenants 
  GROUP BY created_by
  ORDER BY count DESC
`).all();

byCreator.forEach(creator => {
  const user = db.prepare('SELECT email, name FROM users WHERE id = ?').get(creator.created_by);
  const firstDate = new Date(creator.first_created).toLocaleString();
  const lastDate = new Date(creator.last_created).toLocaleString();
  
  console.log(`👤 ${creator.created_by.substring(0, 8)}... (${user?.email || 'Usuario no encontrado'})`);
  console.log(`   📦 Workspaces creados: ${creator.count}`);
  console.log(`   📅 Primer workspace: ${firstDate}`);
  console.log(`   📅 Último workspace: ${lastDate}\n`);
});

// Workspaces con nombre "Test Workspace" (de tests)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('WORKSPACES DE TESTING');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const testWorkspaces = db.prepare(`
  SELECT * FROM tenants 
  WHERE name = 'Test Workspace' OR id LIKE 'test_workspace_%'
  ORDER BY created_at DESC
`).all();

console.log(`⚠️  Workspaces de tests encontrados: ${testWorkspaces.length}\n`);

if (testWorkspaces.length > 0) {
  console.log('Últimos 5 workspaces de test:');
  testWorkspaces.slice(0, 5).forEach(ws => {
    const date = new Date(ws.created_at).toLocaleString();
    console.log(`   - ${ws.id} (${date})`);
  });
}

// Workspaces creados en las últimas 24 horas
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('WORKSPACES RECIENTES (últimas 24h)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const yesterday = Date.now() - (24 * 60 * 60 * 1000);
const recent = db.prepare(`
  SELECT * FROM tenants 
  WHERE created_at > ?
  ORDER BY created_at DESC
`).all(yesterday);

console.log(`📌 Workspaces creados hoy: ${recent.length}\n`);

if (recent.length > 0) {
  recent.forEach(ws => {
    const date = new Date(ws.created_at).toLocaleString();
    console.log(`   - ${ws.name} (${ws.id}) - ${date}`);
  });
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('   🔍 CONCLUSIÓN');
console.log('═══════════════════════════════════════════════════════════\n');

const testCount = testWorkspaces.length;
const realCount = total.count - testCount;

console.log(`📊 Workspaces reales: ${realCount}`);
console.log(`🧪 Workspaces de tests: ${testCount}`);
console.log(`📦 Total: ${total.count}\n`);

if (testCount > 5) {
  console.log('⚠️  RECOMENDACIÓN:');
  console.log('   Los scripts de testing están creando workspaces en la DB real.');
  console.log('   Considera limpiar los workspaces de test o usar una DB separada para tests.\n');
}
