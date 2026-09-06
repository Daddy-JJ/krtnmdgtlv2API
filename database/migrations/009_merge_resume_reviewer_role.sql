-- +migrate Up

-- Keep the target role ID stable. Every step is safe to retry after interruption.
INSERT INTO roles(code,name,is_internal,created_at,updated_at)
VALUES ('resume_service_admin','Resume Service Admin',1,UTC_TIMESTAMP(),UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE name=VALUES(name),is_internal=1;

-- Preserve customized reviewer permissions as well as the target's permissions.
INSERT INTO role_permissions(role_id,permission_id,created_at)
SELECT target.id,rp.permission_id,UTC_TIMESTAMP()
FROM role_permissions rp JOIN roles source ON source.id=rp.role_id
JOIN roles target ON target.code='resume_service_admin'
WHERE source.code='resume_quality_reviewer'
ON DUPLICATE KEY UPDATE permission_id=VALUES(permission_id);

-- Archive original assignments, including revoked history, before merging rows.
INSERT INTO activity_logs(user_id,event,metadata_text,created_at)
SELECT ur.user_id,'rbac.resume-reviewer-merged',
JSON_OBJECT('sourceRole','resume_quality_reviewer','targetRole','resume_service_admin',
  'sourceRoleId',ur.role_id,'grantedByUserId',ur.granted_by_user_id,
  'grantedAt',ur.granted_at,'revokedAt',ur.revoked_at),UTC_TIMESTAMP()
FROM user_roles ur JOIN roles r ON r.id=ur.role_id
WHERE r.code='resume_quality_reviewer'
AND NOT EXISTS (SELECT 1 FROM activity_logs a WHERE a.user_id=ur.user_id AND a.event='rbac.resume-reviewer-merged');

-- Only active source grants activate the target; revoked source grants do not.
INSERT INTO user_roles(user_id,role_id,granted_by_user_id,granted_at)
SELECT ur.user_id,target.id,ur.granted_by_user_id,ur.granted_at
FROM user_roles ur JOIN roles source ON source.id=ur.role_id
JOIN roles target ON target.code='resume_service_admin'
WHERE source.code='resume_quality_reviewer' AND ur.revoked_at IS NULL
ON DUPLICATE KEY UPDATE
  granted_by_user_id=IF(user_roles.revoked_at IS NOT NULL,VALUES(granted_by_user_id),user_roles.granted_by_user_id),
  granted_at=IF(user_roles.revoked_at IS NOT NULL,VALUES(granted_at),user_roles.granted_at),revoked_at=NULL;

DELETE ur FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE r.code='resume_quality_reviewer';
DELETE rp FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.code='resume_quality_reviewer';
DELETE FROM roles WHERE code='resume_quality_reviewer';

-- user_roles is authoritative; do not resurrect revoked rights from users.role.
UPDATE users u SET u.role=COALESCE((
  SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id
  WHERE ur.user_id=u.id AND ur.revoked_at IS NULL
  ORDER BY FIELD(r.code,'super_admin','resume_service_admin','cv_specialist','member') LIMIT 1
),'member'),u.updated_at=UTC_TIMESTAMP()
WHERE u.role='resume_quality_reviewer'
OR EXISTS (SELECT 1 FROM activity_logs a WHERE a.user_id=u.id AND a.event='rbac.resume-reviewer-merged');

-- +migrate Down
-- Forward-only authority merge. Splitting grants back automatically would
-- revoke intentionally merged access. Use an explicit corrective migration.
SELECT 1;
