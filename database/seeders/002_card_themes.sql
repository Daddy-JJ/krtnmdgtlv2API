-- Seed ten approved card themes and cumulative plan access.
INSERT INTO themes
(code, name, orientation, preview_path, template_path, minimum_plan_code,
 display_order, is_active, created_at, updated_at)
VALUES
('starter-clean', 'Aksara', 'landscape', '/assets/images/themes/starter-clean.png', '/components/card-themes/starter-clean.html', 'starter', 1, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP()),
('basic-blue-line', 'Bayu', 'landscape', '/assets/images/themes/basic-blue-line.png', '/components/card-themes/basic-blue-line.html', 'basic', 2, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP()),
('basic-soft-geometry', 'Baskara', 'landscape', '/assets/images/themes/basic-soft-geometry.png', '/components/card-themes/basic-soft-geometry.html', 'basic', 3, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP()),
('pro-navy-gold-split', 'Nilam', 'landscape', '/assets/images/themes/pro-navy-gold-split.png', '/components/card-themes/pro-navy-gold-split.html', 'pro', 4, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP()),
('pro-white-navy-panel', 'Prasasti', 'landscape', '/assets/images/themes/pro-white-navy-panel.png', '/components/card-themes/pro-white-navy-panel.html', 'pro', 5, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP()),
('pro-editorial-gold', 'Padma', 'landscape', '/assets/images/themes/pro-editorial-gold.png', '/components/card-themes/pro-editorial-gold.html', 'pro', 6, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP()),
('pro-luxury-frame', 'Kanaka', 'landscape', '/assets/images/themes/pro-luxury-frame.png', '/components/card-themes/pro-luxury-frame.html', 'pro', 7, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP()),
('pro-vertical-black-gold', 'Naya', 'portrait', '/assets/images/themes/pro-vertical-black-gold.png', '/components/card-themes/pro-vertical-black-gold.html', 'pro', 8, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP()),
('pro-vertical-light-panel', 'Kirana', 'portrait', '/assets/images/themes/pro-vertical-light-panel.png', '/components/card-themes/pro-vertical-light-panel.html', 'pro', 9, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP()),
('pro-vertical-modern-dark', 'Mahardika', 'portrait', '/assets/images/themes/pro-vertical-modern-dark.png', '/components/card-themes/pro-vertical-modern-dark.html', 'pro', 10, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  orientation = VALUES(orientation),
  preview_path = VALUES(preview_path),
  template_path = VALUES(template_path),
  minimum_plan_code = VALUES(minimum_plan_code),
  display_order = VALUES(display_order),
  is_active = VALUES(is_active),
  updated_at = UTC_TIMESTAMP();

DELETE pta
FROM plan_theme_access pta
JOIN plans p ON p.id = pta.plan_id
JOIN themes t ON t.id = pta.theme_id
WHERE p.code IN ('starter', 'basic', 'pro')
  AND t.code IN (
    'starter-clean', 'basic-blue-line', 'basic-soft-geometry',
    'pro-navy-gold-split', 'pro-white-navy-panel', 'pro-editorial-gold',
    'pro-luxury-frame', 'pro-vertical-black-gold',
    'pro-vertical-light-panel', 'pro-vertical-modern-dark'
  );

INSERT IGNORE INTO plan_theme_access (plan_id, theme_id, created_at)
SELECT p.id, t.id, UTC_TIMESTAMP()
FROM plans p
JOIN themes t ON (
  (p.code = 'starter' AND t.code = 'starter-clean')
  OR (p.code = 'basic' AND t.code IN ('starter-clean', 'basic-blue-line', 'basic-soft-geometry'))
  OR (p.code = 'pro')
);
