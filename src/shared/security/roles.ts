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

const rolePriority: Readonly<Record<PlatformRole, number>> = Object.freeze({
  member: 0,
  cv_specialist: 10,
  resume_quality_reviewer: 20,
  resume_service_admin: 30,
  super_admin: 40,
});

export function normalizeRole(value: string): PlatformRole | null {
  if (value === 'user') return 'member';
  if (value === 'admin') return 'super_admin';
  return platformRoles.includes(value as PlatformRole) ? value as PlatformRole : null;
}

export function normalizeRoles(values: readonly string[]): PlatformRole[] {
  return [...new Set(values.map(normalizeRole).filter((role): role is PlatformRole => role !== null))]
    .sort((left, right) => rolePriority[right] - rolePriority[left]);
}

export function primaryRole(values: readonly string[]): PlatformRole | null {
  return normalizeRoles(values)[0] ?? null;
}
