// server/routes/invitations.js
const { Router } = require("express");
const jwt = require("jsonwebtoken");
const db = require("../db/connection");
const requireAuth = require("../lib/requireAuth");

// Si tienes hash util, lo usamos. Si no existe, se ignora y se guarda null.
let hash;
try {
  hash = require("../lib/hash");
} catch (_) {
  hash = null;
}

const router = Router();

const INVITE_SECRET = process.env.INVITE_SECRET || "dev-invite-secret";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// Utils
const ROLES = new Set(["owner", "admin", "member"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const trimStr = (v) => (typeof v === "string" ? v.trim() : v);

// 🔒 Todas las rutas de este archivo quedan protegidas porque en tu app.js
// montas `requireAuth` ANTES de este router. Conservamos ese comportamiento.
router.use(requireAuth);

/**
 * POST /tenants/:id/invitations
 * Crea una invitación (owner/admin). Si el rol solicitado es "owner",
 * solo un owner puede invitar como owner.
 * Body: { email, role = "member" }
 * Respuesta: { invite_token, expires_in: "3d" }
 */
router.post("/tenants/:id/invitations", async (req, res) => {
  const tenantId = String(req.params.id || "").trim();
  let { email, role = "member" } = req.body || {};
  email = trimStr(email);
  role = trimStr(role) || "member";

  if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "invalid_email" });
  }
  if (!ROLES.has(role)) {
    return res.status(400).json({ error: "invalid_role" });
  }

  // Verificar que el tenant exista
  const tenant = await db
    .prepare(`SELECT id, name FROM tenants WHERE id = ? LIMIT 1`)
    .get(tenantId);
  if (!tenant) return res.status(404).json({ error: "tenant_not_found" });

  // Verificar rol del emisor en ese tenant
  const userId = req.user?.id || req.auth?.sub;
  const membership = await db
    .prepare(
      `SELECT role FROM memberships WHERE user_id = ? AND tenant_id = ? LIMIT 1`
    )
    .get(userId, tenantId);
  if (!membership) return res.status(403).json({ error: "not_member_of_tenant" });

  const inviterRole = membership.role;
  const isAdminLike = inviterRole === "owner" || inviterRole === "admin";
  if (!isAdminLike) {
    return res.status(403).json({ error: "forbidden_role" });
  }
  if (role === "owner" && inviterRole !== "owner") {
    return res.status(403).json({ error: "only_owner_can_invite_owner" });
  }

  // Generar token de invitación
  const token = jwt.sign(
    { tenantId, email, role, type: "invite" },
    INVITE_SECRET,
    { expiresIn: "3d" }
  );

  // En producción enviarías por email; aquí lo devolvemos
  res.json({ invite_token: token, expires_in: "3d" });
});

/**
 * POST /invitations/accept
 * Acepta una invitación (con JWT de invitación).
 * Body: { token, name?, password? }
 * - Crea usuario si no existe (upsert por email)
 * - Crea membresía idempotente en el tenant indicado
 *
 * Nota: actualmente este endpoint queda PROTEGIDO por requireAuth global en app.js.
 * Si quieres que sea público, monta este router ANTES de requireAuth en app.js, o
 * separa este endpoint en otro router público.
 */
router.post("/invitations/accept", async (req, res) => {
  const { token, name, password } = req.body || {};
  if (!token) return res.status(400).json({ error: "invite_token_required" });

  try {
    const inv = jwt.verify(token, INVITE_SECRET);
    if (inv?.type !== "invite" || !inv.tenantId || !inv.email) {
      return res.status(400).json({ error: "invalid_invite_payload" });
    }

    // Verificar que el tenant exista
    const tenant = await db
      .prepare(`SELECT id FROM tenants WHERE id = ? LIMIT 1`)
      .get(inv.tenantId);
    if (!tenant) return res.status(404).json({ error: "tenant_not_found" });

    const now = Date.now();

    // Upsert user por email
    const existingUser = await db
      .prepare(`SELECT id, email, name FROM users WHERE email = ? LIMIT 1`)
      .get(inv.email);

    let userId;
    if (existingUser) {
      userId = existingUser.id;
      // Si mandan name y el user no lo tenía o distinto, puedes decidir actualizarlo
      if (name && name.trim() && name.trim() !== existingUser.name) {
        await db.prepare(
          `UPDATE users SET name = ?, updated_at = ? WHERE id = ?`
        ).run(name.trim(), now, userId);
      }
      // Si viene password y quieres actualizarlo:
      if (password && hash?.hashPassword) {
        const password_hash = hash.hashPassword(String(password));
        await db.prepare(
          `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`
        ).run(password_hash, now, userId);
      }
    } else {
      userId = `usr_${Date.now().toString(36)}${Math.random()
        .toString(36)
        .slice(2, 7)}`;

      const password_hash =
        password && hash?.hashPassword
          ? hash.hashPassword(String(password))
          : null;

      await db.prepare(
        `
        INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        userId,
        inv.email,
        name && name.trim() ? name.trim() : inv.email,
        password_hash,
        now,
        now
      );
    }

    // Crear membresía idempotente - PostgreSQL
    await db.prepare(
      `
      INSERT INTO memberships (user_id, tenant_id, role, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (user_id, tenant_id) DO NOTHING
    `
    ).run(userId, inv.tenantId, inv.role || "member", now);

    res.json({ ok: true, tenant_id: inv.tenantId, email: inv.email });
  } catch (e) {
    return res.status(400).json({ error: "invalid_or_expired_invite" });
  }
});

module.exports = router;

// // server/routes/invitations.js
// const { Router } = require("express");
// const jwt = require("jsonwebtoken");
// const db = require("../db/connection");
// const requireAuth = require("../lib/requireAuth");
// const router = Router();
// const INVITE_SECRET = process.env.INVITE_SECRET || "dev-invite-secret";

// router.use(requireAuth);

// // Crear invitación (admin/owner)
// router.post("/tenants/:id/invitations", (req, res) => {
//   const { id: tenantId } = req.params;
//   const { email, role = "member" } = req.body || {};
//   // TODO: validar roles del emisor
//   const token = jwt.sign(
//     { tenantId, email, role, type: "invite" },
//     INVITE_SECRET,
//     { expiresIn: "3d" }
//   );
//   // En prod: enviar por email. Dev: devolverlo
//   res.json({ invite_token: token, expires_in: "3d" });
// });

// // Aceptar invitación (pública)
// router.post("/invitations/accept", (req, res) => {
//   const { token, name, password } = req.body || {};
//   try {
//     const inv = jwt.verify(token, INVITE_SECRET);
//     const now = Date.now();

//     // upsert user
//     const userId = (db.prepare(`SELECT id FROM users WHERE email=?`).get(inv.email)?.id)
//       || `usr_${now}`;
//     if (!userId.startsWith("usr_")) {
//       // ya existe
//     } else {
//       db.prepare(`
//         INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
//         VALUES (?, ?, ?, ?, ?, ?)
//       `).run(userId, inv.email, name || inv.email, null, now, now);
//     }

//     // membership (idempotente)
//     db.prepare(`
//       INSERT OR IGNORE INTO memberships (user_id, tenant_id, role, created_at)
//       VALUES (?, ?, ?, ?)
//     `).run(userId, inv.tenantId, inv.role || "member", now);

//     res.json({ ok: true });
//   } catch (e) {
//     return res.status(400).json({ error: "invalid_or_expired_invite" });
//   }
// });

// module.exports = router;
