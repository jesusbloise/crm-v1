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
 *
 * Soporta:
 *  - ?limit=100
 *  - ?workspaceId=xxx  → filtra contactos cuyo account pertenece a ese workspace
 *
 * Estrategia:
 *  - Sin workspaceId: devuelve TODOS los contactos del tenant (como antes).
 *  - Con workspaceId: filtra por workspace usando la tabla accounts.
 */
router.get(
  "/contacts",
  canRead("contacts"),
  wrap(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    const workspaceId =
      typeof req.query.workspaceId === "string"
        ? req.query.workspaceId.trim()
        : "";

    let rows;

    if (workspaceId) {
      // 👇 Vista "por workspace": usamos accounts.workspace_id
      rows = await db
        .prepare(
          `
          SELECT 
            c.*,
            u.name  AS created_by_name,
            u.email AS created_by_email
          FROM contacts c
          LEFT JOIN users u   ON c.created_by = u.id
          LEFT JOIN accounts a ON c.account_id = a.id
          WHERE 
            c.tenant_id = ?
            AND a.workspace_id = ?
          ORDER BY c.updated_at DESC, c.id ASC
          LIMIT ?
        `
        )
        .all(req.tenantId, workspaceId, limit);
    } else {
      // 👇 Vista "todos los contactos de todos los workspaces"
      rows = await db
        .prepare(
          `
          SELECT 
            c.*,
            u.name  AS created_by_name,
            u.email AS created_by_email
          FROM contacts c
          LEFT JOIN users u ON c.created_by = u.id
          WHERE c.tenant_id = ?
          ORDER BY c.updated_at DESC, c.id ASC
          LIMIT ?
        `
        )
        .all(req.tenantId, limit);
    }

    res.json(rows);
  })
);


/**
 * GET /contacts/:id
 * Detalle por id dentro del tenant.
 * Cualquier usuario del tenant puede verlo (admin, owner, member).
 */
router.get(
  "/contacts/:id",
  wrap(async (req, res) => {
    const row = await db
      .prepare(
        `
        SELECT 
          c.*,
          u.name  AS created_by_name,
          u.email AS created_by_email
        FROM contacts c
        LEFT JOIN users u ON c.created_by = u.id
        WHERE c.id = ? AND c.tenant_id = ?
      `
      )
      .get(req.params.id, req.tenantId);

    if (!row) {
      return res.status(404).json({ error: "not_found" });
    }

    res.json(row);
  })
);

/**
 * GET /contacts-all
 * Devuelve TODOS los contactos de la tabla contacts, sin filtro de tenant.
 */
router.get(
  "/contacts-all",
  canRead("contacts"),
  wrap(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 500, 5000);

    const rows = await db
      .prepare(
        `
        SELECT 
          c.*,
          u.name  AS created_by_name,
          u.email AS created_by_email
        FROM contacts c
        LEFT JOIN users u ON c.created_by = u.id
        ORDER BY c.updated_at DESC, c.id ASC
        LIMIT ?
      `
      )
      .all(limit);

    console.log("[contacts-all] rows:", rows.length); // 👈 para que veas cuántos trae

    res.json(rows);
  })
);


/**
 * POST /contacts
 * Crear contacto (incluye client_type)
 */
router.post(
  "/contacts",
  canWrite("contacts"),
  wrap(async (req, res) => {
    let {
      id,
      name,
      email,
      phone,
      company,
      position,
      account_id,
      client_type, // 👈 NUEVO
    } = req.body || {};

    id = typeof id === "string" ? id.trim() : "";
    name = typeof name === "string" ? name.trim() : "";
    email = typeof email === "string" ? email.trim() : null;
    phone = typeof phone === "string" ? phone.trim() : null;
    company = typeof company === "string" ? company.trim() : null;
    position = typeof position === "string" ? position.trim() : null;
    account_id = typeof account_id === "string" ? account_id.trim() : null;
    client_type = typeof client_type === "string" ? client_type.trim() : null;

    // Validar valores del client_type
    const allowed = ["productora", "agencia", "directo", null];

    if (!allowed.includes(client_type)) client_type = null;

    if (!id || !name)
      return res.status(400).json({ error: "id_and_name_required" });

    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return res.status(400).json({ error: "invalid_contact_id" });
    }

    // Validar que ese id no exista
    const existing = await db
      .prepare(
        `SELECT 1 AS one FROM contacts WHERE id = ? AND tenant_id = ? LIMIT 1`
      )
      .get(id, req.tenantId);

    if (existing) return res.status(409).json({ error: "contact_exists" });

    // Validar cuenta si viene
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

    await db
      .prepare(
        `
      INSERT INTO contacts
        (id, name, email, phone, company, position, account_id, client_type, tenant_id, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `
      )
      .run(
        id,
        name,
        email ?? null,
        phone ?? null,
        company ?? null,
        position ?? null,
        account_id ?? null,
        client_type ?? null,
        req.tenantId,
        userId,
        now,
        now
      );

    const created = await db
      .prepare(`SELECT * FROM contacts WHERE id = ? AND tenant_id = ?`)
      .get(id, req.tenantId);

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
 * Actualiza contacto (incluye client_type)
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
      client_type = found.client_type, // 👈 NUEVO
    } = req.body || {};

    name = typeof name === "string" ? name.trim() : found.name;
    email = typeof email === "string" ? email.trim() : found.email;
    phone = typeof phone === "string" ? phone.trim() : found.phone;
    company = typeof company === "string" ? company.trim() : found.company;
    position =
      typeof position === "string" ? position.trim() : found.position;
    account_id =
      typeof account_id === "string" ? account_id.trim() : found.account_id;
    client_type =
      typeof client_type === "string"
        ? client_type.trim()
        : found.client_type;

    // Validar tipo
 const allowed = ["productora", "agencia", "directo", null];

    if (!allowed.includes(client_type)) client_type = found.client_type;

    // Validar cuenta si viene
    if (account_id) {
      const acc = await db
        .prepare(
          `SELECT 1 FROM accounts WHERE id = ? AND tenant_id = ? LIMIT 1`
        )
        .get(account_id, req.tenantId);
      if (!acc) return res.status(400).json({ error: "invalid_account_id" });
    }

    const updated_at = Date.now();

    await db
      .prepare(
        `
      UPDATE contacts
      SET 
        name = ?, email = ?, phone = ?, company = ?, position = ?, 
        account_id = ?, client_type = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `
      )
      .run(
        name,
        email ?? null,
        phone ?? null,
        company ?? null,
        position ?? null,
        account_id ?? null,
        client_type ?? null,
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

/**
 * GET /contacts/export-all-csv
 * Exporta TODOS los contactos de la tabla contacts (todos los tenants).
 * Solo para usuarios con rol GLOBAL admin u owner.
 * Opcional: ?since=TIMESTAMP_MS → solo contactos con updated_at > since.
 */
router.get(
  "/contacts/export-all-csv",
  wrap(async (req, res) => {
    const { resolveUserId } = require("../lib/authorize");
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    // Rol global del usuario
    const user = await db
      .prepare(`SELECT role FROM users WHERE id = ? LIMIT 1`)
      .get(userId);
    const role = user?.role || "member";

    if (role !== "admin" && role !== "owner") {
      return res.status(403).json({ error: "forbidden" });
    }

    const sinceRaw = req.query?.since;
    let sinceMs = 0;
    if (sinceRaw != null) {
      const n = Number(sinceRaw);
      if (Number.isFinite(n) && n > 0) {
        sinceMs = n;
      }
    }

    const clauses = ["1=1"];
    const params = [];

    if (sinceMs > 0) {
      clauses.push("updated_at > ?");
      params.push(sinceMs);
    }

    const rows = await db
      .prepare(
        `
        SELECT 
          id,
          tenant_id,
          name,
          email,
          phone,
          company,
          position,
          client_type,
          account_id,
          created_by,
          created_at,
          updated_at
        FROM contacts
        WHERE ${clauses.join(" AND ")}
        ORDER BY tenant_id ASC, created_at ASC
      `
      )
      .all(...params);

    const headers = [
      "id",
      "tenant_id",
      "name",
      "email",
      "phone",
      "company",
      "position",
      "client_type",
      "account_id",
      "created_by",
      "created_at",
      "updated_at",
    ];

    const esc = (val) => {
      if (val === null || val === undefined) return "";
      const s = String(val);
      if (
        s.includes('"') ||
        s.includes(",") ||
        s.includes("\n") ||
        s.includes("\r")
      ) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    const lines = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
    ];
    const csv = lines.join("\r\n");

    const now = new Date();
    const pad = (n) => (n < 10 ? "0" + n : String(n));
    const filename = `contacts-all-${now.getFullYear()}${pad(
      now.getMonth() + 1
    )}${pad(now.getDate())}-${pad(now.getHours())}${pad(
      now.getMinutes()
    )}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.send(csv);
  })
);

module.exports = router;

