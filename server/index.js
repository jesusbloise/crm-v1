// server/index.js
require("dotenv").config();

const app = require("./app");

// Evita NaN si PORT viene vacío; default 4000 según .env actual
const rawPort = process.env.PORT;
const PORT = Number.isFinite(Number(rawPort)) && Number(rawPort) > 0 ? Number(rawPort) : 4000;
const HOST = process.env.HOST || "0.0.0.0";

// 🐘 Ejecuta migraciones antes de levantar el servidor
(async () => {
  try {
    if (process.env.DATABASE_URL) {
      console.log("🐘 Detectado PostgreSQL, ejecutando migraciones...");
      const { runMigrations } = require("./db/migrate-pg");
      await runMigrations();
    } else {
      console.log("📦 Usando SQLite, ejecutando migraciones...");
      const {
        runMigrations,
        ensureTenantCore,
        ensureTenantColumns,
        ensureContactsAccountId,
        ensureCreatedByColumns,
        ensureUsersActive,
      } = require("./db/migrate");
      runMigrations();
      ensureTenantCore();
      ensureTenantColumns();
      ensureContactsAccountId();
      ensureCreatedByColumns();
      ensureUsersActive();
    }
    console.log("✅ Migraciones completadas");
  } catch (err) {
    console.error("❌ Error en migraciones:", err);
    process.exit(1);
  }

  const server = app.listen(PORT, HOST, () => {
    const env = process.env.NODE_ENV || "development";
    // En Railway el host real será 0.0.0.0 y te dan el dominio público aparte
    console.log(`🚀 API running on http://${HOST === "0.0.0.0" ? "0.0.0.0" : HOST}:${PORT} (env: ${env})`);
  });

  server.on("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
      console.error(`❌ Puerto ${PORT} en uso. Cambia PORT en .env o cierra procesos.`);
      if (process.platform === "win32") {
        console.error("💡 PowerShell: taskkill /F /IM node.exe");
      }
    } else {
      console.error("❌ Server error:", err);
    }
  });

  process.on("unhandledRejection", (reason) => console.error("⚠️  Unhandled Rejection:", reason));
  process.on("uncaughtException", (err) => console.error("⚠️  Uncaught Exception:", err));

  const shutdown = () => {
    console.log("⏳ Cerrando servidor...");
    server.close(() => {
      console.log("✅ Servidor cerrado.");
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
})();


