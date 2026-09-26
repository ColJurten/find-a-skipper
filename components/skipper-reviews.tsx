'use client';

import { useState } from 'react';
import { useLocale } from '@/components/LocaleProvider';
import { Stars } from '@/components/star-rating';
import { formatDateForLocale, formatNumber, interpolate } from '@/lib/i18n/format';
import type { Review } from '@/lib/database.types';

export type ReviewWithContext = Review & { reviewerName: string; missionLabel: string | null };

export function reviewSummary(reviews: Pick<Review, 'rating'>[]) {
  if (reviews.length === 0) return null;
  return { average: reviews.reduce((total, review) => total + review.rating, 0) / reviews.length, count: reviews.length };
}

const INITIAL_VISIBLE = 3;

/** Average, number of reviews and comments — compact so that it does not overload the profile. */
export default function SkipperReviews({ reviews, title }: { reviews: ReviewWithContext[]; title?: string }) {
  const { copy, locale } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const summary = reviewSummary(reviews);
  const visible = expanded ? reviews : reviews.slice(0, INITIAL_VISIBLE);

  return (
    <section className="mt-6 rounded-2xl border border-navy/[0.08] bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-marine">{title || copy.skipperProfile.reviews}</h2>
        {summary && (
          <div className="flex items-center gap-2">
            <Stars rating={summary.average} size={18} />
            <bdi dir="ltr" className="text-lg font-bold text-marine">{interpolate(copy.skipperProfile.average, { average: formatNumber(summary.average, locale, 1) })}</bdi>
            <span className="text-sm text-gray-500">· {interpolate(copy.skipperProfile.reviewsCount, { count: summary.count })}</span>
          </div>
        )}
      </div>
      {!summary ? (
        <p className="text-sm text-gray-500">{copy.skipperProfile.noReviews}</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((review) => (
            <li key={review.id} className="rounded-xl bg-offwhite p-4">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <Stars rating={review.rating} size={14} />
                <span className="text-xs text-gray-500">{formatDateForLocale(review.created_at, locale)}</span>
              </div>
              {review.comment && <p dir="auto" className="text-sm italic text-anthracite">{review.comment}</p>}
              <p className="mt-1 text-xs text-gray-500">
                {[review.reviewerName, review.missionLabel ? interpolate(copy.skipperProfile.reviewMission, { route: review.missionLabel }) : null].filter(Boolean).join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      )}
      {reviews.length > INITIAL_VISIBLE && (
        <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-3 text-sm font-semibold text-marine underline">
          {expanded ? '−' : `+${reviews.length - INITIAL_VISIBLE}`}
        </button>
      )}
    </section>
  );
}
