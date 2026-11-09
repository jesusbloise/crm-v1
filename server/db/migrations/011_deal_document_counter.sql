-- Mantiene la numeración aunque se eliminen documentos.
ALTER TABLE deals
  ADD COLUMN document_version INTEGER NOT NULL DEFAULT 0;

UPDATE deals d
SET document_version = COALESCE(
  (
    SELECT MAX(doc.version)
    FROM deal_documents doc
    WHERE doc.tenant_id = d.tenant_id
      AND doc.deal_id = d.id
  ),
  0
);