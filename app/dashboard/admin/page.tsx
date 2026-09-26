import { redirect } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getRequestCopy } from '@/lib/i18n/server';

export default async function AdminDashboard() {
  const copy = await getRequestCopy();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/dashboard');

  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
      <ShieldAlert size={36} className="mx-auto mb-4 text-marine" />
      <h1 className="font-display mb-2 text-2xl font-bold text-marine">{copy.dashboard.admin.title}</h1>
      <p className="text-sm text-gray-500">{copy.dashboard.admin.text}</p>
    </main>
  );
}
