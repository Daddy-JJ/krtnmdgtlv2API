-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: localhost
-- Generation Time: Jul 31, 2026 at 03:33 PM
-- Server version: 10.4.28-MariaDB
-- PHP Version: 8.2.4

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `krtnmdgtlv2`
--

-- --------------------------------------------------------

--
-- Table structure for table `activity_logs`
--

CREATE TABLE `activity_logs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED DEFAULT NULL,
  `card_id` bigint(20) UNSIGNED DEFAULT NULL,
  `event` varchar(100) NOT NULL,
  `actor_ip_hash` char(64) DEFAULT NULL,
  `request_id` varchar(100) DEFAULT NULL,
  `metadata_text` text DEFAULT NULL,
  `created_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `activity_logs`
--

INSERT INTO `activity_logs` (`id`, `user_id`, `card_id`, `event`, `actor_ip_hash`, `request_id`, `metadata_text`, `created_at`) VALUES
(1, 6, 3, 'card.published', '12ca17b49af2289436f303e0166030a21e525d266e209267433801a8fd4071a0', 'demo-request-card-publish', '{\"source\":\"development-seed\"}', '2026-07-31 13:31:51');

-- --------------------------------------------------------

--
-- Table structure for table `auth_rate_limits`
--

CREATE TABLE `auth_rate_limits` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `bucket_hash` char(64) NOT NULL,
  `action` varchar(50) NOT NULL,
  `hits` int(10) UNSIGNED NOT NULL DEFAULT 1,
  `window_started_at` datetime NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `auth_rate_limits`
--

INSERT INTO `auth_rate_limits` (`id`, `bucket_hash`, `action`, `hits`, `window_started_at`, `expires_at`, `created_at`, `updated_at`) VALUES
(1, 'db1cf64749171bf9c7b06cb00d09111ce4fc377f81586f3e7b1a5135942ed90f', 'login', 2, '2026-07-31 11:31:51', '2026-07-31 12:31:51', '2026-07-31 13:31:51', '2026-07-31 13:31:51');

-- --------------------------------------------------------

--
-- Table structure for table `cards`
--

CREATE TABLE `cards` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `public_id` char(36) NOT NULL,
  `user_id` bigint(20) UNSIGNED DEFAULT NULL,
  `slug` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `slug_kind` varchar(20) NOT NULL DEFAULT 'random',
  `plan_code` varchar(30) NOT NULL DEFAULT 'starter',
  `theme_id` bigint(20) UNSIGNED NOT NULL,
  `locale` varchar(10) NOT NULL DEFAULT 'id',
  `logo_path` varchar(255) DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'draft',
  `published_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `active_user_id` bigint(20) UNSIGNED GENERATED ALWAYS AS (case when `deleted_at` is null and `status` <> 'deleted' then `user_id` else NULL end) STORED
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `cards`
--

INSERT INTO `cards` (`id`, `public_id`, `user_id`, `slug`, `slug_kind`, `plan_code`, `theme_id`, `locale`, `logo_path`, `status`, `published_at`, `deleted_at`, `created_at`, `updated_at`) VALUES
(1, '30000000-0000-4000-8000-000000000001', NULL, 'QaStart', 'random', 'starter', 1, 'id', NULL, 'published', '2026-07-31 13:31:51', NULL, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(2, '30000000-0000-4000-8000-000000000002', 5, 'demo-basic', 'custom', 'basic', 3, 'id', NULL, 'published', '2026-07-31 13:31:51', NULL, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(3, '30000000-0000-4000-8000-000000000003', 6, 'demo-pro', 'custom', 'pro', 6, 'id', 'seed/demo-pro-logo.webp', 'published', '2026-07-31 13:31:51', NULL, '2026-07-31 13:31:51', '2026-07-31 13:31:51');

-- --------------------------------------------------------

--
-- Table structure for table `card_contacts`
--

CREATE TABLE `card_contacts` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `card_id` bigint(20) UNSIGNED NOT NULL,
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
  `updated_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `card_contacts`
--

INSERT INTO `card_contacts` (`id`, `card_id`, `full_name`, `job_title`, `organization`, `office_phone`, `mobile_phone`, `email`, `website_url`, `address_text`, `maps_url`, `created_at`, `updated_at`) VALUES
(1, 1, 'Sinta Starter', 'Freelance Consultant', 'KartuNamaDigital Demo', '+62215550101', '+628111111111', 'starter.card@kartunamadigital.test', 'https://example.test/starter', 'Jl. Demo 1, Jakarta', NULL, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(2, 2, 'Bayu Pratama', 'Business Development Lead', 'KartuNamaDigital Demo', '+62215550102', '+628122222222', 'demo-basic@kartunamadigital.test', 'https://example.test/basic', 'Jl. Demo 2, Bandung', 'https://maps.google.com/?q=Bandung', '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(3, 3, 'Begitu Indah, SE', 'Digital Marketer & Social Media Specialist', 'KartuNamaDigital.id', '+62215550103', '+628133333333', 'demo-pro@kartunamadigital.test', 'https://example.test/pro', 'Jl. Ninja no 99, Konohagakure', 'https://maps.google.com/?q=Jakarta', '2026-07-31 13:31:51', '2026-07-31 13:31:51');

-- --------------------------------------------------------

--
-- Table structure for table `card_social_links`
--

CREATE TABLE `card_social_links` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `card_id` bigint(20) UNSIGNED NOT NULL,
  `platform` varchar(50) NOT NULL,
  `url` varchar(500) NOT NULL,
  `sort_order` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `card_social_links`
--

INSERT INTO `card_social_links` (`id`, `card_id`, `platform`, `url`, `sort_order`, `created_at`, `updated_at`) VALUES
(1, 2, 'linkedin', 'https://www.linkedin.com/in/demo-basic', 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(2, 2, 'instagram', 'https://www.instagram.com/demo.basic', 2, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(3, 3, 'linkedin', 'https://www.linkedin.com/in/demo-pro', 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(4, 3, 'instagram', 'https://www.instagram.com/demo.pro', 2, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(5, 3, 'youtube', 'https://www.youtube.com/@demo-pro', 3, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(6, 3, 'tiktok', 'https://www.tiktok.com/@demo.pro', 4, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(7, 3, 'other', 'https://example.test/demo-pro', 5, '2026-07-31 13:31:51', '2026-07-31 13:31:51');

-- --------------------------------------------------------

--
-- Table structure for table `catalog_items`
--

CREATE TABLE `catalog_items` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `public_id` char(36) NOT NULL,
  `card_id` bigint(20) UNSIGNED NOT NULL,
  `title` varchar(150) NOT NULL,
  `description` text DEFAULT NULL,
  `image_path` varchar(255) DEFAULT NULL,
  `target_url` varchar(500) DEFAULT NULL,
  `sort_order` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `is_published` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `catalog_items`
--

INSERT INTO `catalog_items` (`id`, `public_id`, `card_id`, `title`, `description`, `image_path`, `target_url`, `sort_order`, `is_published`, `created_at`, `updated_at`) VALUES
(1, '60000000-0000-4000-8000-000000000001', 2, 'Konsultasi Basic', 'Contoh layanan Basic.', NULL, 'https://example.test/basic-service', 1, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(2, '60000000-0000-4000-8000-000000000002', 2, 'Workshop Basic', 'Contoh workshop Basic.', NULL, 'https://example.test/basic-workshop', 2, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(3, '60000000-0000-4000-8000-000000000101', 3, 'Pro Service 1', 'Contoh katalog Pro 1.', NULL, 'https://example.test/pro-service-1', 1, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(4, '60000000-0000-4000-8000-000000000102', 3, 'Pro Service 2', 'Contoh katalog Pro 2.', NULL, 'https://example.test/pro-service-2', 2, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(5, '60000000-0000-4000-8000-000000000103', 3, 'Pro Service 3', 'Contoh katalog Pro 3.', NULL, 'https://example.test/pro-service-3', 3, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(6, '60000000-0000-4000-8000-000000000104', 3, 'Pro Service 4', 'Contoh katalog Pro 4.', NULL, 'https://example.test/pro-service-4', 4, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(7, '60000000-0000-4000-8000-000000000105', 3, 'Pro Service 5', 'Contoh katalog Pro 5.', NULL, 'https://example.test/pro-service-5', 5, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(8, '60000000-0000-4000-8000-000000000106', 3, 'Pro Service 6', 'Contoh katalog Pro 6.', NULL, 'https://example.test/pro-service-6', 6, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(9, '60000000-0000-4000-8000-000000000107', 3, 'Pro Service 7', 'Contoh katalog Pro 7.', NULL, 'https://example.test/pro-service-7', 7, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(10, '60000000-0000-4000-8000-000000000108', 3, 'Pro Service 8', 'Contoh katalog Pro 8.', NULL, 'https://example.test/pro-service-8', 8, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(11, '60000000-0000-4000-8000-000000000109', 3, 'Pro Service 9', 'Contoh katalog Pro 9.', NULL, 'https://example.test/pro-service-9', 9, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(12, '60000000-0000-4000-8000-000000000100', 3, 'Pro Service 0', 'Contoh katalog Pro 0.', NULL, 'https://example.test/pro-service-0', 0, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51');

-- --------------------------------------------------------

--
-- Table structure for table `email_otps`
--

CREATE TABLE `email_otps` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `public_id` char(36) NOT NULL,
  `user_id` bigint(20) UNSIGNED DEFAULT NULL,
  `destination_email` varchar(190) NOT NULL,
  `purpose` varchar(50) NOT NULL,
  `code_hash` char(64) NOT NULL,
  `attempts` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `max_attempts` int(10) UNSIGNED NOT NULL DEFAULT 5,
  `expires_at` datetime NOT NULL,
  `last_sent_at` datetime NOT NULL,
  `consumed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `email_otps`
--

INSERT INTO `email_otps` (`id`, `public_id`, `user_id`, `destination_email`, `purpose`, `code_hash`, `attempts`, `max_attempts`, `expires_at`, `last_sent_at`, `consumed_at`, `created_at`) VALUES
(1, '50000000-0000-4000-8000-000000000001', 5, 'demo-basic@kartunamadigital.test', 'registration', 'dc33670d5a0fea1d333a474144696d8bc988846fcbf44e5641562904b3a5b1d9', 1, 5, '2026-07-30 13:31:51', '2026-07-29 13:31:51', '2026-07-30 13:31:51', '2026-07-31 13:31:51');

-- --------------------------------------------------------

--
-- Table structure for table `mail_delivery_logs`
--

CREATE TABLE `mail_delivery_logs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `outbox_id` bigint(20) UNSIGNED DEFAULT NULL,
  `message_id` varchar(255) DEFAULT NULL,
  `transport` varchar(50) NOT NULL,
  `recipient_masked` varchar(190) NOT NULL,
  `status` varchar(30) NOT NULL,
  `response_code` varchar(100) DEFAULT NULL,
  `response_message` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `mail_delivery_logs`
--

INSERT INTO `mail_delivery_logs` (`id`, `outbox_id`, `message_id`, `transport`, `recipient_masked`, `status`, `response_code`, `response_message`, `created_at`) VALUES
(1, 1, 'demo-mail-message-001', 'smtp', 'de***@kartunamadigital.test', 'sent', '250', 'Queued by development SMTP fixture.', '2026-07-31 13:31:52');

-- --------------------------------------------------------

--
-- Table structure for table `mail_outbox`
--

CREATE TABLE `mail_outbox` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `public_id` char(36) NOT NULL,
  `user_id` bigint(20) UNSIGNED DEFAULT NULL,
  `template_key` varchar(100) NOT NULL,
  `recipient_email` varchar(190) NOT NULL,
  `subject` varchar(255) NOT NULL,
  `payload_text` text NOT NULL,
  `priority` int(11) NOT NULL DEFAULT 100,
  `status` varchar(30) NOT NULL DEFAULT 'queued',
  `attempts` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `max_attempts` int(10) UNSIGNED NOT NULL DEFAULT 3,
  `available_at` datetime NOT NULL,
  `locked_at` datetime DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  `failed_at` datetime DEFAULT NULL,
  `last_error_code` varchar(100) DEFAULT NULL,
  `last_error_message` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `mail_outbox`
--

INSERT INTO `mail_outbox` (`id`, `public_id`, `user_id`, `template_key`, `recipient_email`, `subject`, `payload_text`, `priority`, `status`, `attempts`, `max_attempts`, `available_at`, `locked_at`, `sent_at`, `failed_at`, `last_error_code`, `last_error_message`, `created_at`, `updated_at`) VALUES
(1, '90000000-0000-4000-8000-000000000001', 6, 'membership.upgraded', 'demo-pro@kartunamadigital.test', 'Demo membership upgraded', '{\"plan\":\"pro\",\"source\":\"development-seed\"}', 100, 'sent', 1, 3, '2026-07-31 13:31:52', NULL, '2026-07-31 13:31:52', NULL, NULL, NULL, '2026-07-31 13:31:52', '2026-07-31 13:31:52');

-- --------------------------------------------------------

--
-- Table structure for table `password_reset_tokens`
--

CREATE TABLE `password_reset_tokens` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `password_reset_tokens`
--

INSERT INTO `password_reset_tokens` (`id`, `user_id`, `token_hash`, `expires_at`, `used_at`, `created_at`) VALUES
(1, 6, '8191c27181a6ac1491a0e2609834e44da71e9e8b7c0fc7c28e0938f38309d724', '2026-07-30 13:31:51', '2026-07-31 13:31:51', '2026-07-31 13:31:51');

-- --------------------------------------------------------

--
-- Table structure for table `payments`
--

CREATE TABLE `payments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `public_id` char(36) NOT NULL,
  `subscription_id` bigint(20) UNSIGNED DEFAULT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `gateway` varchar(30) NOT NULL DEFAULT 'midtrans',
  `merchant_order_id` varchar(100) NOT NULL,
  `gateway_transaction_id` varchar(150) DEFAULT NULL,
  `target_plan_code` varchar(30) NOT NULL,
  `plan_name_snapshot` varchar(100) NOT NULL,
  `duration_days_snapshot` int(10) UNSIGNED NOT NULL,
  `gateway_status` varchar(50) DEFAULT NULL,
  `fraud_status` varchar(50) DEFAULT NULL,
  `snap_redirect_url` varchar(500) DEFAULT NULL,
  `amount` bigint(20) UNSIGNED NOT NULL,
  `currency` char(3) NOT NULL DEFAULT 'IDR',
  `status` varchar(30) NOT NULL DEFAULT 'pending',
  `paid_at` datetime DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `payments`
--

INSERT INTO `payments` (`id`, `public_id`, `subscription_id`, `user_id`, `gateway`, `merchant_order_id`, `gateway_transaction_id`, `target_plan_code`, `plan_name_snapshot`, `duration_days_snapshot`, `gateway_status`, `fraud_status`, `snap_redirect_url`, `amount`, `currency`, `status`, `paid_at`, `expires_at`, `created_at`, `updated_at`) VALUES
(1, '70000000-0000-4000-8000-000000000001', 1, 5, 'midtrans', 'DEMO-BASIC-UPGRADE-001', 'demo-basic-transaction-001', 'basic', 'Basic', 365, 'settlement', 'accept', NULL, 55000, 'IDR', 'paid', '2026-07-01 13:31:51', NULL, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(2, '70000000-0000-4000-8000-000000000002', 2, 6, 'midtrans', 'DEMO-PRO-UPGRADE-001', 'demo-pro-transaction-001', 'pro', 'Pro', 365, 'settlement', 'accept', NULL, 97000, 'IDR', 'paid', '2026-06-16 13:31:51', NULL, '2026-07-31 13:31:51', '2026-07-31 13:31:51');

-- --------------------------------------------------------

--
-- Table structure for table `payment_events`
--

CREATE TABLE `payment_events` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `payment_id` bigint(20) UNSIGNED DEFAULT NULL,
  `gateway_event_key` varchar(190) NOT NULL,
  `payload_hash` char(64) NOT NULL,
  `event_type` varchar(100) DEFAULT NULL,
  `received_at` datetime NOT NULL,
  `processed_at` datetime DEFAULT NULL,
  `processing_status` varchar(30) NOT NULL,
  `error_message` varchar(500) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `payment_events`
--

INSERT INTO `payment_events` (`id`, `payment_id`, `gateway_event_key`, `payload_hash`, `event_type`, `received_at`, `processed_at`, `processing_status`, `error_message`) VALUES
(1, 2, 'demo-midtrans-event-001', 'f0b87963b1d25e4883579f03a5ab99a6a1091d7f298ab5b9d234798e6daa7659', 'settlement', '2026-07-31 13:31:51', '2026-07-31 13:31:51', 'processed', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `plans`
--

CREATE TABLE `plans` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `code` varchar(30) NOT NULL,
  `name` varchar(100) NOT NULL,
  `price_amount` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `currency` char(3) NOT NULL DEFAULT 'IDR',
  `duration_days` int(10) UNSIGNED NOT NULL DEFAULT 0 COMMENT '0 for Starter; 365 for annual Basic/Pro',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `plans`
--

INSERT INTO `plans` (`id`, `code`, `name`, `price_amount`, `currency`, `duration_days`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 'starter', 'Starter', 0, 'IDR', 0, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(2, 'basic', 'Basic', 55000, 'IDR', 365, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(3, 'pro', 'Pro', 97000, 'IDR', 365, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51');

-- --------------------------------------------------------

--
-- Table structure for table `plan_features`
--

CREATE TABLE `plan_features` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `plan_id` bigint(20) UNSIGNED NOT NULL,
  `feature_key` varchar(100) NOT NULL,
  `value_type` varchar(20) NOT NULL,
  `value_bool` tinyint(1) DEFAULT NULL,
  `value_int` int(11) DEFAULT NULL,
  `value_text` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `plan_features`
--

INSERT INTO `plan_features` (`id`, `plan_id`, `feature_key`, `value_type`, `value_bool`, `value_int`, `value_text`, `created_at`, `updated_at`) VALUES
(1, 2, 'catalog_item_limit', 'integer', NULL, 2, NULL, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(2, 2, 'social_link_limit', 'integer', NULL, 2, NULL, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(3, 2, 'design_limit', 'integer', NULL, 3, NULL, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(4, 2, 'login_enabled', 'boolean', 1, NULL, NULL, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(5, 3, 'resume_enhancement_enabled', 'boolean', 1, NULL, NULL, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(6, 3, 'catalog_item_limit', 'integer', NULL, 10, NULL, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(7, 3, 'social_link_limit', 'integer', NULL, 5, NULL, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(8, 3, 'design_limit', 'integer', NULL, 10, NULL, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(9, 3, 'login_enabled', 'boolean', 1, NULL, NULL, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(10, 1, 'design_limit', 'integer', NULL, 1, NULL, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(11, 1, 'login_enabled', 'boolean', 0, NULL, NULL, '2026-07-31 13:31:51', '2026-07-31 13:31:51');

-- --------------------------------------------------------

--
-- Table structure for table `plan_theme_access`
--

CREATE TABLE `plan_theme_access` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `plan_id` bigint(20) UNSIGNED NOT NULL,
  `theme_id` bigint(20) UNSIGNED NOT NULL,
  `created_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `plan_theme_access`
--

INSERT INTO `plan_theme_access` (`id`, `plan_id`, `theme_id`, `created_at`) VALUES
(1, 2, 2, '2026-07-31 13:31:51'),
(2, 3, 2, '2026-07-31 13:31:51'),
(3, 2, 3, '2026-07-31 13:31:51'),
(4, 3, 3, '2026-07-31 13:31:51'),
(5, 3, 6, '2026-07-31 13:31:51'),
(6, 3, 7, '2026-07-31 13:31:51'),
(7, 3, 4, '2026-07-31 13:31:51'),
(8, 3, 8, '2026-07-31 13:31:51'),
(9, 3, 9, '2026-07-31 13:31:51'),
(10, 3, 10, '2026-07-31 13:31:51'),
(11, 3, 5, '2026-07-31 13:31:51'),
(12, 2, 1, '2026-07-31 13:31:51'),
(13, 3, 1, '2026-07-31 13:31:51'),
(14, 1, 1, '2026-07-31 13:31:51');

-- --------------------------------------------------------

--
-- Table structure for table `refresh_tokens`
--

CREATE TABLE `refresh_tokens` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `token_hash` char(64) NOT NULL,
  `family_id` char(36) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `refresh_tokens`
--

INSERT INTO `refresh_tokens` (`id`, `user_id`, `token_hash`, `family_id`, `expires_at`, `used_at`, `revoked_at`, `created_at`) VALUES
(1, 5, '830a2581503120721c82ced113bda32e0b6c488d14d95e2f5923a19504ba34e5', '40000000-0000-4000-8000-000000000001', '2026-07-30 13:31:51', '2026-07-31 13:31:51', '2026-07-31 13:31:51', '2026-07-31 13:31:51');

-- --------------------------------------------------------

--
-- Table structure for table `starter_manage_tokens`
--

CREATE TABLE `starter_manage_tokens` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `card_id` bigint(20) UNSIGNED NOT NULL,
  `token_hash` char(64) NOT NULL,
  `created_at` datetime NOT NULL,
  `last_used_at` datetime DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `starter_manage_tokens`
--

INSERT INTO `starter_manage_tokens` (`id`, `card_id`, `token_hash`, `created_at`, `last_used_at`, `revoked_at`) VALUES
(1, 1, 'f54dc8817a40416762b3d4bd9193b88af9130b20ed06f3afea6f84da9b11b977', '2026-07-31 13:31:51', '2026-07-31 13:31:51', '2026-07-31 13:31:51');

-- --------------------------------------------------------

--
-- Table structure for table `subscriptions`
--

CREATE TABLE `subscriptions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `public_id` char(36) NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `plan_id` bigint(20) UNSIGNED NOT NULL,
  `status` varchar(30) NOT NULL,
  `starts_at` datetime DEFAULT NULL,
  `ends_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `subscriptions`
--

INSERT INTO `subscriptions` (`id`, `public_id`, `user_id`, `plan_id`, `status`, `starts_at`, `ends_at`, `created_at`, `updated_at`) VALUES
(1, '20000000-0000-4000-8000-000000000001', 5, 2, 'active', '2026-07-01 13:31:51', '2027-07-01 13:31:51', '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(2, '20000000-0000-4000-8000-000000000002', 6, 3, 'active', '2026-06-16 13:31:51', '2027-06-16 13:31:51', '2026-07-31 13:31:51', '2026-07-31 13:31:51');

-- --------------------------------------------------------

--
-- Table structure for table `themes`
--

CREATE TABLE `themes` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `code` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `orientation` varchar(20) NOT NULL DEFAULT 'landscape',
  `preview_path` varchar(255) NOT NULL,
  `template_path` varchar(255) NOT NULL,
  `minimum_plan_code` varchar(30) NOT NULL,
  `display_order` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `themes`
--

INSERT INTO `themes` (`id`, `code`, `name`, `orientation`, `preview_path`, `template_path`, `minimum_plan_code`, `display_order`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 'starter-clean', 'Aksara', 'landscape', '/assets/images/themes/starter-clean.png', '/components/card-themes/starter-clean.html', 'starter', 1, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(2, 'basic-blue-line', 'Bayu', 'landscape', '/assets/images/themes/basic-blue-line.png', '/components/card-themes/basic-blue-line.html', 'basic', 2, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(3, 'basic-soft-geometry', 'Baskara', 'landscape', '/assets/images/themes/basic-soft-geometry.png', '/components/card-themes/basic-soft-geometry.html', 'basic', 3, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(4, 'pro-navy-gold-split', 'Nilam', 'landscape', '/assets/images/themes/pro-navy-gold-split.png', '/components/card-themes/pro-navy-gold-split.html', 'pro', 4, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(5, 'pro-white-navy-panel', 'Prasasti', 'landscape', '/assets/images/themes/pro-white-navy-panel.png', '/components/card-themes/pro-white-navy-panel.html', 'pro', 5, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(6, 'pro-editorial-gold', 'Padma', 'landscape', '/assets/images/themes/pro-editorial-gold.png', '/components/card-themes/pro-editorial-gold.html', 'pro', 6, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(7, 'pro-luxury-frame', 'Kanaka', 'landscape', '/assets/images/themes/pro-luxury-frame.png', '/components/card-themes/pro-luxury-frame.html', 'pro', 7, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(8, 'pro-vertical-black-gold', 'Naya', 'portrait', '/assets/images/themes/pro-vertical-black-gold.png', '/components/card-themes/pro-vertical-black-gold.html', 'pro', 8, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(9, 'pro-vertical-light-panel', 'Kirana', 'portrait', '/assets/images/themes/pro-vertical-light-panel.png', '/components/card-themes/pro-vertical-light-panel.html', 'pro', 9, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(10, 'pro-vertical-modern-dark', 'Mahardika', 'portrait', '/assets/images/themes/pro-vertical-modern-dark.png', '/components/card-themes/pro-vertical-modern-dark.html', 'pro', 10, 1, '2026-07-31 13:31:51', '2026-07-31 13:31:51');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `public_id` char(36) NOT NULL,
  `email` varchar(190) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` varchar(30) NOT NULL DEFAULT 'user',
  `status` varchar(30) NOT NULL DEFAULT 'active',
  `email_verified_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `public_id`, `email`, `password_hash`, `role`, `status`, `email_verified_at`, `created_at`, `updated_at`) VALUES
(1, '10000000-0000-4000-8000-000000000001', 'demo-admin@kartunamadigital.test', '!development-disabled-9322dc726985794676e8b43e6213ca64811d96e410d3a6d3110b67577566c25a', 'super_admin', 'active', '2026-07-31 13:31:51', '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(2, '10000000-0000-4000-8000-000000000002', 'demo-specialist@kartunamadigital.test', '!development-disabled-ff412212589c119681b3223512b88ed1053796960f2d82015f688dc1104635ea', 'member', 'active', '2026-07-31 13:31:51', '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(3, '10000000-0000-4000-8000-000000000003', 'demo-reviewer@kartunamadigital.test', '!development-disabled-463a9741690f38a81a1fa36794ead649755ad30b6c1e5a677aca1d32758b4505', 'member', 'active', '2026-07-31 13:31:51', '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(4, '10000000-0000-4000-8000-000000000004', 'demo-resume-admin@kartunamadigital.test', '!development-disabled-ad34f75a3ceefdecb733a7c343878e31a14b121332f7dc8eae1079aaf62c6df5', 'member', 'active', '2026-07-31 13:31:51', '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(5, '10000000-0000-4000-8000-000000000005', 'demo-basic@kartunamadigital.test', '!development-disabled-0c9fd3cbf43671027d42a868fc5d95478dcb928a1ee53fee45c53683124668d4', 'member', 'active', '2026-07-31 13:31:51', '2026-07-31 13:31:51', '2026-07-31 13:31:51'),
(6, '10000000-0000-4000-8000-000000000006', 'demo-pro@kartunamadigital.test', '!development-disabled-b9ff148ca0691a20e7c19ef2c4b78c56b1db930209429ac973ab8e037b5f76d8', 'member', 'active', '2026-07-31 13:31:51', '2026-07-31 13:31:51', '2026-07-31 13:31:51');

-- --------------------------------------------------------

--
-- Table structure for table `user_feedback`
--

CREATE TABLE `user_feedback` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `public_id` char(36) NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `message` varchar(300) NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'new',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `user_feedback`
--

INSERT INTO `user_feedback` (`id`, `public_id`, `user_id`, `message`, `status`, `created_at`, `updated_at`) VALUES
(1, '80000000-0000-4000-8000-000000000001', 5, 'Tambahkan contoh panduan penggunaan QR untuk pengguna baru.', 'reviewing', '2026-07-31 13:31:51', '2026-07-31 13:31:51');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `activity_logs`
--
ALTER TABLE `activity_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_activity_created` (`created_at`),
  ADD KEY `idx_activity_user` (`user_id`),
  ADD KEY `idx_activity_card` (`card_id`);

--
-- Indexes for table `auth_rate_limits`
--
ALTER TABLE `auth_rate_limits`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `bucket_hash` (`bucket_hash`),
  ADD KEY `idx_auth_rate_expiry` (`expires_at`);

--
-- Indexes for table `cards`
--
ALTER TABLE `cards`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `public_id` (`public_id`),
  ADD UNIQUE KEY `slug` (`slug`),
  ADD UNIQUE KEY `uq_cards_active_user` (`active_user_id`),
  ADD KEY `idx_cards_user` (`user_id`),
  ADD KEY `idx_cards_status` (`status`),
  ADD KEY `fk_cards_theme` (`theme_id`);

--
-- Indexes for table `card_contacts`
--
ALTER TABLE `card_contacts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `card_id` (`card_id`);

--
-- Indexes for table `card_social_links`
--
ALTER TABLE `card_social_links`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_social_card_order` (`card_id`,`sort_order`);

--
-- Indexes for table `catalog_items`
--
ALTER TABLE `catalog_items`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `public_id` (`public_id`),
  ADD KEY `idx_catalog_card_order` (`card_id`,`sort_order`);

--
-- Indexes for table `email_otps`
--
ALTER TABLE `email_otps`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `public_id` (`public_id`),
  ADD KEY `idx_email_otp_lookup` (`destination_email`,`purpose`,`consumed_at`,`expires_at`),
  ADD KEY `fk_email_otps_user` (`user_id`);

--
-- Indexes for table `mail_delivery_logs`
--
ALTER TABLE `mail_delivery_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_mail_log_outbox` (`outbox_id`);

--
-- Indexes for table `mail_outbox`
--
ALTER TABLE `mail_outbox`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `public_id` (`public_id`),
  ADD KEY `idx_mail_outbox_worker` (`status`,`available_at`,`priority`),
  ADD KEY `fk_mail_outbox_user` (`user_id`);

--
-- Indexes for table `password_reset_tokens`
--
ALTER TABLE `password_reset_tokens`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `token_hash` (`token_hash`),
  ADD KEY `fk_reset_tokens_user` (`user_id`);

--
-- Indexes for table `payments`
--
ALTER TABLE `payments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `public_id` (`public_id`),
  ADD UNIQUE KEY `merchant_order_id` (`merchant_order_id`),
  ADD KEY `idx_payment_user_status` (`user_id`,`status`),
  ADD KEY `fk_payments_subscription` (`subscription_id`);

--
-- Indexes for table `payment_events`
--
ALTER TABLE `payment_events`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `gateway_event_key` (`gateway_event_key`),
  ADD KEY `fk_payment_events_payment` (`payment_id`);

--
-- Indexes for table `plans`
--
ALTER TABLE `plans`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`);

--
-- Indexes for table `plan_features`
--
ALTER TABLE `plan_features`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_plan_feature` (`plan_id`,`feature_key`);

--
-- Indexes for table `plan_theme_access`
--
ALTER TABLE `plan_theme_access`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_plan_theme` (`plan_id`,`theme_id`),
  ADD KEY `fk_plan_theme_theme` (`theme_id`);

--
-- Indexes for table `refresh_tokens`
--
ALTER TABLE `refresh_tokens`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `token_hash` (`token_hash`),
  ADD KEY `idx_refresh_user` (`user_id`),
  ADD KEY `idx_refresh_family` (`family_id`);

--
-- Indexes for table `starter_manage_tokens`
--
ALTER TABLE `starter_manage_tokens`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `token_hash` (`token_hash`),
  ADD KEY `fk_starter_tokens_card` (`card_id`);

--
-- Indexes for table `subscriptions`
--
ALTER TABLE `subscriptions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `public_id` (`public_id`),
  ADD KEY `idx_subscription_user_status` (`user_id`,`status`),
  ADD KEY `fk_subscriptions_plan` (`plan_id`);

--
-- Indexes for table `themes`
--
ALTER TABLE `themes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `public_id` (`public_id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indexes for table `user_feedback`
--
ALTER TABLE `user_feedback`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `public_id` (`public_id`),
  ADD KEY `idx_user_feedback_user_created` (`user_id`,`created_at`),
  ADD KEY `idx_user_feedback_status_created` (`status`,`created_at`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `activity_logs`
--
ALTER TABLE `activity_logs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `auth_rate_limits`
--
ALTER TABLE `auth_rate_limits`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `cards`
--
ALTER TABLE `cards`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `card_contacts`
--
ALTER TABLE `card_contacts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `card_social_links`
--
ALTER TABLE `card_social_links`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `catalog_items`
--
ALTER TABLE `catalog_items`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=18;

--
-- AUTO_INCREMENT for table `email_otps`
--
ALTER TABLE `email_otps`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `mail_delivery_logs`
--
ALTER TABLE `mail_delivery_logs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `mail_outbox`
--
ALTER TABLE `mail_outbox`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `password_reset_tokens`
--
ALTER TABLE `password_reset_tokens`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `payments`
--
ALTER TABLE `payments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `payment_events`
--
ALTER TABLE `payment_events`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `plans`
--
ALTER TABLE `plans`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `plan_features`
--
ALTER TABLE `plan_features`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=16;

--
-- AUTO_INCREMENT for table `plan_theme_access`
--
ALTER TABLE `plan_theme_access`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=16;

--
-- AUTO_INCREMENT for table `refresh_tokens`
--
ALTER TABLE `refresh_tokens`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `starter_manage_tokens`
--
ALTER TABLE `starter_manage_tokens`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `subscriptions`
--
ALTER TABLE `subscriptions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `themes`
--
ALTER TABLE `themes`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `user_feedback`
--
ALTER TABLE `user_feedback`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `activity_logs`
--
ALTER TABLE `activity_logs`
  ADD CONSTRAINT `fk_activity_card` FOREIGN KEY (`card_id`) REFERENCES `cards` (`id`),
  ADD CONSTRAINT `fk_activity_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `cards`
--
ALTER TABLE `cards`
  ADD CONSTRAINT `fk_cards_theme` FOREIGN KEY (`theme_id`) REFERENCES `themes` (`id`),
  ADD CONSTRAINT `fk_cards_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `card_contacts`
--
ALTER TABLE `card_contacts`
  ADD CONSTRAINT `fk_card_contacts_card` FOREIGN KEY (`card_id`) REFERENCES `cards` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `card_social_links`
--
ALTER TABLE `card_social_links`
  ADD CONSTRAINT `fk_social_card` FOREIGN KEY (`card_id`) REFERENCES `cards` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `catalog_items`
--
ALTER TABLE `catalog_items`
  ADD CONSTRAINT `fk_catalog_card` FOREIGN KEY (`card_id`) REFERENCES `cards` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `email_otps`
--
ALTER TABLE `email_otps`
  ADD CONSTRAINT `fk_email_otps_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `mail_delivery_logs`
--
ALTER TABLE `mail_delivery_logs`
  ADD CONSTRAINT `fk_mail_logs_outbox` FOREIGN KEY (`outbox_id`) REFERENCES `mail_outbox` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `mail_outbox`
--
ALTER TABLE `mail_outbox`
  ADD CONSTRAINT `fk_mail_outbox_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `password_reset_tokens`
--
ALTER TABLE `password_reset_tokens`
  ADD CONSTRAINT `fk_reset_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `payments`
--
ALTER TABLE `payments`
  ADD CONSTRAINT `fk_payments_subscription` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions` (`id`),
  ADD CONSTRAINT `fk_payments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `payment_events`
--
ALTER TABLE `payment_events`
  ADD CONSTRAINT `fk_payment_events_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`);

--
-- Constraints for table `plan_features`
--
ALTER TABLE `plan_features`
  ADD CONSTRAINT `fk_plan_features_plan` FOREIGN KEY (`plan_id`) REFERENCES `plans` (`id`);

--
-- Constraints for table `plan_theme_access`
--
ALTER TABLE `plan_theme_access`
  ADD CONSTRAINT `fk_plan_theme_plan` FOREIGN KEY (`plan_id`) REFERENCES `plans` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_plan_theme_theme` FOREIGN KEY (`theme_id`) REFERENCES `themes` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `refresh_tokens`
--
ALTER TABLE `refresh_tokens`
  ADD CONSTRAINT `fk_refresh_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `starter_manage_tokens`
--
ALTER TABLE `starter_manage_tokens`
  ADD CONSTRAINT `fk_starter_tokens_card` FOREIGN KEY (`card_id`) REFERENCES `cards` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `subscriptions`
--
ALTER TABLE `subscriptions`
  ADD CONSTRAINT `fk_subscriptions_plan` FOREIGN KEY (`plan_id`) REFERENCES `plans` (`id`),
  ADD CONSTRAINT `fk_subscriptions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `user_feedback`
--
ALTER TABLE `user_feedback`
  ADD CONSTRAINT `fk_user_feedback_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
