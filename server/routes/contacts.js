// server/routes/contacts.js
const { Router } = require("express");
const db = require("../db/connection");
const wrap = require("../lib/wrap");
const { requireTenantRole } = require("../lib/tenant");

const router = Router();

/**
 * GET /contacts
 * Lista contactos del tenant actual.
 * Opcional: ?limit=100
 */
router.get(
  "/contacts",
  wrap(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    const rows = db
      .prepare(
        `
        SELECT *
        FROM contacts
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
 * GET /contacts/:id
 * Detalle por id dentro del tenant.
 */
router.get(
  "/contacts/:id",
  wrap(async (req, res) => {
    const row = db
      .prepare(`SELECT * FROM contacts WHERE id = ? AND tenant_id = ?`)
      .get(req.params.id, req.tenantId);
    if (!row) return res.status(404).json({ error: "not_found" });
    res.json(row);
  })
);

/**
 * POST /contacts
 * Crea contacto (owner/admin).
 * Body: { id, name, email?, phone?, company?, position?, account_id? }
 */
router.post(
  "/contacts",
  requireTenantRole(["owner", "admin"]),
  wrap(async (req, res) => {
    let { id, name, email, phone, company, position, account_id } = req.body || {};

    id = typeof id === "string" ? id.trim() : "";
    name = typeof name === "string" ? name.trim() : "";
    email = typeof email === "string" ? email.trim() : null;
    phone = typeof phone === "string" ? phone.trim() : null;
    company = typeof company === "string" ? company.trim() : null;
    position = typeof position === "string" ? position.trim() : null;
    account_id = typeof account_id === "string" ? account_id.trim() : null;

    if (!id || !name) return res.status(400).json({ error: "id_and_name_required" });
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return res.status(400).json({ error: "invalid_contact_id" });
    }

    // ¿Existe ese id en este tenant?
    const existing = db
      .prepare(`SELECT 1 AS one FROM contacts WHERE id = ? AND tenant_id = ? LIMIT 1`)
      .get(id, req.tenantId);
    if (existing) return res.status(409).json({ error: "contact_exists" });

    // Si viene account_id, validar que exista en este tenant
    if (account_id) {
      const acc = db
        .prepare(`SELECT 1 FROM accounts WHERE id = ? AND tenant_id = ? LIMIT 1`)
        .get(account_id, req.tenantId);
      if (!acc) return res.status(400).json({ error: "invalid_account_id" });
    }

    const now = Date.now();
    db.prepare(
      `
      INSERT INTO contacts
        (id, name, email, phone, company, position, account_id, tenant_id, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `
    ).run(
      id,
      name,
      email ?? null,
      phone ?? null,
      company ?? null,
      position ?? null,
      account_id ?? null,
      req.tenantId,
      now,
      now
    );

    const created = db
      .prepare(`SELECT * FROM contacts WHERE id = ? AND tenant_id = ?`)
      .get(id, req.tenantId);

    // 🔔 Ajuste pedido: Location + payload con message
    res.setHeader("Location", `/contacts/${id}`);
    return res.status(201).json({
      ok: true,
      message: "Contacto guardado",
      contact: created,
    });
  })
);

/**
 * PATCH /contacts/:id
 * Actualiza contacto (owner/admin).
 */
router.patch(
  "/contacts/:id",
  requireTenantRole(["owner", "admin"]),
  wrap(async (req, res) => {
    const found = db
      .prepare(`SELECT * FROM contacts WHERE id = ? AND tenant_id = ?`)
      .get(req.params.id, req.tenantId);
    if (!found) return res.status(404).json({ error: "not_found" });

    let {
      name = found.name,
      email = found.email,
      phone = found.phone,
      company = found.company,
      position = found.position,
      account_id = found.account_id,
    } = req.body || {};

    name = typeof name === "string" ? name.trim() : found.name;
    email = typeof email === "string" ? email.trim() : found.email;
    phone = typeof phone === "string" ? phone.trim() : found.phone;
    company = typeof company === "string" ? company.trim() : found.company;
    position = typeof position === "string" ? position.trim() : found.position;
    account_id = typeof account_id === "string" ? account_id.trim() : found.account_id;

    // Si viene account_id, validar que exista en este tenant
    if (account_id) {
      const acc = db
        .prepare(`SELECT 1 FROM accounts WHERE id = ? AND tenant_id = ? LIMIT 1`)
        .get(account_id, req.tenantId);
      if (!acc) return res.status(400).json({ error: "invalid_account_id" });
    }

    const updated_at = Date.now();

    db.prepare(
      `
      UPDATE contacts
      SET name = ?, email = ?, phone = ?, company = ?, position = ?, account_id = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `
    ).run(
      name,
      email ?? null,
      phone ?? null,
      company ?? null,
      position ?? null,
      account_id ?? null,
      updated_at,
      req.params.id,
      req.tenantId
    );

    const updated = db
      .prepare(`SELECT * FROM contacts WHERE id = ? AND tenant_id = ?`)
      .get(req.params.id, req.tenantId);

    res.json(updated);
  })
);

/**
 * DELETE /contacts/:id
 * Elimina contacto (owner/admin).
 */
router.delete(
  "/contacts/:id",
  requireTenantRole(["owner", "admin"]),
  wrap(async (req, res) => {
    const info = db
      .prepare(`DELETE FROM contacts WHERE id = ? AND tenant_id = ?`)
      .run(req.params.id, req.tenantId);

    if (info.changes === 0) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  })
);

module.exports = router;



// // server/routes/contacts.js
// const { Router } = require("express");
// const db = require("../db/connection");
// const wrap = require("../lib/wrap");
// const { requireTenantRole } = require("../lib/tenant");

// const router = Router();

// /**
//  * GET /contacts
//  * Lista contactos del tenant actual.
//  * Opcional: ?limit=100
//  */
// router.get(
//   "/contacts",
//   wrap(async (req, res) => {
//     const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
//     const rows = db
//       .prepare(
//         `
//         SELECT *
//         FROM contacts
//         WHERE tenant_id = ?
//         ORDER BY updated_at DESC, id ASC
//         LIMIT ?
//       `
//       )
//       .all(req.tenantId, limit);
//     res.json(rows);
//   })
// );

// /**
//  * GET /contacts/:id
//  * Detalle por id dentro del tenant.
//  */
// router.get(
//   "/contacts/:id",
//   wrap(async (req, res) => {
//     const row = db
//       .prepare(`SELECT * FROM contacts WHERE id = ? AND tenant_id = ?`)
//       .get(req.params.id, req.tenantId);
//     if (!row) return res.status(404).json({ error: "not_found" });
//     res.json(row);
//   })
// );

// /**
//  * POST /contacts
//  * Crea contacto (owner/admin).
//  * Body: { id, name, email?, phone?, company?, position?, account_id? }
//  */
// router.post(
//   "/contacts",
//   requireTenantRole(["owner", "admin"]),
//   wrap(async (req, res) => {
//     let { id, name, email, phone, company, position, account_id } = req.body || {};

//     id = typeof id === "string" ? id.trim() : "";
//     name = typeof name === "string" ? name.trim() : "";
//     email = typeof email === "string" ? email.trim() : null;
//     phone = typeof phone === "string" ? phone.trim() : null;
//     company = typeof company === "string" ? company.trim() : null;
//     position = typeof position === "string" ? position.trim() : null;
//     account_id = typeof account_id === "string" ? account_id.trim() : null;

//     if (!id || !name) return res.status(400).json({ error: "id_and_name_required" });
//     if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      
//       return res.status(400).json({ error: "invalid_contact_id" });
//     }

//     // ¿Existe ese id en este tenant?
//     const existing = db
//       .prepare(`SELECT 1 AS one FROM contacts WHERE id = ? AND tenant_id = ? LIMIT 1`)
//       .get(id, req.tenantId);
//     if (existing) return res.status(409).json({ error: "contact_exists" });

//     // Si viene account_id, validar que exista en este tenant
//     if (account_id) {
//       const acc = db
//         .prepare(`SELECT 1 FROM accounts WHERE id = ? AND tenant_id = ? LIMIT 1`)
//         .get(account_id, req.tenantId);
//       if (!acc) return res.status(400).json({ error: "invalid_account_id" });
//     }

//     const now = Date.now();
//     db.prepare(
//       `
//       INSERT INTO contacts
//         (id, name, email, phone, company, position, account_id, tenant_id, created_at, updated_at)
//       VALUES (?,?,?,?,?,?,?,?,?,?)
//     `
//     ).run(
//       id,
//       name,
//       email ?? null,
//       phone ?? null,
//       company ?? null,
//       position ?? null, // <- FALTABA ESTE VALOR
//       account_id ?? null,
//       req.tenantId,
//       now,
//       now
//     );

//     const created = db
//       .prepare(`SELECT * FROM contacts WHERE id = ? AND tenant_id = ?`)
//       .get(id, req.tenantId);

//     res.status(201).json(created);
//   })
// );

// /**
//  * PATCH /contacts/:id
//  * Actualiza contacto (owner/admin).
//  */
// router.patch(
//   "/contacts/:id",
//   requireTenantRole(["owner", "admin"]),
//   wrap(async (req, res) => {
//     const found = db
//       .prepare(`SELECT * FROM contacts WHERE id = ? AND tenant_id = ?`)
//       .get(req.params.id, req.tenantId);
//     if (!found) return res.status(404).json({ error: "not_found" });

//     let {
//       name = found.name,
//       email = found.email,
//       phone = found.phone,
//       company = found.company,
//       position = found.position,
//       account_id = found.account_id,
//     } = req.body || {};

//     name = typeof name === "string" ? name.trim() : found.name;
//     email = typeof email === "string" ? email.trim() : found.email;
//     phone = typeof phone === "string" ? phone.trim() : found.phone;
//     company = typeof company === "string" ? company.trim() : found.company;
//     position = typeof position === "string" ? position.trim() : found.position;
//     account_id = typeof account_id === "string" ? account_id.trim() : found.account_id;

//     // Si viene account_id, validar que exista en este tenant
//     if (account_id) {
//       const acc = db
//         .prepare(`SELECT 1 FROM accounts WHERE id = ? AND tenant_id = ? LIMIT 1`)
//         .get(account_id, req.tenantId);
//       if (!acc) return res.status(400).json({ error: "invalid_account_id" });
//     }

//     const updated_at = Date.now();

//     db.prepare(
//       `
//       UPDATE contacts
//       SET name = ?, email = ?, phone = ?, company = ?, position = ?, account_id = ?, updated_at = ?
//       WHERE id = ? AND tenant_id = ?
//     `
//     ).run(
//       name,
//       email ?? null,
//       phone ?? null,
//       company ?? null,
//       position ?? null,
//       account_id ?? null,
//       updated_at,
//       req.params.id,
//       req.tenantId
//     );

//     const updated = db
//       .prepare(`SELECT * FROM contacts WHERE id = ? AND tenant_id = ?`)
//       .get(req.params.id, req.tenantId);

//     res.json(updated);
//   })
// );

// /**
//  * DELETE /contacts/:id
//  * Elimina contacto (owner/admin).
//  */
// router.delete(
//   "/contacts/:id",
//   requireTenantRole(["owner", "admin"]),
//   wrap(async (req, res) => {
//     const info = db
//       .prepare(`DELETE FROM contacts WHERE id = ? AND tenant_id = ?`)
//       .run(req.params.id, req.tenantId);

//     if (info.changes === 0) return res.status(404).json({ error: "not_found" });
//     res.json({ ok: true });
//   })
// );

// module.exports = router;

