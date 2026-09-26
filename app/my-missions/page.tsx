'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CalendarDays, Plus, Users } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { Badge, EmptyState, ErrorBanner, LoadingState, SuccessBanner, buttonStyles } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { friendlyError } from '@/lib/errors';
import { interpolate } from '@/lib/i18n/format';
import { localizeMissionType, localizeZone } from '@/lib/i18n/options';
import { missionRoute } from '@/lib/mission';
import { missionDatesLabel } from '@/lib/mission-format';
import type { Mission } from '@/lib/database.types';

function MyMissionsInner() {
  const { copy, locale } = useLocale();
  const searchParams = useSearchParams();
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMissions([]);
        return;
      }
      const { data, error: fetchError } = await supabase.from('missions').select('*').eq('poster_id', user.id).order('posted_at', { ascending: false });
      if (fetchError) setError(friendlyError(copy, fetchError));
      setMissions((data as Mission[]) || []);
    })();
  }, [copy]);

  const statusTone = (status: Mission['status']) => (status === 'open' ? 'success' : status === 'cancelled' ? 'danger' : status === 'completed' ? 'muted' : 'default');

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display mb-1 text-3xl font-bold text-marine">{copy.myMissions.title}</h1>
          <p className="text-sm text-gray-500">{copy.myMissions.subtitle}</p>
        </div>
        <Link href="/missions/new" className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${buttonStyles.mission}`}>
          <Plus size={16} /> {copy.nav.publishMission}
        </Link>
      </div>

      {searchParams.get('created') === '1' && <SuccessBanner message={copy.myMissions.created} />}
      <ErrorBanner message={error} />

      {missions === null ? (
        <LoadingState label={copy.common.loading} />
      ) : missions.length === 0 ? (
        <EmptyState text={copy.myMissions.empty} actionLabel={copy.nav.publishMission} actionHref="/missions/new" />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {missions.map((mission) => (
            <Link key={mission.id} href={`/my-missions/${mission.id}`} className="lift-card flex flex-col rounded-2xl border border-navy/[0.08] bg-white p-5">
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge>{localizeMissionType(copy, mission.type)}</Badge>
                <Badge tone={statusTone(mission.status)}>{copy.missions.statuses[mission.status]}</Badge>
              </div>
              <h2 className="mb-2 font-bold text-marine">{missionRoute(mission)}</h2>
              <p className="mb-1 flex items-center gap-2 text-sm text-gray-600"><CalendarDays size={14} className="text-gray-400" /> {missionDatesLabel(copy, locale, mission)}</p>
              <p className="mb-4 text-sm text-gray-500">{localizeZone(copy, mission.zone)}</p>
              <p className="mt-auto flex items-center gap-1.5 text-sm font-semibold text-marine">
                <Users size={15} /> {interpolate(copy.myMissions.applicants, { count: mission.applicants_count || 0 })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

export default function MyMissionsPage() {
  const { copy } = useLocale();
  return (
    <Suspense fallback={<LoadingState label={copy.common.loading} />}>
      <MyMissionsInner />
    </Suspense>
  );
}
