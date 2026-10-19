-- Migration 017: Comprobantes de Egreso (Salidas de Dinero) y Traslado de Dinero entre Sedes

-- 1. Agregar is_main a almacenes si no existe
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS is_main boolean NOT NULL DEFAULT false;
UPDATE warehouses SET is_main = true WHERE code = 'MAIN' OR name ILIKE '%principal%';

-- 2. Tabla de Comprobantes de Egreso (Salidas de Dinero)
CREATE TABLE IF NOT EXISTS cash_outflows (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_number   text NOT NULL,
  warehouse_id     uuid NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
  concept          text NOT NULL,
  beneficiary_name text NOT NULL,
  beneficiary_doc  text,
  amount           numeric(18, 2) NOT NULL CHECK (amount > 0),
  payment_method   text NOT NULL,
  supplier_id      uuid REFERENCES suppliers (id) ON DELETE SET NULL,
  payable_id       uuid REFERENCES accounts_payable (id) ON DELETE SET NULL,
  reference_code   text,
  notes            text,
  created_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_co_voucher ON cash_outflows (voucher_number);
CREATE INDEX IF NOT EXISTS idx_co_warehouse ON cash_outflows (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_co_supplier ON cash_outflows (supplier_id);
CREATE INDEX IF NOT EXISTS idx_co_created_at ON cash_outflows (created_at DESC);

-- 3. Tabla de Traslados de Dinero entre Sedes
CREATE TABLE IF NOT EXISTS cash_transfers (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                     text NOT NULL,
  origin_warehouse_id      uuid NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
  destination_warehouse_id uuid NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
  amount                   numeric(18, 2) NOT NULL CHECK (amount > 0),
  carrier_name             text NOT NULL,
  carrier_doc              text,
  concept                  text NOT NULL,
  payment_method           text NOT NULL DEFAULT 'efectivo',
  status                   text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  rejection_reason         text,
  created_by               uuid REFERENCES users (id) ON DELETE SET NULL,
  approved_by              uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  approved_at              timestamptz,
  CHECK (origin_warehouse_id <> destination_warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_ct_origin ON cash_transfers (origin_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_ct_dest ON cash_transfers (destination_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_ct_status ON cash_transfers (status);
CREATE INDEX IF NOT EXISTS idx_ct_created_at ON cash_transfers (created_at DESC);
