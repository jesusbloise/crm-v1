// server/routes/activities.js
const { Router } = require("express");
const crypto = require("crypto");
const db = require("../db/connection");
const wrap = require("../lib/wrap");

const {
  resolveUserId,
  canWrite,
  canDelete,
  getUserRole,
} = require("../lib/authorize");

const {
  linkedContactVisibilityFilter,
  canAccessContactLinks,
} = require("../lib/contactAccess");

const {
  notifyActivityCreated,
  notifyActivityReassigned,
} = require("../lib/activityNotifications");

const router = Router();

const coerceStr = (value) =>
  typeof value === "string" ? value.trim() : null;

const coerceNum = (value) =>
  value === null || value === undefined || value === ""
    ? null
    : Number(value);

const VALID_STATUS = new Set([
  "open",
  "in_progress",
  "done",
  "canceled",
]);

async function resolveRow(maybe) {
  const value = await Promise.resolve(maybe);

  if (!value) return null;
  if (Array.isArray(value.rows)) return value.rows[0] ?? null;

  if (value.row && typeof value.row === "object") {
    return value.row;
  }

  return value;
}

function normalizeAssignees(assigned_to, assigned_to_2) {
  let first = assigned_to
    ? String(assigned_to).trim()
    : null;

  let second = assigned_to_2
    ? String(assigned_to_2).trim()
    : null;

  if (first === "") first = null;
  if (second === "") second = null;

  if (first && second && first === second) {
    second = null;
  }

  if (!first && second) {
    first = second;
    second = null;
  }

  return {
    assigned_to: first,
    assigned_to_2: second,
  };
}

function assigneeSet(activity) {
  const result = new Set();

  if (activity?.assigned_to) {
    result.add(String(activity.assigned_to));
  }

  if (activity?.assigned_to_2) {
    result.add(String(activity.assigned_to_2));
  }

  return result;
}

function setsEqual(first, second) {
  if (first.size !== second.size) return false;

  for (const value of first) {
    if (!second.has(value)) return false;
  }

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
 * Comprueba los vínculos privados y el acceso de los asignados.
 * No comparte contactos automáticamente.
 */
async function validateActivityAccess(req, activity) {
  const userId = resolveUserId(req);

  if (!userId || !req.tenantId) {
    const error = new Error("unauthorized");
    error.status = 401;
    error.code = "unauthorized";
    throw error;
  }

  const canAccess = await canAccessContactLinks(
    req,
    activity.contact_id,
    activity.deal_id
  );

  if (!canAccess) {
    const error = new Error(
      "Contacto u oportunidad inexistente o sin acceso."
    );
    error.status = 400;
    error.code = "invalid_contact_links";
    throw error;
  }

  const assignedIds = [
    ...new Set(
      [
        activity.assigned_to,
        activity.assigned_to_2,
      ].filter(Boolean)
    ),
  ];

  for (const assignedId of assignedIds) {
    const member = await db.prepare(`
      SELECT u.id
      FROM users u
      WHERE u.id = ?
        AND COALESCE(u.active, TRUE) = TRUE
        AND (
          EXISTS (
            SELECT 1
            FROM tenant_memberships tm
            WHERE tm.tenant_id = ?
              AND tm.user_id = u.id
          )
          OR EXISTS (
            SELECT 1
            FROM memberships m
            WHERE m.tenant_id = ?
              AND m.user_id = u.id
          )
          OR EXISTS (
            SELECT 1
            FROM tenants t
            WHERE t.id = ?
              AND t.created_by = u.id
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
      const error = new Error(
        "Los usuarios asignados deben estar activos y pertenecer al workspace."
      );
      error.status = 400;
      error.code = "invalid_assignees";
      throw error;
    }

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
      const error = new Error(
        "Comparte primero el contacto con todos los usuarios asignados."
      );
      error.status = 400;
      error.code = "assignee_without_contact_access";
      throw error;
    }
  }
}

/**
 * Búsqueda literal compartida por listado y estadísticas.
 * Los SELECT que la usan deben incluir los JOIN de ACTIVITY_SELECT.
 */
function appendActivitySearch(req, clauses, params) {
  const search = coerceStr(req.query.q);

  if (!search) return;

  if (search.length > 200) {
    const error = new Error("search_too_long");
    error.status = 400;
    error.code = "search_too_long";
    throw error;
  }

  clauses.push(`
    STRPOS(
      LOWER(CONCAT_WS(
        ' ',
        a.title,
        a.type,
        cu.name,
        cu.email,
        au.name,
        au.email,
        au2.name,
        au2.email,
        ct.name
      )),
      LOWER(?)
    ) > 0
  `);

  params.push(search);
}

/** GET /activities */
router.get(
  "/activities",
  wrap(async (req, res) => {
    if (!resolveUserId(req) || !req.tenantId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const paginated = req.query.paginated === "1";

    const readInteger = (name, fallback, min, max) => {
      const raw = req.query[name];

      if (raw === undefined) return fallback;

      if (
        typeof raw !== "string" ||
        !/^\d+$/.test(raw) ||
        !Number.isSafeInteger(Number(raw)) ||
        Number(raw) < min ||
        Number(raw) > max
      ) {
        const error = new Error(
          `Parámetro inválido: ${name}`
        );
        error.status = 400;
        error.code = `invalid_${name}`;
        throw error;
      }

      return Number(raw);
    };

    const limit = readInteger("limit", 100, 1, 200);

    const offset = readInteger(
      "offset",
      0,
      0,
      Number.MAX_SAFE_INTEGER
    );

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

      if (!value) continue;

      if (
        field === "status" &&
        !VALID_STATUS.has(value)
      ) {
        return res.status(400).json({
          error: "invalid_status",
        });
      }

      clauses.push(`a.${field} = ?`);
      params.push(value);
    }

    const personId = coerceStr(req.query.person_id);

    if (req.query.scope !== undefined) {
      const scope = req.query.scope;

      if (scope !== "team" && scope !== "mine") {
        return res.status(400).json({
          error: "invalid_scope",
        });
      }

      const userId = resolveUserId(req);

      const role = String(
        (await getUserRole(userId)) || ""
      ).toLowerCase();

      const canViewTeam =
        role === "admin" || role === "owner";

      if (scope === "team" && !canViewTeam) {
        return res.status(403).json({
          error: "forbidden",
        });
      }

      if (
        scope === "mine" &&
        personId &&
        personId !== userId
      ) {
        return res.status(400).json({
          error: "incompatible_person_scope",
        });
      }

      const assignedPerson =
        scope === "mine" ? userId : personId;

      if (assignedPerson) {
        clauses.push(
          "(a.assigned_to = ? OR a.assigned_to_2 = ?)"
        );
        params.push(assignedPerson, assignedPerson);
      }
    } else if (personId) {
      // Compatibilidad con consultas anteriores sin scope.
      clauses.push(`
        (
          a.created_by = ?
          OR a.assigned_to = ?
          OR a.assigned_to_2 = ?
        )
      `);
      params.push(personId, personId, personId);
    }

    appendActivitySearch(req, clauses, params);

    const readTimestamp = (name) => {
      const raw = req.query[name];

      if (raw === undefined || raw === "") {
        return null;
      }

      if (
        typeof raw !== "string" ||
        !/^-?\d+$/.test(raw) ||
        !Number.isSafeInteger(Number(raw))
      ) {
        const error = new Error(
          `Fecha inválida: ${name}`
        );
        error.status = 400;
        error.code = `invalid_${name}`;
        throw error;
      }

      return Number(raw);
    };

    const remindAfter = readTimestamp("remind_after");

    if (remindAfter !== null) {
      clauses.push("a.remind_at_ms > ?");
      params.push(remindAfter);
    }

    const dueFrom = readTimestamp("due_from");
    const dueBefore = readTimestamp("due_before");

    if (
      dueFrom !== null &&
      dueBefore !== null &&
      dueFrom >= dueBefore
    ) {
      return res.status(400).json({
        error: "invalid_date_range",
      });
    }

    if (dueFrom !== null) {
      clauses.push("a.due_date >= ?");
      params.push(dueFrom);
    }

    if (dueBefore !== null) {
      clauses.push("a.due_date < ?");
      params.push(dueBefore);
    }

    if (req.query.undated === "1") {
      if (dueFrom !== null || dueBefore !== null) {
        return res.status(400).json({
          error: "incompatible_date_filters",
        });
      }

      clauses.push("a.due_date IS NULL");
    }

    if (req.query.pending === "1") {
      clauses.push(
        "a.status IN ('open', 'in_progress')"
      );
    }

    const order =
      req.query.sort === "due"
        ? "a.due_date ASC NULLS LAST, a.id ASC"
        : "a.updated_at DESC, a.id ASC";

    const where = clauses.join(" AND ");

    if (paginated) {
      const result = await db.prepare(`
        WITH filtered AS (
          ${ACTIVITY_SELECT}
          WHERE ${where}
        ),
        page AS (
          SELECT a.*
          FROM filtered a
          ORDER BY ${order}
          LIMIT ? OFFSET ?
        )
        SELECT
          (SELECT COUNT(*) FROM filtered) AS total,
          COALESCE(
            (
              SELECT json_agg(ordered_page)
              FROM (
                SELECT a.*
                FROM page a
                ORDER BY ${order}
              ) ordered_page
            ),
            '[]'::json
          ) AS items
      `).get(...params, limit, offset);

      const total = Number(result.total);
      const items = result.items;

      res.setHeader("Cache-Control", "no-store");

      return res.json({
        items,
        total,
        limit,
        offset,
        has_more: offset + items.length < total,
      });
    }

    const rows = await db.prepare(`
      ${ACTIVITY_SELECT}
      WHERE ${where}
      ORDER BY ${order}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.setHeader("Cache-Control", "no-store");
    return res.json(rows);
  })
);

/** GET /activities/stats */
router.get(
  "/activities/stats",
  wrap(async (req, res) => {
    const userId = resolveUserId(req);

    if (!userId || !req.tenantId) {
      return res.status(401).json({
        error: "unauthorized",
      });
    }

    const role = String(
      (await getUserRole(userId)) || ""
    ).toLowerCase();

    const canViewTeam =
      role === "admin" || role === "owner";

    const scope =
      req.query.scope === undefined
        ? canViewTeam
          ? "team"
          : "mine"
        : req.query.scope;

    if (scope !== "team" && scope !== "mine") {
      return res.status(400).json({
        error: "invalid_scope",
      });
    }

    if (scope === "team" && !canViewTeam) {
      return res.status(403).json({
        error: "forbidden",
      });
    }

    const readTimestamp = (name) => {
      const raw = req.query[name];

      if (raw === undefined) return null;

      if (
        typeof raw !== "string" ||
        !/^-?\d+$/.test(raw) ||
        !Number.isSafeInteger(Number(raw))
      ) {
        const error = new Error(
          `Fecha inválida: ${name}`
        );
        error.status = 400;
        throw error;
      }

      return Number(raw);
    };

    const dueFrom = readTimestamp("due_from");
    const dueBefore = readTimestamp("due_before");

    if (
      dueFrom !== null &&
      dueBefore !== null &&
      dueFrom >= dueBefore
    ) {
      return res.status(400).json({
        error: "invalid_date_range",
      });
    }

    const personId = coerceStr(req.query.person_id);

    if (
      personId &&
      !canViewTeam &&
      personId !== userId
    ) {
      return res.status(403).json({
        error: "forbidden",
      });
    }

    const access = await activityReadFilter(req);

    const clauses = [
      "a.tenant_id = ?",
      access.sql,
    ];

    const params = [
      req.tenantId,
      ...access.params,
    ];

    appendActivitySearch(req, clauses, params);

    const assignedPerson =
      scope === "mine" ? userId : personId;

    if (assignedPerson) {
      clauses.push(
        "(a.assigned_to = ? OR a.assigned_to_2 = ?)"
      );
      params.push(assignedPerson, assignedPerson);
    }

    if (dueFrom !== null) {
      clauses.push("a.due_date >= ?");
      params.push(dueFrom);
    }

    if (dueBefore !== null) {
      clauses.push("a.due_date < ?");
      params.push(dueBefore);
    }

    if (req.query.undated === "1") {
      if (dueFrom !== null || dueBefore !== null) {
        return res.status(400).json({
          error: "incompatible_date_filters",
        });
      }

      clauses.push("a.due_date IS NULL");
    }

    if (req.query.pending === "1") {
      clauses.push(
        "a.status IN ('open', 'in_progress')"
      );
    }

    const now = Date.now();

    const result = await db.prepare(`
      WITH filtered AS (
        ${ACTIVITY_SELECT}
        WHERE ${clauses.join(" AND ")}
      ),
      summary AS (
        SELECT
          COUNT(*)::INTEGER AS total,
          COUNT(*) FILTER (
            WHERE status = 'open'
          )::INTEGER AS open,
          COUNT(*) FILTER (
            WHERE status = 'in_progress'
          )::INTEGER AS in_progress,
          COUNT(*) FILTER (
            WHERE status = 'done'
          )::INTEGER AS done,
          COUNT(*) FILTER (
            WHERE status = 'canceled'
          )::INTEGER AS canceled,
          COUNT(*) FILTER (
            WHERE status IN ('open', 'in_progress')
              AND due_date < ?
          )::INTEGER AS overdue,
          COUNT(*) FILTER (
            WHERE status IN ('open', 'in_progress')
              AND due_date IS NULL
          )::INTEGER AS undated,
          COUNT(*) FILTER (
            WHERE status = 'done'
              AND completed_at IS NULL
          )::INTEGER AS done_without_completion_date
        FROM filtered
      ),
      assignments AS (
        SELECT
          f.id,
          f.status,
          f.assigned_to AS user_id
        FROM filtered f
        WHERE f.assigned_to IS NOT NULL
          AND f.assigned_to <> ''

        UNION

        SELECT
          f.id,
          f.status,
          f.assigned_to_2 AS user_id
        FROM filtered f
        WHERE f.assigned_to_2 IS NOT NULL
          AND f.assigned_to_2 <> ''
      ),
      per_user AS (
        SELECT
          x.user_id,
          COALESCE(
            NULLIF(u.name, ''),
            NULLIF(u.email, ''),
            'Usuario'
          ) AS name,
          COUNT(*)::INTEGER AS total,
          COUNT(*) FILTER (
            WHERE x.status = 'open'
          )::INTEGER AS open,
          COUNT(*) FILTER (
            WHERE x.status = 'in_progress'
          )::INTEGER AS in_progress,
          COUNT(*) FILTER (
            WHERE x.status = 'done'
          )::INTEGER AS done,
          COUNT(*) FILTER (
            WHERE x.status = 'canceled'
          )::INTEGER AS canceled
        FROM assignments x
        LEFT JOIN users u ON u.id = x.user_id
        WHERE (? = 'team' OR x.user_id = ?)
        GROUP BY x.user_id, u.name, u.email
      )
      SELECT
        (
          SELECT row_to_json(s)
          FROM summary s
        ) AS summary,
        COALESCE(
          (
            SELECT json_agg(
              p ORDER BY p.total DESC, p.name, p.user_id
            )
            FROM per_user p
          ),
          '[]'::json
        ) AS users,
        (
          SELECT COUNT(*)::INTEGER
          FROM filtered
          WHERE NULLIF(assigned_to, '') IS NULL
            AND NULLIF(assigned_to_2, '') IS NULL
        ) AS unassigned
    `).get(...params, now, scope, userId);

    res.setHeader("Cache-Control", "no-store");

    return res.json({
      scope,
      can_view_team: canViewTeam,
      date_basis: "due_date",
      generated_at: now,
      summary: result.summary,
      users: result.users,
      unassigned: result.unassigned,
    });
  })
);

/** GET /activities/trend */
router.get(
  "/activities/trend",
  wrap(async (req, res) => {
    const userId = resolveUserId(req);

    if (!userId || !req.tenantId) {
      return res.status(401).json({
        error: "unauthorized",
      });
    }

    const role = String(
      (await getUserRole(userId)) || ""
    ).toLowerCase();

    const canViewTeam =
      role === "admin" || role === "owner";

    const scope =
      req.query.scope ??
      (canViewTeam ? "team" : "mine");

    if (scope !== "team" && scope !== "mine") {
      return res.status(400).json({
        error: "invalid_scope",
      });
    }

    if (scope === "team" && !canViewTeam) {
      return res.status(403).json({
        error: "forbidden",
      });
    }

    const parseTimestamp = (raw) => {
      if (
        typeof raw !== "string" ||
        !/^-?\d+$/.test(raw) ||
        !Number.isSafeInteger(Number(raw))
      ) {
        return null;
      }

      return Number(raw);
    };

    const from = parseTimestamp(req.query.from);
    const before = parseTimestamp(req.query.before);

    if (
      from === null ||
      before === null ||
      from < 0 ||
      from >= before ||
      before - from > 367 * 86400000
    ) {
      return res.status(400).json({
        error: "invalid_date_range",
      });
    }

    const timezone =
      req.query.timezone ?? "America/Santiago";

    if (
      typeof timezone !== "string" ||
      timezone.length > 100
    ) {
      return res.status(400).json({
        error: "invalid_timezone",
      });
    }

    const zone = await db.prepare(`
      SELECT name
      FROM pg_timezone_names
      WHERE name = ?
      LIMIT 1
    `).get(timezone);

    if (!zone) {
      return res.status(400).json({
        error: "invalid_timezone",
      });
    }

    const personId = coerceStr(req.query.person_id);

    if (
      personId &&
      !canViewTeam &&
      personId !== userId
    ) {
      return res.status(403).json({
        error: "forbidden",
      });
    }

    const access = await activityReadFilter(req);

    const clauses = [
      "a.tenant_id = ?",
      access.sql,
    ];

    const params = [
      req.tenantId,
      ...access.params,
    ];

    appendActivitySearch(req, clauses, params);

    const assignedPerson =
      scope === "mine" ? userId : personId;

    if (assignedPerson) {
      clauses.push(
        "(a.assigned_to = ? OR a.assigned_to_2 = ?)"
      );
      params.push(assignedPerson, assignedPerson);
    }

    const result = await db.prepare(`
      WITH config AS (
        SELECT
          ?::BIGINT AS start_ms,
          ?::BIGINT AS end_ms,
          ?::TEXT AS tz
      ),
      visible AS (
        ${ACTIVITY_SELECT}
        WHERE ${clauses.join(" AND ")}
      ),
      days AS (
        SELECT series.day::DATE AS day
        FROM config c
        CROSS JOIN LATERAL generate_series(
          (
            to_timestamp(c.start_ms / 1000.0)
            AT TIME ZONE c.tz
          )::DATE::TIMESTAMP,
          (
            to_timestamp((c.end_ms - 1) / 1000.0)
            AT TIME ZONE c.tz
          )::DATE::TIMESTAMP,
          INTERVAL '1 day'
        ) AS series(day)
      ),
      scheduled AS (
        SELECT
          (
            to_timestamp(a.due_date / 1000.0)
            AT TIME ZONE c.tz
          )::DATE AS day,
          COUNT(*)::INTEGER AS count
        FROM visible a
        CROSS JOIN config c
        WHERE a.due_date >= c.start_ms
          AND a.due_date < c.end_ms
          AND a.status <> 'canceled'
        GROUP BY 1
      ),
      completed AS (
        SELECT
          (
            to_timestamp(a.completed_at / 1000.0)
            AT TIME ZONE c.tz
          )::DATE AS day,
          COUNT(*)::INTEGER AS count
        FROM visible a
        CROSS JOIN config c
        WHERE a.status = 'done'
          AND a.completed_at >= c.start_ms
          AND a.completed_at < c.end_ms
        GROUP BY 1
      )
      SELECT
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'date', to_char(d.day, 'YYYY-MM-DD'),
                'scheduled', COALESCE(s.count, 0),
                'completed', COALESCE(f.count, 0)
              )
              ORDER BY d.day
            )
            FROM days d
            LEFT JOIN scheduled s ON s.day = d.day
            LEFT JOIN completed f ON f.day = d.day
          ),
          '[]'::json
        ) AS days,
        (
          SELECT COUNT(*)::INTEGER
          FROM visible
          WHERE status = 'done'
            AND completed_at IS NULL
        ) AS undated_completions
    `).get(from, before, timezone, ...params);

    res.setHeader("Cache-Control", "no-store");

    return res.json({
      scope,
      from,
      before,
      timezone,
      days: result.days,
      undated_completions: result.undated_completions,
    });
  })
);

/** GET /activities/:id */
router.get(
  "/activities/:id",
  wrap(async (req, res) => {
    if (!resolveUserId(req) || !req.tenantId) {
      return res.status(401).json({
        error: "unauthorized",
      });
    }

    const filter = await activityReadFilter(req);

    const row = await db.prepare(`
      ${ACTIVITY_SELECT}
      WHERE a.id = ?
        AND ${filter.sql}
      LIMIT 1
    `).get(req.params.id, ...filter.params);

    if (!row) {
      return res.status(404).json({
        error: "not_found",
      });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.json(row);
  })
);

/** POST /activities */
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
      return res.status(400).json({
        error: "type_title_required",
      });
    }

    if (!VALID_STATUS.has(status)) {
      status = "open";
    }

    const id = crypto.randomUUID();

    const checkFk = async (table, value, field) => {
      if (!value) return;

      const exists = await resolveRow(
        db.prepare(`
          SELECT 1
          FROM ${table}
          WHERE id = ?
            AND tenant_id = ?
          LIMIT 1
        `).get(value, req.tenantId)
      );

      if (!exists) {
        throw new Error(`invalid_${field}`);
      }
    };

    try {
      await checkFk("accounts", account_id, "account_id");
      await checkFk("contacts", contact_id, "contact_id");
      await checkFk("leads", lead_id, "lead_id");
      await checkFk("deals", deal_id, "deal_id");
    } catch (error) {
      return res.status(400).json({
        error: error.message,
      });
    }

    const userId = resolveUserId(req);
    const now = Date.now();

    const norm = normalizeAssignees(
      assigned_to,
      assigned_to_2
    );

    await validateActivityAccess(req, {
      contact_id,
      deal_id,
      assigned_to: norm.assigned_to,
      assigned_to_2: norm.assigned_to_2,
    });

    await db.prepare(`
      INSERT INTO activities (
        id,
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
        tenant_id,
        created_by,
        created_at,
        updated_at,
        assigned_to,
        assigned_to_2
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
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

    notifyActivityCreated(created).catch((error) => {
      console.error(
        "Error enviando emails de actividad:",
        error
      );
    });

    return res.status(201).json(created);
  })
);

/** PATCH /activities/:id/status */
router.patch(
  "/activities/:id/status",
  wrap(async (req, res) => {
    if (!resolveUserId(req) || !req.tenantId) {
      return res.status(401).json({
        error: "unauthorized",
      });
    }

    const body = req.body || {};

    const allowedFields = new Set([
      "status",
      "expected_updated_at",
    ]);

    if (
      Object.keys(body).some(
        (key) => !allowedFields.has(key)
      )
    ) {
      return res.status(400).json({
        error: "invalid_status_fields",
        message:
          "Esta operación solo permite cambiar el estado.",
      });
    }

    const status = coerceStr(body.status);
    const expected = body.expected_updated_at;

    if (!VALID_STATUS.has(status)) {
      return res.status(400).json({
        error: "invalid_status",
      });
    }

    if (
      !["string", "number"].includes(typeof expected) ||
      String(expected).trim() === "" ||
      !Number.isSafeInteger(Number(expected)) ||
      Number(expected) < 0
    ) {
      return res.status(400).json({
        error: "expected_updated_at_required",
        message:
          "Actualiza la actividad antes de cambiar su estado.",
      });
    }

    const filter = await activityReadFilter(req);

    const updatedAt = Math.max(
      Date.now(),
      Number(expected) + 1
    );

    const result = await db.prepare(`
      UPDATE activities AS a
      SET status = ?, updated_at = ?
      WHERE a.id = ?
        AND a.updated_at = ?
        AND ${filter.sql}
      RETURNING a.id
    `).get(
      status,
      updatedAt,
      req.params.id,
      Number(expected),
      ...filter.params
    );

    if (!result) {
      const currentFilter = await activityReadFilter(req);

      const current = await db.prepare(`
        SELECT a.id
        FROM activities a
        WHERE a.id = ?
          AND ${currentFilter.sql}
        LIMIT 1
      `).get(req.params.id, ...currentFilter.params);

      return res.status(current ? 409 : 404).json({
        error: current
          ? "activity_changed"
          : "not_found",
        message: current
          ? "La actividad cambió. Actualiza antes de volver a intentarlo."
          : "Actividad inexistente o sin acceso.",
      });
    }

    const responseFilter = await activityReadFilter(req);

    const updated = await db.prepare(`
      ${ACTIVITY_SELECT}
      WHERE a.id = ?
        AND ${responseFilter.sql}
      LIMIT 1
    `).get(req.params.id, ...responseFilter.params);

    if (!updated) {
      return res.status(404).json({
        error: "not_found",
      });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.json(updated);
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
      return res.status(404).json({
        error: "not_found",
      });
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

    // Los vínculos existentes determinan la privacidad.
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

    await checkFk(
      "accounts",
      final.account_id,
      "account_id"
    );

    await checkFk(
      "contacts",
      final.contact_id,
      "contact_id"
    );

    await checkFk(
      "leads",
      final.lead_id,
      "lead_id"
    );

    await checkFk(
      "deals",
      final.deal_id,
      "deal_id"
    );

    await validateActivityAccess(req, final);

    const updatedAt = Math.max(
      Date.now(),
      Number(found.updated_at) + 1
    );

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
        return res.status(404).json({
          error: "not_found",
        });
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
      ${ACTIVITY_SELECT}
      WHERE a.id = ?
        AND ${responseFilter.sql}
      LIMIT 1
    `).get(req.params.id, ...responseFilter.params);

    if (!updated) {
      return res.status(404).json({
        error: "not_found",
      });
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

      return Number.isFinite(number)
        ? number
        : null;
    };

    const dateChanged =
      normalizeTimestamp(found.due_date) !==
        normalizeTimestamp(updated.due_date) ||
      normalizeTimestamp(found.remind_at_ms) !==
        normalizeTimestamp(updated.remind_at_ms);

    if (
      (
        dateChanged ||
        (assignmentChanged && notifyAssignees)
      ) &&
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
      }).catch((error) => {
        console.error(
          "Error enviando correo de actualización:",
          error.message
        );
      });
    }

    return res.json(updated);
  })
);

/** DELETE /activities/:id */
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
      return res.status(404).json({
        error: "not_found",
      });
    }

    return res.json({ ok: true });
  })
);

module.exports = router;