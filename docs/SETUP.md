# Setup & Operations

## Prerequisites

- Node.js 20+ (`@types/node` 20; Next 15 requires ≥ 18.18)
- npm (lockfile is `package-lock.json`)
- A Supabase project (hosted). The Supabase CLI is optional but recommended for migrations and type generation.

## 1. Install

```bash
npm install
```

## 2. Environment variables

Copy `.env.local.example` → `.env.local`:

| Variable | Required | Where to find it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes* | API → anon / publishable key |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | alias | same value; used as fallback if ANON_KEY is absent |
| `SUPABASE_SERVICE_ROLE_KEY` | for account deletion only | API → service_role. **Server-only.** Without it, `/account` deletion returns 503 but everything else works. |

`lib/supabase/env.ts` throws at startup if URL or key is missing.

## 3. Provision the database

### Option A — fresh project via SQL editor (how production was set up)
1. Supabase Dashboard → SQL Editor → paste `supabase/schema.sql` → Run.
2. Verify the two buckets `verification-documents` and `profile-avatars` exist and are private (Storage tab).

### Option B — Supabase CLI
```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push          # applies supabase/migrations/* in order
```
The migration history table on production was empty as of 2026‑09‑06 (see `supabase/backups/prod_migration_list_snapshot_2026-09-06.txt`); if you switch an existing project to CLI-managed migrations, use `supabase migration repair --status applied <timestamp>` for each already-applied file first.

### Auth settings (Dashboard → Authentication)
- **Email provider**: enabled, *Confirm email* ON (the app expects it).
- **Site URL**: your deployment URL.
- **Redirect URLs**: add `http://localhost:3000/auth/callback` and `https://<prod-domain>/auth/callback`.
- Email templates: default Supabase templates are used; the confirmation link must keep `{{ .ConfirmationURL }}` (PKCE).

### Realtime
Enable Realtime for `public.messages` (Database → Replication → `supabase_realtime` publication) so the chat updates live.

### Create an admin
Sign up normally, then in Table Editor set `profiles.role = 'admin'` for that user. Admin cannot be selected in the UI.

### Demo data (optional)
Create accounts in the app for `skipper.demo@`, `owner.demo@` and `broker.demo@findaskipper.test`, then run `supabase/seed.sql` in the SQL editor.

## 4. Run locally

```bash
npm run dev      # http://localhost:3000
```

The `dev` script deletes `.next-dev` before starting — `next.config.mjs` uses that folder as `distDir` in development to avoid stale-chunk errors (commit `22862f1`). Production builds use the normal `.next`.

## 5. Quality gates

```bash
npm run lint     # eslint . --max-warnings=0
npm test         # tsx --test tests/**/*.test.ts
npm run build    # type-check + production build
```

SQL non-regression scripts live in `supabase/tests/` and are run manually in the SQL editor against a staging/dev database — see [TESTING.md](./TESTING.md).

## 6. Deployment

The repository contains no deploy config; `.vercel` is git-ignored, which indicates a Vercel deployment.

Checklist for a new environment:
1. Set the four env vars above in the hosting provider (service role key as a **server** secret).
2. Add the deployment URL to Supabase Auth redirect allow-list.
3. Build command `npm run build`, output managed by Next.
4. The middleware matcher runs on every non-static path; no special edge config needed.
5. After deploy, sign up a test account and walk the flow: verify email → onboarding → publish mission → apply → accept → message → complete → review.

## 7. Regenerating database types

`lib/database.types.ts` is hand-maintained and `Database = any`. To get end-to-end typing:

```bash
npx supabase gen types typescript --project-id <ref> > lib/database.types.generated.ts
```
Then switch `Database` in `lib/database.types.ts` to the generated type and fix the resulting compile errors (expect a fair number — see [ROADMAP.md](./ROADMAP.md)).

## 8. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Missing Supabase env vars` on boot | `.env.local` missing or not loaded |
| "Delai depasse lors de la communication avec Supabase." | 12 s fetch timeout hit — Supabase unreachable or project paused |
| `/login?error=confirmation_failed` after clicking email link | Redirect URL not allow-listed, or PKCE code already used |
| Stuck on `/verify-email` | `email_confirmed_at` null; confirm email or disable confirmation in Auth settings |
| Redirect loop to `/onboarding` | `profiles.onboarding_completed_at` is null; complete onboarding or set it manually |
| Chat doesn't update live | Realtime not enabled for `messages` |
| Avatar shows initials although a file was uploaded | Storage read policy only allows owner/admin (see ROADMAP) |
| Account deletion returns 503 | `SUPABASE_SERVICE_ROLE_KEY` not set on the server |
| Stale/blank page in dev | Delete `.next-dev` (the dev script does this automatically) |
