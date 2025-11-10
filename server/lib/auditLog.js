// server/lib/auditLog.js
/**
 * Sistema de auditoría para registrar acciones críticas
 * Registra: login, cambio de rol, creación workspace, acceso admin, etc.
 */

const db = require("../db/connection");
const crypto = require("crypto");

/**
 * Crea la tabla audit_logs si no existe
 */
function ensureAuditTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      tenant_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_user_tenant ON audit_logs(user_id, tenant_id, created_at DESC);
  `);
}

// Inicializar tabla al cargar el módulo
ensureAuditTable();

/**
 * Registra una acción en el log de auditoría
 * 
 * @param {Object} params
 * @param {string} params.userId - ID del usuario que realizó la acción
 * @param {string} [params.tenantId] - ID del workspace relacionado
 * @param {string} params.action - Tipo de acción (ej: 'login', 'change_role', 'create_workspace')
 * @param {string} [params.resourceType] - Tipo de recurso (ej: 'user', 'workspace', 'lead')
 * @param {string} [params.resourceId] - ID del recurso afectado
 * @param {Object} [params.details] - Detalles adicionales (se guarda como JSON)
 * @param {string} [params.ipAddress] - IP del cliente
 * @param {string} [params.userAgent] - User agent del cliente
 * @param {Object} [req] - Request object (para extraer IP y user agent automáticamente)
 */
function log(params, req = null) {
  try {
    const id = crypto.randomUUID();
    const now = Date.now();

    // Extraer IP y user agent del request si está disponible
    let ipAddress = params.ipAddress;
    let userAgent = params.userAgent;

    if (req && !ipAddress) {
      ipAddress =
        req.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.get("x-real-ip") ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        null;
    }

    if (req && !userAgent) {
      userAgent = req.get("user-agent") || null;
    }

    const details = params.details
      ? JSON.stringify(params.details)
      : null;

    db.prepare(
      `INSERT INTO audit_logs 
       (id, user_id, tenant_id, action, resource_type, resource_id, details, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      params.userId || null,
      params.tenantId || null,
      params.action,
      params.resourceType || null,
      params.resourceId || null,
      details,
      ipAddress,
      userAgent,
      now
    );

    // Log en consola para debug
    console.log(`📝 AUDIT: ${params.action} by ${params.userId || "anonymous"} in ${params.tenantId || "n/a"}`);

    return { id, created_at: now };
  } catch (error) {
    console.error("❌ Error logging audit:", error);
    // No lanzamos error para no interrumpir el flujo principal
    return null;
  }
}

/**
 * Obtiene logs de auditoría con filtros
 * 
 * @param {Object} filters
 * @param {string} [filters.userId] - Filtrar por usuario
 * @param {string} [filters.tenantId] - Filtrar por workspace
 * @param {string} [filters.action] - Filtrar por tipo de acción
 * @param {number} [filters.since] - Timestamp desde
 * @param {number} [filters.until] - Timestamp hasta
 * @param {number} [filters.limit=100] - Máximo de resultados
 * @returns {Array} Array de logs
 */
function query(filters = {}) {
  try {
    let sql = "SELECT * FROM audit_logs WHERE 1=1";
    const params = [];

    if (filters.userId) {
      sql += " AND user_id = ?";
      params.push(filters.userId);
    }

    if (filters.tenantId) {
      sql += " AND tenant_id = ?";
      params.push(filters.tenantId);
    }

    if (filters.action) {
      sql += " AND action = ?";
      params.push(filters.action);
    }

    if (filters.since) {
      sql += " AND created_at >= ?";
      params.push(filters.since);
    }

    if (filters.until) {
      sql += " AND created_at <= ?";
      params.push(filters.until);
    }

    sql += " ORDER BY created_at DESC LIMIT ?";
    params.push(filters.limit || 100);

    const rows = db.prepare(sql).all(...params);

    // Parsear JSON de details
    return rows.map((row) => ({
      ...row,
      details: row.details ? JSON.parse(row.details) : null,
    }));
  } catch (error) {
    console.error("❌ Error querying audit logs:", error);
    return [];
  }
}

/**
 * Acciones estándar para usar en el sistema
 */
const ACTIONS = {
  // Autenticación
  LOGIN: "login",
  LOGOUT: "logout",
  REGISTER: "register",
  LOGIN_FAILED: "login_failed",

  // Workspaces
  CREATE_WORKSPACE: "create_workspace",
  DELETE_WORKSPACE: "delete_workspace",
  JOIN_WORKSPACE: "join_workspace",
  SWITCH_WORKSPACE: "switch_workspace",

  // Roles y permisos
  CHANGE_ROLE: "change_role",
  INVITE_USER: "invite_user",
  REMOVE_USER: "remove_user",

  // Admin
  ACCESS_ADMIN_PANEL: "access_admin_panel",
  TOGGLE_USER_ACTIVE: "toggle_user_active",

  // CRM
  CREATE_LEAD: "create_lead",
  UPDATE_LEAD: "update_lead",
  DELETE_LEAD: "delete_lead",
  CREATE_DEAL: "create_deal",
  UPDATE_DEAL: "update_deal",
  DELETE_DEAL: "delete_deal",

  // Seguridad
  UNAUTHORIZED_ACCESS: "unauthorized_access",
  FORBIDDEN_ACCESS: "forbidden_access",
};

module.exports = {
  log,
  query,
  ACTIONS,
  ensureAuditTable,
};
