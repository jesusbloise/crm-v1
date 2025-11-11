// server/db/connection.js
const path = require("path");
const Database = require("better-sqlite3");

/**
 * 🔧 CONEXIÓN A BASE DE DATOS
 * - SQLite local para desarrollo y producción
 */

console.log("📦 Usando SQLite");
const dbPath = path.join(__dirname, "..", "crm.db");

const db = new Database(dbPath, {
  verbose:
    process.env.NODE_ENV !== "production"
      ? (msg) => console.log("📦 SQL:", msg)
      : null,
});

// Ajustes básicos de integridad y rendimiento
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Utils para migraciones
function tableExists(name) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name);
  return !!row;
}

function columnExists(table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((r) => r.name === column);
}

/**
 * Garantiza columnas relacionadas a Google en `users` si la tabla existe.
 * No crea la tabla ni rompe NOT NULL existentes.
 */
function ensureGoogleColumns() {
  if (!tableExists("users")) return;

  const added = [];

  if (!columnExists("users", "google_email")) {
    db.exec(`ALTER TABLE users ADD COLUMN google_email TEXT;`);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_users_google_email ON users(google_email);`
    );
    added.push("google_email");
  }

  if (!columnExists("users", "google_refresh_token")) {
    db.exec(`ALTER TABLE users ADD COLUMN google_refresh_token TEXT;`);
    added.push("google_refresh_token");
  }

  if (!columnExists("users", "google_calendar_id")) {
    db.exec(`ALTER TABLE users ADD COLUMN google_calendar_id TEXT;`);
    added.push("google_calendar_id");
  }

  if (!columnExists("users", "google_connected_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN google_connected_at INTEGER;`);
    added.push("google_connected_at");
  }

  if (added.length) {
    console.log(`🛠️  users: columnas añadidas -> ${added.join(", ")}`);
  }
}

// Inicializar columnas de Google si es necesario
try {
  ensureGoogleColumns();
  if (process.env.NODE_ENV !== "production") {
    console.log("✅ SQLite conectado:", dbPath);
  }
} catch (e) {
  console.error("❌ Error preparando la DB:", e);
}

module.exports = db;
module.exports.tableExists = tableExists;
module.exports.columnExists = columnExists;
module.exports.ensureGoogleColumns = ensureGoogleColumns;
