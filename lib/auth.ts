import type { User } from '@supabase/supabase-js';

const VERIFIED_EMAIL_REQUIRED_PATHS = [
  '/dashboard',
  '/onboarding',
  '/profile',
  '/messages',
  '/notifications',
  '/missions/new',
  '/my-missions',
  '/my-applications',
  '/account',
  '/skippers',
];

export function safeNextPath(nextPath: string | null | undefined, fallback: string) {
  if (!nextPath) return fallback;
  if (!nextPath.startsWith('/') || nextPath.startsWith('//')) return fallback;
  return nextPath;
}

export function isEmailVerified(user: Pick<User, 'email_confirmed_at'> | null | undefined) {
  return Boolean(user?.email_confirmed_at);
}

export function requiresVerifiedEmailPath(pathname: string) {
  return VERIFIED_EMAIL_REQUIRED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function buildVerifyEmailPath(email?: string | null, nextPath?: string | null) {
  const params = new URLSearchParams();
  if (email) params.set('email', email);
  if (nextPath) params.set('next', safeNextPath(nextPath, '/dashboard'));
  const query = params.toString();
  return query ? `/verify-email?${query}` : '/verify-email';
}

export function buildEmailRedirectTo(origin: string, nextPath = '/dashboard') {
  const url = new URL('/auth/callback', origin);
  url.searchParams.set('next', safeNextPath(nextPath, '/dashboard'));
  return url.toString();
}