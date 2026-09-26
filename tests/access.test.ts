import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessPath } from '@/lib/access';
import { isCurrentApplication, canWithdrawApplication } from '@/lib/applications';
import { isAvailableDuring, matchesAvailabilityFilter, normalizePeriod, validateAvailability, emptyAvailability } from '@/lib/availability';
import { matchesMissionStatusFilter, validateMissionForm, missionAmountLabel } from '@/lib/mission';
import { experienceRangeFromYears, profileExperienceRange } from '@/lib/profile-options';
import { friendlyError } from '@/lib/errors';
import { dictionaries } from '@/lib/i18n/copy';

const RECRUITERS = ['owner', 'broker', 'charter_company'];

test('skippers never reach the directory or skipper profiles; recruiters do', () => {
  assert.equal(canAccessPath('skipper', '/skippers'), false);
  assert.equal(canAccessPath('skipper', '/skippers/123'), false);
  for (const role of RECRUITERS) {
    assert.equal(canAccessPath(role, '/skippers'), true, role);
    assert.equal(canAccessPath(role, '/skippers/123'), true, role);
  }
});

test('"Mes candidatures" is skipper-only, mission publishing is recruiter-only', () => {
  assert.equal(canAccessPath('skipper', '/my-applications'), true);
  for (const role of RECRUITERS) {
    assert.equal(canAccessPath(role, '/my-applications'), false, role);
    assert.equal(canAccessPath(role, '/missions/new'), true, role);
    assert.equal(canAccessPath(role, '/my-missions/abc'), true, role);
  }
  assert.equal(canAccessPath('skipper', '/missions/new'), false);
  assert.equal(canAccessPath('skipper', '/my-missions'), false);
  assert.equal(canAccessPath('skipper', '/missions'), true);
  assert.equal(canAccessPath('owner', '/dashboard/admin'), false);
  assert.equal(canAccessPath('skipper', '/messages'), true);
});

test('mission status filter: open vs past (completed) missions', () => {
  assert.equal(matchesMissionStatusFilter({ status: 'open' }, 'open'), true);
  assert.equal(matchesMissionStatusFilter({ status: 'assigned' }, 'open'), false);
  assert.equal(matchesMissionStatusFilter({ status: 'completed' }, 'past'), true);
  assert.equal(matchesMissionStatusFilter({ status: 'open' }, 'past'), false);
});

test('mission form validation and amount display', () => {
  const base = { type: 'À la semaine', departure: 'Antibes', startDate: '2026-10-01', endDate: '2026-10-07', hours: '40', amount: '350' };
  assert.equal(validateMissionForm(base), null);
  assert.equal(validateMissionForm({ ...base, departure: ' ' }), 'departure');
  assert.equal(validateMissionForm({ ...base, startDate: '' }), 'date');
  assert.equal(validateMissionForm({ ...base, endDate: '2026-09-01' }), 'endAfterStart');
  assert.equal(validateMissionForm({ ...base, hours: 'abc' }), 'hours');
  assert.equal(validateMissionForm({ ...base, amount: '-3' }), 'amount');
  assert.equal(validateMissionForm({ ...base, hours: '', amount: '' }), null);
  assert.equal(missionAmountLabel({ compensation_amount: 350, currency: 'EUR', compensation: null }, 'fr'), '350 €');
  assert.equal(missionAmountLabel({ compensation_amount: 400, currency: 'USD', compensation: null }, 'fr'), '400 $');
  assert.equal(missionAmountLabel({ compensation_amount: null, currency: 'EUR', compensation: null }, 'fr'), null);
});

test('experience ranges map legacy years consistently', () => {
  assert.equal(experienceRangeFromYears(1), '0-2');
  assert.equal(experienceRangeFromYears(3), '2-5');
  assert.equal(experienceRangeFromYears(7), '5-10');
  assert.equal(experienceRangeFromYears(12), '10+');
  assert.equal(profileExperienceRange({ experience_range: '5-10', experience_years: 1 }), '5-10');
  assert.equal(profileExperienceRange({ experience_range: null, experience_years: null }), null);
});

test('availability filters and period search', () => {
  const immediate = { availability_status: 'immediate' as const };
  const fromDate = { availability_status: 'from_date' as const, available_from: '2026-05-01' };
  const range = { availability_status: 'range' as const, availability_slots: [{ start_date: '2026-05-01', end_date: '2026-10-01' }] };
  const specific = { availability_status: 'specific' as const, availability_slots: [{ start_date: '2026-07-03', end_date: '2026-07-03' }] };
  const unavailable = { availability_status: 'unavailable' as const };
  const july = normalizePeriod('2026-07-01', '2026-07-10');

  assert.equal(matchesAvailabilityFilter(immediate, 'immediate', null), true);
  assert.equal(matchesAvailabilityFilter(range, 'immediate', null), false);
  assert.equal(matchesAvailabilityFilter(range, 'range', july), true);
  assert.equal(matchesAvailabilityFilter(specific, 'range', july), true);
  assert.equal(matchesAvailabilityFilter(specific, 'range', normalizePeriod('2026-08-01', '2026-08-02')), false);
  assert.equal(matchesAvailabilityFilter(fromDate, 'from_date', july), true);
  assert.equal(matchesAvailabilityFilter(unavailable, 'unavailable', null), true);
  assert.equal(matchesAvailabilityFilter(unavailable, 'all', july), false, 'unavailable skippers are excluded from a period search');
  assert.equal(isAvailableDuring(fromDate, { start: '2026-01-01', end: '2026-02-01' }), false);
  assert.equal(validateAvailability({ ...emptyAvailability('range') }), 'periodRequired');
  assert.equal(validateAvailability({ ...emptyAvailability('from_date') }), 'fromDateRequired');
  assert.equal(validateAvailability(emptyAvailability('immediate')), null);
});

test('applications: accepted ones are locked, history keeps old ones', () => {
  assert.equal(canWithdrawApplication({ status: 'pending' }), true);
  assert.equal(canWithdrawApplication({ status: 'accepted' }), false);
  assert.equal(isCurrentApplication({ status: 'pending', missions: { status: 'open' } }), true);
  assert.equal(isCurrentApplication({ status: 'accepted', missions: { status: 'assigned' } }), true);
  assert.equal(isCurrentApplication({ status: 'accepted', missions: { status: 'completed' } }), false);
  assert.equal(isCurrentApplication({ status: 'withdrawn', missions: { status: 'open' } }), false);
});

test('technical errors are translated, never shown raw', () => {
  const fr = dictionaries.fr;
  assert.equal(friendlyError(fr, { message: 'new row violates row-level security policy for table "missions"', code: '42501' }), fr.errors.permission);
  assert.equal(friendlyError(fr, { message: 'Invalid login credentials' }), fr.errors.invalidCredentials);
  assert.equal(friendlyError(fr, { message: 'Email not confirmed' }), fr.errors.emailNotConfirmed);
  assert.equal(friendlyError(fr, new TypeError('Failed to fetch')), fr.errors.network);
  assert.equal(friendlyError(fr, { message: 'duplicate key value', code: '23505' }), fr.errors.duplicate);
  assert.equal(friendlyError(dictionaries.ar, { message: 'something odd' }), dictionaries.ar.errors.generic);
});
