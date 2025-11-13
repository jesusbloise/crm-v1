-- fix-audit-logs.sql
-- Ejecutar este script en pgAdmin o cualquier cliente de PostgreSQL
-- conectado a la base de datos: crm-v1

-- 1. Eliminar la tabla existente
DROP TABLE IF EXISTS audit_logs CASCADE;

-- 2. Recrear con BIGINT para created_at
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  tenant_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at BIGINT NOT NULL  -- BIGINT en lugar de INTEGER
);

-- 3. Recrear índices
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user_tenant ON audit_logs(user_id, tenant_id, created_at DESC);

-- 4. Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'audit_logs' AND column_name = 'created_at';
-- Debería mostrar: created_at | bigint
