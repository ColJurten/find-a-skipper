import type { Mission } from '@/lib/database.types';
import { formatMoney, type Currency } from '@/lib/i18n/format';
import type { SupportedLocale } from '@/lib/i18n/locales';

export type MissionStatusFilter = 'open' | 'past';

/** "Mission ouverte" = a skipper can still apply; "Anciennes missions" = completed missions. */
export function matchesMissionStatusFilter(mission: Pick<Mission, 'status'>, filter: MissionStatusFilter) {
  return filter === 'open' ? mission.status === 'open' : mission.status === 'completed';
}

export function missionRoute(mission: Pick<Mission, 'departure' | 'destination'>) {
  return mission.destination ? `${mission.departure} → ${mission.destination}` : mission.departure;
}

/**
 * Value for missions.title: in production this column is NOT NULL without default
 * (it predates the tracked migrations), so every insert must provide it.
 */
export function missionTitle(mission: { type: string; departure: string; destination?: string | null }) {
  return `${mission.type} - ${missionRoute({ departure: mission.departure.trim(), destination: mission.destination?.trim() || null })}`.slice(0, 200);
}

/**
 * Amount as entered by the recruiter ("350 €"), or null when no amount was given.
 * Legacy missions only have the free-text `compensation` column.
 */
export function missionAmountLabel(
  mission: Pick<Mission, 'compensation_amount' | 'currency' | 'compensation'>,
  locale: SupportedLocale
) {
  if (mission.compensation_amount !== null && mission.compensation_amount !== undefined) {
    return formatMoney(Number(mission.compensation_amount), (mission.currency || 'EUR') as Currency, locale);
  }
  const legacy = mission.compensation?.trim();
  return legacy ? legacy : null;
}

export function isSingleDayMissionType(type: string) {
  return type === 'À la journée';
}

export interface MissionFormInput {
  type: string;
  departure: string;
  startDate: string;
  endDate: string;
  hours: string;
  amount: string;
}

export type MissionFormError = 'departure' | 'date' | 'endAfterStart' | 'hours' | 'amount';

export function parseDecimal(value: string) {
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  if (!normalized) return null;
  return /^\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

export function validateMissionForm(input: MissionFormInput): MissionFormError | null {
  if (!input.departure.trim()) return 'departure';
  if (!input.startDate) return 'date';
  if (!isSingleDayMissionType(input.type) && input.endDate && input.endDate < input.startDate) return 'endAfterStart';
  const hours = parseDecimal(input.hours);
  if (hours !== null && (Number.isNaN(hours) || hours <= 0 || hours > 10000)) return 'hours';
  const amount = parseDecimal(input.amount);
  if (amount !== null && (Number.isNaN(amount) || amount < 0)) return 'amount';
  return null;
}
