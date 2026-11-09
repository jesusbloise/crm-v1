-- Seguimiento comercial de oportunidades.
-- migrate-pg.js administra la transacción.

-- Responsable comercial.
-- Los registros existentes mantienen el acceso por created_by.
ALTER TABLE deals
  ADD COLUMN assigned_to TEXT;

ALTER TABLE deals
  ADD CONSTRAINT deals_assigned_to_user_fk
  FOREIGN KEY (assigned_to)
  REFERENCES users (id)
  ON DELETE SET NULL;

-- Motivo del último cierre perdido.
ALTER TABLE deals
  ADD COLUMN lost_reason TEXT;

-- Momento del último cierre ganado o perdido.
-- close_date continúa siendo la fecha prevista de cierre.
ALTER TABLE deals
  ADD COLUMN closed_at BIGINT;

CREATE INDEX idx_deals_tenant_assignee
  ON deals (tenant_id, assigned_to);

CREATE INDEX idx_deals_tenant_creator
  ON deals (tenant_id, created_by);

-- Necesario para vincular el historial al workspace y oportunidad.
ALTER TABLE deals
  ADD CONSTRAINT deals_tenant_id_id_unique
  UNIQUE (tenant_id, id);

CREATE TABLE deal_stage_history (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  deal_id TEXT NOT NULL,

  from_stage TEXT,
  to_stage TEXT NOT NULL,

  changed_by TEXT,
  reason TEXT,
  created_at BIGINT NOT NULL,

  CONSTRAINT deal_stage_history_from_stage_check
    CHECK (
      from_stage IS NULL
      OR from_stage IN (
        'nuevo',
        'calificado',
        'propuesta',
        'negociacion',
        'ganado',
        'perdido'
      )
    ),

  CONSTRAINT deal_stage_history_to_stage_check
    CHECK (
      to_stage IN (
        'nuevo',
        'calificado',
        'propuesta',
        'negociacion',
        'ganado',
        'perdido'
      )
    ),

  FOREIGN KEY (tenant_id, deal_id)
    REFERENCES deals (tenant_id, id)
    ON DELETE CASCADE,

  FOREIGN KEY (changed_by)
    REFERENCES users (id)
    ON DELETE SET NULL
);

CREATE INDEX idx_deal_stage_history_deal_date
  ON deal_stage_history (
    tenant_id,
    deal_id,
    created_at DESC,
    id
  );