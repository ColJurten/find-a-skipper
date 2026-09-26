'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, MessageCircle } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { Stars, StarInput } from '@/components/star-rating';
import { Avatar, Badge, Button, EmptyState, ErrorBanner, Field, LoadingState, SuccessBanner, TextArea } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { buildVerifyEmailPath, isEmailVerified } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { formatDateForLocale, interpolate } from '@/lib/i18n/format';
import { localizeMissionType, localizeZone } from '@/lib/i18n/options';
import { resolveAvatarUrls } from '@/lib/media';
import { missionRoute } from '@/lib/mission';
import { missionDatesLabel, missionPayLabel } from '@/lib/mission-format';
import type { Application, Mission, Profile, Review } from '@/lib/database.types';

type ApplicationRow = Application & { profiles?: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null };

export default function MissionManagePage() {
  const { copy, locale } = useLocale();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [mission, setMission] = useState<Mission | null>(null);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [error, setError] = useState('');
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const [{ data: missionData }, { data: apps }] = await Promise.all([
      supabase.from('missions').select('*').eq('id', id).maybeSingle(),
      supabase.from('applications').select('*, profiles:skipper_id(id, full_name, avatar_url)').eq('mission_id', id).order('applied_at', { ascending: true }),
    ]);
    setMission((missionData as Mission | null) || null);
    const rows = (apps as unknown as ApplicationRow[]) || [];
    setApplications(rows);
    setAvatars(await resolveAvatarUrls(supabase, rows.map((row) => ({ id: row.skipper_id, avatar_url: row.profiles?.avatar_url }))));
  }, [id]);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace(`/login?next=/my-missions/${id}`);
        return;
      }
      if (!isEmailVerified(user)) {
        router.replace(buildVerifyEmailPath(user.email || null, `/my-missions/${id}`));
        return;
      }
      setViewerId(user.id);
      const { data: missionData } = await supabase.from('missions').select('poster_id').eq('id', id).maybeSingle();
      if (!missionData || missionData.poster_id !== user.id) {
        setError(copy.errors.accessDenied);
        setLoading(false);
        return;
      }
      await refresh();
      const { data: review } = await supabase.from('reviews').select('*').eq('mission_id', id).eq('reviewer_id', user.id).maybeSingle();
      setMyReview((review as Review | null) || null);
      setLoading(false);
    })();
  }, [copy, id, refresh, router]);

  async function run(key: string, action: () => PromiseLike<{ error: unknown }>) {
    setError('');
    setBusy(key);
    const { error: actionError } = await action();
    setBusy(null);
    if (actionError) {
      setError(friendlyError(copy, actionError));
      return false;
    }
    await refresh();
    return true;
  }

  const supabase = createClient();
  const updateApplication = (applicationId: string, status: 'accepted' | 'rejected') =>
    run(`${applicationId}-${status}`, () => supabase.from('applications').update({ status }).eq('id', applicationId));
  const updateMission = (status: 'completed' | 'cancelled') =>
    run(status, () => supabase.from('missions').update({ status }).eq('id', id)).then(() => setConfirmingCancel(false));

  async function openConversation(skipperId: string) {
    if (!viewerId) return;
    setBusy(`msg-${skipperId}`);
    const { data: existing } = await supabase.from('conversations').select('id').eq('mission_id', id).eq('skipper_id', skipperId).maybeSingle();
    let conversationId = existing?.id as string | undefined;
    if (!conversationId) {
      const { data: created, error: createError } = await supabase
        .from('conversations')
        .insert({ mission_id: id, demandeur_id: viewerId, skipper_id: skipperId })
        .select('id')
        .single();
      if (createError || !created) {
        setBusy(null);
        setError(createError ? friendlyError(copy, createError) : copy.messaging.stale);
        return;
      }
      conversationId = created.id;
    }
    router.push(`/messages?conversation=${conversationId}`);
  }

  async function submitReview() {
    const accepted = applications.find((application) => application.status === 'accepted');
    if (!mission || !viewerId || !accepted) return;
    setError('');
    setBusy('review');
    const { data, error: insertError } = await supabase
      .from('reviews')
      .insert({ mission_id: mission.id, reviewer_id: viewerId, reviewee_id: accepted.skipper_id, rating, comment: comment.trim() || null })
      .select('*')
      .single();
    setBusy(null);
    if (insertError) {
      setError((insertError as { code?: string }).code === '23505' ? copy.missionManage.review.already : friendlyError(copy, insertError));
      return;
    }
    setMyReview(data as Review);
    setReviewMessage(copy.missionManage.review.published);
  }

  if (loading) return <LoadingState label={copy.common.loading} />;
  if (!mission) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <BackLink label={copy.missionManage.back} />
        <ErrorBanner message={error || copy.errors.notFound} />
      </main>
    );
  }

  const accepted = applications.find((application) => application.status === 'accepted') || null;
  const statusTone = (status: Application['status']) => (status === 'accepted' ? 'success' : status === 'rejected' ? 'danger' : status === 'withdrawn' ? 'muted' : 'warning');

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <BackLink label={copy.missionManage.back} />

      <section className="mb-6 rounded-2xl border border-navy/[0.08] bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge>{localizeMissionType(copy, mission.type)}</Badge>
          <Badge tone={mission.status === 'open' ? 'success' : 'muted'}>{copy.missions.statuses[mission.status]}</Badge>
        </div>
        <h1 className="font-display mb-2 text-2xl font-bold text-marine">{missionRoute(mission)}</h1>
        <p className="flex items-center gap-2 text-sm text-gray-600"><CalendarDays size={14} className="text-gray-400" /> {missionDatesLabel(copy, locale, mission)} · {localizeZone(copy, mission.zone)}</p>
        <p className="mt-1 text-sm font-semibold text-marine">{missionPayLabel(copy, locale, mission)}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/missions/${mission.id}`} className="rounded-lg px-3 py-2 text-sm font-semibold text-marine underline">{copy.missionManage.viewPublic}</Link>
          {mission.status === 'assigned' && (
            <Button type="button" size="sm" loading={busy === 'completed'} onClick={() => updateMission('completed')}>
              {copy.missionManage.markCompleted}
            </Button>
          )}
          {(mission.status === 'open' || mission.status === 'assigned') && (
            confirmingCancel ? (
              <Button type="button" variant="danger" size="sm" loading={busy === 'cancelled'} onClick={() => updateMission('cancelled')}>
                {copy.missionManage.confirmCancel}
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirmingCancel(true)}>
                {copy.missionManage.cancelMission}
              </Button>
            )
          )}
        </div>
      </section>

      <ErrorBanner message={error} />

      <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.12em] text-gray-500">{copy.missionManage.applicants}</h2>
      {applications.length === 0 ? (
        <EmptyState text={copy.missionManage.noApplicants} />
      ) : (
        <ul className="space-y-3">
          {applications.map((application) => {
            const name = application.profiles?.full_name || copy.roles.skipper;
            const canTalk = application.status === 'pending' || application.status === 'accepted';
            return (
              <li key={application.id} className="rounded-2xl border border-navy/[0.08] bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={name} url={avatars[application.skipper_id]} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{name}</p>
                    <p className="text-xs text-gray-500">{interpolate(copy.applications.appliedOn, { date: formatDateForLocale(application.applied_at, locale) })}</p>
                  </div>
                  <Badge tone={statusTone(application.status)}>{copy.missionManage.applicationStatuses[application.status]}</Badge>
                </div>
                {application.message && <p className="mt-3 whitespace-pre-line text-sm text-gray-700">{application.message}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/skippers/${application.skipper_id}`} className="inline-flex min-h-[40px] items-center rounded-xl border border-gray-200 px-3.5 py-2 text-sm font-semibold text-marine hover:bg-lightblue">
                    {copy.missionManage.viewProfile}
                  </Link>
                  {canTalk && (
                    <Button type="button" variant="outline" size="sm" loading={busy === `msg-${application.skipper_id}`} onClick={() => openConversation(application.skipper_id)}>
                      <MessageCircle size={15} /> {copy.missionManage.message}
                    </Button>
                  )}
                  {application.status === 'pending' && mission.status === 'open' && (
                    <>
                      <Button type="button" size="sm" loading={busy === `${application.id}-accepted`} onClick={() => updateApplication(application.id, 'accepted')}>
                        {copy.missionManage.accept}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" loading={busy === `${application.id}-rejected`} onClick={() => updateApplication(application.id, 'rejected')}>
                        {copy.missionManage.reject}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {accepted && (
        <section className="mt-8 rounded-2xl border border-navy/[0.08] bg-white p-5">
          <h2 className="font-display mb-3 text-lg font-bold text-marine">{copy.missionManage.review.title}</h2>
          <SuccessBanner message={reviewMessage} />
          {mission.status !== 'completed' ? (
            <p className="text-sm text-gray-500">{copy.missionManage.review.afterCompletion}</p>
          ) : myReview ? (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{copy.missionManage.review.yourReview}</p>
              <Stars rating={myReview.rating} size={18} />
              {myReview.comment && <p className="mt-2 text-sm italic text-gray-700">{myReview.comment}</p>}
            </div>
          ) : (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{copy.missionManage.review.rating}</p>
              <StarInput value={rating} onChange={setRating} />
              <p className="mb-4 mt-1 text-sm text-gray-500">{interpolate(copy.missionManage.review.ratingValue, { rating })}</p>
              <Field label={copy.missionManage.review.comment} optionalLabel={copy.common.optional}>
                <TextArea value={comment} maxLength={1000} placeholder={copy.missionManage.review.commentPlaceholder} onChange={(event) => setComment(event.target.value)} />
              </Field>
              <Button type="button" loading={busy === 'review'} onClick={submitReview}>
                {copy.missionManage.review.submit}
              </Button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link href="/my-missions" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-marine">
      <ArrowLeft size={15} className="rtl:rotate-180" /> {label}
    </Link>
  );
}
