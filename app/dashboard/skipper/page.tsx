import { redirect } from 'next/navigation';
import { Send, Ship, UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getRequestCopy } from '@/lib/i18n/server';
import { interpolate } from '@/lib/i18n/format';
import DashboardCard from '@/components/dashboard/DashboardCard';
import CompleteProfileBanner from '@/components/dashboard/CompleteProfileBanner';
import type { Profile } from '@/lib/database.types';
import { missingRoleFields, onboardingRequired } from '@/lib/onboarding';

export default async function SkipperDashboard() {
  const copy = await getRequestCopy();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const profile = data as Profile | null;
  if (!profile) redirect('/login');
  if (profile.role !== 'skipper') redirect('/dashboard');
  if (onboardingRequired(profile)) redirect('/onboarding');

  const { count: activeApplications } = await supabase
    .from('applications')
    .select('id', { count: 'exact', head: true })
    .eq('skipper_id', user.id)
    .in('status', ['pending', 'accepted']);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="font-display mb-1 text-3xl font-bold text-marine">{interpolate(copy.dashboard.greeting, { name: profile.full_name.split(' ')[0] || profile.full_name })}</h1>
      <p className="mb-8 text-gray-500">{copy.dashboard.subtitle}</p>

      <CompleteProfileBanner copy={copy} missing={missingRoleFields(profile)} />

      <div className="grid gap-5 md:grid-cols-3">
        <DashboardCard href="/missions" icon={Ship} title={copy.dashboard.skipper.missionsTitle} text={copy.dashboard.skipper.missionsText} />
        <DashboardCard href="/my-applications" icon={Send} title={copy.dashboard.skipper.applicationsTitle} text={interpolate(copy.dashboard.skipper.applicationsText, { count: activeApplications ?? 0 })} />
        <DashboardCard href="/profile" icon={UserRound} title={copy.dashboard.skipper.profileTitle} text={copy.dashboard.skipper.profileText} />
      </div>
    </main>
  );
}
