# Security Model

## Principles observed in the codebase

1. **The browser is untrusted.** Every client component talks to Supabase with the public anon key; nothing it can do is safe unless RLS and triggers allow it.
2. **Postgres is the policy engine.** Row Level Security decides visibility/mutability; `BEFORE` triggers validate state transitions; `AFTER` triggers produce side-effects (`security definer`) so users never need write access to tables like `notifications`.
3. **One privileged credential**, `SUPABASE_SERVICE_ROLE_KEY`, used only in `app/api/account/delete/route.ts`, server-side, after re-authenticating the caller.
4. **Private storage + short-lived signed URLs** for anything user-uploaded.
5. **Defence in depth on redirects and email verification** in `middleware.ts` / `lib/auth.ts`.

## Authentication

- Supabase Auth, email + password. Email confirmation is expected to be **enabled** in the Supabase project (the app has a full verify-email flow and gates sensitive routes on `email_confirmed_at`).
- Sessions are cookie-based via `@supabase/ssr`; the middleware calls `auth.getUser()` on each request, which validates the JWT against Supabase (not just decoding it) and rotates the refresh token.
- PKCE code exchange happens in `GET /auth/callback`; the `next` parameter is validated by `safeNextPath` (must start with a single `/`) to prevent open redirects.
- Password reset uses Supabase's built-in flow (`resetPasswordForEmail` → callback → `/reset-password`).
- Resend confirmation uses `supabase.auth.resend`.

## Route gating (middleware)

| Condition | Result |
|---|---|
| Anonymous → private path | `/login?next=…` |
| Anonymous → unknown path | `/login?next=…` |
| Signed in, unverified email → sensitive path | `/verify-email` |
| Signed in, non-admin → `/dashboard/admin/**` | `/dashboard` |
| Signed in → auth pages | dashboard / onboarding |

Server pages (`/dashboard/**`) re-check user and role; the admin verifications page re-checks `role='admin'` client-side too. These UI checks are convenience — RLS is what actually protects the data.

## RLS policy matrix (from `schema.sql` after all hardening migrations)

Legend: 👤 = own row (`auth.uid()`), 👑 = admin (`is_admin(auth.uid())`), 🌐 = anyone incl. anonymous.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | 🌐 if `role='skipper'`; 👤; 👑 all | 👤 (`id = uid`) | 👤 but `role` & `identity_verified` must equal current values; 👑 any | — |
| `availability_slots` | 🌐 for skipper rows | 👤 skipper | 👤 skipper | 👤 skipper |
| `missions` | 🌐 | poster = uid, `status='open'`, role ∈ demandeur roles | poster; `is_featured` & `applicants_count` frozen; 👑 any | — |
| `applications` | skipper 👤 or mission poster | skipper 👤, `status='pending'`, role skipper, mission `open` | skipper or poster (trigger restricts to poster + `pending→accepted/rejected`) | skipper 👤, only `pending` |
| `conversations` | participant **and** accepted application exists | demandeur = uid = mission poster **and** accepted application exists | — | — |
| `messages` | participant of an accepted conversation | sender = uid, participant of accepted conversation | — | — |
| `favorites` | 👤 | 👤 | 👤 | 👤 |
| `reviews` | 🌐 | reviewer = uid, reviewer ≠ reviewee, mission completed, exact (poster ↔ accepted skipper) pair | — | — |
| `notifications` | 👤 | — (triggers only) | 👤; `user_id`, `type`, `payload`, `created_at` frozen ⇒ only `read` can change | — |
| `verification_requests` | 👤; 👑 all | 👤 | 👤 while `reviewed_by`/`reviewed_at` null and status ∈ draft/submitted; 👑 any | — |
| `verification_documents` | 👤; 👑 all | 👤 | — | 👤; 👑 |
| `storage.objects` (`verification-documents`) | owner folder or 👑 | owner folder | — | owner folder or 👑 |
| `storage.objects` (`profile-avatars`) | owner folder or 👑 | owner folder | — | owner folder or 👑 |

Notes:
- Skipper avatars in the private bucket are readable **only by the owner and admins** at the storage layer; other visitors see them because the *client* (running as the visitor) calls `createSignedUrl`… which would fail for non-owners. In practice `resolveAvatarUrl` returns `null` for other users' `storage:` avatars and the UI falls back to initials. Confirm this matches the intended behaviour before going further (see [ROADMAP.md](./ROADMAP.md)).
- `profiles` policies reference `profiles` itself; the recursion was broken by `is_admin()` (`security definer`). Do not reintroduce `exists (select … from profiles …)` inside `profiles` policies without going through `is_admin`.
- `missions` are readable by anonymous users, including `cancelled`/`completed` ones and the poster id. Poster names are joined only when the poster is a skipper (never) or by the poster themselves — the missions listing therefore shows no poster identity to guests.

## Trigger-level invariants

| Invariant | Function |
|---|---|
| Users cannot escalate role or self-verify | `profiles` update policy |
| Mission status graph enforced; non-status columns immutable via status update path | `enforce_mission_status_transition` |
| Application status graph; only owner; mission must be open to accept | `enforce_application_status_transition` |
| Exactly one accepted application per mission | partial unique index |
| Notifications only from server-side triggers, payload immutable | `notify_on_*`, update policy |
| Reviews only for real completed engagements, no duplicates, no self-review | RLS + `enforce_review_integrity` + unique indexes |
| `applicants_count` never negative | `greatest(… - 1, 0)` |
| `identity_verified` flips only via verification workflow | `sync_profile_identity_from_verification` |

All of these have SQL non-regression scripts in `supabase/tests/` — run them after any policy change (see [TESTING.md](./TESTING.md)).

## Secrets & configuration

| Variable | Exposure | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `…_PUBLISHABLE_KEY`) | public | anon/publishable key; safe because of RLS |
| `SUPABASE_SERVICE_ROLE_KEY` (or `NEXT_SUPABASE_SERVICE_ROLE_KEY`) | **server only** | account deletion. Never prefix with `NEXT_PUBLIC_`. |

`.env.local`, `.env`, `.vercel`, `supabase/.temp` are git-ignored. `supabase/backups/*.json` contain **real-looking production test data (emails, phone numbers, names)** captured before a cleanup on 2026‑09‑07 — treat the repo as confidential and consider purging these files from history if the repository is ever shared.

## Client-side hardening

- Input `next` paths sanitised (`safeNextPath`).
- Avatar / gallery URLs accepted only if `https:` (`normalizeHttpsUrl`, `resolveAvatarUrl`).
- Phone numbers validated per country with `libphonenumber-js` and stored normalised.
- Supabase fetches time out after 12 s to avoid hanging UI on network failure.
- Sensitive server logs were removed (`chore: remove sensitive server logs from dashboard and middleware`, 2026‑08‑21).

## Known gaps / recommendations

- No rate limiting on `/api/account/delete` or on message inserts beyond Supabase defaults.
- No CSP / security headers configured in `next.config.mjs`.
- `messages.text` is rendered as text (React escapes), but there is no length limit at DB level.
- Admin promotion is a manual DB edit; there is no audit log of admin actions other than `reviewed_by` on verification requests.
- `Database = any` disables compile-time checking of column names — a typo silently becomes a runtime 400.
- Review these when preparing a formal security audit.
