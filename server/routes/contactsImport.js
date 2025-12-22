// server/routes/contactsImport.js
const { Router } = require("express");
const multer = require("multer");
const crypto = require("crypto");
const { parse } = require("csv-parse/sync");

const db = require("../db/connection");

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Middleware simple: permite admin u owner
 * (No dependemos de requireRole, así evitamos el problema)
 */
function requireAdminOrOwner(req, res, next) {
  const role = req?.tenant?.role || req?.user?.role;
  if (role === "admin" || role === "owner") return next();
  return res.status(403).json({ error: "forbidden", message: "Solo admin/owner" });
}

/**
 * POST /workspaces/:workspaceId/contacts/import
 * multipart/form-data, field: file
 */
router.post(
  "/workspaces/:workspaceId/contacts/import",
  requireAdminOrOwner,
  upload.single("file"),
  async (req, res) => {

    console.log("🟣 [IMPORT] HIT /workspaces/:id/contacts/import");
console.log("🟣 [IMPORT] content-type:", req.headers["content-type"]);
console.log("🟣 [IMPORT] tenant:", req.tenant?.id, "user:", req.user?.id);
console.log("🟣 [IMPORT] has file:", !!req.file);
if (req.file) {
  console.log("🟣 [IMPORT] file meta:", {
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
  });
}

    try {
      if (!req.file) {
        return res.status(400).json({ error: "file_required", message: "CSV requerido" });
      }

      // Ojo: aquí NO confiamos en :workspaceId para insertar,
      // usamos SIEMPRE el tenant resuelto por injectTenant.
      const tenantId = req?.tenant?.id; // en tus logs viene "jesus"
      const userId = req?.user?.id;

      if (!tenantId) {
        return res.status(400).json({ error: "tenant_missing", message: "Tenant no resuelto" });
      }
      if (!userId) {
        return res.status(401).json({ error: "auth_missing", message: "Usuario no autenticado" });
      }

      const csvText = req.file.buffer.toString("utf8");

      // ✅ parse correcto (csv-parse/sync)
      const records = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_column_count: true,
      });
      console.log("🟣 [IMPORT] rows parsed:", records?.length);


      const now = Date.now();
      let inserted = 0;
      let skipped = 0;

      // Debug duro para que NO adivines:
      console.log("📥 CSV import:", {
        tenantId,
        userId,
        filename: req.file.originalname,
        size: req.file.size,
        rows: records.length,
      });

      for (const row of records) {
        // Normaliza claves posibles
        const name =
          row.Nombre || row.nombre || row.Name || row.name || row.NOMBRE || null;

        const email =
          row.Email || row.email || row.EMAIL || null;

        const company =
          row.Empresa || row.empresa || row.Company || row.company || row.EMPRESA || null;

        const position =
          row.Cargo || row.cargo || row.Position || row.position || row.CARGO || null;

        const phone =
          row.Telefono || row.telefono || row.Phone || row.phone || row.TELÉFONO || row.TELEFONO || null;

        // Fila completamente vacía => ignorar
        if (!name && !email && !company && !position && !phone) {
          skipped++;
          continue;
        }

        // DB: name es NOT NULL => fallback seguro
        const finalName = (name || "").trim() || (email || "").trim() || (company || "").trim() || "Contacto sin nombre";

        try {
          await db.query(
            `
            INSERT INTO contacts (
              id,
              name,
              email,
              phone,
              company,
              position,
              tenant_id,
              created_by,
              created_at,
              updated_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            `,
            [
              crypto.randomUUID(),
              finalName,
              email ? String(email).trim() : null,
              phone ? String(phone).trim() : null,
              company ? String(company).trim() : null,
              position ? String(position).trim() : null,
              tenantId,
              userId,
              now,
              now,
            ]
          );
          inserted++;
        } catch (e) {
          console.error("❌ Error insertando contacto:", e);
          skipped++;
        }
      }

      console.log("✅ CSV import done:", { inserted, skipped });

      return res.json({ ok: true, inserted, skipped });
    } catch (e) {
      console.error("❌ Import error:", e);
      return res.status(500).json({ error: "import_failed", message: String(e?.message || e) });
    }
  }
);

module.exports = router;
