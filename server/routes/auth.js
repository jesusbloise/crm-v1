// server/routes/auth.js
const { Router } = require("express");
const jwt = require("jsonwebtoken");

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// DEV login (usuario sembrado por seedDevAuth.js)
router.post("/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (email !== "admin@demo.local" || password !== "demo") {
    return res.status(401).json({ error: "invalid_credentials" });
  }

  // sub = user id; active_tenant = 'demo'; roles opcional
  const payload = {
    sub: "demo-admin",
    email,
    active_tenant: "demo",
    roles: { admin: true },
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, active_tenant: payload.active_tenant });
});

// Debug: verifica que el token y el tenant lleguen bien
router.get("/auth/me", (req, res) => {
  try {
    const raw = req.get("authorization") || "";
    const m = raw.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ error: "missing_bearer" });

    const decoded = jwt.verify(m[1], JWT_SECRET);
    const tenant = req.get("x-tenant-id") || decoded.active_tenant || "demo";
    return res.json({ ok: true, decoded, tenant });
  } catch (e) {
    return res.status(401).json({ error: "invalid_token", message: e.message });
  }
});

module.exports = router;
