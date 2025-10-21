// server/db/connection.js
const path = require("path");
const Database = require("better-sqlite3");

// Ruta absoluta (evita errores al ejecutar desde otro cwd)
const dbPath = path.join(__dirname, "..", "crm.db");

// Inicializa una única conexión (better-sqlite3 es sin pool)
const db = new Database(dbPath, {
  verbose:
    process.env.NODE_ENV !== "production"
      ? (msg) => console.log("📦 SQL:", msg)
      : null,
});

// Ajustes básicos de integridad y rendimiento
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// En desarrollo, muestra información de conexión
if (process.env.NODE_ENV !== "production") {
  console.log("✅ SQLite conectado:", dbPath);
}

module.exports = db;


// const Database = require("better-sqlite3");

// const db = new Database("./crm.db"); // archivo junto a /server
// db.pragma("journal_mode = WAL");
// db.pragma("foreign_keys = ON");

// module.exports = db;
