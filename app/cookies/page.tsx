'use client';

import LegalPage from '@/components/legal/LegalPage';

export default function CookiesPage() {
  return (
    <LegalPage
      render={(copy) => ({
        title: copy.legal.cookies.title,
        body: (
          <ul className="list-disc space-y-1 ps-5">
            {copy.legal.cookies.points.map((point) => <li key={point}>{point}</li>)}
          </ul>
        ),
      })}
    />
  );
}
