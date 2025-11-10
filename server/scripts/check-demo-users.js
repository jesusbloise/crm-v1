const db = require('../db/connection');

const tenantId = 'demo';

const users = db.prepare(`
  SELECT 
    u.id, 
    u.email, 
    u.name, 
    m.role 
  FROM users u 
  INNER JOIN memberships m ON m.user_id = u.id 
  WHERE m.tenant_id = ? 
  ORDER BY u.email
`).all(tenantId);

console.log(`\n👥 Usuarios en workspace "${tenantId}": ${users.length}\n`);
console.table(users);
