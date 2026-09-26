export interface PhoneValue {
  /** Country chosen in the short list, or OTHER_COUNTRY when the code is typed manually. */
  country: string;
  callingCode: string;
  number: string;
}

export interface CountryOption {
  code: string;
  callingCode: string;
  flag: string;
}

export const OTHER_COUNTRY = 'OTHER';
const DEFAULT_COUNTRY = 'FR';

/** Short list of the main yachting countries; any other code can be typed manually. */
export const MAIN_COUNTRIES: CountryOption[] = [
  { code: 'FR', callingCode: '+33', flag: '🇫🇷' },
  { code: 'GB', callingCode: '+44', flag: '🇬🇧' },
  { code: 'US', callingCode: '+1', flag: '🇺🇸' },
  { code: 'ES', callingCode: '+34', flag: '🇪🇸' },
  { code: 'IT', callingCode: '+39', flag: '🇮🇹' },
  { code: 'DE', callingCode: '+49', flag: '🇩🇪' },
  { code: 'NL', callingCode: '+31', flag: '🇳🇱' },
  { code: 'BE', callingCode: '+32', flag: '🇧🇪' },
  { code: 'CH', callingCode: '+41', flag: '🇨🇭' },
  { code: 'MC', callingCode: '+377', flag: '🇲🇨' },
  { code: 'PT', callingCode: '+351', flag: '🇵🇹' },
  { code: 'GR', callingCode: '+30', flag: '🇬🇷' },
  { code: 'HR', callingCode: '+385', flag: '🇭🇷' },
];

export type PhoneError = 'required' | 'invalid' | 'invalidCode';

export function normalizeCallingCode(value?: string | null) {
  const digits = (value || '').replace(/[^\d]/g, '');
  return digits ? `+${digits}` : '';
}

export function createEmptyPhoneValue(country: string = DEFAULT_COUNTRY): PhoneValue {
  const selected = MAIN_COUNTRIES.find((entry) => entry.code === country) || MAIN_COUNTRIES[0];
  return { country: selected.code, callingCode: selected.callingCode, number: '' };
}

export function selectCountry(value: PhoneValue, country: string): PhoneValue {
  if (country === OTHER_COUNTRY) return { ...value, country: OTHER_COUNTRY, callingCode: '' };
  const selected = MAIN_COUNTRIES.find((entry) => entry.code === country) || MAIN_COUNTRIES[0];
  return { ...value, country: selected.code, callingCode: selected.callingCode };
}

/** Kept for compatibility with older callers/tests. */
export function formatPhoneValue(input: string, country: string): PhoneValue {
  return { ...selectCountry(createEmptyPhoneValue(), country), number: cleanNumber(input) };
}

export function cleanNumber(input: string) {
  return input.replace(/[^\d\s().-]/g, '').replace(/\s+/g, ' ').trimStart();
}

export function phoneValueFromStored(value: string | null | undefined, country: string = DEFAULT_COUNTRY): PhoneValue {
  const empty = createEmptyPhoneValue(country);
  if (!value) return empty;
  const trimmed = value.trim();

  // Stored format: "+33 612345678" (code, space, number).
  const spaced = trimmed.match(/^(\+\d{1,4})\s+(.*)$/);
  const compact = trimmed.replace(/\s+/g, '');
  let callingCode = '';
  let number = '';

  if (spaced) {
    callingCode = spaced[1];
    number = spaced[2].trim();
  } else if (compact.startsWith('+')) {
    const known = MAIN_COUNTRIES.map((entry) => entry.callingCode)
      .sort((left, right) => right.length - left.length)
      .find((code) => compact.startsWith(code));
    if (known) {
      callingCode = known;
      number = compact.slice(known.length);
    } else {
      const generic = compact.match(/^(\+\d{1,3})(\d*)$/);
      if (!generic) return { ...empty, number: trimmed };
      callingCode = generic[1];
      number = generic[2];
    }
  } else {
    return { ...empty, number: trimmed };
  }

  const linked = MAIN_COUNTRIES.find((entry) => entry.callingCode === callingCode);
  return { country: linked ? linked.code : OTHER_COUNTRY, callingCode, number };
}

export function getPhoneStorageValue(value: PhoneValue) {
  const code = normalizeCallingCode(value.callingCode);
  const number = value.number.replace(/\s+/g, ' ').trim();
  if (!number) return '';
  return `${code} ${number}`.trim();
}

export function validatePhoneValue(value: PhoneValue, required = false): PhoneError | null {
  if (!value.number.trim()) return required ? 'required' : null;
  if (!/^\+\d{1,4}$/.test(normalizeCallingCode(value.callingCode))) return 'invalidCode';
  const digits = value.number.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 14) return 'invalid';
  return null;
}
