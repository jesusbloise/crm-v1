// server/routes/check.js
/**
 * Endpoint temporal para verificar base de datos en Railway
 */

const express = require("express");
const router = express.Router();
const db = require("../db/connection");

const USE_POSTGRES = !!process.env.DATABASE_URL;

router.get("/check/db", async (req, res) => {
  try {
    console.log("🔍 Verificando base de datos...");

    let users, tenants, memberships;

    if (USE_POSTGRES) {
      users = await db.prepare("SELECT id, email, name FROM users ORDER BY email").all();
      tenants = await db.prepare("SELECT id, name, created_by FROM tenants ORDER BY id").all();
      memberships = await db.prepare(`
        SELECT m.user_id, u.email, m.tenant_id, t.name as workspace, m.role
        FROM memberships m
        JOIN users u ON u.id = m.user_id
        JOIN tenants t ON t.id = m.tenant_id
        ORDER BY u.email, t.name
      `).all();
    } else {
      // Legacy SQLite (no debería ejecutarse)
      users = await db.prepare("SELECT id, email, name FROM users ORDER BY email").all();
      tenants = await db.prepare("SELECT id, name, created_by FROM tenants ORDER BY id").all();
      memberships = await db.prepare(`
        SELECT m.user_id, u.email, m.tenant_id, t.name as workspace, m.role
        FROM memberships m
        JOIN users u ON u.id = m.user_id
        JOIN tenants t ON t.id = m.tenant_id
        ORDER BY u.email, t.name
      `).all();
    }

    const jesusWorkspaces = memberships.filter(m => m.email === "jesusbloise@gmail.com");

    res.json({
      success: true,
      database: USE_POSTGRES ? "PostgreSQL" : "SQLite",
      summary: {
        users: users.length,
        workspaces: tenants.length,
        memberships: memberships.length,
      },
      data: {
        users,
        tenants,
        memberships,
      },
      jesusbloise_workspaces: jesusWorkspaces,
    });
  } catch (err) {
    console.error("❌ Error verificando DB:", err);
    res.status(500).json({
      success: false,
      error: err.message,
      stack: err.stack,
    });
  }
});

module.exports = router;
