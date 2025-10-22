// server/routes/deals.js
const { Router } = require("express");
const db = require("../db/connection");
const wrap = require("../lib/wrap");
const { requireTenantRole } = require("../lib/tenant");

const router = Router();

/** Helpers */
function coerceStr(v, fallback = null) {
  if (typeof v === "string") return v.trim();
  return v == null ? fallback : String(v);
}

/**
 * GET /deals
 * Lista de deals del tenant actual.
 * Opcional: ?limit=100
 */
router.get(
  "/deals",
  wrap(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    const rows = db
      .prepare(
        `
        SELECT *
        FROM deals
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
 * GET /deals/:id
 * Detalle de deal dentro del tenant.
 */
router.get(
  "/deals/:id",
  wrap(async (req, res) => {
    const row = db
      .prepare(`SELECT * FROM deals WHERE id = ? AND tenant_id = ?`)
      .get(req.params.id, req.tenantId);
    if (!row) return res.status(404).json({ error: "not_found" });
    res.json(row);
  })
);

/**
 * POST /deals
 * Crea deal (owner/admin).
 * Body: { id, title, amount?, stage?, account_id?, contact_id?, close_date? }
 */
router.post(
  "/deals",
  requireTenantRole(["owner", "admin"]),
  wrap(async (req, res) => {
    let {
      id,
      title,
      amount,
      stage,
      account_id,
      contact_id,
      close_date,
    } = req.body || {};

    id = coerceStr(id, "");
    title = coerceStr(title, "");
    stage = coerceStr(stage, "nuevo");
    account_id = coerceStr(account_id, null);
    contact_id = coerceStr(contact_id, null);
    close_date = close_date ?? null; // puede ser timestamp o string, lo guardamos tal cual

    if (!id || !title) {
      return res.status(400).json({ error: "id_and_title_required" });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return res.status(400).json({ error: "invalid_deal_id" });
    }

    // ID único por tenant
    const exists = db
      .prepare(`SELECT 1 FROM deals WHERE id = ? AND tenant_id = ? LIMIT 1`)
      .get(id, req.tenantId);
    if (exists) return res.status(409).json({ error: "deal_exists" });

    // Validar FKs en el mismo tenant
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

    const now = Date.now();
    db.prepare(
      `
      INSERT INTO deals
        (id, title, amount, stage, account_id, contact_id, close_date, tenant_id, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `
    ).run(
      id,
      title,
      amount ?? null,
      stage,
      account_id ?? null,
      contact_id ?? null,
      close_date ?? null,
      req.tenantId,
      now,
      now
    );

    const created = db
      .prepare(`SELECT * FROM deals WHERE id = ? AND tenant_id = ?`)
      .get(id, req.tenantId);

    res.status(201).json(created);
  })
);

/**
 * PATCH /deals/:id
 * Actualiza deal (owner/admin).
 * Automatización: si pasa a "propuesta", crea una activity "Enviar propuesta" a 24h.
 */
router.patch(
  "/deals/:id",
  requireTenantRole(["owner", "admin"]),
  wrap(async (req, res) => {
    const found = db
      .prepare(`SELECT * FROM deals WHERE id = ? AND tenant_id = ?`)
      .get(req.params.id, req.tenantId);
    if (!found) return res.status(404).json({ error: "not_found" });

    // Validar FKs si vienen
    let account_id =
      typeof req.body?.account_id === "string"
        ? req.body.account_id.trim()
        : found.account_id;
    let contact_id =
      typeof req.body?.contact_id === "string"
        ? req.body.contact_id.trim()
        : found.contact_id;

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

    const prevStage = found.stage;

    const next = {
      ...found,
      ...(req.body || {}),
      title:
        typeof req.body?.title === "string"
          ? req.body.title.trim()
          : found.title,
      stage:
        typeof req.body?.stage === "string"
          ? req.body.stage.trim()
          : found.stage,
      account_id,
      contact_id,
      updated_at: Date.now(),
    };

    db.prepare(
      `
      UPDATE deals SET
        title = ?,
        amount = ?,
        stage = ?,
        account_id = ?,
        contact_id = ?,
        close_date = ?,
        updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `
    ).run(
      next.title,
      next.amount ?? null,
      next.stage ?? "nuevo",
      next.account_id ?? null,
      next.contact_id ?? null,
      next.close_date ?? null,
      next.updated_at,
      req.params.id,
      req.tenantId
    );

    // Automatización: al pasar a "propuesta" creamos una actividad (mismo tenant)
    if (prevStage !== "propuesta" && next.stage === "propuesta") {
      const in24h = Date.now() + 24 * 60 * 60 * 1000;
      const aid = Math.random().toString(36).slice(2) + Date.now().toString(36);

      db.prepare(
        `
        INSERT INTO activities
          (id, type, title, due_date, status, deal_id, tenant_id, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)
      `
      ).run(
        aid,
        "task",
        "Enviar propuesta",
        in24h,
        "open",
        req.params.id,
        req.tenantId,
        Date.now(),
        Date.now()
      );
    }

    const updated = db
      .prepare(`SELECT * FROM deals WHERE id = ? AND tenant_id = ?`)
      .get(req.params.id, req.tenantId);

    res.json(updated);
  })
);

/**
 * DELETE /deals/:id
 * Elimina deal (owner/admin).
 */
router.delete(
  "/deals/:id",
  requireTenantRole(["owner", "admin"]),
  wrap(async (req, res) => {
    const info = db
      .prepare(`DELETE FROM deals WHERE id = ? AND tenant_id = ?`)
      .run(req.params.id, req.tenantId);

    if (info.changes === 0) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  })
);

module.exports = router;


// // server/routes/deals.js
// const { Router } = require("express");
// const db = require("../db/connection");
// const wrap = require("../lib/wrap");

// const router = Router();

// /* Util: cláusulas por tenant
//    - Si req.tenantId === null → single-tenant (sin filtro)
//    - Si tiene valor → multi-tenant (filtrar por tenant_id)
// */
// function whereTenant(req) {
//   const isMT = req.tenantId !== null;
//   return {
//     and: isMT ? " AND tenant_id = ?" : "",
//     only: isMT ? " WHERE tenant_id = ?" : "",
//     params: isMT ? [req.tenantId] : [],
//     isMT,
//   };
// }

// // -------- LISTAR --------
// router.get(
//   "/deals",
//   wrap(async (req, res) => {
//     const t = whereTenant(req);
//     const sql = `SELECT * FROM deals${t.only} ORDER BY updated_at DESC`;
//     const rows = t.isMT
//       ? db.prepare(sql).all(...t.params)
//       : db.prepare(sql).all();
//     res.json(rows);
//   })
// );

// // -------- DETALLE --------
// router.get(
//   "/deals/:id",
//   wrap(async (req, res) => {
//     const t = whereTenant(req);
//     const sql = `SELECT * FROM deals WHERE id = ?${t.and}`;
//     const row = db
//       .prepare(sql)
//       .get(req.params.id, ...(t.isMT ? t.params : []));
//     if (!row) return res.status(404).json({ error: "not found" });
//     res.json(row);
//   })
// );

// // -------- CREAR --------
// router.post(
//   "/deals",
//   wrap(async (req, res) => {
//     const { id, title, amount, stage, account_id, contact_id, close_date } =
//       req.body || {};
//     if (!id || !title)
//       return res.status(400).json({ error: "id and title required" });

//     const now = Date.now();
//     const s = stage || "nuevo";

//     db.prepare(
//       `
//       INSERT INTO deals
//         (id, title, amount, stage, account_id, contact_id, close_date, tenant_id, created_at, updated_at)
//       VALUES (?,?,?,?,?,?,?,?,?,?)
//     `
//     ).run(
//       id,
//       title,
//       amount ?? null,
//       s,
//       account_id ?? null,
//       contact_id ?? null,
//       close_date ?? null,
//       // si single-tenant, req.tenantId es null y se inserta NULL
//       req.tenantId,
//       now,
//       now
//     );

//     res.status(201).json({ ok: true });
//   })
// );

// // -------- ACTUALIZAR --------
// // Automatización: si cambia a "propuesta", crear tarea para mañana (misma tenant)
// router.patch(
//   "/deals/:id",
//   wrap(async (req, res) => {
//     const t = whereTenant(req);

//     // Traer el registro respetando tenant
//     const found = db
//       .prepare(`SELECT * FROM deals WHERE id = ?${t.and}`)
//       .get(req.params.id, ...(t.isMT ? t.params : []));
//     if (!found) return res.status(404).json({ error: "not found" });

//     const prevStage = found.stage;
//     const next = { ...found, ...req.body, updated_at: Date.now() };

//     // Update con filtro por tenant
//     db.prepare(
//       `
//       UPDATE deals SET
//         title      = ?,
//         amount     = ?,
//         stage      = ?,
//         account_id = ?,
//         contact_id = ?,
//         close_date = ?,
//         updated_at = ?
//       WHERE id = ?${t.and}
//     `
//     ).run(
//       next.title,
//       next.amount ?? null,
//       next.stage ?? "nuevo",
//       next.account_id ?? null,
//       next.contact_id ?? null,
//       next.close_date ?? null,
//       next.updated_at,
//       req.params.id,
//       ...(t.isMT ? t.params : [])
//     );

//     // Automatización: al pasar a "propuesta" creamos una actividad (mismo tenant)
//     if (prevStage !== "propuesta" && next.stage === "propuesta") {
//       const in24h = Date.now() + 24 * 60 * 60 * 1000;
//       const aid =
//         Math.random().toString(36).slice(2) + Date.now().toString(36);

//       db.prepare(
//         `
//         INSERT INTO activities
//           (id, type, title, due_date, status, deal_id, tenant_id, created_at, updated_at)
//         VALUES (?,?,?,?,?,?,?,?,?)
//       `
//       ).run(
//         aid,
//         "task",
//         "Enviar propuesta",
//         in24h,
//         "open",
//         req.params.id,
//         req.tenantId, // null si single-tenant
//         Date.now(),
//         Date.now()
//       );
//     }

//     res.json({ ok: true });
//   })
// );

// // -------- BORRAR --------
// router.delete(
//   "/deals/:id",
//   wrap(async (req, res) => {
//     const t = whereTenant(req);
//     const info = db
//       .prepare(`DELETE FROM deals WHERE id = ?${t.and}`)
//       .run(req.params.id, ...(t.isMT ? t.params : []));
//     // Si no borra nada en MT, probablemente otro tenant
//     if (t.isMT && info.changes === 0) {
//       return res.status(404).json({ error: "not found" });
//     }
//     res.json({ ok: true });
//   })
// );

// module.exports = router;

