'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, CheckCircle2, MapPin, Ship } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { Avatar, Badge, Button, ErrorBanner, LoadingState, buttonStyles } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { buildVerifyEmailPath, isEmailVerified } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { interpolate } from '@/lib/i18n/format';
import { localizeBoatType, localizeMissionType, localizeRole, localizeZone } from '@/lib/i18n/options';
import { displayName, fetchProfileCards, resolveAvatarUrl } from '@/lib/media';
import { missionRoute } from '@/lib/mission';
import { missionDatesLabel, missionHoursLong, missionPayLabel } from '@/lib/mission-format';
import type { Application, Mission, ProfileCard, Role } from '@/lib/database.types';

export default function MissionDetailPage() {
  const { copy, locale } = useLocale();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [mission, setMission] = useState<Mission | null>(null);
  const [poster, setPoster] = useState<ProfileCard | null>(null);
  const [posterAvatar, setPosterAvatar] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ id: string; role: Role; verified: boolean; email: string | null } | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [justApplied, setJustApplied] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: missionData, error: missionError } = await supabase.from('missions').select('*').eq('id', id).maybeSingle();
      if (missionError || !missionData) {
        setError(missionError ? friendlyError(copy, missionError) : copy.missions.noResult);
        setLoading(false);
        return;
      }
      const current = missionData as Mission;
      setMission(current);

      const [cards, { data: { user } }] = await Promise.all([fetchProfileCards(supabase, [current.poster_id]), supabase.auth.getUser()]);
      const posterCard = cards[current.poster_id] || null;
      setPoster(posterCard);

      if (user) {
        const { data: me } = await supabase.from('profiles').select('id, role').eq('id', user.id).maybeSingle();
        if (me) {
          setViewer({ id: me.id, role: me.role as Role, verified: isEmailVerified(user), email: user.email ?? null });
          if (me.role === 'skipper') {
            const { data: app } = await supabase.from('applications').select('*').eq('mission_id', id).eq('skipper_id', user.id).maybeSingle();
            setApplication((app as Application | null) || null);
          }
        }
        if (posterCard?.avatar_url) setPosterAvatar(await resolveAvatarUrl(supabase, posterCard.avatar_url));
      }
      setLoading(false);
    })();
  }, [copy, id]);

  function ensureVerified() {
    if (viewer && !viewer.verified) {
      router.push(buildVerifyEmailPath(viewer.email, `/missions/${id}`));
      return false;
    }
    return true;
  }

  async function apply() {
    if (!viewer || !ensureVerified()) return;
    setError('');
    setSubmitting(true);
    const supabase = createClient();
    const request = application?.status === 'withdrawn'
      ? supabase.from('applications').update({ status: 'pending' }).eq('id', application.id).select('*').single()
      : supabase.from('applications').insert({ mission_id: id, skipper_id: viewer.id }).select('*').single();
    const { data, error: applyError } = await request;
    setSubmitting(false);
    if (applyError) {
      setError(friendlyError(copy, applyError));
      return;
    }
    setApplication(data as Application);
    setJustApplied(true);
  }

  async function openMessaging() {
    if (!viewer || !mission || !ensureVerified()) return;
    setError('');
    const supabase = createClient();
    const { data: existing } = await supabase.from('conversations').select('id').eq('mission_id', mission.id).eq('skipper_id', viewer.id).maybeSingle();
    if (existing?.id) {
      router.push(`/messages?conversation=${existing.id}`);
      return;
    }
    const { data: created, error: createError } = await supabase
      .from('conversations')
      .insert({ mission_id: mission.id, skipper_id: viewer.id, demandeur_id: mission.poster_id })
      .select('id')
      .single();
    if (createError || !created) {
      setError(createError ? friendlyError(copy, createError) : copy.messaging.stale);
      return;
    }
    router.push(`/messages?conversation=${created.id}`);
  }

  if (loading) return <LoadingState label={copy.common.loading} />;
  if (!mission) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <BackLink label={copy.missionDetail.back} />
        <ErrorBanner message={error || copy.missions.noResult} />
      </main>
    );
  }

  const hours = missionHoursLong(copy, locale, mission);
  const isOwner = viewer?.id === mission.poster_id;
  const activeApplication = application && (application.status === 'pending' || application.status === 'accepted');

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <BackLink label={copy.missionDetail.back} />

      <header className="mb-6">
        <div className="mb-3 flex flex-wrap gap-2">
          <Badge>{localizeMissionType(copy, mission.type)}</Badge>
          {mission.status !== 'open' && <Badge tone="muted">{copy.missions.statuses[mission.status]}</Badge>}
        </div>
        <h1 className="font-display mb-3 text-2xl font-bold leading-tight text-marine sm:text-3xl">{missionRoute(mission)}</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
          <span className="inline-flex items-center gap-1.5"><MapPin size={14} /> {localizeZone(copy, mission.zone)}</span>
          <span className="inline-flex items-center gap-1.5"><Ship size={14} /> {localizeBoatType(copy, mission.boat_type)}</span>
        </div>
      </header>

      <ErrorBanner message={error} />

      <div className="space-y-4">
        <Section title={copy.missionDetail.description}>
          <p dir="auto" className="whitespace-pre-line text-[15px] leading-7 text-anthracite">{mission.description?.trim() || copy.missionDetail.noDescription}</p>
          {mission.requirements?.trim() && (
            <p className="mt-4 rounded-xl bg-offwhite px-4 py-3 text-sm">
              <span className="mb-0.5 block text-xs font-bold uppercase tracking-[0.12em] text-marine">{copy.missionDetail.permitRequired}</span>
              {mission.requirements}
            </p>
          )}
        </Section>

        <Section title={copy.missionDetail.dates}>
          <p className="flex items-center gap-2 text-[15px]"><CalendarDays size={16} className="text-gray-400" /> {missionDatesLabel(copy, locale, mission)}</p>
          {hours && <p className="mt-1 ps-6 text-sm text-gray-600">{hours}</p>}
        </Section>

        <Section title={copy.missionDetail.compensation}>
          <p className="text-xl font-bold text-marine">{missionPayLabel(copy, locale, mission)}</p>
          {mission.on_quote && <p className="mt-1 text-sm text-gray-500">{copy.missionDetail.onQuoteHint}</p>}
        </Section>

        {poster && (
          <Section title={copy.missionDetail.proposedBy}>
            <div className="flex items-center gap-3">
              <Avatar name={displayName(poster)} url={posterAvatar} size={48} />
              <div>
                <p className="font-semibold text-anthracite">{displayName(poster)}</p>
                <p className="text-sm text-gray-500">
                  {[localizeRole(copy, poster.role), displayName(poster) !== poster.full_name ? poster.full_name : null].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
          </Section>
        )}
      </div>

      <div className="mt-8">
        {justApplied && (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="mb-1 flex items-center gap-2 font-semibold"><CheckCircle2 size={16} /> {copy.missionDetail.applied}</p>
            <p>{copy.missionDetail.appliedText}</p>
          </div>
        )}

        {!viewer ? (
          mission.status === 'open' ? (
            <div className="space-y-3">
              <Link href="/signup?role=skipper" className={`flex w-full items-center justify-center rounded-xl px-5 py-3.5 text-[15px] font-bold ${buttonStyles.mission}`}>
                {copy.missionDetail.apply}
              </Link>
              <Link href={`/login?next=/missions/${mission.id}`} className="block text-center text-sm font-semibold text-marine underline">
                {copy.missionDetail.loginToApply}
              </Link>
            </div>
          ) : (
            <p className="text-center text-sm text-gray-500">{copy.missionDetail.closed}</p>
          )
        ) : isOwner ? (
          <Link href={`/my-missions/${mission.id}`} className={`flex w-full items-center justify-center rounded-xl px-5 py-3 text-[15px] font-bold ${buttonStyles.primary}`}>
            {copy.missionDetail.manage}
          </Link>
        ) : viewer.role !== 'skipper' ? (
          <p className="text-center text-sm text-gray-500">{copy.missionDetail.recruiterOnly}</p>
        ) : activeApplication ? (
          <div className="space-y-3">
            <p className="text-center text-sm font-semibold text-marine">
              {interpolate(copy.missionDetail.applicationStatus, { status: copy.applications.statuses[application.status] })}
            </p>
            <Button type="button" onClick={openMessaging} className="w-full">
              {copy.missionDetail.openMessaging}
            </Button>
            <Link href="/my-applications" className="block text-center text-sm font-semibold text-marine underline">
              {copy.missionDetail.myApplications}
            </Link>
          </div>
        ) : mission.status !== 'open' ? (
          <p className="text-center text-sm text-gray-500">{copy.missionDetail.closed}</p>
        ) : application?.status === 'rejected' ? (
          <p className="text-center text-sm text-gray-500">{interpolate(copy.missionDetail.applicationStatus, { status: copy.applications.statuses.rejected })}</p>
        ) : (
          <Button type="button" variant="mission" loading={submitting} onClick={apply} size="lg" className="w-full">
            {application?.status === 'withdrawn' ? copy.missionDetail.reapply : copy.missionDetail.apply}
          </Button>
        )}
      </div>
    </main>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link href="/missions" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-marine">
      <ArrowLeft size={15} className="rtl:rotate-180" /> {label}
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-navy/[0.08] bg-white p-5">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-gray-500">{title}</h2>
      {children}
    </section>
  );
}
