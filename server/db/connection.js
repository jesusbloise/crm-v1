// server/db/connection.js
const path = require("path");

/**
 * 🔧 ADAPTADOR DE BASE DE DATOS
 * - LOCAL: SQLite (better-sqlite3)
 * - PRODUCCIÓN: PostgreSQL (pg) si existe DATABASE_URL
 */

const DATABASE_URL = process.env.DATABASE_URL;
const USE_POSTGRES = !!DATABASE_URL;

let db;

if (USE_POSTGRES) {
  console.log("🐘 Usando PostgreSQL (Railway)");
  const { Pool } = require("pg");
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes("railway.app")
      ? { rejectUnauthorized: false }
      : false,
  });

  // Wrapper para hacer que PostgreSQL funcione como better-sqlite3
  db = {
    prepare: (sql) => ({
      run: async (...params) => {
        const client = await pool.connect();
        try {
          const result = await client.query(sql, params);
          return { changes: result.rowCount };
        } finally {
          client.release();
        }
      },
      get: async (...params) => {
        const client = await pool.connect();
        try {
          const result = await client.query(sql, params);
          return result.rows[0] || null;
        } finally {
          client.release();
        }
      },
      all: async (...params) => {
        const client = await pool.connect();
        try {
          const result = await client.query(sql, params);
          return result.rows;
        } finally {
          client.release();
        }
      },
    }),
    exec: async (sql) => {
      const client = await pool.connect();
      try {
        await client.query(sql);
      } finally {
        client.release();
      }
    },
    pragma: () => {}, // No-op para PostgreSQL
  };
} else {
  console.log("📦 Usando SQLite (Local)");
  const Database = require("better-sqlite3");
  const dbPath = path.join(__dirname, "..", "crm.db");

  db = new Database(dbPath, {
    verbose:
      process.env.NODE_ENV !== "production"
        ? (msg) => console.log("📦 SQL:", msg)
        : null,
  });

  // Ajustes básicos de integridad y rendimiento
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
}

// Utils no destructivas (agnósticas de DB)
async function tableExists(name) {
  if (USE_POSTGRES) {
    const row = await db
      .prepare(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = $1"
      )
      .get(name);
    return !!row;
  } else {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
      .get(name);
    return !!row;
  }
}

async function columnExists(table, column) {
  if (USE_POSTGRES) {
    const row = await db
      .prepare(
        "SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2"
      )
      .get(table, column);
    return !!row;
  } else {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all();
    return rows.some((r) => r.name === column);
  }
}

/**
 * Garantiza columnas relacionadas a Google en `users` si la tabla existe.
 * No crea la tabla ni rompe NOT NULL existentes.
 */
async function ensureGoogleColumns() {
  if (!(await tableExists("users"))) return;

  const added = [];

  if (!(await columnExists("users", "google_email"))) {
    await db.exec(`ALTER TABLE users ADD COLUMN google_email TEXT;`);
    await db.exec(
      `CREATE INDEX IF NOT EXISTS idx_users_google_email ON users(google_email);`
    );
    added.push("google_email");
  }

  if (!(await columnExists("users", "google_refresh_token"))) {
    await db.exec(`ALTER TABLE users ADD COLUMN google_refresh_token TEXT;`);
    added.push("google_refresh_token");
  }

  // Calendario preferido (opcional) del usuario
  if (!(await columnExists("users", "google_calendar_id"))) {
    await db.exec(`ALTER TABLE users ADD COLUMN google_calendar_id TEXT;`);
    added.push("google_calendar_id");
  }

  // Marca de tiempo de la conexión
  if (!(await columnExists("users", "google_connected_at"))) {
    await db.exec(`ALTER TABLE users ADD COLUMN google_connected_at INTEGER;`);
    added.push("google_connected_at");
  }

  if (added.length) {
    console.log(`🛠️  users: columnas añadidas -> ${added.join(", ")}`);
  }
}

// Boot seguro (intenta migrar sin romper nada)
(async () => {
  try {
    await ensureGoogleColumns();
    if (!USE_POSTGRES && process.env.NODE_ENV !== "production") {
      console.log("✅ SQLite conectado:", path.join(__dirname, "..", "crm.db"));
    }
  } catch (e) {
    console.error("❌ Error preparando la DB:", e);
  }
})();

module.exports = db;
module.exports.ensureGoogleColumns = ensureGoogleColumns;
