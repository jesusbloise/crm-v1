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
const { getUserRole } = require("../lib/authorize");
const {
  linkedContactVisibilityFilter,
  canAccessContactLinks,
} = require("../lib/contactAccess");

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
const ACTIVITY_SELECT = `
  SELECT
    a.*,
    cu.name AS created_by_name,
    cu.email AS created_by_email,
    au.name AS assigned_to_name,
    au.email AS assigned_to_email,
    au2.name AS assigned_to_2_name,
    au2.email AS assigned_to_2_email,
    ct.name AS contact_name
  FROM activities a
  LEFT JOIN users cu ON cu.id = a.created_by
  LEFT JOIN users au ON au.id = a.assigned_to
  LEFT JOIN users au2 ON au2.id = a.assigned_to_2
  LEFT JOIN contacts ct
    ON ct.id = a.contact_id
   AND ct.tenant_id = a.tenant_id
`;

async function activityReadFilter(req) {
  const userId = resolveUserId(req);

  if (!userId || !req.tenantId) {
    return { sql: "FALSE", params: [] };
  }

  const linked = linkedContactVisibilityFilter(req, "a");
  const role = String(
    (await getUserRole(userId)) || ""
  ).toLowerCase();

  if (role === "admin" || role === "owner") {
    // Consulta general, respetando la privacidad del contacto.
    return linked;
  }

  if (role !== "member") {
    return { sql: "FALSE", params: [] };
  }

  return {
    sql: `
      (
        ${linked.sql}
        AND (
          a.created_by = ?
          OR a.assigned_to = ?
          OR a.assigned_to_2 = ?
        )
      )
    `,
    params: [
      ...linked.params,
      userId,
      userId,
      userId,
    ],
  };
}
/**
 * Valida acceso del autor y de los usuarios asignados.
 * No comparte el contacto automáticamente.
 */
async function validateActivityAccess(req, activity) {
  const userId = resolveUserId(req);

  if (!userId || !req.tenantId) {
    const err = new Error("unauthorized");
    err.status = 401;
    err.code = "unauthorized";
    throw err;
  }

  const canAccess = await canAccessContactLinks(
    req,
    activity.contact_id,
    activity.deal_id
  );

  if (!canAccess) {
    const err = new Error("Contacto u oportunidad inexistente o sin acceso.");
    err.status = 400;
    err.code = "invalid_contact_links";
    throw err;
  }

  const assignedIds = [
    ...new Set(
      [activity.assigned_to, activity.assigned_to_2].filter(Boolean)
    ),
  ];

  for (const assignedId of assignedIds) {
    // El asignado debe estar activo y pertenecer al workspace.
    const member = await db.prepare(`
      SELECT u.id
      FROM users u
      WHERE u.id = ?
        AND COALESCE(u.active, TRUE) = TRUE
        AND (
          EXISTS (
            SELECT 1
            FROM tenant_memberships tm
            WHERE tm.tenant_id = ? AND tm.user_id = u.id
          )
          OR EXISTS (
            SELECT 1
            FROM memberships m
            WHERE m.tenant_id = ? AND m.user_id = u.id
          )
          OR EXISTS (
            SELECT 1
            FROM tenants t
            WHERE t.id = ? AND t.created_by = u.id
          )
        )
      LIMIT 1
    `).get(
      assignedId,
      req.tenantId,
      req.tenantId,
      req.tenantId
    );

    if (!member) {
      const err = new Error(
        "Los usuarios asignados deben estar activos y pertenecer al workspace."
      );
      err.status = 400;
      err.code = "invalid_assignees";
      throw err;
    }

    // Consulta los permisos del asignado, sin darle privilegios de admin.
    const recipientReq = {
      tenantId: req.tenantId,
      user: { id: assignedId },
      auth: { sub: assignedId },
    };

    const recipientCanAccess = await canAccessContactLinks(
      recipientReq,
      activity.contact_id,
      activity.deal_id
    );

    if (!recipientCanAccess) {
      const err = new Error(
        "Comparte primero el contacto con todos los usuarios asignados."
      );
      err.status = 400;
      err.code = "assignee_without_contact_access";
      throw err;
    }
  }
}
/** GET /activities */
router.get(
  "/activities",
  wrap(async (req, res) => {
    if (!resolveUserId(req) || !req.tenantId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(requestedLimit, 200))
      : 100;

    const filter = await activityReadFilter(req);
    const clauses = [filter.sql];
    const params = [...filter.params];

    for (const field of [
      "deal_id",
      "contact_id",
      "account_id",
      "lead_id",
      "status",
    ]) {
      const value = coerceStr(req.query[field]);

      if (value) {
        clauses.push(`a.${field} = ?`);
        params.push(value);
      }
    }

    if (
      req.query.remind_after !== undefined &&
      req.query.remind_after !== ""
    ) {
      const value = Number(req.query.remind_after);

      if (!Number.isFinite(value)) {
        return res.status(400).json({ error: "invalid_remind_after" });
      }

      clauses.push("a.remind_at_ms > ?");
      params.push(value);
    }

    const rows = await db.prepare(`
      ${ACTIVITY_SELECT}
      WHERE ${clauses.join(" AND ")}
      ORDER BY a.updated_at DESC, a.id ASC
      LIMIT ?
    `).all(...params, limit);

    res.setHeader("Cache-Control", "no-store");
    return res.json(rows);
  })
);

/** GET /activities/:id */
router.get(
  "/activities/:id",
  wrap(async (req, res) => {
    if (!resolveUserId(req) || !req.tenantId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const filter = await activityReadFilter(req);

    const row = await db.prepare(`
      ${ACTIVITY_SELECT}
      WHERE a.id = ?
        AND ${filter.sql}
      LIMIT 1
    `).get(req.params.id, ...filter.params);

    if (!row) {
      return res.status(404).json({ error: "not_found" });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.json(row);
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

    await validateActivityAccess(req, {
  contact_id,
  deal_id,
  assigned_to: norm.assigned_to,
  assigned_to_2: norm.assigned_to_2,
});

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
    const readFilter = await activityReadFilter(req);

    const found = await db.prepare(`
      SELECT a.*
      FROM activities a
      WHERE a.id = ?
        AND ${readFilter.sql}
      LIMIT 1
    `).get(req.params.id, ...readFilter.params);

    if (!found) {
      return res.status(404).json({ error: "not_found" });
    }

    const body = req.body || {};
    const hasProp = (name) =>
      Object.prototype.hasOwnProperty.call(body, name);

    const notifyAssignees =
      body.notify_assignees === true ||
      body.notify_assignees === "true" ||
      body.notify_assignees === 1 ||
      body.notify_assignees === "1";

    const beforeNorm = normalizeAssignees(
      found.assigned_to ?? null,
      found.assigned_to_2 ?? null
    );

    const final = {
      type: found.type || "task",
      title: found.title || "Sin título",
      status: VALID_STATUS.has(found.status)
        ? found.status
        : "open",
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
      const value = coerceStr(body.type);
      if (value) final.type = value;
    }

    if (hasProp("title")) {
      const value = coerceStr(body.title);
      if (value) final.title = value;
    }

    if (hasProp("status")) {
      const value = coerceStr(body.status);
      if (value && VALID_STATUS.has(value)) {
        final.status = value;
      }
    }

    if (hasProp("notes")) {
      final.notes = coerceStr(body.notes);
    }

    for (const field of [
      "account_id",
      "contact_id",
      "lead_id",
      "deal_id",
      "assigned_to",
      "assigned_to_2",
    ]) {
      if (hasProp(field)) {
        final[field] = coerceStr(body[field]) || null;
      }
    }

    // Mantener los vínculos que determinan la privacidad.
    // Una actividad sin vínculo sí puede recibir uno.
    for (const field of ["contact_id", "deal_id"]) {
      const previous = found[field] || null;
      const next = final[field] || null;

      if (previous && previous !== next) {
        return res.status(400).json({
          error: "activity_privacy_link_locked",
          message:
            "No puedes quitar ni cambiar el contacto o la oportunidad " +
            "de esta actividad porque determinan su privacidad.",
        });
      }
    }

    const finalNorm = normalizeAssignees(
      final.assigned_to,
      final.assigned_to_2
    );

    final.assigned_to = finalNorm.assigned_to;
    final.assigned_to_2 = finalNorm.assigned_to_2;

    if (hasProp("due_date")) {
      final.due_date = coerceNum(body.due_date);
    }

    if (hasProp("remind_at_ms")) {
      final.remind_at_ms = coerceNum(body.remind_at_ms);
    }

    const checkFk = async (table, value, field) => {
      if (!value) return;

      const exists = await db.prepare(`
        SELECT 1
        FROM ${table}
        WHERE id = ?
          AND tenant_id = ?
        LIMIT 1
      `).get(value, req.tenantId);

      if (!exists) {
        const error = new Error(`invalid_${field}`);
        error.status = 400;
        throw error;
      }
    };

    await checkFk("accounts", final.account_id, "account_id");
    await checkFk("contacts", final.contact_id, "contact_id");
    await checkFk("leads", final.lead_id, "lead_id");
    await checkFk("deals", final.deal_id, "deal_id");

    // Comprueba acceso del actor y de los usuarios asignados.
    await validateActivityAccess(req, final);

    const updatedAt = Math.max(
      Date.now(),
      Number(found.updated_at) + 1
    );

    // Volver a comprobar visibilidad al escribir.
    // updated_at evita sobrescribir otra edición concurrente.
    const writeFilter = await activityReadFilter(req);

    const info = await db.prepare(`
      UPDATE activities AS a
      SET
        type = ?,
        title = ?,
        due_date = ?,
        remind_at_ms = ?,
        status = ?,
        notes = ?,
        account_id = ?,
        contact_id = ?,
        lead_id = ?,
        deal_id = ?,
        assigned_to = ?,
        assigned_to_2 = ?,
        updated_at = ?
      WHERE a.id = ?
        AND a.updated_at = ?
        AND ${writeFilter.sql}
    `).run(
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
      updatedAt,
      req.params.id,
      found.updated_at,
      ...writeFilter.params
    );

    if (info.changes === 0) {
      const currentFilter = await activityReadFilter(req);

      const current = await db.prepare(`
        SELECT 1
        FROM activities a
        WHERE a.id = ?
          AND ${currentFilter.sql}
        LIMIT 1
      `).get(req.params.id, ...currentFilter.params);

      if (!current) {
        return res.status(404).json({ error: "not_found" });
      }

      return res.status(409).json({
        error: "activity_changed",
        message:
          "La actividad cambió mientras la editabas. " +
          "Recarga los datos antes de volver a guardar.",
      });
    }

    const responseFilter = await activityReadFilter(req);

    const updated = await db.prepare(`
      SELECT
        a.*,
        cu.name AS created_by_name,
        cu.email AS created_by_email,
        au.name AS assigned_to_name,
        au.email AS assigned_to_email,
        au2.name AS assigned_to_2_name,
        au2.email AS assigned_to_2_email,
        ct.name AS contact_name
      FROM activities a
      LEFT JOIN users cu ON cu.id = a.created_by
      LEFT JOIN users au ON au.id = a.assigned_to
      LEFT JOIN users au2 ON au2.id = a.assigned_to_2
      LEFT JOIN contacts ct
        ON ct.id = a.contact_id
        AND ct.tenant_id = a.tenant_id
      WHERE a.id = ?
        AND ${responseFilter.sql}
      LIMIT 1
    `).get(req.params.id, ...responseFilter.params);

    // Nunca devolver una copia anterior sin comprobar permisos.
    if (!updated) {
      return res.status(404).json({ error: "not_found" });
    }

    const afterNorm = normalizeAssignees(
      updated.assigned_to ?? null,
      updated.assigned_to_2 ?? null
    );
    const assignmentChanged = !setsEqual(
      assigneeSet(beforeNorm),
      assigneeSet(afterNorm)
    );

    const normalizeTimestamp = (value) => {
      if (value == null || value === "") return null;

      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    };

    const dateChanged =
      normalizeTimestamp(found.due_date) !==
        normalizeTimestamp(updated.due_date) ||
      normalizeTimestamp(found.remind_at_ms) !==
        normalizeTimestamp(updated.remind_at_ms);

    // Reprogramar siempre avisa a los asignados actuales.
    // Reasignar sin cambiar fechas conserva la confirmación existente.
    if (
      (dateChanged || (assignmentChanged && notifyAssignees)) &&
      typeof notifyActivityReassigned === "function"
    ) {
      notifyActivityReassigned({
        tenant_id: req.tenantId,
        activity: updated,
        before: {
          ...beforeNorm,
          due_date: found.due_date,
          remind_at_ms: found.remind_at_ms,
        },
        after: {
          ...afterNorm,
          due_date: updated.due_date,
          remind_at_ms: updated.remind_at_ms,
        },
        changed_by: resolveUserId(req),
      }).catch((err) => {
        console.error(
          "Error enviando correo de actualización:",
          err.message
        );
      });
    }
    return res.json(updated);
  })
);
router.delete(
  "/activities/:id",
  canDelete("activities"),
  wrap(async (req, res) => {
    const filter = await activityReadFilter(req);

    const info = await db.prepare(`
      DELETE FROM activities AS a
      WHERE a.id = ?
        AND ${filter.sql}
    `).run(req.params.id, ...filter.params);

    if (info.changes === 0) {
      return res.status(404).json({ error: "not_found" });
    }

    return res.json({ ok: true });
  })
);

module.exports = router;

