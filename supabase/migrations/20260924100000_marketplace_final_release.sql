-- Find a Skipper — final marketplace release.
--
-- * Structured skipper availability, experience ranges and ISO language codes.
-- * Mission dates / duration / currency / "on quote" / Permanent type.
-- * Application withdrawal kept in history (instead of hard delete).
-- * Messaging: per-message read state, unread counters, conversation list RPC,
--   message notifications as soon as an application exists.
-- * Server-side e-mail confirmation for every sensitive write.
-- * Profile visibility: skipper profiles are only visible to recruiters
--   (owner / broker / charter company), never to other skippers or anonymous users.
-- * Reviews: visibility aligned with profiles, comment length guard.
-- * Signup trigger hardening (no self-assigned admin role, sanitised values).
--
-- Existing policies are replaced (drop + create) with stricter equivalents; no data is deleted.
-- The only rewrite of existing data (languages -> ISO codes) is backed up first.
-- Constraints on existing columns are added NOT VALID so legacy rows can never block the migration.
-- Prerequisites: run supabase/checks/pre_migration_check.sql first (read-only).

-- ---------------------------------------------------------------------------
-- 1. Helper functions (SECURITY DEFINER so that policies never recurse into profiles RLS)
-- ---------------------------------------------------------------------------

create or replace function public.is_recruiter(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role in ('owner', 'broker', 'charter_company')
  );
$$;

create or replace function public.is_email_confirmed()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;

-- Can the current user see the public "card" (name, company, photo) of a profile?
create or replace function public.can_view_profile_card(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target is not null
    and (
      target = auth.uid()
      or public.is_admin(auth.uid())
      -- Recruiters publish missions publicly: their name / company is shown as "Proposé par".
      or exists (
        select 1 from public.profiles t
        where t.id = target and t.role in ('owner', 'broker', 'charter_company')
      )
      -- Skipper cards are visible to recruiters only.
      or (
        public.is_recruiter(auth.uid())
        and exists (select 1 from public.profiles t where t.id = target and t.role = 'skipper')
      )
      -- Conversation partners always see each other.
      or exists (
        select 1 from public.conversations c
        where (c.demandeur_id = auth.uid() and c.skipper_id = target)
           or (c.skipper_id = auth.uid() and c.demandeur_id = target)
      )
    );
$$;

grant execute on function public.is_recruiter(uuid) to anon, authenticated;
grant execute on function public.is_email_confirmed() to anon, authenticated;
grant execute on function public.can_view_profile_card(uuid) to anon, authenticated;

-- Limited public profile information (no phone, no e-mail) for names / avatars in the UI.
create or replace function public.get_profile_cards(ids uuid[])
returns table (id uuid, role text, full_name text, company_name text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.role, p.full_name, p.company_name, p.avatar_url
  from public.profiles p
  where p.id = any(ids)
    and public.can_view_profile_card(p.id);
$$;

grant execute on function public.get_profile_cards(uuid[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Profiles: availability, experience ranges, languages
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists availability_status text;
alter table public.profiles add column if not exists available_from date;
alter table public.profiles add column if not exists experience_range text;

alter table public.profiles drop constraint if exists profiles_availability_status_check;
alter table public.profiles
  add constraint profiles_availability_status_check
  check (availability_status is null or availability_status in ('immediate', 'season', 'from_date', 'range', 'specific', 'unavailable'));

alter table public.profiles drop constraint if exists profiles_experience_range_check;
alter table public.profiles
  add constraint profiles_experience_range_check
  check (experience_range is null or experience_range in ('0-2', '2-5', '5-10', '10+'));

update public.profiles
set experience_range = case
  when experience_years <= 2 then '0-2'
  when experience_years <= 5 then '2-5'
  when experience_years <= 10 then '5-10'
  else '10+'
end
where experience_range is null and experience_years is not null;

update public.profiles p
set availability_status = 'range'
where p.availability_status is null
  and p.role = 'skipper'
  and exists (select 1 from public.availability_slots s where s.skipper_id = p.id);

-- Languages are stored as ISO 639-1 codes so that labels can be translated.
-- Values that are not recognised are kept unchanged (never deleted).
-- Cyrillic labels are listed explicitly: lower() does not fold them under the C collation.
create or replace function public.normalize_latin_language_code(value text)
returns text
language sql
immutable
as $$
  select case lower(btrim(value))
    when 'français' then 'fr' when 'francais' then 'fr' when 'french' then 'fr' when 'fr' then 'fr'
    when 'english' then 'en' when 'anglais' then 'en' when 'en' then 'en'
    when 'español' then 'es' when 'espanol' then 'es' when 'espagnol' then 'es' when 'spanish' then 'es' when 'es' then 'es'
    when 'italiano' then 'it' when 'italien' then 'it' when 'italian' then 'it' when 'it' then 'it'
    when 'deutsch' then 'de' when 'allemand' then 'de' when 'german' then 'de' when 'de' then 'de'
    when 'nederlands' then 'nl' when 'néerlandais' then 'nl' when 'dutch' then 'nl' when 'nl' then 'nl'
    when 'русский' then 'ru' when 'russe' then 'ru' when 'russian' then 'ru' when 'ru' then 'ru'
    when 'العربية' then 'ar' when 'arabe' then 'ar' when 'arabic' then 'ar' when 'ar' then 'ar'
    when 'português' then 'pt' when 'portugais' then 'pt' when 'portuguese' then 'pt' when 'pt' then 'pt'
    when '中文' then 'zh' when 'chinois' then 'zh' when 'chinese' then 'zh' when 'zh' then 'zh'
    else case when lower(btrim(value)) ~ '^[a-z]{2}$' then lower(btrim(value)) when btrim(value) = '' then null else btrim(value) end
  end;
$$;

create or replace function public.normalize_language_code(value text)
returns text
language sql
immutable
as $$
  select case
    when btrim(value) in ('Русский', 'русский', 'РУССКИЙ') then 'ru'
    when btrim(value) in ('Китайский') then 'zh'
    else public.normalize_latin_language_code(value)
  end;
$$;

create or replace function public.normalize_language_codes(values_in text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(code order by first_pos), '{}')
  from (
    select public.normalize_language_code(v) as code, min(ord) as first_pos
    from unnest(coalesce(values_in, '{}')) with ordinality as t(v, ord)
    where public.normalize_language_code(v) is not null
    group by public.normalize_language_code(v)
  ) s;
$$;

-- Backup of the original values before conversion (restore: see supabase/checks/rollback_languages.sql).
-- Not exposed through the API: RLS enabled without any policy, no grants to anon/authenticated.
create table if not exists public.profiles_languages_backup_20260924 (
  profile_id uuid primary key,
  languages text[],
  backed_up_at timestamptz not null default now()
);
alter table public.profiles_languages_backup_20260924 enable row level security;
revoke all on public.profiles_languages_backup_20260924 from anon, authenticated;
insert into public.profiles_languages_backup_20260924 (profile_id, languages)
select id, languages from public.profiles
where languages is not null and languages <> public.normalize_language_codes(languages)
on conflict (profile_id) do nothing;

update public.profiles
set languages = public.normalize_language_codes(languages)
where languages is not null and languages <> public.normalize_language_codes(languages);

-- ---------------------------------------------------------------------------
-- 3. Profile visibility (RLS)
-- ---------------------------------------------------------------------------

drop policy if exists "Public read skipper profiles" on public.profiles;
drop policy if exists "Users read own profile" on public.profiles;
drop policy if exists "Recruiters read skipper profiles" on public.profiles;

create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Recruiters read skipper profiles"
  on public.profiles for select
  using (
    role = 'skipper'
    and public.is_recruiter(auth.uid())
    and public.is_email_confirmed()
  );

-- Availability follows the same visibility as the skipper profile.
drop policy if exists "Public read skipper availability" on public.availability_slots;
drop policy if exists "Recruiters read skipper availability" on public.availability_slots;
create policy "Recruiters read skipper availability"
  on public.availability_slots for select
  using (
    auth.uid() = skipper_id
    or public.is_admin(auth.uid())
    or (public.is_recruiter(auth.uid()) and public.is_email_confirmed())
  );

-- Avatars: readable by whoever may see the profile card; uploads limited to images <= 5 MB.
update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where id = 'profile-avatars';

drop policy if exists "Users read own profile avatar" on storage.objects;
drop policy if exists "Visible profiles avatars are readable" on storage.objects;
create policy "Visible profiles avatars are readable"
  on storage.objects for select
  using (
    bucket_id = 'profile-avatars'
    and auth.uid() is not null
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or exists (
        select 1 from public.profiles p
        where p.id::text = (storage.foldername(name))[1]
          and public.can_view_profile_card(p.id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Signup trigger: sanitised metadata, no self-assigned admin role
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  safe_role text;
  safe_availability text;
  safe_experience text;
  legacy_years int;
  slot jsonb;
begin
  safe_role := case
    when meta->>'role' in ('skipper', 'owner', 'broker', 'charter_company') then meta->>'role'
    else 'owner'
  end;

  safe_availability := case
    when safe_role = 'skipper' and meta->>'availability_status' in ('immediate', 'season', 'from_date', 'range', 'specific', 'unavailable')
      then meta->>'availability_status'
    else null
  end;

  -- The previous signup form sent a number of years: keep supporting it (range derived from it).
  legacy_years := case when meta->>'experience_years' ~ '^\d{1,2}$' then (meta->>'experience_years')::int else null end;
  safe_experience := case
    when meta->>'experience_range' in ('0-2', '2-5', '5-10', '10+') then meta->>'experience_range'
    when legacy_years is null then null
    when legacy_years <= 2 then '0-2'
    when legacy_years <= 5 then '2-5'
    when legacy_years <= 10 then '5-10'
    else '10+'
  end;

  insert into public.profiles (
    id, role, full_name, phone, company_name, fleet_size, city,
    experience_years, experience_range, zones, boat_types, languages, permits, avatar_url,
    availability_note, availability_status, available_from, certifications, bio,
    onboarding_step, onboarding_completed_at
  )
  values (
    new.id,
    safe_role,
    left(coalesce(meta->>'full_name', ''), 200),
    left(meta->>'phone', 40),
    left(meta->>'company_name', 200),
    case when meta->>'fleet_size' ~ '^\d{1,6}$' then (meta->>'fleet_size')::int else null end,
    left(meta->>'city', 200),
    legacy_years,
    safe_experience,
    coalesce((select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(meta->'zones') = 'array' then meta->'zones' else '[]'::jsonb end) x), '{}'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(meta->'boat_types') = 'array' then meta->'boat_types' else '[]'::jsonb end) x), '{}'),
    public.normalize_language_codes(coalesce((select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(meta->'languages') = 'array' then meta->'languages' else '[]'::jsonb end) x), '{}')),
    left(meta->>'permits', 500),
    null,
    left(meta->>'availability_note', 500),
    safe_availability,
    case when safe_availability = 'from_date' and meta->>'available_from' ~ '^\d{4}-\d{2}-\d{2}$' then (meta->>'available_from')::date else null end,
    case when jsonb_typeof(meta->'certifications') = 'array' then meta->'certifications' else '[]'::jsonb end,
    left(meta->>'bio', 2000),
    'role_details',
    null
  )
  on conflict (id) do nothing;

  if safe_availability in ('range', 'specific') and jsonb_typeof(meta->'availability_slots') = 'array' then
    for slot in select value from jsonb_array_elements(meta->'availability_slots') limit 60 loop
      if slot->>'start_date' ~ '^\d{4}-\d{2}-\d{2}$' and slot->>'end_date' ~ '^\d{4}-\d{2}-\d{2}$'
         and (slot->>'start_date')::date <= (slot->>'end_date')::date then
        insert into public.availability_slots (skipper_id, start_date, end_date)
        values (new.id, (slot->>'start_date')::date, (slot->>'end_date')::date);
      end if;
    end loop;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Missions: Permanent type, dates, duration, currency, on-quote
-- ---------------------------------------------------------------------------

alter table public.missions drop constraint if exists missions_type_check;
alter table public.missions
  add constraint missions_type_check
  check (type in ('À la journée', 'À la semaine', 'Saisonnier', 'Convoyage', 'Permanent', 'Autre')) not valid;
-- NOT VALID: enforced for new/updated rows only, existing rows are never rejected.

alter table public.missions add column if not exists end_date date;
alter table public.missions add column if not exists duration_hours numeric(7, 2);
alter table public.missions add column if not exists compensation_amount numeric(12, 2);
alter table public.missions add column if not exists currency text not null default 'EUR';
alter table public.missions add column if not exists on_quote boolean not null default false;

alter table public.missions drop constraint if exists missions_currency_check;
alter table public.missions add constraint missions_currency_check check (currency in ('EUR', 'USD'));
alter table public.missions drop constraint if exists missions_end_date_check;
alter table public.missions add constraint missions_end_date_check check (end_date is null or end_date >= start_date);
alter table public.missions drop constraint if exists missions_duration_hours_check;
alter table public.missions add constraint missions_duration_hours_check check (duration_hours is null or (duration_hours > 0 and duration_hours <= 10000));
alter table public.missions drop constraint if exists missions_compensation_amount_check;
alter table public.missions add constraint missions_compensation_amount_check check (compensation_amount is null or compensation_amount >= 0);

create index if not exists idx_missions_status on public.missions (status);

drop policy if exists "Demandeurs can create their own missions" on public.missions;
create policy "Demandeurs can create their own missions"
  on public.missions for insert
  with check (
    auth.uid() = poster_id
    and status = 'open'
    and public.is_email_confirmed()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'broker', 'charter_company')
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Applications: withdrawal kept in history, re-apply, e-mail confirmation
-- ---------------------------------------------------------------------------

alter table public.applications add column if not exists withdrawn_at timestamptz;

alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications
  add constraint applications_status_check
  check (status in ('pending', 'accepted', 'rejected', 'withdrawn')) not valid;

drop policy if exists "Skippers can apply" on public.applications;
create policy "Skippers can apply"
  on public.applications for insert
  with check (
    auth.uid() = skipper_id
    and status = 'pending'
    and public.is_email_confirmed()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'skipper')
    and exists (select 1 from public.missions m where m.id = mission_id and m.status = 'open')
  );

drop policy if exists "Skippers can withdraw or reapply" on public.applications;
create policy "Skippers can withdraw or reapply"
  on public.applications for update
  using (auth.uid() = skipper_id)
  with check (auth.uid() = skipper_id and status in ('pending', 'withdrawn'));

create or replace function public.enforce_application_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mission_owner uuid;
  mission_status text;
begin
  if new.mission_id <> old.mission_id
     or new.skipper_id <> old.skipper_id
     or coalesce(new.phone, '') <> coalesce(old.phone, '')
     or coalesce(new.message, '') <> coalesce(old.message, '')
     or new.applied_at <> old.applied_at then
    raise exception 'Only status can be updated on applications';
  end if;

  if new.status = old.status then
    new.withdrawn_at := old.withdrawn_at;
    return new;
  end if;

  select m.poster_id, m.status into mission_owner, mission_status
  from public.missions m
  where m.id = old.mission_id;

  if auth.uid() is null then
    raise exception 'Authentication required for status transition';
  end if;

  if auth.uid() = old.skipper_id then
    if old.status = 'pending' and new.status = 'withdrawn' then
      new.withdrawn_at := now();
      return new;
    end if;
    if old.status = 'withdrawn' and new.status = 'pending' then
      if mission_status <> 'open' then
        raise exception 'Mission is no longer open';
      end if;
      if not public.is_email_confirmed() then
        raise exception 'Email confirmation required';
      end if;
      new.withdrawn_at := null;
      return new;
    end if;
    raise exception 'Skipper can only withdraw a pending application or re-apply to an open mission';
  end if;

  if auth.uid() = mission_owner then
    if not (old.status = 'pending' and new.status in ('accepted', 'rejected')) then
      raise exception 'Owner can only accept or reject a pending application';
    end if;
    if new.status = 'accepted' and mission_status <> 'open' then
      raise exception 'Mission must be open to accept an application';
    end if;
    return new;
  end if;

  raise exception 'Not allowed to change this application status';
end;
$$;

create or replace function public.sync_applicants_count_on_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mission_owner uuid;
begin
  if old.status = 'pending' and new.status = 'withdrawn' then
    update public.missions set applicants_count = greatest(applicants_count - 1, 0) where id = new.mission_id;

    select poster_id into mission_owner from public.missions where id = new.mission_id;
    if mission_owner is not null then
      insert into public.notifications (user_id, type, payload)
      values (mission_owner, 'application_withdrawn', jsonb_build_object(
        'mission_id', new.mission_id, 'application_id', new.id, 'skipper_id', new.skipper_id));
    end if;
  elsif old.status = 'withdrawn' and new.status = 'pending' then
    update public.missions set applicants_count = applicants_count + 1 where id = new.mission_id;

    select poster_id into mission_owner from public.missions where id = new.mission_id;
    if mission_owner is not null then
      insert into public.notifications (user_id, type, payload)
      values (mission_owner, 'new_application', jsonb_build_object(
        'mission_id', new.mission_id, 'application_id', new.id, 'skipper_id', new.skipper_id));
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_application_withdraw_sync on public.applications;
create trigger on_application_withdraw_sync
  after update of status on public.applications
  for each row execute function public.sync_applicants_count_on_status();

-- ---------------------------------------------------------------------------
-- 7. Conversations & messages: only after an application, e-mail confirmed
-- ---------------------------------------------------------------------------

drop policy if exists "Demandeur can start a conversation" on public.conversations;
create policy "Demandeur can start a conversation"
  on public.conversations for insert
  with check (
    auth.uid() = demandeur_id
    and public.is_email_confirmed()
    and exists (
      select 1 from public.missions m
      where m.id = conversations.mission_id and m.poster_id = auth.uid()
    )
    and exists (
      select 1 from public.applications a
      where a.mission_id = conversations.mission_id
        and a.skipper_id = conversations.skipper_id
        and a.status in ('pending', 'accepted')
    )
  );

drop policy if exists "Skipper can start conversation after applying" on public.conversations;
create policy "Skipper can start conversation after applying"
  on public.conversations for insert
  with check (
    auth.uid() = skipper_id
    and public.is_email_confirmed()
    and exists (
      select 1 from public.applications a
      where a.mission_id = conversations.mission_id
        and a.skipper_id = auth.uid()
        and a.status in ('pending', 'accepted')
    )
    and exists (
      select 1 from public.missions m
      where m.id = conversations.mission_id and m.poster_id = conversations.demandeur_id
    )
  );

alter table public.messages add column if not exists read_at timestamptz;
alter table public.messages drop constraint if exists messages_text_length_check;
alter table public.messages
  add constraint messages_text_length_check
  check (char_length(btrim(text)) between 1 and 4000) not valid;

create index if not exists idx_messages_unread on public.messages (conversation_id, sender_id) where read_at is null;

drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and read_at is null
    and public.is_email_confirmed()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (auth.uid() = c.demandeur_id or auth.uid() = c.skipper_id)
        and exists (
          select 1 from public.applications a
          where a.mission_id = c.mission_id
            and a.skipper_id = c.skipper_id
            and a.status in ('pending', 'accepted')
        )
    )
  );

create or replace function public.notify_on_message_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conv_demandeur uuid;
  conv_skipper uuid;
  conv_mission uuid;
  recipient_id uuid;
begin
  select c.demandeur_id, c.skipper_id, c.mission_id
  into conv_demandeur, conv_skipper, conv_mission
  from public.conversations c
  where c.id = new.conversation_id;

  if conv_demandeur is null or conv_skipper is null or conv_mission is null then
    return new;
  end if;

  if not exists (
    select 1 from public.applications a
    where a.mission_id = conv_mission
      and a.skipper_id = conv_skipper
      and a.status in ('pending', 'accepted')
  ) then
    return new;
  end if;

  if new.sender_id = conv_demandeur then
    recipient_id := conv_skipper;
  elsif new.sender_id = conv_skipper then
    recipient_id := conv_demandeur;
  else
    return new;
  end if;

  insert into public.notifications (user_id, type, payload)
  values (
    recipient_id,
    'new_message',
    jsonb_build_object(
      'conversation_id', new.conversation_id,
      'mission_id', conv_mission,
      'sender_id', new.sender_id,
      'message_id', new.id
    )
  );

  return new;
end;
$$;

-- Marks every message received in a conversation as read (and the matching notifications).
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id and (c.demandeur_id = me or c.skipper_id = me)
  ) then
    raise exception 'Not a participant of this conversation';
  end if;

  update public.messages
  set read_at = now()
  where conversation_id = p_conversation_id
    and sender_id <> me
    and read_at is null;

  update public.notifications
  set read = true
  where user_id = me
    and type = 'new_message'
    and read = false
    and payload->>'conversation_id' = p_conversation_id::text;
end;
$$;

-- Conversation list for the messaging screen (only accessible conversations).
create or replace function public.my_conversations()
returns table (
  conversation_id uuid,
  mission_id uuid,
  mission_departure text,
  mission_destination text,
  other_id uuid,
  other_role text,
  other_name text,
  other_company text,
  other_avatar_url text,
  last_message text,
  last_message_at timestamptz,
  last_sender_id uuid,
  unread_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.mission_id,
    m.departure,
    m.destination,
    o.id,
    o.role,
    o.full_name,
    o.company_name,
    o.avatar_url,
    lm.text,
    coalesce(lm.created_at, c.created_at),
    lm.sender_id,
    (
      select count(*)::int from public.messages x
      where x.conversation_id = c.id and x.sender_id <> auth.uid() and x.read_at is null
    )
  from public.conversations c
  join public.missions m on m.id = c.mission_id
  join public.profiles o on o.id = case when c.demandeur_id = auth.uid() then c.skipper_id else c.demandeur_id end
  left join lateral (
    select msg.text, msg.created_at, msg.sender_id
    from public.messages msg
    where msg.conversation_id = c.id
    order by msg.created_at desc
    limit 1
  ) lm on true
  where auth.uid() is not null
    and (c.demandeur_id = auth.uid() or c.skipper_id = auth.uid())
    and exists (
      select 1 from public.applications a
      where a.mission_id = c.mission_id
        and a.skipper_id = c.skipper_id
        and a.status in ('pending', 'accepted')
    )
  order by coalesce(lm.created_at, c.created_at) desc;
$$;

create or replace function public.unread_messages_count()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(unread_count), 0)::int from public.my_conversations();
$$;

revoke execute on function public.mark_conversation_read(uuid) from public, anon;
revoke execute on function public.my_conversations() from public, anon;
revoke execute on function public.unread_messages_count() from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.my_conversations() to authenticated;
grant execute on function public.unread_messages_count() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Reviews: visibility aligned with profiles, confirmed e-mail, short comment
-- ---------------------------------------------------------------------------

-- 8a. Self-contained review safety net (normally created by 20260908103000).
-- Every object is created ONLY if it is absent: existing objects and rows are never
-- dropped, replaced or modified, so this block is idempotent and non-destructive.
alter table public.reviews enable row level security;

do $$
begin
  -- Rating must stay between 1 and 5 (the original table has an inline check; add one only if none exists).
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.reviews'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%rating%'
  ) then
    alter table public.reviews
      add constraint reviews_rating_range_check check (rating between 1 and 5) not valid;
  end if;

  -- One review per mission and reviewer.
  if not exists (
    select 1 from pg_index i
    join pg_attribute a1 on a1.attrelid = i.indrelid and a1.attnum = i.indkey[0]
    join pg_attribute a2 on a2.attrelid = i.indrelid and a2.attnum = i.indkey[1]
    where i.indrelid = 'public.reviews'::regclass
      and i.indisunique
      and i.indnkeyatts = 2
      and a1.attname = 'mission_id'
      and a2.attname = 'reviewer_id'
  ) then
    if exists (
      select 1 from public.reviews group by mission_id, reviewer_id having count(*) > 1
    ) then
      -- Never delete data to make room for the index: stop and let a human decide.
      raise exception 'Duplicate reviews (same mission and reviewer) exist: resolve them manually before this migration';
    end if;
    create unique index reviews_unique_by_mission_reviewer_idx on public.reviews (mission_id, reviewer_id);
  end if;

  -- Integrity trigger function (created only if missing; an existing one is kept as is).
  if to_regprocedure('public.enforce_review_integrity()') is null then
    execute $fn$
      create function public.enforce_review_integrity()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        mission_owner uuid;
        accepted_skipper uuid;
        mission_status text;
      begin
        select m.poster_id, m.status into mission_owner, mission_status
        from public.missions m
        where m.id = new.mission_id;

        if mission_owner is null then
          raise exception 'Mission introuvable pour cet avis';
        end if;
        if mission_status <> 'completed' then
          raise exception 'Avis autorise uniquement pour une mission terminee';
        end if;

        select a.skipper_id into accepted_skipper
        from public.applications a
        where a.mission_id = new.mission_id and a.status = 'accepted'
        limit 1;

        if accepted_skipper is null then
          raise exception 'Aucun skipper accepte pour cette mission';
        end if;
        if new.reviewer_id = new.reviewee_id then
          raise exception 'Auto-evaluation interdite';
        end if;
        if not (
          (new.reviewer_id = mission_owner and new.reviewee_id = accepted_skipper)
          or (new.reviewer_id = accepted_skipper and new.reviewee_id = mission_owner)
        ) then
          raise exception 'Participants invalides pour cet avis';
        end if;
        return new;
      end;
      $body$
    $fn$;
  end if;

  -- Trigger (created only if missing).
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.reviews'::regclass
      and tgname = 'on_review_integrity_check'
      and not tgisinternal
  ) then
    create trigger on_review_integrity_check
      before insert on public.reviews
      for each row execute function public.enforce_review_integrity();
  end if;
end $$;

-- 8b. Policies and comment length.

drop policy if exists "Anyone can read reviews" on public.reviews;
drop policy if exists "Reviews visible with the reviewed profile" on public.reviews;
create policy "Reviews visible with the reviewed profile"
  on public.reviews for select
  using (
    auth.uid() = reviewer_id
    or auth.uid() = reviewee_id
    or public.is_admin(auth.uid())
    or (
      public.is_recruiter(auth.uid())
      and exists (select 1 from public.profiles p where p.id = reviews.reviewee_id and p.role = 'skipper')
    )
  );

drop policy if exists "Participants can leave a review after a mission" on public.reviews;
create policy "Participants can leave a review after a mission"
  on public.reviews for insert
  with check (
    auth.uid() = reviews.reviewer_id
    and reviews.reviewer_id <> reviews.reviewee_id
    and public.is_email_confirmed()
    and exists (
      select 1
      from public.applications a
      join public.missions m on m.id = a.mission_id
      where a.mission_id = reviews.mission_id
        and a.status = 'accepted'
        and m.status = 'completed'
        and (
          (reviews.reviewer_id = m.poster_id and reviews.reviewee_id = a.skipper_id)
          or (reviews.reviewer_id = a.skipper_id and reviews.reviewee_id = m.poster_id)
        )
    )
  );

alter table public.reviews drop constraint if exists reviews_comment_length_check;
alter table public.reviews
  add constraint reviews_comment_length_check
  check (comment is null or char_length(comment) <= 1000) not valid;

-- ---------------------------------------------------------------------------
-- 9. Realtime: make sure badge / messaging tables emit changes when available
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['messages', 'notifications', 'applications'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
