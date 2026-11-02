-- Drobe Migration 0004: Konto löschen, Moderation, Profiltexte, Folgen, Merken, Obergrenze.
-- Im Supabase-Dashboard unter "SQL Editor" ausführen (nach 0003).

-- Profiltexte
alter table public.profiles add column if not exists bio  text check (bio is null or char_length(bio) <= 160);
alter table public.profiles add column if not exists city text check (city is null or char_length(city) <= 40);

create or replace function public.update_my_profile(p_bio text, p_city text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Bitte melde dich an.'; end if;
  update public.profiles set bio = nullif(left(trim(coalesce(p_bio, '')), 160), ''), city = nullif(left(trim(coalesce(p_city, '')), 40), '')
  where user_id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.my_profile_text() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('bio', bio, 'city', city) from public.profiles where user_id = auth.uid()
$$;

-- Konto löschen: entfernt das Konto und alles, was daran hängt (Profil, Einträge, Nachrichten, Meldungen, Folgen, Gemerktes)
create or replace function public.delete_my_account() returns jsonb
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Bitte melde dich an.'; end if;
  delete from auth.users where id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;

-- Obergrenze: höchstens 2000 Einträge pro Konto
create or replace function public.limit_records() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.records where user_id = new.user_id) >= 2000 then
    raise exception 'Du hast die Obergrenze von 2000 Einträgen erreicht.';
  end if;
  return new;
end $$;
drop trigger if exists records_limit on public.records;
create trigger records_limit before insert on public.records for each row execute function public.limit_records();

-- Moderation: Betreiber sehen offene Meldungen
create table if not exists public.admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
insert into public.admins (user_id) select user_id from public.profiles where username = 'fxnnye' on conflict do nothing;

alter table public.reports add column if not exists resolved_at timestamptz;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

create or replace function public.admin_reports() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'reporter', rp.username, 'target', tp.username, 'record_id', r.record_id,
      'reason', r.reason, 'note', r.note, 'created_at', r.created_at
    ) order by r.created_at desc)
    from (select * from public.reports where resolved_at is null order by created_at desc limit 100) r
    left join public.profiles rp on rp.user_id = r.reporter
    left join public.profiles tp on tp.user_id = r.target_user
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_resolve_report(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  update public.reports set resolved_at = now() where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- Folgen
create table if not exists public.follows (
  follower uuid not null references auth.users(id) on delete cascade,
  followee uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  constraint follow_not_self check (follower <> followee)
);
create index if not exists follows_followee_idx on public.follows (followee);
alter table public.follows enable row level security;
revoke all on public.follows from anon, authenticated;

create or replace function public.toggle_follow(p_username text) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); target uuid; now_on boolean;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  select user_id into target from public.profiles where username = lower(p_username);
  if target is null then raise exception 'Profil nicht gefunden.'; end if;
  if target = me then raise exception 'Das bist du selbst.'; end if;
  if exists (select 1 from public.blocks b where (b.blocker = me and b.blocked = target) or (b.blocker = target and b.blocked = me)) then
    raise exception 'Das geht hier nicht.';
  end if;
  if exists (select 1 from public.follows where follower = me and followee = target) then
    delete from public.follows where follower = me and followee = target;
    now_on := false;
  else
    insert into public.follows (follower, followee) values (me, target);
    now_on := true;
  end if;
  return now_on;
end $$;

create or replace function public.my_follows() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(p.username order by p.username), '[]'::jsonb)
  from public.follows f join public.profiles p on p.user_id = f.followee where f.follower = auth.uid()
$$;

-- Merken
create table if not exists public.saves (
  user_id  uuid not null references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  item_id  text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, owner_id, item_id)
);
alter table public.saves enable row level security;
revoke all on public.saves from anon, authenticated;

create or replace function public.toggle_save(p_username text, p_item text) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); target uuid;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  select user_id into target from public.profiles where username = lower(p_username);
  if target is null then raise exception 'Profil nicht gefunden.'; end if;
  if exists (select 1 from public.saves where user_id = me and owner_id = target and item_id = p_item) then
    delete from public.saves where user_id = me and owner_id = target and item_id = p_item;
    return false;
  end if;
  if not exists (select 1 from public.items i where i.user_id = target and i.id = p_item and not i.deleted and i.vis in ('public', 'trade', 'sale')) then
    raise exception 'Dieses Teil ist nicht mehr verfügbar.';
  end if;
  if (select count(*) from public.saves where user_id = me) >= 500 then raise exception 'Du hast schon 500 Teile gemerkt.'; end if;
  insert into public.saves (user_id, owner_id, item_id) values (me, target, p_item);
  return true;
end $$;

-- Gemerkte Teile (nur noch öffentliche), neueste zuerst
create or replace function public.my_saves() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.j order by x.at desc), '[]'::jsonb) from (
    select s.created_at as at, jsonb_build_object(
      'username', p.username, 'id', i.id, 'path', i.user_id::text || '/items-' || i.id,
      'name', i.name, 'brand', i.brand, 'size', i.size, 'cond', i.cond, 'color', i.color, 'vis', i.vis,
      'price', case when i.vis = 'sale' then to_jsonb(i.price) end,
      'swap',  case when i.vis = 'trade' then i.swap end, 'ts', s.created_at) as j
    from public.saves s
    join public.items i on i.user_id = s.owner_id and i.id = s.item_id and not i.deleted and i.vis in ('public', 'trade', 'sale')
    join public.profiles p on p.user_id = s.owner_id
    where s.user_id = auth.uid()
      and not exists (select 1 from public.blocks b where (b.blocker = auth.uid() and b.blocked = s.owner_id) or (b.blocker = s.owner_id and b.blocked = auth.uid()))
    order by s.created_at desc limit 200
  ) x
$$;

create or replace function public.my_save_ids() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(p.username || '/' || s.item_id), '[]'::jsonb)
  from public.saves s join public.profiles p on p.user_id = s.owner_id where s.user_id = auth.uid()
$$;

-- Feed: neuer Parameter p_mode ('following' zeigt nur Mitglieder, denen man folgt)
drop function if exists public.feed_public(text, timestamptz, text);
create or replace function public.feed_public(p_kind text, p_before timestamptz default null, p_color text default null, p_mode text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  if p_kind = 'outfits' then
    select coalesce(jsonb_agg(x.j order by x.ts desc), '[]'::jsonb) into res from (
      select o.updated_at as ts, jsonb_build_object(
        'username', p.username, 'id', o.id, 'path', o.user_id::text || '/outfits-' || o.id,
        'name', o.name, 'vis', o.vis, 'ts', o.updated_at) as j
      from public.outfits o join public.profiles p on p.user_id = o.user_id
      where not o.deleted and o.vis = 'public'
        and (p_before is null or o.updated_at < p_before)
        and (coalesce(p_mode, '') <> 'following' or o.user_id in (select followee from public.follows where follower = auth.uid()))
        and (auth.uid() is null or (o.user_id <> auth.uid() and not exists (select 1 from public.blocks b
              where (b.blocker = auth.uid() and b.blocked = o.user_id) or (b.blocker = o.user_id and b.blocked = auth.uid()))))
      order by o.updated_at desc limit 30) x;
  else
    select coalesce(jsonb_agg(x.j order by x.ts desc), '[]'::jsonb) into res from (
      select i.updated_at as ts, jsonb_build_object(
        'username', p.username, 'id', i.id, 'path', i.user_id::text || '/items-' || i.id,
        'name', i.name, 'brand', i.brand, 'size', i.size, 'cond', i.cond, 'rarity', i.rarity, 'color', i.color, 'vis', i.vis,
        'price', case when i.vis = 'sale' then to_jsonb(i.price) end,
        'swap',  case when i.vis = 'trade' then i.swap end,
        'ts', i.updated_at) as j
      from public.items i join public.profiles p on p.user_id = i.user_id
      where not i.deleted and i.vis in ('public', 'trade', 'sale')
        and (p_before is null or i.updated_at < p_before)
        and (coalesce(p_color, '') = '' or i.color = p_color)
        and (coalesce(p_mode, '') <> 'following' or i.user_id in (select followee from public.follows where follower = auth.uid()))
        and (auth.uid() is null or (i.user_id <> auth.uid() and not exists (select 1 from public.blocks b
              where (b.blocker = auth.uid() and b.blocked = i.user_id) or (b.blocker = i.user_id and b.blocked = auth.uid()))))
      order by i.updated_at desc limit 30) x;
  end if;
  return res;
end $$;


create or replace function public.public_profile(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where username = lower(p_username);
  if not found then return null; end if;

  return jsonb_build_object(
    'username', p.username,
    'bio', p.bio,
    'city', p.city,
    'followers', (select count(*) from public.follows f where f.followee = p.user_id),
    'showcase', to_jsonb(p.showcase),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'path', i.user_id::text || '/items-' || i.id,
        'name', i.name, 'category', i.category, 'brand', i.brand, 'size', i.size, 'sku', i.sku,
        'cond', i.cond, 'rarity', i.rarity, 'color', i.color, 'vis', i.vis,
        'price', case when i.vis = 'sale' then to_jsonb(i.price) end,
        'swap',  case when i.vis = 'trade' then i.swap end
      ) order by i.updated_at desc)
      from (select * from public.items x
            where x.user_id = p.user_id and not x.deleted and x.vis in ('public', 'trade', 'sale')
            order by x.updated_at desc limit 500) i
    ), '[]'::jsonb),
    'outfits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'path', o.user_id::text || '/outfits-' || o.id, 'name', o.name
      ) order by o.updated_at desc)
      from (select * from public.outfits x
            where x.user_id = p.user_id and not x.deleted and x.vis = 'public'
            order by x.updated_at desc limit 200) o
    ), '[]'::jsonb),
    'wishlist', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id, 'path', w.user_id::text || '/wishlist-' || w.id,
        'name', w.name, 'category', w.category, 'brand', w.brand, 'size', w.size, 'sku', w.sku
      ) order by w.updated_at desc)
      from (select * from public.wishlist x
            where x.user_id = p.user_id and not x.deleted and x.vis = 'public'
            order by x.updated_at desc limit 500) w
    ), '[]'::jsonb)
  );
end $$;


revoke all on function public.update_my_profile(text, text) from public, anon;
revoke all on function public.my_profile_text() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.admin_reports() from public, anon;
revoke all on function public.admin_resolve_report(uuid) from public, anon;
revoke all on function public.toggle_follow(text) from public, anon;
revoke all on function public.my_follows() from public, anon;
revoke all on function public.toggle_save(text, text) from public, anon;
revoke all on function public.my_saves() from public, anon;
revoke all on function public.my_save_ids() from public, anon;
revoke all on function public.feed_public(text, timestamptz, text, text) from public;
revoke all on function public.public_profile(text) from public;
grant execute on function public.update_my_profile(text, text) to authenticated;
grant execute on function public.my_profile_text() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_reports() to authenticated;
grant execute on function public.admin_resolve_report(uuid) to authenticated;
grant execute on function public.toggle_follow(text) to authenticated;
grant execute on function public.my_follows() to authenticated;
grant execute on function public.toggle_save(text, text) to authenticated;
grant execute on function public.my_saves() to authenticated;
grant execute on function public.my_save_ids() to authenticated;
grant execute on function public.feed_public(text, timestamptz, text, text) to anon, authenticated;
grant execute on function public.public_profile(text) to anon, authenticated;

notify pgrst, 'reload schema';
