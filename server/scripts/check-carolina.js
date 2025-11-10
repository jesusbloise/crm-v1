const db = require('../db/connection');

console.log('=== VERIFICANDO ROL DE CAROLINA ===\n');

const carolina = db.prepare(`
  SELECT u.id, u.email, u.name 
  FROM users u 
  WHERE email LIKE '%carolina%'
`).get();

console.log('Usuario encontrado:', carolina);

if (carolina) {
  console.log('\nMemberships de Carolina:');
  const memberships = db.prepare(`
    SELECT 
      m.tenant_id, 
      t.name as workspace_name, 
      m.role 
    FROM memberships m 
    JOIN tenants t ON t.id = m.tenant_id 
    WHERE m.user_id = ?
  `).all(carolina.id);
  
  console.table(memberships);
  
  console.log('\n¿Tiene rol admin u owner?', 
    memberships.some(m => m.role === 'admin' || m.role === 'owner')
  );
} else {
  console.log('Carolina no encontrada en la base de datos');
}
