const { Router } = require("express");
const db = require("../db/connection");
const wrap = require("../lib/wrap");
const {
  canRead,
  canWrite,
  canDelete,
  requireRole,
  resolveUserId,
} = require("../lib/authorize");

const router = Router();

const VALID_STATUS = new Set(["assigned", "done", "cancelled"]);

function coerceStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

function makeAssignmentId() {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `wa_${Date.now().toString(36)}_${rnd}`;
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function isValidTime(value) {
  if (!value) return true;
  return /^\d{2}:\d{2}$/.test(String(value));
}

function parseHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n <= 0 || n > 24) return null;
  return Math.round(n * 100) / 100;
}

async function getWorkspaceUser(userId, tenantId) {
  if (!userId || !tenantId) return null;

  return db
    .prepare(
      `
      SELECT
        u.id,
        u.name,
        u.email
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      WHERE m.tenant_id = ?
        AND u.id = ?
      LIMIT 1
    `
    )
    .get(tenantId, userId);
}

async function getActiveProject(projectId, tenantId) {
  if (!projectId || !tenantId) return null;

  return db
    .prepare(
      `
      SELECT id, name
      FROM work_projects
      WHERE id = ?
        AND tenant_id = ?
        AND is_active = 1
      LIMIT 1
    `
    )
    .get(projectId, tenantId);
}

async function getActiveItem(itemId, tenantId) {
  if (!itemId || !tenantId) return null;

  return db
    .prepare(
      `
      SELECT id, name
      FROM work_items
      WHERE id = ?
        AND tenant_id = ?
        AND is_active = 1
      LIMIT 1
    `
    )
    .get(itemId, tenantId);
}

router.get(
  "/work-assignments",
  canRead("work_assignments"),
  wrap(async (req, res) => {
    const {
      userId,
      projectId,
      itemId,
      from,
      to,
      status,
    } = req.query || {};

    const clauses = ["wa.tenant_id = ?"];
    const params = [req.tenantId];

    if (userId) {
      clauses.push("wa.assigned_user_id = ?");
      params.push(String(userId));
    }

    if (projectId) {
      clauses.push("wa.project_id = ?");
      params.push(String(projectId));
    }

    if (itemId) {
      clauses.push("wa.item_id = ?");
      params.push(String(itemId));
    }

    if (from) {
      clauses.push("wa.assignment_date >= ?");
      params.push(String(from));
    }

    if (to) {
      clauses.push("wa.assignment_date <= ?");
      params.push(String(to));
    }

    if (status && VALID_STATUS.has(String(status))) {
      clauses.push("wa.status = ?");
      params.push(String(status));
    }

    const rows = await db
      .prepare(
        `
        SELECT
          wa.*,
          u.name AS assigned_user_name,
          u.email AS assigned_user_email,
          cu.name AS created_by_name,
          cu.email AS created_by_email
        FROM work_assignments wa
        LEFT JOIN users u ON u.id = wa.assigned_user_id
        LEFT JOIN users cu ON cu.id = wa.created_by
        WHERE ${clauses.join(" AND ")}
        ORDER BY wa.assignment_date ASC, wa.start_time ASC, wa.created_at DESC
      `
      )
      .all(...params);

    const total_hours = rows.reduce((sum, row) => {
      return sum + Number(row.estimated_hours || 0);
    }, 0);

    res.json({
      rows,
      total: rows.length,
      total_hours,
    });
  })
);

router.get(
  "/work-assignments/mine",
  canRead("work_assignments"),
  wrap(async (req, res) => {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "unauthorized" });

    const rows = await db
      .prepare(
        `
        SELECT
          wa.*,
          u.name AS assigned_user_name,
          u.email AS assigned_user_email,
          cu.name AS created_by_name,
          cu.email AS created_by_email
        FROM work_assignments wa
        LEFT JOIN users u ON u.id = wa.assigned_user_id
        LEFT JOIN users cu ON cu.id = wa.created_by
        WHERE wa.tenant_id = ?
          AND wa.assigned_user_id = ?
        ORDER BY wa.assignment_date ASC, wa.start_time ASC, wa.created_at DESC
      `
      )
      .all(req.tenantId, userId);

    const total_hours = rows.reduce((sum, row) => {
      return sum + Number(row.estimated_hours || 0);
    }, 0);

    res.json({
      rows,
      total: rows.length,
      total_hours,
    });
  })
);

router.post(
  "/work-assignments",
  requireRole(["owner", "admin"]),
  wrap(async (req, res) => {
    const body = req.body || {};
    const assigned_user_id = coerceStr(body.assigned_user_id);
    const project_id = coerceStr(body.project_id);
    const item_id = coerceStr(body.item_id);
    const assignment_date = coerceStr(body.assignment_date);
    const start_time = coerceStr(body.start_time) || null;
    const end_time = coerceStr(body.end_time) || null;
    const estimated_hours = parseHours(body.estimated_hours);
    const description = coerceStr(body.description) || null;

    if (!assigned_user_id) {
      return res.status(400).json({ error: "assigned_user_required" });
    }

    if (!isValidDate(assignment_date)) {
      return res.status(400).json({ error: "invalid_assignment_date" });
    }

    if (!isValidTime(start_time) || !isValidTime(end_time)) {
      return res.status(400).json({ error: "invalid_time" });
    }

    if (estimated_hours === null) {
      return res.status(400).json({ error: "invalid_estimated_hours" });
    }

    const user = await getWorkspaceUser(assigned_user_id, req.tenantId);
    if (!user) {
      return res.status(400).json({ error: "invalid_assigned_user" });
    }

    const project = await getActiveProject(project_id, req.tenantId);
    if (!project) {
      return res.status(400).json({ error: "invalid_project_id" });
    }

    const item = await getActiveItem(item_id, req.tenantId);
    if (!item) {
      return res.status(400).json({ error: "invalid_item_id" });
    }

    const now = Date.now();
    const id = makeAssignmentId();
    const createdBy = resolveUserId(req);

    const row = await db
      .prepare(
        `
        INSERT INTO work_assignments (
          id,
          tenant_id,
          assigned_user_id,
          project_id,
          project_name,
          item_id,
          item_name,
          assignment_date,
          start_time,
          end_time,
          estimated_hours,
          description,
          status,
          created_by,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'assigned', ?, ?, ?)
        RETURNING *
      `
      )
      .get(
        id,
        req.tenantId,
        assigned_user_id,
        project.id,
        project.name,
        item.id,
        item.name,
        assignment_date,
        start_time,
        end_time,
        estimated_hours,
        description,
        createdBy,
        now,
        now
      );

    res.status(201).json(row);
  })
);

router.patch(
  "/work-assignments/:id",
  requireRole(["owner", "admin"]),
  wrap(async (req, res) => {
    const id = req.params.id;
    const body = req.body || {};

    const current = await db
      .prepare(
        `
        SELECT *
        FROM work_assignments
        WHERE id = ?
          AND tenant_id = ?
        LIMIT 1
      `
      )
      .get(id, req.tenantId);

    if (!current) {
      return res.status(404).json({ error: "not_found" });
    }

    const assignment_date =
      body.assignment_date !== undefined
        ? coerceStr(body.assignment_date)
        : current.assignment_date;

    const start_time =
      body.start_time !== undefined
        ? coerceStr(body.start_time) || null
        : current.start_time;

    const end_time =
      body.end_time !== undefined
        ? coerceStr(body.end_time) || null
        : current.end_time;

    const estimated_hours =
      body.estimated_hours !== undefined
        ? parseHours(body.estimated_hours)
        : Number(current.estimated_hours);

    const description =
      body.description !== undefined
        ? coerceStr(body.description) || null
        : current.description;

    const status =
      body.status !== undefined
        ? coerceStr(body.status)
        : current.status;

    if (!isValidDate(assignment_date)) {
      return res.status(400).json({ error: "invalid_assignment_date" });
    }

    if (!isValidTime(start_time) || !isValidTime(end_time)) {
      return res.status(400).json({ error: "invalid_time" });
    }

    if (estimated_hours === null) {
      return res.status(400).json({ error: "invalid_estimated_hours" });
    }

    if (!VALID_STATUS.has(status)) {
      return res.status(400).json({ error: "invalid_status" });
    }

    const row = await db
      .prepare(
        `
        UPDATE work_assignments
        SET
          assignment_date = ?,
          start_time = ?,
          end_time = ?,
          estimated_hours = ?,
          description = ?,
          status = ?,
          updated_at = ?
        WHERE id = ?
          AND tenant_id = ?
        RETURNING *
      `
      )
      .get(
        assignment_date,
        start_time,
        end_time,
        estimated_hours,
        description,
        status,
        Date.now(),
        id,
        req.tenantId
      );

    res.json(row);
  })
);

router.delete(
  "/work-assignments/:id",
  requireRole(["owner", "admin"]),
  wrap(async (req, res) => {
    const result = await db
      .prepare(
        `
        DELETE FROM work_assignments
        WHERE id = ?
          AND tenant_id = ?
      `
      )
      .run(req.params.id, req.tenantId);

    res.json({
      ok: true,
      changes: result?.changes || result?.rowCount || 0,
    });
  })
);

module.exports = router;