-- Evolution ERP: esquema inicial (multi-almacén, inventario por movimientos, finanzas operativas)
-- Requiere PostgreSQL 14+ (usa gen_random_uuid()).

-- ---------------------------------------------------------------------------
-- Roles y accesos
-- ---------------------------------------------------------------------------
CREATE TABLE roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE roles IS 'Catálogo de roles (super_admin, secretaria, admin_local, …).';

CREATE TABLE warehouses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  address     text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE warehouses IS 'Sedes / almacenes con inventario independiente.';

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL UNIQUE,
  password_hash  text,
  full_name      text NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE users IS 'Usuarios del sistema; password_hash para login futuro.';

CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE user_warehouse (
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES warehouses (id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, warehouse_id)
);

COMMENT ON TABLE user_warehouse IS 'Alcance por sede (p. ej. administrador de local).';

-- ---------------------------------------------------------------------------
-- Productos
-- ---------------------------------------------------------------------------
CREATE TABLE product_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  parent_id  uuid REFERENCES product_categories (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code     text NOT NULL,
  name               text NOT NULL,
  description        text,
  category_id        uuid REFERENCES product_categories (id) ON DELETE SET NULL,
  base_sale_price    numeric(18, 2) NOT NULL DEFAULT 0,
  production_cost    numeric(18, 2) NOT NULL DEFAULT 0,
  margin_percent     numeric(9, 4),
  dimensions         jsonb,
  barcode            text UNIQUE,
  qr_code            text UNIQUE,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reference_code)
);

COMMENT ON COLUMN products.dimensions IS 'JSON flexible: medidas u otros atributos.';

CREATE TABLE warehouse_product_settings (
  warehouse_id         uuid NOT NULL REFERENCES warehouses (id) ON DELETE CASCADE,
  product_id           uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  min_stock_level      numeric(18, 4) NOT NULL DEFAULT 0,
  critical_stock_level numeric(18, 4) NOT NULL DEFAULT 0,
  PRIMARY KEY (warehouse_id, product_id)
);

COMMENT ON TABLE warehouse_product_settings IS 'Umbrales por sede para semáforo de stock.';

-- ---------------------------------------------------------------------------
-- Terceros y órdenes de producción
-- ---------------------------------------------------------------------------
CREATE TABLE customers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  tax_id       text,
  phone        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE production_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code    text NOT NULL UNIQUE,
  warehouse_id  uuid NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  notes         text,
  created_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Inventario: libro de movimientos (fuente de verdad del stock)
-- ---------------------------------------------------------------------------
CREATE TABLE stock_movements (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id         uuid NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
  product_id           uuid NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  movement_type        text NOT NULL CHECK (movement_type IN (
    'entry_factory',
    'sale',
    'exchange',
    'warranty',
    'return_in',
    'payment',
    'credit',
    'transfer_out',
    'transfer_in',
    'adjustment',
    'inventory_close'
  )),
  quantity             numeric(18, 4) NOT NULL,
  unit_cost            numeric(18, 4),
  batch_id             uuid,
  production_order_id  uuid REFERENCES production_orders (id) ON DELETE SET NULL,
  invoice_number       text,
  customer_id          uuid REFERENCES customers (id) ON DELETE SET NULL,
  notes                text,
  metadata             jsonb,
  created_by           uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE stock_movements IS 'Cantidades firmadas: positivo entrada, negativo salida.';
COMMENT ON COLUMN stock_movements.batch_id IS 'Agrupa líneas de un mismo documento operativo.';

CREATE INDEX idx_stock_movements_wh_time ON stock_movements (warehouse_id, created_at DESC);
CREATE INDEX idx_stock_movements_product ON stock_movements (product_id);
CREATE INDEX idx_stock_movements_batch ON stock_movements (batch_id) WHERE batch_id IS NOT NULL;

CREATE OR REPLACE VIEW v_warehouse_product_stock AS
SELECT
  warehouse_id,
  product_id,
  SUM(quantity)::numeric(18, 4) AS quantity_on_hand
FROM stock_movements
GROUP BY warehouse_id, product_id;

COMMENT ON VIEW v_warehouse_product_stock IS 'Stock actual por sede y producto (suma de movimientos).';

-- ---------------------------------------------------------------------------
-- Gastos operativos del local
-- ---------------------------------------------------------------------------
CREATE TABLE expenses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id   uuid NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
  category       text NOT NULL CHECK (category IN (
    'rent', 'utilities', 'commissions', 'transport', 'payroll', 'stationery', 'other'
  )),
  amount         numeric(18, 2) NOT NULL CHECK (amount >= 0),
  description    text,
  expense_date   date NOT NULL,
  attachment_url text,
  created_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_wh_date ON expenses (warehouse_id, expense_date DESC);

-- ---------------------------------------------------------------------------
-- Cierres diarios por almacén
-- ---------------------------------------------------------------------------
CREATE TABLE daily_closures (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id     uuid NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
  closure_date     date NOT NULL,
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'voided')),
  sales_total      numeric(18, 2) NOT NULL DEFAULT 0,
  expenses_total   numeric(18, 2) NOT NULL DEFAULT 0,
  income_total     numeric(18, 2) NOT NULL DEFAULT 0,
  egress_total     numeric(18, 2) NOT NULL DEFAULT 0,
  cash_difference  numeric(18, 2) NOT NULL DEFAULT 0,
  notes            text,
  attachment_urls  jsonb,
  created_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  submitted_at     timestamptz,
  approved_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  approved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_daily_closure_wh_date_active
  ON daily_closures (warehouse_id, closure_date)
  WHERE status <> 'voided';

CREATE TABLE closure_payment_breakdown (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_closure_id uuid NOT NULL REFERENCES daily_closures (id) ON DELETE CASCADE,
  method_code      text NOT NULL,
  amount           numeric(18, 2) NOT NULL,
  UNIQUE (daily_closure_id, method_code)
);

COMMENT ON COLUMN closure_payment_breakdown.method_code IS 'nequi, bancolombia, davivienda, cash, transfer, other, …';

-- ---------------------------------------------------------------------------
-- Cuentas por pagar (secretaría / global)
-- ---------------------------------------------------------------------------
CREATE TABLE accounts_payable (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_name    text NOT NULL,
  description    text,
  total_amount   numeric(18, 2) NOT NULL CHECK (total_amount >= 0),
  balance_amount numeric(18, 2) NOT NULL CHECK (balance_amount >= 0),
  due_date       date,
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'paid', 'cancelled')),
  attachment_url text,
  created_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  paid_at        timestamptz
);

CREATE INDEX idx_ap_due ON accounts_payable (due_date) WHERE status IN ('open', 'partial');

-- ---------------------------------------------------------------------------
-- Cierre global empresarial (consolidado)
-- ---------------------------------------------------------------------------
CREATE TABLE global_closures (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_date date NOT NULL,
  notes       text,
  totals      jsonb NOT NULL DEFAULT '{}',
  created_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Notificaciones y auditoría
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       text NOT NULL,
  title      text NOT NULL,
  body       text,
  payload    jsonb,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE audit_logs (
  id         bigserial PRIMARY KEY,
  user_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  table_name text NOT NULL,
  record_id  uuid,
  action     text NOT NULL,
  old_row    jsonb,
  new_row    jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_table_time ON audit_logs (table_name, created_at DESC);
