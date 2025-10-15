// server/lib/requireAuth.js
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

module.exports = function requireAuth(req, res, next) {
  const raw = req.get("authorization") || "";
  const tenant = req.get("x-tenant-id");

  console.log("AUTH HEADERS =>", { authorization: raw, tenant });

  const m = raw.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: "missing_bearer" });

  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    console.log("JWT OK =>", payload);

    req.user = { id: payload.sub, roles: payload.roles || {} };
    req.tenantId = payload.active_tenant || tenant || "demo";

    // valida scoping: payload.active_tenant debe existir
    if (!req.tenantId) return res.status(401).json({ error: "no_tenant" });

    return next();
  } catch (e) {
    console.error("JWT FAIL =>", e.message);
    return res.status(401).json({ error: "invalid_token" });
  }
};
