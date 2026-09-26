'use client';

import LegalPage from '@/components/legal/LegalPage';

export default function MentionsLegalesPage() {
  return (
    <LegalPage
      render={(copy) => ({
        title: copy.legal.notice.title,
        body: copy.legal.notice.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="mb-1 text-base font-semibold text-marine">{section.heading}</h2>
            <p>{section.body}</p>
          </section>
        )),
      })}
    />
  );
}
