'use client';

import Link from 'next/link';
import LegalPage from '@/components/legal/LegalPage';

export default function ConfidentialitePage() {
  return (
    <LegalPage
      render={(copy) => ({
        title: copy.legal.privacy.title,
        body: (
          <>
            <p>{copy.legal.privacy.body}</p>
            <p>{copy.legal.privacy.rights}</p>
            <p>
              <Link href="/account" className="font-semibold text-marine underline hover:text-navy">{copy.legal.privacy.account}</Link>
            </p>
          </>
        ),
      })}
    />
  );
}
