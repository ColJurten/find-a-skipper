# Architecture

Find a Skipper is a **"thick database, thin server"** application. There is no bespoke backend: Next.js renders the UI, and every read/write goes straight from the browser (or from a server component) to Supabase's PostgREST endpoint. Authorisation and business invariants are enforced *inside Postgres* with Row Level Security and triggers, so the frontend can be treated as untrusted.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Browser                                                              │
│  React client components ──► @supabase/ssr createBrowserClient       │
│  (most pages are 'use client')     │   ▲ Realtime (postgres_changes) │
└────────────────────────────────────┼───┼─────────────────────────────┘
                                     │   │
┌────────────────────────────────────┼───┼─────────────────────────────┐
│ Next.js 15 (Vercel-style edge/node)│   │                             │
│  middleware.ts ── refresh session, gate routes by auth/role/email    │
│  Server components (layout, dashboards) ── createServerClient        │
│  Route handlers: /auth/callback, /api/account/delete (service role)  │
└────────────────────────────────────┼───┼─────────────────────────────┘
                                     ▼   │
┌──────────────────────────────────────────────────────────────────────┐
│ Supabase project                                                     │
│  Auth (email+password, PKCE email confirmation, password reset)      │
│  PostgREST ──► Postgres                                              │
│     • RLS policies on every table                                    │
│     • Triggers: profile bootstrap, status machines, counters,        │
│       notifications fan-out, review integrity, identity sync         │
│  Storage: verification-documents, profile-avatars (private buckets)  │
│  Realtime: messages INSERT stream per conversation                   │
└──────────────────────────────────────────────────────────────────────┘
```

## 1. Runtime layers

### 1.1 Middleware (`middleware.ts`)

Runs on every request except static assets and `/api/*`. Responsibilities, in order:

1. Build a `createServerClient` with cookie pass-through and call `auth.getUser()` — this refreshes the Supabase session cookie on every navigation.
2. `/verify-email` with a verified user → redirect to onboarding or the role dashboard.
3. Unverified user on a **verified-email-required** path (`lib/auth.ts:VERIFIED_EMAIL_REQUIRED_PATHS`) → `/verify-email?email=…&next=…`.
4. `/dashboard/admin/**` for a non-admin → `/dashboard`.
5. Anonymous user on a `PRIVATE_PATHS` route → `/login?next=…`.
6. Authenticated user on `/login`, `/signup`, `/forgot-password`, `/reset-password` → bounce to verify-email / onboarding / dashboard.
7. Anything not in `PUBLIC_PATHS` and anonymous → `/login`.

Route classification lives in two places (`middleware.ts` and `lib/auth.ts`); keep them in sync when adding routes.

### 1.2 Root layout (`app/layout.tsx`)

Server component. Resolves the locale from the `fas-locale` cookie, loads the current user's profile once, and mounts `<LocaleProvider>` → `<Nav profile>` → page → `<LegalFooter>`. `generateMetadata` is locale-aware.

### 1.3 Pages

- **Server components** (`app/page.tsx`, `app/dashboard/**`): read with `lib/supabase/server.ts`, redirect with `next/navigation`. The `/dashboard` page is a pure router that sends the user to `/dashboard/{skipper|demandeur|admin}` or to `/onboarding`.
- **Client components** (everything else): `'use client'`, fetch inside `useEffect` with `lib/supabase/client.ts`, manage `loading` / `error` state locally, mutate directly with `.insert()/.update()/.delete()`. There is no shared data-fetching layer (no SWR/React Query), no server actions and no form library.

Pages that need `useSearchParams` wrap their form in `<Suspense>` (see `app/signup/page.tsx`).

### 1.4 Route handlers

| Route | Purpose |
|---|---|
| `GET /auth/callback?code=…&next=…` | Exchanges the PKCE code for a session (`exchangeCodeForSession`) after email confirmation / password reset, then redirects to `next`. Failure → `/login?error=confirmation_failed`. |
| `POST /api/account/delete` | Authenticates the caller with the anon client, then uses `SUPABASE_SERVICE_ROLE_KEY` to `auth.admin.deleteUser(user.id)`. Cascades through `profiles(id) references auth.users on delete cascade`. Returns 503 if the key is not configured. |

The service-role key is the **only** privileged credential and is used exclusively here.

### 1.5 Supabase client wrappers (`lib/supabase/`)

- `env.ts` — resolves `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (falls back to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`); throws on absence.
- `fetch-with-timeout.ts` — wraps `fetch` with a 12 s `AbortController` and forwards caller aborts. Injected via `global.fetch` into both clients so a hung Supabase call surfaces as a French error string instead of an infinite spinner.
- `client.ts` / `server.ts` — thin factories over `createBrowserClient` / `createServerClient<Database>`. The server variant swallows cookie-write errors when invoked during RSC render (middleware already refreshed the session).

## 2. Where the business logic lives

| Concern | Enforced by | File |
|---|---|---|
| Who may read / write which row | RLS policies | `supabase/schema.sql`, `migrations/*harden*` |
| Profile auto-creation from signup metadata | `handle_new_user()` trigger on `auth.users` | schema §1 |
| Mission status machine (`open → assigned → completed/cancelled`) | `enforce_mission_status_transition()` BEFORE UPDATE | schema §2 |
| Application status machine (`pending → accepted/rejected`, owner only) | `enforce_application_status_transition()` | schema §3 |
| Accepting one application auto-rejects the others and flips the mission to `assigned` | `sync_mission_status_from_application()` AFTER INSERT/UPDATE | schema §3 |
| One accepted application per mission | partial unique index | schema §3 |
| `applicants_count` denormalised counter | `increment_applicants_count()` / `decrement_applicants_count_on_delete()` | schema §3 |
| Notifications fan-out | `notify_on_*` AFTER triggers | schema §3–4 |
| Chat only between poster and *accepted* skipper | RLS on `conversations` & `messages` | schema §4 |
| Reviews only after `completed`, only between the two participants, no self-review | RLS + `enforce_review_integrity()` + unique index | schema §6 |
| Identity verification approve/reject → `profiles.identity_verified` | `sync_profile_identity_from_verification()` | schema §8 |
| Users cannot change their own `role` or `identity_verified` | `WITH CHECK` sub-selects on `profiles` update policy | schema §1 |
| Route gating, redirect safety, email-verified requirement | `middleware.ts`, `lib/auth.ts` | — |
| Role onboarding completeness | `lib/onboarding.ts` (pure functions), `profiles.onboarding_step/_completed_at` | — |
| Phone normalisation / validation | `lib/phone.ts` | — |

The UI mirrors these rules for UX (disabling buttons, showing statuses), but **the database is the source of truth**. Every SQL test under `supabase/tests/` asserts a database-side guarantee, not a UI one.

## 3. Key data flows

### Signup → profile
1. `app/signup/page.tsx` calls `supabase.auth.signUp({ email, password, options: { emailRedirectTo, data: {...role fields} } })`.
2. Postgres trigger `on_auth_user_created` copies `raw_user_meta_data` into `public.profiles`, setting `onboarding_step = 'role_details'`.
3. If no session is returned (email confirmation on), user lands on `/verify-email`; the confirmation link hits `/auth/callback` which creates the session.
4. Middleware redirects to `/onboarding` until `onboarding_completed_at` is set (`lib/onboarding.ts:onboardingRequired`).

### Mission lifecycle
```
poster: /missions/new  ──insert missions(status='open')──►
skipper: /missions/[id] ──insert applications(status='pending')──► trigger: applicants_count++, notify poster (new_application)
poster: /my-missions/[id] ──update applications set status='accepted'──►
        triggers: other pending → rejected (notifies each), mission → assigned (notifies skipper), poster may now insert a conversation
poster: /my-missions/[id] ──update missions set status='completed'|'cancelled'──► notify accepted skipper
either party: insert reviews (only when completed)
```

### Messaging
`app/messages/page.tsx` lists conversations the user participates in (RLS restricts to accepted pairs), loads messages, and subscribes to `postgres_changes` INSERTs filtered by `conversation_id`. Sending inserts a row; the `notify_on_message_created` trigger creates a `new_message` notification for the other participant.

### Identity verification
Skipper (or any user) uploads files to `verification-documents/<uid>/…`, rows in `verification_documents`, then flips `verification_requests.status` to `submitted`. Admin at `/dashboard/admin/verifications` reads via signed URLs (120 s) and sets `approved`/`rejected` (+ reason). Trigger syncs `profiles.identity_verified`.

### Avatars
Either an `https://` URL or `storage:profile-avatars/<uid>/<file>`. `lib/media.ts:resolveAvatarUrl` turns the latter into a 10‑minute signed URL. Bucket is private.

## 4. Internationalisation

Cookie-based (`fas-locale`), no URL prefix, no `next-intl`. Dictionaries are TypeScript objects in `lib/i18n/copy.ts` (main) and `lib/i18n/extra.ts` (added later, separate shape). `lib/i18n/options.ts` localises domain enum labels (zones, boat types, mission types, roles) while the **stored values stay French** (`'Méditerranée'`, `'À la journée'`…). See [I18N.md](./I18N.md).

## 5. Styling

Tailwind with a brand palette declared in `tailwind.config.ts` (`navy`, `navyDeep`, `offwhite`, `lightblue`, `gold`, `anthracite`). Two Google fonts exposed as CSS variables. `app/globals.css` adds `fade-in*` and `lift-card` utilities. Reusable primitives (`Field`, `TextInput`, `Select`, `Button`, `Badge`, `ErrorBanner`, `EmptyState`) live in `components/ui.tsx`; domain widgets (`phone-input`, `certification-select`, `language-select`, `multi-select-tags`, `availability-editor`, `password-input`) sit alongside.

## 6. Build & tooling notes

- `next.config.mjs` uses `.next-dev` as `distDir` in development; the `dev` script wipes it first (workaround for a stale-chunk issue, see commit `22862f1`).
- `tsconfig.json` is strict with the `@/*` alias to repo root.
- `lib/database.types.ts` is hand-written; `Database` is `any` so the Supabase client is effectively untyped. Regenerate with `supabase gen types` when the CLI is adopted.
- No CI pipeline is versioned; `npm run lint && npm test` is the local gate.

## 7. Module dependency sketch

```
app/**  ──► components/**  ──► lib/i18n, lib/profile-options, lib/phone
   │
   ├──► lib/supabase/{client,server}  ──► lib/supabase/env, fetch-with-timeout
   ├──► lib/auth, lib/onboarding, lib/profile, lib/media
   └──► lib/database.types
middleware.ts ──► lib/supabase/env, lib/auth, lib/onboarding
```

`lib/` never imports from `app/` or `components/`. `lib/i18n/server.ts` is the only `lib` module that touches `next/headers`.
