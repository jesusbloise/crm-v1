// server/routes/deals.js
const { Router } = require("express");
const db = require("../db/connection");
const wrap = require("../lib/wrap");
const {
  resolveUserId,
  canRead,
  canWrite,
  canDelete,
  getOwnershipFilter,
} = require("../lib/authorize");
const {
  contactVisibilityFilter,
  getVisibleContact,
} = require("../lib/contactAccess");

const router = Router();

function coerceStr(value, fallback = null) {
  if (typeof value === "string") return value.trim();
  return value == null ? fallback : String(value);
}

function hasProp(object, field) {
  return Object.prototype.hasOwnProperty.call(object, field);
}

/**
 * Mantiene los permisos existentes de las oportunidades.
 * Además, exige acceso al contacto vinculado.
 */
function dealContactFilter(req) {
  const contact = contactVisibilityFilter(req, "visible_contact");

  if (!resolveUserId(req) || !req.tenantId) {
    return { sql: "FALSE", params: [] };
  }

  return {
    sql: `
      (
        d.tenant_id = ?
        AND (
          NULLIF(d.contact_id, '') IS NULL
          OR EXISTS (
            SELECT 1
            FROM contacts visible_contact
            WHERE visible_contact.id = d.contact_id
              AND visible_contact.tenant_id = d.tenant_id
              AND ${contact.sql}
          )
        )
      )
    `,
    params: [req.tenantId, ...contact.params],
  };
}

/**
 * Ejecuta SQL con placeholders ? en un cliente de transacción.
 * El SQL siempre procede de constantes del backend.
 */
function transactionQuery(client, sql, params = []) {
  let index = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++index}`);
  return client.query(pgSql, params);
}

async function findVisibleDeal(req, id) {
  const filter = dealContactFilter(req);

  return db.prepare(`
    SELECT d.*
    FROM deals d
    WHERE d.id = ?
      AND ${filter.sql}
    LIMIT 1
  `).get(id, ...filter.params);
}

/** GET /deals */
router.get(
  "/deals",
  wrap(async (req, res) => {
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(requestedLimit, 200))
      : 100;

    const filter = dealContactFilter(req);
    const ownership = await getOwnershipFilter(req, "d");

    const rows = await db.prepare(`
      SELECT d.*
      FROM deals d
      WHERE ${filter.sql}
        ${ownership}
      ORDER BY d.updated_at DESC, d.id ASC
      LIMIT ?
    `).all(...filter.params, limit);

    res.setHeader("Cache-Control", "no-store");
    return res.json(rows);
  })
);

/** GET /deals/:id */
router.get(
  "/deals/:id",
  canRead("deals"),
  wrap(async (req, res) => {
    const row = await findVisibleDeal(req, req.params.id);

    if (!row) {
      return res.status(404).json({ error: "not_found" });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.json(row);
  })
);

/** POST /deals */
router.post(
  "/deals",
  wrap(async (req, res) => {
    const body = req.body || {};
    const userId = resolveUserId(req);

    if (!userId || !req.tenantId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const id = coerceStr(body.id, "");
    const title = coerceStr(body.title, "");
    const stage = coerceStr(body.stage, "nuevo") || "nuevo";
    const accountId = coerceStr(body.account_id) || null;
    const contactId = coerceStr(body.contact_id) || null;

    if (!id || !title) {
      return res.status(400).json({
        error: "id_and_title_required",
      });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return res.status(400).json({ error: "invalid_deal_id" });
    }

    const exists = await db.prepare(`
      SELECT 1
      FROM deals
      WHERE id = ? AND tenant_id = ?
      LIMIT 1
    `).get(id, req.tenantId);

    if (exists) {
      return res.status(409).json({ error: "deal_exists" });
    }

    if (accountId) {
      const account = await db.prepare(`
        SELECT 1
        FROM accounts
        WHERE id = ? AND tenant_id = ?
        LIMIT 1
      `).get(accountId, req.tenantId);

      if (!account) {
        return res.status(400).json({
          error: "invalid_account_id",
        });
      }
    }

    if (contactId) {
      const contact = await getVisibleContact(req, contactId);

      if (!contact) {
        return res.status(400).json({
          error: "invalid_contact_id",
        });
      }
    }

    const now = Date.now();

    try {
      await db.prepare(`
        INSERT INTO deals (
          id, title, amount, stage, account_id, contact_id,
          close_date, tenant_id, created_by, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        title,
        body.amount ?? null,
        stage,
        accountId,
        contactId,
        body.close_date ?? null,
        req.tenantId,
        userId,
        now,
        now
      );
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({ error: "deal_exists" });
      }
      throw err;
    }

    const created = await findVisibleDeal(req, id);

    if (!created) {
      return res.status(404).json({ error: "not_found" });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(201).json(created);
  })
);

/** PATCH /deals/:id */
router.patch(
  "/deals/:id",
  canWrite("deals"),
  wrap(async (req, res) => {
    const found = await findVisibleDeal(req, req.params.id);

    if (!found) {
      return res.status(404).json({ error: "not_found" });
    }

    const body = req.body || {};

    const accountId = hasProp(body, "account_id")
      ? coerceStr(body.account_id) || null
      : found.account_id || null;

    const contactId = hasProp(body, "contact_id")
      ? coerceStr(body.contact_id) || null
      : found.contact_id || null;

    // El contacto determina también la privacidad de las
    // actividades y notas vinculadas a esta oportunidad.
    if (
      found.contact_id &&
      contactId !== found.contact_id
    ) {
      return res.status(400).json({
        error: "deal_privacy_link_locked",
        message:
          "No puedes quitar ni cambiar el contacto de esta " +
          "oportunidad porque determina su privacidad y la " +
          "de sus actividades y notas.",
      });
    }

    const title = hasProp(body, "title")
      ? coerceStr(body.title, "")
      : found.title;

    const stage = hasProp(body, "stage")
      ? coerceStr(body.stage, "")
      : found.stage;

    if (!title || !stage) {
      return res.status(400).json({
        error: "title_and_stage_required",
      });
    }

    if (accountId) {
      const account = await db.prepare(`
        SELECT 1
        FROM accounts
        WHERE id = ? AND tenant_id = ?
        LIMIT 1
      `).get(accountId, req.tenantId);

      if (!account) {
        return res.status(400).json({
          error: "invalid_account_id",
        });
      }
    }

    if (contactId) {
      const contact = await getVisibleContact(req, contactId);

      if (!contact) {
        return res.status(400).json({
          error: "invalid_contact_id",
        });
      }
    }

    const amount = hasProp(body, "amount")
      ? body.amount ?? null
      : found.amount ?? null;

    const closeDate = hasProp(body, "close_date")
      ? body.close_date ?? null
      : found.close_date ?? null;

    const updatedAt = Math.max(
      Date.now(),
      Number(found.updated_at) + 1
    );

    const client = await db.pool.connect();

    try {
      await client.query("BEGIN");

      const filter = dealContactFilter(req);

      const result = await transactionQuery(client, `
        UPDATE deals AS d
        SET
          title = ?,
          amount = ?,
          stage = ?,
          account_id = ?,
          contact_id = ?,
          close_date = ?,
          updated_at = ?
        WHERE d.id = ?
          AND d.updated_at = ?
          AND ${filter.sql}
        RETURNING d.id
      `, [
        title,
        amount,
        stage,
        accountId,
        contactId,
        closeDate,
        updatedAt,
        req.params.id,
        found.updated_at,
        ...filter.params,
      ]);

      if (result.rowCount === 0) {
        await client.query("ROLLBACK");

        const current = await findVisibleDeal(
          req,
          req.params.id
        );

        if (!current) {
          return res.status(404).json({ error: "not_found" });
        }

        return res.status(409).json({
          error: "deal_changed",
          message:
            "La oportunidad cambió mientras la editabas. " +
            "Recarga los datos antes de volver a guardar.",
        });
      }

      if (
        found.stage !== "propuesta" &&
        stage === "propuesta"
      ) {
        const now = Date.now();
        const activityId =
          Math.random().toString(36).slice(2) +
          now.toString(36);

        await transactionQuery(client, `
          INSERT INTO activities (
            id, type, title, due_date, status,
            deal_id, tenant_id, created_by,
            created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          activityId,
          "task",
          "Enviar propuesta",
          now + 24 * 60 * 60 * 1000,
          "open",
          req.params.id,
          req.tenantId,
          resolveUserId(req),
          now,
          now,
        ]);
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    const updated = await findVisibleDeal(req, req.params.id);

    if (!updated) {
      return res.status(404).json({ error: "not_found" });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.json(updated);
  })
);

/** DELETE /deals/:id */
router.delete(
  "/deals/:id",
  canDelete("deals"),
  wrap(async (req, res) => {
    const filter = dealContactFilter(req);

    const info = await db.prepare(`
      DELETE FROM deals AS d
      WHERE d.id = ?
        AND ${filter.sql}
    `).run(req.params.id, ...filter.params);

    if (info.changes === 0) {
      return res.status(404).json({ error: "not_found" });
    }

    return res.json({ ok: true });
  })
);

module.exports = router;