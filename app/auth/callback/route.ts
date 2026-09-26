import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/auth';

/** Public origin of the request (the Host header, not the internal server address). */
function publicOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
  const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

// Handles the links sent by Supabase Auth:
// - PKCE links (?code=…) and token-hash links (?token_hash=…&type=…) are verified here;
// - implicit links (resent e-mails) carry the session in the URL fragment, which only the
//   browser can read: they are forwarded to /verify-email, which completes the sign-in.
// Expired or already-used links end on /verify-email (or /forgot-password) with a clear message.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = publicOrigin(request);
  const next = safeNextPath(searchParams.get('next'), '/dashboard');
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const errorCode = searchParams.get('error_code') || searchParams.get('error');
  const isRecovery = next.startsWith('/reset-password');

  const failure = (reason: string) => {
    const target = new URL(isRecovery ? '/forgot-password' : '/verify-email', origin);
    target.searchParams.set('error', reason);
    if (!isRecovery) target.searchParams.set('next', next);
    return NextResponse.redirect(target);
  };

  if (errorCode) {
    return failure(errorCode === 'otp_expired' ? 'link_expired' : 'confirmation_failed');
  }

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
    return failure(/expired/i.test(error.message) ? 'link_expired' : 'confirmation_failed');
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(new URL(next, origin));
    return failure(/expired/i.test(error.message) ? 'link_expired' : 'confirmation_failed');
  }

  // No code in the query: implicit link, the session (or error) is in the fragment.
  const target = new URL(isRecovery ? '/reset-password' : '/verify-email', origin);
  target.searchParams.set('next', next);
  return NextResponse.redirect(target);
}
