-- 009_work_projects.sql
-- Proyectos de trabajo para registro de horas.
-- Los crea/administra admin o coordinador.
-- Los usuarios seleccionan uno al registrar horas.

CREATE TABLE IF NOT EXISTS work_projects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  client_name TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_work_projects_tenant
  ON work_projects(tenant_id);

CREATE INDEX IF NOT EXISTS idx_work_projects_tenant_active
  ON work_projects(tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_work_projects_name
  ON work_projects(name);

CREATE INDEX IF NOT EXISTS idx_work_projects_client_name
  ON work_projects(client_name);
