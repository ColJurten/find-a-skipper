import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { canAccessPath } from '@/lib/access';
import { buildVerifyEmailPath, isEmailVerified, requiresVerifiedEmailPath } from '@/lib/auth';
import { dashboardHrefForRole, onboardingRequired } from '@/lib/onboarding';

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/verify-email',
  '/missions',
  '/mentions-legales',
  '/confidentialite',
  '/cgu',
  '/cookies',
];
const PRIVATE_PATHS = [
  '/dashboard',
  '/onboarding',
  '/profile',
  '/messages',
  '/notifications',
  '/skippers',
  '/missions/new',
  '/my-missions',
  '/my-applications',
  '/account',
];

function matchesAny(pathname: string, paths: string[]) {
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith('/api/')) return response;

  const { url, publishableKey } = getSupabaseEnv();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const redirectTo = (target: string) => NextResponse.redirect(new URL(target, request.url));
  const nextPath = pathname + request.nextUrl.search;

  if (!user) {
    if (matchesAny(pathname, PRIVATE_PATHS) || !matchesAny(pathname, PUBLIC_PATHS)) {
      const login = new URL('/login', request.url);
      login.searchParams.set('next', nextPath);
      return NextResponse.redirect(login);
    }
    return response;
  }

  // E-mail confirmation is mandatory before any sensitive page.
  if (!isEmailVerified(user)) {
    if (requiresVerifiedEmailPath(pathname) || pathname === '/login' || pathname === '/signup') {
      return redirectTo(buildVerifyEmailPath(user.email ?? null, nextPath));
    }
    return response;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, onboarding_step, onboarding_completed_at')
    .eq('id', user.id)
    .maybeSingle();
  const role = profile?.role ?? null;
  const home = role ? dashboardHrefForRole(role) : '/dashboard';

  if (pathname === '/verify-email' || pathname === '/login' || pathname === '/signup' || pathname.startsWith('/forgot-password')) {
    if (profile && onboardingRequired(profile)) return redirectTo('/onboarding');
    return redirectTo(home);
  }

  if (!canAccessPath(role, pathname)) {
    return redirectTo(home);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
