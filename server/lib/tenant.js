// server/lib/tenant.js
const { resolveUserId } = require("./authorize");

/**
 * requireTenantRole(["owner","admin","member"]) - SIMPLIFICADO
 * - Exige que el usuario tenga alguno de los roles GLOBALES permitidos
 * - Usa req.tenantRole (inyectado por injectTenant) como rol GLOBAL
 * - Ya NO consulta memberships
 */
function requireTenantRole(allowed = []) {
  const ALLOWED = Array.isArray(allowed) ? allowed : [allowed];

  return (req, res, next) => {
    const tenantId = req.tenantId;
    const userId = resolveUserId(req); // ✅ consistente con el resto

    if (!tenantId || !userId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    // Rol global: prioriza lo que definió injectTenant; fallback a member
    const role = (req.tenantRole || req.userRole || "member").toLowerCase();

    if (isAllowed(role, ALLOWED)) return next();

    return res.status(403).json({
      error: "forbidden_role",
      message: `Requiere rol: ${ALLOWED.join(" o ")}. Tu rol: ${role}`,
    });
  };
}

function isAllowed(actualRole, allowedList) {
  // normaliza permitido
  const list = (allowedList || []).map((r) => String(r).toLowerCase());
  const wantsOwner = list.includes("owner");
  const wantsAdmin = list.includes("admin");
  const wantsMember = list.includes("member");

  if (actualRole === "owner") return true;                 // puede todo
  if (actualRole === "admin") return wantsAdmin || wantsMember;
  if (actualRole === "member") return wantsMember || list.length === 0;
  return false;
}

module.exports = { requireTenantRole };

