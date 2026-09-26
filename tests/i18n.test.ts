import test from 'node:test';
import assert from 'node:assert/strict';
import { dictionaries } from '@/lib/i18n/copy';
import { LOCALES, localeDirection } from '@/lib/i18n/locales';
import { MISSION_TYPES, NAVIGATION_ZONES, SKIPPER_BOAT_TYPES, EXPERIENCE_RANGES, PRIMARY_LANGUAGE_CODES } from '@/lib/profile-options';
import { AVAILABILITY_STATUSES } from '@/lib/availability';
import { formatMoney, interpolate, languageName } from '@/lib/i18n/format';

type Tree = { [key: string]: unknown };

function leafPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((entry, index) => leafPaths(entry, `${prefix}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value as Tree).flatMap(([key, entry]) => leafPaths(entry, prefix ? `${prefix}.${key}` : key));
  }
  return [prefix];
}

function placeholders(text: string) {
  return (text.match(/\{\w+\}/g) || []).sort().join(',');
}

function getPath(tree: unknown, path: string): unknown {
  return path.split(/\.|\[(\d+)\]/).filter(Boolean).reduce<unknown>((node, key) => (node as Tree | undefined)?.[key], tree);
}

test('exactly the 8 required languages are offered, Arabic is RTL', () => {
  assert.deepEqual(LOCALES.map((locale) => locale.code), ['fr', 'en', 'es', 'it', 'de', 'nl', 'ru', 'ar']);
  assert.equal(localeDirection('ar'), 'rtl');
  assert.equal(localeDirection('fr'), 'ltr');
});

test('every locale has exactly the same keys as French, non-empty, with the same placeholders', () => {
  const reference = leafPaths(dictionaries.fr).sort();
  for (const locale of LOCALES) {
    const dictionary = dictionaries[locale.code];
    assert.deepEqual(leafPaths(dictionary).sort(), reference, `${locale.code} keys differ from fr`);
    for (const path of reference) {
      const value = getPath(dictionary, path);
      assert.equal(typeof value, 'string', `${locale.code}.${path} must be a string`);
      assert.ok((value as string).trim().length > 0, `${locale.code}.${path} is empty`);
      assert.equal(placeholders(value as string), placeholders(getPath(dictionaries.fr, path) as string), `${locale.code}.${path} placeholders`);
    }
  }
});

test('every option value stored in the database has a label in every locale', () => {
  for (const locale of LOCALES) {
    const copy = dictionaries[locale.code];
    for (const zone of NAVIGATION_ZONES) assert.ok(copy.zones[zone], `${locale.code} zone ${zone}`);
    for (const boat of SKIPPER_BOAT_TYPES) assert.ok(copy.boatTypes[boat], `${locale.code} boat ${boat}`);
    for (const type of MISSION_TYPES) assert.ok(copy.missionTypes[type], `${locale.code} type ${type}`);
    for (const range of EXPERIENCE_RANGES) {
      assert.ok(copy.experience.ranges[range], `${locale.code} experience ${range}`);
      assert.ok(copy.experience.filterRanges[range], `${locale.code} experience filter ${range}`);
    }
    for (const status of AVAILABILITY_STATUSES) assert.ok(copy.availability.statuses[status], `${locale.code} availability ${status}`);
    for (const code of PRIMARY_LANGUAGE_CODES) assert.notEqual(languageName(code, locale.code), code.toUpperCase(), `${locale.code} language ${code}`);
  }
});

test('French copy uses the required wording', () => {
  const fr = dictionaries.fr;
  assert.equal(fr.missions.zone, 'Zone de navigation');
  assert.equal(fr.missions.statusOpen, 'Mission ouverte');
  assert.equal(fr.missions.statusPast, 'Anciennes missions');
  assert.equal(fr.missionDetail.back, 'Retour aux missions');
  assert.equal(fr.missionDetail.apply, 'Postuler pour cette mission');
  assert.equal(fr.missionForm.submit, 'Publier une mission');
  assert.equal(fr.missionForm.permit, 'Permis requis');
  assert.equal(fr.nav.messaging, 'Messagerie');
  assert.equal(fr.languages.label, 'Langues');
  assert.deepEqual(Object.values(fr.experience.filterRanges), ['0 à 2 ans', '3 à 5 ans', '5 à 10 ans', 'Plus de 10 ans']);
  const all = JSON.stringify(dictionaries);
  assert.equal(/Find the Skipper/i.test(all), false);
  assert.equal(/tarif indicatif|rémunération indicative/i.test(JSON.stringify(fr)), false);
  assert.equal(/vérification du profil/i.test(JSON.stringify(fr)), false);
});

test('formatting helpers', () => {
  assert.equal(interpolate('Du {start} au {end}', { start: 'a', end: 'b' }), 'Du a au b');
  assert.equal(formatMoney(350, 'EUR', 'fr'), '350 €');
  assert.equal(formatMoney(400, 'USD', 'en'), '400 $');
  assert.equal(languageName('ru', 'fr'), 'Russe');
  assert.equal(languageName('ar', 'fr'), 'Arabe');
});
