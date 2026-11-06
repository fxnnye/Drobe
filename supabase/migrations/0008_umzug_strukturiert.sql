-- Drobe Migration 0008: Umzug auf die strukturierten Tabellen (Schritt 1 von 2).
--
-- Bisher: Die App schrieb in `records`, ein Trigger pflegte daraus items/outfits/wishlist.
-- Jetzt: Die App schreibt und liest über sync_push / sync_pull direkt in items/outfits/wishlist.
-- Jede dieser Tabellen bekommt eine Spalte `data` mit dem vollständigen App-Eintrag (Notizen, Links, Ebenen, Maße …);
-- die festen Spalten (name, brand, vis …) werden daraus an genau einer Stelle (apply_row) abgeleitet.
-- `records` bleibt in diesem Schritt als Brücke für noch nicht aktualisierte Geräte bestehen und fällt in 0011 weg.

alter table public.items    add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.outfits  add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.wishlist add column if not exists data jsonb not null default '{}'::jsonb;

-- Bestehende Einträge übernehmen (einmalig)
update public.items    t set data = r.data from public.records r where r.kind = 'items'    and r.user_id = t.user_id and r.id = t.id;
update public.outfits  t set data = r.data from public.records r where r.kind = 'outfits'  and r.user_id = t.user_id and r.id = t.id;
update public.wishlist t set data = r.data from public.records r where r.kind = 'wishlist' and r.user_id = t.user_id and r.id = t.id;

-- Ein Eintrag in die passende Tabelle schreiben: feste Spalten aus `data` ableiten, Texte kürzen
create or replace function public.apply_row(p_user uuid, p_kind text, p_id text, d jsonb, p_updated timestamptz) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  del boolean := coalesce(d->>'deleted', 'false') = 'true';
  v text := coalesce(nullif(d->>'vis', ''), 'private');
  b text := nullif(left(trim(coalesce(d->>'brand', '')), 80), '');
  bid bigint;
  l jsonb;
  n int := 0;
begin
  if v not in ('private', 'public', 'trade', 'sale') then v := 'private'; end if;
  if p_kind = 'items' then
    if b is not null then
      insert into public.brands (slug, name) values (lower(b), b) on conflict (slug) do nothing;
      select id into bid from public.brands where slug = lower(b);
    end if;
    insert into public.items (user_id, id, name, category, brand, brand_id, size, sku, cond, rarity, color, hex, vis, price, swap, deleted, updated_at, embedding, data)
    values (p_user, p_id, left(d->>'name', 300), left(d->>'category', 60), b, bid, left(nullif(d->>'size', ''), 40), left(nullif(d->>'sku', ''), 80),
            left(nullif(d->>'cond', ''), 40), left(nullif(d->>'rarity', ''), 40), left(nullif(d->>'color', ''), 40), left(nullif(d->>'hex', ''), 20), v,
            case when jsonb_typeof(d->'price') = 'number' and (d->>'price')::numeric between 0 and 100000 then (d->>'price')::numeric end,
            left(nullif(d->>'swap', ''), 300), del, p_updated,
            case when jsonb_typeof(d->'emb') = 'array' and jsonb_array_length(d->'emb') = 512 then (d->'emb')::text::extensions.vector end,
            d)
    on conflict (user_id, id) do update set
      name = excluded.name, category = excluded.category, brand = excluded.brand, brand_id = excluded.brand_id, size = excluded.size,
      sku = excluded.sku, cond = excluded.cond, rarity = excluded.rarity, color = excluded.color, hex = excluded.hex, vis = excluded.vis,
      price = excluded.price, swap = excluded.swap, deleted = excluded.deleted, updated_at = excluded.updated_at, embedding = excluded.embedding, data = excluded.data;
  elsif p_kind = 'outfits' then
    insert into public.outfits (user_id, id, name, vis, deleted, updated_at, data)
    values (p_user, p_id, left(d->>'name', 300), v, del, p_updated, d)
    on conflict (user_id, id) do update set name = excluded.name, vis = excluded.vis, deleted = excluded.deleted, updated_at = excluded.updated_at, data = excluded.data;
    delete from public.outfit_items where user_id = p_user and outfit_id = p_id;
    if jsonb_typeof(d->'layers') = 'array' then
      for l in select * from jsonb_array_elements(d->'layers') loop
        if nullif(l->>'itemId', '') is not null then
          n := n + 1;
          insert into public.outfit_items (user_id, outfit_id, item_id, position) values (p_user, p_id, left(l->>'itemId', 40), n);
        end if;
      end loop;
    end if;
  elsif p_kind = 'wishlist' then
    insert into public.wishlist (user_id, id, name, category, brand, size, sku, vis, deleted, updated_at, data)
    values (p_user, p_id, left(d->>'name', 300), left(d->>'category', 60), b, left(nullif(d->>'size', ''), 40), left(nullif(d->>'sku', ''), 80), v, del, p_updated, d)
    on conflict (user_id, id) do update set name = excluded.name, category = excluded.category, brand = excluded.brand, size = excluded.size,
      sku = excluded.sku, vis = excluded.vis, deleted = excluded.deleted, updated_at = excluded.updated_at, data = excluded.data;
  end if;
end $$;
revoke all on function public.apply_row(uuid, text, text, jsonb, timestamptz) from public, anon, authenticated;

-- Alte Wege (records-Trigger) benutzen dieselbe Funktion; die Brücke aus sync_push überspringt den Trigger
create or replace function public.sync_typed(r public.records) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.apply_row(r.user_id, r.kind, r.id, r.data, r.updated_at);
end $$;

create or replace function public.records_to_typed() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if current_setting('drobe.bridge', true) = '1' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if old.kind = 'items' then delete from public.items where user_id = old.user_id and id = old.id;
    elsif old.kind = 'outfits' then delete from public.outfits where user_id = old.user_id and id = old.id;
    elsif old.kind = 'wishlist' then delete from public.wishlist where user_id = old.user_id and id = old.id;
    end if;
    return old;
  end if;
  perform public.sync_typed(new);
  return new;
end $$;
revoke all on function public.sync_typed(public.records) from public, anon, authenticated;
revoke all on function public.records_to_typed() from public, anon, authenticated;

-- Die neuen Wege der App
create or replace function public.sync_push(p_kind text, p_id text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  now_ts timestamptz := now();
  known boolean;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  if p_kind not in ('items', 'outfits', 'wishlist') then raise exception 'Ungültige Art.'; end if;
  if p_id is null or p_id !~ '^[A-Za-z0-9_-]{1,40}$' then raise exception 'Ungültige ID.'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 150000 then raise exception 'Eintrag ungültig oder zu groß.'; end if;

  known := case p_kind
    when 'items' then exists (select 1 from public.items where user_id = me and id = p_id)
    when 'outfits' then exists (select 1 from public.outfits where user_id = me and id = p_id)
    else exists (select 1 from public.wishlist where user_id = me and id = p_id) end;
  if not known and (select (select count(*) from public.items where user_id = me)
                         + (select count(*) from public.outfits where user_id = me)
                         + (select count(*) from public.wishlist where user_id = me)) >= 2000 then
    raise exception 'Du hast die Obergrenze von 2000 Einträgen erreicht.';
  end if;

  perform public.apply_row(me, p_kind, p_id, p_data, now_ts);

  -- Brücke für Geräte, die noch die alte App-Version haben (entfällt mit 0011)
  perform set_config('drobe.bridge', '1', true);
  insert into public.records (user_id, kind, id, data, updated_at) values (me, p_kind, p_id, p_data, now_ts)
  on conflict (user_id, kind, id) do update set data = excluded.data, updated_at = excluded.updated_at;
  perform set_config('drobe.bridge', '0', true);

  return jsonb_build_object('ok', true);
end $$;

create or replace function public.sync_pull() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.j), '[]'::jsonb) from (
    select jsonb_build_object('kind', 'items', 'id', id, 'data', data) as j from public.items where user_id = auth.uid() and data <> '{}'::jsonb
    union all
    select jsonb_build_object('kind', 'outfits', 'id', id, 'data', data) from public.outfits where user_id = auth.uid() and data <> '{}'::jsonb
    union all
    select jsonb_build_object('kind', 'wishlist', 'id', id, 'data', data) from public.wishlist where user_id = auth.uid() and data <> '{}'::jsonb
    limit 5000
  ) x
$$;

revoke all on function public.sync_push(text, text, jsonb) from public, anon;
revoke all on function public.sync_pull() from public, anon;
grant execute on function public.sync_push(text, text, jsonb) to authenticated;
grant execute on function public.sync_pull() to authenticated;

-- Alles, was noch auf `records` zeigte, liest jetzt aus den strukturierten Tabellen
create or replace function public.send_interest(
  p_to text, p_kind text, p_record_id text, p_message text default null, p_ref_item text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  target public.profiles;
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

  if p_kind = 'interest' then
    perform 1 from public.items where user_id = target.user_id and id = p_record_id and not deleted and vis in ('public', 'trade', 'sale');
  else
    perform 1 from public.wishlist where user_id = target.user_id and id = p_record_id and not deleted and vis = 'public';
  end if;
  if not found then raise exception 'Dieser Eintrag ist nicht mehr verfügbar.'; end if;

  if (select count(*) from public.interests where from_user = me and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Für heute ist das Limit erreicht.';
  end if;

  -- ein angehängtes Teil muss dem Absender gehören und öffentlich sein, sonst wird es ignoriert
  if p_ref_item is not null then
    select id into ref_ok from public.items where user_id = me and id = p_ref_item and not deleted and vis in ('public', 'trade', 'sale');
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
    'record_name', case i.kind
      when 'interest' then (select it.name from public.items it where it.user_id = i.to_user and it.id = i.record_id)
      else (select w.name from public.wishlist w where w.user_id = i.to_user and w.id = i.record_id) end,
    'ref_item', i.ref_item,
    'ref_name', (select it.name from public.items it where it.user_id = i.from_user and it.id = i.ref_item),
    'message', i.message,
    'created_at', i.created_at,
    'unread', i.read_at is null
  ) order by i.created_at desc), '[]'::jsonb)
  from (
    select * from public.interests where to_user = auth.uid()
      and from_user not in (select blocked from public.blocks where blocker = auth.uid()) order by created_at desc limit 100
  ) i
  join public.profiles p on p.user_id = i.from_user
$$;

create or replace function public.my_threads() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(t.j order by t.last_at desc), '[]'::jsonb) from (
    select
      greatest(i.created_at, coalesce(lr.created_at, i.created_at)) as last_at,
      jsonb_build_object(
        'id', i.id,
        'other', p.username,
        'mine', i.from_user = auth.uid(),
        'kind', i.kind,
        'record_name', case i.kind
          when 'interest' then (select it.name from public.items it where it.user_id = i.to_user and it.id = i.record_id)
          else (select w.name from public.wishlist w where w.user_id = i.to_user and w.id = i.record_id) end,
        'ref_name', (select it.name from public.items it where it.user_id = i.from_user and it.id = i.ref_item),
        'last_text', coalesce(nullif(lr.body, ''), case when lr.image_path is not null then 'Foto' end, i.message),
        'last_mine', case when lr.id is not null then lr.from_user = auth.uid() else i.from_user = auth.uid() end,
        'last_at', greatest(i.created_at, coalesce(lr.created_at, i.created_at)),
        'unread', (i.to_user = auth.uid() and i.read_at is null)
                  or exists (select 1 from public.replies x where x.interest_id = i.id and x.from_user <> auth.uid() and x.read_at is null)
      ) as j
    from public.interests i
    join public.profiles p on p.user_id = case when i.from_user = auth.uid() then i.to_user else i.from_user end
    left join lateral (
      select * from public.replies x where x.interest_id = i.id order by x.created_at desc limit 1
    ) lr on true
    where auth.uid() in (i.from_user, i.to_user)
    order by greatest(i.created_at, coalesce(lr.created_at, i.created_at)) desc
    limit 100
  ) t
$$;

-- Fremde dürfen nur die Fotos öffentlicher Einträge sehen (nie das Ausgangsfoto …-src)
create or replace function public.is_public_object(obj_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.items i
                 where i.user_id::text = (storage.foldername(obj_name))[1] and 'items-' || i.id = storage.filename(obj_name)
                   and not i.deleted and i.vis in ('public', 'trade', 'sale'))
      or exists (select 1 from public.outfits o
                 where o.user_id::text = (storage.foldername(obj_name))[1] and 'outfits-' || o.id = storage.filename(obj_name)
                   and not o.deleted and o.vis = 'public')
      or exists (select 1 from public.wishlist w
                 where w.user_id::text = (storage.foldername(obj_name))[1] and 'wishlist-' || w.id = storage.filename(obj_name)
                   and not w.deleted and w.vis = 'public')
$$;

revoke all on function public.send_interest(text, text, text, text, text) from public, anon;
grant execute on function public.send_interest(text, text, text, text, text) to authenticated;
revoke all on function public.my_interests() from public, anon;
grant execute on function public.my_interests() to authenticated;
revoke all on function public.my_threads() from public, anon;
grant execute on function public.my_threads() to authenticated;

notify pgrst, 'reload schema';
