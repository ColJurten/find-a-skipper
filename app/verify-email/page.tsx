'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { MailCheck } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { useLocale } from '@/components/LocaleProvider';
import { createClient } from '@/lib/supabase/client';
import { buildEmailRedirectTo, isEmailVerified, safeNextPath } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { Button, ErrorBanner, Field, LoadingState, SuccessBanner, TextInput } from '@/components/ui';
import { dashboardHrefForRole, onboardingRequired } from '@/lib/onboarding';

function VerifyEmailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { copy } = useLocale();
  const requestedNext = safeNextPath(searchParams.get('next'), '/dashboard');
  const initialEmail = searchParams.get('email') || '';
  const linkError = searchParams.get('error');
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(linkError ? copy.verifyEmail.linkExpired : '');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      // Implicit confirmation links (e.g. resent e-mails) put the session or the error in the fragment.
      const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const fragmentError = Boolean(fragment.get('error_code') || fragment.get('error'));
      const sessionFromFragment = Boolean(fragment.get('access_token') && fragment.get('refresh_token'));
      // A new session requires a full page load so that server components (header) see it.
      const go = (target: string) => (sessionFromFragment ? window.location.replace(target) : router.replace(target));
      if (sessionFromFragment) {
        await supabase.auth.setSession({ access_token: fragment.get('access_token')!, refresh_token: fragment.get('refresh_token')! });
        window.history.replaceState({}, '', window.location.pathname + window.location.search.replace(/([?&])error=[^&]*&?/, '$1'));
      } else if (fragment.get('error_code') || fragment.get('error')) {
        window.history.replaceState({}, '', window.location.pathname + window.location.search);
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (fragmentError) setError(copy.verifyEmail.linkExpired);
      if (!user) {
        setLoading(false);
        return;
      }
      if (user.email && !initialEmail) setEmail(user.email);
      if (!isEmailVerified(user)) {
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (profile && onboardingRequired(profile)) {
        go('/onboarding');
        return;
      }
      go(safeNextPath(requestedNext, profile?.role ? dashboardHrefForRole(profile.role) : '/dashboard'));
    })();
  }, [copy.verifyEmail.linkExpired, initialEmail, requestedNext, router]);

  async function resendConfirmationEmail() {
    setError('');
    setMessage('');
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError(copy.verifyEmail.invalidEmail);
      return;
    }
    setResending(true);
    const supabase = createClient();
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: address,
      options: { emailRedirectTo: buildEmailRedirectTo(window.location.origin, requestedNext) },
    });
    setResending(false);
    if (resendError) {
      setError(friendlyError(copy, resendError));
      return;
    }
    setMessage(copy.verifyEmail.sent);
  }

  async function checkVerificationStatus() {
    setChecking(true);
    setError('');
    setMessage('');
    const supabase = createClient();
    // Refresh the session so that a confirmation made in another tab is taken into account.
    await supabase.auth.refreshSession().catch(() => null);
    const { data: { user } } = await supabase.auth.getUser();
    setChecking(false);
    if (!isEmailVerified(user)) {
      setMessage(copy.verifyEmail.notConfirmed);
      return;
    }
    setMessage(copy.verifyEmail.confirmed);
    router.replace(requestedNext);
    router.refresh();
  }

  if (loading) return <LoadingState label={copy.common.loading} />;

  return (
    <main className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <div className="mb-6 flex justify-center"><BrandLogo size="lg" /></div>
      <div className="rounded-2xl border border-navy/[0.08] bg-white p-6">
        <MailCheck size={28} className="mb-4 text-marine" />
        <h1 className="font-display mb-3 text-2xl font-bold text-marine">{copy.verifyEmail.title}</h1>
        <p className="mb-5 text-sm leading-6 text-gray-600">{copy.verifyEmail.description}</p>
        {searchParams.get('photo') === 'pending' && <p className="mb-5 rounded-lg bg-lightblue p-3 text-sm text-marine">{copy.photo.pendingNotice}</p>}
        <ErrorBanner message={error} />
        <SuccessBanner message={message} />
        <Field label={copy.common.email}>
          <TextInput type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <div className="space-y-3">
          <Button type="button" onClick={resendConfirmationEmail} loading={resending} className="w-full">
            {copy.verifyEmail.resend}
          </Button>
          <Button type="button" variant="outline" onClick={checkVerificationStatus} loading={checking} className="w-full">
            {copy.verifyEmail.check}
          </Button>
        </div>
        <div className="mt-5 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <Link href="/login" className="font-semibold text-marine underline">{copy.verifyEmail.back}</Link>
          <span className="text-gray-500">{copy.verifyEmail.spam}</span>
        </div>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  const { copy } = useLocale();
  return (
    <Suspense fallback={<LoadingState label={copy.common.loading} />}>
      <VerifyEmailInner />
    </Suspense>
  );
}
