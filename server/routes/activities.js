// server/routes/activities.js
const { Router } = require("express");
const db = require("../db/connection");
const wrap = require("../lib/wrap");
const {
  resolveUserId,
  canRead,
  canWrite,
  canDelete,
} = require("../lib/authorize");
const crypto = require("crypto");

const router = Router();

const coerceStr = (v) => (typeof v === "string" ? v.trim() : null);
const coerceNum = (v) =>
  v === null || v === undefined || v === "" ? null : Number(v);
const VALID_STATUS = new Set(["open", "done", "canceled"]);

/** GET /activities (filtros opcionales) */
router.get(
  "/activities",
  wrap(async (req, res) => {
    const { deal_id, contact_id, account_id, lead_id, status, remind_after } =
      req.query || {};
    const limit = Math.min(parseInt(req.query?.limit, 10) || 100, 200);

    const clauses = ["a.tenant_id = ?"];
    const params = [req.tenantId];

    if (deal_id) {
      clauses.push("a.deal_id = ?");
      params.push(String(deal_id));
    }
    if (contact_id) {
      clauses.push("a.contact_id = ?");
      params.push(String(contact_id));
    }
    if (account_id) {
      clauses.push("a.account_id = ?");
      params.push(String(account_id));
    }
    if (lead_id) {
      clauses.push("a.lead_id = ?");
      params.push(String(lead_id));
    }
    if (status) {
      clauses.push("a.status = ?");
      params.push(String(status));
    }
    if (remind_after) {
      clauses.push("a.remind_at_ms > ?");
      params.push(Number(remind_after));
    }

    const sql = `
      SELECT 
        a.*,
        cu.name AS created_by_name,
        cu.email AS created_by_email,
        au.name AS assigned_to_name,
        au.email AS assigned_to_email
      FROM activities a
      LEFT JOIN users cu ON cu.id = a.created_by
      LEFT JOIN users au ON au.id = a.assigned_to
      WHERE ${clauses.join(" AND ")}
      ORDER BY a.updated_at DESC, a.id ASC
      LIMIT ?
    `;
    const rows = await db.prepare(sql).all(...params, limit);
     console.log(
      "📤 GET /activities ->",
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        assigned_to: r.assigned_to,
        assigned_to_name: r.assigned_to_name,
      }))
    );
    res.json(rows);
  })
);


/** GET /activities/:id */
router.get(
  "/activities/:id",
  canRead("activities"),
  wrap(async (req, res) => {
    const row = db
      .prepare(
        `
        SELECT 
          a.*,
          cu.name AS created_by_name,
          cu.email AS created_by_email,
          au.name AS assigned_to_name,
          au.email AS assigned_to_email
        FROM activities a
        LEFT JOIN users cu ON cu.id = a.created_by
        LEFT JOIN users au ON au.id = a.assigned_to
        WHERE a.id = ? AND a.tenant_id = ?
      `
      )
      .get(req.params.id, req.tenantId);

    if (!row) return res.status(404).json({ error: "not_found" });
    res.json(row);
  })
);


/** POST /activities (id en servidor) */
router.post(
  "/activities",
  wrap(async (req, res) => {
    console.log("▶ POST /activities body:", req.body, "tenant:", req.tenantId);
    let {
      type,
      title,
      due_date,
      remind_at_ms,
      status,
      notes,
      account_id,
      contact_id,
      lead_id,
      deal_id,
      assigned_to, // 👈 NUEVO: viene del front
    } = req.body || {};

    type = coerceStr(type) || "";
    title = coerceStr(title) || "";
    status = coerceStr(status) || "open";
    notes = coerceStr(notes);
    account_id = coerceStr(account_id);
    contact_id = coerceStr(contact_id);
    lead_id = coerceStr(lead_id);
    deal_id = coerceStr(deal_id);
    assigned_to = coerceStr(assigned_to); // 👈 normalizamos
    due_date = coerceNum(due_date);
    remind_at_ms = coerceNum(remind_at_ms);

    if (!type || !title) {
      return res.status(400).json({ error: "type_title_required" });
    }
    if (!VALID_STATUS.has(status)) status = "open";

    const id = crypto.randomUUID();

    const checkFk = (table, value, field) => {
      if (!value) return;
      const exists = db
        .prepare(
          `SELECT 1 FROM ${table} WHERE id = ? AND tenant_id = ? LIMIT 1`
        )
        .get(value, req.tenantId);
      if (!exists) throw new Error(`invalid_${field}`);
    };

    try {
      checkFk("accounts", account_id, "account_id");
      checkFk("contacts", contact_id, "contact_id");
      checkFk("leads", lead_id, "lead_id");
      checkFk("deals", deal_id, "deal_id");
      // si quisieras, aquí se podría validar assigned_to contra users/memberships
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const userId = resolveUserId(req);
    const now = Date.now();

    await db
      .prepare(
        `
      INSERT INTO activities (
        id, type, title, due_date, remind_at_ms, status, notes,
        account_id, contact_id, lead_id, deal_id,
        tenant_id, created_by, created_at, updated_at, assigned_to
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `
      )
      .run(
        id,
        type,
        title,
        due_date ?? null,
        remind_at_ms ?? null,
        status,
        notes ?? null,
        account_id ?? null,
        contact_id ?? null,
        lead_id ?? null,
        deal_id ?? null,
        req.tenantId,
        userId,
        now,
        now,
        assigned_to ?? null // 👈 se guarda el asignado
      );

    const created = db
      .prepare(
        `
        SELECT 
          a.*,
          cu.name AS created_by_name,
          cu.email AS created_by_email,
          au.name AS assigned_to_name,
          au.email AS assigned_to_email
        FROM activities a
        LEFT JOIN users cu ON cu.id = a.created_by
        LEFT JOIN users au ON au.id = a.assigned_to
        WHERE a.id = ? AND a.tenant_id = ?
      `
      )
      .get(id, req.tenantId);
       console.log("✅ Nueva activity creada:", {
      id: created.id,
      title: created.title,
      assigned_to: created.assigned_to,
      assigned_to_name: created.assigned_to_name,
      tenant: created.tenant_id,
    });

    res.status(201).json(created);
  })
);


/** PATCH /activities/:id */
router.patch(
  "/activities/:id",
  canWrite("activities"),
  wrap(async (req, res) => {
    const found = db
      .prepare(`SELECT * FROM activities WHERE id = ? AND tenant_id = ?`)
      .get(req.params.id, req.tenantId);

    if (!found) return res.status(404).json({ error: "not_found" });

    const body = req.body || {};
    const hasProp = (name) =>
      Object.prototype.hasOwnProperty.call(body, name);

    // Partimos SIEMPRE del registro actual en DB
    const final = {
      type: found.type || "task",
      title: found.title || "Sin título",
      status: VALID_STATUS.has(found.status) ? found.status : "open",
      notes: found.notes ?? null,
      account_id: found.account_id ?? null,
      contact_id: found.contact_id ?? null,
      lead_id: found.lead_id ?? null,
      deal_id: found.deal_id ?? null,
      assigned_to: found.assigned_to ?? null,
      due_date: found.due_date ?? null,
      remind_at_ms: found.remind_at_ms ?? null,
    };

    // TYPE
    if (hasProp("type")) {
      const t = coerceStr(body.type);
      if (t) final.type = t;
    }

    // TITLE  👉 si mandas algo vacío, mantenemos el que ya tenía
    if (hasProp("title")) {
      const t = coerceStr(body.title);
      if (t && t.length > 0) {
        final.title = t;
      }
      // si viene vacío o null, NO tocamos final.title
    }

    // STATUS 👉 solo si es válido; si no, dejamos el actual
    if (hasProp("status")) {
      const s = coerceStr(body.status);
      if (s && VALID_STATUS.has(s)) {
        final.status = s;
      }
    }

    // NOTES
    if (hasProp("notes")) {
      final.notes = coerceStr(body.notes);
    }

    // account/contact/lead/deal → solo se tocan si vienen en el body
    if (hasProp("account_id")) {
      final.account_id = coerceStr(body.account_id);
    }
    if (hasProp("contact_id")) {
      final.contact_id = coerceStr(body.contact_id);
    }
    if (hasProp("lead_id")) {
      final.lead_id = coerceStr(body.lead_id);
    }
    if (hasProp("deal_id")) {
      final.deal_id = coerceStr(body.deal_id);
    }

    // ASSIGNED_TO
    if (hasProp("assigned_to")) {
      final.assigned_to = coerceStr(body.assigned_to);
    }

    // fechas numéricas
    if (hasProp("due_date")) {
      final.due_date = coerceNum(body.due_date);
    }
    if (hasProp("remind_at_ms")) {
      final.remind_at_ms = coerceNum(body.remind_at_ms);
    }

    // Validaciones FK
    const checkFk = (table, value, field) => {
      if (!value) return;
      const exists = db
        .prepare(
          `SELECT 1 FROM ${table} WHERE id = ? AND tenant_id = ? LIMIT 1`
        )
        .get(value, req.tenantId);
      if (!exists) throw new Error(`invalid_${field}`);
    };

    try {
      checkFk("accounts", final.account_id, "account_id");
      checkFk("contacts", final.contact_id, "contact_id");
      checkFk("leads", final.lead_id, "lead_id");
      checkFk("deals", final.deal_id, "deal_id");
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const updated_at = Date.now();

    await db
      .prepare(
        `
      UPDATE activities SET
        type = ?, title = ?, due_date = ?, remind_at_ms = ?, status = ?, notes = ?,
        account_id = ?, contact_id = ?, lead_id = ?, deal_id = ?, assigned_to = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `
      )
      .run(
        final.type,
        final.title,
        final.due_date ?? null,
        final.remind_at_ms ?? null,
        final.status,
        final.notes ?? null,
        final.account_id ?? null,
        final.contact_id ?? null,
        final.lead_id ?? null,
        final.deal_id ?? null,
        final.assigned_to ?? null,
        updated_at,
        req.params.id,
        req.tenantId
      );

    const updated = db
      .prepare(
        `
        SELECT 
          a.*,
          cu.name AS created_by_name,
          cu.email AS created_by_email,
          au.name AS assigned_to_name,
          au.email AS assigned_to_email
        FROM activities a
        LEFT JOIN users cu ON cu.id = a.created_by
        LEFT JOIN users au ON au.id = a.assigned_to
        WHERE a.id = ? AND a.tenant_id = ?
      `
      )
      .get(req.params.id, req.tenantId);

    res.json(updated);
  })
);




/** DELETE /activities/:id */
router.delete(
  "/activities/:id",
  canDelete("activities"),
  wrap(async (req, res) => {
    const info = db
      .prepare(`DELETE FROM activities WHERE id = ? AND tenant_id = ?`)
      .run(req.params.id, req.tenantId);
    if (info.changes === 0)
      return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  })
);

module.exports = router;

