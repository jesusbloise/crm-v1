// server/lib/contactAccess.js
const db = require("../db/connection");
const { resolveUserId } = require("./authorize");

function validateAlias(alias) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) {
    throw new Error("Alias de recurso inválido");
  }
}

/**
 * Contactos visibles dentro del workspace.
 * El rol administrativo no evita la privacidad del contacto.
 */
function contactVisibilityFilter(req, alias = "c") {
  validateAlias(alias);

  const userId = resolveUserId(req);
  const tenantId = req.tenantId;

  if (!userId || !tenantId) {
    return { sql: "FALSE", params: [] };
  }

  return {
    sql: `
      (
        ${alias}.tenant_id = ?
        AND (
          ${alias}.visibility = 'workspace'
          OR ${alias}.created_by = ?
          OR (
            ${alias}.visibility = 'selected'
            AND EXISTS (
              SELECT 1
              FROM contact_shares cs
              WHERE cs.tenant_id = ${alias}.tenant_id
                AND cs.contact_id = ${alias}.id
                AND cs.user_id = ?
            )
          )
        )
      )
    `,
    params: [tenantId, userId, userId],
  };
}

async function getVisibleContact(req, contactId) {
  if (typeof contactId !== "string" || !contactId.trim()) {
    return null;
  }

  const filter = contactVisibilityFilter(req, "c");

  return db.prepare(`
    SELECT c.*
    FROM contacts c
    WHERE c.id = ?
      AND ${filter.sql}
    LIMIT 1
  `).get(contactId.trim(), ...filter.params);
}

function canManageContactSharing(req, contact) {
  const userId = resolveUserId(req);

  return Boolean(
    userId &&
    req.tenantId &&
    contact &&
    contact.tenant_id === req.tenantId &&
    contact.created_by === userId
  );
}

/**
 * Acceso de lectura y seguimiento a oportunidades.
 *
 * Member: creador o responsable.
 * Admin/owner: todas las del workspace.
 * Siempre exige acceso al contacto vinculado.
 *
 * El rol se consulta en la base de datos, no en el cliente.
 * El acceso al workspace lo mantiene el middleware existente.
 */
function dealVisibilityFilter(req, alias = "d") {
  validateAlias(alias);

  const userId = resolveUserId(req);

  if (!userId || !req.tenantId) {
    return { sql: "FALSE", params: [] };
  }

  const contact = contactVisibilityFilter(
    req,
    "opportunity_contact"
  );

  return {
    sql: `
      (
        ${alias}.tenant_id = ?
        AND EXISTS (
          SELECT 1
          FROM users deal_viewer
          WHERE deal_viewer.id = ?
            AND COALESCE(deal_viewer.active, TRUE) = TRUE
            AND (
              LOWER(deal_viewer.role) IN ('admin', 'owner')
              OR (
                LOWER(deal_viewer.role) = 'member'
                AND (
                  ${alias}.created_by = deal_viewer.id
                  OR ${alias}.assigned_to = deal_viewer.id
                )
              )
            )
        )
        AND (
          NULLIF(${alias}.contact_id, '') IS NULL
          OR EXISTS (
            SELECT 1
            FROM contacts opportunity_contact
            WHERE opportunity_contact.id = ${alias}.contact_id
              AND opportunity_contact.tenant_id = ${alias}.tenant_id
              AND ${contact.sql}
          )
        )
      )
    `,
    params: [
      req.tenantId,
      userId,
      ...contact.params,
    ],
  };
}

/**
 * Exige acceso al contacto directo y a la oportunidad vinculada.
 * Si existen ambos vínculos, ambos deben ser accesibles.
 * No concede acceso por conocer el ID del recurso.
 */
function linkedContactVisibilityFilter(req, alias) {
  validateAlias(alias);

  if (!resolveUserId(req) || !req.tenantId) {
    return { sql: "FALSE", params: [] };
  }

  const direct = contactVisibilityFilter(req, "direct_contact");
  const deal = dealVisibilityFilter(req, "linked_deal");

  return {
    sql: `
      (
        ${alias}.tenant_id = ?
        AND (
          NULLIF(${alias}.contact_id, '') IS NULL
          OR EXISTS (
            SELECT 1
            FROM contacts direct_contact
            WHERE direct_contact.id = ${alias}.contact_id
              AND direct_contact.tenant_id = ${alias}.tenant_id
              AND ${direct.sql}
          )
        )
        AND (
          NULLIF(${alias}.deal_id, '') IS NULL
          OR EXISTS (
            SELECT 1
            FROM deals linked_deal
            WHERE linked_deal.id = ${alias}.deal_id
              AND linked_deal.tenant_id = ${alias}.tenant_id
              AND ${deal.sql}
          )
        )
      )
    `,
    params: [
      req.tenantId,
      ...direct.params,
      ...deal.params,
    ],
  };
}

async function canAccessContactLinks(req, contactId, dealId) {
  const filter = linkedContactVisibilityFilter(req, "resource");

  const row = await db.prepare(`
    SELECT 1 AS allowed
    FROM (
      SELECT
        ?::text AS tenant_id,
        ?::text AS contact_id,
        ?::text AS deal_id
    ) resource
    WHERE ${filter.sql}
  `).get(
    req.tenantId,
    contactId || null,
    dealId || null,
    ...filter.params
  );

  return Boolean(row);
}

module.exports = {
  contactVisibilityFilter,
  getVisibleContact,
  canManageContactSharing,
  dealVisibilityFilter,
  linkedContactVisibilityFilter,
  canAccessContactLinks,
};