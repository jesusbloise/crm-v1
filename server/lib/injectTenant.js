// server/lib/injectTenant.js
function injectTenant(req, res, next) {
  const header = req.header("X-Tenant-Id");
  // 🧘 modo suave: si no viene el header, usa un valor por defecto
  const fallback = process.env.DEFAULT_TENANT || "demo";
  req.tenantId = header && header.trim() ? header.trim() : fallback;
  next();
}
module.exports = injectTenant;

// // server/lib/injectTenant.js
// module.exports = function injectTenant(req, res, next) {
//   // header o query
//   let tenant =
//     req.headers["x-tenant-id"] ||
//     req.query?.tenant ||
//     req.query?.tenant_id;

//   // fallback seguro
//   if (!tenant) tenant = process.env.DEFAULT_TENANT || "demo";

//   // validación simple
//   const OK = /^[a-zA-Z0-9_-]+$/;
//   if (!OK.test(String(tenant))) {
//     return next(new Error("invalid tenant id"));
//   }

//   req.tenantId = String(tenant);
//   res.locals.tenantId = req.tenantId;
//   next();
// };
