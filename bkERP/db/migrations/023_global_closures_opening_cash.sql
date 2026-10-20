-- 023_global_closures_opening_cash.sql
-- Base de inicio / Saldo de arranque en Cierres Contables Generales
ALTER TABLE global_closures ADD COLUMN IF NOT EXISTS opening_cash NUMERIC(18, 2) NOT NULL DEFAULT 0;
