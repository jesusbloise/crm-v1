-- 008_time_tracking.sql
-- Módulo Registro de Horas
-- Sin aprobación por ahora. Solo registro, consulta y filtros.

CREATE TABLE IF NOT EXISTS work_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_work_items_tenant
  ON work_items(tenant_id);

CREATE INDEX IF NOT EXISTS idx_work_items_tenant_active
  ON work_items(tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_work_items_name
  ON work_items(name);


CREATE TABLE IF NOT EXISTS time_entries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,

  -- usuario que registró las horas
  user_id TEXT NOT NULL,

  -- proyecto: por ahora flexible
  project_id TEXT,
  project_name TEXT NOT NULL,

  -- ítem de trabajo
  item_id TEXT,
  item_name TEXT NOT NULL,

  -- fecha de trabajo en formato YYYY-MM-DD
  work_date TEXT NOT NULL,

  -- cantidad de horas registradas
  hours NUMERIC(6,2) NOT NULL,

  -- comentario libre
  description TEXT,

  -- auditoría
  created_by TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_time_entries_tenant
  ON time_entries(tenant_id);

CREATE INDEX IF NOT EXISTS idx_time_entries_user
  ON time_entries(user_id);

CREATE INDEX IF NOT EXISTS idx_time_entries_tenant_user
  ON time_entries(tenant_id, user_id);

CREATE INDEX IF NOT EXISTS idx_time_entries_work_date
  ON time_entries(work_date);

CREATE INDEX IF NOT EXISTS idx_time_entries_tenant_work_date
  ON time_entries(tenant_id, work_date);

CREATE INDEX IF NOT EXISTS idx_time_entries_project
  ON time_entries(project_id);

CREATE INDEX IF NOT EXISTS idx_time_entries_item
  ON time_entries(item_id);