// server/lib/requireAuth.js
const jwt = require("jsonwebtoken");
const db = require("../db/connection");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const BYPASS = process.env.ALLOW_DEV_AUTH_BYPASS === "1";

// 🧩 Usuario fallback para desarrollo (admin@demo.local)
const FALLBACK_USER_ID = "demo-admin";

/** 
 * Normaliza el ID del usuario
 * - Si es null/undefined → fallback
 * - Si es string válido (UUID, etc.) → usar tal cual
 * - Si es numérico → fallback (para retrocompatibilidad con seeds antiguos)
 */
function normalizeUserId(v) {
  // 🔍 DEBUG: Log de entrada
  const logDebug = process.env.DEBUG_USER_ID === '1';
  if (logDebug) console.log('🔍 [normalizeUserId] Input:', { value: v, type: typeof v });
  
  if (v == null) {
    if (logDebug) console.log('  → null/undefined, usando fallback:', FALLBACK_USER_ID);
    return FALLBACK_USER_ID;
  }
  
  // Si es number, usar fallback
  if (typeof v === "number" && Number.isFinite(v)) {
    if (logDebug) console.log('  → number, usando fallback:', FALLBACK_USER_ID);
    return FALLBACK_USER_ID;
  }
  
  const s = String(v).trim();
  
  // Si es vacío → fallback
  if (!s) {
    if (logDebug) console.log('  → empty string, usando fallback:', FALLBACK_USER_ID);
    return FALLBACK_USER_ID;
  }
  
  // Si es numérico puro (1, 01, 1.0, etc.) → fallback
  if (/^[0-9]+(\.0+)?$/.test(s)) {
    if (logDebug) console.log('  → numeric string, usando fallback:', FALLBACK_USER_ID);
    return FALLBACK_USER_ID;
  }
  
  // ✅ IMPORTANTE: UUIDs y strings válidos se usan tal cual
  if (logDebug) console.log('  → valid string, usando tal cual:', s.slice(0, 8) + '...');
  return s;
}

module.exports = function requireAuth(req, res, next) {
  if (req.method === "OPTIONS") return next();

  const rawAuth = req.get("authorization") || "";
  const headerTenant = (req.get("x-tenant-id") || req.get("tenant") || "").trim();

  if (process.env.NODE_ENV !== "production") {
    console.log("AUTH HEADERS =>", {
      authorization: rawAuth ? `${rawAuth.slice(0, 28)}…` : "",
      tenant: headerTenant || undefined,
    });
  }

  // 🔧 BYPASS DEV: si está activo, ignora el token y usa demo-admin
  if (BYPASS) {
    if (!rawAuth)
      console.warn("⚠️  DEV AUTH BYPASS: sin Authorization, usando user='demo-admin'");
    const uid = FALLBACK_USER_ID;
    req.user = { id: uid, email: "admin@demo.local", roles: { admin: true } };
    req.auth = { sub: uid, email: "admin@demo.local", roles: { admin: true }, active_tenant: headerTenant || null };
    if (headerTenant) req.headers["x-tenant-id"] = headerTenant;
    return next();
  }

  // Producción (o sin bypass): exigir y validar JWT
  const m = rawAuth.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: "missing_bearer" });

  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    
    // 🔍 DEBUG: Ver payload del JWT
    const logDebug = process.env.DEBUG_USER_ID === '1';
    if (logDebug) {
      console.log('🔍 [requireAuth] JWT payload:', {
        sub: payload?.sub,
        id: payload?.id,
        email: payload?.email,
        active_tenant: payload?.active_tenant
      });
    }

    // Soportar payloads con sub o id
    const uid = normalizeUserId(payload?.sub ?? payload?.id);
    const email = payload?.email || null;
    const roles = payload?.roles || {};
    
    if (logDebug) {
      console.log('🔍 [requireAuth] After normalize:', { uid, email });
    }

    // ⚡ NUEVO: Verificar que el usuario esté activo
    const user = db.prepare(`SELECT active FROM users WHERE id = ?`).get(uid);
    
    if (!user) {
      console.log('❌ [requireAuth] User not found in DB:', uid);
      return res.status(401).json({ error: "user_not_found" });
    }

    if (user.active === 0) {
      console.log('❌ [requireAuth] User is deactivated:', uid);
      return res.status(403).json({ 
        error: "user_deactivated",
        message: "Tu cuenta ha sido desactivada. Contacta al administrador." 
      });
    }

    req.user = { id: uid, email, roles };
    req.auth = {
      ...payload,
      sub: uid,
      email,
      roles,
      active_tenant: payload?.active_tenant || headerTenant || null,
    };

    // Propaga tenant header si vino (o si estaba en el token)
    const effectiveTenant = headerTenant || payload?.active_tenant;
    if (effectiveTenant) req.headers["x-tenant-id"] = effectiveTenant;

    return next();
  } catch (e) {
    console.error("JWT FAIL =>", e.message);
    return res.status(401).json({ error: "invalid_token" });
  }
};
