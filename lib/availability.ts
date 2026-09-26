import type { AvailabilitySlot, AvailabilityStatus } from '@/lib/database.types';

export const AVAILABILITY_STATUSES: AvailabilityStatus[] = ['immediate', 'season', 'from_date', 'range', 'specific', 'unavailable'];

export type AvailabilityFilter = 'all' | 'immediate' | 'season' | 'from_date' | 'range' | 'unavailable';

export interface AvailabilityProfile {
  availability_status?: AvailabilityStatus | null;
  available_from?: string | null;
  availability_slots?: Pick<AvailabilitySlot, 'start_date' | 'end_date'>[] | null;
}

export interface Period {
  start: string;
  end: string;
}

export function isAvailabilityStatus(value: unknown): value is AvailabilityStatus {
  return typeof value === 'string' && (AVAILABILITY_STATUSES as string[]).includes(value);
}

/** Effective status, including legacy profiles that only have date slots. */
export function effectiveAvailabilityStatus(profile: AvailabilityProfile): AvailabilityStatus | null {
  if (isAvailabilityStatus(profile.availability_status)) return profile.availability_status;
  return (profile.availability_slots?.length ?? 0) > 0 ? 'range' : null;
}

function overlaps(slot: Pick<AvailabilitySlot, 'start_date' | 'end_date'>, period: Period) {
  return slot.start_date <= period.end && slot.end_date >= period.start;
}

/** Whether a skipper is available at some point of the requested period (ISO dates). */
export function isAvailableDuring(profile: AvailabilityProfile, period: Period) {
  const status = effectiveAvailabilityStatus(profile);
  if (status === 'immediate' || status === 'season') return true;
  if (status === 'from_date') return Boolean(profile.available_from && profile.available_from <= period.end);
  if (status === 'range' || status === 'specific') return (profile.availability_slots || []).some((slot) => overlaps(slot, period));
  return false;
}

export function normalizePeriod(start: string, end: string): Period | null {
  if (!start && !end) return null;
  const from = start || end;
  const to = end || start;
  return from <= to ? { start: from, end: to } : { start: to, end: from };
}

export function matchesAvailabilityFilter(profile: AvailabilityProfile, filter: AvailabilityFilter, period: Period | null) {
  const status = effectiveAvailabilityStatus(profile);
  let matches: boolean;
  switch (filter) {
    case 'all':
      matches = true;
      break;
    case 'range':
      // "Disponible du … au …": dated availability (periods or specific days).
      matches = status === 'range' || status === 'specific';
      break;
    default:
      matches = status === filter;
  }
  if (!matches) return false;
  if (period && filter !== 'unavailable') return isAvailableDuring(profile, period);
  return true;
}

export function sortSlots<T extends Pick<AvailabilitySlot, 'start_date' | 'end_date'>>(slots: T[]) {
  return slots.slice().sort((left, right) => left.start_date.localeCompare(right.start_date) || left.end_date.localeCompare(right.end_date));
}

/** Drop periods that are already over, so the profile only shows useful dates. */
export function upcomingSlots<T extends Pick<AvailabilitySlot, 'start_date' | 'end_date'>>(slots: T[], today = new Date().toISOString().slice(0, 10)) {
  return sortSlots(slots).filter((slot) => slot.end_date >= today);
}

export interface AvailabilityDraftSlot {
  id: string;
  start_date: string;
  end_date: string;
}

export interface AvailabilityValue {
  status: AvailabilityStatus;
  fromDate: string;
  slots: AvailabilityDraftSlot[];
  note: string;
}

export type AvailabilityError = 'fromDateRequired' | 'periodRequired' | 'dateRequired';

export function emptyAvailability(status: AvailabilityStatus = 'immediate'): AvailabilityValue {
  return { status, fromDate: '', slots: [], note: '' };
}

export function validateAvailability(value: AvailabilityValue): AvailabilityError | null {
  if (value.status === 'from_date' && !value.fromDate) return 'fromDateRequired';
  if (value.status === 'range' && value.slots.length === 0) return 'periodRequired';
  if (value.status === 'specific' && value.slots.length === 0) return 'dateRequired';
  return null;
}

/** Only the slots relevant for the chosen status are kept. */
export function slotsForStatus(value: AvailabilityValue) {
  return value.status === 'range' || value.status === 'specific' ? sortSlots(value.slots) : [];
}
