'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { createClient } from '@/lib/supabase/client';
import { friendlyError } from '@/lib/errors';
import { Button, ErrorBanner, Field, SuccessBanner, TextInput } from '@/components/ui';

function ForgotPasswordForm() {
  const { copy } = useLocale();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(searchParams.get('error') ? copy.errors.linkExpired : '');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    if (resetError) {
      setError(friendlyError(copy, resetError));
      return;
    }
    setSent(true);
  }

  return (
    <>
      <ErrorBanner message={error} />
      {sent ? (
        <SuccessBanner message={copy.forgotPassword.sent} />
      ) : (
        <form onSubmit={handleSubmit}>
          <Field label={copy.common.email}>
            <TextInput type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Button type="submit" loading={loading} className="w-full">
            {copy.forgotPassword.submit}
          </Button>
        </form>
      )}
    </>
  );
}

export default function ForgotPasswordPage() {
  const { copy } = useLocale();
  return (
    <main className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <Link href="/login" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-marine">
        <ArrowLeft size={16} className="rtl:rotate-180" /> {copy.verifyEmail.back}
      </Link>
      <h1 className="font-display mb-2 text-2xl font-bold text-marine">{copy.forgotPassword.title}</h1>
      <p className="mb-6 text-sm text-gray-500">{copy.forgotPassword.description}</p>
      <Suspense fallback={null}>
        <ForgotPasswordForm />
      </Suspense>
    </main>
  );
}
