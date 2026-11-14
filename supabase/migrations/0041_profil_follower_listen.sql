-- 0041: Follower und „Folge ich“ auch bei fremden Profilen (Zahl und Liste).
-- Im Supabase-Dashboard unter "SQL Editor" ausführen. Die Schemaversion bleibt bei 39 (nur eine neue Funktion).
--   profile_people(username) : { followers: [Namen], following: [Namen] } eines Profils, auch für Besucher.
--   Gesperrte Konten (in beide Richtungen) erscheinen nicht in der Liste.

create or replace function public.profile_people(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid; me uuid := auth.uid();
begin
  select user_id into uid from public.profiles where username = lower(p_username);
  if uid is null then return null; end if;
  return jsonb_build_object(
    'followers', coalesce((
      select jsonb_agg(p.username order by p.username)
      from public.follows f join public.profiles p on p.user_id = f.follower
      where f.followee = uid
        and (me is null or not exists (select 1 from public.blocks b where (b.blocker = me and b.blocked = p.user_id) or (b.blocker = p.user_id and b.blocked = me)))
    ), '[]'::jsonb),
    'following', coalesce((
      select jsonb_agg(p.username order by p.username)
      from public.follows f join public.profiles p on p.user_id = f.followee
      where f.follower = uid
        and (me is null or not exists (select 1 from public.blocks b where (b.blocker = me and b.blocked = p.user_id) or (b.blocker = p.user_id and b.blocked = me)))
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.profile_people(text) from public, anon, authenticated;
grant execute on function public.profile_people(text) to anon, authenticated;
notify pgrst, 'reload schema';
