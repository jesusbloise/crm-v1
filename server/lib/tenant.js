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

