'use client';

import { useLocale } from '@/components/LocaleProvider';
import type { Messages } from '@/lib/i18n/copy';

export default function LegalPage({ render }: { render: (copy: Messages) => { title: string; body: React.ReactNode } }) {
  const { copy } = useLocale();
  const { title, body } = render(copy);
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-display mb-3 text-3xl font-bold text-marine">{title}</h1>
      <p className="mb-8 text-sm text-gray-500">{copy.legal.updated}</p>
      <div className="space-y-4 text-[15px] leading-7 text-anthracite">{body}</div>
    </main>
  );
}
