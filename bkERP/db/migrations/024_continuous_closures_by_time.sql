-- 024_continuous_closures_by_time.sql
-- Cierres continuos por fecha y hora (múltiples cierres por día / turnos)

-- 1. Permitir múltiples cierres por día eliminando la restricción de 1 cierre por almacén/fecha
DROP INDEX IF EXISTS ux_daily_closure_wh_date_active;

-- 2. Fechas y horas de inicio y fin del turno en Cierres Diarios
ALTER TABLE daily_closures ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE daily_closures ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE daily_closures ADD COLUMN IF NOT EXISTS shift_number INT NOT NULL DEFAULT 1;

-- 3. Fechas y horas de inicio y fin en Cierres Generales
ALTER TABLE global_closures ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE global_closures ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Actualizar registros existentes para tener closed_at = submitted_at o created_at si eran nulos
UPDATE daily_closures SET closed_at = COALESCE(submitted_at, created_at) WHERE closed_at IS NULL;
UPDATE global_closures SET closed_at = created_at WHERE closed_at IS NULL;
