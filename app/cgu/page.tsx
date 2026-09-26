'use client';

import LegalPage from '@/components/legal/LegalPage';

export default function CguPage() {
  return (
    <LegalPage
      render={(copy) => ({
        title: copy.legal.cgu.title,
        body: (
          <>
            <p>{copy.legal.cgu.intro}</p>
            <ul className="list-disc space-y-1 ps-5">
              {copy.legal.cgu.bullets.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </>
        ),
      })}
    />
  );
}
