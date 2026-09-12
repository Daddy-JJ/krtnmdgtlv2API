-- WhatsApp click-to-chat is available on every membership tier.
-- +migrate Up
UPDATE plan_features pf
JOIN plans p ON p.id = pf.plan_id
SET pf.value_type = 'bool',
    pf.value_bool = 1,
    pf.value_int = NULL,
    pf.value_text = NULL,
    pf.updated_at = UTC_TIMESTAMP()
WHERE pf.feature_key = 'whatsapp_cta_enabled'
  AND p.code IN ('starter', 'basic', 'pro');

-- +migrate Down
UPDATE plan_features pf
JOIN plans p ON p.id = pf.plan_id
SET pf.value_type = 'bool',
    pf.value_bool = (p.code = 'pro'),
    pf.value_int = NULL,
    pf.value_text = NULL,
    pf.updated_at = UTC_TIMESTAMP()
WHERE pf.feature_key = 'whatsapp_cta_enabled'
  AND p.code IN ('starter', 'basic', 'pro');
