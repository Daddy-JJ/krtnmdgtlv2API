-- +migrate Up

ALTER TABLE cards
  ADD KEY idx_cards_user (user_id),
  DROP INDEX uq_cards_user,
  ADD COLUMN active_user_id BIGINT UNSIGNED GENERATED ALWAYS AS (
    CASE WHEN deleted_at IS NULL AND status <> 'deleted' THEN user_id ELSE NULL END
  ) STORED,
  ADD UNIQUE KEY uq_cards_active_user (active_user_id);

-- +migrate Down

-- The legacy unique(user_id) schema cannot represent retained deleted-card ownership.
-- A deliberate rollback preserves card rows but detaches deleted history from its owner.
UPDATE cards SET user_id = NULL
WHERE user_id IS NOT NULL AND (deleted_at IS NOT NULL OR status = 'deleted');

ALTER TABLE cards
  DROP INDEX uq_cards_active_user,
  DROP COLUMN active_user_id,
  ADD UNIQUE KEY uq_cards_user (user_id),
  DROP INDEX idx_cards_user;
