// server/lib/requireAuth.js
const jwt = require("jsonwebtoken");
const db = require("../db/connection");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// Flags de desarrollo (opcional)
//  - AUTH_SKIP_MEMBERSHIP=1 -> no validar memberships (solo dev)
//  - AUTH_DEFAULT_TENANT=demo -> tenant por defecto si no viene en token/headers
const SKIP_MEMBERSHIP = process.env.AUTH_SKIP_MEMBERSHIP === "1";
const DEFAULT_TENANT = process.env.AUTH_DEFAULT_TENANT || "demo";

module.exports = function requireAuth(req, res, next) {
  // Permitir preflight sin auth
  if (req.method === "OPTIONS") return next();

  const raw = req.get("authorization") || "";
  const headerTenant = (req.get("x-tenant-id") || "").trim();

  // Log dev (token truncado). Evita imprimir completo en prod.
  if (process.env.NODE_ENV !== "production") {
    console.log("AUTH HEADERS =>", {
      authorization: raw ? `${raw.slice(0, 28)}…` : "",
      tenant: headerTenant || undefined,
    });
  }

  const m = raw.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: "missing_bearer" });

  let payload;
  try {
    payload = jwt.verify(m[1], JWT_SECRET);
    if (process.env.NODE_ENV !== "production") {
      console.log("JWT OK =>", {
        sub: payload.sub,
        email: payload.email,
        active_tenant: payload.active_tenant,
        roles: payload.roles,
      });
    }
  } catch (e) {
    console.error("JWT FAIL =>", e.message);
    return res.status(401).json({ error: "invalid_token" });
  }

  // Usuario base en req
  req.user = {
    id: payload.sub,
    email: payload.email,
    roles: payload.roles || {},
  };

  // Resolución de tenant (header tiene prioridad para permitir "switch")
  const resolvedTenant = headerTenant || payload.active_tenant || DEFAULT_TENANT;
  if (!resolvedTenant) return res.status(401).json({ error: "no_tenant" });
  req.tenantId = resolvedTenant;

  // Atajo DEV: usuario demo o flag para saltar memberships
  const isDemoUser =
    payload.sub === "demo-admin" ||
    String(payload.email || "").endsWith("@demo.local");

  if (SKIP_MEMBERSHIP || isDemoUser) {
    req.auth = payload;
    return next();
  }

  // Validación de pertenencia al tenant
  try {
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
  } catch (err) {
    // Si la tabla no existe todavía, evita romper producción:
    // puedes forzar 500, pero en desarrollo es útil permitir continuar.
    console.error("Membership check error:", err.message);
    if (process.env.NODE_ENV === "production") {
      return res.status(500).json({ error: "membership_check_failed" });
    }
    // En dev: permite pasar para no bloquear mientras migras/semillas.
  }

  // Guarda payload por si otra capa lo necesita
  req.auth = payload;
  return next();
};



// // server/lib/requireAuth.js
// const jwt = require("jsonwebtoken");
// const db = require("../db/connection");

// const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// module.exports = function requireAuth(req, res, next) {
//   const raw = req.get("authorization") || "";
//   const headerTenant = (req.get("x-tenant-id") || "").trim();

//   // Log dev (no imprimas el token en prod)
//   console.log("AUTH HEADERS =>", {
//     authorization: raw ? `${raw.slice(0, 28)}…` : "",
//     tenant: headerTenant || undefined,
//   });

//   const m = raw.match(/^Bearer\s+(.+)$/i);
//   if (!m) return res.status(401).json({ error: "missing_bearer" });

//   let payload;
//   try {
//     payload = jwt.verify(m[1], JWT_SECRET);
//     console.log("JWT OK =>", {
//       sub: payload.sub,
//       email: payload.email,
//       active_tenant: payload.active_tenant,
//       roles: payload.roles,
//     });
//   } catch (e) {
//     console.error("JWT FAIL =>", e.message);
//     return res.status(401).json({ error: "invalid_token" });
//   }

//   // User básico en request
//   req.user = {
//     id: payload.sub,
//     email: payload.email,
//     roles: payload.roles || {},
//   };

//   // Resolución de tenant:
//   // - si viene X-Tenant-Id, úsalo (permite "switch")
//   // - si no, usa el active_tenant del token
//   const resolvedTenant = headerTenant || payload.active_tenant;
//   if (!resolvedTenant) return res.status(401).json({ error: "no_tenant" });
//   req.tenantId = resolvedTenant;

//   // 🔐 Chequeo de membresía: el user debe pertenecer al tenant
//   const isMember = db
//     .prepare(
//       `SELECT 1
//        FROM memberships
//        WHERE user_id = ? AND tenant_id = ?
//        LIMIT 1`
//     )
//     .get(req.user.id, req.tenantId);

//   if (!isMember) {
//     return res.status(403).json({ error: "forbidden_tenant" });
//   }

//   // (opcional) guarda el payload por si otras capas lo necesitan
//   req.auth = payload;

//   return next();
// };

