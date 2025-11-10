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

/* Helpers */
function getMembership(userId, tenantId) {
  return db
    .prepare(
      `SELECT m.role, m.tenant_id AS id, t.name
       FROM memberships m
       JOIN tenants t ON t.id = m.tenant_id
       WHERE m.user_id = ? AND m.tenant_id = ?
       LIMIT 1`
    )
    .get(userId, tenantId);
}

function getFirstMembership(userId) {
  return db
    .prepare(
      `SELECT m.role, m.tenant_id AS id, t.name
       FROM memberships m
       JOIN tenants t ON t.id = m.tenant_id
       WHERE m.user_id = ?
       ORDER BY t.created_at ASC
       LIMIT 1`
    )
    .get(userId);
}

function rolesFromMembershipRole(role) {
  // Estructura de roles para el JWT
  const base = { user: true };
  if (role === "owner") return { ...base, owner: true, admin: true };
  if (role === "admin") return { ...base, admin: true };
  return base; // member
}

function resolveActiveTenantForLogin(req, userId) {
  const requested = req.get("X-Tenant-Id")?.trim() || null;
  if (requested) {
    const m = getMembership(userId, requested);
    if (m) return m; // respeta header si pertenece
  }
  const first = getFirstMembership(userId);
  if (first) return first;
  // fallback: DEFAULT_TENANT si existe en la tabla
  const t = db.prepare(`SELECT id, name FROM tenants WHERE id = ?`).get(DEFAULT_TENANT);
  if (t) return { id: t.id, name: t.name, role: "member" };
  // último recurso: null (cliente deberá hacer /me/tenants y crear/switch)
  return null;
}

/* =======================
   LOGIN (dev + real)
   ======================= */
router.post("/auth/login", (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const headerTenant = req.get("X-Tenant-Id")?.trim() || null;

    // Fast-path demo
    if (email === "admin@demo.local" && password === "demo") {
      const payload = {
        sub: "demo-admin",
        email,
        active_tenant: headerTenant || DEFAULT_TENANT,
        roles: { user: true, admin: true },
      };
      const token = signToken(payload);
      return res.json({ token, active_tenant: payload.active_tenant });
    }

    if (!email || !password) {
      return res.status(400).json({ error: "email_y_password_requeridos" });
    }

    const user = db
      .prepare(`SELECT * FROM users WHERE email = ?`)
      .get(String(email).toLowerCase());
    
    if (!user) {
      // 📝 Audit: login fallido
      auditLog({ action: ACTIONS.LOGIN_FAILED, details: { email, reason: "user_not_found" } }, req);
      return res.status(401).json({ error: "credenciales_invalidas" });
    }

    const ok = bcrypt.compareSync(String(password), user.password_hash || "");
    if (!ok) {
      // 📝 Audit: login fallido
      auditLog({ userId: user.id, action: ACTIONS.LOGIN_FAILED, details: { email, reason: "invalid_password" } }, req);
      return res.status(401).json({ error: "credenciales_invalidas" });
    }

    // Resolver tenant activo (valida membership del header si vino)
    const membership = resolveActiveTenantForLogin(req, user.id);
    const activeTenant = membership?.id || DEFAULT_TENANT;
    const roles = rolesFromMembershipRole(membership?.role || "member");

    const payload = {
      sub: user.id,
      email: user.email,
      active_tenant: activeTenant,
      roles,
    };

    const token = signToken(payload);
    
    // 📝 Audit: login exitoso
    auditLog({ 
      userId: user.id, 
      tenantId: activeTenant,
      action: ACTIONS.LOGIN, 
      details: { email: user.email, tenant: activeTenant, role: membership?.role } 
    }, req);
    
    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      token,
      active_tenant: activeTenant,
      tenant: membership ? { id: membership.id, name: membership.name, role: membership.role } : null,
    });
  } catch (e) {
    next(e);
  }
});

/* =======================
   REGISTER
   ======================= */
router.post("/auth/register", (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: "name_email_password_requeridos" });
    }

    const lowerEmail = String(email).toLowerCase().trim();
    const exists = db.prepare(`SELECT id FROM users WHERE email = ?`).get(lowerEmail);
    if (exists) return res.status(409).json({ error: "email_ya_registrado" });

    const user = {
      id: newId(),
      name: String(name).trim(),
      email: lowerEmail,
      password_hash: bcrypt.hashSync(String(password), 10),
      created_at: now(),
      updated_at: now(),
    };

    db.prepare(
      `INSERT INTO users (id, name, email, password_hash, created_at, updated_at)
       VALUES (@id, @name, @email, @password_hash, @created_at, @updated_at)`
    ).run(user);

    // ===================================================================
    // NUEVO SISTEMA: Usuarios nuevos son "member" en workspace DEFAULT
    // Solo admin/owner pueden crear workspaces nuevos
    // ===================================================================
    
    // Verificar que existe el workspace por defecto
    const defaultTenant = db
      .prepare(`SELECT id, name FROM tenants WHERE id = ?`)
      .get(DEFAULT_TENANT);
    
    if (!defaultTenant) {
      // Crear workspace 'demo' si no existe
      db.prepare(
        `INSERT INTO tenants (id, name, created_at, updated_at)
         VALUES (?, 'Demo', ?, ?)`
      ).run(DEFAULT_TENANT, now(), now());
    }

    // Agregar usuario como MEMBER al workspace por defecto
    db.prepare(
      `INSERT INTO memberships (user_id, tenant_id, role, created_at, updated_at)
       VALUES (?, ?, 'member', ?, ?)`
    ).run(user.id, DEFAULT_TENANT, now(), now());

    console.log(`✅ Nuevo usuario registrado: ${user.email} como 'member' en workspace '${DEFAULT_TENANT}'`);

    // Activo = workspace por defecto
    const activeTenant = DEFAULT_TENANT;
    const roles = rolesFromMembershipRole("member");

    const payload = {
      sub: user.id,
      email: user.email,
      active_tenant: activeTenant,
      roles,
    };
    const token = signToken(payload);

    // 📝 Audit: nuevo usuario registrado
    auditLog({ 
      userId: user.id, 
      tenantId: DEFAULT_TENANT,
      action: ACTIONS.REGISTER, 
      details: { email: user.email, name: user.name, role: "member" } 
    }, req);

    return res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      token,
      active_tenant: activeTenant,
      tenant: { id: DEFAULT_TENANT, name: defaultTenant?.name || "Demo", role: "member" },
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
    const requestedTenant = req.get("x-tenant-id") || null; // info útil para la UI
    const activeTenant = decoded.active_tenant || DEFAULT_TENANT;

    const user =
      db
        .prepare(`SELECT id, name, email, created_at, updated_at FROM users WHERE id = ?`)
        .get(decoded.sub) || null;

    return res.json({
      ok: true,
      user,
      token_payload: decoded,
      active_tenant: activeTenant,
      requested_tenant: requestedTenant,
    });
  } catch (e) {
    return res.status(401).json({ error: "invalid_token", message: e.message });
  }
});

module.exports = router;

