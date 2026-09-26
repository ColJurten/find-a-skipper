import type { Messages } from '@/lib/i18n/copy';

type ErrorLike = { message?: string; code?: string; status?: number; name?: string } | null | undefined;

/**
 * Converts Supabase / network errors into a translated, user-friendly message so that
 * raw English (or technical) messages never leak into the interface.
 */
export function friendlyError(copy: Messages, error: unknown): string {
  const err = (error ?? {}) as ErrorLike & object;
  const message = (err && 'message' in err && typeof err.message === 'string' ? err.message : String(error ?? '')).toLowerCase();
  const code = err && 'code' in err && typeof err.code === 'string' ? err.code : '';

  if (/failed to fetch|network|fetch failed|timeout|délai|delai|abort|load failed/.test(message)) return copy.errors.network;
  if (/email not confirmed|email_not_confirmed/.test(message) || code === 'email_not_confirmed') return copy.errors.emailNotConfirmed;
  if (/invalid login credentials|invalid_credentials/.test(message) || code === 'invalid_credentials') return copy.errors.invalidCredentials;
  if (/user already registered|already been registered|user_already_exists/.test(message) || code === 'user_already_exists') return copy.errors.userExists;
  if (/weak password|password should|weak_password/.test(message) || code === 'weak_password') return copy.errors.weakPassword;
  if (/rate limit|too many|over_email_send_rate_limit|over_request_rate_limit/.test(message) || code.startsWith('over_')) return copy.errors.rateLimit;
  if (/expired|otp_expired|invalid.*(token|link)|flow_state/.test(message) || code === 'otp_expired') return copy.errors.linkExpired;
  if (/jwt|session|refresh token|auth session missing/.test(message)) return copy.errors.sessionExpired;
  if (code === '23505' || /duplicate key/.test(message)) return copy.errors.duplicate;
  if (code === '42501' || /row-level security|permission denied|not allowed|not a participant/.test(message)) return copy.errors.permission;
  if (/email confirmation required/.test(message)) return copy.errors.emailNotConfirmed;
  if (code === 'PGRST116') return copy.errors.notFound;
  return copy.errors.generic;
}
