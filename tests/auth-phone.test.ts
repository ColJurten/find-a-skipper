import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVerifyEmailPath, isEmailVerified, requiresVerifiedEmailPath, safeNextPath } from '@/lib/auth';
import { OTHER_COUNTRY, createEmptyPhoneValue, formatPhoneValue, getPhoneStorageValue, phoneValueFromStored, selectCountry, validatePhoneValue } from '@/lib/phone';

test('safeNextPath keeps only internal paths', () => {
  assert.equal(safeNextPath('/messages', '/dashboard'), '/messages');
  assert.equal(safeNextPath('https://evil.example.com', '/dashboard'), '/dashboard');
  assert.equal(safeNextPath('//evil.example.com', '/dashboard'), '/dashboard');
});

test('requiresVerifiedEmailPath only protects sensitive routes', () => {
  assert.equal(requiresVerifiedEmailPath('/messages'), true);
  assert.equal(requiresVerifiedEmailPath('/messages/abc'), true);
  assert.equal(requiresVerifiedEmailPath('/missions/new'), true);
  assert.equal(requiresVerifiedEmailPath('/profile'), true);
  assert.equal(requiresVerifiedEmailPath('/dashboard'), true);
  assert.equal(requiresVerifiedEmailPath('/skippers'), true);
  assert.equal(requiresVerifiedEmailPath('/missions'), false);
});

test('buildVerifyEmailPath preserves email and internal next path', () => {
  assert.equal(buildVerifyEmailPath('hello@example.com', '/messages'), '/verify-email?email=hello%40example.com&next=%2Fmessages');
});

test('isEmailVerified reads email confirmation state', () => {
  assert.equal(isEmailVerified({ email_confirmed_at: '2026-09-07T00:00:00.000Z' }), true);
  assert.equal(isEmailVerified({ email_confirmed_at: undefined }), false);
});

test('phone helpers keep france default and validate per country', () => {
  const empty = createEmptyPhoneValue();
  assert.equal(empty.country, 'FR');
  assert.equal(empty.callingCode, '+33');

  const french = formatPhoneValue('0612345678', 'FR');
  assert.equal(french.country, 'FR');
  assert.equal(french.callingCode, '+33');
  assert.equal(validatePhoneValue(french, true), null);

  const invalidCode = { ...french, callingCode: '+12345' };
  assert.equal(validatePhoneValue(invalidCode, true), 'invalidCode');
  assert.equal(validatePhoneValue({ ...french, number: '' }, true), 'required');
  assert.equal(validatePhoneValue({ ...french, number: '' }, false), null);
  assert.equal(validatePhoneValue({ ...french, number: '12' }, true), 'invalid');

  const parsed = phoneValueFromStored('+33612345678');
  assert.equal(parsed.country, 'FR');
  assert.equal(parsed.callingCode, '+33');
  assert.equal(parsed.number, '612345678');
  assert.equal(validatePhoneValue(parsed, true), null);
});

test('phone input supports a manual calling code for other countries', () => {
  const other = { ...selectCountry(createEmptyPhoneValue(), OTHER_COUNTRY), callingCode: '+971', number: '50 123 4567' };
  assert.equal(validatePhoneValue(other, true), null);
  const stored = getPhoneStorageValue(other);
  assert.equal(stored, '+971 50 123 4567');
  const restored = phoneValueFromStored(stored);
  assert.equal(restored.country, OTHER_COUNTRY);
  assert.equal(restored.callingCode, '+971');
  assert.equal(restored.number, '50 123 4567');
  assert.equal(phoneValueFromStored('+44 7700 900123').country, 'GB');
});
