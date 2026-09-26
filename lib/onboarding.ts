import type { Profile, Role } from '@/lib/database.types';

export type OnboardingStep = 'role_details' | 'done';
export type MissingField = 'zones' | 'boatTypes' | 'bio' | 'phone' | 'companyName' | 'fleetSize';

function hasText(value: string | null | undefined) {
  return Boolean(value && value.trim().length > 0);
}

export function isRecruiterRole(role: string | null | undefined) {
  return role === 'owner' || role === 'broker' || role === 'charter_company';
}

export function onboardingRequired(profile: Pick<Profile, 'onboarding_step' | 'onboarding_completed_at'>) {
  return profile.onboarding_step !== null && profile.onboarding_completed_at === null;
}

export function dashboardHrefForRole(role: Role | string) {
  if (role === 'skipper') return '/dashboard/skipper';
  if (role === 'admin') return '/dashboard/admin';
  return '/dashboard/demandeur';
}

/** Keys of the translated "missing information" messages (onboarding.missing.*). */
export function missingRoleFields(profile: Profile): MissingField[] {
  if (profile.role === 'skipper') {
    return [
      ...((profile.zones || []).length === 0 ? (['zones'] as const) : []),
      ...((profile.boat_types || []).length === 0 ? (['boatTypes'] as const) : []),
      ...(!hasText(profile.bio) ? (['bio'] as const) : []),
    ];
  }
  if (profile.role === 'owner') {
    return !hasText(profile.phone) ? ['phone'] : [];
  }
  if (profile.role === 'broker' || profile.role === 'charter_company') {
    return [
      ...(!hasText(profile.phone) ? (['phone'] as const) : []),
      ...(!hasText(profile.company_name) ? (['companyName'] as const) : []),
      ...(profile.fleet_size === null || profile.fleet_size === undefined ? (['fleetSize'] as const) : []),
    ];
  }
  return [];
}

export function isRoleProfileReady(profile: Profile) {
  return missingRoleFields(profile).length === 0;
}
