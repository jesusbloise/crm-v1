// server/routes/invitations.js
const { Router } = require("express");
const jwt = require("jsonwebtoken");
const db = require("../db/connection");
const requireAuth = require("../lib/requireAuth");
const router = Router();
const INVITE_SECRET = process.env.INVITE_SECRET || "dev-invite-secret";

router.use(requireAuth);

// Crear invitación (admin/owner)
router.post("/tenants/:id/invitations", (req, res) => {
  const { id: tenantId } = req.params;
  const { email, role = "member" } = req.body || {};
  // TODO: validar roles del emisor
  const token = jwt.sign(
    { tenantId, email, role, type: "invite" },
    INVITE_SECRET,
    { expiresIn: "3d" }
  );
  // En prod: enviar por email. Dev: devolverlo
  res.json({ invite_token: token, expires_in: "3d" });
});

// Aceptar invitación (pública)
router.post("/invitations/accept", (req, res) => {
  const { token, name, password } = req.body || {};
  try {
    const inv = jwt.verify(token, INVITE_SECRET);
    const now = Date.now();

    // upsert user
    const userId = (db.prepare(`SELECT id FROM users WHERE email=?`).get(inv.email)?.id)
      || `usr_${now}`;
    if (!userId.startsWith("usr_")) {
      // ya existe
    } else {
      db.prepare(`
        INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, inv.email, name || inv.email, null, now, now);
    }

    // membership (idempotente)
    db.prepare(`
      INSERT OR IGNORE INTO memberships (user_id, tenant_id, role, created_at)
      VALUES (?, ?, ?, ?)
    `).run(userId, inv.tenantId, inv.role || "member", now);

    res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ error: "invalid_or_expired_invite" });
  }
});

module.exports = router;
