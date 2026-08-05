-- Evolution ERP: migración para fábrica y precios específicos por sede
-- Agrega is_factory a warehouses y sale_price a warehouse_product_settings

ALTER TABLE warehouses 
  ADD COLUMN IF NOT EXISTS is_factory boolean NOT NULL DEFAULT false;

ALTER TABLE warehouse_product_settings 
  ADD COLUMN IF NOT EXISTS sale_price numeric(18, 2) DEFAULT NULL;
