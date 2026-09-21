# Roadmap, Known Issues & Tech Debt

Everything below was inferred from the code, schema comments and commit history on 2026‑09‑18. Items are grouped by urgency; nothing here is a committed plan.

## 🔴 Likely bugs to verify first

| # | Observation | Where | Why it matters |
|---|---|---|---|
| 1 | **Skipper avatars uploaded to storage are invisible to other users.** The `profile-avatars` SELECT policy allows only the owner folder or admins, yet `/skippers` and `/skippers/[id]` call `createSignedUrl` as the *viewer*. Non-owners get `null` and see initials. | `schema.sql` storage policies; `lib/media.ts`; `app/skippers/*` | Core marketing surface shows no photos. Fix: either a public-read policy for `profile-avatars` (bucket can stay private, policy `for select using (bucket_id='profile-avatars')`), or make the bucket public, or sign URLs server-side. |
| 2 | **Cannot resubmit a rejected verification request.** User update policy requires `reviewed_by is null and reviewed_at is null`; the admin rejection sets both. The profile page's "Submit" (`update({status:'submitted', …})`) will be denied by RLS and there is no user DELETE policy on `verification_requests`. | `schema.sql` §8; `app/profile/page.tsx`; `app/dashboard/admin/verifications/page.tsx` | Rejected skippers are stuck. Fix: allow `rejected → submitted` transition clearing `reviewed_*`, or have the admin flow clear them. |
| 3 | **Admins cannot actually change mission status.** Policy "Admins can update any mission" exists, but `enforce_mission_status_transition` raises unless `auth.uid() = poster_id`. Same shape for applications (owner only). | `schema.sql` §2–3 | Admin moderation (cancel abusive mission) impossible without service role. Decide whether admins should be allowed and adjust the trigger. |
| 4 | `Profile.email` is declared in `lib/database.types.ts` but no such column exists. Harmless today (never selected), but misleading. | `lib/database.types.ts` | Type drift. |

## 🟠 Tech debt

- **`Database = any`** — Supabase client is untyped. Generate types with the CLI and adopt them (SETUP §7).
- **Route lists duplicated** in `middleware.ts` (`PUBLIC_PATHS`, `PRIVATE_PATHS`) and `lib/auth.ts` (`VERIFIED_EMAIL_REQUIRED_PATHS`). Extract one `lib/routes.ts`.
- **Two dictionaries** (`copy.ts` untyped `as const`, `extra.ts` typed) — merge into one typed dictionary so missing translations fail the build.
- **French-only literals** in `lib/onboarding.ts:missingRoleFields`, `lib/profile.ts` (`'Disponibilité non renseignée'`, `'indicatif'`), `lib/supabase/fetch-with-timeout.ts` error strings, `app/api/account/delete/route.ts` responses.
- **No pagination** on `/skippers`, `/missions`, `/my-missions`, `/my-applications`, `/notifications`; all filtering is client-side over the full table. Fine for MVP volume, will not scale.
- **Reputation computed client-side** by fetching all reviews on `/skippers`. Replace with a SQL view / materialised aggregate (`avg(rating)`, `count(*)` per `reviewee_id`).
- **Data fetching in `useEffect`** with hand-rolled loading/error state on every page. Consider server components + `Suspense`, or a light query cache, to reduce duplication and flashes.
- `sync_mission_status_from_conversation()` is a **no-op trigger** kept for compatibility — drop it in a future migration.
- `schema.sql` and `migrations/` must be edited **in parallel**; there is no check that they agree. Consider generating `schema.sql` from a fresh `supabase db reset` or dropping it.
- `supabase/backups/*.json` hold personal data of test users; purge from git history before sharing the repo.
- `dev` script hack (`rmSync('.next-dev')`) papers over a stale-chunk issue; re-evaluate after upgrading Next.
- `eslint-config-next@16` alongside `next@15` — align versions.
- No CI, no pre-commit hooks.

## 🟡 Product gaps (schema ready, no UI)

| Feature | State |
|---|---|
| **Favorites** (skippers or missions) | Table + RLS exist; no button anywhere. |
| **Featured missions** (`missions.is_featured`) | Column + admin policy; no admin toggle and the listing does not surface it. |
| **Admin: user & mission moderation** | Only verification review exists. |
| **Certification `verified` flag** | Stored per certification; nothing sets it to `true` (verification workflow only flips `identity_verified`). |
| **Gallery** (`gallery_urls`) | Editable as URLs; no upload to storage like avatars. |
| **Skipper-initiated contact** | Conversations can only be started by the poster after acceptance. |
| **Mission editing** | After publication only `status` can change (trigger). Owners cannot fix a typo. |

## 🟢 Ideas for the next iterations

1. Email / push notifications on top of the `notifications` table (Supabase Edge Function on insert, or a Postgres webhook).
2. Geographic search (departure port geocoding, distance filter) instead of coarse zone enums.
3. Availability-aware matching: intersect `availability_slots` with `missions.start_date`.
4. Contracts / payments (Stripe Connect) once the marketplace loop is validated.
5. Public SEO pages for missions and skippers (currently client-rendered → weak indexing). Move `/missions/[id]` and `/skippers/[id]` to server components with `generateMetadata`.
6. Observability: Sentry (or similar) for the client, Supabase log drains for RLS denials.
7. E2E tests with Playwright (see TESTING.md §5).
8. Regional expansion beyond the initial French/Mediterranean focus — most enums and legal copy are FR-centric even though the UI is translated.

## Release history (from git)

| Date | Milestone |
|---|---|
| 2026‑08‑01 → 08‑04 | Initial commit, dashboards, first RLS fixes |
| 2026‑08‑21 → 08‑22 | Env stabilisation, RLS hardening, mission/application status workflow, skipper public search, responsive messaging |
| 2026‑08‑24 | Notifications pipeline, role-based onboarding, profile verification workflow |
| 2026‑08‑26 | Systematic RLS hardening per table + SQL non-regression suites; recursion fix |
| 2026‑09‑07 → 09‑08 | Avatars upload, languages, certifications, availability slots, application withdrawal, reviews hardening |
| 2026‑09‑10 | **Multilingual production release** (10 locales, legal pages, account deletion) |
