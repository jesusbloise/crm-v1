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
    console.log("🐘 Ejecutando migraciones PostgreSQL...");
    const { runMigrations } = require("./db/migrate-pg");
    const { ensureGoogleColumns } = require("./db/connection");
    
    await runMigrations();
    await ensureGoogleColumns();
    
    console.log("✅ Migraciones completadas");
  } catch (err) {
    console.error("❌ Error en migraciones:", err);
    console.error("💡 Asegúrate de tener PostgreSQL corriendo y configurado");
    console.error("   Variables necesarias: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE");
    console.error("   O usa: DATABASE_URL=postgresql://user:pass@host:5432/dbname");
    process.exit(1);
  }

  const server = app.listen(PORT, HOST, () => {
    const env = process.env.NODE_ENV || "development";
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
