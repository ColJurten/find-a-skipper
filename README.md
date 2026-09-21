# Find a Skipper

A two-sided maritime marketplace: boat owners, brokers and charter companies publish **missions** (day trips, weekly charters, seasonal work, deliveries); professional **skippers** browse them, apply, get accepted and chat with the poster. An admin back-office verifies skipper identity documents.

Live UI is available in 10 languages (FR default, EN, ES, IT, DE, PT, NL, EL, NO, DA).

> Documentation index: [`docs/`](./docs) — start with [ARCHITECTURE.md](./docs/ARCHITECTURE.md) and [SPECS.md](./docs/SPECS.md).

## Stack at a glance

| Layer | Technology |
|---|---|
| Framework | [Next.js 15](https://nextjs.org) (App Router, React 18, TypeScript strict) |
| Backend / DB | [Supabase](https://supabase.com) — Postgres + Auth + Storage + Realtime |
| Data access | `@supabase/ssr` browser & server clients, **no ORM, no custom API layer** — the UI talks to Postgres through PostgREST, secured by Row Level Security |
| Business rules | Postgres triggers & RLS policies (status workflows, notifications, counters, review integrity) |
| Styling | Tailwind CSS 3, custom brand palette, Inter + Plus Jakarta Sans via `next/font` |
| Icons | `lucide-react` |
| i18n | Home-grown dictionaries in `lib/i18n/`, locale stored in a cookie |
| Phone | `libphonenumber-js` (E.164 storage, per-country validation) |
| Tests | `node:test` via `tsx` for TS helpers; SQL non-regression scripts for RLS/triggers |
| Lint | ESLint 9 flat config (`eslint-config-next`) |

No `supabase/config.toml`, no CI config and no deploy config are versioned; the project is designed to run against a hosted Supabase project and deploy on Vercel (`.vercel` is git-ignored).

## Quick start

```bash
# 1. Install
npm install

# 2. Configure Supabase
cp .env.local.example .env.local
#    → fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
#    → (optional, server-only) SUPABASE_SERVICE_ROLE_KEY for account deletion

# 3. Apply the database schema to your Supabase project
#    Either run supabase/schema.sql in the SQL editor (fresh project),
#    or push supabase/migrations/ with the Supabase CLI.

# 4. Run
npm run dev          # http://localhost:3000  (uses .next-dev as build dir)
```

Other scripts:

```bash
npm run build        # production build
npm run start        # serve production build
npm run lint         # eslint, zero warnings allowed
npm test             # tsx --test tests/**/*.test.ts
```

Full setup, env vars and deployment notes: [docs/SETUP.md](./docs/SETUP.md).

## Repository layout

```
app/                    Next.js App Router pages & route handlers
  api/account/delete/   POST — deletes the current auth user (service role)
  auth/callback/        GET  — PKCE code exchange after email confirmation
  dashboard/            Role router + skipper / demandeur / admin dashboards
  dashboard/admin/verifications/  Admin review of identity documents
  missions/, missions/[id], missions/new     Public listing, detail + apply, create
  my-missions/, my-missions/[id]             Poster side: manage applications, status, reviews
  my-applications/      Skipper side: track / cancel applications
  messages/             Realtime chat (accepted applications only)
  notifications/        In-app notification inbox
  profile/, onboarding/, account/            Profile edit, role onboarding, account deletion
  login/, signup/, forgot-password/, reset-password/, verify-email/
  cgu/, confidentialite/, cookies/, mentions-legales/   Legal pages
components/             Shared UI (Nav, ui primitives, form widgets, locale provider)
lib/                    Domain helpers
  auth.ts               Redirect safety, email-verification path rules
  onboarding.ts         Role completeness rules, dashboard routing
  profile.ts, profile-options.ts, phone.ts, media.ts
  database.types.ts     Hand-written row types (Database = any for now)
  i18n/                 Locales, dictionaries, formatting, server helper
  supabase/             Browser / server clients, env resolution, fetch timeout
middleware.ts           Session refresh + auth / email-verified / admin gating
supabase/
  schema.sql            Consolidated schema (tables, RLS, triggers, buckets)
  migrations/           19 timestamped migrations (Aug–Sep 2026)
  tests/                SQL non-regression checks for RLS & workflows
  seed.sql              Demo data (requires pre-created auth users)
  backups/              JSON snapshots taken before a prod test-data cleanup
tests/                  node:test unit tests for lib helpers
docs/                   Project documentation (this is where you are headed)
```

## Documentation

| File | What it covers |
|---|---|
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System design, request flow, where logic lives (middleware vs pages vs Postgres) |
| [docs/SPECS.md](./docs/SPECS.md) | Functional specification: roles, user journeys, screens, business rules |
| [docs/DATA_MODEL.md](./docs/DATA_MODEL.md) | Every table, column, state machine, trigger and storage bucket |
| [docs/SECURITY.md](./docs/SECURITY.md) | Auth model, RLS policy matrix, storage policies, threat notes |
| [docs/I18N.md](./docs/I18N.md) | How localisation works and how to add a language or a string |
| [docs/SETUP.md](./docs/SETUP.md) | Local dev, env vars, database provisioning, deployment |
| [docs/TESTING.md](./docs/TESTING.md) | Unit tests, SQL non-regression suites, manual QA flows |
| [docs/ROADMAP.md](./docs/ROADMAP.md) | Known gaps, tech debt and planned features inferred from the code |
| [docs/DECISIONS.md](./docs/DECISIONS.md) | Architecture decision records (ADR-lite) |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Conventions, branching, how to add a migration |
| [AGENTS.md](./AGENTS.md) | Guidance for AI coding agents working in this repo |

## Status

Production release finalised 2026‑09‑10 (`feat: finalize multilingual production release`). Core marketplace loop (publish → apply → accept → chat → complete → review) is implemented and RLS-hardened. Favorites table exists but has no UI; admin dashboard is limited to identity verification. See [ROADMAP.md](./docs/ROADMAP.md).

## License

Private — all rights reserved. `package.json` declares `"private": true`; no open-source license is attached.
