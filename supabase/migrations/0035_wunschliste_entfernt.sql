-- Wunschliste entfernt: keine Funktion liest oder schreibt mehr die Tabelle public.wishlist.
-- Die Tabelle selbst und ihre Daten bleiben bestehen und werden erst nach ausdrücklicher Freigabe gelöscht (Migration 0036).
-- Alte Unterhaltungen vom Typ 'have' bleiben lesbar, zeigen aber keinen Wunschnamen mehr. Neue gibt es nicht.

-- Sperren und Ausblenden betreffen nur noch Teile und Outfits
create or replace function public.admin_ban(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  select target_user into t from public.reports where id = p_id;
  if t is null then raise exception 'Meldung nicht gefunden.'; end if;
  if exists (select 1 from public.user_role where user_id = t and role = 'admin') then raise exception 'Ein Admin-Konto lässt sich nicht sperren.'; end if;
  update auth.users set banned_until = now() + interval '100 years' where id = t;
  begin delete from auth.sessions where user_id = t; exception when others then null; end; -- angemeldete Geräte abmelden
  update public.profiles set banned_at = now() where user_id = t;
  update public.items set mod_hidden = true, updated_at = now() where user_id = t;
  update public.outfits set mod_hidden = true, updated_at = now() where user_id = t;
  update public.reports set resolved_at = now(), outcome = 'banned' where target_user = t and resolved_at is null;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_hide_record(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.reports;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  select * into r from public.reports where id = p_id;
  if not found then raise exception 'Meldung nicht gefunden.'; end if;
  if r.record_id is null then raise exception 'Die Meldung betrifft keinen einzelnen Eintrag.'; end if;
  update public.items set mod_hidden = true, updated_at = now() where user_id = r.target_user and id = r.record_id;
  update public.outfits set mod_hidden = true, updated_at = now() where user_id = r.target_user and id = r.record_id;
  update public.reports set resolved_at = now(), outcome = 'hidden' where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_reports() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'reporter', rp.username, 'target', tp.username, 'record_id', r.record_id,
      'record_name', coalesce(
        (select i.name from public.items i where i.user_id = r.target_user and i.id = r.record_id),
        (select o.name from public.outfits o where o.user_id = r.target_user and o.id = r.record_id)),
      'reason', r.reason, 'note', r.note, 'created_at', r.created_at, 'target_banned', tp.banned_at is not null
    ) order by r.created_at desc)
    from (select * from public.reports where resolved_at is null order by created_at desc limit 100) r
    left join public.profiles rp on rp.user_id = r.reporter
    left join public.profiles tp on tp.user_id = r.target_user
  ), '[]'::jsonb);
end $$;

-- Foto-Zugriff: nur öffentliche Teile und Outfits
create or replace function public.is_public_object(obj_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.items i where i.user_id::text = (storage.foldername(obj_name))[1]
           and 'items-' || i.id = storage.filename(obj_name) and not i.deleted and i.visibility = 'public')
      or exists (select 1 from public.outfits o where o.user_id::text = (storage.foldername(obj_name))[1]
           and 'outfits-' || o.id = storage.filename(obj_name) and not o.deleted and o.vis = 'public')
$$;

-- Abgleich: Zeilen der Art 'wishlist' (von alten App-Ständen) werden ignoriert
create or replace function public.apply_row(p_user uuid, p_kind text, p_id text, d jsonb, p_updated timestamp with time zone) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  del boolean := coalesce(d->>'deleted', 'false') = 'true';
  v text := coalesce(nullif(d->>'vis', ''), 'private');
  b text := nullif(left(trim(coalesce(d->>'brand', '')), 80), '');
  bid bigint; l jsonb; n int := 0; vv text; pr numeric;
begin
  if v not in ('private', 'public', 'trade', 'sale') then v := 'private'; end if;
  if v = 'trade' then v := 'public'; end if; -- Tauschen gibt es nicht mehr
  if p_kind = 'items' then
    if b is not null then
      insert into public.brands (slug, name) values (lower(b), b) on conflict (slug) do nothing;
      select id into bid from public.brands where slug = lower(b);
    end if;
    insert into public.items (user_id, id, name, category, brand, brand_id, size, sku, cond, rarity, color, hex, visibility, deleted, updated_at, embedding, data)
    values (p_user, p_id, left(d->>'name', 300), left(d->>'category', 60), b, bid,
            left(nullif(d->>'size', ''), 40), left(nullif(d->>'sku', ''), 80), left(nullif(d->>'cond', ''), 40),
            left(nullif(d->>'rarity', ''), 40), left(nullif(d->>'color', ''), 40), left(nullif(d->>'hex', ''), 20),
            case when v in ('public', 'sale') then 'public' else 'private' end, del, p_updated,
            case when jsonb_typeof(d->'emb') = 'array' and jsonb_array_length(d->'emb') = 512 then (d->'emb')::text::extensions.vector end, d)
    on conflict (user_id, id) do update set
      name = excluded.name, category = excluded.category, brand = excluded.brand, brand_id = excluded.brand_id,
      size = excluded.size, sku = excluded.sku, cond = excluded.cond, rarity = excluded.rarity, color = excluded.color,
      hex = excluded.hex, visibility = excluded.visibility, deleted = excluded.deleted, updated_at = excluded.updated_at,
      embedding = excluded.embedding, data = excluded.data;
    -- Verkaufsangebot: nur bei „sale“ mit gültigem Preis, nur solange das Teil wirklich öffentlich ist (die Sperre durch den Betreiber zählt mit)
    select visibility into vv from public.items where user_id = p_user and id = p_id;
    pr := case when jsonb_typeof(d->'price') = 'number' and (d->>'price')::numeric between 0 and 100000 then (d->>'price')::numeric end;
    if not del and v = 'sale' and pr is not null and vv = 'public' then
      insert into public.listing (item_id, user_id, price_cents, currency)
      values (p_id, p_user, least(round(pr * 100), 10000000)::int, 'EUR')
      on conflict (item_id) do update set price_cents = excluded.price_cents, updated_at = now()
      where public.listing.status <> 'sold';
    else
      delete from public.listing where item_id = p_id and user_id = p_user and status <> 'sold';
    end if;
  elsif p_kind = 'outfits' then
    insert into public.outfits (user_id, id, name, vis, deleted, updated_at, data)
    values (p_user, p_id, left(d->>'name', 300), v, del, p_updated, d)
    on conflict (user_id, id) do update set
      name = excluded.name, vis = excluded.vis, deleted = excluded.deleted, updated_at = excluded.updated_at, data = excluded.data;
    delete from public.outfit_items where user_id = p_user and outfit_id = p_id;
    if jsonb_typeof(d->'layers') = 'array' then
      for l in select * from jsonb_array_elements(d->'layers') loop
        if nullif(l->>'itemId', '') is not null then
          n := n + 1;
          insert into public.outfit_items (user_id, outfit_id, item_id, position) values (p_user, p_id, left(l->>'itemId', 40), n);
        end if;
      end loop;
    end if;
  end if;
end $$;

-- Nachrichten: alte „have“-Unterhaltungen zeigen keinen Namen mehr
create or replace function public.my_interests() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'from', p.username, 'kind', t.kind, 'record_id', t.item_id,
    'record_name', case t.kind when 'interest' then (select it.name from public.items it where it.user_id = t.to_user and it.id = t.item_id) end,
    'ref_item', t.ref_item,
    'ref_name', (select it.name from public.items it where it.user_id = t.from_user and it.id = t.ref_item),
    'message', nullif(t.body, ''), 'created_at', t.req_at, 'unread', t.req_read is null
  ) order by t.req_at desc), '[]'::jsonb)
  from (
    select th.*, m.body, m.created_at as req_at, m.read_at as req_read
    from public.thread th
    join public.message m on m.thread_id = th.id and m.kind = 'request'
    where th.to_user = auth.uid()
      and th.from_user not in (select blocked from public.blocks where blocker = auth.uid())
    order by m.created_at desc limit 100
  ) t
  join public.profiles p on p.user_id = t.from_user
$$;

create or replace function public.my_threads() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.j order by x.last_at desc), '[]'::jsonb)
  from (
    select lm.created_at as last_at, jsonb_build_object(
      'id', t.id, 'other', p.username, 'mine', t.from_user = auth.uid(), 'kind', t.kind,
      'record_name', case t.kind when 'interest' then (select it.name from public.items it where it.user_id = t.to_user and it.id = t.item_id) end,
      'record_id', t.item_id,
      'record_brand', case t.kind when 'interest' then (select it.brand from public.items it where it.user_id = t.to_user and it.id = t.item_id) end,
      'record_path', case t.kind when 'interest' then t.to_user::text || '/items-' || t.item_id end,
      'ref_name', (select it.name from public.items it where it.user_id = t.from_user and it.id = t.ref_item),
      'last_text', coalesce(nullif(lm.body, ''), case when lm.image_path is not null then 'Foto' end),
      'last_mine', lm.sender = auth.uid(), 'last_at', lm.created_at,
      'unread', exists (select 1 from public.message x where x.thread_id = t.id and x.sender <> auth.uid() and x.read_at is null)
    ) as j
    from public.thread t
    join public.profiles p on p.user_id = case when t.from_user = auth.uid() then t.to_user else t.from_user end
    join lateral (select * from public.message x where x.thread_id = t.id order by x.created_at desc limit 1) lm on true
    where auth.uid() in (t.from_user, t.to_user)
    order by lm.created_at desc limit 100
  ) x
$$;

-- Öffentliches Profil ohne Wunschliste
create or replace function public.public_profile(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where username = lower(p_username);
  if not found then return null; end if;
  return jsonb_build_object(
    'username', p.username, 'bio', p.bio, 'city', p.city,
    'followers', (select count(*) from public.follows f where f.followee = p.user_id),
    'showcase', to_jsonb(p.showcase),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'path', i.user_id::text || '/items-' || i.id, 'name', i.name, 'category', i.category,
        'brand', i.brand, 'size', i.size, 'sku', i.sku, 'cond', i.cond, 'rarity', i.rarity, 'color', i.color,
        'vis', public.item_vis(i.id), 'price', public.item_price(i.id)
      ) order by i.updated_at desc)
      from (select * from public.items x where x.user_id = p.user_id and not x.deleted and x.visibility = 'public' order by x.updated_at desc limit 500) i
    ), '[]'::jsonb),
    'outfits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'path', o.user_id::text || '/outfits-' || o.id, 'name', o.name
      ) order by o.updated_at desc)
      from (select * from public.outfits x where x.user_id = p.user_id and not x.deleted and x.vis = 'public' order by x.updated_at desc limit 200) o
    ), '[]'::jsonb)
  );
end $$;

-- Anfragen gibt es nur noch zu Teilen
create or replace function public.send_interest(p_to text, p_kind text, p_record_id text, p_message text default null, p_ref_item text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); target public.profiles; ref_ok text; tid uuid; oid uuid; lst public.listing;
  msg text := nullif(left(trim(coalesce(p_message, '')), 200), '');
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  if p_kind <> 'interest' then raise exception 'Ungültige Anfrage.'; end if;
  select * into target from public.profiles where username = lower(p_to);
  if not found then raise exception 'Profil nicht gefunden.'; end if;
  if target.user_id = me then raise exception 'Das bist du selbst.'; end if;
  if exists (select 1 from public.blocks where blocker = me and blocked = target.user_id) then raise exception 'Du hast diese Person gesperrt.'; end if;
  if exists (select 1 from public.blocks where blocker = target.user_id and blocked = me) then raise exception 'Das ist gerade nicht möglich.'; end if;
  perform 1 from public.items where user_id = target.user_id and id = p_record_id and not deleted and visibility = 'public';
  if not found then raise exception 'Dieser Eintrag ist nicht mehr verfügbar.'; end if;
  if (select count(*) from public.message m join public.thread t on t.id = m.thread_id
      where t.from_user = me and m.kind = 'request' and m.created_at > now() - interval '1 day') >= 30 then
    raise exception 'Für heute ist das Limit erreicht.';
  end if;
  -- ein angehängtes Teil muss dem Absender gehören und öffentlich sein, sonst wird es ignoriert
  if p_ref_item is not null then
    select id into ref_ok from public.items where user_id = me and id = p_ref_item and not deleted and visibility = 'public';
  end if;
  insert into public.thread (from_user, to_user, kind, item_id, ref_item)
  values (me, target.user_id, p_kind, p_record_id, ref_ok)
  on conflict (from_user, to_user, kind, item_id) do update set ref_item = excluded.ref_item, created_at = now()
  returning id into tid;
  update public.message set body = coalesce(msg, ''), created_at = now(), read_at = null where thread_id = tid and kind = 'request';
  if not found then
    insert into public.message (thread_id, sender, kind, body) values (tid, me, 'request', coalesce(msg, ''));
  end if;
  -- Kaufanfrage zu einem Teil mit aktivem Angebot: ein offenes offer zum Angebotspreis
  select * into lst from public.listing where item_id = p_record_id and user_id = target.user_id and status = 'active';
  if found then
    select id into oid from public.offer where thread_id = tid and listing_id = lst.id and status = 'open';
    if oid is null then
      insert into public.offer (thread_id, listing_id, from_user, to_user, amount_cents, currency)
      values (tid, lst.id, me, target.user_id, lst.price_cents, lst.currency) returning id into oid;
      insert into public.offer_item (offer_id, item_id) values (oid, p_record_id);
    else
      update public.offer set amount_cents = lst.price_cents where id = oid;
    end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_unban(p_username text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  select user_id into t from public.profiles where username = lower(p_username) and banned_at is not null;
  if t is null then raise exception 'Konto nicht gefunden.'; end if;
  update auth.users set banned_until = null where id = t;
  update public.profiles set banned_at = null where user_id = t;
  update public.items set mod_hidden = false where user_id = t;
  update public.outfits set mod_hidden = false where user_id = t;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.sync_pull() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.j), '[]'::jsonb) from (
    select jsonb_build_object('kind', 'items', 'id', id, 'data', data) as j
      from public.items where user_id = auth.uid() and data <> '{}'::jsonb
    union all
    select jsonb_build_object('kind', 'outfits', 'id', id, 'data', data)
      from public.outfits where user_id = auth.uid() and data <> '{}'::jsonb
    limit 5000
  ) x
$$;

-- Alte App-Stände dürfen noch 'wishlist' senden: wird angenommen und verworfen, damit ihre Warteschlange nicht hängen bleibt
create or replace function public.sync_push(p_kind text, p_id text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); known boolean;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  if p_kind = 'wishlist' then return jsonb_build_object('ok', true); end if;
  if p_kind not in ('items', 'outfits') then raise exception 'Ungültige Art.'; end if;
  if p_id is null or p_id !~ '^[A-Za-z0-9_-]{1,40}$' then raise exception 'Ungültige ID.'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 150000 then
    raise exception 'Eintrag ungültig oder zu groß.';
  end if;
  known := case p_kind
    when 'items' then exists (select 1 from public.items where user_id = me and id = p_id)
    else exists (select 1 from public.outfits where user_id = me and id = p_id) end;
  if not known and (select (select count(*) from public.items where user_id = me)
                         + (select count(*) from public.outfits where user_id = me)) >= 2000 then
    raise exception 'Du hast die Obergrenze von 2000 Einträgen erreicht.';
  end if;
  perform public.apply_row(me, p_kind, p_id, p_data, now());
  return jsonb_build_object('ok', true);
end $$;

update public.schema_info set version = 35, note = 'Wunschliste entfernt', updated_at = now();
