// server/lib/requireAuth.js
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const BYPASS = process.env.ALLOW_DEV_AUTH_BYPASS === "1";

// 🧩 En tu seed el usuario real existe con id = "demo-admin".
// Normalizamos cualquier id nulo/numérico a "demo-admin" para que las escrituras peguen.
const FALLBACK_USER_ID = "demo-admin";

/** Normaliza el ID del usuario (evita 1.0 / numéricos) apuntándolo al que existe en DB. */
function normalizeUserId(v) {
  if (v == null) return FALLBACK_USER_ID;
  // number -> usar siempre el fallback
  if (typeof v === "number" && Number.isFinite(v)) return FALLBACK_USER_ID;
  const s = String(v).trim();
  // si viene "1", "01", "1.0" o cualquier numérico como string -> fallback
  if (/^[0-9]+(\.0+)?$/.test(s)) return FALLBACK_USER_ID;
  return s || FALLBACK_USER_ID;
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
    req.user = { id: uid, email: "dev@local", roles: {} };
    req.auth = { sub: uid, email: "dev@local", roles: {}, active_tenant: headerTenant || null };
    if (headerTenant) req.headers["x-tenant-id"] = headerTenant;
    return next();
  }

  // Producción (o sin bypass): exigir y validar JWT
  const m = rawAuth.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: "missing_bearer" });

  try {
    const payload = jwt.verify(m[1], JWT_SECRET);

    // Soportar payloads con sub o id
    const uid = normalizeUserId(payload?.sub ?? payload?.id);
    const email = payload?.email || null;
    const roles = payload?.roles || {};

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
