// server/routes/accounts.js
const { Router } = require("express");
const db = require("../db/connection");
const wrap = require("../lib/wrap");
const { requireTenantRole } = require("../lib/tenant"); // owner/admin para mutaciones

const router = Router();

/**
 * GET /accounts
 * Lista de cuentas del tenant actual (ordenadas por updated_at desc).
 * Opcional: ?limit=50
 */
router.get(
  "/accounts",
  wrap(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    const rows = db
      .prepare(
        `
        SELECT *
        FROM accounts
        WHERE tenant_id = ?
        ORDER BY updated_at DESC, id ASC
        LIMIT ?
      `
      )
      .all(req.tenantId, limit);
    res.json(rows);
  })
);

/**
 * GET /accounts/:id
 * Detalle dentro del tenant.
 */
router.get(
  "/accounts/:id",
  wrap(async (req, res) => {
    const row = db
      .prepare(`SELECT * FROM accounts WHERE id = ? AND tenant_id = ?`)
      .get(req.params.id, req.tenantId);
    if (!row) return res.status(404).json({ error: "not_found" });
    res.json(row);
  })
);

/**
 * POST /accounts
 * Crea cuenta (owner/admin).
 * Body: { id, name, website?, phone? }
 */
router.post(
  "/accounts",
  requireTenantRole(["owner", "admin"]),
  wrap(async (req, res) => {
    let { id, name, website, phone } = req.body || {};
    id = typeof id === "string" ? id.trim() : "";
    name = typeof name === "string" ? name.trim() : "";

    if (!id || !name) return res.status(400).json({ error: "id_and_name_required" });
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return res.status(400).json({ error: "invalid_account_id" });
    }

    // ¿existe ya ese id en este tenant?
    const existing = db
      .prepare(`SELECT 1 AS one FROM accounts WHERE id = ? AND tenant_id = ? LIMIT 1`)
      .get(id, req.tenantId);
    if (existing) return res.status(409).json({ error: "account_exists" });

    const now = Date.now();
    db.prepare(
      `
      INSERT INTO accounts (id, name, website, phone, tenant_id, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?)
    `
    ).run(id, name, website ?? null, phone ?? null, req.tenantId, now, now);

    const created = db
      .prepare(`SELECT * FROM accounts WHERE id = ? AND tenant_id = ?`)
      .get(id, req.tenantId);

    res.status(201).json(created);
  })
);

/**
 * PATCH /accounts/:id
 * Actualiza dentro del tenant (owner/admin).
 */
router.patch(
  "/accounts/:id",
  requireTenantRole(["owner", "admin"]),
  wrap(async (req, res) => {
    const found = db
      .prepare(`SELECT * FROM accounts WHERE id = ? AND tenant_id = ?`)
      .get(req.params.id, req.tenantId);
    if (!found) return res.status(404).json({ error: "not_found" });

    const next = {
      ...found,
      ...(req.body || {}),
      name:
        typeof req.body?.name === "string" ? req.body.name.trim() : found.name,
      website:
        typeof req.body?.website === "string" ? req.body.website : found.website,
      phone:
        typeof req.body?.phone === "string" ? req.body.phone : found.phone,
      updated_at: Date.now(),
    };

    db.prepare(
      `
      UPDATE accounts
      SET name = ?, website = ?, phone = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `
    ).run(
      next.name,
      next.website ?? null,
      next.phone ?? null,
      next.updated_at,
      req.params.id,
      req.tenantId
    );

    const updated = db
      .prepare(`SELECT * FROM accounts WHERE id = ? AND tenant_id = ?`)
      .get(req.params.id, req.tenantId);

    res.json(updated);
  })
);

/**
 * DELETE /accounts/:id
 * Borra dentro del tenant (owner/admin).
 */
router.delete(
  "/accounts/:id",
  requireTenantRole(["owner", "admin"]),
  wrap(async (req, res) => {
    const info = db
      .prepare(`DELETE FROM accounts WHERE id = ? AND tenant_id = ?`)
      .run(req.params.id, req.tenantId);

    if (info.changes === 0) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  })
);

module.exports = router;

// const { Router } = require("express");
// const db = require("../db/connection");
// const wrap = require("../lib/wrap");

// const router = Router();

// router.get("/accounts", wrap(async (req, res) => {
//   const rows = db.prepare(
//     "SELECT * FROM accounts WHERE tenant_id = ? ORDER BY updated_at DESC"
//   ).all(req.tenantId);
//   res.json(rows);
// }));

// router.get("/accounts/:id", wrap(async (req, res) => {
//   const row = db.prepare(
//     "SELECT * FROM accounts WHERE id = ? AND tenant_id = ?"
//   ).get(req.params.id, req.tenantId);
//   if (!row) return res.status(404).json({ error: "not found" });
//   res.json(row);
// }));

// router.post("/accounts", wrap(async (req, res) => {
//   const { id, name, website, phone } = req.body || {};
//   if (!id || !name) return res.status(400).json({ error: "id and name required" });
//   const now = Date.now();
//   db.prepare(`
//     INSERT INTO accounts (id, name, website, phone, tenant_id, created_at, updated_at)
//     VALUES (?,?,?,?,?,?,?)
//   `).run(id, name, website ?? null, phone ?? null, req.tenantId, now, now);
//   res.status(201).json({ ok: true });
// }));

// router.patch("/accounts/:id", wrap(async (req, res) => {
//   const found = db.prepare(
//     "SELECT * FROM accounts WHERE id = ? AND tenant_id = ?"
//   ).get(req.params.id, req.tenantId);
//   if (!found) return res.status(404).json({ error: "not found" });

//   const next = { ...found, ...req.body, updated_at: Date.now() };
//   db.prepare(`
//     UPDATE accounts SET name=?, website=?, phone=?, updated_at=? WHERE id=? AND tenant_id=?
//   `).run(next.name, next.website ?? null, next.phone ?? null, next.updated_at, req.params.id, req.tenantId);

//   res.json({ ok: true });
// }));

// router.delete("/accounts/:id", wrap(async (req, res) => {
//   db.prepare("DELETE FROM accounts WHERE id = ? AND tenant_id = ?")
//     .run(req.params.id, req.tenantId);
//   res.json({ ok: true });
// }));

// module.exports = router;

