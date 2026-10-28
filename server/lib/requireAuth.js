// server/lib/requireAuth.js
const jwt = require("jsonwebtoken");
const db = require("../db/connection");

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const JWT_SECRET =
  process.env.JWT_SECRET || (IS_PRODUCTION ? null : "dev-secret");

// El bypass solamente funciona en desarrollo explícito.
const DEV_BYPASS =
  process.env.NODE_ENV === "development" &&
  process.env.ALLOW_DEV_AUTH_BYPASS === "1";

const FALLBACK_USER_ID = "demo-admin";

function normalizeUserId(value) {
  if (typeof value !== "string") return null;

  const id = value.trim();
  return id || null;
}

function normalizeTenant(value) {
  return typeof value === "string" ? value.trim() || null : null;
}

module.exports = async function requireAuth(req, res, next) {
  if (req.method === "OPTIONS") return next();

  const rawAuth = req.get("authorization") || "";
  const headerTenant = normalizeTenant(
    req.get("x-tenant-id") || req.get("tenant")
  );

  let payload;
  let userId;

  if (DEV_BYPASS && !rawAuth) {
    userId = FALLBACK_USER_ID;
    payload = {
      sub: userId,
      active_tenant: headerTenant,
    };
  } else {
    const match = rawAuth.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return res.status(401).json({ error: "missing_bearer" });
    }

    if (!JWT_SECRET) {
      console.error("requireAuth: falta configurar JWT_SECRET");
      return res.status(500).json({ error: "auth_not_configured" });
    }

    try {
      payload = jwt.verify(match[1], JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "invalid_token" });
    }

    if (!payload || typeof payload !== "object") {
      return res.status(401).json({ error: "invalid_token" });
    }

    // Compatibilidad con tokens que usan sub o id.
    // Nunca se sustituye un identificador inválido por demo-admin.
    userId = normalizeUserId(payload.sub ?? payload.id);

    if (!userId) {
      return res.status(401).json({ error: "invalid_token_subject" });
    }
  }

  try {
    const user = await db
      .prepare(`
        SELECT id, email, role, active
        FROM users
        WHERE id = ?
        LIMIT 1
      `)
      .get(userId);

    if (!user) {
      return res.status(401).json({ error: "user_not_found" });
    }

    // PostgreSQL: active es BOOLEAN.
    // Una cuenta debe estar explícitamente activa.
    if (user.active !== true) {
      return res.status(403).json({
        error: "user_deactivated",
        message:
          "Tu cuenta ha sido desactivada. Contacta al administrador.",
      });
    }

    const role = String(user.role || "member").toLowerCase();
    const roles = {
      owner: role === "owner",
      admin: role === "owner" || role === "admin",
      member: role === "member",
    };

    const tokenTenant = normalizeTenant(payload.active_tenant);
    const effectiveTenant = headerTenant || tokenTenant;

    // Identidad y permisos actuales desde PostgreSQL.
    req.user = {
      id: user.id,
      email: user.email,
      role,
      roles,
    };

    req.userRole = role;

    req.auth = {
      ...payload,
      sub: user.id,
      email: user.email,
      role,
      roles,
      active_tenant: tokenTenant,
    };

    if (effectiveTenant) {
      req.headers["x-tenant-id"] = effectiveTenant;
    }

    return next();
  } catch (err) {
    console.error("requireAuth: error consultando usuario:", err.message);
    return res.status(500).json({ error: "internal_error" });
  }
};