-- +migrate Up

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'user',
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  email_verified_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  price_amount BIGINT UNSIGNED NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'IDR',
  duration_days INT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plan_features (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plan_id BIGINT UNSIGNED NOT NULL,
  feature_key VARCHAR(100) NOT NULL,
  value_type VARCHAR(20) NOT NULL,
  value_bool TINYINT(1) NULL,
  value_int INT NULL,
  value_text VARCHAR(500) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_plan_feature (plan_id, feature_key),
  CONSTRAINT fk_plan_features_plan FOREIGN KEY (plan_id) REFERENCES plans(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS themes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  orientation VARCHAR(20) NOT NULL DEFAULT 'landscape',
  preview_path VARCHAR(255) NOT NULL,
  template_path VARCHAR(255) NOT NULL,
  minimum_plan_code VARCHAR(30) NOT NULL,
  display_order INT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plan_theme_access (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plan_id BIGINT UNSIGNED NOT NULL,
  theme_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_plan_theme (plan_id, theme_id),
  CONSTRAINT fk_plan_theme_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_plan_theme_theme FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NOT NULL,
  plan_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(30) NOT NULL,
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_subscription_user_status (user_id, status),
  CONSTRAINT fk_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES plans(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cards (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NULL,
  slug VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL UNIQUE,
  slug_kind VARCHAR(20) NOT NULL DEFAULT 'random',
  plan_code VARCHAR(30) NOT NULL DEFAULT 'starter',
  theme_id BIGINT UNSIGNED NOT NULL,
  locale VARCHAR(10) NOT NULL DEFAULT 'id',
  logo_path VARCHAR(255) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  published_at DATETIME NULL,
  deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_cards_user (user_id),
  KEY idx_cards_status (status),
  CONSTRAINT fk_cards_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_cards_theme FOREIGN KEY (theme_id) REFERENCES themes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS card_contacts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  card_id BIGINT UNSIGNED NOT NULL UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  job_title VARCHAR(120) NOT NULL,
  organization VARCHAR(150) NOT NULL,
  office_phone VARCHAR(32) NOT NULL,
  mobile_phone VARCHAR(32) NOT NULL,
  email VARCHAR(190) NOT NULL,
  website_url VARCHAR(500) NOT NULL,
  address_text TEXT NOT NULL,
  maps_url VARCHAR(500) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_card_contacts_card FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS starter_manage_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  card_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL,
  last_used_at DATETIME NULL,
  revoked_at DATETIME NULL,
  CONSTRAINT fk_starter_tokens_card FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  family_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  KEY idx_refresh_user (user_id),
  KEY idx_refresh_family (family_id),
  CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_reset_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_otps (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NULL,
  destination_email VARCHAR(190) NOT NULL,
  purpose VARCHAR(50) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts INT UNSIGNED NOT NULL DEFAULT 5,
  expires_at DATETIME NOT NULL,
  last_sent_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  KEY idx_email_otp_lookup (destination_email, purpose, consumed_at, expires_at),
  CONSTRAINT fk_email_otps_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS card_social_links (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  card_id BIGINT UNSIGNED NOT NULL,
  platform VARCHAR(50) NOT NULL,
  url VARCHAR(500) NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_social_card_order (card_id, sort_order),
  CONSTRAINT fk_social_card FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS catalog_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  card_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  image_path VARCHAR(255) NULL,
  target_url VARCHAR(500) NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_catalog_card_order (card_id, sort_order),
  CONSTRAINT fk_catalog_card FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  subscription_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  gateway VARCHAR(30) NOT NULL DEFAULT 'midtrans',
  merchant_order_id VARCHAR(100) NOT NULL UNIQUE,
  gateway_transaction_id VARCHAR(150) NULL,
  target_plan_code VARCHAR(30) NOT NULL,
  plan_name_snapshot VARCHAR(100) NOT NULL,
  duration_days_snapshot INT UNSIGNED NOT NULL,
  gateway_status VARCHAR(50) NULL,
  fraud_status VARCHAR(50) NULL,
  snap_redirect_url VARCHAR(500) NULL,
  amount BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'IDR',
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  paid_at DATETIME NULL,
  expires_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_payment_user_status (user_id, status),
  CONSTRAINT fk_payments_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions(id),
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_id BIGINT UNSIGNED NULL,
  gateway_event_key VARCHAR(190) NOT NULL UNIQUE,
  payload_hash CHAR(64) NOT NULL,
  event_type VARCHAR(100) NULL,
  received_at DATETIME NOT NULL,
  processed_at DATETIME NULL,
  processing_status VARCHAR(30) NOT NULL,
  error_message VARCHAR(500) NULL,
  CONSTRAINT fk_payment_events_payment FOREIGN KEY (payment_id) REFERENCES payments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mail_outbox (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NULL,
  template_key VARCHAR(100) NOT NULL,
  recipient_email VARCHAR(190) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  payload_text TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 100,
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts INT UNSIGNED NOT NULL DEFAULT 3,
  available_at DATETIME NOT NULL,
  locked_at DATETIME NULL,
  sent_at DATETIME NULL,
  failed_at DATETIME NULL,
  last_error_code VARCHAR(100) NULL,
  last_error_message VARCHAR(500) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_mail_outbox_worker (status, available_at, priority),
  CONSTRAINT fk_mail_outbox_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mail_delivery_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  outbox_id BIGINT UNSIGNED NULL,
  message_id VARCHAR(255) NULL,
  transport VARCHAR(50) NOT NULL,
  recipient_masked VARCHAR(190) NOT NULL,
  status VARCHAR(30) NOT NULL,
  response_code VARCHAR(100) NULL,
  response_message VARCHAR(500) NULL,
  created_at DATETIME NOT NULL,
  KEY idx_mail_log_outbox (outbox_id),
  CONSTRAINT fk_mail_logs_outbox FOREIGN KEY (outbox_id) REFERENCES mail_outbox(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  card_id BIGINT UNSIGNED NULL,
  event VARCHAR(100) NOT NULL,
  actor_ip_hash CHAR(64) NULL,
  request_id VARCHAR(100) NULL,
  metadata_text TEXT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_activity_created (created_at),
  KEY idx_activity_user (user_id),
  KEY idx_activity_card (card_id),
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_activity_card FOREIGN KEY (card_id) REFERENCES cards(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- +migrate Down

DROP TABLE IF EXISTS activity_logs;
DROP TABLE IF EXISTS mail_delivery_logs;
DROP TABLE IF EXISTS mail_outbox;
DROP TABLE IF EXISTS payment_events;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS catalog_items;
DROP TABLE IF EXISTS card_social_links;
DROP TABLE IF EXISTS email_otps;
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS starter_manage_tokens;
DROP TABLE IF EXISTS card_contacts;
DROP TABLE IF EXISTS cards;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS plan_theme_access;
DROP TABLE IF EXISTS themes;
DROP TABLE IF EXISTS plan_features;
DROP TABLE IF EXISTS plans;
DROP TABLE IF EXISTS users;
