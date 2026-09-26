'use client';

import { Check } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { languageName } from '@/lib/i18n/format';
import { LANGUAGE_CODES } from '@/lib/profile-options';

/** Multi-selection of spoken languages (ISO codes), no limit on the number of languages. */
export default function LanguageCheckboxes({
  selected,
  onChange,
  codes = LANGUAGE_CODES,
  compact = false,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  codes?: readonly string[];
  compact?: boolean;
}) {
  const { locale } = useLocale();

  function toggle(code: string) {
    onChange(selected.includes(code) ? selected.filter((entry) => entry !== code) : [...selected, code]);
  }

  return (
    <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
      {codes.map((code) => {
        const active = selected.includes(code);
        return (
          <label
            key={code}
            className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
              active ? 'border-marine bg-marine text-white' : 'border-gray-200 bg-white text-anthracite hover:border-marine/40'
            }`}
          >
            <input type="checkbox" className="sr-only" checked={active} onChange={() => toggle(code)} />
            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${active ? 'border-white bg-white text-marine' : 'border-gray-300'}`}>
              {active && <Check size={12} strokeWidth={3} />}
            </span>
            <span className="truncate">{languageName(code, locale)}</span>
          </label>
        );
      })}
    </div>
  );
}
