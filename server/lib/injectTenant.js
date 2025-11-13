// server/lib/injectTenant.js
const db = require("../db/connection");

// Flags (puedes setearlos por env)
const MULTI_TENANT_ENABLED = process.env.MULTI_TENANT_ENABLED !== "0";
const AUTH_SKIP_MEMBERSHIP = process.env.AUTH_SKIP_MEMBERSHIP === "1";
const DEFAULT_TENANT = process.env.DEFAULT_TENANT || "demo";

/**
 * Middleware injectTenant (SIMPLIFICADO - Sin Memberships)
 * - Prioridad: X-Tenant-Id -> token.active_tenant -> DEFAULT_TENANT
 * - Valida que el tenant exista.
 * - Ya NO valida memberships (sistema simplificado)
 * - Todos los usuarios autenticados pueden acceder a cualquier tenant
 * - Deja req.tenantId (y req.tenantRole basado en rol GLOBAL).
 */
module.exports = async function injectTenant(req, res, next) {
  try {
    // Si ya viene seteado, respeta
    if (req.tenantId) return next();

    const headerTenant = (req.get("X-Tenant-Id") || "").trim();
    const tokenTenant = req.auth?.active_tenant || null;

    // 1) Resolver ID tentativo
    let resolved =
      (MULTI_TENANT_ENABLED ? headerTenant || tokenTenant : DEFAULT_TENANT) ||
      DEFAULT_TENANT;

    // 2) Fallback final
    if (!resolved) resolved = DEFAULT_TENANT;

    // 3) Validar existencia del tenant
    const tenant = await db
      .prepare(`SELECT id, name FROM tenants WHERE id = $1 LIMIT 1`)
      .get(resolved);
    
    if (!tenant) {
      return res.status(404).json({ error: "tenant_not_found" });
    }

    // 4) Inyectar tenantId en req
    req.tenantId = tenant.id;
    
    // 5) Si hay usuario, obtener su ROL GLOBAL (no por tenant)
    let globalRole = null;
    if (req.user?.id) {
      const user = await db
        .prepare(`SELECT role FROM users WHERE id = $1 LIMIT 1`)
        .get(req.user.id);
      globalRole = user?.role || 'member';
    }
    
    req.tenantRole = globalRole; // Ahora es el rol GLOBAL, no por tenant

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

