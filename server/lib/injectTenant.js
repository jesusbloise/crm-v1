// server/lib/injectTenant.js
const db = require("../db/connection");

// Flags (puedes setearlos por env)
const MULTI_TENANT_ENABLED = process.env.MULTI_TENANT_ENABLED !== "0";
const AUTH_SKIP_MEMBERSHIP = process.env.AUTH_SKIP_MEMBERSHIP === "1";
const DEFAULT_TENANT = process.env.DEFAULT_TENANT || "demo";

/**
 * Middleware injectTenant
 * - Prioridad: X-Tenant-Id -> token.active_tenant -> primer membership -> DEFAULT_TENANT
 * - Valida que el tenant exista.
 * - Si hay usuario (requireAuth corrió antes) y no está en modo skip:
 *   valida membresía y setea req.tenantRole.
 * - Deja req.tenantId (y req.tenantRole si aplica).
 */
module.exports = function injectTenant(req, res, next) {
  try {
    // Si ya viene seteado, respeta
    if (req.tenantId) return next();

    const headerTenant = (req.get("X-Tenant-Id") || "").trim();
    const tokenTenant = req.auth?.active_tenant || null;

    // 🚦 Rutas que NO deben exigir membresía (autenticadas igual por JWT)
    const SKIP_MEMBERSHIP_PATHS = new Set([
      "/tenants/join",
      "/tenants/discover",
      "/tenants/current",
    ]);
    if (SKIP_MEMBERSHIP_PATHS.has(req.path)) {
      // Fijamos un tenant neutro para continuar el request
      const fallback = process.env.DEFAULT_TENANT || "demo";
      req.tenantId = tokenTenant || fallback;
      req.tenantRole = null;
      return next();
    }

    // 1) Resolver ID tentativo
    let resolved =
      (MULTI_TENANT_ENABLED ? headerTenant || tokenTenant : DEFAULT_TENANT) ||
      DEFAULT_TENANT;

    // 2) Si aún no hay, intenta 1er membership (solo si ya hay user)
    if (!resolved && req.user?.id) {
      const first = db
        .prepare(
          `
          SELECT m.tenant_id AS id
          FROM memberships m
          WHERE m.user_id = ?
          ORDER BY m.created_at ASC
          LIMIT 1
        `
        )
        .get(req.user.id);
      if (first) resolved = first.id;
    }

    // 3) Fallback final
    if (!resolved) resolved = DEFAULT_TENANT;

    // 4) Validar existencia del tenant
    const tenant = db
      .prepare(`SELECT id, name FROM tenants WHERE id = ? LIMIT 1`)
      .get(resolved);
    if (!tenant) {
      return res.status(404).json({ error: "tenant_not_found" });
    }

    // 5) Si hay user y no estamos en modo skip -> valida membresía
    let role = null;
    const isDemoUser =
      req.auth?.sub === "demo-admin" ||
      String(req.auth?.email || "").endsWith("@demo.local");

    if (req.user?.id && !AUTH_SKIP_MEMBERSHIP && !isDemoUser) {
      const membership = db
        .prepare(
          `SELECT role FROM memberships WHERE user_id = ? AND tenant_id = ? LIMIT 1`
        )
        .get(req.user.id, tenant.id);

      if (!membership) {
        return res.status(403).json({ error: "forbidden_tenant" });
      }
      role = membership.role;
    } else if (AUTH_SKIP_MEMBERSHIP || isDemoUser) {
      role = "admin"; // evita bloquear en dev/demo
    }

    // 6) Inyectar en req
    req.tenantId = tenant.id;
    req.tenantRole = role || null;

    if (process.env.NODE_ENV !== "production") {
      console.log("🧩 Tenant =>", {
        tenant: tenant.id,
        role: req.tenantRole,
        via: headerTenant ? "header" : tokenTenant ? "token" : "fallback",
      });
    }

    return next();
  } catch (e) {
    console.error("injectTenant error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
};

