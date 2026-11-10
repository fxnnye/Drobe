-- Flex of the Week: vom Admin ausgewählte öffentliche Teile oder Outfits, die oben im Feed stehen.
-- Eine Woche (Montag) hat einen oder mehrere Einträge. Es kann nur ausgewählt werden, was der Besitzer öffentlich gestellt hat.
-- Stellt der Besitzer es später auf privat, verschwindet es von selbst aus der Anzeige.
create table if not exists public.flex_week (
  id         uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.flex_entry (
  id         uuid primary key default gen_random_uuid(),
  flex_id    uuid not null references public.flex_week(id) on delete cascade,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('item', 'outfit')),
  target_id  text not null,
  note       text,
  position   int  not null default 0,
  created_at timestamptz not null default now(),
  unique (flex_id, kind, owner_id, target_id)
);
alter table public.flex_week  enable row level security;
alter table public.flex_entry enable row level security;
revoke all on public.flex_week, public.flex_entry from anon, authenticated;

-- Öffentlich: die Einträge der aktuellen Woche (oder der Woche davor), im Format der Feed-Karten
create or replace function public.current_flex() returns jsonb
language sql stable security definer set search_path = public as $$
  with w as (
    select id, week_start from public.flex_week
    where week_start between (date_trunc('week', now() at time zone 'Europe/Berlin')::date - 7) and date_trunc('week', now() at time zone 'Europe/Berlin')::date
      and exists (select 1 from public.flex_entry e where e.flex_id = flex_week.id)
    order by week_start desc limit 1
  ),
  r as (
    select e.position, e.created_at, jsonb_build_object(
      'entry', e.id, 'note', e.note, 'week', w.week_start,
      'username', p.username, 'id', i.id, 'path', i.user_id::text || '/items-' || i.id,
      'name', i.name, 'brand', i.brand, 'size', i.size, 'cond', i.cond, 'rarity', i.rarity, 'color', i.color, 'vis', i.vis,
      'price', case when i.vis = 'sale' then to_jsonb(i.price) end, 'ts', i.updated_at) as j
    from w join public.flex_entry e on e.flex_id = w.id and e.kind = 'item'
    join public.items i on i.user_id = e.owner_id and i.id = e.target_id
    join public.profiles p on p.user_id = i.user_id
    where not i.deleted and i.vis in ('public', 'sale')
      and (auth.uid() is null or not exists (select 1 from public.blocks b
            where (b.blocker = auth.uid() and b.blocked = i.user_id) or (b.blocker = i.user_id and b.blocked = auth.uid())))
    union all
    select e.position, e.created_at, jsonb_build_object(
      'entry', e.id, 'note', e.note, 'week', w.week_start,
      'username', p.username, 'id', o.id, 'path', o.user_id::text || '/outfits-' || o.id,
      'name', o.name, 'vis', o.vis, 'ts', o.updated_at, 'outfit', true)
    from w join public.flex_entry e on e.flex_id = w.id and e.kind = 'outfit'
    join public.outfits o on o.user_id = e.owner_id and o.id = e.target_id
    join public.profiles p on p.user_id = o.user_id
    where not o.deleted and o.vis = 'public'
      and (auth.uid() is null or not exists (select 1 from public.blocks b
            where (b.blocker = auth.uid() and b.blocked = o.user_id) or (b.blocker = o.user_id and b.blocked = auth.uid())))
  )
  select coalesce(jsonb_agg(j order by position, created_at), '[]'::jsonb) from r
$$;

-- Admin: ein Teil oder Outfit zum Flex der aktuellen Woche machen
create or replace function public.admin_set_flex(p_username text, p_kind text, p_id text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); target uuid; fid uuid;
  wk date := date_trunc('week', now() at time zone 'Europe/Berlin')::date;
  n text := nullif(left(trim(coalesce(p_note, '')), 140), '');
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  if p_kind not in ('item', 'outfit') then raise exception 'Ungültige Art.'; end if;
  select user_id into target from public.profiles where username = lower(p_username);
  if target is null then raise exception 'Profil nicht gefunden.'; end if;
  if p_kind = 'item' and not exists (select 1 from public.items where user_id = target and id = p_id and not deleted and vis in ('public', 'sale')) then
    raise exception 'Dieses Teil ist nicht öffentlich.';
  end if;
  if p_kind = 'outfit' and not exists (select 1 from public.outfits where user_id = target and id = p_id and not deleted and vis = 'public') then
    raise exception 'Dieses Outfit ist nicht öffentlich.';
  end if;
  insert into public.flex_week (week_start, created_by) values (wk, me) on conflict (week_start) do nothing;
  select id into fid from public.flex_week where week_start = wk;
  insert into public.flex_entry (flex_id, owner_id, kind, target_id, note, position)
  values (fid, target, p_kind, p_id, n, coalesce((select max(position) + 1 from public.flex_entry where flex_id = fid), 0))
  on conflict (flex_id, kind, owner_id, target_id) do update set note = excluded.note;
  insert into public.admin_log (admin_id, action, target, detail) values (me, 'flex', lower(p_username), p_kind || ':' || p_id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_remove_flex(p_entry uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); target text;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  delete from public.flex_entry e using public.profiles p where e.id = p_entry and p.user_id = e.owner_id returning p.username into target;
  if target is not null then
    insert into public.admin_log (admin_id, action, target, detail) values (me, 'flex entfernt', target, left(p_entry::text, 40));
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.current_flex(), public.admin_set_flex(text, text, text, text), public.admin_remove_flex(uuid) from public, anon;
grant execute on function public.current_flex() to anon, authenticated;
grant execute on function public.admin_set_flex(text, text, text, text), public.admin_remove_flex(uuid) to authenticated;

-- Die tägliche Sicherung nimmt ab jetzt alle Tabellen mit, auch künftige (nur Fehlerprotokoll und Admin-Protokoll nicht)
create or replace function backup.snapshot() returns jsonb
language plpgsql security definer set search_path = public, backup as $$
declare
  t text;
  d int := extract(dow from now())::int;
  tn text;
  n bigint;
  counts jsonb := '{}'::jsonb;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename not in ('client_errors', 'admin_log') order by 1 loop
    tn := t || '_d' || d;
    execute format('drop table if exists backup.%I', tn);
    execute format('create table backup.%I as select * from public.%I', tn, t);
    execute format('alter table backup.%I enable row level security', tn);
    execute format('revoke all on backup.%I from public, anon, authenticated', tn);
    execute format('select count(*) from backup.%I', tn) into n;
    counts := counts || jsonb_build_object(t, n);
  end loop;
  insert into backup.log (taken_at, dow, counts) values (now(), d, counts)
  on conflict (taken_at) do nothing;
  delete from backup.log where taken_at < now() - interval '30 days';
  return counts;
end $$;
revoke all on function backup.snapshot() from public, anon, authenticated;

update public.schema_info set version = 29, note = 'Flex of the Week', updated_at = now();
notify pgrst, 'reload schema';
