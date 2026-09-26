import type { Mission } from '@/lib/database.types';
import type { Messages } from '@/lib/i18n/copy';
import { formatDateForLocale, formatNumber, interpolate } from '@/lib/i18n/format';
import type { SupportedLocale } from '@/lib/i18n/locales';
import { isSingleDayMissionType, missionAmountLabel } from '@/lib/mission';

type DatedMission = Pick<Mission, 'type' | 'start_date' | 'end_date'>;

export function missionDatesLabel(copy: Messages, locale: SupportedLocale, mission: DatedMission) {
  const format = (date: string) => formatDateForLocale(date, locale);
  if (mission.end_date && mission.end_date !== mission.start_date && !isSingleDayMissionType(mission.type)) {
    return interpolate(copy.missionDetail.dateRange, { start: format(mission.start_date), end: format(mission.end_date) });
  }
  if (isSingleDayMissionType(mission.type) || mission.end_date === mission.start_date) {
    return interpolate(copy.missionDetail.date, { date: format(mission.start_date) });
  }
  return interpolate(copy.missionDetail.fromDate, { date: format(mission.start_date) });
}

/** Short hours label for cards ("8 h"), falling back to the legacy free-text duration. */
export function missionHoursShort(copy: Messages, locale: SupportedLocale, mission: Pick<Mission, 'duration_hours' | 'duration'>) {
  if (mission.duration_hours) return interpolate(copy.missions.hours, { hours: formatNumber(Number(mission.duration_hours), locale) });
  return mission.duration?.trim() || '';
}

export function missionHoursLong(copy: Messages, locale: SupportedLocale, mission: Pick<Mission, 'duration_hours' | 'duration'>) {
  if (mission.duration_hours) return interpolate(copy.missionDetail.duration, { hours: formatNumber(Number(mission.duration_hours), locale) });
  return mission.duration?.trim() || '';
}

/** "350 €", "350 € · Sur devis" or "Sur devis". */
export function missionPayLabel(copy: Messages, locale: SupportedLocale, mission: Pick<Mission, 'compensation_amount' | 'currency' | 'compensation' | 'on_quote'>) {
  const amount = missionAmountLabel(mission, locale);
  if (amount && mission.on_quote) return `${amount} · ${copy.missions.onQuote}`;
  return amount || copy.missions.onQuote;
}
