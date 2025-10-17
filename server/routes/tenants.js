// server/routes/tenants.js
const { Router } = require("express");
const db = require("../db/connection");
const requireAuth = require("../lib/requireAuth");
const r = Router();

r.use(requireAuth);

r.post("/tenants", (req, res) => {
  if (!req.auth?.roles?.admin) return res.status(403).json({ error: "forbidden" });

  const { id, name } = req.body || {};
  if (!id || !name) return res.status(400).json({ error: "id_and_name_required" });

  const now = Date.now();
  const txn = db.transaction(() => {
    db.prepare(`INSERT INTO tenants (id, name, created_at, updated_at) VALUES (?,?,?,?)`)
      .run(id, name, now, now);
    db.prepare(`INSERT INTO memberships (user_id, tenant_id, role, created_at) VALUES (?,?,?,?)`)
      .run(req.auth.sub, id, "owner", now);
  });
  txn();

  res.status(201).json({ id, name });
});

module.exports = r;
