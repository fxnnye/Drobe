-- Drobe Phase 5: Kaufanfragen absichern – Melden und Sperren.
-- Einmalig im Supabase-Dashboard unter "SQL Editor" ausführen (nach supabase-phase4.sql).
--
-- Gemeldet wird über eine Funktion; die Meldungen sieht nur der Betreiber im Dashboard (Tabelle "reports").
-- Gesperrte Konten können dir nichts mehr schicken und tauchen in deiner Treffersuche und deinen Mitteilungen nicht mehr auf.

create table if not exists public.blocks (
  blocker    uuid not null references auth.users(id) on delete cascade,
  blocked    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  constraint block_not_self check (blocker <> blocked)
);
alter table public.blocks enable row level security;
revoke all on public.blocks from anon, authenticated;
grant select on public.blocks to authenticated;
create policy "eigene Sperren lesen" on public.blocks for select using (auth.uid() = blocker);

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter    uuid not null references auth.users(id) on delete cascade,
  target_user uuid not null references auth.users(id) on delete cascade,
  record_id   text,
  reason      text not null check (reason in ('betrug', 'faelschung', 'belaestigung', 'spam', 'sonstiges')),
  note        text check (note is null or char_length(note) <= 300),
  created_at  timestamptz not null default now()
);
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated; -- nur der Betreiber liest im Dashboard

create or replace function public.report_user(p_username text, p_reason text, p_record_id text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); target uuid;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  select user_id into target from public.profiles where username = lower(p_username);
  if target is null then raise exception 'Profil nicht gefunden.'; end if;
  if target = me then raise exception 'Das bist du selbst.'; end if;
  if (select count(*) from public.reports where reporter = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Für heute ist das Limit erreicht.';
  end if;
  insert into public.reports (reporter, target_user, record_id, reason, note)
  values (me, target, nullif(left(coalesce(p_record_id, ''), 100), ''), p_reason, nullif(left(trim(coalesce(p_note, '')), 300), ''));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.set_block(p_username text, p_block boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); target uuid;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  select user_id into target from public.profiles where username = lower(p_username);
  if target is null then raise exception 'Profil nicht gefunden.'; end if;
  if target = me then raise exception 'Das bist du selbst.'; end if;
  if p_block then
    insert into public.blocks (blocker, blocked) values (me, target) on conflict do nothing;
  else
    delete from public.blocks where blocker = me and blocked = target;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.my_blocks() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(p.username order by p.username), '[]'::jsonb)
  from public.blocks b join public.profiles p on p.user_id = b.blocked where b.blocker = auth.uid()
$$;

revoke all on function public.report_user(text, text, text, text) from public, anon;
revoke all on function public.set_block(text, boolean) from public, anon;
revoke all on function public.my_blocks() from public, anon;
grant execute on function public.report_user(text, text, text, text) to authenticated;
grant execute on function public.set_block(text, boolean) to authenticated;
grant execute on function public.my_blocks() to authenticated;

-- Phase-4-Funktionen mit Sperr-Prüfung
create or replace function public.send_interest(
  p_to text, p_kind text, p_record_id text, p_message text default null, p_ref_item text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  target public.profiles;
  rec public.records;
  rk text;
  ref_ok text;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  if p_kind not in ('interest', 'have') then raise exception 'Ungültige Anfrage.'; end if;

  select * into target from public.profiles where username = lower(p_to);
  if not found then raise exception 'Profil nicht gefunden.'; end if;
  if target.user_id = me then raise exception 'Das bist du selbst.'; end if;
  if exists (select 1 from public.blocks where blocker = me and blocked = target.user_id) then
    raise exception 'Du hast diese Person gesperrt.';
  end if;
  if exists (select 1 from public.blocks where blocker = target.user_id and blocked = me) then
    raise exception 'Das ist gerade nicht möglich.';
  end if;

  rk := case p_kind when 'interest' then 'items' else 'wishlist' end;
  select * into rec from public.records where user_id = target.user_id and kind = rk and id = p_record_id;
  if not found or not public.is_public_record(rk, rec.data) then raise exception 'Dieser Eintrag ist nicht mehr verfügbar.'; end if;

  if (select count(*) from public.interests where from_user = me and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Für heute ist das Limit erreicht.';
  end if;

  -- ein angehängtes Teil muss dem Absender gehören und öffentlich sein, sonst wird es ignoriert
  if p_ref_item is not null then
    select id into ref_ok from public.records
    where user_id = me and kind = 'items' and id = p_ref_item and public.is_public_record('items', data);
  end if;

  insert into public.interests (from_user, to_user, kind, record_id, ref_item, message)
  values (me, target.user_id, p_kind, p_record_id, ref_ok, nullif(left(trim(coalesce(p_message, '')), 200), ''))
  on conflict (from_user, to_user, kind, record_id)
  do update set message = excluded.message, ref_item = excluded.ref_item, created_at = now(), read_at = null;

  return jsonb_build_object('ok', true);
end $$;


create or replace function public.my_interests() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'from', p.username,
    'kind', i.kind,
    'record_id', i.record_id,
    'record_name', r.data->>'name',
    'ref_item', i.ref_item,
    'ref_name', ri.data->>'name',
    'message', i.message,
    'created_at', i.created_at,
    'unread', i.read_at is null
  ) order by i.created_at desc), '[]'::jsonb)
  from (
    select * from public.interests where to_user = auth.uid()
      and from_user not in (select blocked from public.blocks where blocker = auth.uid()) order by created_at desc limit 100
  ) i
  join public.profiles p on p.user_id = i.from_user
  left join public.records r on r.user_id = i.to_user and r.id = i.record_id
        and r.kind = case i.kind when 'interest' then 'items' else 'wishlist' end
  left join public.records ri on ri.user_id = i.from_user and ri.id = i.ref_item and ri.kind = 'items'
$$;


create or replace function public.find_public_items(p_brand text, p_query text, p_size text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  res jsonb;
  tokens text[] := array(
    select t from unnest(string_to_array(regexp_replace(lower(coalesce(p_query, '')), '[^a-z0-9äöüß]+', ' ', 'g'), ' ')) t
    where length(t) >= 3
  );
begin
  if auth.uid() is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(x.j), '[]'::jsonb) into res from (
    select jsonb_build_object(
      'username', p.username,
      'id', r.id,
      'path', r.user_id::text || '/items-' || r.id,
      'name', r.data->>'name', 'brand', r.data->>'brand', 'size', r.data->>'size', 'vis', r.data->>'vis',
      'price', case when r.data->>'vis' = 'sale' then r.data->'price' end
    ) as j
    from public.records r
    join public.profiles p on p.user_id = r.user_id
    where r.kind = 'items'
      and public.is_public_record('items', r.data)
      and r.user_id <> auth.uid()
      and not exists (select 1 from public.blocks b
                      where (b.blocker = auth.uid() and b.blocked = r.user_id) or (b.blocker = r.user_id and b.blocked = auth.uid()))
      and nullif(trim(coalesce(p_brand, '')), '') is not null
      and lower(r.data->>'brand') = lower(trim(p_brand))
      and (nullif(trim(coalesce(p_size, '')), '') is null or coalesce(r.data->>'size', '') = ''
           or lower(r.data->>'size') = lower(trim(p_size)))
      and (cardinality(tokens) = 0 or exists (
            select 1 from unnest(tokens) t where strpos(lower(coalesce(r.data->>'name', '')), t) > 0))
    order by r.updated_at desc
    limit 30
  ) x;

  return res;
end $$;


revoke all on function public.send_interest(text, text, text, text, text) from public, anon;
grant execute on function public.send_interest(text, text, text, text, text) to authenticated;
revoke all on function public.my_interests() from public, anon;
grant execute on function public.my_interests() to authenticated;
revoke all on function public.find_public_items(text, text, text) from public, anon;
grant execute on function public.find_public_items(text, text, text) to authenticated;
