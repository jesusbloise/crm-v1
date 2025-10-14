const db = require("../db/connection");

/** Inserta un evento en la tabla events. */
function logEvent({ type, entity, entity_id, description, actor = null, meta = null }) {
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const created_at = Date.now();
  db.prepare(`
    INSERT INTO events (id,type,entity,entity_id,description,actor,meta,created_at)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(id, type, entity, entity_id, description, actor, meta ? JSON.stringify(meta) : null, created_at);
}

module.exports = logEvent;
