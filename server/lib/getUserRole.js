// server/lib/getUserRole.js
const db = require("../db/connection");

/**
 * Obtiene el rol del usuario en un workspace específico.
 * 
 * @param {string} userId - ID del usuario
 * @param {string} tenantId - ID del workspace/tenant
 * @returns {string|null} - 'owner', 'admin', 'member', o null si no es miembro
 */
function getUserRole(userId, tenantId) {
  if (!userId || !tenantId) {
    return null;
  }

  const membership = db
    .prepare(
      `SELECT role 
       FROM memberships 
       WHERE user_id = ? AND tenant_id = ? 
       LIMIT 1`
    )
    .get(userId, tenantId);

  return membership?.role || null;
}

/**
 * Verifica si el usuario es admin u owner en el workspace.
 * 
 * @param {string} userId - ID del usuario
 * @param {string} tenantId - ID del workspace/tenant
 * @returns {boolean} - true si es admin u owner
 */
function isAdminOrOwner(userId, tenantId) {
  const role = getUserRole(userId, tenantId);
  return role === 'admin' || role === 'owner';
}

/**
 * Verifica si el usuario es member (solo member, no admin ni owner).
 * 
 * @param {string} userId - ID del usuario
 * @param {string} tenantId - ID del workspace/tenant
 * @returns {boolean} - true si es member
 */
function isMember(userId, tenantId) {
  const role = getUserRole(userId, tenantId);
  return role === 'member';
}

module.exports = {
  getUserRole,
  isAdminOrOwner,
  isMember,
};
