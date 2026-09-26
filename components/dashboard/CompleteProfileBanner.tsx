import Link from 'next/link';
import type { Messages } from '@/lib/i18n/copy';
import type { MissingField } from '@/lib/onboarding';

export default function CompleteProfileBanner({ copy, missing }: { copy: Messages; missing: MissingField[] }) {
  if (missing.length === 0) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-lightblue p-5">
      <div className="text-sm text-marine">
        <p className="mb-1 font-semibold">{copy.dashboard.completeProfile}</p>
        <ul className="list-disc ps-5">
          {missing.map((item) => <li key={item}>{copy.onboarding.missing[item]}</li>)}
        </ul>
      </div>
      <Link href="/profile" className="whitespace-nowrap rounded-lg bg-marine px-4 py-2 text-sm font-bold text-white">
        {copy.dashboard.completeProfileCta}
      </Link>
    </div>
  );
}
