import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

/** Dashboard tile: identical style for every role, with a thin marine-blue border. */
export default function DashboardCard({ href, icon: Icon, title, text }: { href: string; icon: LucideIcon; title: string; text: string }) {
  return (
    <Link href={href} className="lift-card group flex flex-col rounded-2xl border border-marine bg-white p-6 focus:outline-none focus:ring-2 focus:ring-navy/30">
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-lightblue text-marine">
        <Icon size={22} />
      </span>
      <h2 className="font-display mb-1 text-lg font-bold text-marine">{title}</h2>
      <p className="text-sm text-gray-500">{text}</p>
    </Link>
  );
}
