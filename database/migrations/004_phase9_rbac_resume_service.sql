-- +migrate Up

CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  is_internal TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(120) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id BIGINT UNSIGNED NOT NULL,
  permission_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  granted_by_user_id BIGINT UNSIGNED NULL,
  granted_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  PRIMARY KEY (user_id, role_id),
  KEY idx_user_roles_active (role_id, revoked_at),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_user_roles_granted_by FOREIGN KEY (granted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO roles(code,name,is_internal,created_at,updated_at) VALUES
('member','Member',0,UTC_TIMESTAMP(),UTC_TIMESTAMP()),
('cv_specialist','CV Specialist',1,UTC_TIMESTAMP(),UTC_TIMESTAMP()),
('resume_quality_reviewer','Resume Quality Reviewer',1,UTC_TIMESTAMP(),UTC_TIMESTAMP()),
('resume_service_admin','Resume Service Admin',1,UTC_TIMESTAMP(),UTC_TIMESTAMP()),
('super_admin','Super Admin',1,UTC_TIMESTAMP(),UTC_TIMESTAMP());

INSERT INTO permissions(code,description,created_at) VALUES
('users.read','View users',UTC_TIMESTAMP()),
('users.manage','Manage users',UTC_TIMESTAMP()),
('subscriptions.read','View subscriptions',UTC_TIMESTAMP()),
('subscriptions.intervene','Perform controlled subscription interventions',UTC_TIMESTAMP()),
('usage.read','View feature usage',UTC_TIMESTAMP()),
('usage.adjust','Adjust usage with audit',UTC_TIMESTAMP()),
('settings.read','View non-secret settings',UTC_TIMESTAMP()),
('settings.manage','Manage editable settings',UTC_TIMESTAMP()),
('statistics.read','View sanitized statistics',UTC_TIMESTAMP()),
('payments.read','View payments',UTC_TIMESTAMP()),
('payments.intervene','Correct payment state through controlled intervention',UTC_TIMESTAMP()),
('resume.submit','Submit a Resume Enhancement request',UTC_TIMESTAMP()),
('resume.pool','Access Resume Enhancement pooled queue',UTC_TIMESTAMP()),
('resume.assigned.read','Read assigned Resume Enhancement requests',UTC_TIMESTAMP()),
('resume.work','Process assigned Resume Enhancement work',UTC_TIMESTAMP()),
('resume.quality_review','Review Resume Enhancement quality',UTC_TIMESTAMP()),
('resume.release','Release Resume Enhancement deliverables',UTC_TIMESTAMP()),
('resume.admin','Administer Resume Enhancement operations',UTC_TIMESTAMP()),
('specialists.manage','Manage CV Specialists',UTC_TIMESTAMP()),
('audit.read','Read immutable audit history',UTC_TIMESTAMP()),
('security.read','View sanitized security operations',UTC_TIMESTAMP()),
('security.intervene','Perform high-risk security interventions',UTC_TIMESTAMP());

INSERT INTO role_permissions(role_id,permission_id,created_at)
SELECT r.id,p.id,UTC_TIMESTAMP() FROM roles r JOIN permissions p
WHERE (r.code='member' AND p.code='resume.submit')
   OR (r.code='cv_specialist' AND p.code IN ('resume.assigned.read','resume.work'))
   OR (r.code='resume_quality_reviewer' AND p.code IN ('resume.assigned.read','resume.quality_review','resume.release'))
   OR (r.code='resume_service_admin' AND p.code IN ('resume.pool','resume.assigned.read','resume.work','resume.quality_review','resume.release','resume.admin','specialists.manage','audit.read'))
   OR r.code='super_admin';

INSERT INTO user_roles(user_id,role_id,granted_at)
SELECT u.id,r.id,UTC_TIMESTAMP() FROM users u JOIN roles r
  ON r.code=CASE WHEN u.role='admin' THEN 'super_admin' ELSE 'member' END;

UPDATE users SET role=CASE WHEN role='admin' THEN 'super_admin' ELSE 'member' END
WHERE role IN ('user','admin');

CREATE TABLE IF NOT EXISTS admin_interventions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  target_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_public_id VARCHAR(100) NULL,
  previous_value_text TEXT NULL,
  new_value_text TEXT NULL,
  reason VARCHAR(1000) NOT NULL,
  correlation_id VARCHAR(100) NULL,
  created_at DATETIME NOT NULL,
  KEY idx_admin_intervention_target (target_user_id, created_at),
  CONSTRAINT fk_admin_intervention_actor FOREIGN KEY (actor_user_id) REFERENCES users(id),
  CONSTRAINT fk_admin_intervention_target FOREIGN KEY (target_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS website_settings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(120) NOT NULL UNIQUE,
  setting_group VARCHAR(50) NOT NULL,
  value_text TEXT NULL,
  classification VARCHAR(20) NOT NULL,
  is_editable TINYINT(1) NOT NULL DEFAULT 1,
  updated_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_website_setting_actor FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS setting_change_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  setting_id BIGINT UNSIGNED NOT NULL,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  previous_value_text TEXT NULL,
  new_value_text TEXT NULL,
  reason VARCHAR(1000) NOT NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_setting_log_setting FOREIGN KEY (setting_id) REFERENCES website_settings(id),
  CONSTRAINT fk_setting_log_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usage_adjustments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NOT NULL,
  feature_key VARCHAR(100) NOT NULL,
  delta_value INT NOT NULL,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_usage_adjustment_user (user_id, feature_key, created_at),
  CONSTRAINT fk_usage_adjustment_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_usage_adjustment_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_tier_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  from_tier VARCHAR(30) NULL,
  to_tier VARCHAR(30) NOT NULL,
  source VARCHAR(30) NOT NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  reason VARCHAR(1000) NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  KEY idx_tier_history_user (user_id, created_at),
  CONSTRAINT fk_tier_history_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_tier_history_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscription_periods (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  subscription_id BIGINT UNSIGNED NOT NULL,
  source_payment_id BIGINT UNSIGNED NULL,
  period_start DATETIME NOT NULL,
  period_end DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_subscription_period (subscription_id, period_start, period_end),
  CONSTRAINT fk_subscription_period_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions(id),
  CONSTRAINT fk_subscription_period_payment FOREIGN KEY (source_payment_id) REFERENCES payments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS resume_service_entitlements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NOT NULL,
  subscription_period_id BIGINT UNSIGNED NOT NULL UNIQUE,
  beneficiary_name VARCHAR(200) NULL,
  beneficiary_name_normalized VARCHAR(200) NULL,
  consumed_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_resume_entitlement_user (user_id, created_at),
  CONSTRAINT fk_resume_entitlement_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_resume_entitlement_period FOREIGN KEY (subscription_period_id) REFERENCES subscription_periods(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS resume_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  entitlement_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  beneficiary_name_snapshot VARCHAR(200) NOT NULL,
  account_email_snapshot VARCHAR(190) NOT NULL,
  whatsapp_number VARCHAR(32) NOT NULL,
  current_job_title VARCHAR(150) NOT NULL,
  current_organization VARCHAR(200) NULL,
  experience_years DECIMAL(4,1) NULL,
  career_level VARCHAR(30) NOT NULL,
  target_role VARCHAR(150) NOT NULL,
  target_industry VARCHAR(150) NOT NULL,
  target_company VARCHAR(200) NULL,
  target_country VARCHAR(100) NOT NULL,
  resume_language VARCHAR(20) NOT NULL,
  resume_style VARCHAR(40) NOT NULL,
  linkedin_url VARCHAR(500) NULL,
  pasted_resume_text MEDIUMTEXT NULL,
  pasted_job_description MEDIUMTEXT NULL,
  additional_achievements TEXT NULL,
  certifications TEXT NULL,
  user_notes TEXT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  assigned_specialist_id BIGINT UNSIGNED NULL,
  revision_count INT UNSIGNED NOT NULL DEFAULT 0,
  max_revisions INT UNSIGNED NOT NULL DEFAULT 3,
  submitted_at DATETIME NULL,
  data_complete_at DATETIME NULL,
  sla_due_at DATETIME NULL,
  sla_paused_at DATETIME NULL,
  sla_remaining_seconds BIGINT UNSIGNED NULL,
  completed_at DATETIME NULL,
  retention_expires_at DATETIME NULL,
  expired_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_resume_entitlement_request (entitlement_id),
  KEY idx_resume_queue (status, sla_due_at, submitted_at),
  KEY idx_resume_assigned (assigned_specialist_id, status),
  CONSTRAINT fk_resume_request_entitlement FOREIGN KEY (entitlement_id) REFERENCES resume_service_entitlements(id),
  CONSTRAINT fk_resume_request_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_resume_request_specialist FOREIGN KEY (assigned_specialist_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS resume_request_files (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  resume_request_id BIGINT UNSIGNED NOT NULL,
  uploaded_by_user_id BIGINT UNSIGNED NOT NULL,
  file_role VARCHAR(40) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(100) NOT NULL,
  storage_disk VARCHAR(30) NOT NULL DEFAULT 'private',
  storage_path VARCHAR(500) NOT NULL,
  extension VARCHAR(15) NOT NULL,
  detected_mime VARCHAR(150) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  scan_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  created_at DATETIME NOT NULL,
  deleted_at DATETIME NULL,
  KEY idx_resume_files_request (resume_request_id, file_role, deleted_at),
  CONSTRAINT fk_resume_file_request FOREIGN KEY (resume_request_id) REFERENCES resume_requests(id),
  CONSTRAINT fk_resume_file_uploader FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS resume_request_assignments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT UNSIGNED NOT NULL,
  specialist_user_id BIGINT UNSIGNED NOT NULL,
  assigned_by_user_id BIGINT UNSIGNED NOT NULL,
  assigned_at DATETIME NOT NULL,
  unassigned_at DATETIME NULL,
  reason VARCHAR(1000) NULL,
  KEY idx_resume_assignment_active (specialist_user_id, unassigned_at),
  CONSTRAINT fk_resume_assignment_request FOREIGN KEY (request_id) REFERENCES resume_requests(id),
  CONSTRAINT fk_resume_assignment_specialist FOREIGN KEY (specialist_user_id) REFERENCES users(id),
  CONSTRAINT fk_resume_assignment_actor FOREIGN KEY (assigned_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS resume_request_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  request_id BIGINT UNSIGNED NOT NULL,
  sender_user_id BIGINT UNSIGNED NOT NULL,
  visibility VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  read_at DATETIME NULL,
  KEY idx_resume_messages_request (request_id, created_at),
  CONSTRAINT fk_resume_message_request FOREIGN KEY (request_id) REFERENCES resume_requests(id),
  CONSTRAINT fk_resume_message_sender FOREIGN KEY (sender_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS resume_request_status_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(40) NULL,
  to_status VARCHAR(40) NOT NULL,
  changed_by_user_id BIGINT UNSIGNED NOT NULL,
  reason VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL,
  KEY idx_resume_status_request (request_id, created_at),
  CONSTRAINT fk_resume_status_request FOREIGN KEY (request_id) REFERENCES resume_requests(id),
  CONSTRAINT fk_resume_status_actor FOREIGN KEY (changed_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS resume_request_sla_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(30) NOT NULL,
  event_at DATETIME NOT NULL,
  prior_due_at DATETIME NULL,
  new_due_at DATETIME NULL,
  reason VARCHAR(1000) NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  KEY idx_resume_sla_request (request_id, event_at),
  CONSTRAINT fk_resume_sla_request FOREIGN KEY (request_id) REFERENCES resume_requests(id),
  CONSTRAINT fk_resume_sla_actor FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS resume_revision_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  request_id BIGINT UNSIGNED NOT NULL,
  revision_number INT UNSIGNED NOT NULL,
  user_notes TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'REQUESTED',
  requested_at DATETIME NOT NULL,
  accepted_at DATETIME NULL,
  completed_at DATETIME NULL,
  UNIQUE KEY uq_resume_revision (request_id, revision_number),
  CONSTRAINT fk_resume_revision_request FOREIGN KEY (request_id) REFERENCES resume_requests(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS resume_deliverables (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  request_id BIGINT UNSIGNED NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  file_id BIGINT UNSIGNED NOT NULL,
  uploaded_by_user_id BIGINT UNSIGNED NOT NULL,
  revision_number INT UNSIGNED NOT NULL DEFAULT 0,
  state VARCHAR(30) NOT NULL DEFAULT 'INTERNAL_DRAFT',
  is_current TINYINT(1) NOT NULL DEFAULT 0,
  release_notes TEXT NULL,
  internal_notes TEXT NULL,
  released_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_resume_deliverable_version (request_id, version_number),
  KEY idx_resume_deliverable_current (request_id, is_current, revoked_at),
  CONSTRAINT fk_resume_deliverable_request FOREIGN KEY (request_id) REFERENCES resume_requests(id),
  CONSTRAINT fk_resume_deliverable_file FOREIGN KEY (file_id) REFERENCES resume_request_files(id),
  CONSTRAINT fk_resume_deliverable_uploader FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS resume_quality_reviews (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT UNSIGNED NOT NULL,
  deliverable_id BIGINT UNSIGNED NOT NULL,
  reviewer_user_id BIGINT UNSIGNED NOT NULL,
  beneficiary_correct TINYINT(1) NOT NULL,
  factual_integrity_checked TINYINT(1) NOT NULL,
  spelling_formatting_checked TINYINT(1) NOT NULL,
  file_opens TINYINT(1) NOT NULL,
  no_macros TINYINT(1) NOT NULL,
  no_tracked_changes_comments TINYINT(1) NOT NULL,
  no_placeholders TINYINT(1) NOT NULL,
  ready_for_release TINYINT(1) NOT NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_resume_quality_request FOREIGN KEY (request_id) REFERENCES resume_requests(id),
  CONSTRAINT fk_resume_quality_deliverable FOREIGN KEY (deliverable_id) REFERENCES resume_deliverables(id),
  CONSTRAINT fk_resume_quality_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS resume_download_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT UNSIGNED NOT NULL,
  deliverable_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  downloaded_at DATETIME NOT NULL,
  ip_hash CHAR(64) NULL,
  user_agent_summary VARCHAR(255) NULL,
  KEY idx_resume_download_request (request_id, downloaded_at),
  CONSTRAINT fk_resume_download_request FOREIGN KEY (request_id) REFERENCES resume_requests(id),
  CONSTRAINT fk_resume_download_deliverable FOREIGN KEY (deliverable_id) REFERENCES resume_deliverables(id),
  CONSTRAINT fk_resume_download_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS resume_retention_notices (
  request_id BIGINT UNSIGNED NOT NULL,
  threshold_days INT UNSIGNED NOT NULL,
  queued_at DATETIME NOT NULL,
  PRIMARY KEY (request_id, threshold_days),
  CONSTRAINT fk_resume_notice_request FOREIGN KEY (request_id) REFERENCES resume_requests(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- +migrate Down

DROP TABLE IF EXISTS resume_retention_notices;
DROP TABLE IF EXISTS resume_download_logs;
DROP TABLE IF EXISTS resume_quality_reviews;
DROP TABLE IF EXISTS resume_deliverables;
DROP TABLE IF EXISTS resume_revision_requests;
DROP TABLE IF EXISTS resume_request_sla_events;
DROP TABLE IF EXISTS resume_request_status_logs;
DROP TABLE IF EXISTS resume_request_messages;
DROP TABLE IF EXISTS resume_request_assignments;
DROP TABLE IF EXISTS resume_request_files;
DROP TABLE IF EXISTS resume_requests;
DROP TABLE IF EXISTS resume_service_entitlements;
DROP TABLE IF EXISTS subscription_periods;
DROP TABLE IF EXISTS user_tier_history;
DROP TABLE IF EXISTS usage_adjustments;
DROP TABLE IF EXISTS setting_change_logs;
DROP TABLE IF EXISTS website_settings;
DROP TABLE IF EXISTS admin_interventions;
UPDATE users SET role=CASE WHEN role='super_admin' THEN 'admin' ELSE 'user' END
WHERE role IN ('member','super_admin');
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;
