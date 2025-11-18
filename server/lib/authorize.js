// server/lib/authorize.js
const db = require("../db/connection");

/**
 * Resuelve el ID del usuario del request (compatible con middlewares existentes)
 */
function resolveUserId(req) {
  const id = req.user?.id || req.auth?.sub;

  // DEBUG acotado: solo si hay discrepancia
  if (req.user?.id !== req.auth?.sub) {
    console.log("🔍 [resolveUserId] Mismatch detected:", {
      "req.user.id": req.user?.id,
      "req.auth.sub": req.auth?.sub,
      resolved: id,
    });
  }

  return id;
}

/**
 * Rol GLOBAL del usuario (tabla users, NO memberships)
 */
async function getUserRole(userId) {
  if (!userId) return null;
  const row = await db.prepare(`SELECT role FROM users WHERE id = ? LIMIT 1`).get(userId);
  return row?.role || null;
}

async function isAdmin(userId) {
  const role = await getUserRole(userId);
  return role === "admin" || role === "owner";
}

async function isOwner(userId) {
  const role = await getUserRole(userId);
  return role === "owner";
}

async function isMember(userId) {
  const role = await getUserRole(userId);
  return role === "member";
}

/**
 * Middleware de lectura
 */
function canRead(table, idField = "id") {
  return async (req, res, next) => {
    const userId = resolveUserId(req);
    const tenantId = req.tenantId;
    const resourceId = req.params[idField];

    if (!userId || !tenantId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    if (await isAdmin(userId)) {
      req.isAdmin = true;
      return next();
    }

    if (resourceId) {
      const resource = await db
        .prepare(
          `SELECT created_by FROM ${table}
           WHERE id = ? AND tenant_id = ?
           LIMIT 1`
        )
        .get(resourceId, tenantId);

      if (!resource) return res.status(404).json({ error: "not_found" });
      if (resource.created_by !== userId) {
        return res.status(403).json({ error: "forbidden" });
      }
    }

    req.isAdmin = false;
    next();
  };
}

/**
 * Middleware de escritura
 */
function canWrite(table, idField = "id") {
  return async (req, res, next) => {
    const userId = resolveUserId(req);
    const tenantId = req.tenantId;
    const resourceId = req.params[idField];

    if (!userId || !tenantId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    if (await isAdmin(userId)) {
      req.isAdmin = true;
      return next();
    }

    // Para PATCH/PUT/DELETE: verificar ownership
    if (resourceId && req.method !== "POST") {
      const resource = await db
        .prepare(
          `SELECT created_by FROM ${table}
           WHERE id = ? AND tenant_id = ?
           LIMIT 1`
        )
        .get(resourceId, tenantId);

      if (!resource) return res.status(404).json({ error: "not_found" });
      if (resource.created_by !== userId) {
        return res.status(403).json({ error: "forbidden_not_owner" });
      }
    }

    req.isAdmin = false;
    next();
  };
}

/**
 * Middleware de borrado
 */
function canDelete(table, idField = "id") {
  return async (req, res, next) => {
    const userId = resolveUserId(req);
    const tenantId = req.tenantId;
    const resourceId = req.params[idField];

    if (!userId || !tenantId) {
      return res.status(401).json({ error: "unauthorized" });
    }
    if (!resourceId) {
      return res.status(400).json({ error: "resource_id_required" });
    }

    if (await isAdmin(userId)) {
      req.isAdmin = true;
      return next();
    }

    const resource = await db
      .prepare(
        `SELECT created_by FROM ${table}
         WHERE id = ? AND tenant_id = ?
         LIMIT 1`
      )
      .get(resourceId, tenantId);

    if (!resource) return res.status(404).json({ error: "not_found" });
    if (resource.created_by !== userId) {
      return res.status(403).json({ error: "forbidden_not_owner" });
    }

    req.isAdmin = false;
    next();
  };
}

/**
 * Filtro de ownership para usar en consultas de LISTADO.
 * - Admin/Owner global → sin filtro (ven todo)
 * - Member → restringe por created_by
 *
 * @param {Object} req
 * @param {string=} alias  (opcional) alias de tabla, ej: "a" → "AND a.created_by = '...'"
 * @returns {Promise<string>} cláusula empezando con "" o "AND ..."
 */
async function getOwnershipFilter(req, alias) {
  const userId = resolveUserId(req);
  if (!userId) {
    // sin user => bloquear listados
    return "AND 1=0";
  }

  if (await isAdmin(userId)) {
    // admin/owner ven todo
    return "";
  }

  const col = alias ? `${alias}.created_by` : "created_by";
  // escape defensivo de comillas simples para evitar romper el SQL
  const safeUser = String(userId).replace(/'/g, "''");
  return `AND ${col} = '${safeUser}'`;
}

/**
 * Middleware de roles globales
 */
function requireRole(allowedRoles = []) {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    throw new Error("requireRole: allowedRoles debe ser un array no vacío de roles válidos");
  }

  return async (req, res, next) => {
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "unauthorized", message: "Debes iniciar sesión" });
    }

    const role = await getUserRole(userId);
    if (!role) {
      return res.status(403).json({ error: "no_role", message: "Usuario sin rol asignado" });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        error: "insufficient_permissions",
        message: `Requiere rol: ${allowedRoles.join(" o ")}. Tu rol actual: ${role}`,
        required_roles: allowedRoles,
        current_role: role,
      });
    }

    req.userRole = role;
    req.isAdmin = role === "owner" || role === "admin";
    req.isOwner = role === "owner";
    req.isMember = role === "member";
    next();
  };
}

// ⚠️ Deprecado pero conservado por compatibilidad
function requireRoleInAny(allowedRoles = []) {
  console.warn("⚠️ requireRoleInAny está DEPRECADO - usa requireRole()");
  return requireRole(allowedRoles);
}

module.exports = {
  canRead,
  canWrite,
  canDelete,
  getOwnershipFilter,   // ahora acepta alias opcional
  getUserRole,
  isAdmin,
  isOwner,
  isMember,
  resolveUserId,
  requireRole,
  requireRoleInAny,
};
