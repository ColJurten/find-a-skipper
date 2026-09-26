'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import BrandLogo from '@/components/BrandLogo';
import { useLocale } from '@/components/LocaleProvider';
import { createClient } from '@/lib/supabase/client';
import { Button, ErrorBanner, Field, TextInput } from '@/components/ui';
import PasswordInput from '@/components/password-input';
import { buildVerifyEmailPath, isEmailVerified, safeNextPath } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { dashboardHrefForRole, onboardingRequired } from '@/lib/onboarding';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { copy } = useLocale();
  const [form, setForm] = useState({ email: searchParams.get('email') || '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(searchParams.get('error') === 'confirmation_failed' ? copy.errors.linkExpired : '');

  async function redirectAfterLogin() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace('/dashboard');
      return;
    }
    if (!isEmailVerified(user)) {
      router.replace(buildVerifyEmailPath(user.email || form.email, searchParams.get('next')));
      return;
    }
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (profile && onboardingRequired(profile)) {
      router.replace('/onboarding');
      return;
    }
    router.replace(safeNextPath(searchParams.get('next'), profile?.role ? dashboardHrefForRole(profile.role) : '/dashboard'));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password });
    if (signInError) {
      setLoading(false);
      if (/email not confirmed/i.test(signInError.message) || signInError.code === 'email_not_confirmed') {
        router.replace(buildVerifyEmailPath(form.email.trim(), searchParams.get('next')));
        return;
      }
      setError(friendlyError(copy, signInError));
      return;
    }
    await redirectAfterLogin();
    router.refresh();
  }

  return (
    <>
      <ErrorBanner message={error} />
      <form onSubmit={handleSubmit}>
        <Field label={copy.common.email}>
          <TextInput type="email" required autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </Field>
        <Field label={copy.common.password}>
          <PasswordInput required autoComplete="current-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        </Field>
        <div className="mb-4 text-end">
          <Link href="/forgot-password" className="text-sm font-semibold text-marine underline">{copy.login.forgot}</Link>
        </div>
        <Button type="submit" loading={loading} className="w-full">
          {copy.login.submit}
        </Button>
      </form>
      <div className="mt-5 text-sm text-gray-500">
        {copy.login.pending}{' '}
        <Link href={buildVerifyEmailPath(form.email || searchParams.get('email'), searchParams.get('next'))} className="font-semibold text-marine underline">
          {copy.login.resend}
        </Link>
      </div>
      <p className="mt-5 text-center text-sm text-gray-500">
        {copy.login.noAccount}{' '}
        <Link href="/signup?role=skipper" className="font-semibold text-marine underline">{copy.login.create}</Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  const { copy } = useLocale();
  return (
    <main className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <div className="mb-5 flex justify-center"><BrandLogo size="lg" /></div>
      <h1 className="font-display mb-6 text-center text-2xl font-bold text-marine">{copy.login.title}</h1>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
