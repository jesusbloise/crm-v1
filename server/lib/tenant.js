const Database = require('better-sqlite3');
const path = require('path');
const { MULTI_TENANT_ENABLED, DEFAULT_TENANT_ID } = require('./flags');

const db = new Database(path.join(__dirname, '..', 'crm.db'));

function seedDefaultTenant() {
  const id = DEFAULT_TENANT_ID;
  const exists = db.prepare('SELECT id FROM tenants WHERE id=?').get(id);
  if (!exists) {
    db.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?,?,?)')
      .run(id, 'Demo', Date.now());
  }
}
seedDefaultTenant();

module.exports = function tenant(req, res, next) {
  if (!MULTI_TENANT_ENABLED) {
    req.tenantId = DEFAULT_TENANT_ID;
    return next();
  }

  const header = (req.headers['x-tenant-id'] || '').toString().trim();
  if (!header) return res.status(400).json({ error: 'Falta header x-tenant-id' });

  const exists = db.prepare('SELECT id FROM tenants WHERE id=?').get(header);
  if (!exists) return res.status(404).json({ error: 'Tenant no existe' });

  req.tenantId = header;
  next();
};
