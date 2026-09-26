'use client';

import { ChevronDown } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { MAIN_COUNTRIES, OTHER_COUNTRY, cleanNumber, selectCountry, type PhoneValue } from '@/lib/phone';

const controlClass =
  'rounded-[10px] border border-gray-200 bg-white px-3 py-2.5 text-[15px] outline-none focus:border-navy focus:ring-2 focus:ring-navy/15';

/**
 * "+33 | 6 12 34 56 78": a short list of the main countries, an "other" option to type any
 * calling code manually, and the number in a separate field. Always rendered left-to-right.
 */
export default function PhoneInput({
  value,
  onChange,
  required = false,
  id,
}: {
  value: PhoneValue;
  onChange: (value: PhoneValue) => void;
  required?: boolean;
  id?: string;
}) {
  const { copy } = useLocale();
  const isOther = value.country === OTHER_COUNTRY;
  const selected = MAIN_COUNTRIES.find((country) => country.code === value.country);

  return (
    <div dir="ltr" className="flex gap-2">
      {/* The native select stays invisible on top of a compact "🇫🇷 +33" display. */}
      <div className={`${controlClass} relative flex w-[6.25rem] shrink-0 items-center justify-between gap-1 focus-within:border-navy focus-within:ring-2 focus-within:ring-navy/15`}>
        <span className="truncate">{isOther ? '+…' : `${selected?.flag ?? ''} ${selected?.callingCode ?? ''}`}</span>
        <ChevronDown size={14} className="shrink-0 text-gray-400" />
        <select
          aria-label={copy.phone.code}
          value={isOther ? OTHER_COUNTRY : value.country}
          onChange={(event) => onChange(selectCountry(value, event.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        >
          {MAIN_COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.flag} {copy.phone.countries[country.code]} ({country.callingCode})
            </option>
          ))}
          <option value={OTHER_COUNTRY}>{copy.phone.otherCode}</option>
        </select>
      </div>
      {isOther && (
        <input
          aria-label={copy.phone.customCodeLabel}
          inputMode="tel"
          autoComplete="tel-country-code"
          placeholder="+971"
          value={value.callingCode}
          onChange={(event) => {
            const digits = event.target.value.replace(/[^\d]/g, '').slice(0, 4);
            onChange({ ...value, callingCode: digits ? `+${digits}` : '' });
          }}
          className={`${controlClass} w-[5.5rem] shrink-0`}
        />
      )}
      <input
        id={id}
        type="tel"
        aria-label={copy.phone.number}
        inputMode="tel"
        autoComplete="tel-national"
        required={required}
        value={value.number}
        onChange={(event) => onChange({ ...value, number: cleanNumber(event.target.value) })}
        placeholder={copy.phone.placeholder}
        className={`${controlClass} min-w-0 flex-1`}
      />
    </div>
  );
}
