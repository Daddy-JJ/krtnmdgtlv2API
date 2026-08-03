-- +migrate Up

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bucket_hash CHAR(64) NOT NULL UNIQUE,
  action VARCHAR(50) NOT NULL,
  hits INT UNSIGNED NOT NULL DEFAULT 1,
  window_started_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_auth_rate_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- +migrate Down

DROP TABLE IF EXISTS auth_rate_limits;
