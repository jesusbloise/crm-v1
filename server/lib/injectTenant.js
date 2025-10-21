// server/lib/injectTenant.js
/**
 * Middleware injectTenant
 * ------------------------
 * - Lee el encabezado X-Tenant-Id y lo coloca en req.tenantId
 * - Si no viene el header, usa:
 *    1) el tenant del token JWT (si ya lo procesó requireAuth)
 *    2) el valor por defecto del entorno (DEFAULT_TENANT o 'demo')
 * - No rompe peticiones públicas (antes de requireAuth)
 */
function injectTenant(req, _res, next) {
  // Header explícito (case-insensitive)
  const headerTenant = req.get("X-Tenant-Id")?.trim();
  const fallback = process.env.DEFAULT_TENANT || "demo";

  // Si requireAuth ya colocó req.tenantId, no lo pisamos
  if (req.tenantId) return next();

  // Prioridad: Header → fallback
  req.tenantId = headerTenant || fallback;

  // En desarrollo, muestra contexto útil
  if (process.env.NODE_ENV !== "production") {
    console.log("🧩 Tenant inyectado =>", req.tenantId);
  }

  return next();
}

module.exports = injectTenant;


// // server/lib/injectTenant.js
// function injectTenant(req, res, next) {
//   const header = req.header("X-Tenant-Id");
//   // 🧘 modo suave: si no viene el header, usa un valor por defecto
//   const fallback = process.env.DEFAULT_TENANT || "demo";
//   req.tenantId = header && header.trim() ? header.trim() : fallback;
//   next();
// }
// module.exports = injectTenant;
