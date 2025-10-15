// server/scripts/backfillTenant.js
const Database = require("better-sqlite3");
const path = require("path");

const TENANT = process.argv[2] || "demo";
const dbPath = path.join(__dirname, "..", "crm.db");
const db = new Database(dbPath);

const tables = ["leads","contacts","accounts","deals","activities","notes","events"];

function columnExists(table, column) {
  const info = db.prepare(`PRAGMA table_info(${table})`).all();
  return info.some(c => c.name === column);
}

db.transaction(() => {
  for (const t of tables) {
    if (!columnExists(t, "tenant_id")) {
      console.log(`⚠️  Tabla ${t} no tiene tenant_id (la dejo igual).`);
      continue;
    }
    const stmt = db.prepare(`UPDATE ${t} SET tenant_id=? WHERE tenant_id IS NULL`);
    const res = stmt.run(TENANT);
    console.log(`✅ ${t}: ${res.changes} filas actualizadas a tenant_id='${TENANT}'`);
  }
})();

console.log("\nListo. Puedes cerrar esta ventana.");
