'use client';

import Link from 'next/link';
import { useLocale } from '@/components/LocaleProvider';

export default function LegalFooter() {
  const { copy } = useLocale();
  const links = [
    { href: '/mentions-legales', label: copy.footer.legal },
    { href: '/confidentialite', label: copy.footer.privacy },
    { href: '/cgu', label: copy.footer.terms },
    { href: '/cookies', label: copy.footer.cookies },
  ];

  return (
    <footer className="border-t border-navy/[0.08] bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 sm:px-6 md:flex-row md:items-center md:justify-between">
        <p className="text-xs text-gray-500">{copy.brand.footer}</p>
        <nav className="flex flex-wrap gap-x-4 gap-y-2">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-xs font-semibold text-marine hover:text-navy">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
