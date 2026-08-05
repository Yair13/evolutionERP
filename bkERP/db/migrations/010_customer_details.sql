-- Evolution ERP: migración para detalles de clientes
-- Agrega columna address a la tabla customers

ALTER TABLE customers 
  ADD COLUMN IF NOT EXISTS address text;
