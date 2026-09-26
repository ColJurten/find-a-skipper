import type { Metadata, Viewport } from 'next';
import { Inter, Manrope, Noto_Sans_Arabic } from 'next/font/google';
import './globals.css';
import Nav from '@/components/Nav';
import LegalFooter from '@/components/LegalFooter';
import { LocaleProvider } from '@/components/LocaleProvider';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/database.types';
import { localeDirection } from '@/lib/i18n/locales';
import { getRequestCopy, getRequestLocale } from '@/lib/i18n/server';

const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter', display: 'swap' });
// Display font for titles: modern, elegant and dynamic, with Cyrillic support for Russian.
const manrope = Manrope({ subsets: ['latin', 'cyrillic'], weight: ['500', '600', '700', '800'], variable: '--font-display', display: 'swap' });
// Arabic glyphs fall back to this font automatically (see tailwind fontFamily).
const arabic = Noto_Sans_Arabic({ subsets: ['arabic'], weight: ['400', '600', '700'], variable: '--font-arabic', display: 'swap' });

export async function generateMetadata(): Promise<Metadata> {
  const copy = await getRequestCopy();

  return {
    title: {
      default: copy.brand.name,
      template: `%s | ${copy.brand.name}`,
    },
    description: copy.brand.description,
    icons: {
      icon: '/logo.png',
      shortcut: '/logo.png',
      apple: '/logo.png',
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B2545',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getRequestLocale();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let profile: Pick<Profile, 'id' | 'role'> | null = null;
  if (user) {
    const { data } = await supabase.from('profiles').select('id, role').eq('id', user.id).maybeSingle();
    profile = (data as Pick<Profile, 'id' | 'role'> | null) ?? null;
  }

  return (
    <html lang={locale} dir={localeDirection(locale)}>
      <body className={`${inter.variable} ${manrope.variable} ${arabic.variable} bg-offwhite font-sans text-anthracite antialiased`}>
        <LocaleProvider initialLocale={locale}>
          <div className="flex min-h-screen flex-col">
            <Nav profile={profile} />
            <div className="flex-1">{children}</div>
            <LegalFooter />
          </div>
        </LocaleProvider>
      </body>
    </html>
  );
}
