-- Schritt 12, Stufe 1: Alle Funktionen lesen und schreiben jetzt items.visibility und die Tabelle listing.
-- Die alten Spalten items.vis, items.price und items.swap werden nicht mehr benutzt, aber noch nicht gelöscht (Stufe 2, 0031).
-- Das Datenformat zwischen App und Server bleibt gleich: die App kennt weiter vis = private | public | sale und price.
-- Der Server legt daraus ab: visibility (private | public) und bei „sale“ ein Verkaufsangebot (listing, Preis in Cent).
-- Beim Ausliefern wird vis wieder daraus gebildet: „sale“, wenn es ein aktives oder reserviertes Angebot gibt, sonst „public“.

-- 1. Hilfsfunktionen (nur intern, nicht über die API aufrufbar)
create or replace function public.item_vis(p_id text) returns text
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.listing where item_id = p_id and status in ('active', 'reserved')) then 'sale' else 'public' end
$$;
create or replace function public.item_price(p_id text) returns jsonb
language sql stable security definer set search_path = public as $$
  select (select to_jsonb(round(price_cents / 100.0, 2)) from public.listing where item_id = p_id and status in ('active', 'reserved'))
$$;
revoke all on function public.item_vis(text), public.item_price(text) from public, anon, authenticated;

-- 2. Schreiben: ein Teil kommt an, visibility und Angebot werden hier abgeleitet (statt über die Trigger auf vis/price)
create or replace function public.apply_row(p_user uuid, p_kind text, p_id text, d jsonb, p_updated timestamptz) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  del boolean := coalesce(d->>'deleted', 'false') = 'true';
  v text := coalesce(nullif(d->>'vis', ''), 'private');
  b text := nullif(left(trim(coalesce(d->>'brand', '')), 80), '');
  bid bigint;
  l jsonb;
  n int := 0;
  vv text;
  pr numeric;
begin
  if v not in ('private', 'public', 'trade', 'sale') then v := 'private'; end if;
  if v = 'trade' then v := 'public'; end if; -- Tauschen gibt es nicht mehr
  if p_kind = 'items' then
    if b is not null then
      insert into public.brands (slug, name) values (lower(b), b) on conflict (slug) do nothing;
      select id into bid from public.brands where slug = lower(b);
    end if;
    insert into public.items (user_id, id, name, category, brand, brand_id, size, sku, cond, rarity, color, hex, visibility, deleted, updated_at, embedding, data)
    values (p_user, p_id, left(d->>'name', 300), left(d->>'category', 60), b, bid, left(nullif(d->>'size', ''), 40), left(nullif(d->>'sku', ''), 80),
            left(nullif(d->>'cond', ''), 40), left(nullif(d->>'rarity', ''), 40), left(nullif(d->>'color', ''), 40), left(nullif(d->>'hex', ''), 20),
            case when v in ('public', 'sale') then 'public' else 'private' end, del, p_updated,
            case when jsonb_typeof(d->'emb') = 'array' and jsonb_array_length(d->'emb') = 512 then (d->'emb')::text::extensions.vector end,
            d)
    on conflict (user_id, id) do update set
      name = excluded.name, category = excluded.category, brand = excluded.brand, brand_id = excluded.brand_id, size = excluded.size,
      sku = excluded.sku, cond = excluded.cond, rarity = excluded.rarity, color = excluded.color, hex = excluded.hex, visibility = excluded.visibility,
      deleted = excluded.deleted, updated_at = excluded.updated_at, embedding = excluded.embedding, data = excluded.data;
    -- Verkaufsangebot: nur bei „sale“ mit gültigem Preis, nur solange das Teil wirklich öffentlich ist (die Sperre durch den Betreiber zählt mit)
    select visibility into vv from public.items where user_id = p_user and id = p_id;
    pr := case when jsonb_typeof(d->'price') = 'number' and (d->>'price')::numeric between 0 and 100000 then (d->>'price')::numeric end;
    if not del and v = 'sale' and pr is not null and vv = 'public' then
      insert into public.listing (item_id, user_id, price_cents, currency)
      values (p_id, p_user, least(round(pr * 100), 10000000)::int, 'EUR')
      on conflict (item_id) do update set price_cents = excluded.price_cents, updated_at = now() where public.listing.status <> 'sold';
    else
      delete from public.listing where item_id = p_id and user_id = p_user and status <> 'sold';
    end if;
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

-- 3. Trigger: Sperre durch den Betreiber setzt visibility auf privat, ein nicht mehr öffentliches oder gelöschtes Teil verliert sein Angebot
create or replace function public.item_keep_hidden() returns trigger
language plpgsql as $$
begin
  if new.mod_hidden then
    new.visibility := 'private';
    if new.data is not null and new.data <> '{}'::jsonb then new.data := jsonb_set(new.data, '{vis}', '"private"'); end if;
  end if;
  return new;
end $$;
drop trigger if exists items_keep_hidden on public.items;
create trigger items_keep_hidden before insert or update on public.items
  for each row execute function public.item_keep_hidden();

create or replace function public.item_listing_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.deleted or new.visibility <> 'public' then
    delete from public.listing where item_id = new.id and status <> 'sold';
  end if;
  return null;
end $$;
revoke all on function public.item_listing_guard() from public, anon, authenticated;
drop trigger if exists items_listing_guard on public.items;
create trigger items_listing_guard after insert or update on public.items
  for each row execute function public.item_listing_guard();

-- Die alten Trigger auf vis, price und swap sind überflüssig
drop trigger if exists items_visibility on public.items;
drop trigger if exists items_listing_sync on public.items;
drop trigger if exists items_no_trade on public.items;
drop function if exists public.items_visibility();
drop function if exists public.listing_sync();
drop function if exists public.items_no_trade();

-- 4. Indizes auf visibility (die alten auf vis fallen mit der Spalte in Stufe 2 weg)
create index if not exists items_pub_feed_idx  on public.items (updated_at desc) where not deleted and visibility = 'public';
create index if not exists items_pub_color_idx on public.items (color) where not deleted and visibility = 'public';
create index if not exists items_pub_size_idx  on public.items (lower(size)) where not deleted and visibility = 'public';
create index if not exists items_pub_brand_idx on public.items (lower(brand)) where not deleted and visibility = 'public';

-- 5. Lesen: Feed, Suche, ähnliche Teile, Profil, Gemerkte, Outfit-Seite, Flex und alle Prüfungen „ist öffentlich“

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
        'name', i.name, 'brand', i.brand, 'size', i.size, 'cond', i.cond, 'rarity', i.rarity, 'color', i.color, 'vis', public.item_vis(i.id),
        'price', public.item_price(i.id),
        'ts', i.updated_at) as j
      from public.items i join public.profiles p on p.user_id = i.user_id
      where not i.deleted and i.visibility = 'public'
        and (p_before is null or i.updated_at < p_before)
        and (coalesce(p_color, '') = '' or i.color = p_color)
        and (coalesce(p_mode, '') <> 'following' or i.user_id in (select followee from public.follows where follower = auth.uid()))
        and (auth.uid() is null or (i.user_id <> auth.uid() and not exists (select 1 from public.blocks b
              where (b.blocker = auth.uid() and b.blocked = i.user_id) or (b.blocker = i.user_id and b.blocked = auth.uid()))))
      order by i.updated_at desc limit 30) x;
  end if;
  return res;
end $$;

create or replace function public.feed_rank_core(p_user uuid, p_stage int, p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_cfg jsonb;
  v_half float8; v_rec float8; v_pop float8; v_fol float8; v_tas float8; v_view float8; v_save float8; v_int float8;
  v_max int;
  v_recs jsonb[]; v_owners uuid[]; v_used boolean[];
  v_n int; v_i int; v_pick int; v_first int;
  v_offset int := least(greatest(coalesce(p_offset, 0), 0), 570);
  v_want int; v_placed int := 0; v_last uuid; v_run int := 0;
  v_res jsonb := '[]'::jsonb;
begin
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_cfg from public.feed_settings;
  v_half := greatest(coalesce((v_cfg->>'half_life_hours')::float8, 72), 1);
  v_rec  := coalesce((v_cfg->>'w_recency')::float8, 1);
  v_pop  := coalesce((v_cfg->>'w_popularity')::float8, 0.5);
  v_fol  := coalesce((v_cfg->>'w_follow')::float8, 0.5);
  v_tas  := coalesce((v_cfg->>'w_taste')::float8, 1);
  v_view := coalesce((v_cfg->>'w_view')::float8, 0.2);
  v_save := coalesce((v_cfg->>'w_save')::float8, 1);
  v_int  := coalesce((v_cfg->>'w_interest')::float8, 2);
  v_max  := greatest(coalesce((v_cfg->>'max_in_row')::int, 2), 1);
  v_want := v_offset + 30;

  with ev as (
    select e.owner_id, e.target_id,
           case when e.kind in ('view_outfit', 'save_outfit') then 'o' else 'i' end as cls,
           sum(case when e.kind like 'view_%' then v_view when e.kind like 'save_%' then v_save else v_int end) as pts
    from public.events e
    where e.created_at > now() - interval '30 days'
    group by 1, 2, 3
  ),
  sig as (
    select lower(nullif(trim(i.brand), '')) as brand, nullif(i.category, '') as category, nullif(i.color, '') as color,
           case when e.kind = 'view_item' then v_view when e.kind = 'save_item' then v_save else v_int end as w
    from public.events e
    join public.items i on i.user_id = e.owner_id and i.id = e.target_id
    where p_stage >= 2 and e.user_id = p_user and e.kind in ('view_item', 'save_item', 'interest')
      and e.created_at > now() - interval '90 days'
  ),
  t_brand as (select brand as v, sum(w) / nullif((select sum(w) from sig where brand is not null), 0) as sh from sig where brand is not null group by 1),
  t_cat   as (select category as v, sum(w) / nullif((select sum(w) from sig where category is not null), 0) as sh from sig where category is not null group by 1),
  t_col   as (select color as v, sum(w) / nullif((select sum(w) from sig where color is not null), 0) as sh from sig where color is not null group by 1),
  item_taste as (
    select i.user_id, i.id, (coalesce(b.sh, 0) + coalesce(c.sh, 0) + coalesce(f.sh, 0)) / 3 as t
    from public.items i
    left join t_brand b on b.v = lower(nullif(trim(i.brand), ''))
    left join t_cat c on c.v = i.category
    left join t_col f on f.v = i.color
    where p_stage >= 2 and p_user is not null and not i.deleted and i.visibility = 'public'
  ),
  cand as (
    (select 'i' as cls, i.user_id as owner, i.id, i.updated_at as ts, jsonb_build_object(
        'username', p.username, 'id', i.id, 'path', i.user_id::text || '/items-' || i.id,
        'name', i.name, 'brand', i.brand, 'size', i.size, 'cond', i.cond, 'rarity', i.rarity, 'color', i.color, 'vis', public.item_vis(i.id),
        'price', public.item_price(i.id),
        'ts', i.updated_at) as j
     from public.items i join public.profiles p on p.user_id = i.user_id
     where not i.deleted and i.visibility = 'public'
       and (p_user is null or (i.user_id <> p_user and not exists (select 1 from public.blocks b
             where (b.blocker = p_user and b.blocked = i.user_id) or (b.blocker = i.user_id and b.blocked = p_user))))
     order by i.updated_at desc limit 300)
    union all
    (select 'o', o.user_id, o.id, o.updated_at, jsonb_build_object(
        'username', p.username, 'id', o.id, 'path', o.user_id::text || '/outfits-' || o.id,
        'name', o.name, 'vis', o.vis, 'ts', o.updated_at, 'outfit', true)
     from public.outfits o join public.profiles p on p.user_id = o.user_id
     where not o.deleted and o.vis = 'public'
       and (p_user is null or (o.user_id <> p_user and not exists (select 1 from public.blocks b
             where (b.blocker = p_user and b.blocked = o.user_id) or (b.blocker = o.user_id and b.blocked = p_user))))
     order by o.updated_at desc limit 300)
  ),
  scored as (
    select c.owner, c.id, c.ts, c.j,
           v_rec * power(0.5::float8, least(extract(epoch from now() - c.ts)::float8 / 3600 / v_half, 40))
           + case when p_stage >= 1 then v_pop * ln(1 + greatest(coalesce(ev.pts, 0), 0)) else 0 end
           + case when p_stage >= 1 and f.follower is not null then v_fol else 0 end
           + case when p_stage >= 2 then v_tas * coalesce(it.t, ot.t, 0) else 0 end as score
    from cand c
    left join ev on ev.owner_id = c.owner and ev.target_id = c.id and ev.cls = c.cls
    left join public.follows f on f.follower = p_user and f.followee = c.owner
    left join item_taste it on c.cls = 'i' and it.user_id = c.owner and it.id = c.id
    left join lateral (
      select avg(t2.t) as t from public.outfit_items oi
      join item_taste t2 on t2.user_id = oi.user_id and t2.id = oi.item_id
      where c.cls = 'o' and oi.user_id = c.owner and oi.outfit_id = c.id
    ) ot on true
  )
  select array_agg(s.j order by s.score desc, s.ts desc, s.id),
         array_agg(s.owner order by s.score desc, s.ts desc, s.id)
  into v_recs, v_owners from scored s;

  v_n := coalesce(array_length(v_recs, 1), 0);
  if v_n = 0 then return v_res; end if;
  v_used := array_fill(false, array[v_n]);

  -- Vielfalt: nicht zu viele Einträge eines Kontos hintereinander; gibt es nichts anderes mehr, geht es trotzdem weiter
  while v_placed < v_want and v_placed < v_n loop
    v_pick := null; v_first := null;
    for v_i in 1..v_n loop
      continue when v_used[v_i];
      if v_first is null then v_first := v_i; end if;
      if not (v_owners[v_i] = v_last and v_run >= v_max) then v_pick := v_i; exit; end if;
    end loop;
    v_pick := coalesce(v_pick, v_first);
    v_used[v_pick] := true;
    if v_owners[v_pick] = v_last then v_run := v_run + 1; else v_last := v_owners[v_pick]; v_run := 1; end if;
    v_placed := v_placed + 1;
    if v_placed > v_offset then v_res := v_res || v_recs[v_pick]; end if;
  end loop;
  return v_res;
end $$;

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
      'username', p.username, 'id', i.id, 'path', i.user_id::text || '/items-' || i.id,
      'name', i.name, 'brand', i.brand, 'size', i.size, 'vis', public.item_vis(i.id),
      'price', public.item_price(i.id)
    ) as j
    from public.items i
    join public.profiles p on p.user_id = i.user_id
    where not i.deleted and i.visibility = 'public'
      and i.user_id <> auth.uid()
      and not exists (select 1 from public.blocks b
                      where (b.blocker = auth.uid() and b.blocked = i.user_id) or (b.blocker = i.user_id and b.blocked = auth.uid()))
      and nullif(trim(coalesce(p_brand, '')), '') is not null
      and lower(i.brand) = lower(trim(p_brand))
      and (nullif(trim(coalesce(p_size, '')), '') is null or i.size is null or lower(i.size) = lower(trim(p_size)))
      and (cardinality(tokens) = 0 or exists (
            select 1 from unnest(tokens) t where strpos(lower(coalesce(i.name, '')), t) > 0))
    order by i.updated_at desc
    limit 30
  ) x;

  return res;
end $$;

create or replace function public.search_public_items(p_query text, p_color text default null, p_size text default null, p_brand text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  res jsonb;
  tokens text[] := array(
    select t from unnest(string_to_array(regexp_replace(lower(coalesce(p_query, '')), '[^a-z0-9äöüß]+', ' ', 'g'), ' ')) t
    where length(t) >= 2 limit 5);
begin
  if cardinality(tokens) = 0 and coalesce(p_color, '') = '' and coalesce(trim(p_size), '') = '' and coalesce(trim(p_brand), '') = '' then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(x.j), '[]'::jsonb) into res from (
    select jsonb_build_object(
      'username', p.username, 'id', i.id, 'path', i.user_id::text || '/items-' || i.id,
      'name', i.name, 'brand', i.brand, 'size', i.size, 'cond', i.cond, 'rarity', i.rarity, 'color', i.color, 'vis', public.item_vis(i.id),
      'price', public.item_price(i.id)) as j
    from public.items i join public.profiles p on p.user_id = i.user_id
    where not i.deleted and i.visibility = 'public'
      and (auth.uid() is null or (i.user_id <> auth.uid() and not exists (select 1 from public.blocks b
            where (b.blocker = auth.uid() and b.blocked = i.user_id) or (b.blocker = i.user_id and b.blocked = auth.uid()))))
      and not exists (select 1 from unnest(tokens) t where i.search_text not like '%' || t || '%')
      and (coalesce(p_color, '') = '' or i.color = p_color)
      and (coalesce(trim(p_size), '') = '' or lower(i.size) = lower(trim(p_size)))
      and (coalesce(trim(p_brand), '') = '' or lower(coalesce(i.brand, '')) like '%' || lower(trim(p_brand)) || '%')
    order by i.updated_at desc limit 60) x;
  return res;
end $$;

create or replace function public.similar_public_items(p_emb text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  q extensions.vector(512);
  res jsonb;
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  begin
    q := p_emb::extensions.vector(512);
  exception when others then
    return '[]'::jsonb;
  end;

  select coalesce(jsonb_agg(x.j order by x.dist), '[]'::jsonb) into res from (
    select i.embedding <=> q as dist, jsonb_build_object(
      'username', p.username, 'id', i.id, 'path', i.user_id::text || '/items-' || i.id,
      'name', i.name, 'brand', i.brand, 'size', i.size, 'cond', i.cond, 'color', i.color, 'vis', public.item_vis(i.id),
      'price', public.item_price(i.id)) as j
    from public.items i join public.profiles p on p.user_id = i.user_id
    where i.embedding is not null and not i.deleted and i.visibility = 'public'
      and i.user_id <> auth.uid()
      and not exists (select 1 from public.blocks b
            where (b.blocker = auth.uid() and b.blocked = i.user_id) or (b.blocker = i.user_id and b.blocked = auth.uid()))
    order by i.embedding <=> q
    limit 12) x;
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
        'cond', i.cond, 'rarity', i.rarity, 'color', i.color, 'vis', public.item_vis(i.id),
        'price', public.item_price(i.id)
      ) order by i.updated_at desc)
      from (select * from public.items x
            where x.user_id = p.user_id and not x.deleted and x.visibility = 'public'
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

create or replace function public.is_public_object(obj_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.items i
                 where i.user_id::text = (storage.foldername(obj_name))[1] and 'items-' || i.id = storage.filename(obj_name)
                   and not i.deleted and i.visibility = 'public')
      or exists (select 1 from public.outfits o
                 where o.user_id::text = (storage.foldername(obj_name))[1] and 'outfits-' || o.id = storage.filename(obj_name)
                   and not o.deleted and o.vis = 'public')
      or exists (select 1 from public.wishlist w
                 where w.user_id::text = (storage.foldername(obj_name))[1] and 'wishlist-' || w.id = storage.filename(obj_name)
                   and not w.deleted and w.vis = 'public')
$$;

create or replace function public.my_saves() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.j order by x.at desc), '[]'::jsonb) from (
    select s.created_at as at, jsonb_build_object(
      'username', p.username, 'id', i.id, 'path', i.user_id::text || '/items-' || i.id,
      'name', i.name, 'brand', i.brand, 'size', i.size, 'cond', i.cond, 'color', i.color, 'vis', public.item_vis(i.id),
      'price', public.item_price(i.id), 'ts', s.created_at) as j
    from public.saves s
    join public.items i on i.user_id = s.owner_id and i.id = s.item_id and not i.deleted and i.visibility = 'public'
    join public.profiles p on p.user_id = s.owner_id
    where s.user_id = auth.uid()
      and not exists (select 1 from public.blocks b where (b.blocker = auth.uid() and b.blocked = s.owner_id) or (b.blocker = s.owner_id and b.blocked = auth.uid()))
    order by s.created_at desc limit 200
  ) x
$$;

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
  if not exists (select 1 from public.items i where i.user_id = target and i.id = p_item and not i.deleted and i.visibility = 'public') then
    raise exception 'Dieses Teil ist nicht mehr verfügbar.';
  end if;
  if (select count(*) from public.saves where user_id = me) >= 500 then raise exception 'Du hast schon 500 Teile gemerkt.'; end if;
  insert into public.saves (user_id, owner_id, item_id) values (me, target, p_item);
  return true;
end $$;

create or replace function public.send_interest(p_to text, p_kind text, p_record_id text, p_message text default null, p_ref_item text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); target public.profiles; ref_ok text; tid uuid; oid uuid; lst public.listing;
  msg text := nullif(left(trim(coalesce(p_message, '')), 200), '');
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  if p_kind not in ('interest', 'have') then raise exception 'Ungültige Anfrage.'; end if;
  select * into target from public.profiles where username = lower(p_to);
  if not found then raise exception 'Profil nicht gefunden.'; end if;
  if target.user_id = me then raise exception 'Das bist du selbst.'; end if;
  if exists (select 1 from public.blocks where blocker = me and blocked = target.user_id) then raise exception 'Du hast diese Person gesperrt.'; end if;
  if exists (select 1 from public.blocks where blocker = target.user_id and blocked = me) then raise exception 'Das ist gerade nicht möglich.'; end if;
  if p_kind = 'interest' then
    perform 1 from public.items where user_id = target.user_id and id = p_record_id and not deleted and visibility = 'public';
  else
    perform 1 from public.wishlist where user_id = target.user_id and id = p_record_id and not deleted and vis = 'public';
  end if;
  if not found then raise exception 'Dieser Eintrag ist nicht mehr verfügbar.'; end if;
  if (select count(*) from public.message m join public.thread t on t.id = m.thread_id
      where t.from_user = me and m.kind = 'request' and m.created_at > now() - interval '1 day') >= 30 then
    raise exception 'Für heute ist das Limit erreicht.';
  end if;
  -- ein angehängtes Teil muss dem Absender gehören und öffentlich sein, sonst wird es ignoriert
  if p_ref_item is not null then
    select id into ref_ok from public.items where user_id = me and id = p_ref_item and not deleted and visibility = 'public';
  end if;
  insert into public.thread (from_user, to_user, kind, item_id, ref_item) values (me, target.user_id, p_kind, p_record_id, ref_ok)
  on conflict (from_user, to_user, kind, item_id) do update set ref_item = excluded.ref_item, created_at = now()
  returning id into tid;
  update public.message set body = coalesce(msg, ''), created_at = now(), read_at = null where thread_id = tid and kind = 'request';
  if not found then insert into public.message (thread_id, sender, kind, body) values (tid, me, 'request', coalesce(msg, '')); end if;
  -- Kaufanfrage zu einem Teil mit aktivem Angebot: ein offenes offer zum Angebotspreis
  if p_kind = 'interest' then
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
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.log_view(p_username text, p_kind text, p_id text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); target uuid;
begin
  if me is null or p_kind not in ('item', 'outfit') then return; end if;
  select user_id into target from public.profiles where username = lower(p_username);
  if target is null or target = me then return; end if;
  if p_kind = 'item' and not exists (select 1 from public.items i where i.user_id = target and i.id = p_id and not i.deleted and i.visibility = 'public') then return; end if;
  if p_kind = 'outfit' and not exists (select 1 from public.outfits o where o.user_id = target and o.id = p_id and not o.deleted and o.vis = 'public') then return; end if;
  insert into public.events (user_id, kind, owner_id, target_id) values (me, 'view_' || p_kind, target, p_id) on conflict do nothing;
  if random() < 0.01 then delete from public.events where created_at < now() - interval '12 months'; end if;
end $$;

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
      'name', i.name, 'brand', i.brand, 'size', i.size, 'cond', i.cond, 'rarity', i.rarity, 'color', i.color, 'vis', public.item_vis(i.id),
      'price', public.item_price(i.id), 'ts', i.updated_at) as j
    from w join public.flex_entry e on e.flex_id = w.id and e.kind = 'item'
    join public.items i on i.user_id = e.owner_id and i.id = e.target_id
    join public.profiles p on p.user_id = i.user_id
    where not i.deleted and i.visibility = 'public'
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
  if p_kind = 'item' and not exists (select 1 from public.items where user_id = target and id = p_id and not deleted and visibility = 'public') then
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
-- Outfit-Seite: öffentliche Teile eines öffentlichen Outfits
create or replace function public.public_outfit(p_username text, p_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
  o public.outfits;
begin
  select * into p from public.profiles where username = lower(p_username);
  if not found then return null; end if;
  select * into o from public.outfits where user_id = p.user_id and id = p_id and not deleted and vis = 'public';
  if not found then return null; end if;

  return jsonb_build_object(
    'username', p.username,
    'id', o.id,
    'name', o.name,
    'path', o.user_id::text || '/outfits-' || o.id,
    'total', (select count(distinct oi.item_id) from public.outfit_items oi where oi.user_id = o.user_id and oi.outfit_id = o.id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'path', t.user_id::text || '/items-' || t.id,
        'name', t.name, 'category', t.category, 'brand', t.brand, 'size', t.size,
        'cond', t.cond, 'color', t.color, 'vis', public.item_vis(t.id),
        'price', public.item_price(t.id)
      ) order by t.pos)
      from (
        select i.user_id, i.id, i.name, i.category, i.brand, i.size, i.cond, i.color, min(oi.position) as pos
        from public.outfit_items oi
        join public.items i on i.user_id = oi.user_id and i.id = oi.item_id
        where oi.user_id = o.user_id and oi.outfit_id = o.id and not i.deleted and i.visibility = 'public'
        group by i.user_id, i.id, i.name, i.category, i.brand, i.size, i.cond, i.color
      ) t
    ), '[]'::jsonb)
  );
end $$;

update public.schema_info set version = 30, note = 'Funktionen lesen visibility und listing', updated_at = now();
notify pgrst, 'reload schema';
