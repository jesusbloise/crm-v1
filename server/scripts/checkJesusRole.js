const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'crm.db');
const db = new Database(dbPath);

try {
  const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get('jesusbloise@gmail.com');
  
  if (user) {
    console.log('\n✅ Usuario:', user.email);
    console.log('ID:', user.id);
    
    const memberships = db.prepare(`
      SELECT m.*, t.name as tenant_name 
      FROM memberships m 
      JOIN tenants t ON t.id = m.tenant_id 
      WHERE m.user_id = ?
    `).all(user.id);
    
    console.log('\n📋 Memberships:');
    memberships.forEach(m => {
      console.log(`  - ${m.tenant_name}: ${m.role}`);
    });
  } else {
    console.log('❌ Usuario no encontrado');
  }
} catch (error) {
  console.error('Error:', error);
} finally {
  db.close();
}
