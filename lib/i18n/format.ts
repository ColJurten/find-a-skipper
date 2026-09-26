import { intlLocale, type SupportedLocale } from '@/lib/i18n/locales';

/** Replaces `{name}` placeholders in a translated string. */
export function interpolate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

function parseDate(value: string) {
  // Plain dates (YYYY-MM-DD) are calendar days: format them at noon UTC so that no
  // timezone can shift them to the previous or next day.
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateForLocale(
  value: string,
  locale: SupportedLocale,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }
) {
  const parsed = parseDate(value);
  if (!parsed) return value;
  const timeZone = /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'UTC' : undefined;
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone, ...options }).format(parsed);
}

export function formatDateTimeForLocale(
  value: string,
  locale: SupportedLocale,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
) {
  const parsed = parseDate(value);
  if (!parsed) return value;
  return new Intl.DateTimeFormat(intlLocale(locale), options).format(parsed);
}

/** Short relative stamp for message lists: time today, weekday this week, date otherwise. */
export function formatConversationStamp(value: string, locale: SupportedLocale, now = new Date()) {
  const parsed = parseDate(value);
  if (!parsed) return '';
  const sameDay = parsed.toDateString() === now.toDateString();
  if (sameDay) return formatDateTimeForLocale(value, locale, { hour: '2-digit', minute: '2-digit' });
  const ageDays = (now.getTime() - parsed.getTime()) / 86_400_000;
  if (ageDays < 6) return formatDateTimeForLocale(value, locale, { weekday: 'short' });
  return formatDateTimeForLocale(value, locale, { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function formatNumber(value: number, locale: SupportedLocale, maximumFractionDigits = 2) {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits }).format(value);
}

export const CURRENCY_SYMBOLS = { EUR: '€', USD: '$' } as const;
export type Currency = keyof typeof CURRENCY_SYMBOLS;

/** "350 €" / "400 $" — the amount first, as requested for every locale. */
export function formatMoney(amount: number, currency: Currency, locale: SupportedLocale) {
  return `${formatNumber(amount, locale)} ${CURRENCY_SYMBOLS[currency] ?? currency}`;
}

/** Capitalised language name in the UI language, e.g. ("ru", "fr") → "Russe". */
export function languageName(code: string, locale: SupportedLocale) {
  try {
    const name = new Intl.DisplayNames([intlLocale(locale)], { type: 'language' }).of(code);
    if (!name || name === code) return code.toUpperCase();
    return name.charAt(0).toLocaleUpperCase(intlLocale(locale)) + name.slice(1);
  } catch {
    return code.toUpperCase();
  }
}

/** Locale-aware list: "Français, Anglais, Russe" / "الفرنسية، الإنجليزية، الروسية". */
export function formatList(items: string[], locale: SupportedLocale) {
  try {
    return new Intl.ListFormat(intlLocale(locale), { style: 'narrow', type: 'unit' }).format(items);
  } catch {
    return items.join(', ');
  }
}
