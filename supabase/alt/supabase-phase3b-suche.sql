-- Drobe: Mitgliedersuche. Einmalig im Supabase-Dashboard unter "SQL Editor" ausführen (nach supabase-phase3.sql).
--
-- Gesucht wird nur nach Benutzernamen, und nur Konten mit mindestens einem öffentlichen Eintrag (Teil, Outfit oder
-- Wunschliste) tauchen auf. Wer nichts veröffentlicht hat, bleibt unauffindbar, sein Link funktioniert trotzdem.
create or replace function public.search_profiles(p_query text) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(username order by username), '{}') from (
    select p.username from public.profiles p
    where length(trim(p_query)) >= 2
      and strpos(p.username, lower(trim(p_query))) > 0
      and exists (
        select 1 from public.records r
        where r.user_id = p.user_id and public.is_public_record(r.kind, r.data)
      )
    order by p.username
    limit 20
  ) s
$$;

revoke all on function public.search_profiles(text) from public;
grant execute on function public.search_profiles(text) to anon, authenticated;
