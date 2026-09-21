# Contributing

## Workflow

1. Branch from `main` (`feat/…`, `fix/…`, `security/…`, `chore/…`).
2. Keep commits small and imperative; existing history uses optional prefixes: `feat:`, `fix:`, `security:`, `chore:`.
3. Before opening a PR run the local gate:
   ```bash
   npm run lint && npm test && npm run build
   ```
4. If you touched anything under `supabase/`, also run **every** script in `supabase/tests/` against a database with your migration applied (see `docs/TESTING.md`).
5. Update the relevant file in `docs/` when behaviour changes (SPECS for features, DATA_MODEL for schema, SECURITY for policies, DECISIONS for new trade-offs).

## Code conventions

- TypeScript strict; import via `@/…` alias; single quotes; 2-space indent; trailing semicolons.
- Pages under `app/` are client components by default in this codebase (`'use client'`) except the dashboards and home page. Prefer a server component when the page only reads data and needs no interactivity.
- Data access: `createClient()` from `lib/supabase/client` (browser) or `lib/supabase/server` (RSC / route handlers). Never instantiate `@supabase/supabase-js` directly outside `app/api/account/delete`.
- No string literals in JSX — go through `useLocale().copy` / `getExtraCopy(locale)` and add the key to all ten locales (`docs/I18N.md`).
- Reusable UI goes in `components/ui.tsx` (primitives) or a dedicated `components/<widget>.tsx`.
- Keep `lib/` free of React and Next imports except `lib/i18n/server.ts` (uses `next/headers`).
- Domain enum values (zones, boat types, mission types) are French canonical strings — add them to `lib/profile-options.ts` **and** to `lib/i18n/options.ts`.

## Adding a database change

1. Create `supabase/migrations/<YYYYMMDDHHMMSS>_<snake_case_summary>.sql`. Use `drop policy if exists` / `create or replace function` so the file is idempotent, as the existing migrations do.
2. Apply the same change to `supabase/schema.sql` so it keeps reflecting the full current state.
3. Enable RLS on any new table and write policies **before** wiring UI. Default deny.
4. If you add a trigger or a policy the app depends on, add a `supabase/tests/<name>_non_regression.sql` script that raises on drift.
5. Update `lib/database.types.ts` (until generated types are adopted) and `docs/DATA_MODEL.md`.
6. Apply to your dev/staging project, run the SQL tests, then run the manual QA path affected.

## Adding a route

1. Create the page under `app/`.
2. Classify it in `middleware.ts` (`PUBLIC_PATHS` or `PRIVATE_PATHS`) and, if it needs a confirmed email, in `lib/auth.ts:VERIFIED_EMAIL_REQUIRED_PATHS`.
3. Add a nav link in `components/Nav.tsx` if relevant, with translations.
4. Add a `tests/auth-phone.test.ts` assertion for `requiresVerifiedEmailPath` if you extended the list.

## Security checklist for PRs

- [ ] No `NEXT_PUBLIC_` prefix on secrets; service role key used only server-side.
- [ ] New tables have RLS enabled and policies for every verb you use.
- [ ] `WITH CHECK` freezes columns the user must not change.
- [ ] Redirect targets go through `safeNextPath`.
- [ ] External URLs validated as `https:`.
- [ ] Storage paths start with `auth.uid()`.
- [ ] SQL non-regression scripts pass.

## Reporting issues

Describe: role(s) involved, exact route, expected vs actual, and whether the failure came from the UI or from a Supabase error (`code`, `message`). RLS denials surface as `42501` or empty results — say which.
