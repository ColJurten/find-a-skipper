'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Lock } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { Stars, StarInput } from '@/components/star-rating';
import { Badge, Button, EmptyState, ErrorBanner, LoadingState, TextArea } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { friendlyError } from '@/lib/errors';
import { canWithdrawApplication, isCurrentApplication } from '@/lib/applications';
import { formatDateForLocale, interpolate } from '@/lib/i18n/format';
import { localizeMissionType, localizeZone } from '@/lib/i18n/options';
import { missionRoute } from '@/lib/mission';
import { missionDatesLabel } from '@/lib/mission-format';
import type { Application, Mission, Review } from '@/lib/database.types';

type Row = Application & { missions: Mission | null };

export default function MyApplicationsPage() {
  const { copy, locale } = useLocale();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<'current' | 'history'>('current');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});

  const load = useCallback(async (uid: string) => {
    const supabase = createClient();
    const { data, error: fetchError } = await supabase
      .from('applications')
      .select('*, missions(*)')
      .eq('skipper_id', uid)
      .order('applied_at', { ascending: false });
    if (fetchError) {
      setError(friendlyError(copy, fetchError));
      setRows([]);
      return;
    }
    const nextRows = (data as unknown as Row[]) || [];
    setRows(nextRows);
    const missionIds = nextRows.map((row) => row.mission_id);
    if (missionIds.length) {
      const { data: reviewRows } = await supabase.from('reviews').select('*').eq('reviewer_id', uid).in('mission_id', missionIds);
      setReviews(Object.fromEntries(((reviewRows as Review[]) || []).map((review) => [review.mission_id, review])));
    }
  }, [copy]);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setRows([]);
        return;
      }
      setUserId(user.id);
      await load(user.id);
      channel = supabase
        .channel(`my-applications-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'applications', filter: `skipper_id=eq.${user.id}` }, () => void load(user.id))
        .subscribe();
    })();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [load]);

  const visible = useMemo(() => (rows || []).filter((row) => (tab === 'current' ? isCurrentApplication(row) : !isCurrentApplication(row))), [rows, tab]);

  async function withdraw(row: Row) {
    if (!userId) return;
    setError('');
    setBusyId(row.id);
    const supabase = createClient();
    // Soft withdrawal: the row stays in the history and the recruiter is notified.
    const { error: updateError } = await supabase.from('applications').update({ status: 'withdrawn' }).eq('id', row.id).eq('skipper_id', userId).eq('status', 'pending');
    setBusyId(null);
    setConfirmId(null);
    if (updateError) {
      setError(friendlyError(copy, updateError));
      return;
    }
    await load(userId);
  }

  async function reviewRecruiter(row: Row) {
    if (!userId || !row.missions) return;
    setBusyId(`review-${row.id}`);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from('reviews')
      .insert({
        mission_id: row.mission_id,
        reviewer_id: userId,
        reviewee_id: row.missions.poster_id,
        rating: ratings[row.id] ?? 5,
        comment: (comments[row.id] || '').trim() || null,
      })
      .select('*')
      .single();
    setBusyId(null);
    if (insertError) {
      setError(friendlyError(copy, insertError));
      return;
    }
    setReviews((current) => ({ ...current, [row.mission_id]: data as Review }));
  }

  const tone = (status: Application['status']) => (status === 'accepted' ? 'success' : status === 'rejected' ? 'danger' : status === 'withdrawn' ? 'muted' : 'warning');

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-display mb-6 text-3xl font-bold text-marine">{copy.applications.title}</h1>

      <div className="mb-6 inline-flex rounded-xl border border-navy/[0.1] bg-white p-1" role="tablist">
        {(['current', 'history'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === value ? 'bg-marine text-white' : 'text-gray-600 hover:bg-lightblue'}`}
          >
            {copy.applications[value]}
          </button>
        ))}
      </div>

      <ErrorBanner message={error} />

      {rows === null ? (
        <LoadingState label={copy.common.loading} />
      ) : visible.length === 0 ? (
        <EmptyState
          text={tab === 'current' ? copy.applications.empty : copy.applications.emptyHistory}
          actionLabel={tab === 'current' ? copy.applications.browse : undefined}
          actionHref={tab === 'current' ? '/missions' : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => {
            const mission = row.missions;
            const review = reviews[row.mission_id];
            return (
              <li key={row.id} className="rounded-2xl border border-navy/[0.08] bg-white p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap gap-2">
                      <Badge tone={tone(row.status)}>{copy.applications.statuses[row.status]}</Badge>
                      {mission && <Badge tone="muted">{localizeMissionType(copy, mission.type)}</Badge>}
                    </div>
                    <h2 className="font-bold text-marine">{mission ? missionRoute(mission) : copy.errors.notFound}</h2>
                    {mission && (
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-gray-600">
                        <CalendarDays size={14} className="text-gray-400" /> {missionDatesLabel(copy, locale, mission)} · {localizeZone(copy, mission.zone)}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      {interpolate(copy.applications.appliedOn, { date: formatDateForLocale(row.applied_at, locale) })}
                      {mission && ` · ${interpolate(copy.applications.missionStatus, { status: copy.missions.statuses[mission.status] })}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end">
                    <Link href={`/missions/${row.mission_id}`} className="rounded-lg border border-marine/80 px-3 py-2 text-center text-sm font-semibold text-marine hover:bg-lightblue">
                      {copy.applications.viewMission}
                    </Link>
                    {canWithdrawApplication(row) && (
                      confirmId === row.id ? null : (
                        <button type="button" onClick={() => setConfirmId(row.id)} className="rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
                          {copy.applications.withdraw}
                        </button>
                      )
                    )}
                  </div>
                </div>

                {row.status === 'accepted' && mission?.status !== 'completed' && (
                  <p className="mt-3 flex items-center gap-2 text-xs text-gray-500"><Lock size={12} /> {copy.applications.acceptedLocked}</p>
                )}

                {confirmId === row.id && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    <p className="mb-3">{copy.applications.withdrawConfirm}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="danger" size="sm" loading={busyId === row.id} onClick={() => withdraw(row)}>
                        {copy.applications.withdrawYes}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmId(null)}>
                        {copy.common.cancel}
                      </Button>
                    </div>
                  </div>
                )}

                {row.status === 'accepted' && mission?.status === 'completed' && (
                  <div className="mt-4 rounded-xl border border-navy/[0.08] bg-offwhite p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{copy.applications.reviewRecruiter.title}</p>
                    {review ? (
                      <div>
                        <Stars rating={review.rating} />
                        {review.comment && <p className="mt-1 text-sm italic text-gray-700">{review.comment}</p>}
                        <p className="mt-1 text-xs text-gray-500">{copy.applications.reviewRecruiter.published}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <StarInput value={ratings[row.id] ?? 5} onChange={(value) => setRatings((current) => ({ ...current, [row.id]: value }))} />
                        <TextArea
                          value={comments[row.id] || ''}
                          maxLength={1000}
                          placeholder={copy.missionManage.review.commentPlaceholder}
                          onChange={(event) => setComments((current) => ({ ...current, [row.id]: event.target.value }))}
                        />
                        <Button type="button" size="sm" loading={busyId === `review-${row.id}`} onClick={() => reviewRecruiter(row)}>
                          {copy.applications.reviewRecruiter.submit}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
