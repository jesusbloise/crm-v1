// server/routes/dealDocuments.js
const { Router } = require("express");
const multer = require("multer");
const db = require("../db/connection");
const wrap = require("../lib/wrap");
const { resolveUserId } = require("../lib/authorize");
const { dealVisibilityFilter } = require("../lib/contactAccess");

const router = Router();

const TYPES = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 2,
    parts: 3,
    fieldSize: 1024,
  },
});

const METADATA = `
  doc.id, doc.tenant_id, doc.deal_id,
  doc.original_name, doc.extension, doc.mime_type,
  doc.byte_size, doc.version, doc.is_current,
  doc.quoted_amount, doc.uploaded_by, doc.created_at
`;

function fail(status, code, message) {
  const error = new Error(message || code);
  error.status = status;
  error.code = code;
  return error;
}

function query(client, sql, params = []) {
  let index = 0;
  return client.query(
    sql.replace(/\?/g, () => `$${++index}`),
    params
  );
}

async function accessibleDeal(req, client, lock = false) {
  const filter = dealVisibilityFilter(req, "d");
  const sql = `
    SELECT d.id
    FROM deals d
    WHERE d.id = ?
      AND ${filter.sql}
    LIMIT 1
    ${lock ? "FOR UPDATE OF d" : ""}
  `;
  const params = [req.params.dealId, ...filter.params];

  if (client) {
    const result = await query(client, sql, params);
    return result.rows[0];
  }

  return db.prepare(sql).get(...params);
}

// Comprueba permisos antes de recibir el archivo.
const requireDeal = wrap(async (req, res, next) => {
  if (!resolveUserId(req) || !req.tenantId) {
    throw fail(401, "unauthorized");
  }

  if (!(await accessibleDeal(req))) {
    throw fail(404, "not_found");
  }

  res.setHeader("Cache-Control", "no-store");
  next();
});

function validateFile(file) {
  if (!file || !file.size) {
    throw fail(400, "file_required", "Selecciona un documento.");
  }

  const name = String(file.originalname || "")
    .split(/[\\/]/).pop()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();

  if (!name || name.length > 255) {
    throw fail(400, "invalid_filename", "El nombre del archivo no es válido.");
  }

  const extension = name.split(".").pop().toLowerCase();

  if (!TYPES[extension]) {
    throw fail(
      400,
      "invalid_type",
      "Solo se permiten PDF, Word y Excel."
    );
  }

  // Comprobación básica de la cabecera.
  // No interpreta el contenido ni comprueba su importe.
  const buffer = file.buffer;
  const isPdf = buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  const isOle = buffer.subarray(0, 8).equals(
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  );
  const isZip = buffer.subarray(0, 4).equals(
    Buffer.from([0x50, 0x4b, 0x03, 0x04])
  );

  const valid =
    (extension === "pdf" && isPdf) ||
    (["doc", "xls"].includes(extension) && isOle) ||
    (["docx", "xlsx"].includes(extension) && isZip);

  if (!valid) {
    throw fail(
      400,
      "invalid_file_content",
      "El contenido no coincide con el formato esperado."
    );
  }

  return { name, extension, mime: TYPES[extension] };
}

function parseAmount(value) {
  if (value == null || value === "") return null;

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw fail(400, "invalid_quoted_amount", "Revisa el importe del presupuesto.");
  }

  const amount = Number(value);

  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw fail(400, "invalid_quoted_amount", "Revisa el importe del presupuesto.");
  }

  return amount;
}

/** Lista metadatos; nunca devuelve los archivos dentro del JSON. */
router.get(
  "/deals/:dealId/documents",
  requireDeal,
  wrap(async (req, res) => {
    const filter = dealVisibilityFilter(req, "d");

    const rows = await db.prepare(`
      SELECT ${METADATA}, u.name AS uploaded_by_name
      FROM deal_documents doc
      JOIN deals d
        ON d.id = doc.deal_id AND d.tenant_id = doc.tenant_id
      LEFT JOIN users u ON u.id = doc.uploaded_by
      WHERE doc.deal_id = ?
        AND ${filter.sql}
      ORDER BY doc.version DESC
    `).all(req.params.dealId, ...filter.params);

    res.json(rows);
  })
);

/**
 * El cliente envía un ID estable para reintentar sin duplicar
 * una versión cuando se pierde la respuesta del servidor.
 * La nueva versión pasa a ser la vigente.
 */
router.post(
  "/deals/:dealId/documents",
  requireDeal,
  upload.single("file"),
  wrap(async (req, res) => {
    const id = req.body?.id;

    if (
      typeof id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,200}$/.test(id)
    ) {
      throw fail(400, "invalid_document_id");
    }

    const file = validateFile(req.file);
    const amount = parseAmount(req.body?.quoted_amount);
    const client = await db.pool.connect();

    try {
      await client.query("BEGIN");

      // Serializa versiones y cambios de vigente por oportunidad.
      if (!(await accessibleDeal(req, client, true))) {
        throw fail(404, "not_found");
      }

      const previous = await query(client, `
        SELECT *
        FROM deal_documents
        WHERE id = ? AND tenant_id = ? AND deal_id = ?
      `, [id, req.tenantId, req.params.dealId]);

      if (previous.rows.length) {
        const saved = previous.rows[0];

        if (
          saved.uploaded_by !== resolveUserId(req) ||
          saved.original_name !== file.name ||
          String(saved.quoted_amount ?? "") !== String(amount ?? "") ||
          !saved.content.equals(req.file.buffer)
        ) {
          throw fail(
            409,
            "document_id_conflict",
            "Este identificador corresponde a otra carga."
          );
        }

        const { content, ...metadata } = saved;
        await client.query("COMMIT");
        return res.json(metadata);
      }

     const versionResult = await query(client, `
  UPDATE deals
  SET document_version = document_version + 1
  WHERE tenant_id = ? AND id = ?
  RETURNING document_version AS version
`, [req.tenantId, req.params.dealId]);

      await query(client, `
        UPDATE deal_documents
        SET is_current = FALSE
        WHERE tenant_id = ? AND deal_id = ?
          AND is_current = TRUE
      `, [req.tenantId, req.params.dealId]);

      const inserted = await query(client, `
        INSERT INTO deal_documents AS doc (
          id, tenant_id, deal_id, original_name, extension,
          mime_type, byte_size, content, version, is_current,
          quoted_amount, uploaded_by, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?, ?)
        RETURNING ${METADATA}
      `, [
        id, req.tenantId, req.params.dealId,
        file.name, file.extension, file.mime,
        req.file.size, req.file.buffer,
        versionResult.rows[0].version,
        amount, resolveUserId(req), Date.now(),
      ]);

      await client.query("COMMIT");
      return res.status(201).json(inserted.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

/** Permite recuperar una versión anterior como vigente. */
router.patch(
  "/deals/:dealId/documents/:documentId/current",
  requireDeal,
  wrap(async (req, res) => {
    const client = await db.pool.connect();

    try {
      await client.query("BEGIN");

      if (!(await accessibleDeal(req, client, true))) {
        throw fail(404, "not_found");
      }

      const target = await query(client, `
        SELECT id
        FROM deal_documents
        WHERE id = ? AND tenant_id = ? AND deal_id = ?
      `, [req.params.documentId, req.tenantId, req.params.dealId]);

      if (!target.rows.length) throw fail(404, "not_found");

      await query(client, `
        UPDATE deal_documents
        SET is_current = FALSE
        WHERE tenant_id = ? AND deal_id = ?
          AND is_current = TRUE
      `, [req.tenantId, req.params.dealId]);

      const result = await query(client, `
        UPDATE deal_documents AS doc
        SET is_current = TRUE
        WHERE id = ? AND tenant_id = ? AND deal_id = ?
        RETURNING ${METADATA}
      `, [req.params.documentId, req.tenantId, req.params.dealId]);

      await client.query("COMMIT");
      res.json(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

/** Descarga autenticada, sin URL pública. */
router.get(
  "/deals/:dealId/documents/:documentId/download",
  requireDeal,
  wrap(async (req, res) => {
    const filter = dealVisibilityFilter(req, "d");

    const file = await db.prepare(`
      SELECT doc.original_name, doc.content
      FROM deal_documents doc
      JOIN deals d
        ON d.id = doc.deal_id AND d.tenant_id = doc.tenant_id
      WHERE doc.id = ? AND doc.deal_id = ?
        AND ${filter.sql}
      LIMIT 1
    `).get(
      req.params.documentId,
      req.params.dealId,
      ...filter.params
    );

    if (!file) throw fail(404, "not_found");

    // Express genera Content-Disposition con el nombre escapado.
    res.attachment(file.original_name);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    res.send(file.content);
  })
);
/**
 * Elimina definitivamente un documento.
 * Exige el mismo acceso de gestión que las cargas y cambios de vigente.
 * No selecciona automáticamente otra versión como vigente.
 */
router.delete(
  "/deals/:dealId/documents/:documentId",
  requireDeal,
  wrap(async (req, res) => {
    const client = await db.pool.connect();

    try {
      await client.query("BEGIN");

      if (!(await accessibleDeal(req, client, true))) {
        throw fail(404, "not_found");
      }

      const result = await query(client, `
        DELETE FROM deal_documents
        WHERE id = ? AND tenant_id = ? AND deal_id = ?
        RETURNING id
      `, [
        req.params.documentId,
        req.tenantId,
        req.params.dealId,
      ]);

      if (!result.rowCount) throw fail(404, "not_found");

      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);
module.exports = router;