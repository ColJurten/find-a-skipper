-- Restores the original language labels saved by migration 20260924100000.
-- Only needed if the migration has to be reverted; run it in a transaction.
begin;
update public.profiles p
set languages = b.languages
from public.profiles_languages_backup_20260924 b
where b.profile_id = p.id;
commit;
