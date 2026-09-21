# Architecture Decisions

Lightweight ADR log, reconstructed from the code and commit history. Each entry states the decision as it stands and the evidence for it. Add new entries at the bottom; never rewrite old ones — supersede them.

---

### ADR-001 — Supabase as the whole backend (no custom API)
**Status:** accepted (since initial commit, 2026‑08‑01)
**Decision:** Use Supabase Auth + Postgres + Storage + Realtime directly from the Next.js app through PostgREST. No Express/tRPC/GraphQL layer, no ORM.
**Consequences:** Very small server surface (two route handlers). All authorisation must be expressed in RLS; business rules must be triggers. Fast to ship, but every new rule is SQL.
**Evidence:** `lib/supabase/*`, `schema.sql`, absence of `app/api/**` beyond account deletion.

### ADR-002 — Business invariants live in Postgres triggers, not in the UI
**Status:** accepted (2026‑08‑22 → 08‑26 hardening series)
**Decision:** Status machines, counters, notification fan-out, review integrity and identity sync are `security definer` trigger functions; policies use `WITH CHECK` sub-selects to freeze sensitive columns.
**Rationale:** The anon key is public; the client cannot be trusted. Commits `security: harden …`, `harden * rls …`.
**Consequences:** SQL non-regression scripts (`supabase/tests/`) become the primary test suite for business rules; UI duplicates the rules only for UX.

### ADR-003 — Accepted-application gate for messaging
**Status:** accepted (2026‑08‑22 "Enforce accepted-only messaging workflow", reinforced 08‑24)
**Decision:** A conversation may exist only for a `(mission, skipper)` pair with an `accepted` application, and only the poster can open it.
**Rationale:** Prevent spam / off-platform poaching before a match is confirmed.
**Consequences:** Skippers cannot ask questions before applying; see ROADMAP "Skipper-initiated contact".

### ADR-004 — Accepting one application resolves the whole mission
**Status:** accepted (2026‑08‑22 "acceptance_drives_rejections_and_conversation_access")
**Decision:** On acceptance, auto-reject other pending applications and flip the mission to `assigned`; enforce one accepted application per mission with a partial unique index.
**Consequences:** Simple mental model; no multi-skipper crews per mission.

### ADR-005 — Cookie-based, framework-free i18n with French canonical data
**Status:** accepted (2026‑09‑10 multilingual release)
**Decision:** Locale in a cookie (`fas-locale`), dictionaries as TS objects, no URL prefix. Stored enum values stay in French; display labels are translated in `lib/i18n/options.ts`.
**Rationale:** Avoid a migration of existing data and DB `check` constraints; keep routing simple.
**Consequences:** No per-locale SEO URLs; two dictionary files to maintain (see ROADMAP).

### ADR-006 — Email verification is required for sensitive routes only
**Status:** accepted (2026‑09 `lib/auth.ts`)
**Decision:** Unverified users may browse public pages but are redirected to `/verify-email` for dashboard, messaging, publishing, etc.
**Consequences:** Two route lists to keep in sync (`middleware.ts`, `lib/auth.ts`).

### ADR-007 — Role-based onboarding stored on the profile
**Status:** accepted (2026‑08‑24 "Add minimal role-based onboarding flow")
**Decision:** `profiles.onboarding_step` + `onboarding_completed_at`; completeness rules are pure functions in `lib/onboarding.ts` and evaluated by middleware and dashboards.
**Consequences:** Rules are app-side, not DB-side (a user could set `onboarding_completed_at` via PostgREST with incomplete data — accepted risk, UX-only gate).

### ADR-008 — Private storage buckets with signed URLs
**Status:** accepted (verification 2026‑08‑24, avatars 2026‑09‑07)
**Decision:** Both buckets are private; access goes through `createSignedUrl` with short TTLs; paths are prefixed by the owner's uid and policies check `storage.foldername(name)[1]`.
**Consequences:** Strong default privacy for identity documents. For avatars it currently blocks public display — see ROADMAP #1; a follow-up ADR should decide on public-read for avatars.

### ADR-009 — Service role confined to account deletion
**Status:** accepted
**Decision:** The only privileged operation is `auth.admin.deleteUser`, executed in `POST /api/account/delete` after re-authenticating the caller with the anon client. Cascade FKs do the rest.
**Consequences:** GDPR "right to erasure" in one call; the key must never leak to the client bundle.

### ADR-010 — Hand-written DB types, `Database = any`
**Status:** accepted as temporary (comment in `lib/database.types.ts`)
**Decision:** Ship without the Supabase CLI; keep row interfaces by hand and cast query results.
**Consequences:** No compile-time safety on queries. To be superseded when CLI types are adopted.

### ADR-011 — Separate `.next-dev` build directory in development
**Status:** accepted (2026‑08‑26 "stabilize onboarding route by resetting dev chunk cache")
**Decision:** `distDir` is `.next-dev` in dev and it is wiped on every `npm run dev`.
**Rationale:** Work around stale chunk/route errors during development.
**Consequences:** Slower cold dev start; `tsconfig` includes `.next-dev/types`.

### ADR-012 — Client-side filtering over full result sets
**Status:** accepted for MVP
**Decision:** `/skippers` and `/missions` fetch every row and filter/search in React.
**Consequences:** Zero backend work for new filters; will need server-side filtering + pagination once tables grow (ROADMAP).
