// server/routes/admin.js
const express = require("express");
const router = express.Router();
const db = require("../db/connection");
const { requireRole, resolveUserId } = require("../lib/authorize");
const { log: auditLog, ACTIONS } = require("../lib/auditLog");

/* ==================== GET /admin/users ==================== */
// 🔒 Solo admin/owner GLOBALES pueden ver lista de usuarios
router.get("/admin/users", requireRole(["admin", "owner"]), async (req, res) => {
  try {
    const requesterId = resolveUserId(req);
    
    console.log(`🔐 Admin access granted to user ${requesterId}`);
    
    // 📝 Audit: acceso al panel de admin
    auditLog({ 
      userId: requesterId, 
      tenantId: req.tenantId,
      action: ACTIONS.ACCESS_ADMIN_PANEL,
      details: { endpoint: "/admin/users" }
    }, req);
    
    // Obtener TODOS los usuarios con su ROL GLOBAL (✅ PostgreSQL)
    const users = await db
      .prepare(`
        SELECT 
          u.id,
          u.email,
          u.name,
          u.role,
          u.active,
          u.created_at,
          u.updated_at
        FROM users u
        ORDER BY 
          CASE u.role
            WHEN 'owner' THEN 1
            WHEN 'admin' THEN 2
            ELSE 3
          END,
          u.created_at DESC
      `)
      .all();

    console.log(`📊 Found ${users.length} users`);

    // Convertir active a boolean y agregar info de workspaces creados
    const usersWithDetails = await Promise.all(users.map(async user => {
      // Contar workspaces creados por este usuario (✅ PostgreSQL placeholder)
      const workspaceCount = await db
        .prepare(`SELECT COUNT(*) as count FROM tenants WHERE created_by = $1`)
        .get(user.id);

      return {
        ...user,
        active: Boolean(user.active), // PostgreSQL devuelve booleano
        workspaces_created: workspaceCount.count || 0
      };
    }));

    res.json({ users: usersWithDetails });
  } catch (err) {
    console.error("Error getting users:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

/* ==================== POST /admin/users/:userId/toggle-active ==================== */
// 🔒 Solo admin/owner pueden activar/desactivar usuarios
router.post("/admin/users/:userId/toggle-active", requireRole(["admin", "owner"]), async (req, res) => {
  try {
    const { userId } = req.params;
    const requesterId = resolveUserId(req);
    
    console.log(`🔄 Toggle active request from ${requesterId} for user ${userId}`);

    // No permitir que se desactive a sí mismo
    if (userId === requesterId) {
      return res.status(400).json({ error: "cannot_deactivate_yourself" });
    }

    // Obtener el estado actual del usuario (✅ PostgreSQL placeholder)
    const user = await db.prepare("SELECT active FROM users WHERE id = $1").get(userId);
    if (!user) {
      console.log('❌ User not found:', userId);
      return res.status(404).json({ error: "user_not_found" });
    }

    console.log(`📋 Current active status: ${user.active} (type: ${typeof user.active})`);

    // Cambiar el estado (✅ PostgreSQL: manejo de booleanos)
    const currentActive = Boolean(user.active);
    const newActive = !currentActive;
    
    await db.prepare("UPDATE users SET active = $1, updated_at = $2 WHERE id = $3")
      .run(newActive, Date.now(), userId);

    console.log(`✅ User ${userId} active status changed from ${currentActive} to ${newActive}`);

    // 📝 Audit: activar/desactivar usuario
    auditLog({ 
      userId: requesterId, 
      tenantId: req.tenantId,
      action: ACTIONS.TOGGLE_USER_ACTIVE,
      resourceType: "user",
      resourceId: userId,
      details: { active: newActive, modified_by: requesterId }
    }, req);

    res.json({ success: true, active: newActive });
  } catch (err) {
    console.error("Error toggling user active status:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

/* ==================== POST /admin/users/:userId/change-role ==================== */
// 🔒 Solo admin/owner GLOBALES pueden cambiar el ROL GLOBAL de usuarios
router.post("/admin/users/:userId/change-role", requireRole(["admin", "owner"]), async (req, res) => {
  try {
    const { userId } = req.params;
    const { newRole } = req.body; // Ya no necesitamos tenantId
    const requesterId = resolveUserId(req);
    const requesterRole = req.userRole;
    
    console.log(`🔄 Change GLOBAL role: ${requesterId} (${requesterRole}) → user ${userId} to ${newRole}`);

    // Validar el rol
    const validRoles = ["owner", "admin", "member"];
    if (!validRoles.includes(newRole)) {
      return res.status(400).json({ 
        error: "invalid_role",
        valid_roles: validRoles,
        message: "Rol inválido. Debe ser: owner, admin o member"
      });
    }

    // Verificar que el usuario existe (✅ PostgreSQL placeholder)
    const user = await db
      .prepare("SELECT id, email, role FROM users WHERE id = $1")
      .get(userId);
    
    if (!user) {
      return res.status(404).json({ error: "user_not_found" });
    }

    // No permitir cambiar el rol de sí mismo
    if (userId === requesterId) {
      return res.status(400).json({ error: "cannot_change_own_role" });
    }

    // Solo OWNER puede:
    // 1. Otorgar rol "owner" a otros
    // 2. Quitar rol "owner" a otros
    if (requesterRole !== "owner") {
      if (newRole === "owner") {
        return res.status(403).json({ 
          error: "only_owner_can_assign_owner",
          message: "Solo el owner global puede asignar el rol de owner" 
        });
      }
      if (user.role === "owner") {
        return res.status(403).json({ 
          error: "only_owner_can_modify_owner",
          message: "Solo el owner global puede modificar a otro owner" 
        });
      }
    }

    // Protección adicional: No permitir que haya 0 owners
    if (user.role === "owner" && newRole !== "owner") {
      const ownerCount = await db
        .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'owner'")
        .get();
      
      if (ownerCount.count <= 1) {
        return res.status(400).json({ 
          error: "must_have_at_least_one_owner",
          message: "Debe haber al menos 1 owner en el sistema"
        });
      }
    }

    const previousRole = user.role;

    // Actualizar el ROL GLOBAL (✅ PostgreSQL placeholders)
    await db.prepare("UPDATE users SET role = $1, updated_at = $2 WHERE id = $3")
      .run(newRole, Date.now(), userId);

    console.log(`✅ GLOBAL role changed: ${user.email} is now ${newRole} (was ${previousRole})`);

    // 📝 Audit: cambio de rol global
    auditLog({ 
      userId: requesterId, 
      tenantId: req.tenantId,
      action: ACTIONS.CHANGE_ROLE,
      resourceType: "user",
      resourceId: userId,
      details: { 
        user_email: user.email,
        previous_role: previousRole,
        new_role: newRole,
        modified_by: requesterId,
        scope: "global" // ⭐ Importante: es rol GLOBAL
      }
    }, req);

    res.json({ 
      success: true, 
      user: {
        id: user.id,
        email: user.email,
        role: newRole
      },
      message: `Usuario ${user.email} ahora es ${newRole}`
    });
  } catch (err) {
    console.error("Error changing user global role:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

module.exports = router;
