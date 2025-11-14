// server/routes/activities.js
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

/** Utils */
const coerceStr = (v) => (typeof v === "string" ? v.trim() : null);
const coerceNum = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const VALID_STATUS = new Set(["open", "done", "canceled"]);

/** Lista con filtros opcionales ?deal_id=&contact_id=&account_id=&lead_id=&status=&limit=&remind_after= */
router.get(
  "/activities",
  wrap(async (req, res) => {
    const { deal_id, contact_id, account_id, lead_id, status, remind_after } = req.query || {};
    const limit = Math.min(parseInt(req.query?.limit, 10) || 100, 200);

    const ownership = await getOwnershipFilter(req);
    let sql = `SELECT * FROM activities WHERE tenant_id = ? ${ownership}`;
    const params = [req.tenantId];

    if (deal_id)      { sql += " AND deal_id = ?";      params.push(String(deal_id)); }
    if (contact_id)   { sql += " AND contact_id = ?";   params.push(String(contact_id)); }
    if (account_id)   { sql += " AND account_id = ?";   params.push(String(account_id)); }
    if (lead_id)      { sql += " AND lead_id = ?";      params.push(String(lead_id)); }
    if (status)       { sql += " AND status = ?";       params.push(String(status)); }
    if (remind_after) { sql += " AND remind_at_ms > ?"; params.push(Number(remind_after)); }

    sql += " ORDER BY updated_at DESC, id ASC LIMIT ?";

    const rows = await db.prepare(sql).all(...params, limit);
    res.json(rows);
  })
);

/** Detalle */
router.get(
  "/activities/:id",
  canRead("activities"),
  wrap(async (req, res) => {
    const row = db
      .prepare(`SELECT * FROM activities WHERE id = ? AND tenant_id = ?`)
      .get(req.params.id, req.tenantId);

    if (!row) return res.status(404).json({ error: "not_found" });
    res.json(row);
  })
);

/** Crear */
router.post(
  "/activities",
  wrap(async (req, res) => {
    let {
      id,
      type,
      title,
      due_date,
      remind_at_ms,            // 👈 nuevo
      status,
      notes,
      account_id,
      contact_id,
      lead_id,
      deal_id,
    } = req.body || {};

    id = coerceStr(id) || "";
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

    if (!id || !type || !title) {
      return res.status(400).json({ error: "id_type_title_required" });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return res.status(400).json({ error: "invalid_activity_id" });
    }
    if (!VALID_STATUS.has(status)) status = "open";

    // Si el ID ya existe, generar uno nuevo automáticamente
    let finalId = id;
    let attempts = 0;
    while (attempts < 10) {
      const exists = db
        .prepare(`SELECT 1 FROM activities WHERE id = ? AND tenant_id = ? LIMIT 1`)
        .get(finalId, req.tenantId);
      
      if (!exists) break;
      
      // Generar nuevo ID: agregar sufijo con timestamp + random
      attempts++;
      const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      finalId = id.slice(0, 10) + suffix;
    }
    
    if (attempts >= 10) {
      return res.status(409).json({ error: "activity_id_conflict_max_retries" });
    }

    // Validar FKs en el mismo tenant (si vienen)
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
      INSERT INTO activities (
        id, type, title, due_date, remind_at_ms, status, notes,
        account_id, contact_id, lead_id, deal_id,
        tenant_id, created_by, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `
    ).run(
      finalId,
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
      .prepare(`SELECT * FROM activities WHERE id = ? AND tenant_id = ?`)
      .get(finalId, req.tenantId);

    res.status(201).json(created);
  })
);

/** Actualizar (parcial) */
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
      remind_at_ms = found.remind_at_ms,  // 👈 nuevo
      status = found.status,
      notes = found.notes,
      account_id = found.account_id,
      contact_id = found.contact_id,
      lead_id = found.lead_id,
      deal_id = found.deal_id,
    } = req.body || {};

    type = coerceStr(type) || found.type;
    title = coerceStr(title) || found.title;
    status = coerceStr(status) || found.status;
    notes = coerceStr(notes) ?? found.notes;
    account_id = coerceStr(account_id) ?? found.account_id;
    contact_id = coerceStr(contact_id) ?? found.contact_id;
    lead_id = coerceStr(lead_id) ?? found.lead_id;
    deal_id = coerceStr(deal_id) ?? found.deal_id;
    due_date = coerceNum(due_date);
    remind_at_ms = coerceNum(remind_at_ms);

    if (!VALID_STATUS.has(status)) status = found.status;

    // Validar FKs si cambian
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

    const updated_at = Date.now();

    await db.prepare(
      `
      UPDATE activities SET
        type = ?, title = ?, due_date = ?, remind_at_ms = ?, status = ?, notes = ?,
        account_id = ?, contact_id = ?, lead_id = ?, deal_id = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `
    ).run(
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
      .prepare(`SELECT * FROM activities WHERE id = ? AND tenant_id = ?`)
      .get(req.params.id, req.tenantId);

    res.json(updated);
  })
);

/** Borrar */
router.delete(
  "/activities/:id",
  canDelete("activities"),
  wrap(async (req, res) => {
    const info = db
      .prepare(`DELETE FROM activities WHERE id = ? AND tenant_id = ?`)
      .run(req.params.id, req.tenantId);
    if (info.changes === 0) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  })
);

module.exports = router;

// // server/routes/activities.js
// const { Router } = require("express");
// const db = require("../db/connection");
// const wrap = require("../lib/wrap");
// const { requireTenantRole } = require("../lib/tenant");

// const router = Router();

// /** Utils */
// const coerceStr = (v) => (typeof v === "string" ? v.trim() : null);
// const VALID_STATUS = new Set(["open", "done", "canceled"]);

// /** Lista con filtros opcionales ?deal_id=&contact_id=&account_id=&lead_id=&status=&limit= */
// router.get(
//   "/activities",
//   wrap(async (req, res) => {
//     const { deal_id, contact_id, account_id, lead_id, status } = req.query || {};
//     const limit = Math.min(parseInt(req.query?.limit, 10) || 100, 200);

//     let sql = `SELECT * FROM activities WHERE tenant_id = ?`;
//     const params = [req.tenantId];

//     if (deal_id) {
//       sql += " AND deal_id = ?";
//       params.push(String(deal_id));
//     }
//     if (contact_id) {
//       sql += " AND contact_id = ?";
//       params.push(String(contact_id));
//     }
//     if (account_id) {
//       sql += " AND account_id = ?";
//       params.push(String(account_id));
//     }
//     if (lead_id) {
//       sql += " AND lead_id = ?";
//       params.push(String(lead_id));
//     }
//     if (status) {
//       sql += " AND status = ?";
//       params.push(String(status));
//     }

//     sql += " ORDER BY updated_at DESC, id ASC LIMIT ?";

//     const rows = await db.prepare(sql).all(...params, limit);
//     res.json(rows);
//   })
// );

// /** Detalle */
// router.get(
//   "/activities/:id",
//   wrap(async (req, res) => {
//     const row = db
//       .prepare(`SELECT * FROM activities WHERE id = ? AND tenant_id = ?`)
//       .get(req.params.id, req.tenantId);

//     if (!row) return res.status(404).json({ error: "not_found" });
//     res.json(row);
//   })
// );

// /** Crear */
// router.post(
//   "/activities",
//   requireTenantRole(["owner", "admin"]),
//   wrap(async (req, res) => {
//     let {
//       id,
//       type,
//       title,
//       due_date,
//       status,
//       notes,
//       account_id,
//       contact_id,
//       lead_id,
//       deal_id,
//     } = req.body || {};

//     id = coerceStr(id) || "";
//     type = coerceStr(type) || "";
//     title = coerceStr(title) || "";
//     status = coerceStr(status) || "open";
//     notes = coerceStr(notes);
//     account_id = coerceStr(account_id);
//     contact_id = coerceStr(contact_id);
//     lead_id = coerceStr(lead_id);
//     deal_id = coerceStr(deal_id);

//     if (!id || !type || !title) {
//       return res.status(400).json({ error: "id_type_title_required" });
//     }
//     if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
//       return res.status(400).json({ error: "invalid_activity_id" });
//     }
//     if (!VALID_STATUS.has(status)) status = "open";

//     // ID único por tenant
//     const exists = db
//       .prepare(`SELECT 1 FROM activities WHERE id = ? AND tenant_id = ? LIMIT 1`)
//       .get(id, req.tenantId);
//     if (exists) return res.status(409).json({ error: "activity_exists" });

//     // Validar FKs en el mismo tenant (si vienen)
//     if (account_id) {
//       const acc = db
//         .prepare(`SELECT 1 FROM accounts WHERE id = ? AND tenant_id = ? LIMIT 1`)
//         .get(account_id, req.tenantId);
//       if (!acc) return res.status(400).json({ error: "invalid_account_id" });
//     }
//     if (contact_id) {
//       const c = db
//         .prepare(`SELECT 1 FROM contacts WHERE id = ? AND tenant_id = ? LIMIT 1`)
//         .get(contact_id, req.tenantId);
//       if (!c) return res.status(400).json({ error: "invalid_contact_id" });
//     }
//     if (lead_id) {
//       const l = db
//         .prepare(`SELECT 1 FROM leads WHERE id = ? AND tenant_id = ? LIMIT 1`)
//         .get(lead_id, req.tenantId);
//       if (!l) return res.status(400).json({ error: "invalid_lead_id" });
//     }
//     if (deal_id) {
//       const d = db
//         .prepare(`SELECT 1 FROM deals WHERE id = ? AND tenant_id = ? LIMIT 1`)
//         .get(deal_id, req.tenantId);
//       if (!d) return res.status(400).json({ error: "invalid_deal_id" });
//     }

//     const now = Date.now();
//     await db.prepare(
//       `
//       INSERT INTO activities (
//         id, type, title, due_date, status, notes,
//         account_id, contact_id, lead_id, deal_id,
//         tenant_id, created_at, updated_at
//       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
//     `
//     ).run(
//       id,
//       type,
//       title,
//       due_date ?? null,
//       status,
//       notes ?? null,
//       account_id ?? null,
//       contact_id ?? null,
//       lead_id ?? null,
//       deal_id ?? null,
//       req.tenantId,
//       now,
//       now
//     );

//     const created = db
//       .prepare(`SELECT * FROM activities WHERE id = ? AND tenant_id = ?`)
//       .get(id, req.tenantId);

//     res.status(201).json(created);
//   })
// );

// /** Actualizar (parcial) */
// router.patch(
//   "/activities/:id",
//   requireTenantRole(["owner", "admin"]),
//   wrap(async (req, res) => {
//     const found = db
//       .prepare(`SELECT * FROM activities WHERE id = ? AND tenant_id = ?`)
//       .get(req.params.id, req.tenantId);
//     if (!found) return res.status(404).json({ error: "not_found" });

//     let {
//       type = found.type,
//       title = found.title,
//       due_date = found.due_date,
//       status = found.status,
//       notes = found.notes,
//       account_id = found.account_id,
//       contact_id = found.contact_id,
//       lead_id = found.lead_id,
//       deal_id = found.deal_id,
//     } = req.body || {};

//     type = coerceStr(type) || found.type;
//     title = coerceStr(title) || found.title;
//     status = coerceStr(status) || found.status;
//     notes = coerceStr(notes) ?? found.notes;
//     account_id = coerceStr(account_id) ?? found.account_id;
//     contact_id = coerceStr(contact_id) ?? found.contact_id;
//     lead_id = coerceStr(lead_id) ?? found.lead_id;
//     deal_id = coerceStr(deal_id) ?? found.deal_id;

//     if (!VALID_STATUS.has(status)) status = found.status;

//     // Validar FKs si cambian
//     if (account_id) {
//       const acc = db
//         .prepare(`SELECT 1 FROM accounts WHERE id = ? AND tenant_id = ? LIMIT 1`)
//         .get(account_id, req.tenantId);
//       if (!acc) return res.status(400).json({ error: "invalid_account_id" });
//     }
//     if (contact_id) {
//       const c = db
//         .prepare(`SELECT 1 FROM contacts WHERE id = ? AND tenant_id = ? LIMIT 1`)
//         .get(contact_id, req.tenantId);
//       if (!c) return res.status(400).json({ error: "invalid_contact_id" });
//     }
//     if (lead_id) {
//       const l = db
//         .prepare(`SELECT 1 FROM leads WHERE id = ? AND tenant_id = ? LIMIT 1`)
//         .get(lead_id, req.tenantId);
//       if (!l) return res.status(400).json({ error: "invalid_lead_id" });
//     }
//     if (deal_id) {
//       const d = db
//         .prepare(`SELECT 1 FROM deals WHERE id = ? AND tenant_id = ? LIMIT 1`)
//         .get(deal_id, req.tenantId);
//       if (!d) return res.status(400).json({ error: "invalid_deal_id" });
//     }

//     const updated_at = Date.now();

//     await db.prepare(
//       `
//       UPDATE activities SET
//         type = ?, title = ?, due_date = ?, status = ?, notes = ?,
//         account_id = ?, contact_id = ?, lead_id = ?, deal_id = ?, updated_at = ?
//       WHERE id = ? AND tenant_id = ?
//     `
//     ).run(
//       type,
//       title,
//       due_date ?? null,
//       status,
//       notes ?? null,
//       account_id ?? null,
//       contact_id ?? null,
//       lead_id ?? null,
//       deal_id ?? null,
//       updated_at,
//       req.params.id,
//       req.tenantId
//     );

//     const updated = db
//       .prepare(`SELECT * FROM activities WHERE id = ? AND tenant_id = ?`)
//       .get(req.params.id, req.tenantId);

//     res.json(updated);
//   })
// );

// /** Borrar */
// router.delete(
//   "/activities/:id",
//   requireTenantRole(["owner", "admin"]),
//   wrap(async (req, res) => {
//     const info = db
//       .prepare(`DELETE FROM activities WHERE id = ? AND tenant_id = ?`)
//       .run(req.params.id, req.tenantId);
//     if (info.changes === 0) return res.status(404).json({ error: "not_found" });
//     res.json({ ok: true });
//   })
// );

// module.exports = router;

