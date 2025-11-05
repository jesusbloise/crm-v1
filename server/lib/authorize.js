// server/lib/authorize.js
const db = require("../db/connection");

/**
 * Resuelve el ID del usuario del request (compatible con middlewares existentes)
 */
function resolveUserId(req) {
  return req.user?.id || req.auth?.sub;
}

/**
 * Obtiene el rol del usuario en el tenant actual
 * @param {string} userId - ID del usuario
 * @param {string} tenantId - ID del tenant
 * @returns {string|null} - Rol del usuario ('owner', 'admin', 'user', etc.) o null
 */
function getUserRole(userId, tenantId) {
  if (!userId || !tenantId) return null;

  const membership = db
    .prepare(
      `SELECT role FROM memberships 
       WHERE user_id = ? AND tenant_id = ? 
       LIMIT 1`
    )
    .get(userId, tenantId);

  return membership?.role || null;
}

/**
 * Verifica si el usuario es admin/owner en el tenant actual
 * @param {string} userId - ID del usuario
 * @param {string} tenantId - ID del tenant
 * @returns {boolean}
 */
function isAdmin(userId, tenantId) {
  const role = getUserRole(userId, tenantId);
  return role === "admin" || role === "owner";
}

/**
 * Middleware: Verifica que el usuario pueda leer el recurso
 * - Admins pueden leer todo
 * - Users solo pueden leer sus propios recursos
 * 
 * @param {string} table - Nombre de la tabla (leads, contacts, etc.)
 * @param {string} idField - Campo que identifica el recurso (por defecto 'id')
 */
function canRead(table, idField = "id") {
  return (req, res, next) => {
    const userId = resolveUserId(req);
    const tenantId = req.tenantId;
    const resourceId = req.params[idField];

    if (!userId || !tenantId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    // Si es admin, puede ver todo
    if (isAdmin(userId, tenantId)) {
      req.isAdmin = true;
      return next();
    }

    // Si es user normal, verificar ownership
    if (resourceId) {
      const resource = db
        .prepare(
          `SELECT created_by FROM ${table} 
           WHERE id = ? AND tenant_id = ? 
           LIMIT 1`
        )
        .get(resourceId, tenantId);

      if (!resource) {
        return res.status(404).json({ error: "not_found" });
      }

      if (resource.created_by !== userId) {
        return res.status(403).json({ error: "forbidden" });
      }
    }

    req.isAdmin = false;
    next();
  };
}

/**
 * Middleware: Verifica que el usuario pueda escribir (crear/editar) el recurso
 * - Admins pueden escribir todo
 * - Users solo pueden escribir sus propios recursos
 * 
 * @param {string} table - Nombre de la tabla
 * @param {string} idField - Campo que identifica el recurso (por defecto 'id')
 */
function canWrite(table, idField = "id") {
  return (req, res, next) => {
    const userId = resolveUserId(req);
    const tenantId = req.tenantId;
    const resourceId = req.params[idField];

    if (!userId || !tenantId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    // Si es admin, puede escribir todo
    if (isAdmin(userId, tenantId)) {
      req.isAdmin = true;
      return next();
    }

    // Si es un UPDATE/DELETE, verificar ownership
    if (resourceId && req.method !== "POST") {
      const resource = db
        .prepare(
          `SELECT created_by FROM ${table} 
           WHERE id = ? AND tenant_id = ? 
           LIMIT 1`
        )
        .get(resourceId, tenantId);

      if (!resource) {
        return res.status(404).json({ error: "not_found" });
      }

      if (resource.created_by !== userId) {
        return res.status(403).json({ error: "forbidden_not_owner" });
      }
    }

    req.isAdmin = false;
    next();
  };
}

/**
 * Middleware: Verifica que el usuario pueda eliminar el recurso
 * - Admins pueden eliminar todo
 * - Users solo pueden eliminar sus propios recursos
 * 
 * @param {string} table - Nombre de la tabla
 * @param {string} idField - Campo que identifica el recurso
 */
function canDelete(table, idField = "id") {
  return (req, res, next) => {
    const userId = resolveUserId(req);
    const tenantId = req.tenantId;
    const resourceId = req.params[idField];

    if (!userId || !tenantId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    if (!resourceId) {
      return res.status(400).json({ error: "resource_id_required" });
    }

    // Si es admin, puede eliminar todo
    if (isAdmin(userId, tenantId)) {
      req.isAdmin = true;
      return next();
    }

    // Verificar ownership
    const resource = db
      .prepare(
        `SELECT created_by FROM ${table} 
         WHERE id = ? AND tenant_id = ? 
         LIMIT 1`
      )
      .get(resourceId, tenantId);

    if (!resource) {
      return res.status(404).json({ error: "not_found" });
    }

    if (resource.created_by !== userId) {
      return res.status(403).json({ error: "forbidden_not_owner" });
    }

    req.isAdmin = false;
    next();
  };
}

/**
 * Agrega filtro WHERE para queries basado en rol
 * - Admins: sin filtro adicional (ven todo del tenant)
 * - Users: WHERE created_by = userId
 * 
 * @param {Object} req - Request object
 * @returns {string} - SQL string para agregar a WHERE clause (ej: "AND created_by = 'user123'")
 */
function getOwnershipFilter(req) {
  const userId = resolveUserId(req);
  const tenantId = req.tenantId;

  if (!userId || !tenantId) {
    return "AND 1=0"; // bloquea si no hay auth
  }

  // Si es admin, no filtra por created_by
  if (isAdmin(userId, tenantId)) {
    return "";
  }

  // Si es user normal, solo ve sus recursos
  return `AND created_by = '${userId}'`;
}

module.exports = {
  canRead,
  canWrite,
  canDelete,
  getOwnershipFilter,
  getUserRole,
  isAdmin,
  resolveUserId,
};
