-- Documentos y versiones de presupuestos por oportunidad.
-- El ejecutor de migraciones administra la transacción.

CREATE TABLE deal_documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  deal_id TEXT NOT NULL,

  original_name TEXT NOT NULL,
  extension TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  content BYTEA NOT NULL,

  version INTEGER NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,

  -- Importe declarado para esta versión.
  -- No modifica automáticamente el monto de la oportunidad.
  quoted_amount BIGINT,

  uploaded_by TEXT,
  created_at BIGINT NOT NULL,

  CONSTRAINT deal_documents_extension_check
    CHECK (
      extension IN ('pdf', 'doc', 'docx', 'xls', 'xlsx')
    ),

  CONSTRAINT deal_documents_size_check
    CHECK (
      byte_size > 0
      AND byte_size <= 10485760
      AND octet_length(content) = byte_size
    ),

  CONSTRAINT deal_documents_version_check
    CHECK (version > 0),

  CONSTRAINT deal_documents_amount_check
    CHECK (
      quoted_amount IS NULL
      OR quoted_amount >= 0
    ),

  CONSTRAINT deal_documents_name_check
    CHECK (
      length(btrim(original_name)) > 0
      AND length(original_name) <= 255
    ),

  CONSTRAINT deal_documents_version_unique
    UNIQUE (tenant_id, deal_id, version),

  FOREIGN KEY (tenant_id, deal_id)
    REFERENCES deals (tenant_id, id)
    ON DELETE CASCADE,

  FOREIGN KEY (uploaded_by)
    REFERENCES users (id)
    ON DELETE SET NULL
);

-- Solo puede existir un presupuesto vigente por oportunidad.
CREATE UNIQUE INDEX idx_deal_documents_current
  ON deal_documents (tenant_id, deal_id)
  WHERE is_current = TRUE;

CREATE INDEX idx_deal_documents_versions
  ON deal_documents (tenant_id, deal_id, version DESC);