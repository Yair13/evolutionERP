-- 018_payroll_and_employees.sql
-- Gestión de empleados y nómina con comprobantes de pago (vouchers)
-- y soporte de comprobante de transferencia bancaria / descuento de caja menor en efectivo.

CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    document_type VARCHAR(20) NOT NULL DEFAULT 'CC',
    document_number VARCHAR(50) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(150),
    position VARCHAR(100) NOT NULL,
    warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
    base_salary NUMERIC(12, 2) NOT NULL DEFAULT 0,
    payment_frequency VARCHAR(20) NOT NULL DEFAULT 'quincenal',
    bank_name VARCHAR(100),
    bank_account_type VARCHAR(50),
    bank_account_number VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employees_warehouse ON employees(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_employees_document ON employees(document_number);
CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(is_active);

CREATE TABLE IF NOT EXISTS payroll_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_number VARCHAR(50) NOT NULL UNIQUE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    period_concept VARCHAR(150) NOT NULL,
    base_salary NUMERIC(12, 2) NOT NULL DEFAULT 0,
    bonuses NUMERIC(12, 2) NOT NULL DEFAULT 0,
    deductions NUMERIC(12, 2) NOT NULL DEFAULT 0,
    net_amount NUMERIC(12, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    transfer_receipt_url TEXT,
    transfer_receipt_filename VARCHAR(255),
    reference_code VARCHAR(100),
    deducted_from_cash_register BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_payments_employee ON payroll_payments(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_payments_warehouse ON payroll_payments(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_payroll_payments_date ON payroll_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payroll_payments_method ON payroll_payments(payment_method);
CREATE INDEX IF NOT EXISTS idx_payroll_payments_voucher ON payroll_payments(voucher_number);
