// server/routes/auth.js
const { Router } = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../db/connection");
const { log: auditLog, ACTIONS } = require("../lib/auditLog");

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const TOKEN_TTL = process.env.JWT_TTL || "7d";
const DEFAULT_TENANT = process.env.DEFAULT_TENANT || "demo";

const newId = () => crypto.randomUUID();
const now = () => Date.now();
const signToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });

/* Helpers - ⚠️ DEPRECADOS (sistema simplificado sin memberships) */
async function getMembership(userId, tenantId) {
  // Mantener por compatibilidad temporal - siempre retorna null
  return null;
}

async function getFirstMembership(userId) {
  // Mantener por compatibilidad temporal - siempre retorna null
  return null;
}

function rolesFromMembershipRole(role) {
  // Mantener por compatibilidad temporal
  const base = { user: true };
  if (role === "owner") return { ...base, owner: true, admin: true };
  if (role === "admin") return { ...base, admin: true };
  return base; // member
}


// ⚠️ YA NO SE USA - sistema simplificado sin memberships
// Mantener por compatibilidad temporal (siempre retorna DEFAULT_TENANT)
async function resolveActiveTenantForLogin(req, userId) {
  return { id: DEFAULT_TENANT, name: "Demo" };
}

/* =======================
   LOGIN (dev + real)
   ======================= */
router.post("/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const headerTenant = req.get("X-Tenant-Id")?.trim() || null;

    // Fast-path demo
    if (email === "admin@demo.local" && password === "demo") {
      const payload = {
        sub: "demo-admin",
        email,
        active_tenant: headerTenant || DEFAULT_TENANT,
        role: "admin", // Rol global
      };
      const token = signToken(payload);
      return res.json({ token, active_tenant: payload.active_tenant, role: "admin" });
    }

    if (!email || !password) {
      return res.status(400).json({ error: "email_y_password_requeridos" });
    }

    const user = await db
      .prepare(`SELECT * FROM users WHERE email = ?`)
      .get(String(email).toLowerCase());
    
    if (!user) {
      // 📝 Audit: login fallido (fire and forget)
      auditLog({ action: ACTIONS.LOGIN_FAILED, details: { email, reason: "user_not_found" } }, req).catch(console.error);
      return res.status(401).json({ error: "credenciales_invalidas" });
    }

    const ok = bcrypt.compareSync(String(password), user.password_hash || "");
    if (!ok) {
      // 📝 Audit: login fallido (fire and forget)
      auditLog({ userId: user.id, action: ACTIONS.LOGIN_FAILED, details: { email, reason: "invalid_password" } }, req).catch(console.error);
      return res.status(401).json({ error: "credenciales_invalidas" });
    }

    // Tenant activo: header o default
    const activeTenant = headerTenant || DEFAULT_TENANT;
    const userRole = user.role || "member"; // Rol global del usuario

    const payload = {
      sub: user.id,
      email: user.email,
      active_tenant: activeTenant,
      role: userRole, // Rol global
    };

    const token = signToken(payload);
    
    // 📝 Audit: login exitoso (fire and forget)
    auditLog({ 
      userId: user.id, 
      tenantId: activeTenant,
      action: ACTIONS.LOGIN, 
      details: { email: user.email, tenant: activeTenant, role: userRole } 
    }, req).catch(console.error);
    
    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: userRole,
      token,
      active_tenant: activeTenant,
      tenant: { id: activeTenant, name: "Demo" },
    });
  } catch (e) {
    next(e);
  }
});

/* =======================
   REGISTER
   ======================= */
router.post("/auth/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: "name_email_password_requeridos" });
    }

    const lowerEmail = String(email).toLowerCase().trim();
    const exists = await db.prepare(`SELECT id FROM users WHERE email = ?`).get(lowerEmail);
    if (exists) return res.status(409).json({ error: "email_ya_registrado" });

    const userId = newId();
    const userName = String(name).trim();
    const passwordHash = bcrypt.hashSync(String(password), 10);
    const timestamp = now();

    // 🔑 ROL GLOBAL: Todos los usuarios nuevos son 'member' por defecto
    const globalRole = 'member';

    await db.prepare(
      `INSERT INTO users (id, name, email, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(userId, userName, lowerEmail, passwordHash, globalRole, timestamp, timestamp);

    console.log(`✅ Nuevo usuario registrado: ${lowerEmail} con rol global '${globalRole}'`);

    // ===================================================================
    // NUEVO SISTEMA: Usuarios nuevos son "member" en workspace DEFAULT
    // Solo admin/owner pueden crear workspaces nuevos
    // ===================================================================
    
    // Verificar que existe el workspace por defecto
    const defaultTenant = await db
      .prepare(`SELECT id, name FROM tenants WHERE id = ?`)
      .get(DEFAULT_TENANT);
    
    if (!defaultTenant) {
      // Crear workspace 'demo' si no existe
      await db.prepare(
        `INSERT INTO tenants (id, name, created_at, updated_at)
         VALUES (?, 'Demo', ?, ?)`
      ).run(DEFAULT_TENANT, now(), now());
    }

    // ⚠️ YA NO HAY MEMBERSHIPS - sistema simplificado usa solo roles globales
    console.log(`   └─ Workspace por defecto: '${DEFAULT_TENANT}'`);

    // Activo = workspace por defecto
    const activeTenant = DEFAULT_TENANT;

    const payload = {
      sub: userId,
      email: lowerEmail,
      active_tenant: activeTenant,
      role: globalRole, // Rol global del usuario
    };
    const token = signToken(payload);

    // 📝 Audit: nuevo usuario registrado (fire and forget)
    auditLog({ 
      userId: userId, 
      tenantId: DEFAULT_TENANT,
      action: ACTIONS.REGISTER, 
      details: { email: lowerEmail, name: userName, role: globalRole } 
    }, req).catch(console.error);

    return res.status(201).json({
      id: userId,
      name: userName,
      email: lowerEmail,
      token,
      active_tenant: activeTenant,
      role: globalRole, // Rol global
      tenant: { id: DEFAULT_TENANT, name: defaultTenant?.name || "Demo" },
    });
  } catch (e) {
    next(e);
  }
});

/* =======================
   ME
   ======================= */
router.get("/auth/me", (req, res) => {
  try {
    const raw = req.get("authorization") || "";
    const m = raw.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ error: "missing_bearer" });

    const decoded = jwt.verify(m[1], JWT_SECRET);
    const activeTenant = decoded.active_tenant || DEFAULT_TENANT;

    let user =
      db
        .prepare(`SELECT id, name, email FROM users WHERE id = ?`)
        .get(decoded.sub);

    // ✅ FALLBACK LIMPIO PARA DEMO
    if (!user) {
      user = {
        id: decoded.sub,
        name: decoded.email?.split("@")[0] || "Usuario",
        email: decoded.email || "demo@local",
      };
    }

    const tenant =
      db
        .prepare(`SELECT id, name FROM tenants WHERE id = ?`)
        .get(activeTenant) || { id: activeTenant, name: activeTenant };

    return res.json({
      ok: true,
      user,
      tenant,
      role: decoded.role,
    });
  } catch (e) {
    return res.status(401).json({ error: "invalid_token", message: e.message });
  }
});


module.exports = router;

