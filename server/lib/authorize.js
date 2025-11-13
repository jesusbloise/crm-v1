// server/lib/authorize.js
const db = require("../db/connection");

/**
 * Resuelve el ID del usuario del request (compatible con middlewares existentes)
 */
function resolveUserId(req) {
  const id = req.user?.id || req.auth?.sub;
  
  // 🔍 DEBUG: Solo loguear si hay discrepancia o es interesante
  if (req.user?.id !== req.auth?.sub) {
    console.log('🔍 [resolveUserId] Mismatch detected:', {
      'req.user.id': req.user?.id,
      'req.auth.sub': req.auth?.sub,
      'resolved': id
    });
  }
  
  return id;
}

/**
 * Obtiene el rol GLOBAL del usuario (de tabla users, no memberships)
 * @param {string} userId - ID del usuario
 * @returns {Promise<string|null>} - Rol global del usuario ('owner', 'admin', 'member') o null
 */
async function getUserRole(userId) {
  if (!userId) return null;

  const user = await db
    .prepare(`SELECT role FROM users WHERE id = ? LIMIT 1`)
    .get(userId);

  return user?.role || null;
}

/**
 * Verifica si el usuario es admin/owner GLOBAL
 * @param {string} userId - ID del usuario
 * @returns {Promise<boolean>}
 */
async function isAdmin(userId) {
  const role = await getUserRole(userId);
  return role === "admin" || role === "owner";
}

/**
 * Verifica si el usuario es owner GLOBAL (Dios del sistema)
 * @param {string} userId - ID del usuario
 * @returns {Promise<boolean>}
 */
async function isOwner(userId) {
  const role = await getUserRole(userId);
  return role === "owner";
}

/**
 * Verifica si el usuario es member (solo member, no admin ni owner)
 * @param {string} userId - ID del usuario
 * @returns {Promise<boolean>}
 */
async function isMember(userId) {
  const role = await getUserRole(userId);
  return role === "member";
}

/**
 * Middleware: Verifica que el usuario pueda leer el recurso
 * - Admin/Owner GLOBALES pueden leer todo
 * - Members solo pueden leer sus propios recursos
 * 
 * @param {string} table - Nombre de la tabla (leads, contacts, etc.)
 * @param {string} idField - Campo que identifica el recurso (por defecto 'id')
 */
function canRead(table, idField = "id") {
  return async (req, res, next) => {
    const userId = resolveUserId(req);
    const tenantId = req.tenantId;
    const resourceId = req.params[idField];

    if (!userId || !tenantId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    // Si es admin u owner GLOBAL, puede ver todo
    if (await isAdmin(userId)) {
      req.isAdmin = true;
      return next();
    }

    // Si es member, verificar ownership
    if (resourceId) {
      const resource = await db
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
 * - Admin/Owner GLOBALES pueden escribir todo
 * - Members solo pueden escribir sus propios recursos
 * 
 * @param {string} table - Nombre de la tabla
 * @param {string} idField - Campo que identifica el recurso (por defecto 'id')
 */
function canWrite(table, idField = "id") {
  return async (req, res, next) => {
    const userId = resolveUserId(req);
    const tenantId = req.tenantId;
    const resourceId = req.params[idField];

    if (!userId || !tenantId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    // Si es admin u owner GLOBAL, puede escribir todo
    if (await isAdmin(userId)) {
      req.isAdmin = true;
      return next();
    }

    // Si es un UPDATE/DELETE, verificar ownership
    if (resourceId && req.method !== "POST") {
      const resource = await db
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
 * - Admin/Owner GLOBALES pueden eliminar todo
 * - Members solo pueden eliminar sus propios recursos
 * 
 * @param {string} table - Nombre de la tabla
 * @param {string} idField - Campo que identifica el recurso
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

    // Si es admin u owner GLOBAL, puede eliminar todo
    if (await isAdmin(userId)) {
      req.isAdmin = true;
      return next();
    }

    // Verificar ownership
    const resource = await db
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
 * Agrega filtro WHERE para queries basado en rol GLOBAL
 * - Admin/Owner GLOBALES: sin filtro adicional (ven todo)
 * - Members: WHERE created_by = userId (solo ven lo que crearon)
 * 
 * @param {Object} req - Request object
 * @returns {Promise<string>} - SQL string para agregar a WHERE clause (ej: "AND created_by = 'user123'")
 */
async function getOwnershipFilter(req) {
  const userId = resolveUserId(req);

  if (!userId) {
    return "AND 1=0"; // bloquea si no hay auth
  }

  // Si es admin u owner GLOBAL, no filtra por created_by (ven todo)
  if (await isAdmin(userId)) {
    return "";
  }

  // Si es member, solo ve sus recursos
  return `AND created_by = '${userId}'`;
}

/**
 * Middleware: Requiere que el usuario tenga uno de los roles GLOBALES especificados
 * 
 * @param {string[]} allowedRoles - Array de roles permitidos: ['owner', 'admin', 'member']
 * @returns {Function} - Express middleware
 * 
 * @example
 * router.get('/admin/users', requireRole(['owner', 'admin']), (req, res) => {...})
 */
function requireRole(allowedRoles = []) {
  // Validación: el array no debe estar vacío
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    throw new Error("requireRole: allowedRoles debe ser un array no vacío de roles válidos");
  }

  return async (req, res, next) => {
    const userId = resolveUserId(req);

    if (!userId) {
      return res.status(401).json({ 
        error: "unauthorized",
        message: "Debes iniciar sesión" 
      });
    }

    const role = await getUserRole(userId);

    if (!role) {
      return res.status(403).json({ 
        error: "no_role",
        message: "Usuario sin rol asignado" 
      });
    }

    // Validar si el rol del usuario está en la lista permitida
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ 
        error: "insufficient_permissions",
        message: `Requiere rol: ${allowedRoles.join(" o ")}. Tu rol actual: ${role}`,
        required_roles: allowedRoles,
        current_role: role
      });
    }

    // Agregar info de rol al request para uso posterior
    req.userRole = role;
    req.isAdmin = role === "owner" || role === "admin";
    req.isOwner = role === "owner";
    req.isMember = role === "member";

    next();
  };
}

// ⚠️ DEPRECADO: requireRoleInAny ya no se usa (roles ahora son globales)
// Se mantiene por compatibilidad temporal
function requireRoleInAny(allowedRoles = []) {
  console.warn('⚠️ requireRoleInAny está DEPRECADO - usar requireRole() en su lugar');
  return requireRole(allowedRoles);
}

module.exports = {
  canRead,
  canWrite,
  canDelete,
  getOwnershipFilter,
  getUserRole,
  isAdmin,
  isOwner, // ⭐ NUEVO - verificar si es owner (Dios del sistema)
  isMember,
  resolveUserId,
  requireRole,
  requireRoleInAny, // ⚠️ DEPRECADO (mantener por compatibilidad)
};
