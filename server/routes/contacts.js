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

/** helpers */
const coerceStr = (v) => (typeof v === "string" ? v.trim() : null);
const normalizeEmail = (v) => {
  const s = coerceStr(v);
  if (!s) return null;
  return s.toLowerCase();
};
const safeClientType = (v) => {
  const s = coerceStr(v);
  if (!s) return null;
  const x = s.toLowerCase();
  const allowed = ["productora", "agencia", "directo"];
  return allowed.includes(x) ? x : null;
};
const makeContactId = () => {
  // compatible con /^[a-zA-Z0-9_-]+$/
  const rnd = Math.random().toString(36).slice(2, 10);
  return `c_${Date.now().toString(36)}_${rnd}`;
};

async function getGlobalRole(userId) {
  if (!userId) return "member";
  const row = await Promise.resolve(
    db.prepare(`SELECT role FROM users WHERE id = ? LIMIT 1`).get(userId)
  );
  return (row?.role || "member").toLowerCase();
}

/**
 * GET /contacts
 * Lista contactos del tenant actual.
 *
 * Soporta:
 *  - ?workspaceId=xxx  → filtra contactos cuyo account pertenece a ese workspace
 *
 * ✅ IMPORTANTE:
 * - YA NO LIMITAMOS, porque estabas perdiendo contactos en el front.
 * - Más adelante hacemos paginación real con cursor (pro), pero por ahora: TODOS.
 */
router.get(
  "/contacts",
  canRead("contacts"),
  wrap(async (req, res) => {
    // const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200); // ❌ ya no
    const workspaceId =
      typeof req.query.workspaceId === "string"
        ? req.query.workspaceId.trim()
        : "";

    let rows;

    if (workspaceId) {
      rows = await db
        .prepare(
          `
          SELECT 
            c.*,
            u.name  AS created_by_name,
            u.email AS created_by_email
          FROM contacts c
          LEFT JOIN users u    ON c.created_by = u.id
          LEFT JOIN accounts a ON c.account_id = a.id
          WHERE 
            c.tenant_id = ?
            AND a.workspace_id = ?
          ORDER BY c.updated_at DESC, c.id ASC
        `
        )
        .all(req.tenantId, workspaceId);
    } else {
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
        `
        )
        .all(req.tenantId);
    }

    res.json(rows);
  })
);

/**
 * GET /contacts/:id
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

    if (!row) return res.status(404).json({ error: "not_found" });

    res.json(row);
  })
);

/**
 * GET /contacts-all
 * TODOS los contactos sin filtro de tenant
 * (esto sí lo limitamos porque puede ser gigante)
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

    console.log("[contacts-all] rows:", rows.length);

    res.json(rows);
  })
);

/**
 * POST /contacts/import
 * Import batch (desde CSV parseado en frontend)
 */
router.post(
  "/contacts/import",
  canWrite("contacts"),
  wrap(async (req, res) => {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!rows) return res.status(400).json({ error: "rows_required" });

    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "unauthorized" });

    // 🔒 Solo admin/owner
    const role = await getGlobalRole(userId);
    if (role !== "admin" && role !== "owner") {
      return res.status(403).json({ error: "forbidden" });
    }

    const now = Date.now();

    const results = {
      received: rows.length,
      created: 0,
      skipped: 0,
      errors: 0,
      items: [],
    };

    const incomingEmails = rows
      .map((r) => normalizeEmail(r?.email))
      .filter(Boolean);

    const existingEmailSet = new Set();

    if (incomingEmails.length > 0) {
      const uniq = Array.from(new Set(incomingEmails));
      const chunkSize = 200;

      for (let i = 0; i < uniq.length; i += chunkSize) {
        const chunk = uniq.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => "?").join(",");

        const found = await db
          .prepare(
            `
            SELECT email
            FROM contacts
            WHERE tenant_id = ?
              AND email IN (${placeholders})
          `
          )
          .all(req.tenantId, ...chunk);

        for (const f of found) {
          const em = normalizeEmail(f?.email);
          if (em) existingEmailSet.add(em);
        }
      }
    }

    const seenInBatch = new Set();

    const accountExists = (accountId) => {
      if (!accountId) return false;
      const row = db
        .prepare(
          `SELECT 1 AS one FROM accounts WHERE id = ? AND tenant_id = ? LIMIT 1`
        )
        .get(accountId, req.tenantId);
      return !!row;
    };

    for (let idx = 0; idx < rows.length; idx++) {
      try {
        const raw = rows[idx] || {};

        const name = coerceStr(raw.name);
        if (!name) {
          results.skipped++;
          results.items.push({ index: idx, ok: false, reason: "missing_name" });
          continue;
        }

        const email = normalizeEmail(raw.email);
        const phone = coerceStr(raw.phone);
        const company = coerceStr(raw.company);
        const position = coerceStr(raw.position);
        const client_type = safeClientType(raw.client_type);
        let account_id = coerceStr(raw.account_id);

        if (account_id && !accountExists(account_id)) account_id = null;

        if (email && existingEmailSet.has(email)) {
          results.skipped++;
          results.items.push({
            index: idx,
            ok: false,
            reason: "duplicate_email_db",
            email,
          });
          continue;
        }

        if (email) {
          if (seenInBatch.has(email)) {
            results.skipped++;
            results.items.push({
              index: idx,
              ok: false,
              reason: "duplicate_email_csv",
              email,
            });
            continue;
          }
          seenInBatch.add(email);
        }

        let id = coerceStr(raw.id);
        if (!id) id = makeContactId();

        if (!/^[a-zA-Z0-9_-]+$/.test(id)) id = makeContactId();

        const existsById = db
          .prepare(
            `SELECT 1 AS one FROM contacts WHERE id = ? AND tenant_id = ? LIMIT 1`
          )
          .get(id, req.tenantId);

        if (existsById) id = makeContactId();

        db.prepare(
          `
          INSERT INTO contacts
            (id, name, email, phone, company, position, account_id, client_type, tenant_id, created_by, created_at, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        `
        ).run(
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

        if (email) existingEmailSet.add(email);

        results.created++;
        results.items.push({ index: idx, ok: true, id, name, email });
      } catch (e) {
        results.errors++;
        results.items.push({
          index: idx,
          ok: false,
          reason: "insert_failed",
          message: String(e?.message || e),
        });
      }
    }

    return res.status(200).json({ ok: true, ...results });
  })
);

/**
 * POST /contacts
 * Crear contacto
 */
router.post(
  "/contacts",
  canWrite("contacts"),
  wrap(async (req, res) => {
    let { id, name, email, phone, company, position, account_id, client_type } =
      req.body || {};

    id = typeof id === "string" ? id.trim() : "";
    name = typeof name === "string" ? name.trim() : "";
    email = typeof email === "string" ? email.trim() : null;
    phone = typeof phone === "string" ? phone.trim() : null;
    company = typeof company === "string" ? company.trim() : null;
    position = typeof position === "string" ? position.trim() : null;
    account_id = typeof account_id === "string" ? account_id.trim() : null;
    client_type = typeof client_type === "string" ? client_type.trim() : null;

    const allowed = ["productora", "agencia", "directo", null];
    if (!allowed.includes(client_type)) client_type = null;

    if (!id || !name)
      return res.status(400).json({ error: "id_and_name_required" });

    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return res.status(400).json({ error: "invalid_contact_id" });
    }

    const existing = await db
      .prepare(
        `SELECT 1 AS one FROM contacts WHERE id = ? AND tenant_id = ? LIMIT 1`
      )
      .get(id, req.tenantId);

    if (existing) return res.status(409).json({ error: "contact_exists" });

    if (account_id) {
      const acc = await db
        .prepare(`SELECT 1 FROM accounts WHERE id = ? AND tenant_id = ? LIMIT 1`)
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
      client_type = found.client_type,
    } = req.body || {};

    name = typeof name === "string" ? name.trim() : found.name;
    email = typeof email === "string" ? email.trim() : found.email;
    phone = typeof phone === "string" ? phone.trim() : found.phone;
    company = typeof company === "string" ? company.trim() : found.company;
    position = typeof position === "string" ? position.trim() : found.position;
    account_id =
      typeof account_id === "string" ? account_id.trim() : found.account_id;
    client_type =
      typeof client_type === "string" ? client_type.trim() : found.client_type;

    const allowed = ["productora", "agencia", "directo", null];
    if (!allowed.includes(client_type)) client_type = found.client_type;

    if (account_id) {
      const acc = await db
        .prepare(`SELECT 1 FROM accounts WHERE id = ? AND tenant_id = ? LIMIT 1`)
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
 */
router.get(
  "/contacts/export-all-csv",
  wrap(async (req, res) => {
    const { resolveUserId } = require("../lib/authorize");
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "unauthorized" });

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
      if (Number.isFinite(n) && n > 0) sinceMs = n;
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
      if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
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
    )}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  })
);

module.exports = router;


