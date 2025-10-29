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
} = require("./db/migrate");

const injectTenant = require("./lib/injectTenant");
const requireAuth = require("./lib/requireAuth");

// ⬇️ Rutas de Google Calendar (ya tienes ./routes/google)
const googleRoutes = require("./routes/google");

const app = express();

/* ---------- Infra / ajustes base ---------- */
app.set("trust proxy", 1);

app.use(
  cors({
    origin: true, // Expo web/LAN
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
 */
try {
  ensureTenantCore();
  runMigrations();
  ensureContactsAccountId();
  ensureTenantColumns();
  console.log("✅ DB migrations OK");
} catch (e) {
  console.error("❌ DB migration failed", e);
  process.exit(1);
}

// ❌ Quitar estos dos de tu versión anterior (no existen y no hacen falta):
// const db = require("./db/connection");
// const { ensureGoogleColumns } = require("./db/connection");
// ensureGoogleColumns();

/* ---------- Rutas públicas ---------- */
app.use(require("./routes/health")); // GET /health
app.use(require("./routes/auth"));   // /auth/register, /auth/login, /auth/me

/* ---------- Protección global ---------- */
app.use(requireAuth);

/* ---------- Contexto de Tenant ---------- */
app.use(injectTenant);

app.use(require("./routes/ics"));      // /integrations/ics/*
app.use(require("./routes/google"));   // (lo que ya tenías)

/* ---------- Rutas protegidas (tu API actual) ---------- */
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

/* ---------- Google Calendar (protegido) ---------- */
// ✅ Monta las rutas de Google aquí (después de requireAuth + injectTenant)
app.use(googleRoutes); // /integrations/google/*

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
