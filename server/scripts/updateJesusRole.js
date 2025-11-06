const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'crm.db');
const db = new Database(dbPath);

try {
  // Buscar el usuario jesusbloise
  const user = db.prepare(`SELECT id, email, name FROM users WHERE email = 'jesusbloise@gmail.com'`).get();
  
  if (!user) {
    console.log('❌ Usuario jesusbloise@gmail.com no encontrado');
    process.exit(1);
  }
  
  console.log('✅ Usuario encontrado:', user);
  
  // Ver membresías actuales
  const currentMemberships = db.prepare(`SELECT * FROM memberships WHERE user_id = ?`).all(user.id);
  console.log('\n📋 Membresías actuales:', currentMemberships);
  
  // Actualizar todas las membresías de 'owner' a 'admin'
  const result = db.prepare(`
    UPDATE memberships 
    SET role = 'admin' 
    WHERE user_id = ? AND role = 'owner'
  `).run(user.id);
  
  console.log(`\n✅ ${result.changes} membresías actualizadas de 'owner' a 'admin'`);
  
  // Ver membresías actualizadas
  const updatedMemberships = db.prepare(`SELECT * FROM memberships WHERE user_id = ?`).all(user.id);
  console.log('\n📋 Membresías actualizadas:', updatedMemberships);
  
} catch (error) {
  console.error('❌ Error:', error);
} finally {
  db.close();
}
