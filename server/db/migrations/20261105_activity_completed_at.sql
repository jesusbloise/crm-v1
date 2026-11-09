-- La transacción la administra runSQLMigrations.

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS completed_at BIGINT;

-- Registra la finalización desde cualquier ruta que cambie el estado.
CREATE OR REPLACE FUNCTION crm_activity_completion_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'done' THEN
      NEW.completed_at :=
        FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;
    ELSE
      NEW.completed_at := NULL;
    END IF;

  ELSIF NEW.status = 'done' THEN
    IF OLD.status IS DISTINCT FROM 'done' THEN
      NEW.completed_at :=
        FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;
    ELSE
      -- Editar una actividad realizada no cambia su finalización.
      -- Las realizadas antiguas conservan NULL si no conocemos la fecha.
      NEW.completed_at := OLD.completed_at;
    END IF;

  ELSE
    -- Reabrir o cancelar deja de contar como una realización vigente.
    NEW.completed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_activity_completion_timestamp_trigger
  ON activities;

CREATE TRIGGER crm_activity_completion_timestamp_trigger
BEFORE INSERT OR UPDATE ON activities
FOR EACH ROW
EXECUTE FUNCTION crm_activity_completion_timestamp();

CREATE INDEX IF NOT EXISTS idx_activities_tenant_completed_at
  ON activities (tenant_id, completed_at)
  WHERE completed_at IS NOT NULL;