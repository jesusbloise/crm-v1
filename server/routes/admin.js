// server/routes/admin.js
const express = require("express");
const router = express.Router();
const db = require("../db/connection");

// Helper: Verificar si el usuario es admin o owner en algún workspace
const isAdminOrOwner = (userId) => {
  const membership = db
    .prepare("SELECT role FROM memberships WHERE user_id = ? AND role IN ('admin', 'owner') LIMIT 1")
    .get(userId);
  return !!membership;
};

/* ==================== GET /admin/users ==================== */
router.get("/admin/users", (req, res) => {
  try {
    // Verificar que el usuario esté autenticado
    if (!req.user?.id) {
      return res.status(401).json({ error: "unauthorized" });
    }

    // Obtener todos los usuarios
    const users = db
      .prepare(`
        SELECT 
          id,
          email,
          name,
          active,
          created_at,
          updated_at
        FROM users
        ORDER BY created_at DESC
      `)
      .all();

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
router.post("/admin/users/:userId/toggle-active", (req, res) => {
  try {
    const { userId } = req.params;
    
    // Verificar que el usuario esté autenticado
    if (!req.user?.id) {
      console.log("❌ No hay req.user.id");
      return res.status(401).json({ error: "unauthorized" });
    }

    console.log("👤 Usuario autenticado:", req.user.id, req.user.email);
    
    // Verificar que sea admin o owner
    const isAdmin = isAdminOrOwner(req.user.id);
    console.log("🔐 ¿Es admin/owner?:", isAdmin);
    
    if (!isAdmin) {
      console.log("❌ Usuario no es admin/owner");
      return res.status(403).json({ error: "forbidden_only_admins_can_modify" });
    }
    
    console.log("✅ Usuario autorizado para modificar");

    // No permitir que se desactive a sí mismo
    if (userId === req.user.id) {
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

    res.json({ success: true, active: newActive === 1 });
  } catch (err) {
    console.error("Error toggling user active status:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

/* ==================== POST /admin/users/:userId/change-role ==================== */
router.post("/admin/users/:userId/change-role", (req, res) => {
  try {
    const { userId } = req.params;
    const { tenantId, newRole } = req.body;
    
    // Verificar que el usuario esté autenticado
    if (!req.user?.id) {
      console.log("❌ No hay req.user.id");
      return res.status(401).json({ error: "unauthorized" });
    }

    console.log("👤 Usuario autenticado:", req.user.id, req.user.email);
    
    // Verificar que sea admin o owner
    const isAdmin = isAdminOrOwner(req.user.id);
    console.log("🔐 ¿Es admin/owner?:", isAdmin);
    
    if (!isAdmin) {
      console.log("❌ Usuario no es admin/owner");
      return res.status(403).json({ error: "forbidden_only_admins_can_modify" });
    }
    
    console.log("✅ Usuario autorizado para modificar");

    // Validar el rol
    const validRoles = ["admin", "member"];
    if (!validRoles.includes(newRole)) {
      return res.status(400).json({ error: "invalid_role" });
    }

    // Verificar que la membresía exista
    const membership = db
      .prepare("SELECT * FROM memberships WHERE user_id = ? AND tenant_id = ?")
      .get(userId, tenantId);
    
    if (!membership) {
      return res.status(404).json({ error: "membership_not_found" });
    }

    // No permitir cambiar el rol de sí mismo
    if (userId === req.user.id) {
      return res.status(400).json({ error: "cannot_change_own_role" });
    }

    // Actualizar el rol
    db.prepare("UPDATE memberships SET role = ?, updated_at = ? WHERE user_id = ? AND tenant_id = ?")
      .run(newRole, Date.now(), userId, tenantId);

    res.json({ success: true, role: newRole });
  } catch (err) {
    console.error("Error changing user role:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

module.exports = router;
