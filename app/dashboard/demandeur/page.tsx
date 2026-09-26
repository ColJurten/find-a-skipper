import { redirect } from 'next/navigation';
import { ClipboardList, PlusCircle, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getRequestCopy } from '@/lib/i18n/server';
import { interpolate } from '@/lib/i18n/format';
import DashboardCard from '@/components/dashboard/DashboardCard';
import CompleteProfileBanner from '@/components/dashboard/CompleteProfileBanner';
import type { Profile } from '@/lib/database.types';
import { isRecruiterRole, missingRoleFields, onboardingRequired } from '@/lib/onboarding';

// Same structure for owners, brokers and agencies: exactly three tiles.
export default async function RecruiterDashboard() {
  const copy = await getRequestCopy();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const profile = data as Profile | null;
  if (!profile) redirect('/signup');
  if (!isRecruiterRole(profile.role)) redirect('/dashboard');
  if (onboardingRequired(profile)) redirect('/onboarding');

  const { count } = await supabase.from('missions').select('id', { count: 'exact', head: true }).eq('poster_id', user.id);
  const name = profile.company_name || profile.full_name.split(' ')[0] || profile.full_name;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="font-display mb-1 text-3xl font-bold text-marine">{interpolate(copy.dashboard.greeting, { name })}</h1>
      <p className="mb-8 text-gray-500">{copy.dashboard.subtitle}</p>

      <CompleteProfileBanner copy={copy} missing={missingRoleFields(profile)} />

      <div className="grid gap-5 md:grid-cols-3">
        <DashboardCard href="/missions/new" icon={PlusCircle} title={copy.dashboard.recruiter.publishTitle} text={copy.dashboard.recruiter.publishText} />
        <DashboardCard href="/my-missions" icon={ClipboardList} title={copy.dashboard.recruiter.myMissionsTitle} text={interpolate(copy.dashboard.recruiter.myMissionsText, { count: count ?? 0 })} />
        <DashboardCard href="/skippers" icon={Users} title={copy.dashboard.recruiter.skippersTitle} text={copy.dashboard.recruiter.skippersText} />
      </div>
    </main>
  );
}
