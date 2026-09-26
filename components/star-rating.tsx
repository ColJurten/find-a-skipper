'use client';

import { Star } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { interpolate } from '@/lib/i18n/format';

export function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  const { copy } = useLocale();
  const rounded = Math.round(rating * 2) / 2;
  return (
    <span className="inline-flex items-center gap-0.5" dir="ltr" role="img" aria-label={interpolate(copy.reviews.stars, { rating: rounded })}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          size={size}
          className={value <= rating + 0.25 ? 'fill-gold text-gold' : 'fill-transparent text-gray-300'}
        />
      ))}
    </span>
  );
}

export function StarInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const { copy } = useLocale();
  return (
    <div className="flex items-center gap-1" dir="ltr" role="radiogroup">
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          type="button"
          role="radio"
          aria-checked={value === rating}
          aria-label={interpolate(copy.reviews.select, { rating })}
          onClick={() => onChange(rating)}
          className="rounded-md p-1 transition hover:scale-110"
        >
          <Star size={28} className={rating <= value ? 'fill-gold text-gold' : 'fill-transparent text-gray-300'} />
        </button>
      ))}
    </div>
  );
}
