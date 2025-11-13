// server/routes/notes.js
const { Router } = require("express");
const db = require("../db/connection");
const wrap = require("../lib/wrap");
const { requireTenantRole } = require("../lib/tenant");
const {
  resolveUserId,
  canRead,
  canWrite,
  canDelete,
  getOwnershipFilter,
} = require("../lib/authorize");

const router = Router();

const coerceStr = (v) => (typeof v === "string" ? v.trim() : null);

/** GET /notes?deal_id=&contact_id=&account_id=&lead_id=&limit= */
router.get(
  "/notes",
  wrap(async (req, res) => {
    const { deal_id, contact_id, account_id, lead_id } = req.query || {};
    const limit = Math.min(parseInt(req.query?.limit, 10) || 100, 200);

    const ownership = await getOwnershipFilter(req);
    const clauses = ["tenant_id = ?"];
    const params = [req.tenantId];

    if (ownership && ownership !== "") {
      clauses.push(ownership.replace("AND ", ""));
    }

    if (deal_id) {
      clauses.push("deal_id = ?");
      params.push(String(deal_id));
    }
    if (contact_id) {
      clauses.push("contact_id = ?");
      params.push(String(contact_id));
    }
    if (account_id) {
      clauses.push("account_id = ?");
      params.push(String(account_id));
    }
    if (lead_id) {
      clauses.push("lead_id = ?");
      params.push(String(lead_id));
    }

    const sql = `
      SELECT *
      FROM notes
      WHERE ${clauses.join(" AND ")}
      ORDER BY updated_at DESC, id ASC
      LIMIT ?
    `;
    const rows = await db.prepare(sql).all(...params, limit);
    res.json(rows);
  })
);

/** POST /notes  (owner/admin) */
router.post(
  "/notes",
  wrap(async (req, res) => {
    let { id, body, account_id, contact_id, lead_id, deal_id } = req.body || {};

    id = coerceStr(id) || "";
    body = coerceStr(body) || "";
    account_id = coerceStr(account_id);
    contact_id = coerceStr(contact_id);
    lead_id = coerceStr(lead_id);
    deal_id = coerceStr(deal_id);

    if (!id || !body) return res.status(400).json({ error: "id_and_body_required" });
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return res.status(400).json({ error: "invalid_note_id" });
    }

    // id único por tenant
    const exists = db
      .prepare(`SELECT 1 FROM notes WHERE id = ? AND tenant_id = ? LIMIT 1`)
      .get(id, req.tenantId);
    if (exists) return res.status(409).json({ error: "note_exists" });

    // Validar FKs si vienen (dentro del mismo tenant)
    if (account_id) {
      const acc = db
        .prepare(`SELECT 1 FROM accounts WHERE id = ? AND tenant_id = ? LIMIT 1`)
        .get(account_id, req.tenantId);
      if (!acc) return res.status(400).json({ error: "invalid_account_id" });
    }
    if (contact_id) {
      const c = db
        .prepare(`SELECT 1 FROM contacts WHERE id = ? AND tenant_id = ? LIMIT 1`)
        .get(contact_id, req.tenantId);
      if (!c) return res.status(400).json({ error: "invalid_contact_id" });
    }
    if (lead_id) {
      const l = db
        .prepare(`SELECT 1 FROM leads WHERE id = ? AND tenant_id = ? LIMIT 1`)
        .get(lead_id, req.tenantId);
      if (!l) return res.status(400).json({ error: "invalid_lead_id" });
    }
    if (deal_id) {
      const d = db
        .prepare(`SELECT 1 FROM deals WHERE id = ? AND tenant_id = ? LIMIT 1`)
        .get(deal_id, req.tenantId);
      if (!d) return res.status(400).json({ error: "invalid_deal_id" });
    }

    const userId = resolveUserId(req);
    const now = Date.now();
    await db.prepare(
      `
      INSERT INTO notes (
        id, body, account_id, contact_id, lead_id, deal_id,
        tenant_id, created_by, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?)
    `
    ).run(
      id,
      body,
      account_id ?? null,
      contact_id ?? null,
      lead_id ?? null,
      deal_id ?? null,
      req.tenantId,
      userId,
      now,
      now
    );

    const created = db
      .prepare(`SELECT * FROM notes WHERE id = ? AND tenant_id = ?`)
      .get(id, req.tenantId);

    res.status(201).json(created);
  })
);

/** DELETE /notes/:id  (owner/admin) */
router.delete(
  "/notes/:id",
  canDelete("notes"),
  wrap(async (req, res) => {
    const info = db
      .prepare(`DELETE FROM notes WHERE id = ? AND tenant_id = ?`)
      .run(req.params.id, req.tenantId);
    if (info.changes === 0) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  })
);

module.exports = router;

