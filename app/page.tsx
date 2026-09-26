import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getRequestCopy } from '@/lib/i18n/server';
import { dashboardHrefForRole } from '@/lib/onboarding';

const heroButton =
  'inline-flex h-[52px] w-full items-center justify-center rounded-xl px-6 text-[15px] font-bold transition sm:w-60';

export default async function HomePage() {
  const supabase = await createClient();
  const copy = await getRequestCopy();
  const { data: { user } } = await supabase.auth.getUser();
  let role: string | null = null;
  if (user) {
    const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    role = (data?.role as string | undefined) ?? null;
  }

  return (
    <section
      className="relative flex min-h-[calc(100svh-73px)] items-center justify-center overflow-hidden px-4 py-20 text-white sm:px-6"
      style={{
        backgroundImage:
          "linear-gradient(160deg, rgba(6,22,43,0.86) 0%, rgba(11,37,69,0.66) 45%, rgba(13,78,112,0.40) 100%), url('/hero-boat.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center 42%',
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),transparent_45%)]" />

      {/* Content sits directly on the hero — no white card around it. */}
      <div className="fade-in relative mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        <p className="mb-5 text-xs font-semibold uppercase tracking-[0.24em] text-white/80 sm:text-[13px]">{copy.home.eyebrow}</p>
        <h1
          className="font-display mb-6 text-balance text-[40px] font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-[56px] md:text-[68px]"
          style={{ textShadow: '0 2px 24px rgba(0,0,0,0.25)' }}
        >
          {copy.home.title}
        </h1>
        <p className="mb-10 max-w-2xl text-balance text-base leading-7 text-white/85 md:text-lg">{copy.home.description}</p>

        {!role ? (
          <>
            <div className="flex w-full flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Link href="/signup?role=skipper" className={`${heroButton} bg-white text-marine shadow-lg shadow-black/15 hover:bg-lightblue`}>
                {copy.home.skipperCta}
              </Link>
              <Link href="/signup?role=owner" className={`${heroButton} bg-mission text-mission-ink shadow-lg shadow-black/15 hover:bg-mission-hover`}>
                {copy.home.publishCta}
              </Link>
            </div>
            <Link href="/login" className={`${heroButton} mt-4 border border-white/40 bg-white/5 font-semibold text-white backdrop-blur-sm hover:bg-white/15`}>
              {copy.home.loginCta}
            </Link>
          </>
        ) : (
          <div className="flex w-full flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Link href={dashboardHrefForRole(role)} className={`${heroButton} bg-white text-marine shadow-lg shadow-black/15 hover:bg-lightblue`}>
              {copy.home.dashboardCta}
            </Link>
            {role === 'skipper' ? (
              <Link href="/missions" className={`${heroButton} bg-mission text-mission-ink shadow-lg shadow-black/15 hover:bg-mission-hover`}>
                {copy.home.missionsCta}
              </Link>
            ) : role !== 'admin' ? (
              <Link href="/missions/new" className={`${heroButton} bg-mission text-mission-ink shadow-lg shadow-black/15 hover:bg-mission-hover`}>
                {copy.home.publishCta}
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
