-- +migrate Up

-- Requires an approved backup and a cutover window with ALL old writers stopped.
-- Exclusion snapshot ONLY: never infer registration identity or pick a duplicate
-- winner. All existing cards, contacts, ownership and credentials stay unchanged.
CREATE TABLE IF NOT EXISTS card_email_legacy_holds (
  email VARBINARY(254) NOT NULL PRIMARY KEY,
  created_at DATETIME NOT NULL
) ENGINE=InnoDB;

-- Exact ECMAScript trim edge whitespace (including tabs/NBSP/FEFF), then lowercase.
-- Hex encodes the PUBLIC PCRE pattern, not data, and avoids sql_mode-dependent
-- backslash escaping. Pattern: ^[ECMAScript-whitespace]+|[ECMAScript-whitespace]+$
-- Include all statuses/soft-deleted cards; retain dots and plus tags. One UNION
-- snapshot collapses duplicate emails into a hold, NOT a selected card.
INSERT INTO card_email_legacy_holds(email,created_at)
SELECT normalized.email,UTC_TIMESTAMP() FROM (
  SELECT DISTINCT BINARY LOWER(REGEXP_REPLACE(CONVERT(legacy.email USING utf8mb4) COLLATE utf8mb4_bin,
    CONVERT(0x283f2d6d55295e5b5c787b303030397d2d5c787b303030447d5c787b303032307d5c787b303041307d5c787b313638307d5c787b323030307d2d5c787b323030417d5c787b323032387d5c787b323032397d5c787b323032467d5c787b323035467d5c787b333030307d5c787b464546467d5d2b7c5b5c787b303030397d2d5c787b303030447d5c787b303032307d5c787b303041307d5c787b313638307d5c787b323030307d2d5c787b323030417d5c787b323032387d5c787b323032397d5c787b323032467d5c787b323035467d5c787b333030307d5c787b464546467d5d2b24 USING utf8mb4) COLLATE utf8mb4_bin,_utf8mb4'' COLLATE utf8mb4_bin)) email
  FROM (
    SELECT cc.email FROM cards c JOIN card_contacts cc ON cc.card_id=c.id
    WHERE c.registration_email IS NULL
    UNION ALL
    SELECT u.email FROM cards c JOIN users u ON u.id=c.user_id
    WHERE c.registration_email IS NULL
  ) legacy
) normalized
WHERE OCTET_LENGTH(normalized.email) BETWEEN 1 AND 254
ON DUPLICATE KEY UPDATE email=VALUES(email);

-- +migrate Down

-- Never reopen reserved emails or remove exclusion evidence on rollback.
-- Reapply only with writers stopped: it adds observations from THEN-current data.
SELECT 1;
