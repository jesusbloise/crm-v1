// server/app.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const {
  runMigrations,
  ensureContactsAccountId,
  ensureTenantColumns,
  ensureTenantCore,
  ensureCreatedByColumns,
  ensureUsersActive,
} = require("./db/migrate");

const injectTenant = require("./lib/injectTenant");
const requireAuth = require("./lib/requireAuth");

// ⬇️ Rutas de Google Calendar (ya tienes ./routes/google)
const googleRoutes = require("./routes/google");

const app = express();

/* ---------- Infra / ajustes base ---------- */
app.set("trust proxy", 1);
app.disable("x-powered-by"); // opcional, hardening

app.use(
  cors({
    origin: true, // Expo web/LAN y Railway
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
app.options("*", cors());

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* ---------- Migraciones / preparación segura ---------- */
/**
 * ⚠️ Orden recomendado:
 * 1) ensureTenantCore -> crea users/tenants/memberships y asegura columnas google_*
 * 2) runMigrations    -> crea tablas de negocio (leads, contacts, deals, activities, etc.)
 * 3) ensureContactsAccountId y ensureTenantColumns -> alters idempotentes
 * 4) ensureCreatedByColumns -> agrega created_by para RBAC
 */
try {
  ensureTenantCore();
  runMigrations();
  ensureContactsAccountId();
  ensureTenantColumns();
  ensureCreatedByColumns();
  ensureUsersActive();
  console.log("✅ DB migrations OK");
} catch (e) {
  console.error("❌ DB migration failed", e);
  process.exit(1);
}

/* ---------- Rutas públicas ---------- */
app.use(require("./routes/health")); // GET /health
app.use(require("./routes/auth"));   // /auth/register, /auth/login, /auth/me
app.use(require("./routes/seed"));   // GET /seed/production (temporal)

/* ---------- Protección global ---------- */
app.use(requireAuth);

/* ---------- Contexto de Tenant ---------- */
app.use(injectTenant);

app.use(require("./routes/ics"));    // /integrations/ics/*
// ❌ eliminado: app.use(require("./routes/google")); (duplicado)
// ✅ dejamos una sola vez:
app.use(googleRoutes);               // /integrations/google/*

/* ---------- Rutas protegidas (tu API actual) ---------- */
app.use(require("./routes/admin"));
app.use(require("./routes/invitations"));
app.use(require("./routes/me"));
app.use(require("./routes/tenants"));
app.use(require("./routes/events"));
app.use(require("./routes/leads"));
app.use(require("./routes/contacts"));
app.use(require("./routes/accounts"));
app.use(require("./routes/deals"));
app.use(require("./routes/activities"));
app.use(require("./routes/notes"));

/* ---------- Manejo de errores de subida ---------- */
app.use((err, _req, res, next) => {
  if (err && (err.name === "MulterError" || err.message === "invalid_type")) {
    const code = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(code).json({ error: err.code || err.message });
  }
  return next(err);
});

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
