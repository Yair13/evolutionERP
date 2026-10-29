-- Migration 029: Soporte para desactivar y eliminar clientes de forma segura
ALTER TABLE customers 
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_customers_is_active 
  ON customers (is_active);
