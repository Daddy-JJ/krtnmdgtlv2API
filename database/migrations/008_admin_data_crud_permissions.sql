-- +migrate Up

INSERT INTO permissions(code,description,created_at) VALUES
('data.read','Read allowlisted administrative database resources',UTC_TIMESTAMP()),
('data.manage','Create, update, and delete allowlisted administrative database resources',UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE description=VALUES(description);

INSERT INTO role_permissions(role_id,permission_id,created_at)
SELECT r.id,p.id,UTC_TIMESTAMP()
FROM roles r
JOIN permissions p ON p.code IN ('data.read','data.manage')
WHERE r.code='super_admin'
ON DUPLICATE KEY UPDATE created_at=VALUES(created_at);

-- +migrate Down

DELETE rp FROM role_permissions rp
JOIN permissions p ON p.id=rp.permission_id
WHERE p.code IN ('data.read','data.manage');

DELETE FROM permissions WHERE code IN ('data.read','data.manage');
