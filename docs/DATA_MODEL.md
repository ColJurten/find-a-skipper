# Data Model

Source of truth: `supabase/schema.sql` (consolidated) and `supabase/migrations/*.sql` (history). All tables live in schema `public`, use `uuid` primary keys (`gen_random_uuid()` from `pgcrypto`) and have **RLS enabled**. Every trigger function is `security definer` with `set search_path = public`.

TypeScript mirrors: `lib/database.types.ts` (hand-written; `Database` is currently `any`).

## Entity–relationship overview

```
auth.users 1──1 profiles ──< availability_slots
                 │
                 ├──< missions (poster_id) ──< applications (mission_id) >── profiles (skipper_id)
                 │        │                          │
                 │        │                    conversations (mission_id, demandeur_id, skipper_id) ──< messages
                 │        │
                 │        └──< reviews (mission_id, reviewer_id, reviewee_id)
                 │
                 ├──< favorites (skipper_id | mission_id)
                 ├──< notifications
                 └──1 verification_requests ──< verification_documents
```

## Tables

### `profiles`
One row per auth user, created automatically by trigger. `id` FK → `auth.users(id) on delete cascade`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | = auth user id |
| `role` | text | `skipper` \| `owner` \| `broker` \| `charter_company` \| `admin` (check) |
| `full_name` | text not null | |
| `phone` | text | E.164 |
| `avatar_url` | text | `https://…` or `storage:profile-avatars/<uid>/<file>` |
| `company_name`, `fleet_size` int, `city` | | demandeur fields |
| `experience_years` int, `zones` text[], `boat_types` text[], `languages` text[], `permits` text | | skipper fields |
| `certifications` | jsonb `[]` | `[{ name, verified, authority? }]` |
| `bio`, `gallery_urls` text[], `hourly_rate` text, `availability_note` | | |
| `identity_verified` | bool default false | only changed by verification trigger / admin |
| `onboarding_step` | text | `role_details` \| `done` \| null |
| `onboarding_completed_at` | timestamptz | null ⇒ onboarding still required |
| `created_at` | timestamptz | |

> `lib/database.types.ts` declares an `email` field that does not exist in the table. It is unused by queries; email comes from `auth.getUser()`.

### `availability_slots`
`skipper_id` → profiles, `start_date`, `end_date` (check `start ≤ end`). Replaced wholesale when a skipper saves their profile.

### `missions`

| Column | Type | Notes |
|---|---|---|
| `poster_id` | uuid → profiles | |
| `status` | text | `open` (default) \| `assigned` \| `completed` \| `cancelled` |
| `type` | text | `À la journée` \| `À la semaine` \| `Saisonnier` \| `Convoyage` \| `Autre` |
| `boat_type`, `zone`, `departure` | text not null | |
| `destination`, `duration`, `compensation`, `description`, `requirements` | text | |
| `start_date` | date not null | |
| `applicants_count` | int default 0 | maintained by triggers, frozen for poster |
| `is_featured` | bool default false | admin-only (no UI yet) |
| `posted_at` | timestamptz | |

Indexes: `zone`, `type`, `poster_id`.

### `applications`
Unique `(mission_id, skipper_id)`. Partial unique index on `mission_id where status='accepted'` guarantees a single winner.

| Column | Notes |
|---|---|
| `status` | `pending` (default) \| `accepted` \| `rejected` |
| `phone`, `message` | supplied by skipper at apply time |
| `applied_at` | |

### `conversations`
`(mission_id, skipper_id)` unique; `demandeur_id` = mission poster. Only creatable by the demandeur when an accepted application exists.

### `messages`
`conversation_id`, `sender_id`, `text`, `created_at`. Streamed to clients through Supabase Realtime.

### `favorites`
`user_id` + exactly one of `skipper_id` / `mission_id` (check constraint). **No UI yet.**

### `reviews`
`mission_id`, `reviewer_id`, `reviewee_id`, `rating` 1‑5, `comment`. Unique `(mission_id, reviewer_id, reviewee_id)` **and** unique index `(mission_id, reviewer_id)`.

### `notifications`
`user_id`, `type` text, `payload` jsonb, `read` bool, `created_at`. Indexes on `(user_id, created_at desc)` and `(user_id, read, created_at desc)`.

Payload shapes:

| `type` | payload |
|---|---|
| `new_application` | `{ mission_id, application_id, skipper_id }` |
| `application_accepted` / `application_rejected` | `{ mission_id, application_id, status }` |
| `mission_assigned` | `{ mission_id, new_status }` |
| `mission_status_changed` | `{ mission_id, old_status, new_status }` |
| `new_message` | `{ conversation_id, mission_id, sender_id, message_id }` |

### `verification_requests`
One per user (`user_id` unique). `status`: `draft` (default) \| `submitted` \| `approved` \| `rejected`. `submitted_at`, `reviewed_at`, `reviewed_by` → profiles (set null on delete), `rejection_reason`, `created_at`, `updated_at` (touched by trigger).

### `verification_documents`
`request_id`, `user_id`, `doc_type` (`identity` \| `license` \| `certificate` \| `company` \| `ownership` \| `mandate` \| `other`), `storage_path` (unique), `original_filename`, `mime_type`.

## Functions & triggers

| Trigger | Table / event | Function | Effect |
|---|---|---|---|
| `on_auth_user_created` | `auth.users` AFTER INSERT | `handle_new_user()` | Insert `profiles` row from `raw_user_meta_data`; default role `owner`; `onboarding_step='role_details'` |
| `on_mission_status_update` | `missions` BEFORE UPDATE | `enforce_mission_status_transition()` | Only `status` may change; must be poster; `open→assigned|cancelled`, `assigned→completed|cancelled` |
| `on_application_created` | `applications` AFTER INSERT | `increment_applicants_count()` | `missions.applicants_count += 1` |
| `on_application_deleted` | `applications` AFTER DELETE | `decrement_applicants_count_on_delete()` | `-= 1`, floored at 0 |
| `on_application_created_notify` | `applications` AFTER INSERT | `notify_on_application_created()` | `new_application` → poster |
| `on_application_status_update` | `applications` BEFORE UPDATE | `enforce_application_status_transition()` | Only `status`; only mission owner; only from `pending`; mission must be `open` to accept |
| `on_application_status_update_notify` | `applications` AFTER UPDATE | `notify_on_application_status_changed()` | `application_accepted` / `application_rejected` → skipper |
| `on_application_status_sync_mission` | `applications` AFTER INSERT/UPDATE | `sync_mission_status_from_application()` | On acceptance: reject other pending; mission → `assigned` |
| `on_mission_status_update_notify` | `missions` AFTER UPDATE | `notify_on_mission_status_changed()` | `mission_assigned` / `mission_status_changed` → accepted skipper |
| `on_conversation_created_sync_mission` | `conversations` AFTER INSERT | `sync_mission_status_from_conversation()` | **No-op** (kept for compatibility; mission sync moved to application acceptance) |
| `on_message_created_notify` | `messages` AFTER INSERT | `notify_on_message_created()` | `new_message` → other participant |
| `on_review_integrity_check` | `reviews` BEFORE INSERT | `enforce_review_integrity()` | Mission completed, accepted skipper exists, no self-review, participants valid |
| `on_verification_request_updated_at` | `verification_requests` BEFORE UPDATE | `touch_verification_request_updated_at()` | `updated_at = now()` |
| `on_verification_request_status_change` | `verification_requests` AFTER UPDATE | `sync_profile_identity_from_verification()` | approved → `identity_verified=true`; rejected → false |

Helper: `public.is_admin(uid uuid) returns boolean` — `security definer`, `stable`. Introduced to break the RLS self-reference recursion on `profiles` (migration `20260826153000`).

## Storage buckets

| Bucket | Public | Path convention | Policies |
|---|---|---|---|
| `verification-documents` | no | `<uid>/<request>/<file>` | owner (first folder = `auth.uid()`) insert/select/delete; admin select/delete |
| `profile-avatars` | no | `<uid>/<file>` | owner insert/select/delete; admin select/delete |

Access from the UI is always via `createSignedUrl` (120 s for documents, 600 s for avatars).

## Migration history

| Timestamp | File | Summary |
|---|---|---|
| 2026‑08‑03 | `core_find_a_skipper` | Initial tables, RLS, signup trigger |
| 2026‑08‑21 | `harden_conversation_insert_policy` | Only poster may create conversation |
| 2026‑08‑22 | `harden_profile_and_mission_update_policies` | Freeze `role`, `identity_verified`, `is_featured`, `applicants_count` |
| 2026‑08‑22 | `mvp_status_workflow_and_rls` | Mission/application status columns + transitions |
| 2026‑08‑22 | `add_public_profile_fields_to_signup_trigger` | Copy more metadata into profile |
| 2026‑08‑22 | `mission_workflow_assigned_cancelled` | `assigned`/`cancelled` statuses, transition trigger |
| 2026‑08‑22 | `acceptance_drives_rejections_and_conversation_access` | Auto-reject + accepted-only conversations |
| 2026‑08‑22 | `notifications_events` | Notifications table + fan-out triggers |
| 2026‑08‑24 | `onboarding_state_and_profile_completion` | `onboarding_step`, `onboarding_completed_at` |
| 2026‑08‑24 | `profile_verification_workflow` | Verification tables, bucket, `is_admin` |
| 2026‑08‑24 | `harden_accepted_conversation_and_notifications` | Tightened messaging & notification triggers |
| 2026‑08‑26 | `harden_profiles_rls_policies` | |
| 2026‑08‑26 | `harden_missions_rls_policies` | |
| 2026‑08‑26 | `harden_applications_rls_and_transitions` | |
| 2026‑08‑26 | `harden_notifications_rls_and_events` | Read-only except `read` flag |
| 2026‑08‑26 | `fix_profiles_rls_runtime_recursion` | `is_admin()` used in policies |
| 2026‑09‑07 | `profile_avatars_languages_certifications_and_availability` | `languages`, `certifications` jsonb, `availability_slots`, `profile-avatars` bucket |
| 2026‑09‑07 | `allow_skipper_cancel_pending_applications` | Delete policy + decrement trigger |
| 2026‑09‑08 | `harden_reviews_reputation_rls` | Review integrity trigger + unique index |

`supabase/backups/prod_migration_list_snapshot_2026-09-06.txt` records that, as of 2026‑09‑06, the 16 migrations up to `20260826153000` were present locally with **no remote tracking** (`remote: ""`), i.e. production was provisioned through `schema.sql` / SQL editor rather than `supabase db push`. The three September migrations post-date the snapshot. Treat `schema.sql` as the canonical reflection of production and keep both in sync when adding migrations (see [CONTRIBUTING.md](../CONTRIBUTING.md)).

## Seed data

`supabase/seed.sql` inserts demo profiles/missions **only if** auth users with these emails already exist: `skipper.demo@`, `owner.demo@`, `broker.demo@findaskipper.test`. Create them through the app first, then run the seed.
