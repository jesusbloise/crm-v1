// server/routes/contacts.js
const { Router } = require("express");
const db = require("../db/connection");
const wrap = require("../lib/wrap");
const { requireTenantRole } = require("../lib/tenant");
const {
  canRead,
  canWrite,
  canDelete,
  getOwnershipFilter,
  resolveUserId,
} = require("../lib/authorize");

const router = Router();

/**
 * GET /contacts
 * Lista contactos del tenant actual.
 * - TODOS los miembros del workspace ven TODOS los contactos compartidos
 * - Incluye el nombre del usuario que creó cada contacto
 * Opcional: ?limit=100
 */
router.get(
  "/contacts",
  wrap(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);

    // ✅ Contactos compartidos con nombre del creador
    const rows = await db
      .prepare(
        `
        SELECT 
          c.*,
          u.name as created_by_name,
          u.email as created_by_email
        FROM contacts c
        LEFT JOIN users u ON c.created_by = u.id
        WHERE c.tenant_id = ?
        ORDER BY c.updated_at DESC, c.id ASC
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
 * - TODOS los miembros pueden ver cualquier contacto del workspace
 * - Incluye el nombre del usuario que creó el contacto
 */
router.get(
  "/contacts/:id",
  wrap(async (req, res) => {
    const row = await db
      .prepare(
        `
        SELECT 
          c.*,
          u.name as created_by_name,
          u.email as created_by_email
        FROM contacts c
        LEFT JOIN users u ON c.created_by = u.id
        WHERE c.id = ? AND c.tenant_id = ?
      `
      )
      .get(req.params.id, req.tenantId);
    if (!row) return res.status(404).json({ error: "not_found" });
    res.json(row);
  })
);

/**
 * POST /contacts
 * Crea contacto.
 * - Todos los usuarios autenticados pueden crear contactos
 * - Se asigna automáticamente el created_by del usuario
 * Body: { id, name, email?, phone?, company?, position?, account_id? }
 */
router.post(
  "/contacts",
  wrap(async (req, res) => {
    let { id, name, email, phone, company, position, account_id } =
      req.body || {};

    id = typeof id === "string" ? id.trim() : "";
    name = typeof name === "string" ? name.trim() : "";
    email = typeof email === "string" ? email.trim() : null;
    phone = typeof phone === "string" ? phone.trim() : null;
    company = typeof company === "string" ? company.trim() : null;
    position = typeof position === "string" ? position.trim() : null;
    account_id = typeof account_id === "string" ? account_id.trim() : null;

    if (!id || !name)
      return res.status(400).json({ error: "id_and_name_required" });
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return res.status(400).json({ error: "invalid_contact_id" });
    }

    // ¿Existe ese id en este tenant?
    const existing = await db
      .prepare(
        `SELECT 1 AS one FROM contacts WHERE id = ? AND tenant_id = ? LIMIT 1`
      )
      .get(id, req.tenantId);
    if (existing) return res.status(409).json({ error: "contact_exists" });

    // Si viene account_id, validar que exista en este tenant
    if (account_id) {
      const acc = await db
        .prepare(
          `SELECT 1 FROM accounts WHERE id = ? AND tenant_id = ? LIMIT 1`
        )
        .get(account_id, req.tenantId);
      if (!acc) return res.status(400).json({ error: "invalid_account_id" });
    }

    const userId = resolveUserId(req);
    const now = Date.now();
    
    await db.prepare(
      `
      INSERT INTO contacts
        (id, name, email, phone, company, position, account_id, tenant_id, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
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
      userId,
      now,
      now
    );

    const created = await db
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
 * Actualiza contacto.
 * - Admins pueden editar cualquier contacto
 * - Users solo pueden editar sus propios contactos
 */
router.patch(
  "/contacts/:id",
  canWrite("contacts"),
  wrap(async (req, res) => {
    const found = await db
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
      const acc = await db
        .prepare(`SELECT 1 FROM accounts WHERE id = ? AND tenant_id = ? LIMIT 1`)
        .get(account_id, req.tenantId);
      if (!acc) return res.status(400).json({ error: "invalid_account_id" });
    }

    const updated_at = Date.now();

    await db.prepare(
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

    const updated = await db
      .prepare(`SELECT * FROM contacts WHERE id = ? AND tenant_id = ?`)
      .get(req.params.id, req.tenantId);

    res.json(updated);
  })
);

/**
 * DELETE /contacts/:id
 * Elimina contacto.
 * - Admins pueden eliminar cualquier contacto
 * - Users solo pueden eliminar sus propios contactos
 */
router.delete(
  "/contacts/:id",
  canDelete("contacts"),
  wrap(async (req, res) => {
    const info = await db
      .prepare(`DELETE FROM contacts WHERE id = ? AND tenant_id = ?`)
      .run(req.params.id, req.tenantId);

    if (info.changes === 0)
      return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  })
);

module.exports = router;

