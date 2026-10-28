-- Privacidad de contactos.
-- Los contactos existentes conservan la visibilidad del workspace.
-- El ejecutor migrate-pg.js administra la transaccion.

ALTER TABLE contacts
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'workspace';

ALTER TABLE contacts
  ADD CONSTRAINT contacts_visibility_check
  CHECK (visibility IN ('workspace', 'private', 'selected'));

-- Un contacto restringido necesita un propietario identificable.
ALTER TABLE contacts
  ADD CONSTRAINT contacts_private_owner_check
  CHECK (
    visibility = 'workspace'
    OR NULLIF(BTRIM(created_by), '') IS NOT NULL
  );

-- Permite vincular cada permiso al contacto y su workspace.
ALTER TABLE contacts
  ADD CONSTRAINT contacts_tenant_id_id_unique
  UNIQUE (tenant_id, id);

CREATE TABLE contact_shares (
  tenant_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at BIGINT NOT NULL,

  PRIMARY KEY (tenant_id, contact_id, user_id),

  FOREIGN KEY (tenant_id, contact_id)
    REFERENCES contacts (tenant_id, id)
    ON DELETE CASCADE,

  FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE CASCADE
);

CREATE INDEX idx_contact_shares_tenant_user
  ON contact_shares (tenant_id, user_id, contact_id);

CREATE INDEX idx_contacts_tenant_visibility_creator
  ON contacts (tenant_id, visibility, created_by);