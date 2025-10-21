// server/routes/auth.js
const { Router } = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../db/connection"); // ✅ conexión única

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const TOKEN_TTL = process.env.JWT_TTL || "7d";

const newId = () => crypto.randomUUID();
const now = () => Date.now();
const signToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });

/* =======================
   LOGIN (dev + real)
   ======================= */
router.post("/auth/login", (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    // Fast-path demo
    if (email === "admin@demo.local" && password === "demo") {
      const payload = { sub: "demo-admin", email, active_tenant: "demo", roles: { admin: true } };
      const token = signToken(payload);
      return res.json({ token, active_tenant: payload.active_tenant });
    }

    if (!email || !password) {
      return res.status(400).json({ error: "email_y_password_requeridos" });
    }

    const user = db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(String(email).toLowerCase());

    if (!user) return res.status(401).json({ error: "credenciales_invalidas" });

    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "credenciales_invalidas" });

    const payload = {
      sub: user.id,
      email: user.email,
      active_tenant: "demo", // TODO: leer de memberships cuando esté
      roles: { user: true },
    };

    const token = signToken(payload);
    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      token,
      active_tenant: payload.active_tenant,
    });
  } catch (e) {
    next(e);
  }
});

/* =======================
   REGISTER
   ======================= */
router.post("/auth/register", (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: "name_email_password_requeridos" });
    }

    const exists = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(String(email).toLowerCase());

    if (exists) return res.status(409).json({ error: "email_ya_registrado" });

    const user = {
      id: newId(),
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      password_hash: bcrypt.hashSync(String(password), 10),
      created_at: now(),
      updated_at: now(),
    };

    db.prepare(
      `INSERT INTO users (id, name, email, password_hash, created_at, updated_at)
       VALUES (@id, @name, @email, @password_hash, @created_at, @updated_at)`
    ).run(user);

    const payload = {
      sub: user.id,
      email: user.email,
      active_tenant: "demo",
      roles: { user: true },
    };
    const token = signToken(payload);

    return res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      token,
      active_tenant: payload.active_tenant,
    });
  } catch (e) {
    next(e);
  }
});

/* =======================
   ME
   ======================= */
router.get("/auth/me", (req, res) => {
  try {
    const raw = req.get("authorization") || "";
    const m = raw.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ error: "missing_bearer" });

    const decoded = jwt.verify(m[1], JWT_SECRET);
    const tenant = req.get("x-tenant-id") || decoded.active_tenant || "demo";

    const user =
      db
        .prepare("SELECT id, name, email, created_at, updated_at FROM users WHERE id = ?")
        .get(decoded.sub) || null;

    return res.json({ ok: true, tenant, user, token_payload: decoded });
  } catch (e) {
    return res.status(401).json({ error: "invalid_token", message: e.message });
  }
});

module.exports = router;



// server/routes/auth.js
// const { Router } = require("express");
// const jwt = require("jsonwebtoken");

// const router = Router();
// const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// // DEV login (usuario sembrado por seedDevAuth.js)
// router.post("/auth/login", (req, res) => {
//   const { email, password } = req.body || {};
//   if (email !== "admin@demo.local" || password !== "demo") {
//     return res.status(401).json({ error: "invalid_credentials" });
//   }

//   // sub = user id; active_tenant = 'demo'; roles opcional
//   const payload = {
//     sub: "demo-admin",
//     email,
//     active_tenant: "demo",
//     roles: { admin: true },
//   };

//   const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
//   res.json({ token, active_tenant: payload.active_tenant });
// });

// // Debug: verifica que el token y el tenant lleguen bien
// router.get("/auth/me", (req, res) => {
//   try {
//     const raw = req.get("authorization") || "";
//     const m = raw.match(/^Bearer\s+(.+)$/i);
//     if (!m) return res.status(401).json({ error: "missing_bearer" });

//     const decoded = jwt.verify(m[1], JWT_SECRET);
//     const tenant = req.get("x-tenant-id") || decoded.active_tenant || "demo";
//     return res.json({ ok: true, decoded, tenant });
//   } catch (e) {
//     return res.status(401).json({ error: "invalid_token", message: e.message });
//   }
// });

// module.exports = router;
