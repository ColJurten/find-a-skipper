import type { Messages } from '@/lib/i18n/copy';

// Canonical database values → translated labels (falls back to the stored value).
export function localizeZone(copy: Messages, zone: string) {
  return copy.zones[zone] ?? zone;
}

export function localizeBoatType(copy: Messages, boatType: string) {
  return copy.boatTypes[boatType] ?? boatType;
}

export function localizeMissionType(copy: Messages, missionType: string) {
  return copy.missionTypes[missionType] ?? missionType;
}

export function localizeRole(copy: Messages, role: string) {
  return copy.roles[role as keyof Messages['roles']] ?? role;
}
