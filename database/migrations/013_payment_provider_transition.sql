-- +migrate Up

-- Existing Midtrans columns/data remain untouched; legacy context stays NULL
-- until an operator can prove the historical environment/merchant.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS gateway_environment VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS merchant_code_snapshot VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS gateway_reference VARCHAR(150) COLLATE utf8mb4_bin NULL,
  ADD COLUMN IF NOT EXISTS gateway_redirect_url VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS invoice_state VARCHAR(30) NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS next_status_check_at DATETIME NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_provider_reference
  ON payments(gateway,gateway_environment,gateway_reference);

-- +migrate Down

-- Non-destructive down intentionally retains columns and payment evidence.
-- Operational rollback: disable checkout, retain both callback adapters.
SELECT 1;
