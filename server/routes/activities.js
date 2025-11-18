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

    // Importante: aquí solo filtramos por tenant (y por los filtros de la entidad),
    // ya NO usamos getOwnershipFilter. Eso significa que:
    // - Todos los usuarios del mismo tenant/workspace ven las mismas actividades.
    // - El "quién la creó" se muestra con created_by_name / created_by_email.

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
      SELECT a.*, u.name AS created_by_name, u.email AS created_by_email
      FROM activities a
      LEFT JOIN users u
        ON u.id = a.created_by
      WHERE ${clauses.join(" AND ")}
      ORDER BY a.updated_at DESC, a.id ASC
      LIMIT ?
    `;
    const rows = await db.prepare(sql).all(...params, limit);
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
        SELECT a.*, u.name AS created_by_name, u.email AS created_by_email
        FROM activities a
        LEFT JOIN users u
          ON u.id = a.created_by
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
    } = req.body || {};

    type = coerceStr(type) || "";
    title = coerceStr(title) || "";
    status = coerceStr(status) || "open";
    notes = coerceStr(notes);
    account_id = coerceStr(account_id);
    contact_id = coerceStr(contact_id);
    lead_id = coerceStr(lead_id);
    deal_id = coerceStr(deal_id);
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
        tenant_id, created_by, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
        now
      );

    const created = db
      .prepare(
        `
        SELECT a.*, u.name AS created_by_name, u.email AS created_by_email
        FROM activities a
        LEFT JOIN users u
          ON u.id = a.created_by
        WHERE a.id = ? AND a.tenant_id = ?
      `
      )
      .get(id, req.tenantId);

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

    let {
      type = found.type,
      title = found.title,
      due_date = found.due_date,
      remind_at_ms = found.remind_at_ms,
      status = found.status,
      notes = found.notes,
      account_id = found.account_id,
      contact_id = found.contact_id,
      lead_id = found.lead_id,
      deal_id = found.deal_id,
    } = req.body || {};

    type = coerceStr(type) || found.type || "task";
    title = coerceStr(title) || found.title || "Sin título";
    status = coerceStr(status) || found.status;
    notes = coerceStr(notes) ?? found.notes;
    account_id = coerceStr(account_id) ?? found.account_id;
    contact_id = coerceStr(contact_id) ?? found.contact_id;
    lead_id = coerceStr(lead_id) ?? found.lead_id;
    deal_id = coerceStr(deal_id) ?? found.deal_id;
    due_date = due_date === undefined ? found.due_date : coerceNum(due_date);
    remind_at_ms =
      remind_at_ms === undefined
        ? found.remind_at_ms
        : coerceNum(remind_at_ms);

    if (!VALID_STATUS.has(status)) status = found.status;

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
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const updated_at = Date.now();

    await db
      .prepare(
        `
      UPDATE activities SET
        type = ?, title = ?, due_date = ?, remind_at_ms = ?, status = ?, notes = ?,
        account_id = ?, contact_id = ?, lead_id = ?, deal_id = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `
      )
      .run(
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
        updated_at,
        req.params.id,
        req.tenantId
      );

    const updated = db
      .prepare(
        `
        SELECT a.*, u.name AS created_by_name, u.email AS created_by_email
        FROM activities a
        LEFT JOIN users u
          ON u.id = a.created_by
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


// // server/routes/activities.js
// const { Router } = require("express");
// const db = require("../db/connection");
// const wrap = require("../lib/wrap");
// const {
//   resolveUserId,
//   canRead,
//   canWrite,
//   canDelete,
//   getOwnershipFilter,
// } = require("../lib/authorize");
// const crypto = require("crypto");

// const router = Router();

// const coerceStr = (v) => (typeof v === "string" ? v.trim() : null);
// const coerceNum = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
// const VALID_STATUS = new Set(["open", "done", "canceled"]);

// /** GET /activities (filtros opcionales) */
// router.get(
//   "/activities",
//   wrap(async (req, res) => {
//     const { deal_id, contact_id, account_id, lead_id, status, remind_after } = req.query || {};
//     const limit = Math.min(parseInt(req.query?.limit, 10) || 100, 200);

//     // Traemos la cláusula de ownership y la saneamos para usar alias "a."
//     let ownership = await getOwnershipFilter(req);
//     if (ownership && ownership.trim()) {
//       // normalizamos: quitamos "AND " inicial y forzamos alias a "a."
//       ownership = ownership.replace(/^AND\s+/i, "");
//       ownership = ownership.replaceAll(/\btenant_id\b/g, "a.tenant_id");
//       ownership = ownership.replaceAll(/\bcreated_by\b/g, "a.created_by");
//     }

//     const clauses = ["a.tenant_id = ?"];
//     const params = [req.tenantId];

//     if (ownership) clauses.push(ownership);
//     if (deal_id)       { clauses.push("a.deal_id = ?");       params.push(String(deal_id)); }
//     if (contact_id)    { clauses.push("a.contact_id = ?");    params.push(String(contact_id)); }
//     if (account_id)    { clauses.push("a.account_id = ?");    params.push(String(account_id)); }
//     if (lead_id)       { clauses.push("a.lead_id = ?");       params.push(String(lead_id)); }
//     if (status)        { clauses.push("a.status = ?");        params.push(String(status)); }
//     if (remind_after)  { clauses.push("a.remind_at_ms > ?");  params.push(Number(remind_after)); }

//     const sql = `
//       SELECT a.*, u.name AS created_by_name, u.email AS created_by_email
//       FROM activities a
//       LEFT JOIN users u
//         ON u.id = a.created_by   -- 👈 quitado u.tenant_id
//       WHERE ${clauses.join(" AND ")}
//       ORDER BY a.updated_at DESC, a.id ASC
//       LIMIT ?
//     `;
//     const rows = await db.prepare(sql).all(...params, limit);
//     res.json(rows);
//   })
// );

// /** GET /activities/:id */
// router.get(
//   "/activities/:id",
//   canRead("activities"),
//   wrap(async (req, res) => {
//     const row = db
//       .prepare(`
//         SELECT a.*, u.name AS created_by_name, u.email AS created_by_email
//         FROM activities a
//         LEFT JOIN users u
//           ON u.id = a.created_by   -- 👈 quitado u.tenant_id
//         WHERE a.id = ? AND a.tenant_id = ?
//       `)
//       .get(req.params.id, req.tenantId);

//     if (!row) return res.status(404).json({ error: "not_found" });
//     res.json(row);
//   })
// );

// /** POST /activities (id en servidor) */
// router.post(
//   "/activities",
//   wrap(async (req, res) => {
//     let {
//       type,
//       title,
//       due_date,
//       remind_at_ms,
//       status,
//       notes,
//       account_id,
//       contact_id,
//       lead_id,
//       deal_id,
//     } = req.body || {};

//     type = coerceStr(type) || "";
//     title = coerceStr(title) || "";
//     status = coerceStr(status) || "open";
//     notes = coerceStr(notes);
//     account_id = coerceStr(account_id);
//     contact_id = coerceStr(contact_id);
//     lead_id = coerceStr(lead_id);
//     deal_id = coerceStr(deal_id);
//     due_date = coerceNum(due_date);
//     remind_at_ms = coerceNum(remind_at_ms);

//     if (!type || !title) {
//       return res.status(400).json({ error: "type_title_required" });
//     }
//     if (!VALID_STATUS.has(status)) status = "open";

//     const id = crypto.randomUUID();

//     const checkFk = (table, value, field) => {
//       if (!value) return;
//       const exists = db
//         .prepare(`SELECT 1 FROM ${table} WHERE id = ? AND tenant_id = ? LIMIT 1`)
//         .get(value, req.tenantId);
//       if (!exists) throw new Error(`invalid_${field}`);
//     };

//     try {
//       checkFk("accounts", account_id, "account_id");
//       checkFk("contacts", contact_id, "contact_id");
//       checkFk("leads", lead_id, "lead_id");
//       checkFk("deals", deal_id, "deal_id");
//     } catch (e) {
//       return res.status(400).json({ error: e.message });
//     }

//     const userId = resolveUserId(req);
//     const now = Date.now();

//     await db
//       .prepare(
//         `
//       INSERT INTO activities (
//         id, type, title, due_date, remind_at_ms, status, notes,
//         account_id, contact_id, lead_id, deal_id,
//         tenant_id, created_by, created_at, updated_at
//       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
//     `
//       )
//       .run(
//         id,
//         type,
//         title,
//         due_date ?? null,
//         remind_at_ms ?? null,
//         status,
//         notes ?? null,
//         account_id ?? null,
//         contact_id ?? null,
//         lead_id ?? null,
//         deal_id ?? null,
//         req.tenantId,
//         userId,
//         now,
//         now
//       );

//     const created = db
//       .prepare(`
//         SELECT a.*, u.name AS created_by_name, u.email AS created_by_email
//         FROM activities a
//         LEFT JOIN users u
//           ON u.id = a.created_by   -- 👈 quitado u.tenant_id
//         WHERE a.id = ? AND a.tenant_id = ?
//       `)
//       .get(id, req.tenantId);

//     res.status(201).json(created);
//   })
// );

// /** PATCH /activities/:id */
// router.patch(
//   "/activities/:id",
//   canWrite("activities"),
//   wrap(async (req, res) => {
//     const found = db
//       .prepare(`SELECT * FROM activities WHERE id = ? AND tenant_id = ?`)
//       .get(req.params.id, req.tenantId);
//     if (!found) return res.status(404).json({ error: "not_found" });

//     let {
//       type = found.type,
//       title = found.title,
//       due_date = found.due_date,
//       remind_at_ms = found.remind_at_ms,
//       status = found.status,
//       notes = found.notes,
//       account_id = found.account_id,
//       contact_id = found.contact_id,
//       lead_id = found.lead_id,
//       deal_id = found.deal_id,
//     } = req.body || {};

//     type = coerceStr(type) || found.type || "task";
//     title = coerceStr(title) || found.title || "Sin título";
//     status = coerceStr(status) || found.status;
//     notes = coerceStr(notes) ?? found.notes;
//     account_id = coerceStr(account_id) ?? found.account_id;
//     contact_id = coerceStr(contact_id) ?? found.contact_id;
//     lead_id = coerceStr(lead_id) ?? found.lead_id;
//     deal_id = coerceStr(deal_id) ?? found.deal_id;
//     due_date = due_date === undefined ? found.due_date : coerceNum(due_date);
//     remind_at_ms = remind_at_ms === undefined ? found.remind_at_ms : coerceNum(remind_at_ms);

//     if (!VALID_STATUS.has(status)) status = found.status;

//     const checkFk = (table, value, field) => {
//       if (!value) return;
//       const exists = db
//         .prepare(`SELECT 1 FROM ${table} WHERE id = ? AND tenant_id = ? LIMIT 1`)
//         .get(value, req.tenantId);
//       if (!exists) throw new Error(`invalid_${field}`);
//     };

//     try {
//       checkFk("accounts", account_id, "account_id");
//       checkFk("contacts", contact_id, "contact_id");
//       checkFk("leads", lead_id, "lead_id");
//       checkFk("deals", deal_id, "deal_id");
//     } catch (e) {
//       return res.status(400).json({ error: e.message });
//     }

//     const updated_at = Date.now();

//     await db
//       .prepare(
//         `
//       UPDATE activities SET
//         type = ?, title = ?, due_date = ?, remind_at_ms = ?, status = ?, notes = ?,
//         account_id = ?, contact_id = ?, lead_id = ?, deal_id = ?, updated_at = ?
//       WHERE id = ? AND tenant_id = ?
//     `
//       )
//       .run(
//         type,
//         title,
//         due_date ?? null,
//         remind_at_ms ?? null,
//         status,
//         notes ?? null,
//         account_id ?? null,
//         contact_id ?? null,
//         lead_id ?? null,
//         deal_id ?? null,
//         updated_at,
//         req.params.id,
//         req.tenantId
//       );

//     const updated = db
//       .prepare(`
//         SELECT a.*, u.name AS created_by_name, u.email AS created_by_email
//         FROM activities a
//         LEFT JOIN users u
//           ON u.id = a.created_by   -- 👈 quitado u.tenant_id
//         WHERE a.id = ? AND a.tenant_id = ?
//       `)
//       .get(req.params.id, req.tenantId);

//     res.json(updated);
//   })
// );

// /** DELETE /activities/:id */
// router.delete(
//   "/activities/:id",
//   canDelete("activities"),
//   wrap(async (req, res) => {
//     const info = db
//       .prepare(`DELETE FROM activities WHERE id = ? AND tenant_id = ?`)
//       .run(req.params.id, req.tenantId);
//     if (info.changes === 0) return res.status(404).json({ error: "not_found" });
//     res.json({ ok: true });
//   })
// );

// module.exports = router;

