// server/routes/auth.js
const { Router } = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../db/connection");
const { log: auditLog, ACTIONS } = require("../lib/auditLog");
const { sendMail } = require("../lib/mailer");

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const TOKEN_TTL = process.env.JWT_TTL || "7d";
const DEFAULT_TENANT = process.env.DEFAULT_TENANT || "demo";

const RESET_TTL_MINUTES = Number(process.env.RESET_TTL_MINUTES || 30);
const RESET_LINK_BASE_URL = process.env.RESET_LINK_BASE_URL || "";

const newId = () => crypto.randomUUID();
const now = () => Date.now();

const signToken = (payload) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });

function sha256(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

function sanitizeEmail(v) {
  return String(v || "").trim().toLowerCase();
}

/* =========================================================
   ✅ DB helpers (soporta wrappers distintos)
   ========================================================= */

async function dbRows(sql, params = []) {
  const r = await db.query(sql, params);

  // Caso pg estándar: { rows: [...] }
  if (r && Array.isArray(r.rows)) return r.rows;

  // Caso wrapper: devuelve array directo
  if (Array.isArray(r)) return r;

  // Caso raro: devuelve { data: [...] }
  if (r && Array.isArray(r.data)) return r.data;

  return [];
}

async function dbOne(sql, params = []) {
  const rows = await dbRows(sql, params);
  return rows[0] || null;
}

async function ensureDefaultTenant() {
  const tenant = await dbOne(
    `SELECT id, name FROM tenants WHERE id = $1 LIMIT 1`,
    [DEFAULT_TENANT]
  );
  if (tenant) return tenant;

  await dbRows(
    `INSERT INTO tenants (id, name, created_at, updated_at)
     VALUES ($1,$2,$3,$4)`,
    [DEFAULT_TENANT, "Demo", now(), now()]
  );

  return { id: DEFAULT_TENANT, name: "Demo" };
}

async function ensurePasswordResetsTablePg() {
  await dbRows(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      created_at BIGINT NOT NULL,
      used_at BIGINT
    );
  `);

  await dbRows(`
    CREATE INDEX IF NOT EXISTS idx_password_resets_user_id
    ON password_resets(user_id);
  `);

  await dbRows(`
    CREATE INDEX IF NOT EXISTS idx_password_resets_token_hash
    ON password_resets(token_hash);
  `);
}

/* =======================
   LOGIN
   ======================= */
router.post("/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const headerTenant = req.get("X-Tenant-Id")?.trim() || null;

    // Demo
    if (email === "admin@demo.local" && password === "demo") {
      const payload = {
        sub: "demo-admin",
        email,
        active_tenant: headerTenant || DEFAULT_TENANT,
        role: "admin",
      };
      const token = signToken(payload);
      return res.json({
        token,
        active_tenant: payload.active_tenant,
        role: "admin",
      });
    }

    if (!email || !password) {
      return res.status(400).json({ error: "email_y_password_requeridos" });
    }

    const lowerEmail = sanitizeEmail(email);

    const user = await dbOne(`SELECT * FROM users WHERE email = $1 LIMIT 1`, [
      lowerEmail,
    ]);

    if (!user) {
      auditLog(
        { action: ACTIONS.LOGIN_FAILED, details: { email: lowerEmail, reason: "user_not_found" } },
        req
      ).catch(console.error);
      return res.status(401).json({ error: "credenciales_invalidas" });
    }

    const ok = bcrypt.compareSync(String(password), user.password_hash || "");
    if (!ok) {
      auditLog(
        { userId: user.id, action: ACTIONS.LOGIN_FAILED, details: { email: lowerEmail, reason: "invalid_password" } },
        req
      ).catch(console.error);
      return res.status(401).json({ error: "credenciales_invalidas" });
    }

    const activeTenant = headerTenant || DEFAULT_TENANT;
    const userRole = user.role || "member";

    const payload = {
      sub: user.id,
      email: user.email,
      active_tenant: activeTenant,
      role: userRole,
    };

    const token = signToken(payload);

    auditLog(
      {
        userId: user.id,
        tenantId: activeTenant,
        action: ACTIONS.LOGIN,
        details: { email: user.email, tenant: activeTenant, role: userRole },
      },
      req
    ).catch(console.error);

    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: userRole,
      token,
      active_tenant: activeTenant,
      tenant: { id: activeTenant, name: "Demo" },
    });
  } catch (e) {
    next(e);
  }
});

/* =======================
   REGISTER
   ======================= */
router.post("/auth/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: "name_email_password_requeridos" });
    }

    const lowerEmail = sanitizeEmail(email);
    const exists = await dbOne(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [
      lowerEmail,
    ]);
    if (exists) return res.status(409).json({ error: "email_ya_registrado" });

    const userId = newId();
    const userName = String(name).trim();
    const passwordHash = bcrypt.hashSync(String(password), 10);
    const timestamp = now();
    const globalRole = "member";

    await dbRows(
      `INSERT INTO users (id, name, email, password_hash, role, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId, userName, lowerEmail, passwordHash, globalRole, timestamp, timestamp]
    );

    const tenant = await ensureDefaultTenant();

    const payload = {
      sub: userId,
      email: lowerEmail,
      active_tenant: tenant.id,
      role: globalRole,
    };

    const token = signToken(payload);

    auditLog(
      {
        userId,
        tenantId: tenant.id,
        action: ACTIONS.REGISTER,
        details: { email: lowerEmail, name: userName, role: globalRole },
      },
      req
    ).catch(console.error);

    return res.status(201).json({
      id: userId,
      name: userName,
      email: lowerEmail,
      token,
      active_tenant: tenant.id,
      role: globalRole,
      tenant,
    });
  } catch (e) {
    next(e);
  }
});

/* =======================
   FORGOT PASSWORD
   ======================= */
router.post("/auth/forgot-password", async (req, res, next) => {
  try {
    await ensurePasswordResetsTablePg();

    const okResponse = () =>
      res.json({
        ok: true,
        message: "Si el correo existe, te enviamos un código para recuperar tu contraseña.",
      });

    const email = sanitizeEmail(req.body?.email);
    if (!email) return okResponse();

    const user = await dbOne(
      `SELECT id, email, name FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );

    if (!user) {
      auditLog(
        { action: ACTIONS.LOGIN_FAILED, details: { email, reason: "forgot_password_user_not_found" } },
        req
      ).catch(console.error);
      return okResponse();
    }

    const userEmail = sanitizeEmail(user.email);
    if (!userEmail) return okResponse();

    const token = crypto.randomBytes(24).toString("hex");
    const tokenHash = sha256(token);
    const createdAt = now();
    const expiresAt = createdAt + RESET_TTL_MINUTES * 60 * 1000;

    // invalidar previos
    await dbRows(`DELETE FROM password_resets WHERE user_id = $1`, [user.id]);

    // insertar
    const resetId = newId();
    await dbRows(
      `INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at, used_at)
       VALUES ($1,$2,$3,$4,$5,NULL)`,
      [resetId, user.id, tokenHash, expiresAt, createdAt]
    );

    const displayName = user.name || user.email;

    const maybeLink =
      RESET_LINK_BASE_URL
        ? `${RESET_LINK_BASE_URL}${RESET_LINK_BASE_URL.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`
        : "";

    const subject = "Recuperación de contraseña";
    const text =
      `Tu token de recuperación es: ${token}\n` +
      `Vence en ${RESET_TTL_MINUTES} minutos.` +
      (maybeLink ? `\nLink: ${maybeLink}` : "");

    const html = `
      <div style="font-family:Arial,sans-serif; line-height:1.5;">
        <p>Hola ${String(displayName).replace(/</g, "&lt;")},</p>
        <p>Recibimos una solicitud para restablecer tu contraseña.</p>
        <p><strong>Tu código/token de recuperación:</strong></p>
        <p style="font-size:16px; padding:10px 12px; background:#f4f4f5; display:inline-block; border-radius:8px;">
          ${token}
        </p>
        <p>Este código vence en <strong>${RESET_TTL_MINUTES} minutos</strong>.</p>
        ${maybeLink ? `<p><a href="${maybeLink}">${maybeLink}</a></p>` : ""}
        <p>Si tú no solicitaste esto, ignora este correo.</p>
      </div>
    `;

    // ✅ tu mailer pide objeto
    await sendMail({ to: userEmail, subject, text, html });

    auditLog(
      {
        userId: user.id,
        tenantId: DEFAULT_TENANT,
        action: ACTIONS.PASSWORD_RESET_REQUESTED || "password_reset_requested",
        details: { email: userEmail },
      },
      req
    ).catch(console.error);

    return okResponse();
  } catch (e) {
    next(e);
  }
});

/* =======================
   RESET PASSWORD
   ======================= */
router.post("/auth/reset-password", async (req, res, next) => {
  try {
    await ensurePasswordResetsTablePg();

    const token = String(req.body?.token || "").trim();
    const newPassword = String(req.body?.newPassword || "");

    if (!token || !newPassword) {
      return res.status(400).json({ error: "token_y_newPassword_requeridos" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "password_muy_corta" });
    }

    const tokenHash = sha256(token);

    const row = await dbOne(
      `SELECT id, user_id, expires_at, used_at
       FROM password_resets
       WHERE token_hash = $1
       LIMIT 1`,
      [tokenHash]
    );

    if (!row) return res.status(400).json({ error: "token_invalido" });
    if (row.used_at) return res.status(400).json({ error: "token_ya_usado" });
    if (Number(row.expires_at) < now()) return res.status(400).json({ error: "token_expirado" });

    const user = await dbOne(`SELECT id, email FROM users WHERE id = $1 LIMIT 1`, [
      row.user_id,
    ]);
    if (!user) return res.status(400).json({ error: "usuario_no_existe" });

    const passwordHash = bcrypt.hashSync(newPassword, 10);
    const ts = now();

    await dbRows(
      `UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3`,
      [passwordHash, ts, user.id]
    );

    await dbRows(`UPDATE password_resets SET used_at = $1 WHERE id = $2`, [
      ts,
      row.id,
    ]);

    auditLog(
      {
        userId: user.id,
        tenantId: DEFAULT_TENANT,
        action: ACTIONS.PASSWORD_RESET_COMPLETED || "password_reset_completed",
        details: { email: user.email },
      },
      req
    ).catch(console.error);

    return res.json({ ok: true, message: "Contraseña actualizada" });
  } catch (e) {
    next(e);
  }
});

/* =======================
   ME
   ======================= */
router.get("/auth/me", async (req, res) => {
  try {
    const raw = req.get("authorization") || "";
    const m = raw.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ error: "missing_bearer" });

    const decoded = jwt.verify(m[1], JWT_SECRET);
    const activeTenant = decoded.active_tenant || DEFAULT_TENANT;

    let user = await dbOne(
      `SELECT id, name, email FROM users WHERE id = $1 LIMIT 1`,
      [decoded.sub]
    );

    if (!user) {
      user = {
        id: decoded.sub,
        name: decoded.email?.split("@")[0] || "Usuario",
        email: decoded.email || "demo@local",
      };
    }

    const tenant =
      (await dbOne(`SELECT id, name FROM tenants WHERE id = $1 LIMIT 1`, [
        activeTenant,
      ])) || { id: activeTenant, name: activeTenant };

    return res.json({
      ok: true,
      user,
      tenant,
      role: decoded.role,
    });
  } catch (e) {
    return res.status(401).json({ error: "invalid_token", message: e.message });
  }
});

module.exports = router;

// // server/routes/auth.js
// const { Router } = require("express");
// const jwt = require("jsonwebtoken");
// const bcrypt = require("bcryptjs");
// const crypto = require("crypto");
// const db = require("../db/connection");
// const { log: auditLog, ACTIONS } = require("../lib/auditLog");

// const router = Router();
// const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
// const TOKEN_TTL = process.env.JWT_TTL || "7d";
// const DEFAULT_TENANT = process.env.DEFAULT_TENANT || "demo";

// const newId = () => crypto.randomUUID();
// const now = () => Date.now();
// const signToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });

// /* Helpers - ⚠️ DEPRECADOS (sistema simplificado sin memberships) */
// async function getMembership(userId, tenantId) {
//   // Mantener por compatibilidad temporal - siempre retorna null
//   return null;
// }

// async function getFirstMembership(userId) {
//   // Mantener por compatibilidad temporal - siempre retorna null
//   return null;
// }

// function rolesFromMembershipRole(role) {
//   // Mantener por compatibilidad temporal
//   const base = { user: true };
//   if (role === "owner") return { ...base, owner: true, admin: true };
//   if (role === "admin") return { ...base, admin: true };
//   return base; // member
// }


// // ⚠️ YA NO SE USA - sistema simplificado sin memberships
// // Mantener por compatibilidad temporal (siempre retorna DEFAULT_TENANT)
// async function resolveActiveTenantForLogin(req, userId) {
//   return { id: DEFAULT_TENANT, name: "Demo" };
// }

// /* =======================
//    LOGIN (dev + real)
//    ======================= */
// router.post("/auth/login", async (req, res, next) => {
//   try {
//     const { email, password } = req.body || {};
//     const headerTenant = req.get("X-Tenant-Id")?.trim() || null;

//     // Fast-path demo
//     if (email === "admin@demo.local" && password === "demo") {
//       const payload = {
//         sub: "demo-admin",
//         email,
//         active_tenant: headerTenant || DEFAULT_TENANT,
//         role: "admin", // Rol global
//       };
//       const token = signToken(payload);
//       return res.json({ token, active_tenant: payload.active_tenant, role: "admin" });
//     }

//     if (!email || !password) {
//       return res.status(400).json({ error: "email_y_password_requeridos" });
//     }

//     const user = await db
//       .prepare(`SELECT * FROM users WHERE email = ?`)
//       .get(String(email).toLowerCase());
    
//     if (!user) {
//       // 📝 Audit: login fallido (fire and forget)
//       auditLog({ action: ACTIONS.LOGIN_FAILED, details: { email, reason: "user_not_found" } }, req).catch(console.error);
//       return res.status(401).json({ error: "credenciales_invalidas" });
//     }

//     const ok = bcrypt.compareSync(String(password), user.password_hash || "");
//     if (!ok) {
//       // 📝 Audit: login fallido (fire and forget)
//       auditLog({ userId: user.id, action: ACTIONS.LOGIN_FAILED, details: { email, reason: "invalid_password" } }, req).catch(console.error);
//       return res.status(401).json({ error: "credenciales_invalidas" });
//     }

//     // Tenant activo: header o default
//     const activeTenant = headerTenant || DEFAULT_TENANT;
//     const userRole = user.role || "member"; // Rol global del usuario

//     const payload = {
//       sub: user.id,
//       email: user.email,
//       active_tenant: activeTenant,
//       role: userRole, // Rol global
//     };

//     const token = signToken(payload);
    
//     // 📝 Audit: login exitoso (fire and forget)
//     auditLog({ 
//       userId: user.id, 
//       tenantId: activeTenant,
//       action: ACTIONS.LOGIN, 
//       details: { email: user.email, tenant: activeTenant, role: userRole } 
//     }, req).catch(console.error);
    
//     return res.json({
//       id: user.id,
//       name: user.name,
//       email: user.email,
//       role: userRole,
//       token,
//       active_tenant: activeTenant,
//       tenant: { id: activeTenant, name: "Demo" },
//     });
//   } catch (e) {
//     next(e);
//   }
// });

// /* =======================
//    REGISTER
//    ======================= */
// router.post("/auth/register", async (req, res, next) => {
//   try {
//     const { name, email, password } = req.body || {};
//     if (!name || !email || !password) {
//       return res.status(400).json({ error: "name_email_password_requeridos" });
//     }

//     const lowerEmail = String(email).toLowerCase().trim();
//     const exists = await db.prepare(`SELECT id FROM users WHERE email = ?`).get(lowerEmail);
//     if (exists) return res.status(409).json({ error: "email_ya_registrado" });

//     const userId = newId();
//     const userName = String(name).trim();
//     const passwordHash = bcrypt.hashSync(String(password), 10);
//     const timestamp = now();

//     // 🔑 ROL GLOBAL: Todos los usuarios nuevos son 'member' por defecto
//     const globalRole = 'member';

//     await db.prepare(
//       `INSERT INTO users (id, name, email, password_hash, role, created_at, updated_at)
//        VALUES (?, ?, ?, ?, ?, ?, ?)`
//     ).run(userId, userName, lowerEmail, passwordHash, globalRole, timestamp, timestamp);

//     console.log(`✅ Nuevo usuario registrado: ${lowerEmail} con rol global '${globalRole}'`);

//     // ===================================================================
//     // NUEVO SISTEMA: Usuarios nuevos son "member" en workspace DEFAULT
//     // Solo admin/owner pueden crear workspaces nuevos
//     // ===================================================================
    
//     // Verificar que existe el workspace por defecto
//     const defaultTenant = await db
//       .prepare(`SELECT id, name FROM tenants WHERE id = ?`)
//       .get(DEFAULT_TENANT);
    
//     if (!defaultTenant) {
//       // Crear workspace 'demo' si no existe
//       await db.prepare(
//         `INSERT INTO tenants (id, name, created_at, updated_at)
//          VALUES (?, 'Demo', ?, ?)`
//       ).run(DEFAULT_TENANT, now(), now());
//     }

//     // ⚠️ YA NO HAY MEMBERSHIPS - sistema simplificado usa solo roles globales
//     console.log(`   └─ Workspace por defecto: '${DEFAULT_TENANT}'`);

//     // Activo = workspace por defecto
//     const activeTenant = DEFAULT_TENANT;

//     const payload = {
//       sub: userId,
//       email: lowerEmail,
//       active_tenant: activeTenant,
//       role: globalRole, // Rol global del usuario
//     };
//     const token = signToken(payload);

//     // 📝 Audit: nuevo usuario registrado (fire and forget)
//     auditLog({ 
//       userId: userId, 
//       tenantId: DEFAULT_TENANT,
//       action: ACTIONS.REGISTER, 
//       details: { email: lowerEmail, name: userName, role: globalRole } 
//     }, req).catch(console.error);

//     return res.status(201).json({
//       id: userId,
//       name: userName,
//       email: lowerEmail,
//       token,
//       active_tenant: activeTenant,
//       role: globalRole, // Rol global
//       tenant: { id: DEFAULT_TENANT, name: defaultTenant?.name || "Demo" },
//     });
//   } catch (e) {
//     next(e);
//   }
// });

// /* =======================
//    ME
//    ======================= */
// router.get("/auth/me", (req, res) => {
//   try {
//     const raw = req.get("authorization") || "";
//     const m = raw.match(/^Bearer\s+(.+)$/i);
//     if (!m) return res.status(401).json({ error: "missing_bearer" });

//     const decoded = jwt.verify(m[1], JWT_SECRET);
//     const activeTenant = decoded.active_tenant || DEFAULT_TENANT;

//     let user =
//       db
//         .prepare(`SELECT id, name, email FROM users WHERE id = ?`)
//         .get(decoded.sub);

//     // ✅ FALLBACK LIMPIO PARA DEMO
//     if (!user) {
//       user = {
//         id: decoded.sub,
//         name: decoded.email?.split("@")[0] || "Usuario",
//         email: decoded.email || "demo@local",
//       };
//     }

//     const tenant =
//       db
//         .prepare(`SELECT id, name FROM tenants WHERE id = ?`)
//         .get(activeTenant) || { id: activeTenant, name: activeTenant };

//     return res.json({
//       ok: true,
//       user,
//       tenant,
//       role: decoded.role,
//     });
//   } catch (e) {
//     return res.status(401).json({ error: "invalid_token", message: e.message });
//   }
// });


// module.exports = router;

