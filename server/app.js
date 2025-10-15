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

const app = express();

// ✅ 1) Primero crea/actualiza todas las tablas de negocio (ya incluyen tenants/users/memberships en tu runMigrations)
runMigrations();
// 2) ALTER específico de contacts
ensureContactsAccountId();
// 3) Añade tenant_id + backfill + índices
ensureTenantColumns();
// ✅ 4) Semillas/garantías del core tenant (ya hay tablas/columnas)
ensureTenantCore();

app.use(cors());
app.use(express.json());
app.use(injectTenant);

// (resto igual…)
app.use(require("./routes/health"));
app.use(require("./routes/auth"));
app.use(require("./lib/requireAuth"));
app.use(require("./routes/events"));
app.use(require("./routes/leads"));
app.use(require("./routes/contacts"));
app.use(require("./routes/accounts"));
app.use(require("./routes/deals"));
app.use(require("./routes/activities"));
app.use(require("./routes/notes"));

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
