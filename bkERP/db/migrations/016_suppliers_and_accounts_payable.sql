-- Migration 016: Proveedores, Cuentas por Pagar y Comprobantes de Egreso (Salidas de dinero)

-- 1. Tabla de Proveedores
CREATE TABLE IF NOT EXISTS suppliers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  tax_id              text,
  phone               text,
  email               text,
  address             text,
  city                text,
  contact_name        text,
  bank_name           text,
  bank_account_type   text,
  bank_account_number text,
  credit_balance      numeric(18, 2) NOT NULL DEFAULT 0 CHECK (credit_balance >= 0),
  notes               text,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers (name);
CREATE INDEX IF NOT EXISTS idx_suppliers_tax_id ON suppliers (tax_id);

-- 2. Adaptar o recrear accounts_payable con proveedor y sede
ALTER TABLE accounts_payable ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers (id) ON DELETE RESTRICT;
ALTER TABLE accounts_payable ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES warehouses (id) ON DELETE RESTRICT;
ALTER TABLE accounts_payable ADD COLUMN IF NOT EXISTS bill_number text;
ALTER TABLE accounts_payable ADD COLUMN IF NOT EXISTS issue_date date DEFAULT CURRENT_DATE;
ALTER TABLE accounts_payable ADD COLUMN IF NOT EXISTS paid_amount numeric(18, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0);
ALTER TABLE accounts_payable ADD COLUMN IF NOT EXISTS notes text;

-- Si vendor_name era NOT NULL en la tabla antigua, permitir null si ya hay supplier_id
ALTER TABLE accounts_payable ALTER COLUMN vendor_name DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ap_supplier ON accounts_payable (supplier_id);
CREATE INDEX IF NOT EXISTS idx_ap_warehouse ON accounts_payable (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_ap_status ON accounts_payable (status);

-- 3. Tabla de Pagos a Proveedores / Comprobantes de Egreso (payable_payments)
CREATE TABLE IF NOT EXISTS payable_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payable_id      uuid NOT NULL REFERENCES accounts_payable (id) ON DELETE CASCADE,
  supplier_id     uuid NOT NULL REFERENCES suppliers (id) ON DELETE RESTRICT,
  warehouse_id    uuid NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
  receipt_number  text NOT NULL,
  payment_method  text NOT NULL,
  amount          numeric(18, 2) NOT NULL CHECK (amount > 0),
  applied_to_debt numeric(18, 2) NOT NULL CHECK (applied_to_debt >= 0),
  excess_to_favour numeric(18, 2) NOT NULL DEFAULT 0 CHECK (excess_to_favour >= 0),
  reference_code  text,
  notes           text,
  created_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pp_payable ON payable_payments (payable_id);
CREATE INDEX IF NOT EXISTS idx_pp_supplier ON payable_payments (supplier_id);
CREATE INDEX IF NOT EXISTS idx_pp_warehouse ON payable_payments (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_pp_created_at ON payable_payments (created_at DESC);
