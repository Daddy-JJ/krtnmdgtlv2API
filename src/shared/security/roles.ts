export const platformRoles = [
  'member',
  'cv_specialist',
  'resume_quality_reviewer',
  'resume_service_admin',
  'super_admin',
] as const;

export type PlatformRole = typeof platformRoles[number];
export type LegacyRole = 'user' | 'admin';
export type CompatibleRole = PlatformRole | LegacyRole;

export function normalizeRole(value: string): PlatformRole | null {
  if (value === 'user') return 'member';
  if (value === 'admin') return 'super_admin';
  return platformRoles.includes(value as PlatformRole) ? value as PlatformRole : null;
}
