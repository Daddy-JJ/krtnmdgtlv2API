-- +migrate Up

INSERT INTO user_roles(user_id,role_id,granted_at)
SELECT u.id,r.id,UTC_TIMESTAMP() FROM users u JOIN roles r ON r.code=CASE
  WHEN u.role IN ('admin','super_admin') THEN 'super_admin'
  WHEN u.role IN ('cv_specialist','resume_quality_reviewer','resume_service_admin') THEN u.role
  ELSE 'member' END
WHERE NOT EXISTS (SELECT 1 FROM user_roles active_role WHERE active_role.user_id=u.id AND active_role.revoked_at IS NULL)
ON DUPLICATE KEY UPDATE revoked_at=NULL,granted_at=VALUES(granted_at);

UPDATE users u SET u.role=(SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND ur.revoked_at IS NULL ORDER BY FIELD(r.code,'super_admin','resume_service_admin','resume_quality_reviewer','cv_specialist','member') LIMIT 1),u.updated_at=UTC_TIMESTAMP()
WHERE EXISTS (SELECT 1 FROM user_roles active_role WHERE active_role.user_id=u.id AND active_role.revoked_at IS NULL);

-- +migrate Down
SELECT 1;
