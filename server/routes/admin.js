// server/routes/admin.js
const express = require("express");
const router = express.Router();
const db = require("../db/connection");
const { requireRole, resolveUserId } = require("../lib/authorize");
const { log: auditLog, ACTIONS } = require("../lib/auditLog");

/* ==================== GET /admin/users ==================== */
// 🔒 Solo admin/owner pueden ver lista de usuarios
router.get("/admin/users", requireRole(["admin", "owner"]), (req, res) => {
  try {
    const requesterId = resolveUserId(req);
    const currentTenant = req.tenantId;
    
    console.log(`🔐 Admin access granted to user ${requesterId} in tenant ${currentTenant}`);
    
    // 📝 Audit: acceso al panel de admin
    auditLog({ 
      userId: requesterId, 
      tenantId: currentTenant,
      action: ACTIONS.ACCESS_ADMIN_PANEL,
      details: { endpoint: "/admin/users" }
    }, req);
    
    // Si no hay tenant activo, devolver error
    if (!currentTenant) {
      return res.status(400).json({ 
        error: "no_active_tenant",
        message: "Debes tener un workspace activo para ver usuarios"
      });
    }

    // Obtener solo los usuarios que son miembros del workspace actual
    const users = db
      .prepare(`
        SELECT DISTINCT
          u.id,
          u.email,
          u.name,
          u.active,
          u.created_at,
          u.updated_at
        FROM users u
        INNER JOIN memberships m ON m.user_id = u.id
        WHERE m.tenant_id = ?
        ORDER BY u.created_at DESC
      `)
      .all(currentTenant);

    console.log(`📊 Found ${users.length} users in tenant ${currentTenant}`);

    // Para cada usuario, obtener sus workspaces
    const usersWithWorkspaces = users.map(user => {
      const workspaces = db
        .prepare(`
          SELECT 
            t.id as tenant_id,
            t.name as tenant_name,
            m.role
          FROM memberships m
          JOIN tenants t ON t.id = m.tenant_id
          WHERE m.user_id = ?
          ORDER BY t.name
        `)
        .all(user.id);

      return {
        ...user,
        active: user.active === 1, // Convertir 0/1 a boolean
        workspaces
      };
    });

    res.json({ users: usersWithWorkspaces });
  } catch (err) {
    console.error("Error getting users:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

/* ==================== POST /admin/users/:userId/toggle-active ==================== */
// 🔒 Solo admin/owner pueden activar/desactivar usuarios
router.post("/admin/users/:userId/toggle-active", requireRole(["admin", "owner"]), (req, res) => {
  try {
    const { userId } = req.params;
    const requesterId = resolveUserId(req);
    
    console.log(`� Toggle active request from ${requesterId} for user ${userId}`);

    // No permitir que se desactive a sí mismo
    if (userId === requesterId) {
      return res.status(400).json({ error: "cannot_deactivate_yourself" });
    }

    // Obtener el estado actual del usuario
    const user = db.prepare("SELECT active FROM users WHERE id = ?").get(userId);
    if (!user) {
      return res.status(404).json({ error: "user_not_found" });
    }

    // Cambiar el estado
    const newActive = user.active === 1 ? 0 : 1;
    db.prepare("UPDATE users SET active = ?, updated_at = ? WHERE id = ?")
      .run(newActive, Date.now(), userId);

    // 📝 Audit: activar/desactivar usuario
    auditLog({ 
      userId: requesterId, 
      tenantId: req.tenantId,
      action: ACTIONS.TOGGLE_USER_ACTIVE,
      resourceType: "user",
      resourceId: userId,
      details: { active: newActive === 1, modified_by: requesterId }
    }, req);

    res.json({ success: true, active: newActive === 1 });
  } catch (err) {
    console.error("Error toggling user active status:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

/* ==================== POST /admin/users/:userId/change-role ==================== */
// 🔒 Solo admin/owner pueden cambiar roles
router.post("/admin/users/:userId/change-role", requireRole(["admin", "owner"]), (req, res) => {
  try {
    const { userId } = req.params;
    const { tenantId, newRole } = req.body;
    const requesterId = resolveUserId(req);
    
    console.log(`� Change role request from ${requesterId} for user ${userId} to ${newRole} in tenant ${tenantId}`);

    // Validar el rol
    const validRoles = ["admin", "member", "owner"];
    if (!validRoles.includes(newRole)) {
      return res.status(400).json({ 
        error: "invalid_role",
        valid_roles: validRoles 
      });
    }

    // Verificar que la membresía exista
    const membership = db
      .prepare("SELECT * FROM memberships WHERE user_id = ? AND tenant_id = ?")
      .get(userId, tenantId);
    
    if (!membership) {
      return res.status(404).json({ error: "membership_not_found" });
    }

    // No permitir cambiar el rol de sí mismo
    if (userId === requesterId) {
      return res.status(400).json({ error: "cannot_change_own_role" });
    }

    // Solo owner puede otorgar rol "owner"
    if (newRole === "owner" && req.userRole !== "owner") {
      return res.status(403).json({ 
        error: "only_owner_can_assign_owner",
        message: "Solo un owner puede asignar el rol de owner" 
      });
    }

    // Obtener rol anterior para el log
    const previousRole = membership.role;

    // Actualizar el rol
    db.prepare("UPDATE memberships SET role = ?, updated_at = ? WHERE user_id = ? AND tenant_id = ?")
      .run(newRole, Date.now(), userId, tenantId);

    console.log(`✅ Role changed: user ${userId} is now ${newRole} in tenant ${tenantId}`);

    // 📝 Audit: cambio de rol
    auditLog({ 
      userId: requesterId, 
      tenantId: tenantId,
      action: ACTIONS.CHANGE_ROLE,
      resourceType: "user",
      resourceId: userId,
      details: { 
        previous_role: previousRole,
        new_role: newRole,
        modified_by: requesterId,
        tenant_id: tenantId
      }
    }, req);

    res.json({ success: true, role: newRole });
  } catch (err) {
    console.error("Error changing user role:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

module.exports = router;
