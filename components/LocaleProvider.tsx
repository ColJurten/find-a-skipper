'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCopy, type Messages } from '@/lib/i18n/copy';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, localeDirection, type SupportedLocale } from '@/lib/i18n/locales';

type LocaleContextValue = {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  copy: Messages;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ initialLocale, children }: { initialLocale: SupportedLocale; children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(initialLocale || DEFAULT_LOCALE);
  const router = useRouter();

  const setLocale = useCallback((nextLocale: SupportedLocale) => {
    document.cookie = `${LOCALE_COOKIE_NAME}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    // Apply language + direction immediately; server components re-render on refresh.
    document.documentElement.lang = nextLocale;
    document.documentElement.dir = localeDirection(nextLocale);
    setLocaleState(nextLocale);
    router.refresh();
  }, [router]);

  const value = useMemo(() => ({ locale, setLocale, copy: getCopy(locale) }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used inside LocaleProvider');
  }
  return context;
}
