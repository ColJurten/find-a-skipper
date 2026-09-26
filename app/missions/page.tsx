'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Clock, MapPin, Search, Ship } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { Badge, Button, EmptyState, ErrorBanner, LoadingState, Select } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { friendlyError } from '@/lib/errors';
import { interpolate } from '@/lib/i18n/format';
import { localizeBoatType, localizeMissionType, localizeZone } from '@/lib/i18n/options';
import { matchesMissionStatusFilter, missionRoute, type MissionStatusFilter } from '@/lib/mission';
import { missionDatesLabel, missionHoursShort, missionPayLabel } from '@/lib/mission-format';
import { MISSION_TYPES, NAVIGATION_ZONES, SKIPPER_BOAT_TYPES } from '@/lib/profile-options';
import type { Mission } from '@/lib/database.types';

export default function MissionsPage() {
  const { copy, locale } = useLocale();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<MissionStatusFilter>('open');
  const [type, setType] = useState('all');
  const [zone, setZone] = useState('all');
  const [boat, setBoat] = useState('all');

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data, error: fetchError } = await supabase
        .from('missions')
        .select('*')
        .eq('status', status === 'open' ? 'open' : 'completed')
        .order('posted_at', { ascending: false });
      if (fetchError) setError(friendlyError(copy, fetchError));
      else {
        setError('');
        setMissions((data as Mission[]) || []);
      }
      setLoading(false);
    })();
  }, [copy, status]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return missions.filter((mission) => {
      if (!matchesMissionStatusFilter(mission, status)) return false;
      if (type !== 'all' && mission.type !== type) return false;
      if (zone !== 'all' && mission.zone !== zone) return false;
      if (boat !== 'all' && mission.boat_type !== boat) return false;
      if (!needle) return true;
      return [mission.departure, mission.destination, localizeZone(copy, mission.zone), localizeBoatType(copy, mission.boat_type), localizeMissionType(copy, mission.type), mission.description, mission.requirements]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [missions, status, type, zone, boat, query, copy]);

  const hasFilters = query.trim() !== '' || status !== 'open' || type !== 'all' || zone !== 'all' || boat !== 'all';

  function reset() {
    setQuery('');
    if (status !== 'open') setLoading(true);
    setStatus('open');
    setType('all');
    setZone('all');
    setBoat('all');
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="font-display mb-1 text-3xl font-bold text-marine">{copy.missions.title}</h1>
      <p className="mb-6 text-sm text-gray-500">{interpolate(copy.common.results, { count: filtered.length })}</p>

      <div className="mb-8 space-y-3">
        <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 focus-within:border-navy focus-within:ring-2 focus-within:ring-navy/15">
          <Search size={16} className="shrink-0 text-gray-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.missions.queryPlaceholder} aria-label={copy.missions.queryPlaceholder} className="w-full bg-transparent text-[15px] outline-none" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterField label={copy.missions.status}>
            <Select value={status} onChange={(event) => { setLoading(true); setStatus(event.target.value as MissionStatusFilter); }}>
              <option value="open">{copy.missions.statusOpen}</option>
              <option value="past">{copy.missions.statusPast}</option>
            </Select>
          </FilterField>
          <FilterField label={copy.missions.type}>
            <Select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="all">{copy.common.allMasculine}</option>
              {MISSION_TYPES.map((value) => <option key={value} value={value}>{localizeMissionType(copy, value)}</option>)}
            </Select>
          </FilterField>
          <FilterField label={copy.missions.zone}>
            <Select value={zone} onChange={(event) => setZone(event.target.value)}>
              <option value="all">{copy.common.all}</option>
              {NAVIGATION_ZONES.map((value) => <option key={value} value={value}>{localizeZone(copy, value)}</option>)}
            </Select>
          </FilterField>
          <FilterField label={copy.missions.boat}>
            <Select value={boat} onChange={(event) => setBoat(event.target.value)}>
              <option value="all">{copy.common.allMasculine}</option>
              {SKIPPER_BOAT_TYPES.map((value) => <option key={value} value={value}>{localizeBoatType(copy, value)}</option>)}
            </Select>
          </FilterField>
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
        <EmptyState text={copy.missions.noResult} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((mission) => {
            const hours = missionHoursShort(copy, locale, mission);
            return (
              <Link key={mission.id} href={`/missions/${mission.id}`} className="lift-card flex flex-col rounded-2xl border border-navy/[0.08] bg-white p-5">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge>{localizeMissionType(copy, mission.type)}</Badge>
                  {mission.status !== 'open' && <Badge tone="muted">{copy.missions.statuses[mission.status]}</Badge>}
                </div>
                <h2 className="mb-3 text-[16px] font-bold leading-snug text-marine">{missionRoute(mission)}</h2>
                <ul className="mb-4 space-y-1.5 text-sm text-gray-600">
                  <li className="flex items-center gap-2"><CalendarDays size={14} className="shrink-0 text-gray-400" /> {missionDatesLabel(copy, locale, mission)}</li>
                  {hours && <li className="flex items-center gap-2"><Clock size={14} className="shrink-0 text-gray-400" /> {hours}</li>}
                  <li className="flex items-center gap-2"><MapPin size={14} className="shrink-0 text-gray-400" /> {localizeZone(copy, mission.zone)}</li>
                  <li className="flex items-center gap-2"><Ship size={14} className="shrink-0 text-gray-400" /> {localizeBoatType(copy, mission.boat_type)}</li>
                </ul>
                <div className="mt-auto border-t border-navy/[0.06] pt-3 text-[15px] font-bold text-marine">{missionPayLabel(copy, locale, mission)}</div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block rounded-2xl border border-navy/[0.08] bg-white p-3">
      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">{label}</span>
      {children}
    </label>
  );
}
