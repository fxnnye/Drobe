-- Outfits anderer merken (wie Teile): Tabelle, Schalter, Liste
create table if not exists public.outfit_saves (
  user_id    uuid not null references auth.users(id) on delete cascade,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  outfit_id  text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, owner_id, outfit_id)
);
alter table public.outfit_saves enable row level security;
revoke all on public.outfit_saves from anon, authenticated;

create or replace function public.toggle_outfit_save(p_username text, p_id text) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); target uuid;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  select user_id into target from public.profiles where username = lower(p_username);
  if target is null then raise exception 'Profil nicht gefunden.'; end if;
  if exists (select 1 from public.outfit_saves where user_id = me and owner_id = target and outfit_id = p_id) then
    delete from public.outfit_saves where user_id = me and owner_id = target and outfit_id = p_id;
    return false;
  end if;
  if not exists (select 1 from public.outfits o where o.user_id = target and o.id = p_id and not o.deleted and o.vis = 'public') then
    raise exception 'Dieses Outfit ist nicht mehr verfügbar.';
  end if;
  if (select count(*) from public.outfit_saves where user_id = me) >= 500 then raise exception 'Du hast schon 500 Outfits gemerkt.'; end if;
  insert into public.outfit_saves (user_id, owner_id, outfit_id) values (me, target, p_id);
  return true;
end $$;

create or replace function public.my_outfit_save_ids() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(p.username || '/' || s.outfit_id), '[]'::jsonb)
  from public.outfit_saves s join public.profiles p on p.user_id = s.owner_id where s.user_id = auth.uid()
$$;

create or replace function public.my_outfit_saves() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.j order by x.at desc), '[]'::jsonb) from (
    select s.created_at as at, jsonb_build_object(
      'username', p.username, 'id', o.id, 'path', o.user_id::text || '/outfits-' || o.id,
      'name', o.name, 'vis', o.vis, 'ts', s.created_at, 'outfit', true) as j
    from public.outfit_saves s
    join public.outfits o on o.user_id = s.owner_id and o.id = s.outfit_id and not o.deleted and o.vis = 'public'
    join public.profiles p on p.user_id = s.owner_id
    where s.user_id = auth.uid()
      and not exists (select 1 from public.blocks b where (b.blocker = auth.uid() and b.blocked = s.owner_id) or (b.blocker = s.owner_id and b.blocked = auth.uid()))
    order by s.created_at desc limit 200
  ) x
$$;

revoke all on function public.toggle_outfit_save(text, text), public.my_outfit_save_ids(), public.my_outfit_saves() from public, anon;
grant execute on function public.toggle_outfit_save(text, text), public.my_outfit_save_ids(), public.my_outfit_saves() to authenticated;
notify pgrst, 'reload schema';
