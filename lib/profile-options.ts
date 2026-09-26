// Canonical values stored in the database. Labels come from the translation files
// (lib/i18n/messages/*), so these lists can grow without touching the UI.

export interface CertificationOptionGroup {
  label: string;
  options: string[];
}

export const CERTIFICATION_GROUPS: CertificationOptionGroup[] = [
  {
    label: 'France',
    options: [
      'Permis côtier',
      'Permis hauturier',
      'Permis eaux intérieures',
      'Extension grande plaisance eaux intérieures',
      'Capitaine 200',
      'Capitaine 200 Yacht',
      'Capitaine 200 Voile',
      'Capitaine 500',
      'Capitaine 500 Yacht',
      'Capitaine 3000',
      'Capitaine 3000 Yacht',
    ],
  },
  {
    label: 'RYA',
    options: [
      'RYA Powerboat Level 2',
      'RYA Advanced Powerboat',
      'RYA Day Skipper Power',
      'RYA Day Skipper Sail',
      'RYA Coastal Skipper Power',
      'RYA Coastal Skipper Sail',
      'RYA Yachtmaster Coastal',
      'RYA Yachtmaster Offshore',
      'RYA Yachtmaster Ocean',
    ],
  },
];

export const CERTIFICATION_OPTIONS = CERTIFICATION_GROUPS.flatMap((group) => group.options);

/** ISO 639-1 codes. The first eight are the main languages; add more codes at will. */
export const PRIMARY_LANGUAGE_CODES = ['fr', 'en', 'es', 'it', 'de', 'nl', 'ru', 'ar'] as const;
export const LANGUAGE_CODES = [...PRIMARY_LANGUAGE_CODES, 'pt', 'el', 'hr', 'tr', 'pl', 'sv', 'da', 'no', 'zh'] as const;

export const SKIPPER_BOAT_TYPES = ['Voilier', 'Moteur', 'Catamaran', 'Grande unité (+20m)'] as const;

export const NAVIGATION_ZONES = [
  'Méditerranée',
  'Atlantique',
  'Caraïbes',
  'Pacifique',
  'Océan Indien',
  'Mer Rouge',
  'Manche / Mer du Nord',
  'Mer Baltique',
  'Bretagne',
  'Outre-mer',
] as const;

export const MISSION_TYPES = ['À la journée', 'À la semaine', 'Saisonnier', 'Convoyage', 'Permanent'] as const;

export const EXPERIENCE_RANGES = ['0-2', '2-5', '5-10', '10+'] as const;
export type ExperienceRange = (typeof EXPERIENCE_RANGES)[number];

export function isExperienceRange(value: unknown): value is ExperienceRange {
  return typeof value === 'string' && (EXPERIENCE_RANGES as readonly string[]).includes(value);
}

/** Legacy profiles only have a number of years: map it to the matching range. */
export function experienceRangeFromYears(years: number | null | undefined): ExperienceRange | null {
  if (years === null || years === undefined || Number.isNaN(years)) return null;
  if (years <= 2) return '0-2';
  if (years <= 5) return '2-5';
  if (years <= 10) return '5-10';
  return '10+';
}

export function profileExperienceRange(profile: { experience_range?: string | null; experience_years?: number | null }) {
  return isExperienceRange(profile.experience_range) ? profile.experience_range : experienceRangeFromYears(profile.experience_years);
}
