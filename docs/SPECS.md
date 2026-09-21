# Functional Specification

This document describes **what the application does**, as reverse-engineered from the code and database on branch `main` (release `feat: finalize multilingual production release`, 2026‑09‑10). Where a behaviour is enforced by the database rather than the UI, it is marked **[DB]**.

## 1. Actors & roles

`profiles.role` is one of five values. The UI groups the three "buyer" roles under the French word *demandeur* (requester).

| Role | Who | Dashboard | Can publish missions | Can apply | Notes |
|---|---|---|---|---|---|
| `skipper` | Professional skipper | `/dashboard/skipper` | ✗ | ✓ | Public profile listed on `/skippers` |
| `owner` | Private boat owner (1‑2 boats) | `/dashboard/demandeur` | ✓ | ✗ | Optional `city` |
| `broker` | Yacht broker | `/dashboard/demandeur` | ✓ | ✗ | `company_name`, `fleet_size` required |
| `charter_company` | Charter operator | `/dashboard/demandeur` | ✓ | ✗ | Same as broker |
| `admin` | Platform operator | `/dashboard/admin` | (via policy) | ✗ | Cannot be chosen at signup; promoted manually in Supabase. Reviews verification requests. |

Guests (not signed in) can browse the home page, the public skipper directory, the public missions list/detail and the legal pages.

## 2. Authentication & account lifecycle

### 2.1 Signup (`/signup?role=…`)
- Role picker (skipper / owner / broker / charter_company), full name, email, password + confirmation, phone (country selector, validated with libphonenumber, stored E.164).
- Role-specific fields:
  - **skipper**: experience years, navigation zones (multi), boat types (multi), languages (ISO‑639‑1 names), certifications (grouped list: French *Permis*/*Capitaine* + RYA), permits, avatar URL (https only), indicative rate (default `350 €`), availability note, bio.
  - **owner**: city.
  - **broker / charter_company**: company name, fleet size.
- All fields are passed as `auth.signUp` user metadata; the **[DB]** trigger `handle_new_user` materialises the profile with `onboarding_step='role_details'`.
- If Supabase returns a session immediately → `/dashboard`; otherwise → `/verify-email?email=…&next=/dashboard`.

### 2.2 Email verification (`/verify-email`)
- Users whose `email_confirmed_at` is null are redirected here from any sensitive route (dashboard, onboarding, profile, messages, notifications, missions/new, my‑missions, my‑applications, account).
- Page offers "resend confirmation". The email link lands on `/auth/callback?code=…&next=…`.

### 2.3 Login / password reset
- `/login` (email + password, `?next=` redirect honoured only for internal paths — `lib/auth.ts:safeNextPath`).
- `/forgot-password` sends a reset email; `/reset-password` sets the new password after the callback.
- Signed-in users hitting any auth page are bounced to verify‑email → onboarding → dashboard.

### 2.4 Onboarding (`/onboarding`)
Required after signup until `onboarding_completed_at` is set. Completeness rules (`lib/onboarding.ts`):

| Role | Required to finish |
|---|---|
| skipper | ≥1 zone, ≥1 boat type, non-empty bio |
| owner | phone |
| broker / charter_company | phone, company name, fleet size |

The dashboard shows a "complete your profile" banner listing the missing items while incomplete.

### 2.5 Account (`/account`)
- Shows account info and a **Delete my account** action → `POST /api/account/delete` → Supabase admin `deleteUser` → cascade delete of profile, missions, applications, messages, etc. → sign out.
- Returns HTTP 503 when the server is missing `SUPABASE_SERVICE_ROLE_KEY`.

## 3. Skipper directory (`/skippers`, `/skippers/[id]`) — public

- Lists all profiles with `role='skipper'` **[DB: RLS "Public read of skipper profiles"]**, with avatar (signed URL or https), initials fallback, zones, boat types, languages, top‑2 certifications, indicative rate, availability summary, `identity_verified` badge and ★ average rating + review count (computed client-side from `reviews`).
- Client-side filters: zone, experience bracket (0‑2 / 3‑5 / 6+), availability (declared / not specified), tariff bracket (<200 / 200‑400 / 400+, parsed from `hourly_rate`), language, boat type, free-text search across name, city, note, zones, languages, boat types, certifications. "Reset filters" button.
- Detail page shows the full profile, gallery, availability slots, certifications with `verified` flag, and the review list.

## 4. Missions

### 4.1 Publish (`/missions/new`) — demandeur roles only
Fields: type (`À la journée`, `À la semaine`, `Saisonnier`, `Convoyage`, `Autre`), boat type, zone, departure*, destination, start date*, duration, compensation, requirements, description. Inserted with `status='open'` **[DB: insert policy requires poster role ∈ owner/broker/charter_company and status='open']**.

### 4.2 Browse (`/missions`) — public
List of missions (all statuses readable **[DB: "Anyone can read missions"]**, default filter = `open`), client-side filters on status, type, zone, boat type and free text; cards show type, zone, boat type, dates, compensation, `applicants_count` and a status pill.

### 4.3 Detail & apply (`/missions/[id]`)
- Anyone can read. Signed-in **skippers** with an `open` mission see an *Apply* form (phone + message) → `applications` row with `status='pending'` **[DB: skipper role, mission open, unique (mission, skipper)]**.
- If the skipper already applied, the current application status is displayed instead.
- Non-open missions show no apply button.

### 4.4 Skipper: my applications (`/my-applications`)
Lists own applications with mission summary and status. A **pending** application can be **withdrawn** (row delete) **[DB: delete policy; trigger decrements `applicants_count`, floored at 0]**. Once the mission is `completed`, the skipper can **review the poster** from here (one review per mission).

### 4.5 Poster: my missions (`/my-missions`, `/my-missions/[id]`)
- List of own missions with status and applicant count.
- Detail: applicant cards (name, phone, message, status). Actions:
  - **Accept** / **Reject** a pending application **[DB: only mission owner, only from `pending`, mission must be `open`]**.
  - Accepting triggers **[DB]**: every other pending application → `rejected`; mission → `assigned`; notifications sent.
  - **Open conversation** with the accepted skipper (creates the `conversations` row if absent).
  - **Mark completed** / **Cancel** the mission **[DB: `open→assigned|cancelled`, `assigned→completed|cancelled`; only `status` may change]**.
  - After `completed`: **leave a review** (1‑5 + comment) for the accepted skipper.

### 4.6 Mission state machine **[DB]**

```
          accept application            complete
 open ───────────────────────► assigned ─────────► completed
   │                              │
   └────── cancel ────────────────┴─── cancel ───► cancelled
```

- Only the poster may transition their mission (trigger checks `auth.uid() = poster_id`); admins can update via policy but the trigger still requires the poster's uid.
- Any attempt to modify non-status columns together with a status change is rejected (`Only status can be updated on missions`).
- `is_featured` and `applicants_count` are frozen for the poster (policy `WITH CHECK` compares to current row).

### 4.7 Application state machine **[DB]**

```
 pending ──(owner accepts)──► accepted        (max one per mission — partial unique index)
 pending ──(owner rejects)──► rejected
 pending ──(auto, another accepted)──► rejected
 pending ──(skipper withdraws)──► row deleted
```

Skippers cannot change status at all; only owners, only from `pending`.

## 5. Messaging (`/messages`)

- Conversations exist only for `(mission, skipper)` pairs whose application is `accepted` **[DB: both read and insert policies check the accepted application]**. Only the poster (demandeur) may create the conversation.
- Left pane: conversation list (mission departure → destination, counterpart name). Right pane: message thread with realtime append via Supabase Realtime (`postgres_changes` INSERT filter on `conversation_id`).
- Send = insert into `messages` **[DB: participant check]**. Recipient gets a `new_message` notification.
- Responsive: single-pane on mobile with back navigation.

## 6. Notifications (`/notifications`)

In-app inbox (no email/push). Rows are produced only by triggers; users can only flip `read` from false to true **[DB: update policy freezes user_id, type, payload, created_at]**.

| Type | Recipient | Trigger |
|---|---|---|
| `new_application` | mission poster | skipper applies |
| `application_accepted` | skipper | owner accepts |
| `application_rejected` | skipper | owner rejects, or auto-reject after another acceptance |
| `mission_assigned` | accepted skipper | mission flips to `assigned` |
| `mission_status_changed` | accepted skipper | mission → `completed` / `cancelled` |
| `new_message` | other participant | message inserted |

The page displays unread count, per-notification "mark as read", and links into the related mission / conversation.

## 7. Profile (`/profile`)

Editable by the owner only **[DB: update policy; `role` and `identity_verified` are immutable for the user]**.

- Common: full name, phone (validated), avatar — either https URL or **file upload** to `profile-avatars/<uid>/…` (stored as `storage:profile-avatars/<path>`).
- Skipper: experience, zones, boat types, languages, certifications (name + verified flag + optional authority), permits, bio, gallery URLs, indicative rate, availability note, **availability slots** (date ranges; replaced wholesale on save; `start ≤ end` **[DB check]**).
- Demandeur: company name, fleet size, city.
- Shows received reviews.
- **Identity verification block**: create a draft request, upload documents (types: identity, license, certificate, company, ownership, mandate, other) to `verification-documents/<uid>/…`, preview via 120 s signed URL, delete, then **Submit**. Status badge: draft / submitted / approved / rejected (+ reason). Users can only update their request while it has not been reviewed yet (`reviewed_by` / `reviewed_at` null) **[DB]** — see ROADMAP for the resubmit-after-rejection caveat.

## 8. Admin (`/dashboard/admin`, `/dashboard/admin/verifications`)

- Middleware and page both re-check `role='admin'`.
- Verification queue: lists all `verification_requests` with profile and documents (admins can read every request and document **[DB]**), filters `submitted`, opens documents through signed URLs, **Approve** or **Reject with reason** (sets `reviewed_at`, `reviewed_by`). Trigger updates `profiles.identity_verified`.
- No other admin tooling exists (no mission moderation UI, no user management), although `is_featured` and "Admins can update any profile/mission" policies are ready for it.

## 9. Reviews **[DB-heavy]**

- Readable by everyone.
- Insert allowed only when: mission `completed`, an accepted application exists, reviewer ≠ reviewee, and the pair is exactly (poster ↔ accepted skipper). Enforced twice: RLS `WITH CHECK` and `enforce_review_integrity()`.
- One review per (mission, reviewer) — unique index.
- Displayed on skipper public profile and as an aggregate (average, count) in the directory.

## 10. Localisation

- 10 locales, default `fr`; chosen via the globe menu in the nav; persisted in cookie `fas-locale` (1 year, `SameSite=Lax`).
- `<html lang>` and `<title>` follow the locale; dates use `Intl.DateTimeFormat` with mapped regional tags (e.g. `no → nb-NO`).
- Enum labels (zones, boat types, mission types, roles) are translated for display only; stored values are the French canonical strings.
- Legal pages (`/mentions-legales`, `/confidentialite`, `/cgu`, `/cookies`) exist with static copy.

## 11. Non-functional behaviour

- Every Supabase request aborts after **12 s** and shows a friendly error rather than hanging.
- Middleware refreshes the auth cookie on every navigation; server components never write cookies.
- Open redirects are prevented: `next` params must start with a single `/`.
- All user-facing storage buckets are **private**; access goes through short-lived signed URLs.
- No analytics, no error tracking, no email provider beyond Supabase Auth's built-in templates.

## 12. Out of scope / not implemented (observed)

- Favorites (table + RLS exist, no UI).
- Payments, contracts, calendars beyond availability slots, file attachments in chat, push/email notifications, mission search by geography, admin moderation of missions/users, skipper-initiated conversations, editing a mission after publication (only status can change).

See [ROADMAP.md](./ROADMAP.md).
