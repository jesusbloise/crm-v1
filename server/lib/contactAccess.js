// server/lib/contactAccess.js
const db = require("../db/connection");
const { resolveUserId } = require("./authorize");

/**
 * Condición parametrizada para consultar contactos visibles.
 * El alias debe ser una constante del backend, nunca un dato del cliente.
 *
 * No concede acceso especial por rol:
 * un administrador tampoco puede ver contactos privados ajenos.
 *
 * Esta condición debe combinarse con el control de acceso al workspace.
 */
function contactVisibilityFilter(req, alias = "c") {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) {
    throw new Error("Alias de contactos inválido");
  }

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

/**
 * Devuelve el contacto si el usuario puede verlo.
 * Devuelve null tanto si no existe como si no tiene acceso.
 */
async function getVisibleContact(req, contactId) {
  if (typeof contactId !== "string" || !contactId.trim()) {
    return null;
  }

  const filter = contactVisibilityFilter(req, "c");

  return db
    .prepare(`
      SELECT c.*
      FROM contacts c
      WHERE c.id = ?
        AND ${filter.sql}
      LIMIT 1
    `)
    .get(contactId.trim(), ...filter.params);
}

/**
 * Solo el creador administra con quién comparte el contacto.
 * Los permisos para editar otros datos se comprobarán por separado.
 */
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
 * Hereda permisos del contacto directo y del contacto de la oportunidad.
 * Si hay ambos vínculos, el usuario debe tener acceso a ambos.
 * Los vínculos inexistentes se bloquean.
 */
function linkedContactVisibilityFilter(req, alias) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) {
    throw new Error("Alias de recurso inválido");
  }

  const userId = resolveUserId(req);

  if (!userId || !req.tenantId) {
    return { sql: "FALSE", params: [] };
  }

  const direct = contactVisibilityFilter(req, "direct_contact");
  const indirect = contactVisibilityFilter(req, "deal_contact");

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
              AND (
                NULLIF(linked_deal.contact_id, '') IS NULL
                OR EXISTS (
                  SELECT 1
                  FROM contacts deal_contact
                  WHERE deal_contact.id = linked_deal.contact_id
                    AND deal_contact.tenant_id = linked_deal.tenant_id
                    AND ${indirect.sql}
                )
              )
          )
        )
      )
    `,
    params: [
      req.tenantId,
      ...direct.params,
      ...indirect.params,
    ],
  };
}

/**
 * Comprueba los vínculos antes de crear o modificar un recurso.
 */
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
  linkedContactVisibilityFilter,
  canAccessContactLinks,
};