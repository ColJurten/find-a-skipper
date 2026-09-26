'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import SkipperReviews, { type ReviewWithContext } from '@/components/skipper-reviews';
import { Avatar, ErrorBanner, LoadingState } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { describeAvailability } from '@/lib/availability-format';
import { friendlyError } from '@/lib/errors';
import { languageName, formatList } from '@/lib/i18n/format';
import { localizeBoatType, localizeZone } from '@/lib/i18n/options';
import { displayName, fetchProfileCards, resolveAvatarUrl } from '@/lib/media';
import { missionRoute } from '@/lib/mission';
import { isRecruiterRole } from '@/lib/onboarding';
import { normalizeProfileCertifications } from '@/lib/profile';
import { profileExperienceRange } from '@/lib/profile-options';
import type { Mission, Profile, Review } from '@/lib/database.types';

export default function SkipperProfilePage() {
  const { copy, locale } = useLocale();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [skipper, setSkipper] = useState<Profile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ReviewWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace(`/login?next=/skippers/${id}`);
        return;
      }
      const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      // Skipper profiles are reserved to owners, brokers and agencies (also enforced by RLS).
      if (!me || (!isRecruiterRole(me.role) && me.role !== 'admin')) {
        router.replace('/dashboard');
        return;
      }
      const { data, error: profileError } = await supabase.from('profiles').select('*, availability_slots(*)').eq('id', id).eq('role', 'skipper').maybeSingle();
      if (profileError || !data) {
        setError(profileError ? friendlyError(copy, profileError) : copy.skippers.noResult);
        setLoading(false);
        return;
      }
      const profile = data as Profile;
      setSkipper(profile);
      setAvatarUrl(await resolveAvatarUrl(supabase, profile.avatar_url));

      const { data: reviewRows } = await supabase
        .from('reviews')
        .select('*, missions(departure, destination)')
        .eq('reviewee_id', id)
        .order('created_at', { ascending: false });
      const rows = (reviewRows as unknown as Array<Review & { missions: Pick<Mission, 'departure' | 'destination'> | null }>) || [];
      const cards = await fetchProfileCards(supabase, rows.map((row) => row.reviewer_id));
      setReviews(rows.map((row) => ({ ...row, reviewerName: displayName(cards[row.reviewer_id]), missionLabel: row.missions ? missionRoute(row.missions) : null })));
      setLoading(false);
    })();
  }, [copy, id, router]);

  if (loading) return <LoadingState label={copy.common.loading} />;
  if (!skipper) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <BackLink label={copy.skipperProfile.back} />
        <ErrorBanner message={error || copy.skippers.noResult} />
      </main>
    );
  }

  const range = profileExperienceRange(skipper);
  const certifications = normalizeProfileCertifications(skipper.certifications).map((cert) => cert.name);
  const availabilityLines = describeAvailability(copy, locale, skipper);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <BackLink label={copy.skipperProfile.back} />

      <section className="mb-5 flex flex-col items-center gap-4 rounded-2xl border border-navy/[0.08] bg-white p-6 text-center sm:flex-row sm:text-start">
        <Avatar name={skipper.full_name} url={avatarUrl} size={120} className="border-4 border-lightblue" />
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-marine sm:text-3xl">{skipper.full_name}</h1>
          <p className="mt-1 font-medium text-navy">{range ? copy.experience.ranges[range] : copy.common.notSpecified}</p>
          {skipper.city && <p className="text-sm text-gray-500">{skipper.city}</p>}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <InfoCard title={copy.skipperProfile.languages}>
          {(skipper.languages || []).length ? formatList((skipper.languages || []).map((code) => languageName(code, locale)), locale) : copy.common.notSpecified}
        </InfoCard>
        <InfoCard title={copy.skipperProfile.availability}>
          <ul className="space-y-0.5">{availabilityLines.map((line) => <li key={line}>{line}</li>)}</ul>
        </InfoCard>
        <InfoCard title={copy.skipperProfile.zones}>
          {(skipper.zones || []).length ? formatList((skipper.zones || []).map((zone) => localizeZone(copy, zone)), locale) : copy.common.notSpecified}
        </InfoCard>
        <InfoCard title={copy.skipperProfile.boatTypes}>
          {(skipper.boat_types || []).length ? formatList((skipper.boat_types || []).map((boat) => localizeBoatType(copy, boat)), locale) : copy.common.notSpecified}
        </InfoCard>
        {(certifications.length > 0 || skipper.permits) && (
          <InfoCard title={copy.skipperProfile.qualifications} wide>
            <div className="flex flex-wrap gap-2">
              {certifications.map((name) => <span key={name} className="rounded-full bg-lightblue px-3 py-1 text-xs font-semibold text-marine">{name}</span>)}
            </div>
            {skipper.permits && <p className={certifications.length ? 'mt-2' : ''}>{skipper.permits}</p>}
          </InfoCard>
        )}
        {skipper.bio && (
          <InfoCard title={copy.skipperProfile.about} wide>
            <p dir="auto" className="whitespace-pre-line leading-7">{skipper.bio}</p>
          </InfoCard>
        )}
      </div>

      <SkipperReviews reviews={reviews} />
    </main>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link href="/skippers" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-marine">
      <ArrowLeft size={15} className="rtl:rotate-180" /> {label}
    </Link>
  );
}

function InfoCard({ title, children, wide = false }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`rounded-2xl border border-navy/[0.08] bg-white p-5 ${wide ? 'sm:col-span-2' : ''}`}>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-gray-500">{title}</h2>
      <div className="text-[15px] text-anthracite">{children}</div>
    </section>
  );
}
