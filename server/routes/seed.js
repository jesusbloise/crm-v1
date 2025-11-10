// server/routes/seed.js
/**
 * Endpoint temporal para ejecutar el seed en producción
 * IMPORTANTE: Eliminar después de usarlo por seguridad
 */

const { Router } = require("express");
const db = require("../db/connection");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const router = Router();
const now = () => Date.now();

router.get("/seed/production", (req, res) => {
  try {
    console.log("\n🌱 Ejecutando seed de producción desde endpoint...\n");

    // ============================================
    // 1. CREAR USUARIOS
    // ============================================

    const users = [
      {
        id: "02bfdb38-6083-4b6c-a009-b82005ff3e9a",
        email: "jesusbloise@gmail.com",
        name: "jesus",
        password: "jesus123",
      },
      {
        id: crypto.randomUUID(),
        email: "luisa@gmail.com",
        name: "luisa",
        password: "luisa123",
      },
      {
        id: crypto.randomUUID(),
        email: "carolina@gmail.com",
        name: "carolina",
        password: "carolina123",
      },
    ];

    const insertUser = db.prepare(`
      INSERT OR REPLACE INTO users (id, email, name, password_hash, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `);

    users.forEach((user) => {
      const hash = bcrypt.hashSync(user.password, 10);
      insertUser.run(user.id, user.email, user.name, hash, now(), now());
    });

    // ============================================
    // 2. CREAR WORKSPACES (TENANTS)
    // ============================================

    const tenants = [
      {
        id: "demo",
        name: "Demo",
        created_by: "02bfdb38-6083-4b6c-a009-b82005ff3e9a",
      },
      {
        id: "jesus",
        name: "publicidad",
        created_by: "02bfdb38-6083-4b6c-a009-b82005ff3e9a",
      },
      {
        id: "luis",
        name: "edicion",
        created_by: "02bfdb38-6083-4b6c-a009-b82005ff3e9a",
      },
    ];

    const insertTenant = db.prepare(`
      INSERT OR REPLACE INTO tenants (id, name, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?)
    `);

    tenants.forEach((tenant) => {
      insertTenant.run(tenant.id, tenant.name, now(), now(), tenant.created_by);
    });

    // ============================================
    // 3. CREAR MEMBERSHIPS
    // ============================================

    const memberships = [
      // jesusbloise - owner en todos
      { user_id: "02bfdb38-6083-4b6c-a009-b82005ff3e9a", tenant_id: "demo", role: "owner" },
      { user_id: "02bfdb38-6083-4b6c-a009-b82005ff3e9a", tenant_id: "jesus", role: "owner" },
      { user_id: "02bfdb38-6083-4b6c-a009-b82005ff3e9a", tenant_id: "luis", role: "owner" },
      
      // luisa - member en demo y luis
      { user_id: users[1].id, tenant_id: "demo", role: "member" },
      { user_id: users[1].id, tenant_id: "luis", role: "member" },
      
      // carolina - member en demo
      { user_id: users[2].id, tenant_id: "demo", role: "member" },
    ];

    const insertMembership = db.prepare(`
      INSERT OR REPLACE INTO memberships (user_id, tenant_id, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    memberships.forEach((m) => {
      insertMembership.run(m.user_id, m.tenant_id, m.role, now(), now());
    });

    // ============================================
    // VERIFICACIÓN
    // ============================================

    const allUsers = db.prepare("SELECT id, email, name FROM users").all();
    const allTenants = db.prepare("SELECT id, name FROM tenants").all();
    const allMemberships = db.prepare(`
      SELECT u.email, t.name as workspace, m.role 
      FROM memberships m 
      JOIN users u ON u.id = m.user_id 
      JOIN tenants t ON t.id = m.tenant_id
      ORDER BY u.email, t.name
    `).all();

    res.json({
      success: true,
      message: "✅ Seed ejecutado exitosamente en producción!",
      data: {
        users: allUsers.length,
        workspaces: allTenants.length,
        memberships: allMemberships.length,
        details: {
          users: allUsers,
          workspaces: allTenants,
          memberships: allMemberships,
        },
      },
      credentials: {
        jesusbloise: "jesusbloise@gmail.com / jesus123",
        luisa: "luisa@gmail.com / luisa123",
        carolina: "carolina@gmail.com / carolina123",
      },
    });

  } catch (error) {
    console.error("❌ Error en seed:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    });
  }
});

module.exports = router;
