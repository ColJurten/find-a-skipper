'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from '@/components/LocaleProvider';
import { createClient } from '@/lib/supabase/client';
import { safeNextPath } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import PasswordInput from '@/components/password-input';
import { Button, ErrorBanner, Field, SuccessBanner } from '@/components/ui';

function isStrongPassword(password: string) {
  return password.length >= 12 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { copy } = useLocale();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!isStrongPassword(password)) {
      setError(copy.resetPassword.tooWeak);
      return;
    }
    if (password !== confirmPassword) {
      setError(copy.resetPassword.mismatch);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(friendlyError(copy, updateError));
      return;
    }
    setSuccess(true);
    setTimeout(() => router.replace(safeNextPath(searchParams.get('next'), '/dashboard')), 1500);
  }

  if (success) return <SuccessBanner message={copy.resetPassword.updated} />;

  return (
    <form onSubmit={handleSubmit}>
      <ErrorBanner message={error} />
      <Field label={copy.common.password}>
        <PasswordInput required minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
      </Field>
      <Field label={copy.common.confirmPassword}>
        <PasswordInput required minLength={12} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
      </Field>
      <Button type="submit" loading={loading} className="w-full">
        {copy.resetPassword.submit}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const { copy } = useLocale();
  return (
    <main className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <h1 className="font-display mb-2 text-2xl font-bold text-marine">{copy.resetPassword.title}</h1>
      <p className="mb-6 text-sm text-gray-500">{copy.resetPassword.description}</p>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
