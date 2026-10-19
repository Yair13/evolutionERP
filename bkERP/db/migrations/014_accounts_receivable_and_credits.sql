-- Evolution ERP: Cuentas por Cobrar (Créditos), Abonos y Saldo a Favor de Clientes

-- 1. Saldo a favor en tabla customers
ALTER TABLE customers 
  ADD COLUMN IF NOT EXISTS credit_balance numeric(18, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN customers.credit_balance IS 'Saldo a favor acumulado del cliente para futuras compras.';

-- 2. Tabla de Cuentas por Cobrar (Créditos generados en ventas)
CREATE TABLE IF NOT EXISTS accounts_receivable (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      uuid REFERENCES inventory_documents (id) ON DELETE SET NULL,
  invoice_number   text NOT NULL,
  warehouse_id     uuid NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
  customer_id      uuid NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
  total_amount     numeric(18, 2) NOT NULL CHECK (total_amount >= 0),
  initial_payment  numeric(18, 2) NOT NULL DEFAULT 0 CHECK (initial_payment >= 0),
  paid_amount      numeric(18, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  balance_amount   numeric(18, 2) NOT NULL CHECK (balance_amount >= 0),
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'paid', 'cancelled')),
  due_date         date,
  notes            text,
  created_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  paid_at          timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ar_wh_status ON accounts_receivable (warehouse_id, status);
CREATE INDEX IF NOT EXISTS idx_ar_customer ON accounts_receivable (customer_id);
CREATE INDEX IF NOT EXISTS idx_ar_invoice ON accounts_receivable (invoice_number);
CREATE INDEX IF NOT EXISTS idx_ar_created_at ON accounts_receivable (created_at DESC);

COMMENT ON TABLE accounts_receivable IS 'Cuentas por cobrar generadas por salidas tipo crédito.';

-- 3. Tabla de Abonos / Pagos de Cartera
CREATE TABLE IF NOT EXISTS receivable_payments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id     uuid NOT NULL REFERENCES accounts_receivable (id) ON DELETE CASCADE,
  customer_id       uuid NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
  warehouse_id      uuid NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
  receipt_number    text NOT NULL,
  payment_method    text NOT NULL,
  amount            numeric(18, 2) NOT NULL CHECK (amount > 0),
  applied_to_debt   numeric(18, 2) NOT NULL DEFAULT 0 CHECK (applied_to_debt >= 0),
  excess_to_favour  numeric(18, 2) NOT NULL DEFAULT 0 CHECK (excess_to_favour >= 0),
  notes             text,
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rp_receivable ON receivable_payments (receivable_id);
CREATE INDEX IF NOT EXISTS idx_rp_customer ON receivable_payments (customer_id);
CREATE INDEX IF NOT EXISTS idx_rp_wh_time ON receivable_payments (warehouse_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rp_receipt ON receivable_payments (receipt_number);

COMMENT ON TABLE receivable_payments IS 'Historial de abonos y pagos a créditos de clientes.';
