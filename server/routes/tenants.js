// server/routes/tenants.js
const { Router } = require("express");
const db = require("../db/connection");
const requireAuth = require("../lib/requireAuth");

const r = Router();

// Protección adicional por si reutilizan este router en otro lado.
r.use(requireAuth);

const ALLOW_SELF_JOIN = process.env.ALLOW_SELF_JOIN === "1";

/**
 * GET /tenants
 * Lista los tenants a los que pertenece el usuario autenticado.
 */
r.get("/tenants", (req, res) => {
  try {
    const rows = db
      .prepare(
        `
        SELECT
          t.id,
          t.name,
          m.role,
          t.created_at,
          t.updated_at
        FROM memberships m
        JOIN tenants t ON t.id = m.tenant_id
        WHERE m.user_id = ?
        ORDER BY t.name COLLATE NOCASE ASC
      `
      )
      .all(req.user.id);

    return res.json({ items: rows });
  } catch (e) {
    console.error("GET /tenants error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * GET /tenants/current
 * Devuelve el tenant activo (resuelto por header X-Tenant-Id o token).
 */
r.get("/tenants/current", (req, res) => {
  return res.json({ tenant_id: req.tenantId || null });
});

/**
 * POST /tenants
 * Crea un tenant nuevo y agrega al usuario actual como owner.
 * Requiere rol admin/owner (según tu payload de roles).
 * Body: { id, name }
 */
r.post("/tenants", (req, res) => {
  // Ajusta esto si tus roles viven en otro lugar del req:
  const isAdmin = !!req.auth?.roles?.admin;
  const isOwner = req.auth?.roles?.owner === true;
  if (!isAdmin && !isOwner) {
    return res.status(403).json({ error: "forbidden" });
  }

  const { id, name } = req.body || {};
  if (!id || !name) return res.status(400).json({ error: "id_and_name_required" });

  // Validación simple del id (alfa, guion y guion_bajo)
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return res.status(400).json({ error: "invalid_tenant_id" });
  }

  try {
    const exists = db
      .prepare(`SELECT 1 AS one FROM tenants WHERE id = ? LIMIT 1`)
      .get(id);
    if (exists) return res.status(409).json({ error: "tenant_exists" });

    const now = Date.now();
    const txn = db.transaction(() => {
      db.prepare(
        `
        INSERT INTO tenants (id, name, created_at, updated_at)
        VALUES (?,?,?,?)
      `
      ).run(id, name, now, now);

      // Si tu tabla memberships tiene también updated_at, agrégalo aquí.
      db.prepare(
        `
        INSERT INTO memberships (user_id, tenant_id, role, created_at)
        VALUES (?,?,?,?)
      `
      ).run(req.user.id, id, "owner", now);
    });

    txn();
    return res.status(201).json({ id, name });
  } catch (e) {
    console.error("POST /tenants error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /tenants/switch
 * Valida que el usuario pertenezca al tenant y confirma el cambio.
 * Body: { tenant_id }
 *
 * Nota: el “switch real” lo haces enviando el header X-Tenant-Id desde el cliente.
 * Este endpoint es para que la UI valide antes de empezar a usar ese tenant.
 */
r.post("/tenants/switch", (req, res) => {
  const { tenant_id } = req.body || {};
  if (!tenant_id) return res.status(400).json({ error: "tenant_id_required" });

  try {
    const membership = db
      .prepare(
        `
        SELECT role
        FROM memberships
        WHERE user_id = ? AND tenant_id = ?
        LIMIT 1
      `
      )
      .get(req.user.id, tenant_id);

    if (!membership) {
      return res.status(403).json({ error: "forbidden_tenant" });
    }

    // No cambiamos el token aquí. La app debe enviar X-Tenant-Id en cada request.
    return res.json({ ok: true, tenant_id, role: membership.role });
  } catch (e) {
    console.error("POST /tenants/switch error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/* =========================================================
   NUEVO: Descubrir tenants y Unirse por ID (auto-join)
   Controlado por env ALLOW_SELF_JOIN=1
========================================================= */

/**
 * GET /tenants/discover?query=ac
 * Búsqueda acotada por id o name (prefijo/substring). Máx 20 resultados.
 * Devuelve solo { id, name } para evitar filtrar data sensible.
 */
r.get("/tenants/discover", (req, res) => {
  try {
    const q = String(req.query.query || "").trim();
    if (!q) return res.json({ items: [] });
    const limit = 20;

    const rows = db
      .prepare(
        `
        SELECT id, name
        FROM tenants
        WHERE id LIKE ? OR name LIKE ?
        ORDER BY name COLLATE NOCASE ASC
        LIMIT ?
      `
      )
      .all(`%${q}%`, `%${q}%`, limit);

    return res.json({ items: rows });
  } catch (e) {
    console.error("GET /tenants/discover error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /tenants/join
 * Body: { tenant_id }
 * Si ALLOW_SELF_JOIN=1 → crea membership (member) si no existía.
 * Si =0 → 403 (usar invitaciones).
 */
r.post("/tenants/join", (req, res) => {
  try {
    const { tenant_id } = req.body || {};
    if (!tenant_id) return res.status(400).json({ error: "tenant_id_required" });

    const t = db
      .prepare(`SELECT id, name FROM tenants WHERE id = ?`)
      .get(tenant_id);
    if (!t) return res.status(404).json({ error: "tenant_not_found" });

    if (!ALLOW_SELF_JOIN) {
      return res
        .status(403)
        .json({ error: "self_join_disabled_use_invitations" });
    }

    const userId = req.user?.id || req.auth?.sub;
    if (!userId) return res.status(401).json({ error: "unauthorized" });

    const exists = db
      .prepare(
        `SELECT 1 FROM memberships WHERE user_id = ? AND tenant_id = ? LIMIT 1`
      )
      .get(userId, t.id);
    if (exists) {
      return res.json({ ok: true, joined: false, message: "already_member" });
    }

    db.prepare(
      `INSERT INTO memberships (user_id, tenant_id, role, created_at)
       VALUES (?, ?, 'member', ?)`
    ).run(userId, t.id, Date.now());

    return res
      .status(201)
      .json({ ok: true, joined: true, tenant: { id: t.id, name: t.name } });
  } catch (e) {
    console.error("POST /tenants/join error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

module.exports = r;


// // server/routes/tenants.js
// const { Router } = require("express");
// const db = require("../db/connection");
// const requireAuth = require("../lib/requireAuth");

// const r = Router();

// // Protección adicional por si reutilizan este router en otro lado.
// r.use(requireAuth);

// /**
//  * GET /tenants
//  * Lista los tenants a los que pertenece el usuario autenticado.
//  */
// r.get("/tenants", (req, res) => {
//   try {
//     const rows = db
//       .prepare(
//         `
//         SELECT
//           t.id,
//           t.name,
//           m.role,
//           t.created_at,
//           t.updated_at
//         FROM memberships m
//         JOIN tenants t ON t.id = m.tenant_id
//         WHERE m.user_id = ?
//         ORDER BY t.name COLLATE NOCASE ASC
//       `
//       )
//       .all(req.user.id);

//     return res.json({ items: rows });
//   } catch (e) {
//     console.error("GET /tenants error:", e);
//     return res.status(500).json({ error: "internal_error" });
//   }
// });

// /**
//  * GET /tenants/current
//  * Devuelve el tenant activo (resuelto por header X-Tenant-Id o token).
//  */
// r.get("/tenants/current", (req, res) => {
//   return res.json({ tenant_id: req.tenantId || null });
// });

// /**
//  * POST /tenants
//  * Crea un tenant nuevo y agrega al usuario actual como owner.
//  * Requiere rol admin/owner (según tu payload de roles).
//  * Body: { id, name }
//  */
// r.post("/tenants", (req, res) => {
//   // Ajusta esto si tus roles viven en otro lugar del req:
//   const isAdmin = !!req.auth?.roles?.admin;
//   const isOwner = req.auth?.roles?.owner === true;
//   if (!isAdmin && !isOwner) {
//     return res.status(403).json({ error: "forbidden" });
//   }

//   const { id, name } = req.body || {};
//   if (!id || !name) return res.status(400).json({ error: "id_and_name_required" });

//   // Validación simple del id (alfa, guion y guion_bajo)
//   if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
//     return res.status(400).json({ error: "invalid_tenant_id" });
//   }

//   try {
//     const exists = db
//       .prepare(`SELECT 1 AS one FROM tenants WHERE id = ? LIMIT 1`)
//       .get(id);
//     if (exists) return res.status(409).json({ error: "tenant_exists" });

//     const now = Date.now();
//     const txn = db.transaction(() => {
//       db.prepare(
//         `
//         INSERT INTO tenants (id, name, created_at, updated_at)
//         VALUES (?,?,?,?)
//       `
//       ).run(id, name, now, now);

//       // Si tu tabla memberships tiene también updated_at, agrégalo aquí.
//       db.prepare(
//         `
//         INSERT INTO memberships (user_id, tenant_id, role, created_at)
//         VALUES (?,?,?,?)
//       `
//       ).run(req.user.id, id, "owner", now);
//     });

//     txn();
//     return res.status(201).json({ id, name });
//   } catch (e) {
//     console.error("POST /tenants error:", e);
//     return res.status(500).json({ error: "internal_error" });
//   }
// });

// /**
//  * POST /tenants/switch
//  * Valida que el usuario pertenezca al tenant y confirma el cambio.
//  * Body: { tenant_id }
//  *
//  * Nota: el “switch real” lo haces enviando el header X-Tenant-Id desde el cliente.
//  * Este endpoint es para que la UI valide antes de empezar a usar ese tenant.
//  */
// r.post("/tenants/switch", (req, res) => {
//   const { tenant_id } = req.body || {};
//   if (!tenant_id) return res.status(400).json({ error: "tenant_id_required" });

//   try {
//     const membership = db
//       .prepare(
//         `
//         SELECT role
//         FROM memberships
//         WHERE user_id = ? AND tenant_id = ?
//         LIMIT 1
//       `
//       )
//       .get(req.user.id, tenant_id);

//     if (!membership) {
//       return res.status(403).json({ error: "forbidden_tenant" });
//     }

//     // No cambiamos el token aquí. La app debe enviar X-Tenant-Id en cada request.
//     return res.json({ ok: true, tenant_id, role: membership.role });
//   } catch (e) {
//     console.error("POST /tenants/switch error:", e);
//     return res.status(500).json({ error: "internal_error" });
//   }
// });

// module.exports = r;


// // server/routes/tenants.js
// const { Router } = require("express");
// const db = require("../db/connection");
// const requireAuth = require("../lib/requireAuth");

// const r = Router();

// // Protección (también estás montando requireAuth en app.js antes de estas rutas,
// // pero lo dejamos acá por seguridad si alguien reusa el router en otro contexto).
// r.use(requireAuth);

// /**
//  * GET /tenants
//  * Lista los tenants a los que pertenece el usuario autenticado.
//  */
// r.get("/tenants", (req, res) => {
//   try {
//     const rows = db
//       .prepare(
//         `SELECT t.id, t.name, m.role, t.created_at, t.updated_at
//          FROM memberships m
//          JOIN tenants t ON t.id = m.tenant_id
//          WHERE m.user_id = ?
//          ORDER BY t.name ASC`
//       )
//       .all(req.user.id);

//     return res.json({ items: rows });
//   } catch (e) {
//     console.error("GET /tenants error:", e);
//     return res.status(500).json({ error: "internal_error" });
//   }
// });

// /**
//  * GET /tenants/current
//  * Devuelve el tenant activo (resuelto por header X-Tenant-Id o token).
//  */
// r.get("/tenants/current", (req, res) => {
//   return res.json({ tenant_id: req.tenantId });
// });

// /**
//  * POST /tenants
//  * Crea un tenant nuevo y agrega al usuario actual como owner.
//  * Requiere rol admin/owner (según tu payload de roles).
//  * Body: { id, name }
//  */
// r.post("/tenants", (req, res) => {
//   if (!req.auth?.roles?.admin && req.auth?.roles?.owner !== true) {
//     return res.status(403).json({ error: "forbidden" });
//   }

//   const { id, name } = req.body || {};
//   if (!id || !name) return res.status(400).json({ error: "id_and_name_required" });

//   // Validación simple del id (alfa, guion y guion_bajo)
//   if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
//     return res.status(400).json({ error: "invalid_tenant_id" });
//   }

//   try {
//     const exists = db.prepare(`SELECT 1 FROM tenants WHERE id = ?`).get(id);
//     if (exists) return res.status(409).json({ error: "tenant_exists" });

//     const now = Date.now();
//     const txn = db.transaction(() => {
//       db.prepare(
//         `INSERT INTO tenants (id, name, created_at, updated_at)
//          VALUES (?,?,?,?)`
//       ).run(id, name, now, now);

//       db.prepare(
//         `INSERT INTO memberships (user_id, tenant_id, role, created_at)
//          VALUES (?,?,?,?)`
//       ).run(req.user.id, id, "owner", now);
//     });

//     txn();
//     return res.status(201).json({ id, name });
//   } catch (e) {
//     console.error("POST /tenants error:", e);
//     return res.status(500).json({ error: "internal_error" });
//   }
// });

// /**
//  * POST /tenants/switch
//  * Valida que el usuario pertenezca al tenant y confirma el cambio.
//  * Body: { tenant_id }
//  *
//  * Nota: el “switch real” lo haces enviando el header X-Tenant-Id desde el cliente.
//  * Este endpoint es para que la UI valide antes de empezar a usar ese tenant.
//  */
// r.post("/tenants/switch", (req, res) => {
//   const { tenant_id } = req.body || {};
//   if (!tenant_id) return res.status(400).json({ error: "tenant_id_required" });

//   try {
//     const membership = db
//       .prepare(
//         `SELECT role FROM memberships WHERE user_id = ? AND tenant_id = ? LIMIT 1`
//       )
//       .get(req.user.id, tenant_id);

//     if (!membership) {
//       return res.status(403).json({ error: "forbidden_tenant" });
//     }

//     // No cambiamos el token aquí. La app debe enviar X-Tenant-Id en cada request.
//     return res.json({ ok: true, tenant_id, role: membership.role });
//   } catch (e) {
//     console.error("POST /tenants/switch error:", e);
//     return res.status(500).json({ error: "internal_error" });
//   }
// });

// module.exports = r;


