-- READ-ONLY verification after applying 20260924100000. Every row must show status = 'OK'.
select 'profiles columns' as check_name,
       case when (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name in ('availability_status', 'available_from', 'experience_range')) = 3 then 'OK' else 'FAIL' end as status
union all select 'missions columns', case when (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'missions' and column_name in ('end_date', 'duration_hours', 'compensation_amount', 'currency', 'on_quote')) = 5 then 'OK' else 'FAIL' end
union all select 'messages.read_at', case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'read_at') then 'OK' else 'FAIL' end
union all select 'RPCs', case when to_regprocedure('public.my_conversations()') is not null and to_regprocedure('public.mark_conversation_read(uuid)') is not null and to_regprocedure('public.get_profile_cards(uuid[])') is not null then 'OK' else 'FAIL' end
union all select 'anonymous cannot call my_conversations', case when not has_function_privilege('anon', 'public.my_conversations()', 'execute') then 'OK' else 'FAIL' end
union all select 'old public skipper-profile policy removed', case when not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'Public read skipper profiles') then 'OK' else 'FAIL' end
union all select 'language backup table exists and is not exposed', case when to_regclass('public.profiles_languages_backup_20260924') is not null and not has_table_privilege('anon', 'public.profiles_languages_backup_20260924', 'select') then 'OK' else 'FAIL' end
union all select 'no remaining non-code languages (except kept unknown labels)', 'OK: ' || coalesce((select string_agg(distinct l, ', ') from public.profiles, unnest(languages) l where l !~ '^[a-z]{2}$'), 'none');
