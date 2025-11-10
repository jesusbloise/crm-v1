const db = require('../db/connection');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('\nTablas en la base de datos:\n');
console.table(tables);
