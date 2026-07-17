const { Router } = require("express");
const db = require("../db/connection");
const wrap = require("../lib/wrap");
const {
  canRead,
  canWrite,
  canDelete,
  getOwnershipFilter,
  resolveUserId,
} = require("../lib/authorize");

const router = Router();

const coerceStr = (v) => (typeof v === "string" ? v.trim() : "");
const coerceOptionalStr = (v) => {
  const s = coerceStr(v);
  return s || null;
};

const makeTimeEntryId = () => {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `te_${Date.now().toString(36)}_${rnd}`;
};

const isValidDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));

const parseHours = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  if (n > 24) return null;
  return Math.round(n * 100) / 100;
};

/**
 * GET /time-entries
 * Lista registros de horas del tenant actual.
 *
 * Query opcional:
 * - userId
 * - projectId
 * - itemId
 * - from YYYY-MM-DD
 * - to YYYY-MM-DD
 */
router.get(
  "/time-entries",
  canRead("time_entries"),
  wrap(async (req, res) => {
    const filters = [];
    const params = [req.tenantId];

    const userId = coerceOptionalStr(req.query.userId);
    const projectId = coerceOptionalStr(req.query.projectId);
    const itemId = coerceOptionalStr(req.query.itemId);
    const from = coerceOptionalStr(req.query.from);
    const to = coerceOptionalStr(req.query.to);

    if (userId) {
      filters.push("AND te.user_id = ?");
      params.push(userId);
    }

    if (projectId) {
      filters.push("AND te.project_id = ?");
      params.push(projectId);
    }

    if (itemId) {
      filters.push("AND te.item_id = ?");
      params.push(itemId);
    }

    if (from && isValidDate(from)) {
      filters.push("AND te.work_date >= ?");
      params.push(from);
    }

    if (to && isValidDate(to)) {
      filters.push("AND te.work_date <= ?");
      params.push(to);
    }

    const ownershipFilter = await getOwnershipFilter(req, "te");

    const rows = await db
      .prepare(
        `
        SELECT
          te.*,
          u.name AS user_name,
          u.email AS user_email
        FROM time_entries te
        LEFT JOIN users u ON te.user_id = u.id
        WHERE te.tenant_id = ?
          ${filters.join("\n")}
          ${ownershipFilter}
        ORDER BY te.work_date DESC, te.created_at DESC
      `
      )
      .all(...params);

    const total_hours = rows.reduce((sum, row) => {
      return sum + Number(row.hours || 0);
    }, 0);

    res.json({
      rows,
      total: rows.length,
      total_hours: Math.round(total_hours * 100) / 100,
    });
  })
);

/**
 * GET /time-entries/mine
 * Lista mis registros de horas.
 */
router.get(
  "/time-entries/mine",
  canRead("time_entries"),
  wrap(async (req, res) => {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "unauthorized" });

const rows = await db
  .prepare(
    `
    SELECT
      te.*,
      u.name AS user_name,
      u.email AS user_email
    FROM time_entries te
    LEFT JOIN users u ON te.user_id = u.id
    WHERE te.tenant_id = ?
      AND te.user_id = ?
    ORDER BY te.work_date DESC, te.created_at DESC
  `
  )
  .all(req.tenantId, userId);
    const total_hours = rows.reduce((sum, row) => {
      return sum + Number(row.hours || 0);
    }, 0);

    res.json({
      rows,
      total: rows.length,
      total_hours: Math.round(total_hours * 100) / 100,
    });
  })
);

/**
 * POST /time-entries
 * Crea un registro de horas.
 */
router.post(
  "/time-entries",
  canWrite("time_entries"),
  wrap(async (req, res) => {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "unauthorized" });

    let {
      id,
      project_id,
      project_name,
      item_id,
      item_name,
      work_date,
      hours,
      description,
    } = req.body || {};

    id = coerceStr(id);
    project_id = coerceOptionalStr(project_id);
    project_name = coerceStr(project_name);
    item_id = coerceOptionalStr(item_id);
    item_name = coerceStr(item_name);
    work_date = coerceStr(work_date);
    description = coerceOptionalStr(description);

    if (!id) id = makeTimeEntryId();

   if (!project_id) {
  return res.status(400).json({ error: "project_id_required" });
}

const project = await db
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
  .get(project_id, req.tenantId);

if (!project) {
  return res.status(400).json({ error: "invalid_project_id" });
}

project_name = project.name;

  if (!item_id) {
  return res.status(400).json({ error: "item_id_required" });
}

    if (!isValidDate(work_date)) {
      return res.status(400).json({ error: "invalid_work_date" });
    }

    hours = parseHours(hours);
    if (hours === null) {
      return res.status(400).json({ error: "invalid_hours" });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return res.status(400).json({ error: "invalid_time_entry_id" });
    }

  const item = await db
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
  .get(item_id, req.tenantId);

if (!item) {
  return res.status(400).json({ error: "invalid_item_id" });
}

item_name = item.name;

    const existing = await db
      .prepare(
        `
        SELECT 1 AS one
        FROM time_entries
        WHERE id = ? AND tenant_id = ?
        LIMIT 1
      `
      )
      .get(id, req.tenantId);

    if (existing) {
      return res.status(409).json({ error: "time_entry_exists" });
    }

    const now = Date.now();

    await db
      .prepare(
        `
        INSERT INTO time_entries
          (
            id,
            tenant_id,
            user_id,
            project_id,
            project_name,
            item_id,
            item_name,
            work_date,
            hours,
            description,
            created_by,
            created_at,
            updated_at
          )
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        id,
        req.tenantId,
        userId,
        project_id,
        project_name,
        item_id,
        item_name,
        work_date,
        hours,
        description,
        userId,
        now,
        now
      );

    const created = await db
      .prepare(
        `
        SELECT *
        FROM time_entries
        WHERE id = ? AND tenant_id = ?
      `
      )
      .get(id, req.tenantId);

    res.setHeader("Location", `/time-entries/${id}`);

    return res.status(201).json({
      ok: true,
      message: "Horas registradas",
      time_entry: created,
    });
  })
);

/**
 * DELETE /time-entries/:id
 * Elimina un registro de horas.
 */
router.delete(
  "/time-entries/:id",
  canDelete("time_entries"),
  wrap(async (req, res) => {
    const found = await db
      .prepare(
        `
        SELECT *
        FROM time_entries
        WHERE id = ? AND tenant_id = ?
      `
      )
      .get(req.params.id, req.tenantId);

    if (!found) return res.status(404).json({ error: "not_found" });

    await db
      .prepare(
        `
        DELETE FROM time_entries
        WHERE id = ? AND tenant_id = ?
      `
      )
      .run(req.params.id, req.tenantId);

    return res.json({
      ok: true,
      deleted: found,
    });
  })
);

module.exports = router;
