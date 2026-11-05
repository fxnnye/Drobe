-- Drobe: Liste der eigenen Follower (Benutzernamen) für „Profil → Follower“.
create or replace function public.my_followers() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(p.username order by p.username), '[]'::jsonb)
  from public.follows f join public.profiles p on p.user_id = f.follower
  where f.followee = auth.uid()
$$;

revoke all on function public.my_followers() from public, anon;
grant execute on function public.my_followers() to authenticated;

notify pgrst, 'reload schema';
