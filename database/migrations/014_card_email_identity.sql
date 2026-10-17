-- +migrate Up

-- ADDITIVE ONLY. No inferred backfill, cleanup or ownership changes.
-- NULL means unreviewed legacy identity; claim fails closed until reviewed.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS registration_email VARBINARY(254) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cards_registration_email ON cards(registration_email);

CREATE TABLE IF NOT EXISTS card_email_identities (
  email VARBINARY(254) NOT NULL PRIMARY KEY,
  card_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  KEY idx_card_email_card (card_id),
  CONSTRAINT fk_card_email_card FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- +migrate Down

-- Retain reservations. Rollback must not reopen email slots.
SELECT 1;
