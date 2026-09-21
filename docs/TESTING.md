# Testing

Three layers exist today: TypeScript unit tests for pure helpers, SQL non-regression scripts that introspect the live database, and manual end-to-end QA. There is no browser/E2E automation and no CI.

## 1. Unit tests (`tests/`)

Runner: Node's built-in `node:test` executed through `tsx` so `@/` aliases and TS work without a build.

```bash
npm test          # tsx --test tests/**/*.test.ts
```

| File | Covers |
|---|---|
| `tests/auth-phone.test.ts` | `safeNextPath` open-redirect guard, `requiresVerifiedEmailPath` route list, `buildVerifyEmailPath` query encoding, `isEmailVerified`, phone helpers (FR default, E.164 formatting, per-country validation, parse from stored) |
| `tests/supabase-env.test.ts` | `getSupabaseEnv` key precedence (`ANON_KEY` > `PUBLISHABLE_KEY`) and missing-var error |

Conventions: `import test from 'node:test'`, `assert/strict`, one file per lib module or concern. Anything in `lib/` that has no React/Next dependency is a candidate (e.g. `lib/onboarding.ts`, `lib/profile.ts`, `lib/i18n/options.ts` are currently untested).

## 2. SQL non-regression scripts (`supabase/tests/`)

Each file is a `DO $$ … $$` block that inspects `pg_policies`, `pg_trigger`, `pg_proc` etc. and `RAISE EXCEPTION` on any drift from the hardened contract. They are **not** executed automatically — run them in the Supabase SQL editor (or `psql`) against a database that has all migrations applied. Success = the block completes without error.

| Script | Guarantees checked |
|---|---|
| `rls_p0_security_non_regression.sql` | `profiles` update locks `role` / `identity_verified`; `missions` update locks `is_featured` / `applicants_count`; conversation insert restricted to poster |
| `rls_status_workflow_non_regression.sql` | Accepted-only conversation/message access; acceptance auto-rejects others and syncs mission to `assigned` |
| `notifications_non_regression.sql` | Notification type names normalised; auto-reject emits `application_rejected` |
| `notifications_workflow_non_regression.sql` | Notifications update policy read-only except `read`; event functions match transitions; message notifications require accepted application |
| `four_blockers_validation.sql` | Combined check of the four "P0 blockers" above |
| `profiles_rls_non_regression.sql` | Profiles policy set after hardening + `is_admin` recursion fix |
| `applications_rls_transitions_non_regression.sql` | Applications insert/update/delete policies and transition trigger |
| `applications_cancellation_non_regression.sql` | Skipper delete of pending application; `applicants_count` decrement floor |
| `onboarding_non_regression.sql` | `onboarding_step` / `onboarding_completed_at` columns and constraints |
| `verification_non_regression.sql` | Verification tables, policies, bucket, identity sync trigger |
| `reviews_rls_non_regression.sql` | Review insert policy, integrity trigger, unique indexes |

Run **all** of them after touching any file in `supabase/migrations/` or `schema.sql`. Add a new script whenever you add a policy/trigger that the app relies on.

## 3. Lint & types

```bash
npm run lint      # eslint (next/core-web-vitals + typescript), zero warnings
npm run build     # tsc via next build — strict mode
```

Note that `Database = any` means Supabase query builders are not type-checked; a wrong column name only fails at runtime.

## 4. Manual QA script

Use two browsers (or a private window) with a skipper account and a demandeur account. Demo emails in `supabase/seed.sql` can be used.

1. **Signup / verify** — sign up as skipper; confirm you are redirected to `/verify-email`; click the email link; land on `/onboarding`; complete zones + boat type + bio; reach `/dashboard/skipper`.
2. **Demandeur** — sign up as `owner`; onboarding requires phone; reach `/dashboard/demandeur`; publish a mission at `/missions/new`.
3. **Apply** — as skipper, open `/missions`, apply with phone + message. As owner, `/my-missions/<id>` shows `applicants_count = 1` and a `new_application` notification.
4. **Withdraw** — as skipper, withdraw from `/my-applications`; count returns to 0. Re-apply.
5. **Accept** — as owner accept; mission becomes `assigned`; skipper receives `application_accepted` + `mission_assigned`. Try to accept a second (create another skipper) → blocked.
6. **Chat** — owner opens conversation; both sides exchange messages; verify realtime append and `new_message` notifications. A third account must not see the conversation.
7. **Complete & review** — owner marks completed; skipper gets `mission_status_changed`; owner leaves a review; it appears on `/skippers/<id>` and in the directory average. Second review by same reviewer → blocked.
8. **Verification** — skipper uploads a document and submits; admin approves at `/dashboard/admin/verifications`; badge appears on skipper profile.
9. **Locale** — switch language via the globe; `<html lang>`, nav, dates and enum labels update; reload keeps the choice.
10. **Account deletion** — from `/account`, delete; login with the same credentials fails; owner's missions from that account disappear.

## 5. Gaps & suggestions

- Add Playwright (or Cypress) for the QA script above; the flows are deterministic and only need two seeded users.
- Add unit tests for `lib/onboarding.ts`, `lib/profile.ts`, `lib/media.ts`, `lib/i18n/options.ts`.
- Wire `npm run lint && npm test && npm run build` into a GitHub Actions workflow.
- Consider `supabase test db` / pgTAP to run the SQL scripts automatically against a local stack.
