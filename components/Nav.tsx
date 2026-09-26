'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, LogOut, Menu, MessageCircle, X } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import { useLocale } from '@/components/LocaleProvider';
import { CountBadge } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { BADGES_REFRESH_EVENT } from '@/lib/badges';
import { flushPendingAvatar } from '@/lib/pending-avatar';
import { dashboardHrefForRole } from '@/lib/onboarding';
import type { Profile } from '@/lib/database.types';

type NavLink = { href: string; label: string; icon?: typeof Bell; count?: number };

async function fetchUnreadCounts(profileId: string) {
  const supabase = createClient();
  const [{ count }, { data: messageCount }] = await Promise.all([
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', profileId).eq('read', false),
    supabase.rpc('unread_messages_count'),
  ]);
  return { notifications: count || 0, messages: typeof messageCount === 'number' ? messageCount : 0 };
}

export default function Nav({ profile }: { profile: Pick<Profile, 'id' | 'role'> | null }) {
  const [open, setOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const router = useRouter();
  const pathname = usePathname();
  const { copy } = useLocale();
  const profileId = profile?.id ?? null;
  const role = profile?.role ?? null;

  const refreshCounts = useCallback(() => {
    if (!profileId) return;
    void fetchUnreadCounts(profileId).then(({ notifications, messages }) => {
      setUnreadNotifications(notifications);
      setUnreadMessages(messages);
    });
  }, [profileId]);

  useEffect(() => {
    if (!profileId) return;
    const supabase = createClient();

    // Upload the photo chosen at sign-up (kept locally until the e-mail was confirmed).
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user?.email_confirmed_at && (await flushPendingAvatar(supabase, user))) router.refresh();
    });

    // Realtime: new notifications, new messages and read receipts update the badges.
    const channel = supabase
      .channel(`nav-badges-${profileId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${profileId}` }, refreshCounts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, refreshCounts)
      .subscribe();

    const onRefresh = () => refreshCounts();
    window.addEventListener(BADGES_REFRESH_EVENT, onRefresh);
    // Safety net when realtime is unavailable.
    const interval = window.setInterval(onRefresh, 60_000);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener(BADGES_REFRESH_EVENT, onRefresh);
      window.clearInterval(interval);
    };
  }, [profileId, refreshCounts, router]);

  // Counts are refreshed on every navigation (e.g. after reading a conversation).
  useEffect(() => {
    refreshCounts();
  }, [pathname, refreshCounts]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  // Missions, applications, "publish", "my missions" and the directory are reached from the
  // dashboard cards, so they are intentionally not duplicated in the top menu.
  const links = useMemo<NavLink[]>(() => {
    if (!role) return [];
    const dashboard = { href: dashboardHrefForRole(role), label: copy.nav.dashboard };
    if (role === 'admin') return [dashboard];
    const shared: NavLink[] = [
      { href: '/messages', label: copy.nav.messaging, icon: MessageCircle, count: unreadMessages },
      { href: '/notifications', label: copy.nav.notifications, icon: Bell, count: unreadNotifications },
    ];
    if (role === 'skipper') return [dashboard, ...shared];
    return [dashboard, { href: '/profile', label: copy.nav.profile }, ...shared];
  }, [role, copy, unreadMessages, unreadNotifications]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-30 border-b border-navy/[0.08] bg-offwhite/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <BrandLogo className="shrink-0" href={role ? dashboardHrefForRole(role) : '/'} />

        <nav className="hidden items-center gap-1 md:flex">
          {links.map(({ href, label, icon: Icon, count }) => (
            <Link
              key={href}
              href={href}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold ${isActive(href) ? 'bg-lightblue text-marine' : 'text-anthracite hover:bg-lightblue'}`}
            >
              {Icon && <Icon size={16} />}
              <span>{label}</span>
              {count !== undefined && <CountBadge count={count} />}
            </Link>
          ))}
          {role && (
            <button onClick={handleLogout} className="ms-1 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100">
              <LogOut size={15} className="rtl:rotate-180" /> {copy.nav.logout}
            </button>
          )}
          <div className="ms-2">
            <LocaleSwitcher />
          </div>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          {links
            .filter((link) => link.icon)
            .map(({ href, label, icon: Icon, count }) => (
              <Link key={href} href={href} aria-label={label} className="relative rounded-lg p-2 text-marine hover:bg-lightblue">
                {Icon && <Icon size={20} />}
                {!!count && (
                  <span className="absolute -top-0.5 end-0">
                    <CountBadge count={count} />
                  </span>
                )}
              </Link>
            ))}
          <LocaleSwitcher />
          {role && (
            <button className="rounded-lg p-2" onClick={() => setOpen(!open)} aria-label={open ? copy.nav.closeMenu : copy.nav.openMenu} aria-expanded={open}>
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          )}
        </div>
      </div>

      {open && role && (
        <div className="flex flex-col gap-1 border-t border-navy/[0.06] px-4 pb-4 pt-2 md:hidden">
          {links.map(({ href, label, count }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)} className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-semibold ${isActive(href) ? 'bg-lightblue text-marine' : ''}`}>
              <span>{label}</span>
              {count !== undefined && <CountBadge count={count} />}
            </Link>
          ))}
          <button onClick={handleLogout} className="rounded-lg px-3 py-2.5 text-start text-sm font-semibold text-gray-500">
            {copy.nav.logout}
          </button>
        </div>
      )}
    </header>
  );
}
