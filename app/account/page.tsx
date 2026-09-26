'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { Button, ErrorBanner, Field, SuccessBanner, TextInput } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

export default function AccountPage() {
  const router = useRouter();
  const { copy } = useLocale();
  const phrase = copy.account.confirmationPhrase;
  const [confirmation, setConfirmation] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const canSubmit = confirmation.trim().toLocaleUpperCase() === phrase.toLocaleUpperCase();

  async function handleDelete(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!canSubmit) {
      setError(copy.account.mismatch);
      return;
    }
    setSubmitting(true);
    const response = await fetch('/api/account/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() || null }),
    }).catch(() => null);
    const payload = (await response?.json().catch(() => ({}))) as { success?: boolean } | undefined;
    if (!response?.ok || !payload?.success) {
      setSubmitting(false);
      setError(copy.account.unavailable);
      return;
    }
    await createClient().auth.signOut();
    setSubmitting(false);
    setSuccess(copy.account.deleted);
    router.replace('/');
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="font-display mb-3 text-3xl font-bold text-marine">{copy.account.title}</h1>
      <p className="mb-8 text-sm text-gray-500">{copy.account.description}</p>

      <section className="rounded-2xl border border-red-200 bg-red-50/60 p-6">
        <div className="mb-4 flex items-start gap-3">
          <AlertTriangle className="mt-0.5 shrink-0 text-red-600" size={20} />
          <div>
            <h2 className="font-semibold text-red-700">{copy.account.warning}</h2>
            <p className="mt-1 text-sm text-red-700/90">{copy.account.warningBody}</p>
          </div>
        </div>
        <ErrorBanner message={error} />
        <SuccessBanner message={success} />
        <form onSubmit={handleDelete} className="space-y-3">
          <Field label={copy.account.confirmationLabel} hint={`${copy.account.confirmationHint} ${phrase}`}>
            <TextInput value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={phrase} autoComplete="off" />
          </Field>
          <Field label={copy.account.reasonLabel} hint={copy.account.reasonHint} optionalLabel={copy.common.optional}>
            <TextInput value={reason} onChange={(event) => setReason(event.target.value)} maxLength={250} />
          </Field>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" variant="danger" loading={submitting} disabled={!canSubmit} className="sm:flex-1">
              {submitting ? copy.account.deleting : copy.account.delete}
            </Button>
            <Link href="/profile" className="inline-flex items-center justify-center rounded-xl border border-marine/80 px-5 py-3 text-[15px] font-bold text-marine sm:flex-1">
              {copy.account.back}
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
