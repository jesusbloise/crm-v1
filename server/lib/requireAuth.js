// server/lib/requireAuth.js
const jwt = require("jsonwebtoken");
const db = require("../db/connection");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

module.exports = function requireAuth(req, res, next) {
  const raw = req.get("authorization") || "";
  const headerTenant = (req.get("x-tenant-id") || "").trim();

  // Log dev (no imprimas el token en prod)
  console.log("AUTH HEADERS =>", {
    authorization: raw ? `${raw.slice(0, 28)}…` : "",
    tenant: headerTenant || undefined,
  });

  const m = raw.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: "missing_bearer" });

  let payload;
  try {
    payload = jwt.verify(m[1], JWT_SECRET);
    console.log("JWT OK =>", {
      sub: payload.sub,
      email: payload.email,
      active_tenant: payload.active_tenant,
      roles: payload.roles,
    });
  } catch (e) {
    console.error("JWT FAIL =>", e.message);
    return res.status(401).json({ error: "invalid_token" });
  }

  // User básico en request
  req.user = {
    id: payload.sub,
    email: payload.email,
    roles: payload.roles || {},
  };

  // Resolución de tenant:
  // - si viene X-Tenant-Id, úsalo (permite "switch")
  // - si no, usa el active_tenant del token
  const resolvedTenant = headerTenant || payload.active_tenant;
  if (!resolvedTenant) return res.status(401).json({ error: "no_tenant" });
  req.tenantId = resolvedTenant;

  // 🔐 Chequeo de membresía: el user debe pertenecer al tenant
  const isMember = db
    .prepare(
      `SELECT 1
       FROM memberships
       WHERE user_id = ? AND tenant_id = ?
       LIMIT 1`
    )
    .get(req.user.id, req.tenantId);

  if (!isMember) {
    return res.status(403).json({ error: "forbidden_tenant" });
  }

  // (opcional) guarda el payload por si otras capas lo necesitan
  req.auth = payload;

  return next();
};


// // server/lib/requireAuth.js
// const jwt = require("jsonwebtoken");

// const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// module.exports = function requireAuth(req, res, next) {
//   const raw = req.get("authorization") || "";
//   const tenant = req.get("x-tenant-id");

//   console.log("AUTH HEADERS =>", { authorization: raw, tenant });

//   const m = raw.match(/^Bearer\s+(.+)$/i);
//   if (!m) return res.status(401).json({ error: "missing_bearer" });

//   try {
//     const payload = jwt.verify(m[1], JWT_SECRET);
//     console.log("JWT OK =>", payload);

//     req.user = { id: payload.sub, roles: payload.roles || {} };
//     req.tenantId = payload.active_tenant || tenant || "demo";

//     // valida scoping: payload.active_tenant debe existir
//     if (!req.tenantId) return res.status(401).json({ error: "no_tenant" });

//     return next();
//   } catch (e) {
//     console.error("JWT FAIL =>", e.message);
//     return res.status(401).json({ error: "invalid_token" });
//   }
// };
