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

// mailers
const {
  notifyActivityCreated,
  notifyActivityReassigned,
} = require("../lib/activityNotifications");

const router = Router();

const coerceStr = (v) => (typeof v === "string" ? v.trim() : null);
const coerceNum = (v) =>
  v === null || v === undefined || v === "" ? null : Number(v);
const VALID_STATUS = new Set(["open", "done", "canceled"]);

// Nuevo enfoque: resolver SIEMPRE row aunque el driver sea sync/async o venga envuelto
async function resolveRow(maybe) {
  const v = await Promise.resolve(maybe);
  if (!v) return null;

  // Caso: drivers/wrappers que devuelven { rows: [...] }
  if (Array.isArray(v.rows)) return v.rows[0] ?? null;

  // Caso: drivers/wrappers que devuelven { row: {...} }
  if (v.row && typeof v.row === "object") return v.row;

  // Caso: row plano
  return v;
}

// Mantengo tu unwrapRow (por si ya lo usabas), pero el flujo principal usa resolveRow
function unwrapRow(x) {
  if (!x) return null;
  if (Array.isArray(x?.rows)) return x.rows[0] ?? null;
  if (x?.row) return x.row;
  return x;
}

// Normaliza asignación (evita duplicados, huecos, swaps)
function normalizeAssignees(assigned_to, assigned_to_2) {
  let a1 = assigned_to ? String(assigned_to).trim() : null;
  let a2 = assigned_to_2 ? String(assigned_to_2).trim() : null;

  if (a1 === "") a1 = null;
  if (a2 === "") a2 = null;

  if (a1 && a2 && a1 === a2) a2 = null;

  if (!a1 && a2) {
    a1 = a2;
    a2 = null;
  }

  return { assigned_to: a1, assigned_to_2: a2 };
}

function assigneeSet(obj) {
  const s = new Set();
  if (obj?.assigned_to) s.add(String(obj.assigned_to));
  if (obj?.assigned_to_2) s.add(String(obj.assigned_to_2));
  return s;
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/** GET /activities (filtros opcionales) */
router.get(
  "/activities",
  wrap(async (req, res) => {
    const {
      deal_id,
      contact_id,
      account_id,
      lead_id,
      status,
      remind_after,
    } = req.query || {};
    const limit = Math.min(parseInt(req.query?.limit, 10) || 100, 200);

    const userId = resolveUserId(req);

    // rol global
    let userRole = "member";
    if (userId) {
      const roleRow = await resolveRow(
        db.prepare(`SELECT role FROM users WHERE id = ? LIMIT 1`).get(userId)
      );
      if (roleRow?.role) userRole = String(roleRow.role).toLowerCase();
    }

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

    // member: solo sus actividades
    if (userRole === "member" && userId) {
      clauses.push(
        "(a.created_by = ? OR a.assigned_to = ? OR a.assigned_to_2 = ?)"
      );
      params.push(userId, userId, userId);
    }

    const sql = `
      SELECT 
        a.*,
        cu.name  AS created_by_name,
        cu.email AS created_by_email,
        au.name  AS assigned_to_name,
        au.email AS assigned_to_email,
        au2.name  AS assigned_to_2_name,
        au2.email AS assigned_to_2_email
      FROM activities a
      LEFT JOIN users cu  ON cu.id  = a.created_by
      LEFT JOIN users au  ON au.id  = a.assigned_to
      LEFT JOIN users au2 ON au2.id = a.assigned_to_2
      WHERE ${clauses.join(" AND ")}
      ORDER BY a.updated_at DESC, a.id ASC
      LIMIT ?
    `;

    const rows = await db.prepare(sql).all(...params, limit);

    console.log(
      "GET /activities -> role:",
      userRole,
      "user:",
      userId,
      "rows:",
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        created_by: r.created_by,
        assigned_to: r.assigned_to,
        assigned_to_2: r.assigned_to_2,
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
    const row = await resolveRow(
      db
        .prepare(
          `
          SELECT 
            a.*,
            cu.name  AS created_by_name,
            cu.email AS created_by_email,
            au.name  AS assigned_to_name,
            au.email AS assigned_to_email,
            au2.name  AS assigned_to_2_name,
            au2.email AS assigned_to_2_email
          FROM activities a
          LEFT JOIN users cu  ON cu.id  = a.created_by
          LEFT JOIN users au  ON au.id  = a.assigned_to
          LEFT JOIN users au2 ON au2.id = a.assigned_to_2
          WHERE a.id = ? AND a.tenant_id = ?
        `
        )
        .get(req.params.id, req.tenantId)
    );

    if (!row) return res.status(404).json({ error: "not_found" });
    res.json(row);
  })
);

/** POST /activities (id en servidor) */
router.post(
  "/activities",
  wrap(async (req, res) => {
    console.log("POST /activities body:", req.body, "tenant:", req.tenantId);

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
      assigned_to,
      assigned_to_2,
    } = req.body || {};

    type = coerceStr(type) || "";
    title = coerceStr(title) || "";
    status = coerceStr(status) || "open";
    notes = coerceStr(notes);
    account_id = coerceStr(account_id);
    contact_id = coerceStr(contact_id);
    lead_id = coerceStr(lead_id);
    deal_id = coerceStr(deal_id);
    assigned_to = coerceStr(assigned_to);
    assigned_to_2 = coerceStr(assigned_to_2);
    due_date = coerceNum(due_date);
    remind_at_ms = coerceNum(remind_at_ms);

    if (!type || !title) {
      return res.status(400).json({ error: "type_title_required" });
    }
    if (!VALID_STATUS.has(status)) status = "open";

    const id = crypto.randomUUID();

    const checkFk = async (table, value, field) => {
      if (!value) return;
      const exists = await resolveRow(
        db
          .prepare(
            `SELECT 1 FROM ${table} WHERE id = ? AND tenant_id = ? LIMIT 1`
          )
          .get(value, req.tenantId)
      );
      if (!exists) throw new Error(`invalid_${field}`);
    };

    try {
      await checkFk("accounts", account_id, "account_id");
      await checkFk("contacts", contact_id, "contact_id");
      await checkFk("leads", lead_id, "lead_id");
      await checkFk("deals", deal_id, "deal_id");
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const userId = resolveUserId(req);
    const now = Date.now();

    const norm = normalizeAssignees(assigned_to, assigned_to_2);

    await db
      .prepare(
        `
        INSERT INTO activities (
          id, type, title, due_date, remind_at_ms, status, notes,
          account_id, contact_id, lead_id, deal_id,
          tenant_id, created_by, created_at, updated_at,
          assigned_to, assigned_to_2
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
        norm.assigned_to ?? null,
        norm.assigned_to_2 ?? null
      );

    const created = {
      id,
      type,
      title,
      status,
      notes,
      account_id,
      contact_id,
      lead_id,
      deal_id,
      tenant_id: req.tenantId,
      assigned_to: norm.assigned_to,
      assigned_to_2: norm.assigned_to_2,
      created_by: userId,
      created_at: now,
      updated_at: now,
    };

    console.log("Nueva activity creada:", {
      id: created.id,
      title: created.title,
      assigned_to: created.assigned_to,
      assigned_to_2: created.assigned_to_2,
      tenant: created.tenant_id,
    });

    notifyActivityCreated(created).catch((err) => {
      console.error("Error enviando emails de actividad:", err);
    });

    res.status(201).json(created);
  })
);

/** PATCH /activities/:id */
router.patch(
  "/activities/:id",
  canWrite("activities"),
  wrap(async (req, res) => {
    const found = await resolveRow(
      db
        .prepare(`SELECT * FROM activities WHERE id = ? AND tenant_id = ?`)
        .get(req.params.id, req.tenantId)
    );

    if (!found) return res.status(404).json({ error: "not_found" });

    const body = req.body || {};

    const hasProp = (name) => Object.prototype.hasOwnProperty.call(body, name);

    const notifyAssignees =
      body?.notify_assignees === true ||
      body?.notify_assignees === "true" ||
      body?.notify_assignees === 1 ||
      body?.notify_assignees === "1";

    const beforeNorm = normalizeAssignees(
      found.assigned_to ?? null,
      found.assigned_to_2 ?? null
    );

    const final = {
      type: found.type || "task",
      title: found.title || "Sin título",
      status: VALID_STATUS.has(found.status) ? found.status : "open",
      notes: found.notes ?? null,
      account_id: found.account_id ?? null,
      contact_id: found.contact_id ?? null,
      lead_id: found.lead_id ?? null,
      deal_id: found.deal_id ?? null,
      assigned_to: beforeNorm.assigned_to ?? null,
      assigned_to_2: beforeNorm.assigned_to_2 ?? null,
      due_date: found.due_date ?? null,
      remind_at_ms: found.remind_at_ms ?? null,
    };

    if (hasProp("type")) {
      const t = coerceStr(body.type);
      if (t) final.type = t;
    }
    if (hasProp("title")) {
      const t = coerceStr(body.title);
      if (t && t.length > 0) final.title = t;
    }
    if (hasProp("status")) {
      const s = coerceStr(body.status);
      if (s && VALID_STATUS.has(s)) final.status = s;
    }
    if (hasProp("notes")) final.notes = coerceStr(body.notes);

    if (hasProp("account_id")) final.account_id = coerceStr(body.account_id);
    if (hasProp("contact_id")) final.contact_id = coerceStr(body.contact_id);
    if (hasProp("lead_id")) final.lead_id = coerceStr(body.lead_id);
    if (hasProp("deal_id")) final.deal_id = coerceStr(body.deal_id);

    if (hasProp("assigned_to")) final.assigned_to = coerceStr(body.assigned_to);
    if (hasProp("assigned_to_2"))
      final.assigned_to_2 = coerceStr(body.assigned_to_2);

    const finalNorm = normalizeAssignees(final.assigned_to, final.assigned_to_2);
    final.assigned_to = finalNorm.assigned_to;
    final.assigned_to_2 = finalNorm.assigned_to_2;

    if (hasProp("due_date")) final.due_date = coerceNum(body.due_date);
    if (hasProp("remind_at_ms")) final.remind_at_ms = coerceNum(body.remind_at_ms);

    const checkFk = async (table, value, field) => {
      if (!value) return;
      const exists = await resolveRow(
        db
          .prepare(
            `SELECT 1 FROM ${table} WHERE id = ? AND tenant_id = ? LIMIT 1`
          )
          .get(value, req.tenantId)
      );
      if (!exists) throw new Error(`invalid_${field}`);
    };

    try {
      await checkFk("accounts", final.account_id, "account_id");
      await checkFk("contacts", final.contact_id, "contact_id");
      await checkFk("leads", final.lead_id, "lead_id");
      await checkFk("deals", final.deal_id, "deal_id");
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const updated_at = Date.now();

    await db
      .prepare(
        `
        UPDATE activities SET
          type = ?, title = ?, due_date = ?, remind_at_ms = ?, status = ?, notes = ?,
          account_id = ?, contact_id = ?, lead_id = ?, deal_id = ?,
          assigned_to = ?, assigned_to_2 = ?, updated_at = ?
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
        final.assigned_to_2 ?? null,
        updated_at,
        req.params.id,
        req.tenantId
      );

    // Traer el registro actualizado con joins (para UI)
    const updated = await resolveRow(
      db
        .prepare(
          `
          SELECT 
            a.*,
            cu.name  AS created_by_name,
            cu.email AS created_by_email,
            au.name  AS assigned_to_name,
            au.email AS assigned_to_email,
            au2.name  AS assigned_to_2_name,
            au2.email AS assigned_to_2_email
          FROM activities a
          LEFT JOIN users cu  ON cu.id  = a.created_by
          LEFT JOIN users au  ON au.id  = a.assigned_to
          LEFT JOIN users au2 ON au2.id = a.assigned_to_2
          WHERE a.id = ? AND a.tenant_id = ?
        `
        )
        .get(req.params.id, req.tenantId)
    );

    const afterNorm = normalizeAssignees(final.assigned_to, final.assigned_to_2);
    const assignmentChanged = !setsEqual(assigneeSet(beforeNorm), assigneeSet(afterNorm));

    // Notificar reasignación (correo)
    if (
      assignmentChanged &&
      notifyAssignees &&
      typeof notifyActivityReassigned === "function"
    ) {
      const changedBy = resolveUserId(req);

      const emailActivity = await resolveRow(
        db
          .prepare(
            `
            SELECT 
              a.*,
              cu.name  AS created_by_name,
              cu.email AS created_by_email,
              au.name  AS assigned_to_name,
              au.email AS assigned_to_email,
              au2.name  AS assigned_to_2_name,
              au2.email AS assigned_to_2_email
            FROM activities a
            LEFT JOIN users cu  ON cu.id  = a.created_by
            LEFT JOIN users au  ON au.id  = a.assigned_to
            LEFT JOIN users au2 ON au2.id = a.assigned_to_2
            WHERE a.id = ? AND a.tenant_id = ?
          `
          )
          .get(req.params.id, req.tenantId)
      );

      const safeEmailRow =
        emailActivity || unwrapRow(updated) || unwrapRow(found) || null;

      const activityForEmail = {
        ...(safeEmailRow || {}),
        id: safeEmailRow?.id ?? req.params.id,
        tenant_id: req.tenantId,
      };

      notifyActivityReassigned({
        tenant_id: req.tenantId,
        activity: activityForEmail,
        before: beforeNorm,
        after: afterNorm,
        changed_by: changedBy,
      }).catch((err) => {
        console.error("Error enviando correo de reasignación:", err);
      });
    }

    res.json(updated || { ...found, ...final, updated_at });
  })
);

router.delete(
  "/activities/:id",
  canDelete("activities"),
  wrap(async (req, res) => {
    const row = await resolveRow(
      db
        .prepare(`SELECT id FROM activities WHERE id = ? AND tenant_id = ?`)
        .get(req.params.id, req.tenantId)
    );
    if (!row) return res.status(404).json({ error: "not_found" });

    await db
      .prepare(`DELETE FROM activities WHERE id = ? AND tenant_id = ?`)
      .run(req.params.id, req.tenantId);

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
// } = require("../lib/authorize");
// const crypto = require("crypto");

// // mailers
// const {
//   notifyActivityCreated,
//   notifyActivityReassigned,
// } = require("../lib/activityNotifications");

// const router = Router();

// const coerceStr = (v) => (typeof v === "string" ? v.trim() : null);
// const coerceNum = (v) =>
//   v === null || v === undefined || v === "" ? null : Number(v);
// const VALID_STATUS = new Set(["open", "done", "canceled"]);

// // Nuevo enfoque: resolver SIEMPRE row aunque el driver sea sync/async o venga envuelto
// async function resolveRow(maybe) {
//   const v = await Promise.resolve(maybe);

//   if (!v) return null;

//   // Caso: drivers/wrappers que devuelven { rows: [...] }
//   if (Array.isArray(v.rows)) return v.rows[0] ?? null;

//   // Caso: drivers/wrappers que devuelven { row: {...} }
//   if (v.row && typeof v.row === "object") return v.row;

//   // Caso: row plano
//   return v;
// }

// // Mantengo tu unwrapRow (por si ya lo usabas), pero el flujo principal usa resolveRow
// function unwrapRow(x) {
//   if (!x) return null;
//   if (Array.isArray(x?.rows)) return x.rows[0] ?? null;
//   if (x?.row) return x.row;
//   return x;
// }

// // Normaliza asignación (evita duplicados, huecos, swaps)
// function normalizeAssignees(assigned_to, assigned_to_2) {
//   let a1 = assigned_to ? String(assigned_to).trim() : null;
//   let a2 = assigned_to_2 ? String(assigned_to_2).trim() : null;

//   if (a1 === "") a1 = null;
//   if (a2 === "") a2 = null;

//   if (a1 && a2 && a1 === a2) a2 = null;

//   if (!a1 && a2) {
//     a1 = a2;
//     a2 = null;
//   }

//   return { assigned_to: a1, assigned_to_2: a2 };
// }

// function assigneeSet(obj) {
//   const s = new Set();
//   if (obj?.assigned_to) s.add(String(obj.assigned_to));
//   if (obj?.assigned_to_2) s.add(String(obj.assigned_to_2));
//   return s;
// }

// function setsEqual(a, b) {
//   if (a.size !== b.size) return false;
//   for (const v of a) if (!b.has(v)) return false;
//   return true;
// }

// /** GET /activities (filtros opcionales) */
// router.get(
//   "/activities",
//   wrap(async (req, res) => {
//     const {
//       deal_id,
//       contact_id,
//       account_id,
//       lead_id,
//       status,
//       remind_after,
//     } = req.query || {};
//     const limit = Math.min(parseInt(req.query?.limit, 10) || 100, 200);

//     const userId = resolveUserId(req);

//     // rol global
//     let userRole = "member";
//     if (userId) {
//       const roleRow = await resolveRow(
//         db.prepare(`SELECT role FROM users WHERE id = ? LIMIT 1`).get(userId)
//       );
//       if (roleRow?.role) userRole = String(roleRow.role).toLowerCase();
//     }

//     const clauses = ["a.tenant_id = ?"];
//     const params = [req.tenantId];

//     if (deal_id) {
//       clauses.push("a.deal_id = ?");
//       params.push(String(deal_id));
//     }
//     if (contact_id) {
//       clauses.push("a.contact_id = ?");
//       params.push(String(contact_id));
//     }
//     if (account_id) {
//       clauses.push("a.account_id = ?");
//       params.push(String(account_id));
//     }
//     if (lead_id) {
//       clauses.push("a.lead_id = ?");
//       params.push(String(lead_id));
//     }
//     if (status) {
//       clauses.push("a.status = ?");
//       params.push(String(status));
//     }
//     if (remind_after) {
//       clauses.push("a.remind_at_ms > ?");
//       params.push(Number(remind_after));
//     }

//     // member: solo sus actividades
//     if (userRole === "member" && userId) {
//       clauses.push(
//         "(a.created_by = ? OR a.assigned_to = ? OR a.assigned_to_2 = ?)"
//       );
//       params.push(userId, userId, userId);
//     }

//     const sql = `
//       SELECT 
//         a.*,
//         cu.name  AS created_by_name,
//         cu.email AS created_by_email,
//         au.name  AS assigned_to_name,
//         au.email AS assigned_to_email,
//         au2.name  AS assigned_to_2_name,
//         au2.email AS assigned_to_2_email
//       FROM activities a
//       LEFT JOIN users cu  ON cu.id  = a.created_by
//       LEFT JOIN users au  ON au.id  = a.assigned_to
//       LEFT JOIN users au2 ON au2.id = a.assigned_to_2
//       WHERE ${clauses.join(" AND ")}
//       ORDER BY a.updated_at DESC, a.id ASC
//       LIMIT ?
//     `;

//     const rows = await db.prepare(sql).all(...params, limit);

//     console.log(
//       "GET /activities -> role:",
//       userRole,
//       "user:",
//       userId,
//       "rows:",
//       rows.map((r) => ({
//         id: r.id,
//         title: r.title,
//         created_by: r.created_by,
//         assigned_to: r.assigned_to,
//         assigned_to_2: r.assigned_to_2,
//       }))
//     );

//     res.json(rows);
//   })
// );

// /** GET /activities/:id */
// router.get(
//   "/activities/:id",
//   canRead("activities"),
//   wrap(async (req, res) => {
//     const row = await resolveRow(
//       db
//         .prepare(
//           `
//           SELECT 
//             a.*,
//             cu.name  AS created_by_name,
//             cu.email AS created_by_email,
//             au.name  AS assigned_to_name,
//             au.email AS assigned_to_email,
//             au2.name  AS assigned_to_2_name,
//             au2.email AS assigned_to_2_email
//           FROM activities a
//           LEFT JOIN users cu  ON cu.id  = a.created_by
//           LEFT JOIN users au  ON au.id  = a.assigned_to
//           LEFT JOIN users au2 ON au2.id = a.assigned_to_2
//           WHERE a.id = ? AND a.tenant_id = ?
//         `
//         )
//         .get(req.params.id, req.tenantId)
//     );

//     if (!row) return res.status(404).json({ error: "not_found" });
//     res.json(row);
//   })
// );

// /** POST /activities (id en servidor) */
// router.post(
//   "/activities",
//   wrap(async (req, res) => {
//     console.log("POST /activities body:", req.body, "tenant:", req.tenantId);

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
//       assigned_to,
//       assigned_to_2,
//     } = req.body || {};

//     type = coerceStr(type) || "";
//     title = coerceStr(title) || "";
//     status = coerceStr(status) || "open";
//     notes = coerceStr(notes);
//     account_id = coerceStr(account_id);
//     contact_id = coerceStr(contact_id);
//     lead_id = coerceStr(lead_id);
//     deal_id = coerceStr(deal_id);
//     assigned_to = coerceStr(assigned_to);
//     assigned_to_2 = coerceStr(assigned_to_2);
//     due_date = coerceNum(due_date);
//     remind_at_ms = coerceNum(remind_at_ms);

//     if (!type || !title) {
//       return res.status(400).json({ error: "type_title_required" });
//     }
//     if (!VALID_STATUS.has(status)) status = "open";

//     const id = crypto.randomUUID();

//     const checkFk = async (table, value, field) => {
//       if (!value) return;
//       const exists = await resolveRow(
//         db
//           .prepare(`SELECT 1 FROM ${table} WHERE id = ? AND tenant_id = ? LIMIT 1`)
//           .get(value, req.tenantId)
//       );
//       if (!exists) throw new Error(`invalid_${field}`);
//     };

//     try {
//       await checkFk("accounts", account_id, "account_id");
//       await checkFk("contacts", contact_id, "contact_id");
//       await checkFk("leads", lead_id, "lead_id");
//       await checkFk("deals", deal_id, "deal_id");
//     } catch (e) {
//       return res.status(400).json({ error: e.message });
//     }

//     const userId = resolveUserId(req);
//     const now = Date.now();

//     const norm = normalizeAssignees(assigned_to, assigned_to_2);

//     await db
//       .prepare(
//         `
//         INSERT INTO activities (
//           id, type, title, due_date, remind_at_ms, status, notes,
//           account_id, contact_id, lead_id, deal_id,
//           tenant_id, created_by, created_at, updated_at,
//           assigned_to, assigned_to_2
//         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
//       `
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
//         now,
//         norm.assigned_to ?? null,
//         norm.assigned_to_2 ?? null
//       );

//     const created = {
//       id,
//       type,
//       title,
//       status,
//       notes,
//       account_id,
//       contact_id,
//       lead_id,
//       deal_id,
//       tenant_id: req.tenantId,
//       assigned_to: norm.assigned_to,
//       assigned_to_2: norm.assigned_to_2,
//       created_by: userId,
//       created_at: now,
//       updated_at: now,
//     };

//     console.log("Nueva activity creada:", {
//       id: created.id,
//       title: created.title,
//       assigned_to: created.assigned_to,
//       assigned_to_2: created.assigned_to_2,
//       tenant: created.tenant_id,
//     });

//     notifyActivityCreated(created).catch((err) => {
//       console.error("Error enviando emails de actividad:", err);
//     });

//     res.status(201).json(created);
//   })
// );

// /** PATCH /activities/:id */
// router.patch(
//   "/activities/:id",
//   canWrite("activities"),
//   wrap(async (req, res) => {
//     const found = await resolveRow(
//       db
//         .prepare(`SELECT * FROM activities WHERE id = ? AND tenant_id = ?`)
//         .get(req.params.id, req.tenantId)
//     );

//     if (!found) return res.status(404).json({ error: "not_found" });

//     const body = req.body || {};
//     console.log("PATCH /activities/:id body keys:", Object.keys(body));
//     console.log(
//       "notify_assignees raw:",
//       body.notify_assignees,
//       "type:",
//       typeof body.notify_assignees
//     );
//     console.log("assigned_to raw:", body.assigned_to);
//     console.log("assigned_to_2 raw:", body.assigned_to_2);

//     const hasProp = (name) => Object.prototype.hasOwnProperty.call(body, name);

//     const notifyAssignees =
//       body?.notify_assignees === true ||
//       body?.notify_assignees === "true" ||
//       body?.notify_assignees === 1 ||
//       body?.notify_assignees === "1";

//     const beforeNorm = normalizeAssignees(
//       found.assigned_to ?? null,
//       found.assigned_to_2 ?? null
//     );

//     const final = {
//       type: found.type || "task",
//       title: found.title || "Sin título",
//       status: VALID_STATUS.has(found.status) ? found.status : "open",
//       notes: found.notes ?? null,
//       account_id: found.account_id ?? null,
//       contact_id: found.contact_id ?? null,
//       lead_id: found.lead_id ?? null,
//       deal_id: found.deal_id ?? null,
//       assigned_to: beforeNorm.assigned_to ?? null,
//       assigned_to_2: beforeNorm.assigned_to_2 ?? null,
//       due_date: found.due_date ?? null,
//       remind_at_ms: found.remind_at_ms ?? null,
//     };

//     if (hasProp("type")) {
//       const t = coerceStr(body.type);
//       if (t) final.type = t;
//     }

//     if (hasProp("title")) {
//       const t = coerceStr(body.title);
//       if (t && t.length > 0) final.title = t;
//     }

//     if (hasProp("status")) {
//       const s = coerceStr(body.status);
//       if (s && VALID_STATUS.has(s)) final.status = s;
//     }

//     if (hasProp("notes")) final.notes = coerceStr(body.notes);

//     if (hasProp("account_id")) final.account_id = coerceStr(body.account_id);
//     if (hasProp("contact_id")) final.contact_id = coerceStr(body.contact_id);
//     if (hasProp("lead_id")) final.lead_id = coerceStr(body.lead_id);
//     if (hasProp("deal_id")) final.deal_id = coerceStr(body.deal_id);

//     if (hasProp("assigned_to")) final.assigned_to = coerceStr(body.assigned_to);
//     if (hasProp("assigned_to_2"))
//       final.assigned_to_2 = coerceStr(body.assigned_to_2);

//     const finalNorm = normalizeAssignees(final.assigned_to, final.assigned_to_2);
//     final.assigned_to = finalNorm.assigned_to;
//     final.assigned_to_2 = finalNorm.assigned_to_2;

//     if (hasProp("due_date")) final.due_date = coerceNum(body.due_date);
//     if (hasProp("remind_at_ms")) final.remind_at_ms = coerceNum(body.remind_at_ms);

//     const checkFk = async (table, value, field) => {
//       if (!value) return;
//       const exists = await resolveRow(
//         db
//           .prepare(`SELECT 1 FROM ${table} WHERE id = ? AND tenant_id = ? LIMIT 1`)
//           .get(value, req.tenantId)
//       );
//       if (!exists) throw new Error(`invalid_${field}`);
//     };

//     try {
//       await checkFk("accounts", final.account_id, "account_id");
//       await checkFk("contacts", final.contact_id, "contact_id");
//       await checkFk("leads", final.lead_id, "lead_id");
//       await checkFk("deals", final.deal_id, "deal_id");
//     } catch (e) {
//       return res.status(400).json({ error: e.message });
//     }

//     const updated_at = Date.now();

//     await db
//       .prepare(
//         `
//         UPDATE activities SET
//           type = ?, title = ?, due_date = ?, remind_at_ms = ?, status = ?, notes = ?,
//           account_id = ?, contact_id = ?, lead_id = ?, deal_id = ?,
//           assigned_to = ?, assigned_to_2 = ?, updated_at = ?
//         WHERE id = ? AND tenant_id = ?
//       `
//       )
//       .run(
//         final.type,
//         final.title,
//         final.due_date ?? null,
//         final.remind_at_ms ?? null,
//         final.status,
//         final.notes ?? null,
//         final.account_id ?? null,
//         final.contact_id ?? null,
//         final.lead_id ?? null,
//         final.deal_id ?? null,
//         final.assigned_to ?? null,
//         final.assigned_to_2 ?? null,
//         updated_at,
//         req.params.id,
//         req.tenantId
//       );

//     // Traer el registro actualizado con joins (para UI)
//     const updated = await resolveRow(
//       db
//         .prepare(
//           `
//           SELECT 
//             a.*,
//             cu.name  AS created_by_name,
//             cu.email AS created_by_email,
//             au.name  AS assigned_to_name,
//             au.email AS assigned_to_email,
//             au2.name  AS assigned_to_2_name,
//             au2.email AS assigned_to_2_email
//           FROM activities a
//           LEFT JOIN users cu  ON cu.id  = a.created_by
//           LEFT JOIN users au  ON au.id  = a.assigned_to
//           LEFT JOIN users au2 ON au2.id = a.assigned_to_2
//           WHERE a.id = ? AND a.tenant_id = ?
//         `
//         )
//         .get(req.params.id, req.tenantId)
//     );

//     const afterNorm = normalizeAssignees(final.assigned_to, final.assigned_to_2);

//     const beforeSet = assigneeSet(beforeNorm);
//     const afterSet = assigneeSet(afterNorm);
//     const assignmentChanged = !setsEqual(beforeSet, afterSet);

//     console.log("assignmentChanged:", assignmentChanged, {
//       before: beforeNorm,
//       after: afterNorm,
//       beforeSet: Array.from(beforeSet),
//       afterSet: Array.from(afterSet),
//       notifyAssignees,
//     });

//     // Notificar reasignación (correo) con snapshot real y resuelto
//     if (
//       assignmentChanged &&
//       notifyAssignees &&
//       typeof notifyActivityReassigned === "function"
//     ) {
//       const changedBy = resolveUserId(req);

//       const emailActivity = await resolveRow(
//         db
//           .prepare(
//             `
//             SELECT 
//               a.*,
//               cu.name  AS created_by_name,
//               cu.email AS created_by_email,
//               au.name  AS assigned_to_name,
//               au.email AS assigned_to_email,
//               au2.name  AS assigned_to_2_name,
//               au2.email AS assigned_to_2_email
//             FROM activities a
//             LEFT JOIN users cu  ON cu.id  = a.created_by
//             LEFT JOIN users au  ON au.id  = a.assigned_to
//             LEFT JOIN users au2 ON au2.id = a.assigned_to_2
//             WHERE a.id = ? AND a.tenant_id = ?
//           `
//           )
//           .get(req.params.id, req.tenantId)
//       );

//       // Fallbacks seguros (por si el SELECT fallara por alguna razón)
//       const safeEmailRow =
//         emailActivity || unwrapRow(updated) || unwrapRow(found) || null;

//       const activityForEmail = {
//         ...(safeEmailRow || {}),
//         id: safeEmailRow?.id ?? req.params.id,
//         tenant_id: req.tenantId,
//       };

//       console.log("Reassign mail activity snapshot (RESOLVED):", {
//         id: activityForEmail.id,
//         title: activityForEmail.title,
//         contact_id: activityForEmail.contact_id,
//         created_at: activityForEmail.created_at,
//         due_date: activityForEmail.due_date,
//         assigned_to: activityForEmail.assigned_to,
//         assigned_to_2: activityForEmail.assigned_to_2,
//       });

//       notifyActivityReassigned({
//         tenant_id: req.tenantId,
//         activity: activityForEmail,
//         before: beforeNorm,
//         after: afterNorm,
//         changed_by: changedBy,
//       }).catch((err) => {
//         console.error("Error enviando correo de reasignación:", err);
//       });
//     }

//     res.json(updated || { ...found, ...final, updated_at });
//   })
// );

// // Si tienes DELETE en este archivo, lo dejo intacto (si ya existe en tu repo)
// // Si no existe, puedes ignorar esta parte.
// router.delete(
//   "/activities/:id",
//   canDelete("activities"),
//   wrap(async (req, res) => {
//     const row = await resolveRow(
//       db
//         .prepare(`SELECT id FROM activities WHERE id = ? AND tenant_id = ?`)
//         .get(req.params.id, req.tenantId)
//     );
//     if (!row) return res.status(404).json({ error: "not_found" });

//     await db
//       .prepare(`DELETE FROM activities WHERE id = ? AND tenant_id = ?`)
//       .run(req.params.id, req.tenantId);

//     res.json({ ok: true });
//   })
// );

// module.exports = router;


