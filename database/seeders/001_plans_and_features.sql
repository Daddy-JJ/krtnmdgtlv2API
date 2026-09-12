INSERT INTO plans
  (code, name, price_amount, currency, duration_days, is_active, created_at, updated_at)
VALUES
  ('starter', 'Starter', 0, 'IDR', 0, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP()),
  ('basic', 'Basic', 0, 'IDR', 365, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP()),
  ('pro', 'Pro', 0, 'IDR', 365, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  currency = VALUES(currency),
  duration_days = VALUES(duration_days),
  is_active = VALUES(is_active),
  updated_at = UTC_TIMESTAMP();

INSERT INTO plan_features
  (plan_id, feature_key, value_type, value_bool, value_int, value_text, created_at, updated_at)
SELECT id, 'login_enabled', 'bool', code IN ('basic', 'pro'), NULL, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM plans
WHERE code IN ('starter', 'basic', 'pro')
ON DUPLICATE KEY UPDATE value_type = VALUES(value_type), value_bool = VALUES(value_bool), value_int = NULL, value_text = NULL, updated_at = UTC_TIMESTAMP();

INSERT INTO plan_features
  (plan_id, feature_key, value_type, value_bool, value_int, value_text, created_at, updated_at)
SELECT id, 'custom_slug_enabled', 'bool', code IN ('basic', 'pro'), NULL, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM plans
WHERE code IN ('starter', 'basic', 'pro')
ON DUPLICATE KEY UPDATE value_type = VALUES(value_type), value_bool = VALUES(value_bool), value_int = NULL, value_text = NULL, updated_at = UTC_TIMESTAMP();

INSERT INTO plan_features
  (plan_id, feature_key, value_type, value_bool, value_int, value_text, created_at, updated_at)
SELECT id, 'qr_enabled', 'bool', 1, NULL, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM plans
WHERE code IN ('starter', 'basic', 'pro')
ON DUPLICATE KEY UPDATE value_type = VALUES(value_type), value_bool = VALUES(value_bool), value_int = NULL, value_text = NULL, updated_at = UTC_TIMESTAMP();

INSERT INTO plan_features
  (plan_id, feature_key, value_type, value_bool, value_int, value_text, created_at, updated_at)
SELECT id, 'edit_enabled', 'bool', 1, NULL, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM plans
WHERE code IN ('starter', 'basic', 'pro')
ON DUPLICATE KEY UPDATE value_type = VALUES(value_type), value_bool = VALUES(value_bool), value_int = NULL, value_text = NULL, updated_at = UTC_TIMESTAMP();

INSERT INTO plan_features
  (plan_id, feature_key, value_type, value_bool, value_int, value_text, created_at, updated_at)
SELECT id, 'design_limit', 'int', NULL, CASE code WHEN 'starter' THEN 1 WHEN 'basic' THEN 3 ELSE 10 END, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM plans
WHERE code IN ('starter', 'basic', 'pro')
ON DUPLICATE KEY UPDATE value_type = VALUES(value_type), value_bool = NULL, value_int = VALUES(value_int), value_text = NULL, updated_at = UTC_TIMESTAMP();

INSERT INTO plan_features
  (plan_id, feature_key, value_type, value_bool, value_int, value_text, created_at, updated_at)
SELECT id, 'logo_enabled', 'bool', code = 'pro', NULL, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM plans
WHERE code IN ('starter', 'basic', 'pro')
ON DUPLICATE KEY UPDATE value_type = VALUES(value_type), value_bool = VALUES(value_bool), value_int = NULL, value_text = NULL, updated_at = UTC_TIMESTAMP();

INSERT INTO plan_features
  (plan_id, feature_key, value_type, value_bool, value_int, value_text, created_at, updated_at)
SELECT id, 'whatsapp_cta_enabled', 'bool', code = 'pro', NULL, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM plans
WHERE code IN ('starter', 'basic', 'pro')
ON DUPLICATE KEY UPDATE value_type = VALUES(value_type), value_bool = VALUES(value_bool), value_int = NULL, value_text = NULL, updated_at = UTC_TIMESTAMP();

INSERT INTO plan_features
  (plan_id, feature_key, value_type, value_bool, value_int, value_text, created_at, updated_at)
SELECT id, 'social_link_limit', 'int', NULL, CASE code WHEN 'starter' THEN 0 WHEN 'basic' THEN 2 ELSE 5 END, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM plans
WHERE code IN ('starter', 'basic', 'pro')
ON DUPLICATE KEY UPDATE value_type = VALUES(value_type), value_bool = NULL, value_int = VALUES(value_int), value_text = NULL, updated_at = UTC_TIMESTAMP();

INSERT INTO plan_features
  (plan_id, feature_key, value_type, value_bool, value_int, value_text, created_at, updated_at)
SELECT id, 'catalog_item_limit', 'int', NULL, CASE code WHEN 'starter' THEN 0 WHEN 'basic' THEN 2 ELSE 10 END, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM plans
WHERE code IN ('starter', 'basic', 'pro')
ON DUPLICATE KEY UPDATE value_type = VALUES(value_type), value_bool = NULL, value_int = VALUES(value_int), value_text = NULL, updated_at = UTC_TIMESTAMP();

INSERT INTO plan_features
  (plan_id, feature_key, value_type, value_bool, value_int, value_text, created_at, updated_at)
SELECT id, 'maps_enabled', 'bool', code IN ('basic', 'pro'), NULL, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM plans
WHERE code IN ('starter', 'basic', 'pro')
ON DUPLICATE KEY UPDATE value_type = VALUES(value_type), value_bool = VALUES(value_bool), value_int = NULL, value_text = NULL, updated_at = UTC_TIMESTAMP();

INSERT INTO plan_features
  (plan_id, feature_key, value_type, value_bool, value_int, value_text, created_at, updated_at)
SELECT id, 'upgrade_enabled', 'bool', code <> 'pro', NULL, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM plans
WHERE code IN ('starter', 'basic', 'pro')
ON DUPLICATE KEY UPDATE value_type = VALUES(value_type), value_bool = VALUES(value_bool), value_int = NULL, value_text = NULL, updated_at = UTC_TIMESTAMP();
