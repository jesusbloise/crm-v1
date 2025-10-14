const Database = require("better-sqlite3");

const db = new Database("./crm.db"); // archivo junto a /server
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

module.exports = db;
