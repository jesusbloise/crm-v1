// server/app.js
require("dotenv").config();
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

/* ---------- Infra / ajustes base ---------- */
app.set("trust proxy", 1); // por si corres detrás de proxy / docker

// CORS con headers que usamos (Authorization + X-Tenant-Id)
app.use(
  cors({
    origin: true, // permite Expo web/lan
    credentials: false,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Tenant-Id",
      "Accept",
      "Origin",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

// preflight para cualquier ruta
app.options("*", cors());

// body parsers
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

/* ---------- Migraciones / semillas idempotentes ---------- */
runMigrations();            // Tablas de negocio
ensureContactsAccountId();  // ALTER contacts.account_id (+ índice)
ensureTenantColumns();      // tenant_id + índices + backfill 'demo'
ensureTenantCore();         // Core multi-tenant (tenants/users/memberships + seed)

/* ---------- Middlewares globales (no auth) ---------- */
app.use(injectTenant); // Lee X-Tenant-Id y coloca req.tenantId

/* ---------- Rutas públicas ---------- */
app.use(require("./routes/health")); // GET /health
app.use(require("./routes/auth"));   // POST /auth/register, /auth/login, GET /auth/me (si la tuya lo expone)

// (si tienes endpoints de invitaciones públicas, móntalos aquí; si son privadas, después de requireAuth)

/* ---------- Protección global ---------- */
app.use(requireAuth); // a partir de aquí, se requiere JWT válido

/* ---------- Rutas protegidas ---------- */
app.use(require("./routes/invitations")); // si tus invitaciones requieren auth
app.use(require("./routes/me"));          // GET /me/tenants, POST /me/tenant/switch
app.use(require("./routes/tenants"));     // admin tenants
app.use(require("./routes/events"));
app.use(require("./routes/leads"));
app.use(require("./routes/contacts"));
app.use(require("./routes/accounts"));
app.use(require("./routes/deals"));
app.use(require("./routes/activities"));
app.use(require("./routes/notes"));

/* ---------- 404 y errores ---------- */
app.use((_req, res) => res.status(404).json({ error: "not_found" }));

app.use((err, _req, res, _next) => {
  console.error("❌ Internal error:", err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.code || "internal_error",
    message: err.message || "Unexpected error",
  });
});

module.exports = app;


// server/app.js
// const express = require("express");
// const cors = require("cors");
// const {
//   runMigrations,
//   ensureContactsAccountId,
//   ensureTenantColumns,
//   ensureTenantCore,
// } = require("./db/migrate");
// const injectTenant = require("./lib/injectTenant");
// const requireAuth = require("./lib/requireAuth");

// const app = express();

// /* --- Migraciones / semillas idempotentes --- */
// runMigrations();            // Tablas de negocio
// ensureContactsAccountId();  // ALTER contacts.account_id (+ índice)
// ensureTenantColumns();      // tenant_id + índices + backfill 'demo'
// ensureTenantCore();         // Core multi-tenant (tenants/users/memberships + seed)

// /* --- Middlewares base --- */
// app.use(cors());
// app.options("*", cors());   // preflight, útil para web/móvil
// app.use(express.json());
// app.use(injectTenant);      // Lee X-Tenant-Id y lo coloca en req.tenantId

// /* --- Rutas públicas --- */
// app.use(require("./routes/health"));
// app.use(require("./routes/auth"));     // /auth/login dev

// /* --- Protección global --- */
// app.use(requireAuth);

// // en app.js, después de requireAuth:
// app.use(require("./routes/invitations"));
// /* --- Rutas protegidas (todas dependen de JWT + tenant) --- */
// app.use(require("./routes/me"));        // GET /me/tenants, POST /me/tenant/switch
// app.use(require("./routes/tenants"));   // POST /tenants (admin)
// app.use(require("./routes/events"));
// app.use(require("./routes/leads"));
// app.use(require("./routes/contacts"));
// app.use(require("./routes/accounts"));
// app.use(require("./routes/deals"));
// app.use(require("./routes/activities"));
// app.use(require("./routes/notes"));

// /* --- 404 y errores --- */
// app.use((_req, res) => res.status(404).json({ error: "not found" }));
// app.use((err, _req, res, _next) => {
//   console.error(err);
//   res.status(500).json({ error: "internal_error" });
// });

// module.exports = app;

