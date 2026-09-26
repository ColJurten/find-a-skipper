import type { Profile, ProfileCertification } from '@/lib/database.types';

export function normalizeProfileCertifications(value: Profile['certifications'] | null | undefined): ProfileCertification[] {
  return (value || [])
    .map((entry) => {
      if (!entry?.name) return null;
      return {
        name: entry.name,
        verified: Boolean(entry.verified),
        authority: entry.authority || null,
      };
    })
    .filter(Boolean) as ProfileCertification[];
}

export function normalizeLanguages(value: string[] | null | undefined) {
  return (value || []).filter(Boolean);
}
