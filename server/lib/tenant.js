// server/lib/tenant.js
const db = require("../db/connection");

/**
 * requireTenantRole(["owner","admin","member"])
 * - Exige que el usuario tenga alguno de los roles permitidos en el tenant actual.
 * - Usa req.tenantRole si ya viene de injectTenant; si no, consulta memberships.
 */
function requireTenantRole(allowed = []) {
  const ALLOWED = Array.isArray(allowed) ? allowed : [allowed];

  return (req, res, next) => {
    const tenantId = req.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    // Si injectTenant ya puso rol, úsalo
    let role = req.tenantRole || null;

    // Si no, consulta membership
    if (!role) {
      const row = db
        .prepare(
          `SELECT role FROM memberships WHERE user_id = ? AND tenant_id = ? LIMIT 1`
        )
        .get(userId, tenantId);
      role = row?.role || null;
    }

    if (!role) return res.status(403).json({ error: "forbidden_tenant" });

    // Elevación: owner >= admin >= member
    if (isAllowed(role, ALLOWED)) return next();
    return res.status(403).json({ error: "forbidden_role" });
  };
}

function isAllowed(actualRole, allowedList) {
  const wantsOwner = allowedList.includes("owner");
  const wantsAdmin = allowedList.includes("admin");
  const wantsMember = allowedList.includes("member");

  if (actualRole === "owner") return true;            // puede todo
  if (actualRole === "admin") return wantsAdmin || wantsMember;
  if (actualRole === "member") return wantsMember || allowedList.length === 0;
  return false;
}

module.exports = { requireTenantRole };


// const Database = require('better-sqlite3');
// const path = require('path');
// const { MULTI_TENANT_ENABLED, DEFAULT_TENANT_ID } = require('./flags');

// const db = new Database(path.join(__dirname, '..', 'crm.db'));

// function seedDefaultTenant() {
//   const id = DEFAULT_TENANT_ID;
//   const exists = db.prepare('SELECT id FROM tenants WHERE id=?').get(id);
//   if (!exists) {
//     db.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?,?,?)')
//       .run(id, 'Demo', Date.now());
//   }
// }
// seedDefaultTenant();

// module.exports = function tenant(req, res, next) {
//   if (!MULTI_TENANT_ENABLED) {
//     req.tenantId = DEFAULT_TENANT_ID;
//     return next();
//   }

//   const header = (req.headers['x-tenant-id'] || '').toString().trim();
//   if (!header) return res.status(400).json({ error: 'Falta header x-tenant-id' });

//   const exists = db.prepare('SELECT id FROM tenants WHERE id=?').get(header);
//   if (!exists) return res.status(404).json({ error: 'Tenant no existe' });

//   req.tenantId = header;
//   next();
// };
