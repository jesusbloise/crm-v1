-- 010_work_assignments.sql
-- Asignaciones futuras de trabajo.
-- No reemplaza el registro real de horas.
-- Sirve para planificar que usuario trabajara en que proyecto, item y horario.

CREATE TABLE IF NOT EXISTS work_assignments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,

  assigned_user_id TEXT NOT NULL,

  project_id TEXT NOT NULL,
  project_name TEXT NOT NULL,

  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,

  assignment_date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  estimated_hours NUMERIC(6,2) NOT NULL,

  description TEXT,
  status TEXT NOT NULL DEFAULT 'assigned',

  created_by TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,

  google_event_id TEXT,
  email_sent_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_work_assignments_tenant
  ON work_assignments(tenant_id);

CREATE INDEX IF NOT EXISTS idx_work_assignments_user
  ON work_assignments(assigned_user_id);

CREATE INDEX IF NOT EXISTS idx_work_assignments_tenant_user
  ON work_assignments(tenant_id, assigned_user_id);

CREATE INDEX IF NOT EXISTS idx_work_assignments_date
  ON work_assignments(assignment_date);

CREATE INDEX IF NOT EXISTS idx_work_assignments_tenant_date
  ON work_assignments(tenant_id, assignment_date);

CREATE INDEX IF NOT EXISTS idx_work_assignments_project
  ON work_assignments(project_id);

CREATE INDEX IF NOT EXISTS idx_work_assignments_item
  ON work_assignments(item_id);

CREATE INDEX IF NOT EXISTS idx_work_assignments_status
  ON work_assignments(status);
