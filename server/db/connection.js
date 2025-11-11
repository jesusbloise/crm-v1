// server/db/connection.js
const { Pool } = require("pg");

/**
 * 🔧 CONEXIÓN A BASE DE DATOS
 * - PostgreSQL para desarrollo y producción
 * 
 * LOCAL: Usa PostgreSQL local en localhost:5432
 * PRODUCCIÓN: Usa DATABASE_URL del servicio (Render, Railway, etc.)
 */

const DATABASE_URL = process.env.DATABASE_URL || 
  `postgresql://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || 'postgres'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || 'crm_db'}`;

console.log("� Usando PostgreSQL");
console.log("🔗 Conectando a:", DATABASE_URL.replace(/:[^:@]+@/, ':****@')); // Oculta password en logs

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('.') 
    ? { rejectUnauthorized: false } 
    : false, // SSL solo en producción
});

// Wrapper para mantener compatibilidad con sintaxis de better-sqlite3
const db = {
  prepare: (sql) => {
    // Convierte placeholders de SQLite (?) a PostgreSQL ($1, $2, $3)
    let index = 0;
    const pgSql = sql.replace(/\?/g, () => `$${++index}`);
    
    return {
      run: async (...params) => {
        const client = await pool.connect();
        try {
          const result = await client.query(pgSql, params);
          return { changes: result.rowCount };
        } finally {
          client.release();
        }
      },
      get: async (...params) => {
        const client = await pool.connect();
        try {
          const result = await client.query(pgSql, params);
          return result.rows[0] || null;
        } finally {
          client.release();
        }
      },
      all: async (...params) => {
        const client = await pool.connect();
        try {
          const result = await client.query(pgSql, params);
          return result.rows;
        } finally {
          client.release();
        }
      },
    };
  },
  exec: async (sql) => {
    const client = await pool.connect();
    try {
      await client.query(sql);
    } finally {
      client.release();
    }
  },
  query: async (sql, params = []) => {
    const client = await pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  },
};

// Utils para migraciones (compatibles con PostgreSQL)
async function tableExists(name) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = $1",
      [name]
    );
    return result.rows.length > 0;
  } finally {
    client.release();
  }
}

async function columnExists(table, column) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2",
      [table, column]
    );
    return result.rows.length > 0;
  } finally {
    client.release();
  }
}

/**
 * Garantiza columnas relacionadas a Google en `users` si la tabla existe.
 * No crea la tabla ni rompe NOT NULL existentes.
 */
async function ensureGoogleColumns() {
  if (!(await tableExists("users"))) return;

  const added = [];
  const client = await pool.connect();
  
  try {
    if (!(await columnExists("users", "google_email"))) {
      await client.query(`ALTER TABLE users ADD COLUMN google_email TEXT;`);
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_users_google_email ON users(google_email);`
      );
      added.push("google_email");
    }

    if (!(await columnExists("users", "google_refresh_token"))) {
      await client.query(`ALTER TABLE users ADD COLUMN google_refresh_token TEXT;`);
      added.push("google_refresh_token");
    }

    if (!(await columnExists("users", "google_calendar_id"))) {
      await client.query(`ALTER TABLE users ADD COLUMN google_calendar_id TEXT;`);
      added.push("google_calendar_id");
    }

    if (!(await columnExists("users", "google_connected_at"))) {
      await client.query(`ALTER TABLE users ADD COLUMN google_connected_at BIGINT;`);
      added.push("google_connected_at");
    }

    if (added.length) {
      console.log(`🛠️  users: columnas añadidas -> ${added.join(", ")}`);
    }
  } finally {
    client.release();
  }
}

// Test de conexión
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Error conectando a PostgreSQL:', err.message);
    console.error('💡 Asegúrate de tener PostgreSQL corriendo y las variables configuradas');
  } else {
    console.log('✅ PostgreSQL conectado:', res.rows[0].now);
  }
});

module.exports = db;
module.exports.pool = pool;
module.exports.tableExists = tableExists;
module.exports.columnExists = columnExists;
module.exports.ensureGoogleColumns = ensureGoogleColumns;
