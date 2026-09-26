'use client';

import Link from 'next/link';
import { useLocale } from '@/components/LocaleProvider';

/** The official Find a Skipper logo (public/logo.png). */
export default function BrandLogo({ href = '/', className = '', size = 'md' }: { href?: string; className?: string; size?: 'md' | 'lg' }) {
  const { copy } = useLocale();
  const dimension = size === 'lg' ? 'h-20 w-20 md:h-24 md:w-24' : 'h-11 w-11 md:h-12 md:w-12';

  return (
    <Link href={href} className={`inline-flex items-center ${className}`} aria-label={copy.brand.name}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt={copy.brand.name} className={`${dimension} rounded-xl object-contain shadow-sm`} />
    </Link>
  );
}
