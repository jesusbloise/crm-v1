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


// // server/lib/requireAuth.js
// const jwt = require("jsonwebtoken");
// const db = require("../db/connection");

// const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// // Flags de desarrollo (opcional)
// //  - AUTH_SKIP_MEMBERSHIP=1 -> no validar memberships (solo dev)
// //  - AUTH_DEFAULT_TENANT=demo -> tenant por defecto si no viene en token/headers
// const SKIP_MEMBERSHIP = process.env.AUTH_SKIP_MEMBERSHIP === "1";
// const DEFAULT_TENANT = process.env.AUTH_DEFAULT_TENANT || "demo";

// module.exports = function requireAuth(req, res, next) {
//   // Permitir preflight sin auth
//   if (req.method === "OPTIONS") return next();

//   const raw = req.get("authorization") || "";
//   const headerTenant = (req.get("x-tenant-id") || "").trim();

//   // Log dev (token truncado). Evita imprimir completo en prod.
//   if (process.env.NODE_ENV !== "production") {
//     console.log("AUTH HEADERS =>", {
//       authorization: raw ? `${raw.slice(0, 28)}…` : "",
//       tenant: headerTenant || undefined,
//     });
//   }

//   const m = raw.match(/^Bearer\s+(.+)$/i);
//   if (!m) return res.status(401).json({ error: "missing_bearer" });

//   let payload;
//   try {
//     payload = jwt.verify(m[1], JWT_SECRET);
//     if (process.env.NODE_ENV !== "production") {
//       console.log("JWT OK =>", {
//         sub: payload.sub,
//         email: payload.email,
//         active_tenant: payload.active_tenant,
//         roles: payload.roles,
//       });
//     }
//   } catch (e) {
//     console.error("JWT FAIL =>", e.message);
//     return res.status(401).json({ error: "invalid_token" });
//   }

//   // Usuario base en req
//   req.user = {
//     id: payload.sub,
//     email: payload.email,
//     roles: payload.roles || {},
//   };

//   // Resolución de tenant (header tiene prioridad para permitir "switch")
//   const resolvedTenant = headerTenant || payload.active_tenant || DEFAULT_TENANT;
//   if (!resolvedTenant) return res.status(401).json({ error: "no_tenant" });
//   req.tenantId = resolvedTenant;

//   // Atajo DEV: usuario demo o flag para saltar memberships
//   const isDemoUser =
//     payload.sub === "demo-admin" ||
//     String(payload.email || "").endsWith("@demo.local");

//   if (SKIP_MEMBERSHIP || isDemoUser) {
//     req.auth = payload;
//     return next();
//   }

//   // Validación de pertenencia al tenant
//   try {
//     const isMember = db
//       .prepare(
//         `SELECT 1
//          FROM memberships
//          WHERE user_id = ? AND tenant_id = ?
//          LIMIT 1`
//       )
//       .get(req.user.id, req.tenantId);

//     if (!isMember) {
//       return res.status(403).json({ error: "forbidden_tenant" });
//     }
//   } catch (err) {
//     // Si la tabla no existe todavía, evita romper producción:
//     // puedes forzar 500, pero en desarrollo es útil permitir continuar.
//     console.error("Membership check error:", err.message);
//     if (process.env.NODE_ENV === "production") {
//       return res.status(500).json({ error: "membership_check_failed" });
//     }
//     // En dev: permite pasar para no bloquear mientras migras/semillas.
//   }

//   // Guarda payload por si otra capa lo necesita
//   req.auth = payload;
//   return next();
// };

