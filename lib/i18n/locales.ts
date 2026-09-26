export const LOCALE_COOKIE_NAME = 'fas-locale';
export const DEFAULT_LOCALE = 'fr';

// To add a language: add an entry here and a dictionary in lib/i18n/messages/<code>.ts
// (TypeScript then reports every missing key).
export const LOCALES = [
  { code: 'fr', flag: '🇫🇷', label: 'Français', intl: 'fr-FR', dir: 'ltr' },
  { code: 'en', flag: '🇬🇧', label: 'English', intl: 'en-GB', dir: 'ltr' },
  { code: 'es', flag: '🇪🇸', label: 'Español', intl: 'es-ES', dir: 'ltr' },
  { code: 'it', flag: '🇮🇹', label: 'Italiano', intl: 'it-IT', dir: 'ltr' },
  { code: 'de', flag: '🇩🇪', label: 'Deutsch', intl: 'de-DE', dir: 'ltr' },
  { code: 'nl', flag: '🇳🇱', label: 'Nederlands', intl: 'nl-NL', dir: 'ltr' },
  { code: 'ru', flag: '🇷🇺', label: 'Русский', intl: 'ru-RU', dir: 'ltr' },
  { code: 'ar', flag: '🇸🇦', label: 'العربية', intl: 'ar-u-nu-latn', dir: 'rtl' },
] as const;

export type SupportedLocale = (typeof LOCALES)[number]['code'];

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return LOCALES.some((locale) => locale.code === value);
}

export function resolveLocale(value: string | null | undefined): SupportedLocale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

export function localeDirection(locale: SupportedLocale): 'ltr' | 'rtl' {
  return LOCALES.find((entry) => entry.code === locale)?.dir ?? 'ltr';
}

export function intlLocale(locale: SupportedLocale) {
  return LOCALES.find((entry) => entry.code === locale)?.intl ?? 'fr-FR';
}
