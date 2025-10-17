// server/app.js
const express = require("express");
const cors = require("cors");
const {
  runMigrations,
  ensureContactsAccountId,
  ensureTenantColumns,
  ensureTenantCore,
} = require("./db/migrate");
const injectTenant = require("./lib/injectTenant");
const requireAuth = require("./lib/requireAuth");

const app = express();

/* --- Migraciones / semillas idempotentes --- */
runMigrations();            // Tablas de negocio
ensureContactsAccountId();  // ALTER contacts.account_id (+ índice)
ensureTenantColumns();      // tenant_id + índices + backfill 'demo'
ensureTenantCore();         // Core multi-tenant (tenants/users/memberships + seed)

/* --- Middlewares base --- */
app.use(cors());
app.options("*", cors());   // preflight, útil para web/móvil
app.use(express.json());
app.use(injectTenant);      // Lee X-Tenant-Id y lo coloca en req.tenantId

/* --- Rutas públicas --- */
app.use(require("./routes/health"));
app.use(require("./routes/auth"));     // /auth/login dev

/* --- Protección global --- */
app.use(requireAuth);

// en app.js, después de requireAuth:
app.use(require("./routes/invitations"));
/* --- Rutas protegidas (todas dependen de JWT + tenant) --- */
app.use(require("./routes/me"));        // GET /me/tenants, POST /me/tenant/switch
app.use(require("./routes/tenants"));   // POST /tenants (admin)
app.use(require("./routes/events"));
app.use(require("./routes/leads"));
app.use(require("./routes/contacts"));
app.use(require("./routes/accounts"));
app.use(require("./routes/deals"));
app.use(require("./routes/activities"));
app.use(require("./routes/notes"));

/* --- 404 y errores --- */
app.use((_req, res) => res.status(404).json({ error: "not found" }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});

module.exports = app;


// // server/app.js
// const express = require("express");
// const cors = require("cors");
// const { runMigrations, ensureContactsAccountId } = require("./db/migrate");

// // ===== Feature flag (env) =====
// const MT_ENABLED = String(process.env.MULTI_TENANT_ENABLED ?? "false").toLowerCase() === "true";
// const TENANT_HEADER = "x-tenant-id";

// const app = express();

// // ---- Migraciones idempotentes ----
// runMigrations();
// ensureContactsAccountId();

// // ---- Middlewares base ----
// app.use(
//   cors({
//     origin: true,
//     credentials: true,
//     allowedHeaders: ["content-type", TENANT_HEADER],
//     exposedHeaders: [TENANT_HEADER],
//   })
// );
// app.use(express.json());

// /**
//  * Contexto de tenant:
//  * - Si MT deshabilitado → req.tenantId = null (modo single-tenant).
//  * - Si MT habilitado → requiere X-Tenant-ID o ?tenant= y lo adjunta a req/res.
//  */
// function tenantContext(req, res, next) {
//   if (!MT_ENABLED) {
//     req.tenantId = null;
//     res.locals.tenantId = null;
//     return next();
//   }

//   const fromHeader = req.header(TENANT_HEADER);
//   const fromQuery = req.query?.tenant;
//   const tenant = String(fromHeader || fromQuery || "").trim();

//   if (!tenant) {
//     return res.status(400).json({
//       error: "tenant_required",
//       message: `Falta el identificador de tenant. Envíalo en el header "${TENANT_HEADER}" o en la query "?tenant="`,
//     });
//   }

//   req.tenantId = tenant;
//   res.locals.tenantId = tenant;
//   return next();
// }

// app.use(tenantContext);

// // ---- Rutas ----
// app.use(require("./routes/health"));
// app.use(require("./routes/events"));
// app.use(require("./routes/leads"));
// app.use(require("./routes/contacts"));
// app.use(require("./routes/accounts"));
// app.use(require("./routes/deals"));
// app.use(require("./routes/activities"));
// app.use(require("./routes/notes"));

// // 404 final
// app.use((_req, res) => res.status(404).json({ error: "not_found" }));

// // Error handler
// app.use((err, _req, res, _next) => {
//   console.error(err);
//   res.status(500).json({ error: "internal_error" });
// });

// module.exports = app;


// const express = require("express");
// const cors = require("cors");
// const { runMigrations, ensureContactsAccountId } = require("./db/migrate");
// const wrap = require("./lib/wrap");

// const app = express();

// // Migrations & ALTERs idempotentes
// runMigrations();
// ensureContactsAccountId();

// app.use(cors());
// app.use(express.json());

// // Rutas
// app.use(require("./routes/health"));
// app.use(require("./routes/events"));
// app.use(require("./routes/leads"));
// app.use(require("./routes/contacts"));
// app.use(require("./routes/accounts"));
// app.use(require("./routes/deals"));
// app.use(require("./routes/activities"));
// app.use(require("./routes/notes"));

// // 404 final
// app.use((_req, res) => res.status(404).json({ error: "not found" }));

// // Error handler
// app.use((err, _req, res, _next) => {
//   console.error(err);
//   res.status(500).json({ error: "internal_error" });
// });

// module.exports = app;
