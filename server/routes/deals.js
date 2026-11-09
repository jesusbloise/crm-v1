// server/routes/deals.js
const { Router } = require("express");
const { randomUUID } = require("crypto");
const db = require("../db/connection");
const wrap = require("../lib/wrap");
const { resolveUserId } = require("../lib/authorize");
const {
  dealVisibilityFilter,
  getVisibleContact,
} = require("../lib/contactAccess");

const router = Router();

const STAGES = new Set([
  "nuevo",
  "calificado",
  "propuesta",
  "negociacion",
  "ganado",
  "perdido",
]);

const has = (value, key) =>
  Object.prototype.hasOwnProperty.call(value, key);

function fail(status, error, message) {
  const err = new Error(message || error);
  err.status = status;
  err.code = error;
  return err;
}

function text(value, field, max = 500) {
  if (value == null) return null;

  if (typeof value !== "string" || value.trim().length > max) {
    throw fail(400, `invalid_${field}`, `Revisa el campo ${field}.`);
  }

  return value.trim() || null;
}

function integer(value, field) {
  if (value == null || value === "") return null;

  if (
    !["string", "number"].includes(typeof value) ||
    (typeof value === "string" && !value.trim())
  ) {
    throw fail(400, `invalid_${field}`);
  }

  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 0) {
    throw fail(
      400,
      `invalid_${field}`,
      `${field} debe ser un número entero válido, mayor o igual a cero.`
    );
  }

  return number;
}

function query(client, sql, params = []) {
  let position = 0;
  return client.query(
    sql.replace(/\?/g, () => `$${++position}`),
    params
  );
}

async function identity(req) {
  const userId = resolveUserId(req);

  if (!userId || !req.tenantId) {
    throw fail(401, "unauthorized");
  }

  const user = await db.prepare(`
    SELECT id, role
    FROM users
    WHERE id = ?
      AND COALESCE(active, TRUE) = TRUE
    LIMIT 1
  `).get(userId);

  const role = String(user?.role || "").toLowerCase();

  if (!["member", "admin", "owner"].includes(role)) {
    throw fail(403, "forbidden");
  }

  return {
    userId,
    isAdmin: role === "admin" || role === "owner",
  };
}

async function findDeal(req, id, client, lock = false) {
  const filter = dealVisibilityFilter(req, "d");
  const sql = `
    SELECT d.*
    FROM deals d
    WHERE d.id = ?
      AND ${filter.sql}
    LIMIT 1
    ${lock ? "FOR UPDATE OF d" : ""}
  `;
  const params = [id, ...filter.params];

  if (client) {
    const result = await query(client, sql, params);
    return result.rows[0] || null;
  }

  return db.prepare(sql).get(...params);
}

async function validateLinks(req, data) {
  if (data.account_id) {
    const account = await db.prepare(`
      SELECT id
      FROM accounts
      WHERE id = ? AND tenant_id = ?
      LIMIT 1
    `).get(data.account_id, req.tenantId);

    if (!account) throw fail(400, "invalid_account_id");
  }

  if (data.contact_id) {
    const contact = await getVisibleContact(req, data.contact_id);

    if (!contact) {
      throw fail(400, "invalid_contact_id", "Contacto inexistente o sin acceso.");
    }
  }

  if (!data.assigned_to) return;

  const member = await db.prepare(`
    SELECT u.id
    FROM users u
    WHERE u.id = ?
      AND COALESCE(u.active, TRUE) = TRUE
      AND LOWER(u.role) IN ('member', 'admin', 'owner')
      AND (
        EXISTS (
          SELECT 1 FROM tenant_memberships tm
          WHERE tm.tenant_id = ? AND tm.user_id = u.id
        )
        OR EXISTS (
          SELECT 1 FROM memberships m
          WHERE m.tenant_id = ? AND m.user_id = u.id
        )
        OR EXISTS (
          SELECT 1 FROM tenants t
          WHERE t.id = ? AND t.created_by = u.id
        )
      )
    LIMIT 1
  `).get(
    data.assigned_to,
    req.tenantId,
    req.tenantId,
    req.tenantId
  );

  if (!member) {
    throw fail(
      400,
      "invalid_assignee",
      "El responsable debe estar activo y pertenecer al workspace."
    );
  }

  if (data.contact_id) {
    const recipient = {
      tenantId: req.tenantId,
      user: { id: data.assigned_to },
      auth: { sub: data.assigned_to },
    };

    if (!(await getVisibleContact(recipient, data.contact_id))) {
      throw fail(
        400,
        "assignee_without_contact_access",
        "Comparte primero el contacto con el responsable."
      );
    }
  }
}

function values(body, previous = {}) {
  const take = (key, fallback = null) =>
    has(body, key) ? body[key] : previous[key] ?? fallback;

  const result = {
    title: text(take("title"), "title", 300),
    stage: text(take("stage", "nuevo"), "stage", 30),
    amount: integer(take("amount"), "amount"),
    close_date: integer(take("close_date"), "close_date"),
    account_id: text(take("account_id"), "account_id", 200),
    contact_id: text(take("contact_id"), "contact_id", 200),
    assigned_to: text(take("assigned_to"), "assigned_to", 200),
    lost_reason: text(take("lost_reason"), "lost_reason", 2000),
  };

  if (!result.title) {
    throw fail(400, "title_required", "El título es obligatorio.");
  }

  if (!STAGES.has(result.stage)) {
    throw fail(400, "invalid_stage", "La etapa no es válida.");
  }

  if (
    result.stage === "perdido" &&
    previous.stage !== "perdido" &&
    !result.lost_reason
  ) {
    throw fail(400, "lost_reason_required", "Indica el motivo de pérdida.");
  }

  if (result.stage !== "perdido") result.lost_reason = null;

  return result;
}

async function recordStage(client, req, id, from, data, now) {
  await query(client, `
    INSERT INTO deal_stage_history (
      id, tenant_id, deal_id, from_stage, to_stage,
      changed_by, reason, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    randomUUID(),
    req.tenantId,
    id,
    from,
    data.stage,
    resolveUserId(req),
    data.stage === "perdido" ? data.lost_reason : null,
    now,
  ]);
}

/** Listado: conserva la respuesta de tipo array. */
router.get("/deals", wrap(async (req, res) => {
  await identity(req);
  const filter = dealVisibilityFilter(req, "d");

  const requested = Number(req.query.limit ?? 100);
  const offset = Number(req.query.offset ?? 0);

  if (
    !Number.isSafeInteger(requested) || requested < 1 ||
    !Number.isSafeInteger(offset) || offset < 0
  ) {
    throw fail(400, "invalid_pagination");
  }

  const clauses = [filter.sql];
  const params = [...filter.params];

  for (const field of ["assigned_to", "contact_id", "stage"]) {
    if (req.query[field] === undefined) continue;

    const value = text(req.query[field], field, 200);
    if (!value) throw fail(400, `invalid_${field}`);

    if (field === "stage" && !STAGES.has(value)) {
      throw fail(400, "invalid_stage");
    }

    clauses.push(`d.${field} = ?`);
    params.push(value);
  }

  const rows = await db.prepare(`
    SELECT
      d.*,
      creator.name AS created_by_name,
      responsible.name AS assigned_to_name,
      contact.name AS contact_name,
      account.name AS account_name
    FROM deals d
    LEFT JOIN users creator ON creator.id = d.created_by
    LEFT JOIN users responsible ON responsible.id = d.assigned_to
    LEFT JOIN contacts contact
      ON contact.id = d.contact_id AND contact.tenant_id = d.tenant_id
    LEFT JOIN accounts account
      ON account.id = d.account_id AND account.tenant_id = d.tenant_id
    WHERE ${clauses.join(" AND ")}
    ORDER BY d.updated_at DESC, d.id ASC
    LIMIT ? OFFSET ?
  `).all(...params, Math.min(requested, 200), offset);

  res.setHeader("Cache-Control", "no-store");
  res.json(rows);
}));

router.get("/deals/:id/history", wrap(async (req, res) => {
  await identity(req);

  if (!(await findDeal(req, req.params.id))) {
    throw fail(404, "not_found");
  }

  const filter = dealVisibilityFilter(req, "d");

  const rows = await db.prepare(`
    SELECT h.*, u.name AS changed_by_name
    FROM deal_stage_history h
    JOIN deals d
      ON d.id = h.deal_id AND d.tenant_id = h.tenant_id
    LEFT JOIN users u ON u.id = h.changed_by
    WHERE h.deal_id = ?
      AND ${filter.sql}
    ORDER BY h.created_at DESC, h.id DESC
  `).all(req.params.id, ...filter.params);

  res.setHeader("Cache-Control", "no-store");
  res.json(rows);
}));

router.get("/deals/:id", wrap(async (req, res) => {
  const actor = await identity(req);
  const row = await findDeal(req, req.params.id);

  if (!row) throw fail(404, "not_found");

  row.can_manage_assignment =
    actor.isAdmin || row.created_by === actor.userId;
  row.can_delete = row.can_manage_assignment;

  res.setHeader("Cache-Control", "no-store");
  res.json(row);
}));

router.post("/deals", wrap(async (req, res) => {
  const actor = await identity(req);
  const body = req.body || {};
  const id = text(body.id, "deal_id", 200);

  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw fail(400, "invalid_deal_id");
  }

  const data = values(body);
  await validateLinks(req, data);

  const now = Date.now();
  const closedAt = ["ganado", "perdido"].includes(data.stage) ? now : null;
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    await query(client, `
      INSERT INTO deals (
        id, tenant_id, created_by, title, amount, stage,
        account_id, contact_id, assigned_to, close_date,
        lost_reason, closed_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, req.tenantId, actor.userId,
      data.title, data.amount, data.stage,
      data.account_id, data.contact_id, data.assigned_to,
      data.close_date, data.lost_reason, closedAt, now, now,
    ]);

    await recordStage(client, req, id, null, data, now);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");

    if (err.code === "23505") {
      throw fail(409, "deal_exists", "Ya existe esa oportunidad.");
    }

    throw err;
  } finally {
    client.release();
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(201).json(await findDeal(req, id));
}));

router.patch("/deals/:id", wrap(async (req, res) => {
  const actor = await identity(req);
  const body = req.body || {};
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");
    const found = await findDeal(req, req.params.id, client, true);

    if (!found) throw fail(404, "not_found");

    if (
      has(body, "expected_updated_at") &&
      integer(body.expected_updated_at, "expected_updated_at") !==
        Number(found.updated_at)
    ) {
      throw fail(
        409,
        "deal_changed",
        "La oportunidad cambió. Actualiza los datos antes de guardar."
      );
    }

    const data = values(body, found);
    const canManage = actor.isAdmin || found.created_by === actor.userId;

    if (data.assigned_to !== (found.assigned_to || null) && !canManage) {
      throw fail(403, "assignment_forbidden", "No puedes cambiar el responsable.");
    }

    if (found.contact_id && data.contact_id !== found.contact_id) {
      throw fail(
        400,
        "deal_privacy_link_locked",
        "No puedes quitar ni cambiar el contacto que determina la privacidad."
      );
    }

    await validateLinks(req, data);

    const now = Math.max(Date.now(), Number(found.updated_at) + 1);
    const changed = found.stage !== data.stage;
    const closedAt = ["ganado", "perdido"].includes(data.stage)
      ? changed ? now : found.closed_at ?? null
      : null;

    const filter = dealVisibilityFilter(req, "d");

    const result = await query(client, `
      UPDATE deals AS d
      SET title = ?, amount = ?, stage = ?, account_id = ?,
          contact_id = ?, assigned_to = ?, close_date = ?,
          lost_reason = ?, closed_at = ?, updated_at = ?
      WHERE d.id = ? AND ${filter.sql}
      RETURNING d.*
    `, [
      data.title, data.amount, data.stage, data.account_id,
      data.contact_id, data.assigned_to, data.close_date,
      data.lost_reason, closedAt, now,
      req.params.id, ...filter.params,
    ]);

    if (!result.rowCount) throw fail(404, "not_found");

    if (changed) {
      await recordStage(client, req, req.params.id, found.stage, data, now);
    }

    // Conserva el seguimiento existente al entrar en Propuesta.
    // Evita otra tarea equivalente mientras haya una abierta.
    if (changed && data.stage === "propuesta") {
      await query(client, `
        INSERT INTO activities (
          id, type, title, due_date, status, deal_id, contact_id,
          assigned_to, tenant_id, created_by, created_at, updated_at
        )
        SELECT ?, 'task', 'Enviar propuesta', ?, 'open', ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM activities
          WHERE tenant_id = ? AND deal_id = ?
            AND title = 'Enviar propuesta' AND status = 'open'
        )
      `, [
        randomUUID(), now + 86400000,
        req.params.id, data.contact_id, data.assigned_to,
        req.tenantId, actor.userId, now, now,
        req.tenantId, req.params.id,
      ]);
    }

    await client.query("COMMIT");
    res.setHeader("Cache-Control", "no-store");
    res.json(result.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}));

router.delete("/deals/:id", wrap(async (req, res) => {
  const actor = await identity(req);
  const filter = dealVisibilityFilter(req, "d");
  const params = [req.params.id, ...filter.params];

  const ownership = actor.isAdmin ? "" : "AND d.created_by = ?";
  if (!actor.isAdmin) params.push(actor.userId);

  const info = await db.prepare(`
    DELETE FROM deals AS d
    WHERE d.id = ? AND ${filter.sql} ${ownership}
  `).run(...params);

  if (!info.changes) throw fail(404, "not_found");
  res.json({ ok: true });
}));

module.exports = router;