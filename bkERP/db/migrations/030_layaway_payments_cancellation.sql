-- Migration 030: Soporte para anular abonos de apartados al cancelar el plan separe
ALTER TABLE layaway_payments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_layaway_payments_status
  ON layaway_payments (status);

-- Marcar como anulados los abonos de apartados que ya hubiesen sido cancelados previamente
-- para que dejen de sumar en arqueos, bancos y cierres, sin alterar saldos a favor previos de clientes.
UPDATE layaway_payments lp
SET status = 'cancelled',
    cancelled_at = COALESCE(lp.cancelled_at, now())
FROM layaways l
WHERE l.id = lp.layaway_id
  AND l.status = 'cancelled'
  AND lp.status = 'active';
