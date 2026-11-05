-- Drobe: Die Mitgliedersuche findet alle Konten, auch solche ohne öffentliche Einträge.
-- Gesperrte Konten (in beide Richtungen) werden Angemeldeten nicht angezeigt.
create or replace function public.search_profiles(p_query text) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(username order by username), '{}') from (
    select p.username from public.profiles p
    where length(trim(p_query)) >= 2
      and strpos(p.username, lower(trim(p_query))) > 0
      and (auth.uid() is null or (p.user_id <> auth.uid() and not exists (
            select 1 from public.blocks b
            where (b.blocker = auth.uid() and b.blocked = p.user_id) or (b.blocker = p.user_id and b.blocked = auth.uid()))))
    order by p.username
    limit 20
  ) s
$$;

revoke all on function public.search_profiles(text) from public;
grant execute on function public.search_profiles(text) to anon, authenticated;

notify pgrst, 'reload schema';
