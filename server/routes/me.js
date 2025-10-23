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
 *        TENANTS
 * =======================================================*/

/**
 * GET /me/tenants
 * Lista los tenants del usuario + rol e indicador de activo según req.tenantId.
 */
r.get("/me/tenants", (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthorized" });

  const rows = db
    .prepare(
      `
      SELECT t.id, t.name, m.role
      FROM memberships m
      JOIN tenants t ON t.id = m.tenant_id
      WHERE m.user_id = ?
      ORDER BY t.name COLLATE NOCASE ASC
    `
    )
    .all(userId);

  const activeId = req.tenantId || null;
  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    is_active: activeId === r.id,
  }));

  res.json({ items, active_tenant: activeId });
});

/**
 * POST /me/tenant/switch
 * Cambia el tenant "activo" y devuelve NUEVO JWT.
 * Body: { tenant_id }
 *
 * Nota: aunque devolvemos token con active_tenant,
 * el cliente igual debe enviar X-Tenant-Id en cada request.
 */
r.post("/me/tenant/switch", (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthorized" });

  const { tenant_id } = req.body || {};
  if (!tenant_id) return res.status(400).json({ error: "tenant_id_required" });

  const membership = db
    .prepare(
      `SELECT m.role, t.name
       FROM memberships m
       JOIN tenants t ON t.id = m.tenant_id
       WHERE m.user_id = ? AND m.tenant_id = ?
       LIMIT 1`
    )
    .get(userId, tenant_id);

  if (!membership) return res.status(403).json({ error: "not_member" });

  const basePayload = {
    sub: req.auth?.sub || req.user?.id || userId,
    email: req.auth?.email || req.user?.email || undefined,
    roles: req.auth?.roles || req.user?.roles || {},
    active_tenant: tenant_id,
  };

  const token = jwt.sign(basePayload, JWT_SECRET, { expiresIn: "7d" });

  res.json({
    token,
    active_tenant: tenant_id,
    tenant: { id: tenant_id, name: membership.name, role: membership.role },
  });
});

/* =========================================================
 *        PERFIL
 * =======================================================*/

/**
 * GET /me/profile
 * Devuelve el perfil completo del usuario autenticado.
 */
r.get("/me/profile", (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthorized" });

  const user = db
    .prepare(
      `
      SELECT
        id, name, email,
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

  // Métricas simples del usuario sobre workspaces
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

/**
 * PUT /me/profile
 * Actualiza campos del perfil (whitelist). Email es opcional (valida duplicado).
 * Body: subset de:
 *  name, avatar_url, headline, bio, location, company, website,
 *  twitter, linkedin, github, phone, timezone, email?
 */
r.put("/me/profile", (req, res) => {
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
    "email", // opcional: si quieres permitir cambiar email
  ]);

  const updates = [];
  const params = [];
  for (const k of Object.keys(body)) {
    if (!ALLOWED.has(k)) continue;
    if (k === "email") continue; // tratamos email aparte
    updates.push(`${k} = ?`);
    params.push(body[k] ?? null);
  }

  // Cambio de email (único)
  if (Object.prototype.hasOwnProperty.call(body, "email")) {
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "invalid_email" });
    const dup = db
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
    db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...params);

    const fresh = db
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

/**
 * PUT /me/password
 * Cambia la contraseña del usuario.
 * Body: { current_password, new_password }
 * - Si password_hash actual está vacío (seed/demo), NO exige current_password.
 */
r.put("/me/password", (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthorized" });

  const { current_password, new_password } = req.body || {};
  if (!new_password || String(new_password).length < 6) {
    return res.status(400).json({ error: "weak_password" });
  }

  const user = db
    .prepare(`SELECT id, password_hash FROM users WHERE id = ? LIMIT 1`)
    .get(userId);
  if (!user) return res.status(404).json({ error: "user_not_found" });

  const hasHash = Boolean(user.password_hash && String(user.password_hash).length > 0);

  if (hasHash) {
    if (!current_password)
      return res.status(400).json({ error: "current_password_required" });
    const ok = bcrypt.compareSync(String(current_password), user.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid_current_password" });
  }

  const nextHash = bcrypt.hashSync(String(new_password), 10);
  const now = Date.now();

  try {
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(
      nextHash,
      now,
      userId
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error("PUT /me/password error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * PUT /me/avatar
 * Sube archivo (multipart) y actualiza avatar_url.
 * Form field: "avatar"
 */
r.put("/me/avatar", upload.single("avatar"), (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthorized" });
  if (!req.file) return res.status(400).json({ error: "no_file" });

  const base =
    process.env.PUBLIC_BASE_URL ||
    `${req.protocol}://${req.get("host")}`;
  const url = `${base}/uploads/avatars/${req.file.filename}`;

  try {
    db.prepare(`UPDATE users SET avatar_url=?, updated_at=? WHERE id=?`).run(
      url,
      Date.now(),
      userId
    );

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

// const r = Router();
// r.use(requireAuth);
// const path = require("path");
// const fs = require("fs");
// const multer = require("multer");


// const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
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
//  *        TENANTS (ya existentes)
//  * =======================================================*/

// /**
//  * GET /me/tenants
//  * Lista los tenants del usuario + rol e indicador de activo según req.tenantId.
//  */
// r.get("/me/tenants", (req, res) => {
//   const userId = resolveUserId(req);
//   if (!userId) return res.status(401).json({ error: "unauthorized" });

//   const rows = db
//     .prepare(
//       `
//       SELECT t.id, t.name, m.role
//       FROM memberships m
//       JOIN tenants t ON t.id = m.tenant_id
//       WHERE m.user_id = ?
//       ORDER BY t.name COLLATE NOCASE ASC
//     `
//     )
//     .all(userId);

//   const activeId = req.tenantId || null;
//   const items = rows.map((r) => ({
//     id: r.id,
//     name: r.name,
//     role: r.role,
//     is_active: activeId === r.id,
//   }));

//   res.json({ items, active_tenant: activeId });
// });

// /**
//  * POST /me/tenant/switch
//  * Cambia el tenant "activo" y devuelve NUEVO JWT.
//  * Body: { tenant_id }
//  *
//  * Nota: aunque devolvemos token con active_tenant,
//  * el cliente igual debe enviar X-Tenant-Id en cada request.
//  */
// r.post("/me/tenant/switch", (req, res) => {
//   const userId = resolveUserId(req);
//   if (!userId) return res.status(401).json({ error: "unauthorized" });

//   const { tenant_id } = req.body || {};
//   if (!tenant_id) return res.status(400).json({ error: "tenant_id_required" });

//   const membership = db
//     .prepare(
//       `SELECT m.role, t.name
//        FROM memberships m
//        JOIN tenants t ON t.id = m.tenant_id
//        WHERE m.user_id = ? AND m.tenant_id = ?
//        LIMIT 1`
//     )
//     .get(userId, tenant_id);

//   if (!membership) return res.status(403).json({ error: "not_member" });

//   // Conserva payload original si viene de requireAuth
//   const basePayload = {
//     sub: req.auth?.sub || req.user?.id || userId,
//     email: req.auth?.email || req.user?.email || undefined,
//     roles: req.auth?.roles || req.user?.roles || {},
//     active_tenant: tenant_id,
//   };

//   const token = jwt.sign(basePayload, JWT_SECRET, { expiresIn: "7d" });

//   res.json({
//     token,
//     active_tenant: tenant_id,
//     tenant: { id: tenant_id, name: membership.name, role: membership.role },
//   });
// });

// /* =========================================================
//  *        PERFIL (nuevo)
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
//         id, name, email,
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

//   // Además (útil para el perfil): cuántos workspaces y en cuáles es owner
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
// r.put("/me/profile", (req, res) => {
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
//     const dup = db
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
//     db.prepare(
//       `UPDATE users SET ${updates.join(", ")} WHERE id = ?`
//     ).run(...params);

//     const fresh = db
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
// r.put("/me/password", (req, res) => {
//   const userId = resolveUserId(req);
//   if (!userId) return res.status(401).json({ error: "unauthorized" });

//   const { current_password, new_password } = req.body || {};
//   if (!new_password || String(new_password).length < 6) {
//     return res.status(400).json({ error: "weak_password" });
//   }

//   const user = db
//     .prepare(`SELECT id, password_hash FROM users WHERE id = ? LIMIT 1`)
//     .get(userId);
//   if (!user) return res.status(404).json({ error: "user_not_found" });

//   const hasHash = Boolean(user.password_hash && String(user.password_hash).length > 0);

//   if (hasHash) {
//     if (!current_password) return res.status(400).json({ error: "current_password_required" });
//     const ok = bcrypt.compareSync(String(current_password), user.password_hash);
//     if (!ok) return res.status(401).json({ error: "invalid_current_password" });
//   }

//   const nextHash = bcrypt.hashSync(String(new_password), 10);
//   const now = Date.now();

//   try {
//     db.prepare(
//       `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`
//     ).run(nextHash, now, userId);

//     return res.json({ ok: true });
//   } catch (e) {
//     console.error("PUT /me/password error:", e);
//     return res.status(500).json({ error: "internal_error" });
//   }
// });

// module.exports = r;


