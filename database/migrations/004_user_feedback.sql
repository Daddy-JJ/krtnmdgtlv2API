-- +migrate Up

CREATE TABLE IF NOT EXISTS user_feedback (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NOT NULL,
  message VARCHAR(300) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'new',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_user_feedback_user_created (user_id, created_at),
  KEY idx_user_feedback_status_created (status, created_at),
  CONSTRAINT fk_user_feedback_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- +migrate Down

DROP TABLE IF EXISTS user_feedback;
