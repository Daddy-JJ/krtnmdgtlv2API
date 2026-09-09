-- GENERATED FILE. Run: npm run schema:generate

-- Application tables: 47. Internal schema_migrations is intentionally omitted.

SET NAMES utf8mb4;

SET FOREIGN_KEY_CHECKS=0;



CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `card_id` bigint(20) unsigned DEFAULT NULL,
  `event` varchar(100) NOT NULL,
  `actor_ip_hash` char(64) DEFAULT NULL,
  `request_id` varchar(100) DEFAULT NULL,
  `metadata_text` text DEFAULT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_activity_created` (`created_at`),
  KEY `idx_activity_user` (`user_id`),
  KEY `idx_activity_card` (`card_id`),
  CONSTRAINT `fk_activity_card` FOREIGN KEY (`card_id`) REFERENCES `cards` (`id`),
  CONSTRAINT `fk_activity_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admin_interventions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL,
  `actor_user_id` bigint(20) unsigned NOT NULL,
  `target_user_id` bigint(20) unsigned DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `entity_type` varchar(100) NOT NULL,
  `entity_public_id` varchar(100) DEFAULT NULL,
  `previous_value_text` text DEFAULT NULL,
  `new_value_text` text DEFAULT NULL,
  `reason` varchar(1000) NOT NULL,
  `correlation_id` varchar(100) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  KEY `idx_admin_intervention_target` (`target_user_id`,`created_at`),
  KEY `fk_admin_intervention_actor` (`actor_user_id`),
  CONSTRAINT `fk_admin_intervention_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_admin_intervention_target` FOREIGN KEY (`target_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `auth_rate_limits` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `bucket_hash` char(64) NOT NULL,
  `action` varchar(50) NOT NULL,
  `hits` int(10) unsigned NOT NULL DEFAULT 1,
  `window_started_at` datetime NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bucket_hash` (`bucket_hash`),
  KEY `idx_auth_rate_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cards` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `slug` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `slug_kind` varchar(20) NOT NULL DEFAULT 'random',
  `plan_code` varchar(30) NOT NULL DEFAULT 'starter',
  `theme_id` bigint(20) unsigned NOT NULL,
  `locale` varchar(10) NOT NULL DEFAULT 'id',
  `logo_path` varchar(255) DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'draft',
  `published_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `active_user_id` bigint(20) unsigned GENERATED ALWAYS AS (case when `deleted_at` is null and `status` <> 'deleted' then `user_id` else NULL end) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  UNIQUE KEY `slug` (`slug`),
  UNIQUE KEY `uq_cards_active_user` (`active_user_id`),
  KEY `idx_cards_status` (`status`),
  KEY `fk_cards_theme` (`theme_id`),
  KEY `idx_cards_user` (`user_id`),
  CONSTRAINT `fk_cards_theme` FOREIGN KEY (`theme_id`) REFERENCES `themes` (`id`),
  CONSTRAINT `fk_cards_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `card_contacts` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `card_id` bigint(20) unsigned NOT NULL,
  `full_name` varchar(150) NOT NULL,
  `job_title` varchar(120) NOT NULL,
  `organization` varchar(150) NOT NULL,
  `office_phone` varchar(32) NOT NULL,
  `mobile_phone` varchar(32) NOT NULL,
  `email` varchar(190) NOT NULL,
  `website_url` varchar(500) NOT NULL,
  `address_text` text NOT NULL,
  `maps_url` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `card_id` (`card_id`),
  CONSTRAINT `fk_card_contacts_card` FOREIGN KEY (`card_id`) REFERENCES `cards` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `card_social_links` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `card_id` bigint(20) unsigned NOT NULL,
  `platform` varchar(50) NOT NULL,
  `url` varchar(500) NOT NULL,
  `sort_order` int(10) unsigned NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_social_card_order` (`card_id`,`sort_order`),
  CONSTRAINT `fk_social_card` FOREIGN KEY (`card_id`) REFERENCES `cards` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `catalog_items` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL,
  `card_id` bigint(20) unsigned NOT NULL,
  `title` varchar(150) NOT NULL,
  `description` text DEFAULT NULL,
  `image_path` varchar(255) DEFAULT NULL,
  `target_url` varchar(500) DEFAULT NULL,
  `sort_order` int(10) unsigned NOT NULL DEFAULT 0,
  `is_published` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  KEY `idx_catalog_card_order` (`card_id`,`sort_order`),
  CONSTRAINT `fk_catalog_card` FOREIGN KEY (`card_id`) REFERENCES `cards` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `email_otps` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `destination_email` varchar(190) NOT NULL,
  `purpose` varchar(50) NOT NULL,
  `code_hash` char(64) NOT NULL,
  `attempts` int(10) unsigned NOT NULL DEFAULT 0,
  `max_attempts` int(10) unsigned NOT NULL DEFAULT 5,
  `expires_at` datetime NOT NULL,
  `last_sent_at` datetime NOT NULL,
  `consumed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  KEY `idx_email_otp_lookup` (`destination_email`,`purpose`,`consumed_at`,`expires_at`),
  KEY `fk_email_otps_user` (`user_id`),
  CONSTRAINT `fk_email_otps_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `email_templates` (
  `template_key` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `draft_text` longtext DEFAULT NULL,
  `draft_revision` char(36) NOT NULL,
  `published_version` int(10) unsigned DEFAULT NULL,
  `updated_by` char(36) DEFAULT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`template_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `email_template_actions` (
  `actor_public_id` char(36) NOT NULL,
  `action_key` char(36) NOT NULL,
  `template_key` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `action` varchar(20) NOT NULL,
  `payload_hash` char(64) NOT NULL,
  `result_text` longtext NOT NULL,
  `reason` varchar(1000) DEFAULT NULL,
  `request_id` varchar(100) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`actor_public_id`,`action_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `email_template_tests` (
  `public_id` char(36) NOT NULL,
  `template_key` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `actor_public_id` char(36) NOT NULL,
  `content_text` longtext NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'queued',
  `error_code` varchar(80) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`public_id`),
  KEY `idx_email_template_tests_worker` (`status`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `email_template_versions` (
  `template_key` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `version` int(10) unsigned NOT NULL,
  `content_text` longtext NOT NULL,
  `actor_public_id` char(36) NOT NULL,
  `reason` varchar(1000) NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`template_key`,`version`),
  CONSTRAINT `email_template_versions_ibfk_1` FOREIGN KEY (`template_key`) REFERENCES `email_templates` (`template_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mail_delivery_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `outbox_id` bigint(20) unsigned DEFAULT NULL,
  `message_id` varchar(255) DEFAULT NULL,
  `transport` varchar(50) NOT NULL,
  `recipient_masked` varchar(190) NOT NULL,
  `status` varchar(30) NOT NULL,
  `response_code` varchar(100) DEFAULT NULL,
  `response_message` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_mail_log_outbox` (`outbox_id`),
  CONSTRAINT `fk_mail_logs_outbox` FOREIGN KEY (`outbox_id`) REFERENCES `mail_outbox` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mail_outbox` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `template_key` varchar(100) NOT NULL,
  `recipient_email` varchar(190) NOT NULL,
  `subject` varchar(255) NOT NULL,
  `payload_text` text NOT NULL,
  `priority` int(11) NOT NULL DEFAULT 100,
  `status` varchar(30) NOT NULL DEFAULT 'queued',
  `attempts` int(10) unsigned NOT NULL DEFAULT 0,
  `max_attempts` int(10) unsigned NOT NULL DEFAULT 3,
  `available_at` datetime NOT NULL,
  `locked_at` datetime DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  `failed_at` datetime DEFAULT NULL,
  `last_error_code` varchar(100) DEFAULT NULL,
  `last_error_message` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `template_version` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  KEY `idx_mail_outbox_worker` (`status`,`available_at`,`priority`),
  KEY `fk_mail_outbox_user` (`user_id`),
  CONSTRAINT `fk_mail_outbox_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `fk_reset_tokens_user` (`user_id`),
  CONSTRAINT `fk_reset_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payments` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL,
  `subscription_id` bigint(20) unsigned DEFAULT NULL,
  `user_id` bigint(20) unsigned NOT NULL,
  `gateway` varchar(30) NOT NULL DEFAULT 'midtrans',
  `merchant_order_id` varchar(100) NOT NULL,
  `gateway_transaction_id` varchar(150) DEFAULT NULL,
  `target_plan_code` varchar(30) NOT NULL,
  `plan_name_snapshot` varchar(100) NOT NULL,
  `duration_days_snapshot` int(10) unsigned NOT NULL,
  `gateway_status` varchar(50) DEFAULT NULL,
  `fraud_status` varchar(50) DEFAULT NULL,
  `snap_redirect_url` varchar(500) DEFAULT NULL,
  `amount` bigint(20) unsigned NOT NULL,
  `currency` char(3) NOT NULL DEFAULT 'IDR',
  `status` varchar(30) NOT NULL DEFAULT 'pending',
  `paid_at` datetime DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  UNIQUE KEY `merchant_order_id` (`merchant_order_id`),
  KEY `idx_payment_user_status` (`user_id`,`status`),
  KEY `fk_payments_subscription` (`subscription_id`),
  CONSTRAINT `fk_payments_subscription` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions` (`id`),
  CONSTRAINT `fk_payments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payment_events` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `payment_id` bigint(20) unsigned DEFAULT NULL,
  `gateway_event_key` varchar(190) NOT NULL,
  `payload_hash` char(64) NOT NULL,
  `event_type` varchar(100) DEFAULT NULL,
  `received_at` datetime NOT NULL,
  `processed_at` datetime DEFAULT NULL,
  `processing_status` varchar(30) NOT NULL,
  `error_message` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `gateway_event_key` (`gateway_event_key`),
  KEY `fk_payment_events_payment` (`payment_id`),
  CONSTRAINT `fk_payment_events_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `permissions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(120) NOT NULL,
  `description` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `plans` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(30) NOT NULL,
  `name` varchar(100) NOT NULL,
  `price_amount` bigint(20) unsigned NOT NULL DEFAULT 0,
  `currency` char(3) NOT NULL DEFAULT 'IDR',
  `duration_days` int(10) unsigned NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `plan_features` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `plan_id` bigint(20) unsigned NOT NULL,
  `feature_key` varchar(100) NOT NULL,
  `value_type` varchar(20) NOT NULL,
  `value_bool` tinyint(1) DEFAULT NULL,
  `value_int` int(11) DEFAULT NULL,
  `value_text` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_plan_feature` (`plan_id`,`feature_key`),
  CONSTRAINT `fk_plan_features_plan` FOREIGN KEY (`plan_id`) REFERENCES `plans` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `plan_theme_access` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `plan_id` bigint(20) unsigned NOT NULL,
  `theme_id` bigint(20) unsigned NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_plan_theme` (`plan_id`,`theme_id`),
  KEY `fk_plan_theme_theme` (`theme_id`),
  CONSTRAINT `fk_plan_theme_plan` FOREIGN KEY (`plan_id`) REFERENCES `plans` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_plan_theme_theme` FOREIGN KEY (`theme_id`) REFERENCES `themes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `token_hash` char(64) NOT NULL,
  `family_id` char(36) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `idx_refresh_user` (`user_id`),
  KEY `idx_refresh_family` (`family_id`),
  CONSTRAINT `fk_refresh_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `resume_deliverables` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL,
  `request_id` bigint(20) unsigned NOT NULL,
  `version_number` int(10) unsigned NOT NULL,
  `file_id` bigint(20) unsigned NOT NULL,
  `uploaded_by_user_id` bigint(20) unsigned NOT NULL,
  `revision_number` int(10) unsigned NOT NULL DEFAULT 0,
  `state` varchar(30) NOT NULL DEFAULT 'INTERNAL_DRAFT',
  `is_current` tinyint(1) NOT NULL DEFAULT 0,
  `release_notes` text DEFAULT NULL,
  `internal_notes` text DEFAULT NULL,
  `released_at` datetime DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  UNIQUE KEY `uq_resume_deliverable_version` (`request_id`,`version_number`),
  KEY `idx_resume_deliverable_current` (`request_id`,`is_current`,`revoked_at`),
  KEY `fk_resume_deliverable_file` (`file_id`),
  KEY `fk_resume_deliverable_uploader` (`uploaded_by_user_id`),
  CONSTRAINT `fk_resume_deliverable_file` FOREIGN KEY (`file_id`) REFERENCES `resume_request_files` (`id`),
  CONSTRAINT `fk_resume_deliverable_request` FOREIGN KEY (`request_id`) REFERENCES `resume_requests` (`id`),
  CONSTRAINT `fk_resume_deliverable_uploader` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `resume_download_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `request_id` bigint(20) unsigned NOT NULL,
  `deliverable_id` bigint(20) unsigned NOT NULL,
  `user_id` bigint(20) unsigned NOT NULL,
  `downloaded_at` datetime NOT NULL,
  `ip_hash` char(64) DEFAULT NULL,
  `user_agent_summary` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_resume_download_request` (`request_id`,`downloaded_at`),
  KEY `fk_resume_download_deliverable` (`deliverable_id`),
  KEY `fk_resume_download_user` (`user_id`),
  CONSTRAINT `fk_resume_download_deliverable` FOREIGN KEY (`deliverable_id`) REFERENCES `resume_deliverables` (`id`),
  CONSTRAINT `fk_resume_download_request` FOREIGN KEY (`request_id`) REFERENCES `resume_requests` (`id`),
  CONSTRAINT `fk_resume_download_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `resume_quality_reviews` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `request_id` bigint(20) unsigned NOT NULL,
  `deliverable_id` bigint(20) unsigned NOT NULL,
  `reviewer_user_id` bigint(20) unsigned NOT NULL,
  `beneficiary_correct` tinyint(1) NOT NULL,
  `factual_integrity_checked` tinyint(1) NOT NULL,
  `spelling_formatting_checked` tinyint(1) NOT NULL,
  `file_opens` tinyint(1) NOT NULL,
  `no_macros` tinyint(1) NOT NULL,
  `no_tracked_changes_comments` tinyint(1) NOT NULL,
  `no_placeholders` tinyint(1) NOT NULL,
  `ready_for_release` tinyint(1) NOT NULL,
  `notes` text DEFAULT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_resume_quality_request` (`request_id`),
  KEY `fk_resume_quality_deliverable` (`deliverable_id`),
  KEY `fk_resume_quality_reviewer` (`reviewer_user_id`),
  CONSTRAINT `fk_resume_quality_deliverable` FOREIGN KEY (`deliverable_id`) REFERENCES `resume_deliverables` (`id`),
  CONSTRAINT `fk_resume_quality_request` FOREIGN KEY (`request_id`) REFERENCES `resume_requests` (`id`),
  CONSTRAINT `fk_resume_quality_reviewer` FOREIGN KEY (`reviewer_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `resume_requests` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL,
  `entitlement_id` bigint(20) unsigned NOT NULL,
  `user_id` bigint(20) unsigned NOT NULL,
  `beneficiary_name_snapshot` varchar(200) NOT NULL,
  `account_email_snapshot` varchar(190) NOT NULL,
  `whatsapp_number` varchar(32) NOT NULL,
  `current_job_title` varchar(150) NOT NULL,
  `current_organization` varchar(200) DEFAULT NULL,
  `experience_years` decimal(4,1) DEFAULT NULL,
  `career_level` varchar(30) NOT NULL,
  `target_role` varchar(150) NOT NULL,
  `target_industry` varchar(150) NOT NULL,
  `target_company` varchar(200) DEFAULT NULL,
  `target_country` varchar(100) NOT NULL,
  `resume_language` varchar(20) NOT NULL,
  `resume_style` varchar(40) NOT NULL,
  `linkedin_url` varchar(500) DEFAULT NULL,
  `pasted_resume_text` mediumtext DEFAULT NULL,
  `pasted_job_description` mediumtext DEFAULT NULL,
  `additional_achievements` text DEFAULT NULL,
  `certifications` text DEFAULT NULL,
  `user_notes` text DEFAULT NULL,
  `status` varchar(40) NOT NULL DEFAULT 'DRAFT',
  `priority` varchar(20) NOT NULL DEFAULT 'NORMAL',
  `assigned_specialist_id` bigint(20) unsigned DEFAULT NULL,
  `revision_count` int(10) unsigned NOT NULL DEFAULT 0,
  `max_revisions` int(10) unsigned NOT NULL DEFAULT 3,
  `submitted_at` datetime DEFAULT NULL,
  `data_complete_at` datetime DEFAULT NULL,
  `sla_due_at` datetime DEFAULT NULL,
  `sla_paused_at` datetime DEFAULT NULL,
  `sla_remaining_seconds` bigint(20) unsigned DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `retention_expires_at` datetime DEFAULT NULL,
  `expired_at` datetime DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  UNIQUE KEY `uq_resume_entitlement_request` (`entitlement_id`),
  KEY `idx_resume_queue` (`status`,`sla_due_at`,`submitted_at`),
  KEY `idx_resume_assigned` (`assigned_specialist_id`,`status`),
  KEY `fk_resume_request_user` (`user_id`),
  CONSTRAINT `fk_resume_request_entitlement` FOREIGN KEY (`entitlement_id`) REFERENCES `resume_service_entitlements` (`id`),
  CONSTRAINT `fk_resume_request_specialist` FOREIGN KEY (`assigned_specialist_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_resume_request_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `resume_request_assignments` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `request_id` bigint(20) unsigned NOT NULL,
  `specialist_user_id` bigint(20) unsigned NOT NULL,
  `assigned_by_user_id` bigint(20) unsigned NOT NULL,
  `assigned_at` datetime NOT NULL,
  `unassigned_at` datetime DEFAULT NULL,
  `reason` varchar(1000) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_resume_assignment_active` (`specialist_user_id`,`unassigned_at`),
  KEY `fk_resume_assignment_request` (`request_id`),
  KEY `fk_resume_assignment_actor` (`assigned_by_user_id`),
  CONSTRAINT `fk_resume_assignment_actor` FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_resume_assignment_request` FOREIGN KEY (`request_id`) REFERENCES `resume_requests` (`id`),
  CONSTRAINT `fk_resume_assignment_specialist` FOREIGN KEY (`specialist_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `resume_request_files` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL,
  `resume_request_id` bigint(20) unsigned NOT NULL,
  `uploaded_by_user_id` bigint(20) unsigned NOT NULL,
  `file_role` varchar(40) NOT NULL,
  `original_filename` varchar(255) NOT NULL,
  `stored_filename` varchar(100) NOT NULL,
  `storage_disk` varchar(30) NOT NULL DEFAULT 'private',
  `storage_path` varchar(500) NOT NULL,
  `extension` varchar(15) NOT NULL,
  `detected_mime` varchar(150) NOT NULL,
  `size_bytes` bigint(20) unsigned NOT NULL,
  `sha256` char(64) NOT NULL,
  `scan_status` varchar(30) NOT NULL DEFAULT 'PENDING',
  `created_at` datetime NOT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  KEY `idx_resume_files_request` (`resume_request_id`,`file_role`,`deleted_at`),
  KEY `fk_resume_file_uploader` (`uploaded_by_user_id`),
  CONSTRAINT `fk_resume_file_request` FOREIGN KEY (`resume_request_id`) REFERENCES `resume_requests` (`id`),
  CONSTRAINT `fk_resume_file_uploader` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `resume_request_messages` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL,
  `request_id` bigint(20) unsigned NOT NULL,
  `sender_user_id` bigint(20) unsigned NOT NULL,
  `visibility` varchar(20) NOT NULL,
  `message` text NOT NULL,
  `created_at` datetime NOT NULL,
  `read_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  KEY `idx_resume_messages_request` (`request_id`,`created_at`),
  KEY `fk_resume_message_sender` (`sender_user_id`),
  CONSTRAINT `fk_resume_message_request` FOREIGN KEY (`request_id`) REFERENCES `resume_requests` (`id`),
  CONSTRAINT `fk_resume_message_sender` FOREIGN KEY (`sender_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `resume_request_sla_events` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `request_id` bigint(20) unsigned NOT NULL,
  `event_type` varchar(30) NOT NULL,
  `event_at` datetime NOT NULL,
  `prior_due_at` datetime DEFAULT NULL,
  `new_due_at` datetime DEFAULT NULL,
  `reason` varchar(1000) DEFAULT NULL,
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_resume_sla_request` (`request_id`,`event_at`),
  KEY `fk_resume_sla_actor` (`created_by_user_id`),
  CONSTRAINT `fk_resume_sla_actor` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_resume_sla_request` FOREIGN KEY (`request_id`) REFERENCES `resume_requests` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `resume_request_status_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `request_id` bigint(20) unsigned NOT NULL,
  `from_status` varchar(40) DEFAULT NULL,
  `to_status` varchar(40) NOT NULL,
  `changed_by_user_id` bigint(20) unsigned NOT NULL,
  `reason` varchar(1000) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_resume_status_request` (`request_id`,`created_at`),
  KEY `fk_resume_status_actor` (`changed_by_user_id`),
  CONSTRAINT `fk_resume_status_actor` FOREIGN KEY (`changed_by_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_resume_status_request` FOREIGN KEY (`request_id`) REFERENCES `resume_requests` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `resume_retention_notices` (
  `request_id` bigint(20) unsigned NOT NULL,
  `threshold_days` int(10) unsigned NOT NULL,
  `queued_at` datetime NOT NULL,
  PRIMARY KEY (`request_id`,`threshold_days`),
  CONSTRAINT `fk_resume_notice_request` FOREIGN KEY (`request_id`) REFERENCES `resume_requests` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `resume_revision_requests` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL,
  `request_id` bigint(20) unsigned NOT NULL,
  `revision_number` int(10) unsigned NOT NULL,
  `user_notes` text NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'REQUESTED',
  `requested_at` datetime NOT NULL,
  `accepted_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  UNIQUE KEY `uq_resume_revision` (`request_id`,`revision_number`),
  CONSTRAINT `fk_resume_revision_request` FOREIGN KEY (`request_id`) REFERENCES `resume_requests` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `resume_service_entitlements` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL,
  `user_id` bigint(20) unsigned NOT NULL,
  `subscription_period_id` bigint(20) unsigned NOT NULL,
  `beneficiary_name` varchar(200) DEFAULT NULL,
  `beneficiary_name_normalized` varchar(200) DEFAULT NULL,
  `consumed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  UNIQUE KEY `subscription_period_id` (`subscription_period_id`),
  KEY `idx_resume_entitlement_user` (`user_id`,`created_at`),
  CONSTRAINT `fk_resume_entitlement_period` FOREIGN KEY (`subscription_period_id`) REFERENCES `subscription_periods` (`id`),
  CONSTRAINT `fk_resume_entitlement_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `roles` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(60) NOT NULL,
  `name` varchar(100) NOT NULL,
  `is_internal` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id` bigint(20) unsigned NOT NULL,
  `permission_id` bigint(20) unsigned NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`role_id`,`permission_id`),
  KEY `fk_role_permissions_permission` (`permission_id`),
  CONSTRAINT `fk_role_permissions_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_role_permissions_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `setting_change_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `setting_id` bigint(20) unsigned NOT NULL,
  `actor_user_id` bigint(20) unsigned NOT NULL,
  `previous_value_text` text DEFAULT NULL,
  `new_value_text` text DEFAULT NULL,
  `reason` varchar(1000) NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_setting_log_setting` (`setting_id`),
  KEY `fk_setting_log_actor` (`actor_user_id`),
  CONSTRAINT `fk_setting_log_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_setting_log_setting` FOREIGN KEY (`setting_id`) REFERENCES `website_settings` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `starter_manage_tokens` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `card_id` bigint(20) unsigned NOT NULL,
  `token_hash` char(64) NOT NULL,
  `created_at` datetime NOT NULL,
  `last_used_at` datetime DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `fk_starter_tokens_card` (`card_id`),
  CONSTRAINT `fk_starter_tokens_card` FOREIGN KEY (`card_id`) REFERENCES `cards` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `subscriptions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL,
  `user_id` bigint(20) unsigned NOT NULL,
  `plan_id` bigint(20) unsigned NOT NULL,
  `status` varchar(30) NOT NULL,
  `starts_at` datetime DEFAULT NULL,
  `ends_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  KEY `idx_subscription_user_status` (`user_id`,`status`),
  KEY `fk_subscriptions_plan` (`plan_id`),
  CONSTRAINT `fk_subscriptions_plan` FOREIGN KEY (`plan_id`) REFERENCES `plans` (`id`),
  CONSTRAINT `fk_subscriptions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `subscription_periods` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL,
  `subscription_id` bigint(20) unsigned NOT NULL,
  `source_payment_id` bigint(20) unsigned DEFAULT NULL,
  `period_start` datetime NOT NULL,
  `period_end` datetime NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  UNIQUE KEY `uq_subscription_period` (`subscription_id`,`period_start`,`period_end`),
  KEY `fk_subscription_period_payment` (`source_payment_id`),
  CONSTRAINT `fk_subscription_period_payment` FOREIGN KEY (`source_payment_id`) REFERENCES `payments` (`id`),
  CONSTRAINT `fk_subscription_period_subscription` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `themes` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `orientation` varchar(20) NOT NULL DEFAULT 'landscape',
  `preview_path` varchar(255) NOT NULL,
  `template_path` varchar(255) NOT NULL,
  `minimum_plan_code` varchar(30) NOT NULL,
  `display_order` int(10) unsigned NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `usage_adjustments` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL,
  `user_id` bigint(20) unsigned NOT NULL,
  `feature_key` varchar(100) NOT NULL,
  `delta_value` int(11) NOT NULL,
  `actor_user_id` bigint(20) unsigned NOT NULL,
  `reason` varchar(1000) NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  KEY `idx_usage_adjustment_user` (`user_id`,`feature_key`,`created_at`),
  KEY `fk_usage_adjustment_actor` (`actor_user_id`),
  CONSTRAINT `fk_usage_adjustment_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_usage_adjustment_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL,
  `email` varchar(190) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` varchar(30) NOT NULL DEFAULT 'user',
  `status` varchar(30) NOT NULL DEFAULT 'active',
  `email_verified_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_feedback` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL,
  `user_id` bigint(20) unsigned NOT NULL,
  `message` varchar(300) NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'new',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_id` (`public_id`),
  KEY `idx_user_feedback_user_created` (`user_id`,`created_at`),
  KEY `idx_user_feedback_status_created` (`status`,`created_at`),
  CONSTRAINT `fk_user_feedback_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_roles` (
  `user_id` bigint(20) unsigned NOT NULL,
  `role_id` bigint(20) unsigned NOT NULL,
  `granted_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `granted_at` datetime NOT NULL,
  `revoked_at` datetime DEFAULT NULL,
  PRIMARY KEY (`user_id`,`role_id`),
  KEY `idx_user_roles_active` (`role_id`,`revoked_at`),
  KEY `fk_user_roles_granted_by` (`granted_by_user_id`),
  CONSTRAINT `fk_user_roles_granted_by` FOREIGN KEY (`granted_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_user_roles_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`),
  CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_tier_history` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `from_tier` varchar(30) DEFAULT NULL,
  `to_tier` varchar(30) NOT NULL,
  `source` varchar(30) NOT NULL,
  `actor_user_id` bigint(20) unsigned DEFAULT NULL,
  `reason` varchar(1000) DEFAULT NULL,
  `starts_at` datetime NOT NULL,
  `ends_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tier_history_user` (`user_id`,`created_at`),
  KEY `fk_tier_history_actor` (`actor_user_id`),
  CONSTRAINT `fk_tier_history_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tier_history_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `website_settings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `setting_key` varchar(120) NOT NULL,
  `setting_group` varchar(50) NOT NULL,
  `value_text` text DEFAULT NULL,
  `classification` varchar(20) NOT NULL,
  `is_editable` tinyint(1) NOT NULL DEFAULT 1,
  `updated_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `setting_key` (`setting_key`),
  KEY `fk_website_setting_actor` (`updated_by_user_id`),
  CONSTRAINT `fk_website_setting_actor` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



-- Triggers

CREATE TRIGGER pin_mail_template_version BEFORE INSERT ON mail_outbox
FOR EACH ROW SET NEW.template_version = COALESCE((SELECT published_version FROM email_templates WHERE template_key=NEW.template_key),0);



SET FOREIGN_KEY_CHECKS=1;
