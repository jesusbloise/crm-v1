// server/routes/leads.js
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
 * GET /leads
 * Lista de leads del tenant actual.
 * - Admins ven todos los leads del tenant
 * - Users solo ven sus propios leads
 * Opcional: ?limit=100
 */
router.get(
  "/leads",
  wrap(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    const ownership = getOwnershipFilter(req);

    const rows = db
      .prepare(
        `
        SELECT *
        FROM leads
        WHERE tenant_id = ? ${ownership}
        ORDER BY updated_at DESC, id ASC
        LIMIT ?
      `
      )
      .all(req.tenantId, limit);
    res.json(rows);
  })
);

/**
 * GET /leads/:id
 * Detalle de lead dentro del tenant actual.
 * - Admins pueden ver cualquier lead
 * - Users solo pueden ver sus propios leads
 */
router.get(
  "/leads/:id",
  canRead("leads"),
  wrap(async (req, res) => {
    const row = db
      .prepare(`SELECT * FROM leads WHERE id = ? AND tenant_id = ?`)
      .get(req.params.id, req.tenantId);
    if (!row) return res.status(404).json({ error: "not_found" });
    res.json(row);
  })
);

/**
 * POST /leads
 * Crea lead.
 * - Todos los usuarios autenticados pueden crear leads
 * - Se asigna automáticamente el created_by del usuario
 * Body: { id, name, email?, phone?, company?, status? }
 */
router.post(
  "/leads",
  wrap(async (req, res) => {
    let { id, name, email, phone, company, status } = req.body || {};

    id = typeof id === "string" ? id.trim() : "";
    name = typeof name === "string" ? name.trim() : "";
    email = typeof email === "string" ? email.trim() : null;
    phone = typeof phone === "string" ? phone.trim() : null;
    company = typeof company === "string" ? company.trim() : null;
    status = typeof status === "string" ? status.trim() : null;

    if (!id || !name)
      return res.status(400).json({ error: "id_and_name_required" });
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return res.status(400).json({ error: "invalid_lead_id" });
    }

    // ¿existe ya ese id en este tenant?
    const existing = db
      .prepare(`SELECT 1 FROM leads WHERE id = ? AND tenant_id = ? LIMIT 1`)
      .get(id, req.tenantId);
    if (existing) return res.status(409).json({ error: "lead_exists" });

    const userId = resolveUserId(req);
    const now = Date.now();
    
    // 🔍 DEBUG: Ver qué userId se va a usar
    console.log('🔍 [POST /leads] Creating lead:', {
      leadId: id,
      userId,
      tenantId: req.tenantId,
      'req.user.id': req.user?.id,
      'req.auth.sub': req.auth?.sub
    });
    
    db.prepare(
      `
      INSERT INTO leads
        (id, name, email, phone, company, status, tenant_id, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `
    ).run(
      id,
      name,
      email ?? null,
      phone ?? null,
      company ?? null,
      status ?? null,
      req.tenantId,
      userId,
      now,
      now
    );
    
    console.log('✅ [POST /leads] Lead created successfully with created_by:', userId);

    const created = db
      .prepare(`SELECT * FROM leads WHERE id = ? AND tenant_id = ?`)
      .get(id, req.tenantId);

    res.status(201).json(created);
  })
);

/**
 * PATCH /leads/:id
 * Actualiza lead.
 * - Admins pueden editar cualquier lead
 * - Users solo pueden editar sus propios leads
 */
router.patch(
  "/leads/:id",
  canWrite("leads"),
  wrap(async (req, res) => {
    const found = db
      .prepare(`SELECT * FROM leads WHERE id = ? AND tenant_id = ?`)
      .get(req.params.id, req.tenantId);
    if (!found) return res.status(404).json({ error: "not_found" });

    let {
      name = found.name,
      email = found.email,
      phone = found.phone,
      company = found.company,
      status = found.status,
    } = req.body || {};

    name = typeof name === "string" ? name.trim() : found.name;
    email = typeof email === "string" ? email.trim() : found.email;
    phone = typeof phone === "string" ? phone.trim() : found.phone;
    company = typeof company === "string" ? company.trim() : found.company;
    status = typeof status === "string" ? status.trim() : found.status;

    const updated_at = Date.now();

    db.prepare(
      `
      UPDATE leads
      SET name = ?, email = ?, phone = ?, company = ?, status = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `
    ).run(
      name ?? null,
      email ?? null,
      phone ?? null,
      company ?? null,
      status ?? null,
      updated_at,
      req.params.id,
      req.tenantId
    );

    const updated = db
      .prepare(`SELECT * FROM leads WHERE id = ? AND tenant_id = ?`)
      .get(req.params.id, req.tenantId);

    res.json(updated);
  })
);

/**
 * DELETE /leads/:id
 * Elimina lead.
 * - Admins pueden eliminar cualquier lead
 * - Users solo pueden eliminar sus propios leads
 */
router.delete(
  "/leads/:id",
  canDelete("leads"),
  wrap(async (req, res) => {
    const info = db
      .prepare(`DELETE FROM leads WHERE id = ? AND tenant_id = ?`)
      .run(req.params.id, req.tenantId);

    if (info.changes === 0)
      return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  })
);

module.exports = router;
