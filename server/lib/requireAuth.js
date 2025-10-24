// server/lib/requireAuth.js
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

module.exports = function requireAuth(req, res, next) {
  // Permitir preflight sin auth
  if (req.method === "OPTIONS") return next();

  const raw = req.get("authorization") || "";

  // Log dev (token truncado). Evita imprimir completo en prod.
  if (process.env.NODE_ENV !== "production") {
    const headerTenant = (req.get("x-tenant-id") || "").trim();
    console.log("AUTH HEADERS =>", {
      authorization: raw ? `${raw.slice(0, 28)}…` : "",
      tenant: headerTenant || undefined,
    });
  }

  const m = raw.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: "missing_bearer" });

  try {
    const payload = jwt.verify(m[1], JWT_SECRET);

    if (process.env.NODE_ENV !== "production") {
      console.log("JWT OK =>", {
        sub: payload.sub,
        email: payload.email,
        active_tenant: payload.active_tenant,
        roles: payload.roles,
      });
    }

    // Usuario base en req (sin resolver tenant aquí)
    req.user = {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles || {},
    };

    // Guarda payload completo por si otras capas lo necesitan
    req.auth = payload;

    // Nota importante:
    // - NO seteamos req.tenantId aquí.
    // - NO validamos membership aquí.
    // Eso lo hace injectTenant() inmediatamente después en app.js,
    // que resuelve X-Tenant-Id / primer tenant y valida memberships/roles.
    return next();
  } catch (e) {
    console.error("JWT FAIL =>", e.message);
    return res.status(401).json({ error: "invalid_token" });
  }
};
