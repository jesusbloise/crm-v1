const { Router } = require("express");
const db = require("../db/connection");
const wrap = require("../lib/wrap");
const {
  canRead,
  requireRole,
  resolveUserId,
} = require("../lib/authorize");

const router = Router();

const coerceStr = (v) => (typeof v === "string" ? v.trim() : "");

const makeWorkProjectId = () => {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `wp_${Date.now().toString(36)}_${rnd}`;
};

/**
 * GET /work-projects
 * Lista proyectos del tenant actual.
 *
 * Query:
 * - ?includeInactive=1 para incluir inactivos
 */
router.get(
  "/work-projects",
  canRead("work_projects"),
  wrap(async (req, res) => {
    const includeInactive =
      req.query.includeInactive === "1" ||
      req.query.includeInactive === "true";

    const rows = await db
      .prepare(
        `
        SELECT *
        FROM work_projects
        WHERE tenant_id = ?
          ${includeInactive ? "" : "AND is_active = 1"}
        ORDER BY updated_at DESC, name ASC
      `
      )
      .all(req.tenantId);

    res.json(rows);
  })
);

/**
 * POST /work-projects
 * Crea proyecto de trabajo.
 * Solo owner/admin.
 */
router.post(
  "/work-projects",
  requireRole(["owner", "admin"]),
  wrap(async (req, res) => {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "unauthorized" });

    let { id, name, description, client_name } = req.body || {};

    id = coerceStr(id);
    name = coerceStr(name);
    description = coerceStr(description);
    client_name = coerceStr(client_name);

    if (!id) id = makeWorkProjectId();

    if (!name) {
      return res.status(400).json({ error: "name_required" });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return res.status(400).json({ error: "invalid_work_project_id" });
    }

    const existingById = await db
      .prepare(
        `
        SELECT 1 AS one
        FROM work_projects
        WHERE id = ? AND tenant_id = ?
        LIMIT 1
      `
      )
      .get(id, req.tenantId);

    if (existingById) {
      return res.status(409).json({ error: "work_project_exists" });
    }

    const existingByName = await db
      .prepare(
        `
        SELECT 1 AS one
        FROM work_projects
        WHERE tenant_id = ?
          AND LOWER(name) = LOWER(?)
        LIMIT 1
      `
      )
      .get(req.tenantId, name);

    if (existingByName) {
      return res.status(409).json({ error: "work_project_name_exists" });
    }

    const now = Date.now();

    await db
      .prepare(
        `
        INSERT INTO work_projects
          (id, tenant_id, name, description, client_name, is_active, created_by, created_at, updated_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        id,
        req.tenantId,
        name,
        description || null,
        client_name || null,
        1,
        userId,
        now,
        now
      );

    const created = await db
      .prepare(
        `
        SELECT *
        FROM work_projects
        WHERE id = ? AND tenant_id = ?
      `
      )
      .get(id, req.tenantId);

    res.setHeader("Location", `/work-projects/${id}`);

    return res.status(201).json({
      ok: true,
      message: "Proyecto de trabajo creado",
      work_project: created,
    });
  })
);

/**
 * PATCH /work-projects/:id
 * Edita proyecto o lo activa/desactiva.
 * Solo owner/admin.
 */
router.patch(
  "/work-projects/:id",
  requireRole(["owner", "admin"]),
  wrap(async (req, res) => {
    const found = await db
      .prepare(
        `
        SELECT *
        FROM work_projects
        WHERE id = ? AND tenant_id = ?
        LIMIT 1
      `
      )
      .get(req.params.id, req.tenantId);

    if (!found) return res.status(404).json({ error: "not_found" });

    let {
      name = found.name,
      description = found.description,
      client_name = found.client_name,
      is_active = found.is_active,
    } = req.body || {};

    name = coerceStr(name);
    description = coerceStr(description);
    client_name = coerceStr(client_name);

    if (!name) {
      return res.status(400).json({ error: "name_required" });
    }

    is_active =
      is_active === true ||
      is_active === 1 ||
      is_active === "1" ||
      is_active === "true"
        ? 1
        : 0;

    const now = Date.now();

    await db
      .prepare(
        `
        UPDATE work_projects
        SET
          name = ?,
          description = ?,
          client_name = ?,
          is_active = ?,
          updated_at = ?
        WHERE id = ? AND tenant_id = ?
      `
      )
      .run(
        name,
        description || null,
        client_name || null,
        is_active,
        now,
        req.params.id,
        req.tenantId
      );

    const updated = await db
      .prepare(
        `
        SELECT *
        FROM work_projects
        WHERE id = ? AND tenant_id = ?
      `
      )
      .get(req.params.id, req.tenantId);

    return res.json({
      ok: true,
      message: "Proyecto de trabajo actualizado",
      work_project: updated,
    });
  })
);

module.exports = router;
