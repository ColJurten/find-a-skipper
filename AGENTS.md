# AGENTS.md — guidance for AI coding agents

This file is read by Claude Code (`CLAUDE.md` includes it), Codex, Cursor and similar tools. Keep it short and factual; long-form docs live in `docs/`.

## What this project is

Find a Skipper: Next.js 15 (App Router, TS strict) + Supabase (Postgres/RLS, Auth, Storage, Realtime) marketplace connecting skippers with boat owners/brokers/charter companies. UI in 10 languages. **No custom backend** — the browser talks to PostgREST; security and business rules are in Postgres. Read `docs/ARCHITECTURE.md` first, then `docs/DATA_MODEL.md`.

## Commands

```bash
npm run dev      # dev server (wipes .next-dev first)
npm run lint     # eslint, zero warnings
npm test         # node:test via tsx, tests/**/*.test.ts
npm run build    # type-check + build
```
SQL non-regression: paste `supabase/tests/*.sql` into the Supabase SQL editor (no automated runner).

## Hard rules

1. **Never weaken RLS or triggers to make a UI feature work.** If the DB rejects an operation, the fix is a reviewed migration + updated `schema.sql` + a non-regression script, not a client workaround.
2. **Never expose `SUPABASE_SERVICE_ROLE_KEY`** to client code or `NEXT_PUBLIC_*`. It is only used in `app/api/account/delete/route.ts`.
3. **Keep `supabase/schema.sql` and `supabase/migrations/` in sync** — every migration must be mirrored in `schema.sql`.
4. **Stored enum values are French** (`'À la journée'`, `'Méditerranée'`, …). Translate on display via `lib/i18n/options.ts`; never write translated values to the DB.
5. **All user-facing strings go through i18n** (`useLocale().copy` or `getExtraCopy(locale)`), in all ten locales listed in `lib/i18n/locales.ts`.
6. **Route changes** must be reflected in `middleware.ts` (`PUBLIC_PATHS`/`PRIVATE_PATHS`) and `lib/auth.ts` (`VERIFIED_EMAIL_REQUIRED_PATHS`).
7. **Redirects** use `safeNextPath`; external URLs must be `https:`.
8. Do not add dependencies for things already covered: Tailwind for styling, `lucide-react` for icons, `libphonenumber-js` for phones, `iso-639-1` for language names. No ORM, no state library, no i18n library without an ADR in `docs/DECISIONS.md`.
9. Don't commit `.env*`, `.next*`, or anything under `supabase/.temp`.

## Where things are

| Need | Look at |
|---|---|
| Auth gating / redirects | `middleware.ts`, `lib/auth.ts` |
| Supabase clients | `lib/supabase/{client,server,env,fetch-with-timeout}.ts` |
| Role & onboarding rules | `lib/onboarding.ts` |
| Row types | `lib/database.types.ts` (hand-written, `Database = any`) |
| Translations | `lib/i18n/copy.ts`, `lib/i18n/extra.ts`, `lib/i18n/options.ts` |
| UI primitives | `components/ui.tsx` |
| Schema, RLS, triggers | `supabase/schema.sql` (+ `migrations/`) |
| Business-rule tests | `supabase/tests/*.sql` |
| Unit tests | `tests/*.test.ts` |
| Known bugs / debt | `docs/ROADMAP.md` |

## Conventions

- Pages are mostly `'use client'` with `useEffect` data loading, `loading`/`error` state and `createClient()` from `lib/supabase/client`. Match that pattern for consistency, or use a server component + `lib/supabase/server` for read-only pages.
- Roles: `skipper` | `owner` | `broker` | `charter_company` | `admin`. "Demandeur" = the three non-skipper, non-admin roles.
- Mission statuses: `open → assigned → completed | cancelled`. Application statuses: `pending → accepted | rejected`.
- Notification types: `new_application`, `application_accepted`, `application_rejected`, `mission_assigned`, `mission_status_changed`, `new_message` — created only by triggers.
- Storage: `verification-documents/<uid>/…`, `profile-avatars/<uid>/…`, both private, accessed with signed URLs.
- Commit style: short imperative subject, optional `feat:`/`fix:`/`security:`/`chore:` prefix.

## When you finish a change

- Run `npm run lint && npm test && npm run build`.
- If schema changed: run every `supabase/tests/*.sql`, update `docs/DATA_MODEL.md` and `docs/SECURITY.md`.
- If behaviour changed: update `docs/SPECS.md`; if a trade-off was made, append to `docs/DECISIONS.md`.
