// server/routes/notes.js
const { Router } = require("express");
const db = require("../db/connection");
const wrap = require("../lib/wrap");
const {
  resolveUserId,
  canDelete,
} = require("../lib/authorize"); // 👈 sacamos getOwnershipFilter
const crypto = require("crypto");

const router = Router();

const coerceStr = (v) => (typeof v === "string" ? v.trim() : null);

/** GET /notes?deal_id=&contact_id=&account_id=&lead_id=&limit= */
router.get(
  "/notes",
  wrap(async (req, res) => {
    const { deal_id, contact_id, account_id, lead_id } = req.query || {};
    const limit = Math.min(parseInt(req.query?.limit, 10) || 100, 200);

    // 👉 AHORA: solo filtramos por tenant + la entidad relacionada.
    // Nada de ownership → cualquier usuario del mismo tenant/workspace
    // ve todas las notas de ese deal/contact/account/lead.

    const clauses = ["n.tenant_id = ?"];
    const params = [req.tenantId];

    if (deal_id) {
      clauses.push("n.deal_id = ?");
      params.push(String(deal_id));
    }
    if (contact_id) {
      clauses.push("n.contact_id = ?");
      params.push(String(contact_id));
    }
    if (account_id) {
      clauses.push("n.account_id = ?");
      params.push(String(account_id));
    }
    if (lead_id) {
      clauses.push("n.lead_id = ?");
      params.push(String(lead_id));
    }

    const sql = `
      SELECT n.*, u.name AS created_by_name, u.email AS created_by_email
      FROM notes n
      LEFT JOIN users u
        ON u.id = n.created_by
      WHERE ${clauses.join(" AND ")}
      ORDER BY n.updated_at DESC, n.id ASC
      LIMIT ?
    `;
    const rows = await db.prepare(sql).all(...params, limit);
    res.json(rows);
  })
);

/** POST /notes — id generado en el servidor */
router.post(
  "/notes",
  wrap(async (req, res) => {
    let { body, account_id, contact_id, lead_id, deal_id } = req.body || {};

    body = coerceStr(body) || "";
    account_id = coerceStr(account_id);
    contact_id = coerceStr(contact_id);
    lead_id = coerceStr(lead_id);
    deal_id = coerceStr(deal_id);

    if (!body) return res.status(400).json({ error: "body_required" });

    const id = crypto.randomUUID();

    // Validar FKs (dentro del mismo tenant)
    const checkFk = (table, value, field) => {
      if (!value) return;
      const exists = db
        .prepare(`SELECT 1 FROM ${table} WHERE id = ? AND tenant_id = ? LIMIT 1`)
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
      INSERT INTO notes (
        id, body, account_id, contact_id, lead_id, deal_id,
        tenant_id, created_by, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?)
    `
      )
      .run(
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
      .prepare(`
        SELECT n.*, u.name AS created_by_name, u.email AS created_by_email
        FROM notes n
        LEFT JOIN users u
          ON u.id = n.created_by
        WHERE n.id = ? AND n.tenant_id = ?
      `)
      .get(id, req.tenantId);

    res.status(201).json(created);
  })
);

/** DELETE /notes/:id */
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


// // server/routes/notes.js
// const { Router } = require("express");
// const db = require("../db/connection");
// const wrap = require("../lib/wrap");
// const {
//   resolveUserId,
//   canDelete,
//   getOwnershipFilter,
// } = require("../lib/authorize");
// const crypto = require("crypto");

// const router = Router();

// const coerceStr = (v) => (typeof v === "string" ? v.trim() : null);

// /** GET /notes?deal_id=&contact_id=&account_id=&lead_id=&limit= */
// router.get(
//   "/notes",
//   wrap(async (req, res) => {
//     const { deal_id, contact_id, account_id, lead_id } = req.query || {};
//     const limit = Math.min(parseInt(req.query?.limit, 10) || 100, 200);

//     // Ownership → normalizar a alias n.
//     let ownership = await getOwnershipFilter(req);
//     if (ownership && ownership.trim()) {
//       ownership = ownership.replace(/^AND\s+/i, "");
//       ownership = ownership.replaceAll(/\btenant_id\b/g, "n.tenant_id");
//       ownership = ownership.replaceAll(/\bcreated_by\b/g, "n.created_by");
//     }

//     const clauses = ["n.tenant_id = ?"];
//     const params = [req.tenantId];

//     if (deal_id)    { clauses.push("n.deal_id = ?");    params.push(String(deal_id)); }
//     if (contact_id) { clauses.push("n.contact_id = ?"); params.push(String(contact_id)); }
//     if (account_id) { clauses.push("n.account_id = ?"); params.push(String(account_id)); }
//     if (lead_id)    { clauses.push("n.lead_id = ?");    params.push(String(lead_id)); }
//     if (ownership)  { clauses.push(ownership); }

//     const sql = `
//       SELECT n.*, u.name AS created_by_name, u.email AS created_by_email
//       FROM notes n
//       LEFT JOIN users u
//         ON u.id = n.created_by
//       WHERE ${clauses.join(" AND ")}
//       ORDER BY n.updated_at DESC, n.id ASC
//       LIMIT ?
//     `;
//     const rows = await db.prepare(sql).all(...params, limit);
//     res.json(rows);
//   })
// );

// /** POST /notes — id generado en el servidor */
// router.post(
//   "/notes",
//   wrap(async (req, res) => {
//     let { body, account_id, contact_id, lead_id, deal_id } = req.body || {};

//     body = coerceStr(body) || "";
//     account_id = coerceStr(account_id);
//     contact_id = coerceStr(contact_id);
//     lead_id = coerceStr(lead_id);
//     deal_id = coerceStr(deal_id);

//     if (!body) return res.status(400).json({ error: "body_required" });

//     const id = crypto.randomUUID();

//     // Validar FKs (dentro del mismo tenant)
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
//       INSERT INTO notes (
//         id, body, account_id, contact_id, lead_id, deal_id,
//         tenant_id, created_by, created_at, updated_at
//       ) VALUES (?,?,?,?,?,?,?,?,?,?)
//     `
//       )
//       .run(
//         id,
//         body,
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
//         SELECT n.*, u.name AS created_by_name, u.email AS created_by_email
//         FROM notes n
//         LEFT JOIN users u
//           ON u.id = n.created_by
//         WHERE n.id = ? AND n.tenant_id = ?
//       `)
//       .get(id, req.tenantId);

//     res.status(201).json(created);
//   })
// );

// /** DELETE /notes/:id */
// router.delete(
//   "/notes/:id",
//   canDelete("notes"),
//   wrap(async (req, res) => {
//     const info = db
//       .prepare(`DELETE FROM notes WHERE id = ? AND tenant_id = ?`)
//       .run(req.params.id, req.tenantId);
//     if (info.changes === 0) return res.status(404).json({ error: "not_found" });
//     res.json({ ok: true });
//   })
// );

// module.exports = router;
