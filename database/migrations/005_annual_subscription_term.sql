-- +migrate Up

UPDATE plans
SET duration_days=365,updated_at=UTC_TIMESTAMP()
WHERE code IN ('basic','pro');

-- +migrate Down

UPDATE plans
SET duration_days=0,updated_at=UTC_TIMESTAMP()
WHERE code IN ('basic','pro');
