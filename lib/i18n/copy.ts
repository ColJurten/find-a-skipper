import { DEFAULT_LOCALE, resolveLocale, type SupportedLocale } from '@/lib/i18n/locales';
import fr, { type Messages } from '@/lib/i18n/messages/fr';
import en from '@/lib/i18n/messages/en';
import es from '@/lib/i18n/messages/es';
import it from '@/lib/i18n/messages/it';
import de from '@/lib/i18n/messages/de';
import nl from '@/lib/i18n/messages/nl';
import ru from '@/lib/i18n/messages/ru';
import ar from '@/lib/i18n/messages/ar';

export type { Messages };

export const dictionaries: Record<SupportedLocale, Messages> = { fr, en, es, it, de, nl, ru, ar };

export function getCopy(locale: SupportedLocale = DEFAULT_LOCALE): Messages {
  return dictionaries[resolveLocale(locale)];
}
