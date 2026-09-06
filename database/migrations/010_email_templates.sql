-- +migrate Up
CREATE TABLE email_templates (
  template_key VARCHAR(80) COLLATE utf8mb4_bin PRIMARY KEY,
  draft_text LONGTEXT NULL,
  draft_revision CHAR(36) NOT NULL,
  published_version INT UNSIGNED NULL,
  updated_by CHAR(36) NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO email_templates(template_key,draft_revision,updated_at) VALUES
('starter.management',UUID(),UTC_TIMESTAMP()),('auth.registration-otp',UUID(),UTC_TIMESTAMP()),
('auth.password-reset',UUID(),UTC_TIMESTAMP()),('resume.completed',UUID(),UTC_TIMESTAMP()),
('resume.retention-30-days',UUID(),UTC_TIMESTAMP()),('resume.retention-7-days',UUID(),UTC_TIMESTAMP()),
('resume.retention-1-days',UUID(),UTC_TIMESTAMP());
CREATE TABLE email_template_versions (
  template_key VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  version INT UNSIGNED NOT NULL,
  content_text LONGTEXT NOT NULL,
  actor_public_id CHAR(36) NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY(template_key,version),
  FOREIGN KEY(template_key) REFERENCES email_templates(template_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE email_template_actions (
  actor_public_id CHAR(36) NOT NULL,
  action_key CHAR(36) NOT NULL,
  template_key VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  action VARCHAR(20) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  result_text LONGTEXT NOT NULL,
  reason VARCHAR(1000) NULL,
  request_id VARCHAR(100) NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY(actor_public_id,action_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE email_template_tests (
  public_id CHAR(36) PRIMARY KEY,
  template_key VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  actor_public_id CHAR(36) NOT NULL,
  content_text LONGTEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  error_code VARCHAR(80) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_email_template_tests_worker(status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE mail_outbox ADD COLUMN template_version INT UNSIGNED NULL;
CREATE TRIGGER pin_mail_template_version BEFORE INSERT ON mail_outbox
FOR EACH ROW SET NEW.template_version = COALESCE((SELECT published_version FROM email_templates WHERE template_key=NEW.template_key),0);
-- +migrate Down
DROP TRIGGER IF EXISTS pin_mail_template_version;
ALTER TABLE mail_outbox DROP COLUMN template_version;
DROP TABLE email_template_tests;
DROP TABLE email_template_actions;
DROP TABLE email_template_versions;
DROP TABLE email_templates;
