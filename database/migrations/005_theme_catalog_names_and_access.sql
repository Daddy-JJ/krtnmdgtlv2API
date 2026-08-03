-- +migrate Up

UPDATE themes
SET name = CASE code
  WHEN 'starter-clean' THEN 'Aksara'
  WHEN 'basic-blue-line' THEN 'Bayu'
  WHEN 'basic-soft-geometry' THEN 'Baskara'
  WHEN 'pro-navy-gold-split' THEN 'Nilam'
  WHEN 'pro-white-navy-panel' THEN 'Prasasti'
  WHEN 'pro-editorial-gold' THEN 'Padma'
  WHEN 'pro-luxury-frame' THEN 'Kanaka'
  WHEN 'pro-vertical-black-gold' THEN 'Naya'
  WHEN 'pro-vertical-light-panel' THEN 'Kirana'
  WHEN 'pro-vertical-modern-dark' THEN 'Mahardika'
  ELSE name
END,
updated_at = UTC_TIMESTAMP()
WHERE code IN (
  'starter-clean',
  'basic-blue-line',
  'basic-soft-geometry',
  'pro-navy-gold-split',
  'pro-white-navy-panel',
  'pro-editorial-gold',
  'pro-luxury-frame',
  'pro-vertical-black-gold',
  'pro-vertical-light-panel',
  'pro-vertical-modern-dark'
);

DELETE pta
FROM plan_theme_access pta
JOIN plans p ON p.id = pta.plan_id
JOIN themes t ON t.id = pta.theme_id
WHERE p.code IN ('starter', 'basic', 'pro')
  AND t.code IN (
    'starter-clean',
    'basic-blue-line',
    'basic-soft-geometry',
    'pro-navy-gold-split',
    'pro-white-navy-panel',
    'pro-editorial-gold',
    'pro-luxury-frame',
    'pro-vertical-black-gold',
    'pro-vertical-light-panel',
    'pro-vertical-modern-dark'
  );

INSERT INTO plan_theme_access (plan_id, theme_id, created_at)
SELECT p.id, t.id, UTC_TIMESTAMP()
FROM plans p
JOIN themes t ON (
  (p.code = 'starter' AND t.code = 'starter-clean')
  OR
  (p.code = 'basic' AND t.code IN ('starter-clean', 'basic-blue-line', 'basic-soft-geometry'))
  OR
  (p.code = 'pro' AND t.code IN (
    'starter-clean',
    'basic-blue-line',
    'basic-soft-geometry',
    'pro-navy-gold-split',
    'pro-white-navy-panel',
    'pro-editorial-gold',
    'pro-luxury-frame',
    'pro-vertical-black-gold',
    'pro-vertical-light-panel',
    'pro-vertical-modern-dark'
  ))
);

-- +migrate Down

UPDATE themes
SET name = CASE code
  WHEN 'starter-clean' THEN 'Starter Clean'
  WHEN 'basic-blue-line' THEN 'Basic Blue Line'
  WHEN 'basic-soft-geometry' THEN 'Basic Soft Geometry'
  WHEN 'pro-navy-gold-split' THEN 'Pro Navy Gold Split'
  WHEN 'pro-white-navy-panel' THEN 'Pro White Navy Panel'
  WHEN 'pro-editorial-gold' THEN 'Pro Editorial Gold'
  WHEN 'pro-luxury-frame' THEN 'Pro Luxury Frame'
  WHEN 'pro-vertical-black-gold' THEN 'Pro Vertical Black Gold'
  WHEN 'pro-vertical-light-panel' THEN 'Pro Vertical Light Panel'
  WHEN 'pro-vertical-modern-dark' THEN 'Pro Vertical Modern Dark'
  ELSE name
END,
updated_at = UTC_TIMESTAMP()
WHERE code IN (
  'starter-clean',
  'basic-blue-line',
  'basic-soft-geometry',
  'pro-navy-gold-split',
  'pro-white-navy-panel',
  'pro-editorial-gold',
  'pro-luxury-frame',
  'pro-vertical-black-gold',
  'pro-vertical-light-panel',
  'pro-vertical-modern-dark'
);
