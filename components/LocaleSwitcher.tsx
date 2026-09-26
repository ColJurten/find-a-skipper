'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Globe } from 'lucide-react';
import { LOCALES } from '@/lib/i18n/locales';
import { useLocale } from '@/components/LocaleProvider';

export default function LocaleSwitcher() {
  const { locale, setLocale, copy } = useLocale();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const current = LOCALES.find((entry) => entry.code === locale);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-lg border border-navy/10 bg-white px-3 py-2 text-sm font-semibold text-marine hover:bg-lightblue"
        aria-label={copy.localeSwitcher.ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Globe size={16} />
        <span className="hidden sm:inline">{current?.label}</span>
        <span className="sm:hidden">{locale.toUpperCase()}</span>
      </button>
      {open && (
        <ul role="listbox" className="absolute end-0 z-40 mt-2 w-52 rounded-2xl border border-navy/[0.08] bg-white p-2 shadow-xl">
          {LOCALES.map((item) => (
            <li key={item.code}>
              <button
                type="button"
                role="option"
                aria-selected={locale === item.code}
                lang={item.code}
                dir={item.dir}
                onClick={() => {
                  setLocale(item.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-start text-sm ${locale === item.code ? 'bg-lightblue text-marine' : 'text-anthracite hover:bg-offwhite'}`}
              >
                <span>{item.flag} {item.label}</span>
                {locale === item.code && <Check size={14} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
