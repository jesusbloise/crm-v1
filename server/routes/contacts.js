// server/routes/contacts.js
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
const {
  contactVisibilityFilter,
  getVisibleContact,
} = require("../lib/contactAccess");

const router = Router();

/** helpers */
const coerceStr = (v) => (typeof v === "string" ? v.trim() : null);
const normalizeEmail = (v) => {
  const s = coerceStr(v);
  if (!s) return null;
  return s.toLowerCase();
};
const safeClientType = (v) => {
  const s = coerceStr(v);
  if (!s) return null;
  const x = s.toLowerCase();
  const allowed = ["productora", "agencia", "directo", "proveedor"];
  return allowed.includes(x) ? x : null;
};
const makeContactId = () => {
  // compatible con /^[a-zA-Z0-9_-]+$/
  const rnd = Math.random().toString(36).slice(2, 10);
  return `c_${Date.now().toString(36)}_${rnd}`;
};

async function getGlobalRole(userId) {
  if (!userId) return "member";
  const row = await Promise.resolve(
    db.prepare(`SELECT role FROM users WHERE id = ? LIMIT 1`).get(userId)
  );
  return (row?.role || "member").toLowerCase();
}

/**
 * GET /contacts
 * Lista únicamente los contactos visibles del workspace activo.
 */
router.get(
  "/contacts",
  canRead("contacts"),
  wrap(async (req, res) => {
    const workspaceId =
      typeof req.query.workspaceId === "string"
        ? req.query.workspaceId.trim()
        : "";

    const filter = contactVisibilityFilter(req, "c");
    const clauses = [filter.sql];
    const params = [...filter.params];

    if (workspaceId) {
      clauses.push(`
        EXISTS (
          SELECT 1
          FROM accounts a
          WHERE a.id = c.account_id
            AND a.tenant_id = c.tenant_id
            AND a.workspace_id = ?
        )
      `);
      params.push(workspaceId);
    }

    const rows = await db.prepare(`
      SELECT
        c.*,
        u.name AS created_by_name,
        u.email AS created_by_email
      FROM contacts c
      LEFT JOIN users u ON u.id = c.created_by
      WHERE ${clauses.join(" AND ")}
      ORDER BY c.updated_at DESC, c.id ASC
    `).all(...params);

    res.setHeader("Cache-Control", "no-store");
    return res.json(rows);
  })
);
/**
 * GET /contacts/export-all-csv
 */
router.get(
  "/contacts/export-all-csv",
  wrap(async (req, res) => {
    const { resolveUserId } = require("../lib/authorize");
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "unauthorized" });

    const user = await db
      .prepare(`SELECT role FROM users WHERE id = ? LIMIT 1`)
      .get(userId);
    const role = user?.role || "member";

    if (role !== "admin" && role !== "owner") {
      return res.status(403).json({ error: "forbidden" });
    }

    const sinceRaw = req.query?.since;
    let sinceMs = 0;
    if (sinceRaw != null) {
      const n = Number(sinceRaw);
      if (Number.isFinite(n) && n > 0) sinceMs = n;
    }

    const filter = contactVisibilityFilter(req, "contacts");
    const clauses = [filter.sql];
    const params = [...filter.params];

    res.setHeader("Cache-Control", "no-store");

    if (sinceMs > 0) {
      clauses.push("updated_at > ?");
      params.push(sinceMs);
    }

    const rows = await db
      .prepare(
        `
        SELECT 
          id,
          tenant_id,
          name,
          email,
          phone,
          company,
          position,
          client_type,
          account_id,
          created_by,
          created_at,
          updated_at
        FROM contacts
        WHERE ${clauses.join(" AND ")}
        ORDER BY tenant_id ASC, created_at ASC
      `
      )
      .all(...params);

    const headers = [
      "id",
      "tenant_id",
      "name",
      "email",
      "phone",
      "company",
      "position",
      "client_type",
      "account_id",
      "created_by",
      "created_at",
      "updated_at",
    ];

    const esc = (val) => {
      if (val === null || val === undefined) return "";
      const s = String(val);
      if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    const lines = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
    ];
    const csv = lines.join("\r\n");

    const now = new Date();
    const pad = (n) => (n < 10 ? "0" + n : String(n));
    const filename = `contacts-all-${now.getFullYear()}${pad(
      now.getMonth() + 1
    )}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  })
);
/**
 * GET /contacts/:id
 * No revela si un contacto sin acceso existe.
 */
router.get(
  "/contacts/:id",
  wrap(async (req, res) => {
    const filter = contactVisibilityFilter(req, "c");

    const row = await db.prepare(`
      SELECT
        c.*,
        u.name AS created_by_name,
        u.email AS created_by_email
      FROM contacts c
      LEFT JOIN users u ON u.id = c.created_by
      WHERE c.id = ?
        AND ${filter.sql}
      LIMIT 1
    `).get(req.params.id, ...filter.params);

    if (!row) {
      return res.status(404).json({ error: "not_found" });
    }
    const userId = resolveUserId(req);
const role = await getGlobalRole(userId);

row.can_manage_sharing =
  row.created_by === userId &&
  (role === "admin" || role === "owner");

if (row.can_manage_sharing) {
  const shares = await db.prepare(`
    SELECT user_id
    FROM contact_shares
    WHERE tenant_id = ? AND contact_id = ?
    ORDER BY user_id
  `).all(req.tenantId, row.id);

  row.shared_user_ids = shares.map((share) => share.user_id);
}
    res.setHeader("Cache-Control", "no-store");
    return res.json(row);
  })
);
/**
 * GET /contacts-all
 * Conserva el endpoint, respetando workspace y privacidad.
 */
router.get(
  "/contacts-all",
  canRead("contacts"),
  wrap(async (req, res) => {
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(requestedLimit, 5000))
      : 500;

    const filter = contactVisibilityFilter(req, "c");

    const rows = await db.prepare(`
      SELECT
        c.*,
        u.name AS created_by_name,
        u.email AS created_by_email
      FROM contacts c
      LEFT JOIN users u ON u.id = c.created_by
      WHERE ${filter.sql}
      ORDER BY c.updated_at DESC, c.id ASC
      LIMIT ?
    `).all(...filter.params, limit);

    res.setHeader("Cache-Control", "no-store");
    return res.json(rows);
  })
);

/**
 * POST /contacts/import
 * Importación CSV exclusiva para admin/owner.
 *
 * Conserva el comportamiento actual:
 * los contactos importados se comparten con el workspace.
 *
 * La detección de duplicados solo consulta contactos visibles.
 */
router.post(
  "/contacts/import",
  canWrite("contacts"),
  wrap(async (req, res) => {
    const rows = Array.isArray(req.body?.rows)
      ? req.body.rows
      : null;

    if (!rows) {
      return res.status(400).json({ error: "rows_required" });
    }

    const userId = resolveUserId(req);

    if (!userId || !req.tenantId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const role = await getGlobalRole(userId);

    if (role !== "admin" && role !== "owner") {
      return res.status(403).json({ error: "forbidden" });
    }

    res.setHeader("Cache-Control", "no-store");

    const results = {
      received: rows.length,
      created: 0,
      skipped: 0,
      errors: 0,
      items: [],
    };

    const incomingEmails = Array.from(
      new Set(
        rows
          .map((row) => normalizeEmail(row?.email))
          .filter(Boolean)
      )
    );

    const existingEmailSet = new Set();
    const chunkSize = 200;

    for (
      let offset = 0;
      offset < incomingEmails.length;
      offset += chunkSize
    ) {
      const chunk = incomingEmails.slice(
        offset,
        offset + chunkSize
      );

      const placeholders = chunk.map(() => "?").join(",");
      const filter = contactVisibilityFilter(req, "c");

      const found = await db.prepare(`
        SELECT c.email
        FROM contacts c
        WHERE ${filter.sql}
          AND LOWER(BTRIM(c.email)) IN (${placeholders})
      `).all(...filter.params, ...chunk);

      for (const contact of found) {
        const email = normalizeEmail(contact.email);
        if (email) existingEmailSet.add(email);
      }
    }

    const seenInBatch = new Set();

    const accountExists = async (accountId) => {
      if (!accountId) return false;

      const row = await db.prepare(`
        SELECT 1
        FROM accounts
        WHERE id = ?
          AND tenant_id = ?
        LIMIT 1
      `).get(accountId, req.tenantId);

      return Boolean(row);
    };

    for (let index = 0; index < rows.length; index++) {
      try {
        const raw = rows[index] || {};
        const name = coerceStr(raw.name);

        if (!name) {
          results.skipped++;
          results.items.push({
            index,
            ok: false,
            reason: "missing_name",
          });
          continue;
        }

        const email = normalizeEmail(raw.email);

        if (email && seenInBatch.has(email)) {
          results.skipped++;
          results.items.push({
            index,
            ok: false,
            reason: "duplicate_email_csv",
            email,
          });
          continue;
        }

        if (email && existingEmailSet.has(email)) {
          results.skipped++;
          results.items.push({
            index,
            ok: false,
            reason: "duplicate_email_db",
            email,
          });
          continue;
        }

        let accountId = coerceStr(raw.account_id) || null;

        if (accountId && !(await accountExists(accountId))) {
          accountId = null;
        }

        // Cada importación crea un registro nuevo.
        // No se consulta ni reutiliza el ID aportado por el CSV.
        const id = makeContactId();
        const now = Date.now();

        await db.prepare(`
          INSERT INTO contacts (
            id,
            name,
            email,
            phone,
            company,
            position,
            account_id,
            client_type,
            tenant_id,
            created_by,
            created_at,
            updated_at,
            visibility
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          name,
          email,
          coerceStr(raw.phone),
          coerceStr(raw.company),
          coerceStr(raw.position),
          accountId,
          safeClientType(raw.client_type),
          req.tenantId,
          userId,
          now,
          now,
          "workspace"
        );

        // Solo marcar el correo después de guardar correctamente.
        if (email) seenInBatch.add(email);

        results.created++;
        results.items.push({
          index,
          ok: true,
          id,
          name,
          email,
        });
      } catch (err) {
        // No devolver mensajes SQL que puedan revelar datos
        // de registros a los que el usuario no tiene acceso.
        console.error("[contacts/import] Error de inserción:", {
          index,
          code: err.code || "unknown",
        });

        results.errors++;
        results.items.push({
          index,
          ok: false,
          reason: "insert_failed",
          message: "No se pudo importar esta fila.",
        });
      }
    }

    return res.status(200).json({
      ok: true,
      ...results,
    });
  })
);

/**
 * POST /contacts
 * Admin/owner: debe elegir la visibilidad.
 * Member: conserva la creación compartida en su workspace.
 */
router.post(
  "/contacts",
  canWrite("contacts"),
  wrap(async (req, res) => {
    const body = req.body || {};
    const userId = resolveUserId(req);
    const tenantId = req.tenantId;

    if (!userId || !tenantId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const id = coerceStr(body.id);
    const name = coerceStr(body.name);
    const email = normalizeEmail(body.email);
    const phone = coerceStr(body.phone);
    const company = coerceStr(body.company);
    const position = coerceStr(body.position);
    const accountId = coerceStr(body.account_id);
    const clientType = safeClientType(body.client_type);

    if (!id || !name) {
      return res.status(400).json({ error: "id_and_name_required" });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return res.status(400).json({ error: "invalid_contact_id" });
    }

    const admin = req.isAdmin === true;
    let visibility = coerceStr(body.visibility);

    if (admin) {
      if (!["private", "workspace", "selected"].includes(visibility)) {
        return res.status(400).json({
          error: "visibility_required",
          message: "Selecciona quién puede ver este contacto.",
        });
      }
    } else {
      if (visibility && visibility !== "workspace") {
        return res.status(403).json({
          error: "visibility_admin_required",
        });
      }

      visibility = "workspace";
    }

    const rawSharedIds = body.shared_user_ids ?? [];

    if (
      !Array.isArray(rawSharedIds) ||
      rawSharedIds.length > 200 ||
      rawSharedIds.some(
        (value) => typeof value !== "string" || !value.trim()
      )
    ) {
      return res.status(400).json({ error: "invalid_shared_user_ids" });
    }

    const sharedIds = [
      ...new Set(rawSharedIds.map((value) => value.trim())),
    ].filter((value) => value !== userId);

    if (visibility === "selected" && sharedIds.length === 0) {
      return res.status(400).json({
        error: "shared_users_required",
        message: "Selecciona al menos otro usuario del workspace.",
      });
    }

    if (visibility !== "selected" && sharedIds.length > 0) {
      return res.status(400).json({
        error: "shared_users_not_allowed",
        message: "La lista de usuarios solo aplica a Usuarios seleccionados.",
      });
    }

    const client = await db.pool.connect();

    try {
      await client.query("BEGIN");

      if (accountId) {
        const account = await client.query(
          `SELECT id
           FROM accounts
           WHERE id = $1 AND tenant_id = $2
           LIMIT 1`,
          [accountId, tenantId]
        );

        if (account.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "invalid_account_id" });
        }
      }

      if (visibility === "selected") {
        // Misma definición de integrantes que /workspace/members.
        // No incluye administradores ajenos automáticamente.
        const members = await client.query(
          `
          SELECT u.id
          FROM users u
          JOIN (
            SELECT user_id
            FROM tenant_memberships
            WHERE tenant_id = $1

            UNION

            SELECT user_id
            FROM memberships
            WHERE tenant_id = $1

            UNION

            SELECT created_by AS user_id
            FROM tenants
            WHERE id = $1
          ) members ON members.user_id = u.id
          WHERE u.id = ANY($2::text[])
            AND COALESCE(u.active, TRUE) = TRUE
          `,
          [tenantId, sharedIds]
        );

        if (members.rows.length !== sharedIds.length) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error: "invalid_shared_users",
            message:
              "Los usuarios seleccionados deben estar activos y pertenecer al workspace.",
          });
        }
      }

      const now = Date.now();

      const inserted = await client.query(
        `
        INSERT INTO contacts (
          id, name, email, phone, company, position,
          account_id, client_type, tenant_id, created_by,
          created_at, updated_at, visibility
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12, $13
        )
        RETURNING *
        `,
        [
          id,
          name,
          email,
          phone,
          company,
          position,
          accountId,
          clientType,
          tenantId,
          userId,
          now,
          now,
          visibility,
        ]
      );

      if (visibility === "selected") {
        await client.query(
          `
          INSERT INTO contact_shares (
            tenant_id, contact_id, user_id, created_at
          )
          SELECT $1, $2, selected.user_id, $4
          FROM unnest($3::text[]) AS selected(user_id)
          `,
          [tenantId, id, sharedIds, now]
        );
      }

      await client.query("COMMIT");

      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Location", `/contacts/${id}`);

      return res.status(201).json({
        ok: true,
        message: "Contacto guardado",
        contact: {
          ...inserted.rows[0],
          shared_user_ids: visibility === "selected" ? sharedIds : [],
        },
      });
    } catch (err) {
      await client.query("ROLLBACK");

      if (err.code === "23505") {
        return res.status(409).json({ error: "contact_exists" });
      }

      throw err;
    } finally {
      client.release();
    }
  })
);

/**
 * PATCH /contacts/:id
 * Conserva los permisos de edición existentes.
 * Solo el creador, siendo admin/owner, modifica la visibilidad.
 */
router.patch(
  "/contacts/:id",
  canWrite("contacts"),
  wrap(async (req, res) => {
    const body = req.body || {};
    const userId = resolveUserId(req);
    const tenantId = req.tenantId;

    if (!userId || !tenantId) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const has = (key) =>
      Object.prototype.hasOwnProperty.call(body, key);

    const changesSharing =
      has("visibility") || has("shared_user_ids");

    const client = await db.pool.connect();

    try {
      await client.query("BEGIN");

      // Bloquea el contacto mientras se actualizan sus datos y permisos.
      const filter = contactVisibilityFilter(req, "c");

      let parameterIndex = 0;
      const sql = `
        SELECT c.*
        FROM contacts c
        WHERE c.id = ?
          AND ${filter.sql}
        FOR UPDATE OF c
      `.replace(/\?/g, () => `$${++parameterIndex}`);

      const result = await client.query(
        sql,
        [req.params.id, ...filter.params]
      );

      const found = result.rows[0];

      if (!found) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "not_found" });
      }

      const admin = req.isAdmin === true;

      // Revalida ownership después de adquirir el bloqueo.
      if (!admin && found.created_by !== userId) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: "forbidden_not_owner" });
      }

      const managesSharing =
        admin && found.created_by === userId;

      if (changesSharing && !managesSharing) {
        await client.query("ROLLBACK");
        return res.status(403).json({
          error: "sharing_forbidden",
          message:
            "Solo el administrador que creó el contacto puede cambiar su visibilidad.",
        });
      }

      const name = has("name") ? coerceStr(body.name) : found.name;

      if (!name) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "name_required" });
      }

      const email = has("email")
        ? normalizeEmail(body.email)
        : found.email;

      const phone = has("phone")
        ? coerceStr(body.phone)
        : found.phone;

      const company = has("company")
        ? coerceStr(body.company)
        : found.company;

      const position = has("position")
        ? coerceStr(body.position)
        : found.position;

      const accountId = has("account_id")
        ? coerceStr(body.account_id) || null
        : found.account_id;

      const clientType = has("client_type")
        ? safeClientType(body.client_type)
        : found.client_type;

      if (accountId) {
        const account = await client.query(
          `SELECT id FROM accounts
           WHERE id = $1 AND tenant_id = $2
           LIMIT 1`,
          [accountId, tenantId]
        );

        if (account.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "invalid_account_id" });
        }
      }

      const visibility = has("visibility")
        ? coerceStr(body.visibility)
        : found.visibility;

      if (!["private", "workspace", "selected"].includes(visibility)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "invalid_visibility" });
      }

      let sharedIds = [];

      if (changesSharing) {
        if (has("shared_user_ids")) {
          const rawIds = body.shared_user_ids;

          if (
            !Array.isArray(rawIds) ||
            rawIds.length > 200 ||
            rawIds.some(
              (value) => typeof value !== "string" || !value.trim()
            )
          ) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              error: "invalid_shared_user_ids",
            });
          }

          sharedIds = [
            ...new Set(rawIds.map((value) => value.trim())),
          ].filter((value) => value !== userId);
        } else if (visibility === "selected") {
          const existingShares = await client.query(
            `SELECT user_id FROM contact_shares
             WHERE tenant_id = $1 AND contact_id = $2`,
            [tenantId, found.id]
          );

          sharedIds = existingShares.rows
            .map((share) => share.user_id)
            .filter((id) => id !== userId);
        }

        if (visibility !== "selected" && sharedIds.length > 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error: "shared_users_not_allowed",
          });
        }

        if (visibility === "selected") {
          if (sharedIds.length === 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              error: "shared_users_required",
              message: "Selecciona al menos otro usuario del workspace.",
            });
          }

          const members = await client.query(
            `
            SELECT u.id
            FROM users u
            JOIN (
              SELECT user_id FROM tenant_memberships
              WHERE tenant_id = $1

              UNION

              SELECT user_id FROM memberships
              WHERE tenant_id = $1

              UNION

              SELECT created_by AS user_id FROM tenants
              WHERE id = $1
            ) members ON members.user_id = u.id
            WHERE u.id = ANY($2::text[])
              AND COALESCE(u.active, TRUE) = TRUE
            `,
            [tenantId, sharedIds]
          );

          if (members.rows.length !== sharedIds.length) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              error: "invalid_shared_users",
              message:
                "Los usuarios deben estar activos y pertenecer al workspace.",
            });
          }
        }
      }

      const now = Date.now();

      const updated = await client.query(
        `
        UPDATE contacts
        SET name = $1, email = $2, phone = $3,
            company = $4, position = $5,
            account_id = $6, client_type = $7,
            visibility = $8, updated_at = $9
        WHERE id = $10 AND tenant_id = $11
        RETURNING *
        `,
        [
          name, email, phone, company, position,
          accountId, clientType, visibility, now,
          found.id, tenantId,
        ]
      );

      if (changesSharing) {
        await client.query(
          `DELETE FROM contact_shares
           WHERE tenant_id = $1 AND contact_id = $2`,
          [tenantId, found.id]
        );

        if (visibility === "selected") {
          await client.query(
            `
            INSERT INTO contact_shares (
              tenant_id, contact_id, user_id, created_at
            )
            SELECT $1, $2, selected.user_id, $4
            FROM unnest($3::text[]) AS selected(user_id)
            `,
            [tenantId, found.id, sharedIds, now]
          );
        }
      }

      const contact = updated.rows[0];
      contact.can_manage_sharing = managesSharing;

      if (managesSharing) {
        const shares = await client.query(
          `SELECT user_id FROM contact_shares
           WHERE tenant_id = $1 AND contact_id = $2
           ORDER BY user_id`,
          [tenantId, found.id]
        );

        contact.shared_user_ids = shares.rows.map(
          (share) => share.user_id
        );
      }

      await client.query("COMMIT");

      res.setHeader("Cache-Control", "no-store");
      return res.json(contact);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

/**
 * DELETE /contacts/:id
 */
router.delete(
  "/contacts/:id",
  canDelete("contacts"),
  wrap(async (req, res) => {

    const found = await getVisibleContact(req, req.params.id);

    if (!found) {
      return res.status(404).json({ error: "not_found" });
    }
    const info = await db
      .prepare(`DELETE FROM contacts WHERE id = ? AND tenant_id = ?`)
      .run(req.params.id, req.tenantId);

    if (info.changes === 0)
      return res.status(404).json({ error: "not_found" });

    res.json({ ok: true });
  })
);
module.exports = router;