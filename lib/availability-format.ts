import type { Messages } from '@/lib/i18n/copy';
import { formatDateForLocale, interpolate } from '@/lib/i18n/format';
import type { SupportedLocale } from '@/lib/i18n/locales';
import { effectiveAvailabilityStatus, upcomingSlots, type AvailabilityProfile } from '@/lib/availability';

/** Human readable availability, e.g. ["Disponible du… au…", "Du 1 mai au 1 octobre 2027"]. */
export function describeAvailability(copy: Messages, locale: SupportedLocale, profile: AvailabilityProfile & { availability_note?: string | null }) {
  const status = effectiveAvailabilityStatus(profile);
  const format = (date: string) => formatDateForLocale(date, locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const lines: string[] = [];

  if (!status) {
    lines.push(copy.availability.notSpecified);
  } else if (status === 'from_date') {
    lines.push(profile.available_from ? interpolate(copy.availability.fromDate, { date: format(profile.available_from) }) : copy.availability.statuses.from_date);
  } else {
    lines.push(copy.availability.statuses[status]);
  }

  if (status === 'range' || status === 'specific') {
    const slots = upcomingSlots(profile.availability_slots || []);
    if (status === 'specific' && slots.length > 0) {
      lines.push(slots.map((slot) => format(slot.start_date)).join(' · '));
    } else {
      for (const slot of slots) {
        lines.push(slot.start_date === slot.end_date ? format(slot.start_date) : interpolate(copy.availability.period, { start: format(slot.start_date), end: format(slot.end_date) }));
      }
    }
  }

  if (profile.availability_note?.trim()) lines.push(profile.availability_note.trim());
  return lines;
}
