'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Languages, MapPin, Search } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { Stars } from '@/components/star-rating';
import LanguageCheckboxes from '@/components/language-checkboxes';
import { Avatar, Button, EmptyState, ErrorBanner, LoadingState, Select, TextInput } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { matchesAvailabilityFilter, normalizePeriod, type AvailabilityFilter } from '@/lib/availability';
import { describeAvailability } from '@/lib/availability-format';
import { friendlyError } from '@/lib/errors';
import { formatNumber, interpolate, languageName, formatList } from '@/lib/i18n/format';
import { localizeBoatType, localizeZone } from '@/lib/i18n/options';
import { resolveAvatarUrls } from '@/lib/media';
import { isRecruiterRole } from '@/lib/onboarding';
import { normalizeProfileCertifications } from '@/lib/profile';
import { EXPERIENCE_RANGES, NAVIGATION_ZONES, PRIMARY_LANGUAGE_CODES, SKIPPER_BOAT_TYPES, profileExperienceRange } from '@/lib/profile-options';
import type { Profile } from '@/lib/database.types';

const AVAILABILITY_FILTERS: AvailabilityFilter[] = ['immediate', 'season', 'from_date', 'range', 'unavailable'];

export default function SkippersDirectoryPage() {
  const router = useRouter();
  const { copy, locale } = useLocale();
  const [skippers, setSkippers] = useState<Profile[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [ratings, setRatings] = useState<Record<string, { average: number; count: number }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [zone, setZone] = useState('all');
  const [experience, setExperience] = useState('all');
  const [availability, setAvailability] = useState<AvailabilityFilter>('all');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [languages, setLanguages] = useState<string[]>([]);
  const [boat, setBoat] = useState('all');

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login?next=/skippers');
        return;
      }
      const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      // The directory is reserved to owners, brokers and agencies (also enforced by middleware + RLS).
      if (!me || !isRecruiterRole(me.role)) {
        router.replace('/dashboard');
        return;
      }
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*, availability_slots(*)')
        .eq('role', 'skipper')
        .order('created_at', { ascending: false });
      if (fetchError) {
        setError(friendlyError(copy, fetchError));
        setLoading(false);
        return;
      }
      const rows = (data as Profile[]) || [];
      setSkippers(rows);
      if (rows.length) {
        const [urls, { data: reviewRows }] = await Promise.all([
          resolveAvatarUrls(supabase, rows),
          supabase.from('reviews').select('reviewee_id, rating').in('reviewee_id', rows.map((row) => row.id)),
        ]);
        setAvatars(urls);
        const totals: Record<string, { total: number; count: number }> = {};
        for (const row of (reviewRows as Array<{ reviewee_id: string; rating: number }>) || []) {
          totals[row.reviewee_id] = { total: (totals[row.reviewee_id]?.total || 0) + row.rating, count: (totals[row.reviewee_id]?.count || 0) + 1 };
        }
        setRatings(Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, { average: value.total / value.count, count: value.count }])));
      }
      setLoading(false);
    })();
  }, [copy, router]);

  const period = useMemo(() => normalizePeriod(periodStart, periodEnd), [periodStart, periodEnd]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return skippers.filter((skipper) => {
      if (zone !== 'all' && !(skipper.zones || []).includes(zone)) return false;
      if (experience !== 'all' && profileExperienceRange(skipper) !== experience) return false;
      if (boat !== 'all' && !(skipper.boat_types || []).includes(boat)) return false;
      if (languages.length && !languages.every((code) => (skipper.languages || []).includes(code))) return false;
      if (!matchesAvailabilityFilter(skipper, availability, period)) return false;
      if (!needle) return true;
      return [skipper.full_name, skipper.city, skipper.permits, skipper.bio, ...normalizeProfileCertifications(skipper.certifications).map((cert) => cert.name)]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [skippers, zone, experience, boat, languages, availability, period, query]);

  const hasFilters = query.trim() !== '' || zone !== 'all' || experience !== 'all' || availability !== 'all' || boat !== 'all' || languages.length > 0 || Boolean(period);

  function reset() {
    setQuery('');
    setZone('all');
    setExperience('all');
    setAvailability('all');
    setPeriodStart('');
    setPeriodEnd('');
    setLanguages([]);
    setBoat('all');
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="font-display mb-1 text-3xl font-bold text-marine">{copy.skippers.title}</h1>
      <p className="mb-6 text-sm text-gray-500">{interpolate(copy.common.results, { count: filtered.length })}</p>

      <div className="mb-8 space-y-3">
        <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 focus-within:border-navy focus-within:ring-2 focus-within:ring-navy/15">
          <Search size={16} className="shrink-0 text-gray-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.skippers.queryPlaceholder} aria-label={copy.skippers.queryPlaceholder} className="w-full bg-transparent text-[15px] outline-none" />
        </label>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterBox label={copy.skippers.zone}>
            <Select value={zone} onChange={(event) => setZone(event.target.value)}>
              <option value="all">{copy.common.all}</option>
              {NAVIGATION_ZONES.map((value) => <option key={value} value={value}>{localizeZone(copy, value)}</option>)}
            </Select>
          </FilterBox>
          <FilterBox label={copy.skippers.experience}>
            <Select value={experience} onChange={(event) => setExperience(event.target.value)}>
              <option value="all">{copy.common.all}</option>
              {EXPERIENCE_RANGES.map((range) => <option key={range} value={range}>{copy.experience.filterRanges[range]}</option>)}
            </Select>
          </FilterBox>
          <FilterBox label={copy.skippers.availability}>
            <Select value={availability} onChange={(event) => setAvailability(event.target.value as AvailabilityFilter)}>
              <option value="all">{copy.common.all}</option>
              {AVAILABILITY_FILTERS.map((value) => <option key={value} value={value}>{copy.availability.statuses[value]}</option>)}
            </Select>
          </FilterBox>
          <FilterBox label={copy.skippers.boatType}>
            <Select value={boat} onChange={(event) => setBoat(event.target.value)}>
              <option value="all">{copy.common.allMasculine}</option>
              {SKIPPER_BOAT_TYPES.map((value) => <option key={value} value={value}>{localizeBoatType(copy, value)}</option>)}
            </Select>
          </FilterBox>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <FilterBox label={copy.skippers.period} group>
            <div className="grid grid-cols-2 gap-2">
              <TextInput type="date" aria-label={copy.skippers.periodFrom} value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
              <TextInput type="date" aria-label={copy.skippers.periodTo} min={periodStart || undefined} value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
            </div>
          </FilterBox>
          <FilterBox label={copy.skippers.languages} group>
            <LanguageCheckboxes selected={languages} onChange={setLanguages} codes={PRIMARY_LANGUAGE_CODES} compact />
          </FilterBox>
        </div>

        {hasFilters && (
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            {copy.common.resetFilters}
          </Button>
        )}
      </div>

      <ErrorBanner message={error} />
      {loading ? (
        <LoadingState label={copy.common.loading} />
      ) : filtered.length === 0 ? (
        <EmptyState text={copy.skippers.noResult} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((skipper) => {
            const range = profileExperienceRange(skipper);
            const rating = ratings[skipper.id];
            const availabilityLines = describeAvailability(copy, locale, skipper);
            return (
              <Link key={skipper.id} href={`/skippers/${skipper.id}`} className="lift-card flex flex-col rounded-2xl border border-navy/[0.08] bg-white p-5">
                <div className="mb-4 flex items-center gap-3">
                  <Avatar name={skipper.full_name} url={avatars[skipper.id]} size={64} />
                  <div className="min-w-0">
                    <h2 className="truncate text-[16px] font-bold text-marine">{skipper.full_name}</h2>
                    <p className="text-sm font-medium text-navy">{range ? copy.experience.ranges[range] : copy.common.notSpecified}</p>
                    {rating ? (
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                        <Stars rating={rating.average} size={13} /> <bdi>{interpolate(copy.skippers.rating, { average: formatNumber(rating.average, locale, 1), count: rating.count })}</bdi>
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-gray-400">{copy.skippers.noReviews}</p>
                    )}
                  </div>
                </div>
                <ul className="space-y-1.5 text-sm text-gray-600">
                  <li className="font-medium text-anthracite">{availabilityLines[0]}</li>
                  {availabilityLines.length > 1 && <li className="truncate text-xs text-gray-500">{availabilityLines[1]}</li>}
                  {(skipper.languages || []).length > 0 && (
                    <li className="flex items-start gap-2"><Languages size={14} className="mt-0.5 shrink-0 text-gray-400" /> {formatList((skipper.languages || []).map((code) => languageName(code, locale)), locale)}</li>
                  )}
                  {(skipper.zones || []).length > 0 && (
                    <li className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 shrink-0 text-gray-400" /> {formatList((skipper.zones || []).slice(0, 3).map((value) => localizeZone(copy, value)), locale)}</li>
                  )}
                </ul>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}

function FilterBox({ label, children, group = false }: { label: string; children: React.ReactNode; group?: boolean }) {
  const Wrapper = group ? 'fieldset' : 'label';
  const Title = group ? 'legend' : 'span';
  return (
    <Wrapper className="block min-w-0 rounded-2xl border border-navy/[0.08] bg-white p-3">
      <Title className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">{label}</Title>
      {children}
    </Wrapper>
  );
}
