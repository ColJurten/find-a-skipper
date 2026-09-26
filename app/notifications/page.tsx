'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { Button, EmptyState, ErrorBanner, LoadingState } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { refreshBadges } from '@/lib/badges';
import { friendlyError } from '@/lib/errors';
import { formatDateTimeForLocale, interpolate } from '@/lib/i18n/format';
import { missionRoute } from '@/lib/mission';
import type { Mission, Notification, Role } from '@/lib/database.types';

type MissionLabels = Record<string, string>;

function payloadString(notification: Notification, key: string) {
  const value = (notification.payload || {})[key];
  return typeof value === 'string' ? value : null;
}

/** Where a notification leads, depending on its type and on the role of the reader. */
function notificationHref(notification: Notification, role: Role | null) {
  const missionId = payloadString(notification, 'mission_id');
  const conversationId = payloadString(notification, 'conversation_id');
  if (notification.type === 'new_message' && conversationId) return `/messages?conversation=${conversationId}`;
  if (!missionId) return null;
  if (role && role !== 'skipper') return `/my-missions/${missionId}`;
  return `/missions/${missionId}`;
}

async function fetchNotifications() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data, error }, { data: me }] = await Promise.all([
    supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(200),
    supabase.from('profiles').select('role').eq('id', user.id).single(),
  ]);
  const rows = (data as Notification[]) || [];
  const missionIds = Array.from(new Set(rows.map((row) => payloadString(row, 'mission_id')).filter(Boolean))) as string[];
  let missions: MissionLabels = {};
  if (missionIds.length) {
    const { data: missionRows } = await supabase.from('missions').select('id, departure, destination').in('id', missionIds);
    missions = Object.fromEntries(((missionRows as Pick<Mission, 'id' | 'departure' | 'destination'>[]) || []).map((mission) => [mission.id, missionRoute(mission)]));
  }
  return { rows, missions, role: ((me?.role as Role | undefined) ?? null), error };
}

export default function NotificationsPage() {
  const { copy, locale } = useLocale();
  const [rows, setRows] = useState<Notification[] | null>(null);
  const [missions, setMissions] = useState<MissionLabels>({});
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    void fetchNotifications().then((result) => {
      if (!result) {
        setRows([]);
        return;
      }
      setRole(result.role);
      setMissions(result.missions);
      setRows(result.rows);
      setError(result.error ? friendlyError(copy, result.error) : '');
    });
  }, [copy]);

  useEffect(() => {
    load();
    const supabase = createClient();
    const channel = supabase
      .channel('notifications-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const unread = useMemo(() => (rows || []).filter((row) => !row.read).length, [rows]);

  async function markRead(ids: string[]) {
    if (!ids.length) return;
    const supabase = createClient();
    const { error: updateError } = await supabase.from('notifications').update({ read: true }).in('id', ids);
    if (updateError) {
      setError(friendlyError(copy, updateError));
      return;
    }
    setRows((current) => (current || []).map((row) => (ids.includes(row.id) ? { ...row, read: true } : row)));
    refreshBadges();
  }

  function body(notification: Notification) {
    const missionId = payloadString(notification, 'mission_id');
    const mission = (missionId && missions[missionId]) || copy.notifications.unknownMission;
    const status = payloadString(notification, 'new_status');
    const template = copy.notifications.bodies[notification.type] || copy.notifications.bodies.generic;
    return interpolate(template, { mission, status: status ? copy.missions.statuses[status] || status : '' });
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display mb-1 text-3xl font-bold text-marine">{copy.notifications.title}</h1>
          <p className="text-sm text-gray-500">{interpolate(copy.notifications.unreadCount, { count: unread })}</p>
        </div>
        {unread > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={() => markRead((rows || []).filter((row) => !row.read).map((row) => row.id))}>
            <CheckCheck size={16} /> {copy.notifications.markAllRead}
          </Button>
        )}
      </div>

      <ErrorBanner message={error} />
      {rows === null ? (
        <LoadingState label={copy.common.loading} />
      ) : rows.length === 0 ? (
        <EmptyState text={copy.notifications.none} />
      ) : (
        <ul className="space-y-2">
          {rows.map((notification) => {
            const href = notificationHref(notification, role);
            return (
              <li key={notification.id} className={`flex items-start gap-3 rounded-2xl border bg-white p-4 ${notification.read ? 'border-navy/[0.08]' : 'border-marine/40 shadow-sm'}`}>
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${notification.read ? 'bg-gray-100 text-gray-400' : 'bg-mission text-mission-ink'}`}>
                  <Bell size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${notification.read ? 'font-semibold text-gray-700' : 'font-bold text-anthracite'}`}>
                    {copy.notifications.types[notification.type] || copy.notifications.types.generic}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-600">{body(notification)}</p>
                  <p className="mt-1 text-xs text-gray-400">{formatDateTimeForLocale(notification.created_at, locale)}</p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {href && (
                      <Link href={href} onClick={() => void markRead(notification.read ? [] : [notification.id])} className="text-sm font-semibold text-marine underline">
                        {copy.notifications.open}
                      </Link>
                    )}
                    {!notification.read && (
                      <button type="button" onClick={() => markRead([notification.id])} className="text-sm font-semibold text-gray-500 hover:text-marine">
                        {copy.notifications.markRead}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
