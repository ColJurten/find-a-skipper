-- READ-ONLY pre-flight check for migrations 20260914190000 and 20260924100000.
-- Run it in the Supabase SQL editor of the target project BEFORE applying the migrations.
-- It only reads the catalog and counts rows: nothing is created, updated or deleted.
-- Every line must show status = 'OK' (or 'INFO'); any 'MISSING' blocks the migration
-- (older migration not applied, or duplicate reviews to resolve manually).

with required_columns(tbl, col) as (
  values
    ('profiles', 'role'), ('profiles', 'languages'), ('profiles', 'experience_years'), ('profiles', 'zones'),
    ('profiles', 'boat_types'), ('profiles', 'certifications'), ('profiles', 'avatar_url'), ('profiles', 'availability_note'),
    ('profiles', 'onboarding_step'), ('profiles', 'onboarding_completed_at'), ('profiles', 'identity_verified'),
    ('missions', 'status'), ('missions', 'requirements'), ('missions', 'applicants_count'), ('missions', 'is_featured'),
    ('applications', 'status'), ('applications', 'phone'), ('applications', 'message'), ('applications', 'applied_at'),
    ('conversations', 'demandeur_id'), ('conversations', 'skipper_id'), ('messages', 'text'),
    ('notifications', 'payload'), ('reviews', 'rating'), ('reviews', 'comment'),
    ('availability_slots', 'skipper_id'), ('availability_slots', 'start_date'), ('availability_slots', 'end_date')
),
checks as (
  select 'column public.' || tbl || '.' || col as check_name,
         case when exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = tbl and c.column_name = col) then 'OK' else 'MISSING' end as status,
         '' as detail
  from required_columns
  union all
  select 'function public.is_admin(uuid)', case when to_regprocedure('public.is_admin(uuid)') is not null then 'OK' else 'MISSING' end, 'from 20260824113000'
  union all
  select 'function public.profile_user_update_fields_unchanged', case when to_regprocedure('public.profile_user_update_fields_unchanged(uuid,text,boolean)') is not null then 'OK' else 'MISSING' end, 'from 20260826153000'
  union all
  select 'auth.users.email_confirmed_at', case when exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'email_confirmed_at') then 'OK' else 'MISSING' end, ''
  union all
  select 'storage bucket profile-avatars', case when exists (select 1 from storage.buckets where id = 'profile-avatars') then 'OK' else 'MISSING' end, 'from 20260907150000'
  union all
  select 'storage.buckets limit columns', case when (select count(*) from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name in ('file_size_limit', 'allowed_mime_types')) = 2 then 'OK' else 'MISSING' end, ''
  union all
  select 'reviews unique (mission_id, reviewer_id)', 'INFO', case when to_regclass('public.reviews_unique_by_mission_reviewer_idx') is not null then 'present' else 'absent: will be created by the migration' end
  union all
  select 'trigger on_review_integrity_check', 'INFO', case when exists (select 1 from pg_trigger where tgname = 'on_review_integrity_check' and not tgisinternal) then 'present' else 'absent: will be created by the migration' end
  union all
  select 'no duplicate reviews (same mission + reviewer)',
         case when exists (select 1 from public.reviews group by mission_id, reviewer_id having count(*) > 1) then 'MISSING' else 'OK' end,
         'duplicates would stop the migration (nothing is ever deleted automatically)'
  union all
  select 'publication supabase_realtime', case when exists (select 1 from pg_publication where pubname = 'supabase_realtime') then 'OK' else 'INFO' end, 'realtime tables are added only if the publication exists'
  -- Informational data checks (never block: constraints are added NOT VALID).
  union all
  select 'INFO rows', 'INFO', format('profiles=%s missions=%s applications=%s conversations=%s messages=%s reviews=%s notifications=%s',
    (select count(*) from public.profiles), (select count(*) from public.missions), (select count(*) from public.applications),
    (select count(*) from public.conversations), (select count(*) from public.messages), (select count(*) from public.reviews), (select count(*) from public.notifications))
  union all
  select 'INFO profiles whose languages will be converted to ISO codes (backed up first)', 'INFO',
    (select count(*)::text from public.profiles where languages is not null and cardinality(languages) > 0)
  union all
  select 'INFO distinct language labels in use', 'INFO', coalesce((select string_agg(distinct l, ', ') from public.profiles, unnest(languages) l), '')
  union all
  select 'INFO missions with a type outside the new list', 'INFO',
    (select count(*)::text from public.missions where type not in ('À la journée', 'À la semaine', 'Saisonnier', 'Convoyage', 'Permanent', 'Autre'))
  union all
  select 'INFO applications with a status outside pending/accepted/rejected/withdrawn', 'INFO',
    (select count(*)::text from public.applications where status not in ('pending', 'accepted', 'rejected', 'withdrawn'))
)
select * from checks order by (status = 'MISSING') desc, check_name;

-- Optional (only if the project was migrated with the Supabase CLI):
-- select version, name from supabase_migrations.schema_migrations order by version;
