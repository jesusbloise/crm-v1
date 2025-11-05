const db = require('better-sqlite3')('crm.db');

console.log('\n=== TENANTS ===');
const tenants = db.prepare('SELECT id, name, created_by FROM tenants').all();
console.table(tenants);

console.log('\n=== USERS ===');
const users = db.prepare('SELECT id, email, name FROM users').all();
console.table(users);

console.log('\n=== MEMBERSHIPS ===');
const memberships = db.prepare(`
  SELECT m.user_id, m.tenant_id, m.role, u.name as user_name, t.name as tenant_name
  FROM memberships m
  LEFT JOIN users u ON u.id = m.user_id
  LEFT JOIN tenants t ON t.id = m.tenant_id
`).all();
console.table(memberships);

db.close();
