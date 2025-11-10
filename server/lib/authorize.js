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
 * Verifica si el usuario es member (solo member, no admin ni owner)
 * @param {string} userId - ID del usuario
 * @param {string} tenantId - ID del tenant
 * @returns {boolean}
 */
function isMember(userId, tenantId) {
  const role = getUserRole(userId, tenantId);
  return role === "member";
}

/**
 * Middleware: Verifica que el usuario pueda leer el recurso
 * - Admin/Owner pueden leer todo del workspace
 * - Members solo pueden leer sus propios recursos
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

    // Si es admin u owner, puede ver todo
    if (isAdmin(userId, tenantId)) {
      req.isAdmin = true;
      return next();
    }

    // Si es member, verificar ownership
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
 * - Admin/Owner pueden escribir todo del workspace
 * - Members solo pueden escribir sus propios recursos
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

    // Si es admin u owner, puede escribir todo
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
 * - Admin/Owner pueden eliminar todo del workspace
 * - Members solo pueden eliminar sus propios recursos
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

    // Si es admin u owner, puede eliminar todo
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
 * - Admin/Owner: sin filtro adicional (ven todo del workspace)
 * - Members: WHERE created_by = userId (solo ven lo que crearon)
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

  // Si es admin u owner, no filtra por created_by (ven todo del workspace)
  if (isAdmin(userId, tenantId)) {
    return "";
  }

  // Si es member, solo ve sus recursos
  return `AND created_by = '${userId}'`;
}

/**
 * Middleware: Requiere que el usuario tenga uno de los roles especificados
 * en el workspace activo. Bloquea la request si no cumple.
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

  return (req, res, next) => {
    const userId = resolveUserId(req);
    const tenantId = req.tenantId;

    if (!userId) {
      return res.status(401).json({ 
        error: "unauthorized",
        message: "Debes iniciar sesión" 
      });
    }

    if (!tenantId) {
      return res.status(400).json({ 
        error: "no_tenant",
        message: "No hay workspace activo" 
      });
    }

    const role = getUserRole(userId, tenantId);

    if (!role) {
      return res.status(403).json({ 
        error: "not_member",
        message: "No eres miembro de este workspace" 
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
    req.isMember = role === "member";

    next();
  };
}

/**
 * Middleware: Requiere que el usuario tenga uno de los roles especificados
 * EN CUALQUIER WORKSPACE (no solo el activo).
 * 
 * Útil para acciones globales como crear nuevo workspace.
 * 
 * @param {string[]} allowedRoles - Array de roles permitidos: ['owner', 'admin']
 * @returns {Function} - Express middleware
 * 
 * @example
 * router.post('/tenants', requireRoleInAny(['owner', 'admin']), (req, res) => {...})
 */
function requireRoleInAny(allowedRoles = []) {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    throw new Error("requireRoleInAny: allowedRoles debe ser un array no vacío de roles válidos");
  }

  return (req, res, next) => {
    const userId = resolveUserId(req);
    
    // 🔍 DEBUG: Log de entrada
    console.log('🔍 [requireRoleInAny] Checking permissions:', {
      userId,
      allowedRoles,
      tenantId: req.tenantId,
      'req.user.id': req.user?.id,
      'req.auth.sub': req.auth?.sub
    });

    if (!userId) {
      console.log('❌ [requireRoleInAny] No userId, rejecting');
      return res.status(401).json({ 
        error: "unauthorized",
        message: "Debes iniciar sesión" 
      });
    }

    // Buscar si el usuario tiene alguno de los roles permitidos en CUALQUIER workspace
    const placeholders = allowedRoles.map(() => '?').join(',');
    const hasRole = db
      .prepare(
        `SELECT 1 FROM memberships 
         WHERE user_id = ? AND role IN (${placeholders})
         LIMIT 1`
      )
      .get(userId, ...allowedRoles);

    // 🔍 DEBUG: Log del resultado de la query
    console.log('🔍 [requireRoleInAny] Query result:', hasRole ? '✅ Found' : '❌ Not found');
    
    // 🔍 DEBUG: Mostrar todos los roles del usuario
    const userRoles = db
      .prepare('SELECT tenant_id, role FROM memberships WHERE user_id = ?')
      .all(userId);
    console.log('🔍 [requireRoleInAny] User roles in all workspaces:', userRoles);

    if (!hasRole) {
      console.log('❌ [requireRoleInAny] User does not have required role, blocking');
      return res.status(403).json({ 
        error: "insufficient_permissions",
        message: `Requieres ser ${allowedRoles.join(" o ")} en al menos un workspace`,
        required_roles: allowedRoles
      });
    }

    console.log('✅ [requireRoleInAny] Permission granted');
    // No seteamos req.userRole porque puede tener diferentes roles en diferentes workspaces
    next();
  };
}

module.exports = {
  canRead,
  canWrite,
  canDelete,
  getOwnershipFilter,
  getUserRole,
  isAdmin,
  isMember,
  resolveUserId,
  requireRole, // ⭐ NUEVO
  requireRoleInAny, // ⭐ NUEVO (para crear workspaces)
};
