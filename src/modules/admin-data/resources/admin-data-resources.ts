export const ADMIN_DATA_RESOURCES = Object.freeze([
  'activity_logs',
  'admin_interventions',
  'auth_rate_limits',
  'cards',
  'card_contacts',
  'card_social_links',
  'catalog_items',
  'email_otps',
  'mail_delivery_logs',
  'mail_outbox',
  'password_reset_tokens',
  'payments',
  'payment_events',
  'permissions',
  'plans',
  'plan_features',
  'plan_theme_access',
  'refresh_tokens',
  'resume_deliverables',
  'resume_download_logs',
  'resume_quality_reviews',
  'resume_requests',
  'resume_request_assignments',
  'resume_request_files',
  'resume_request_messages',
  'resume_request_sla_events',
  'resume_request_status_logs',
  'resume_retention_notices',
  'resume_revision_requests',
  'resume_service_entitlements',
  'roles',
  'role_permissions',
  'setting_change_logs',
  'starter_manage_tokens',
  'subscriptions',
  'subscription_periods',
  'themes',
  'usage_adjustments',
  'users',
  'user_feedback',
  'user_roles',
  'user_tier_history',
  'website_settings',
] as const);

export type AdminDataResource = (typeof ADMIN_DATA_RESOURCES)[number];

const resourceSet = new Set<string>(ADMIN_DATA_RESOURCES);

export function isAdminDataResource(value: string): value is AdminDataResource {
  return resourceSet.has(value);
}

const sensitiveColumnPattern = /(?:password|token|secret|otp|credential|(?:^|_)hash$|_hash$|sha256$)/i;

export function isSensitiveAdminDataColumn(column: string): boolean {
  return sensitiveColumnPattern.test(column);
}
