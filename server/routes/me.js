// server/routes/me.js
const { Router } = require("express");
const db = require("../db/connection");
const requireAuth = require("../lib/requireAuth");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const path = require("path");
const fs = require("fs");
const multer = require("multer");

const r = Router();
r.use(requireAuth);

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

/* =========================
   Uploads: avatar
========================= */
const uploadDir = path.join(__dirname, "..", "uploads", "avatars");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || ".jpg");
    cb(null, `${resolveUserId(req)}-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB
  fileFilter: (_req, file, cb) => {
    if (!String(file.mimetype || "").startsWith("image/")) {
      return cb(new Error("invalid_type"));
    }
    cb(null, true);
  },
});

// Resuelve el ID de usuario compatible con tus middlewares (req.user o req.auth)
function resolveUserId(req) {
  return req.user?.id || req.auth?.sub;
}

/* =========================================================
 *  Middleware local: resolver tenant activo para este router
 * =======================================================*/
r.use((req, _res, next) => {
  // Header tiene prioridad (permite cambiar rápido desde el cliente)
  const headerTenant =
    (req.get("x-tenant-id") || req.get("tenant") || "").trim() || null;

  // Si no hay header, cae al tenant del token (seteado en /me/tenant/switch)
  const tokenTenant = req.auth?.active_tenant || null;

  // Estándar interno para este router
  req.tenantId = headerTenant || tokenTenant || null;
  next();
});

// ========================= TENANTS =========================

/**
 * GET /me/tenants
 * Lista los workspaces del usuario.
 * - member: solo workspaces donde tiene fila en tenant_memberships
 * - admin/owner (rol GLOBAL): ve todos los workspaces, pero marcamos si es miembro
 */
r.get("/me/tenants", async (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthorized" });

  // Rol GLOBAL del usuario
  const user = await db
    .prepare(`SELECT role FROM users WHERE id = $1 LIMIT 1`)
    .get(userId);
  const userRole = user?.role || "member";

  let rows;

  if (userRole === "admin" || userRole === "owner") {
    // 🔹 Admin/owner global: ve TODOS los tenants
    rows = await db
      .prepare(
        `
        SELECT
          t.id,
          t.name,
          t.created_by,
          u.name  AS owner_name,
          u.email AS owner_email,
          tm.role AS membership_role,
          (t.created_by = $1) AS is_creator
        FROM tenants t
        LEFT JOIN tenant_memberships tm
          ON tm.tenant_id = t.id AND tm.user_id = $1
        LEFT JOIN users u ON u.id = t.created_by
        ORDER BY LOWER(t.name) ASC
      `
      )
      .all(userId);
  } else {
    // 🔹 Member normal: solo los tenants donde tiene membership
    rows = await db
      .prepare(
        `
        SELECT
          t.id,
          t.name,
          t.created_by,
          u.name  AS owner_name,
          u.email AS owner_email,
          tm.role AS membership_role,
          (t.created_by = $1) AS is_creator
        FROM tenant_memberships tm
        JOIN tenants t ON t.id = tm.tenant_id
        LEFT JOIN users u ON u.id = t.created_by
        WHERE tm.user_id = $1
        ORDER BY LOWER(t.name) ASC
      `
      )
      .all(userId);
  }

  const activeId = req.tenantId || rows[0]?.id || null;

  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    owner_name: r.owner_name,
    owner_email: r.owner_email,
    role: r.membership_role || "member",
    is_active: activeId === r.id,
    is_creator: !!r.is_creator,
  }));

  console.log(
    `📋 /me/tenants for user ${userId} (${userRole}):`,
    items.map((r) => ({ id: r.id, name: r.name, role: r.role }))
  );

  res.json({ items, active_tenant: activeId, user_role: userRole });
});

/**
 * POST /me/tenant/switch
 * Cambia el workspace "activo" y devuelve NUEVO JWT con rol global.
 * Body: { tenant_id }
 */
r.post("/me/tenant/switch", async (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthorized" });

  const { tenant_id } = req.body || {};
  if (!tenant_id) return res.status(400).json({ error: "tenant_id_required" });

  console.log("🔄 /me/tenant/switch:", { userId, tenant_id });

  // Verificar que el workspace existe
  const tenant = await db
    .prepare(`SELECT id, name FROM tenants WHERE id = $1 LIMIT 1`)
    .get(tenant_id);

  if (!tenant) {
    console.log("❌ Tenant not found:", tenant_id);
    return res.status(404).json({ error: "tenant_not_found" });
  }

  // Obtener rol global del usuario
  const user = await db
    .prepare(`SELECT role FROM users WHERE id = $1 LIMIT 1`)
    .get(userId);

  const userRole = user?.role || "member";

  // Rol que guardamos en tenant_memberships (por ahora lo dejamos igual)
  const membershipRole =
    userRole === "owner" || userRole === "admin" ? userRole : "member";

  // 👇 Asegurar que el usuario quede guardado en tenant_memberships
  const now = Date.now();
  await db.query(
    `
      INSERT INTO tenant_memberships (tenant_id, user_id, role, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tenant_id, user_id) DO NOTHING
    `,
    [tenant_id, userId, membershipRole, now, now]
  );

  console.log("👥 tenant_memberships asegurado en /me/tenant/switch:", {
    tenant_id,
    userId,
    role: membershipRole,
  });

  console.log("✅ Switch successful:", { tenant: tenant_id, role: userRole });

  const basePayload = {
    sub: req.auth?.sub || req.user?.id || userId,
    email: req.auth?.email || req.user?.email || undefined,
    role: userRole, // Rol global
    active_tenant: tenant_id,
  };

  const token = jwt.sign(basePayload, JWT_SECRET, { expiresIn: "7d" });

  res.json({
    token,
    active_tenant: tenant_id,
    tenant: { id: tenant_id, name: tenant.name, role: userRole },
  });
});

/**
 * GET /tenants/role
 * Devuelve el ROL GLOBAL del usuario.
 */
r.get("/tenants/role", async (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthorized" });

  const tenantId = req.tenantId || null;

  const user = await db
    .prepare(`SELECT role FROM users WHERE id = $1 LIMIT 1`)
    .get(userId);

  return res.json({
    tenant_id: tenantId,
    role: user?.role || "member",
  });
});

/* =========================================================
 *        PERFIL
 * =======================================================*/

r.get("/me/profile", (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthorized" });

  const user = db
    .prepare(
      `
      SELECT
        id, name, email, role,
        avatar_url, headline, bio,
        location, company, website,
        twitter, linkedin, github,
        phone, timezone,
        last_login_at,
        created_at, updated_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `
    )
    .get(userId);

  if (!user) return res.status(404).json({ error: "user_not_found" });

  const counts = db
    .prepare(
      `
      SELECT
        (SELECT COUNT(*) FROM memberships WHERE user_id = ?) AS workspaces_count,
        (SELECT COUNT(*) FROM memberships WHERE user_id = ? AND role = 'owner') AS owner_count
    `
    )
    .get(userId, userId);

  return res.json({ ...user, ...counts });
});

r.put("/me/profile", async (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthorized" });

  const body = req.body || {};

  const ALLOWED = new Set([
    "name",
    "avatar_url",
    "headline",
    "bio",
    "location",
    "company",
    "website",
    "twitter",
    "linkedin",
    "github",
    "phone",
    "timezone",
    "email",
  ]);

  const updates = [];
  const params = [];
  for (const k of Object.keys(body)) {
    if (!ALLOWED.has(k)) continue;
    if (k === "email") continue;
    updates.push(`${k} = ?`);
    params.push(body[k] ?? null);
  }

  if (Object.prototype.hasOwnProperty.call(body, "email")) {
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "invalid_email" });
    const dup = await db
      .prepare(`SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1`)
      .get(email, userId);
    if (dup) return res.status(409).json({ error: "email_in_use" });
    updates.push(`email = ?`);
    params.push(email);
  }

  if (updates.length === 0) {
    return res.json({ ok: true, updated: false });
  }

  const now = Date.now();
  updates.push(`updated_at = ?`);
  params.push(now);
  params.push(userId);

  try {
    await db
      .prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`)
      .run(...params);

    const fresh = await db
      .prepare(
        `
        SELECT id, name, email, avatar_url, headline, bio, location, company,
               website, twitter, linkedin, github, phone, timezone,
               last_login_at, created_at, updated_at
        FROM users WHERE id = ? LIMIT 1
      `
      )
      .get(userId);

    return res.json({ ok: true, user: fresh });
  } catch (e) {
    console.error("PUT /me/profile error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

r.put("/me/password", async (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthorized" });

  const { current_password, new_password } = req.body || {};
  if (!new_password || String(new_password).length < 6) {
    return res.status(400).json({ error: "weak_password" });
  }

  const user = await db
    .prepare(`SELECT id, password_hash FROM users WHERE id = ? LIMIT 1`)
    .get(userId);
  if (!user) return res.status(404).json({ error: "user_not_found" });

  const hasHash = Boolean(
    user.password_hash && String(user.password_hash).length > 0
  );

  if (hasHash) {
    if (!current_password)
      return res.status(400).json({ error: "current_password_required" });
    const ok = bcrypt.compareSync(String(current_password), user.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid_current_password" });
  }

  const nextHash = bcrypt.hashSync(String(new_password), 10);
  const now = Date.now();

  try {
    await db
      .prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`)
      .run(nextHash, now, userId);

    return res.json({ ok: true });
  } catch (e) {
    console.error("PUT /me/password error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

r.put("/me/avatar", upload.single("avatar"), async (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthorized" });
  if (!req.file) return res.status(400).json({ error: "no_file" });

  const base =
    process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
  const url = `${base}/uploads/avatars/${req.file.filename}`;

  try {
    await db
      .prepare(`UPDATE users SET avatar_url=?, updated_at=? WHERE id=?`)
      .run(url, Date.now(), userId);

    const user = db
      .prepare(`SELECT id, name, email, avatar_url FROM users WHERE id=?`)
      .get(userId);

    return res.json({ ok: true, avatar_url: url, user });
  } catch (e) {
    console.error("PUT /me/avatar error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

module.exports = r;



// // server/routes/me.js
// const { Router } = require("express");
// const db = require("../db/connection");
// const requireAuth = require("../lib/requireAuth");
// const jwt = require("jsonwebtoken");
// const bcrypt = require("bcryptjs");

// const path = require("path");
// const fs = require("fs");
// const multer = require("multer");

// const r = Router();
// r.use(requireAuth);

// const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// /* =========================
//    Uploads: avatar
// ========================= */
// const uploadDir = path.join(__dirname, "..", "uploads", "avatars");
// fs.mkdirSync(uploadDir, { recursive: true });

// const storage = multer.diskStorage({
//   destination: (_req, _file, cb) => cb(null, uploadDir),
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname || ".jpg");
//     cb(null, `${resolveUserId(req)}-${Date.now()}${ext}`);
//   },
// });
// const upload = multer({
//   storage,
//   limits: { fileSize: 4 * 1024 * 1024 }, // 4MB
//   fileFilter: (_req, file, cb) => {
//     if (!String(file.mimetype || "").startsWith("image/")) {
//       return cb(new Error("invalid_type"));
//     }
//     cb(null, true);
//   },
// });

// // Resuelve el ID de usuario compatible con tus middlewares (req.user o req.auth)
// function resolveUserId(req) {
//   return req.user?.id || req.auth?.sub;
// }

// /* =========================================================
//  *  Middleware local: resolver tenant activo para este router
//  * =======================================================*/
// r.use((req, _res, next) => {
//   // Header tiene prioridad (permite cambiar rápido desde el cliente)
//   const headerTenant =
//     (req.get("x-tenant-id") || req.get("tenant") || "").trim() || null;

//   // Si no hay header, cae al tenant del token (seteado en /me/tenant/switch)
//   const tokenTenant = req.auth?.active_tenant || null;

//   // Estándar interno para este router
//   req.tenantId = headerTenant || tokenTenant || null;
//   next();
// });

// /* =========================================================
//  *        TENANTS
//  * =======================================================*/

// /**
//  * GET /me/tenants
//  * Lista TODOS los workspaces disponibles (sistema simplificado sin memberships).
//  * - Todos los usuarios autenticados pueden ver y entrar a cualquier workspace
//  * - El filtro de permisos se aplica DENTRO del workspace, no al acceder
//  */
// r.get("/me/tenants", async (req, res) => {
//   const userId = resolveUserId(req);
//   if (!userId) return res.status(401).json({ error: "unauthorized" });

//   // Obtener rol global del usuario (✅ PostgreSQL placeholder)
//   const user = await db
//     .prepare(`SELECT role FROM users WHERE id = $1 LIMIT 1`)
//     .get(userId);
  
//   const userRole = user?.role || 'member';

//   // ✅ TODOS ven TODOS los workspaces (sin filtro por creator)
//   const query = `
//     SELECT 
//       t.id, 
//       t.name, 
//       t.created_by,
//       u.name as owner_name,
//       u.email as owner_email,
//       (t.created_by = $1) AS is_creator
//     FROM tenants t
//     LEFT JOIN users u ON u.id = t.created_by
//     ORDER BY LOWER(t.name) ASC
//   `;

//   const rows = await db.prepare(query).all(userId);

//   console.log(
//     `📋 /me/tenants for user ${userId} (${userRole}):`,
//     rows.map((r) => ({ name: r.name, is_creator: r.is_creator }))
//   );

//   const activeId = req.tenantId || null;
//   const items = rows.map((r) => ({
//     id: r.id,
//     name: r.name,
//     owner_name: r.owner_name,
//     owner_email: r.owner_email,
//     is_active: activeId === r.id,
//     is_creator: r.is_creator === 1
//   }));

//   res.json({ items, active_tenant: activeId, user_role: userRole });
// });

// /**
//  * POST /me/tenant/switch
//  * Cambia el workspace "activo" y devuelve NUEVO JWT con rol global.
//  * Body: { tenant_id }
//  */
// r.post("/me/tenant/switch", async (req, res) => {
//   const userId = resolveUserId(req);
//   if (!userId) return res.status(401).json({ error: "unauthorized" });

//   const { tenant_id } = req.body || {};
//   if (!tenant_id) return res.status(400).json({ error: "tenant_id_required" });
//       // 👇 NUEVO: asegurar que el usuario quede guardado en tenant_memberships
//     const now = Date.now();
//     const safeRole = role || "member";

//     await db.query(
//       `
//       INSERT INTO tenant_memberships (tenant_id, user_id, role, created_at, updated_at)
//       VALUES ($1, $2, $3, $4, $5)
//       ON CONFLICT (tenant_id, user_id) DO NOTHING
//       `,
//       [tenant_id, userId, safeRole, now, now]
//     );

//     console.log("👥 tenant_memberships asegurado en /me/tenant/switch:", {
//       tenant_id,
//       userId,
//       role: safeRole,
//     });


//   console.log('🔄 /me/tenant/switch:', { userId, tenant_id });

//   // Verificar que el workspace existe (✅ PostgreSQL placeholder)
//   const tenant = await db
//     .prepare(`SELECT id, name FROM tenants WHERE id = $1 LIMIT 1`)
//     .get(tenant_id);

//   if (!tenant) {
//     console.log('❌ Tenant not found:', tenant_id);
//     return res.status(404).json({ error: "tenant_not_found" });
//   }

//   // Obtener rol global del usuario (✅ PostgreSQL placeholder)
//   const user = await db
//     .prepare(`SELECT role FROM users WHERE id = $1 LIMIT 1`)
//     .get(userId);

//   const userRole = user?.role || 'member';

//   console.log('✅ Switch successful:', { tenant: tenant_id, role: userRole });

//   const basePayload = {
//     sub: req.auth?.sub || req.user?.id || userId,
//     email: req.auth?.email || req.user?.email || undefined,
//     role: userRole, // Rol global
//     active_tenant: tenant_id,
//   };

//   const token = jwt.sign(basePayload, JWT_SECRET, { expiresIn: "7d" });

//   res.json({
//     token,
//     active_tenant: tenant_id,
//     tenant: { id: tenant_id, name: tenant.name, role: userRole },
//   });
// });

// /**
//  * GET /tenants/role
//  * Devuelve el ROL GLOBAL del usuario (no depende del workspace activo).
//  * Respuesta: { tenant_id: string|null, role: "owner"|"admin"|"member"|null }
//  */
// r.get("/tenants/role", async (req, res) => {
//   const userId = resolveUserId(req);
//   if (!userId) return res.status(401).json({ error: "unauthorized" });

//   const tenantId = req.tenantId || null;

//   // Obtener ROL GLOBAL del usuario (de tabla users) - ✅ PostgreSQL placeholder
//   const user = await db
//     .prepare(`SELECT role FROM users WHERE id = $1 LIMIT 1`)
//     .get(userId);

//   return res.json({ 
//     tenant_id: tenantId, 
//     role: user?.role || "member" // Default a member si no tiene rol
//   });
// });

// /* =========================================================
//  *        PERFIL
//  * =======================================================*/

// /**
//  * GET /me/profile
//  * Devuelve el perfil completo del usuario autenticado.
//  */
// r.get("/me/profile", (req, res) => {
//   const userId = resolveUserId(req);
//   if (!userId) return res.status(401).json({ error: "unauthorized" });

//   const user = db
//     .prepare(
//       `
//       SELECT
//         id, name, email, role,
//         avatar_url, headline, bio,
//         location, company, website,
//         twitter, linkedin, github,
//         phone, timezone,
//         last_login_at,
//         created_at, updated_at
//       FROM users
//       WHERE id = ?
//       LIMIT 1
//     `
//     )
//     .get(userId);

//   if (!user) return res.status(404).json({ error: "user_not_found" });

//   // Métricas simples del usuario sobre workspaces
//   const counts = db
//     .prepare(
//       `
//       SELECT
//         (SELECT COUNT(*) FROM memberships WHERE user_id = ?) AS workspaces_count,
//         (SELECT COUNT(*) FROM memberships WHERE user_id = ? AND role = 'owner') AS owner_count
//     `
//     )
//     .get(userId, userId);

//   return res.json({ ...user, ...counts });
// });

// /**
//  * PUT /me/profile
//  * Actualiza campos del perfil (whitelist). Email es opcional (valida duplicado).
//  * Body: subset de:
//  *  name, avatar_url, headline, bio, location, company, website,
//  *  twitter, linkedin, github, phone, timezone, email?
//  */
// r.put("/me/profile", async (req, res) => {
//   const userId = resolveUserId(req);
//   if (!userId) return res.status(401).json({ error: "unauthorized" });

//   const body = req.body || {};

//   const ALLOWED = new Set([
//     "name",
//     "avatar_url",
//     "headline",
//     "bio",
//     "location",
//     "company",
//     "website",
//     "twitter",
//     "linkedin",
//     "github",
//     "phone",
//     "timezone",
//     "email", // opcional: si quieres permitir cambiar email
//   ]);

//   const updates = [];
//   const params = [];
//   for (const k of Object.keys(body)) {
//     if (!ALLOWED.has(k)) continue;
//     if (k === "email") continue; // tratamos email aparte
//     updates.push(`${k} = ?`);
//     params.push(body[k] ?? null);
//   }

//   // Cambio de email (único)
//   if (Object.prototype.hasOwnProperty.call(body, "email")) {
//     const email = String(body.email || "").trim().toLowerCase();
//     if (!email) return res.status(400).json({ error: "invalid_email" });
//     const dup = await db
//       .prepare(`SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1`)
//       .get(email, userId);
//     if (dup) return res.status(409).json({ error: "email_in_use" });
//     updates.push(`email = ?`);
//     params.push(email);
//   }

//   if (updates.length === 0) {
//     return res.json({ ok: true, updated: false });
//   }

//   const now = Date.now();
//   updates.push(`updated_at = ?`);
//   params.push(now);
//   params.push(userId);

//   try {
//     await db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(
//       ...params
//     );

//     const fresh = await db
//       .prepare(
//         `
//         SELECT id, name, email, avatar_url, headline, bio, location, company,
//                website, twitter, linkedin, github, phone, timezone,
//                last_login_at, created_at, updated_at
//         FROM users WHERE id = ? LIMIT 1
//       `
//       )
//       .get(userId);

//     return res.json({ ok: true, user: fresh });
//   } catch (e) {
//     console.error("PUT /me/profile error:", e);
//     return res.status(500).json({ error: "internal_error" });
//   }
// });

// /**
//  * PUT /me/password
//  * Cambia la contraseña del usuario.
//  * Body: { current_password, new_password }
//  * - Si password_hash actual está vacío (seed/demo), NO exige current_password.
//  */
// r.put("/me/password", async (req, res) => {
//   const userId = resolveUserId(req);
//   if (!userId) return res.status(401).json({ error: "unauthorized" });

//   const { current_password, new_password } = req.body || {};
//   if (!new_password || String(new_password).length < 6) {
//     return res.status(400).json({ error: "weak_password" });
//   }

//   const user = await db
//     .prepare(`SELECT id, password_hash FROM users WHERE id = ? LIMIT 1`)
//     .get(userId);
//   if (!user) return res.status(404).json({ error: "user_not_found" });

//   const hasHash = Boolean(
//     user.password_hash && String(user.password_hash).length > 0
//   );

//   if (hasHash) {
//     if (!current_password)
//       return res.status(400).json({ error: "current_password_required" });
//     const ok = bcrypt.compareSync(String(current_password), user.password_hash);
//     if (!ok) return res.status(401).json({ error: "invalid_current_password" });
//   }

//   const nextHash = bcrypt.hashSync(String(new_password), 10);
//   const now = Date.now();

//   try {
//     await db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(
//       nextHash,
//       now,
//       userId
//     );

//     return res.json({ ok: true });
//   } catch (e) {
//     console.error("PUT /me/password error:", e);
//     return res.status(500).json({ error: "internal_error" });
//   }
// });

// /**
//  * PUT /me/avatar
//  * Sube archivo (multipart) y actualiza avatar_url.
//  * Form field: "avatar"
//  */
// r.put("/me/avatar", upload.single("avatar"), async (req, res) => {
//   const userId = resolveUserId(req);
//   if (!userId) return res.status(401).json({ error: "unauthorized" });
//   if (!req.file) return res.status(400).json({ error: "no_file" });

//   const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
//   const url = `${base}/uploads/avatars/${req.file.filename}`;

//   try {
//     await db.prepare(`UPDATE users SET avatar_url=?, updated_at=? WHERE id=?`).run(
//       url,
//       Date.now(),
//       userId
//     );

//     const user = db
//       .prepare(`SELECT id, name, email, avatar_url FROM users WHERE id=?`)
//       .get(userId);

//     return res.json({ ok: true, avatar_url: url, user });
//   } catch (e) {
//     console.error("PUT /me/avatar error:", e);
//     return res.status(500).json({ error: "internal_error" });
//   }
// });

// module.exports = r;
