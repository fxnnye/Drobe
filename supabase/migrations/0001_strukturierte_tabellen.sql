-- Drobe Migration 0001: strukturierte Tabellen, Indizes und Vorbereitung für Empfehlungen (pgvector).
-- Im Supabase-Dashboard unter "SQL Editor" ausführen (nach supabase-farbe.sql).
--
-- Die App schreibt weiter in records (lokal zuerst, Abgleich im Hintergrund). Aus jedem Eintrag pflegt ein Trigger
-- automatisch eine Zeile in einer Tabelle mit festen Spalten (items, outfits, outfit_items, wishlist, brands).
-- Dadurch bleibt die App unverändert, Feed und Suche lesen aber aus den strukturierten Tabellen mit Indizes.
-- Alles ist rein zusätzlich: records bleibt die Quelle der Wahrheit, die neuen Tabellen lassen sich jederzeit neu aufbauen.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists vector with schema extensions;

-- Marken (vereinheitlicht über den Kleinbuchstaben-Namen)
create table if not exists public.brands (
  id   bigint generated always as identity primary key,
  slug text not null unique,
  name text not null
);

create table if not exists public.items (
  user_id    uuid   not null references auth.users(id) on delete cascade,
  id         text   not null,
  name       text,
  category   text,
  brand      text,
  brand_id   bigint references public.brands(id),
  size       text,
  sku        text,
  cond       text,
  rarity     text,
  color      text,                         -- automatisch aus dem freigestellten Bild oder von Hand
  hex        text,
  vis        text   not null default 'private',
  price      numeric,
  swap       text,
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  search_text text generated always as (
    lower(coalesce(brand, '') || ' ' || coalesce(name, '') || ' ' || coalesce(category, '') || ' ' || coalesce(color, ''))
  ) stored,
  embedding  extensions.vector(512),       -- später: Bild- oder Textvektor für ähnliche Teile
  primary key (user_id, id)
);

create table if not exists public.outfits (
  user_id    uuid   not null references auth.users(id) on delete cascade,
  id         text   not null,
  name       text,
  vis        text   not null default 'private',
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.outfit_items (
  user_id   uuid   not null,
  outfit_id text   not null,
  item_id   text   not null,
  position  int    not null,
  primary key (user_id, outfit_id, position),
  foreign key (user_id, outfit_id) references public.outfits(user_id, id) on delete cascade
);

create table if not exists public.wishlist (
  user_id    uuid   not null references auth.users(id) on delete cascade,
  id         text   not null,
  name       text,
  category   text,
  brand      text,
  size       text,
  sku        text,
  vis        text   not null default 'private',
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Zugriff nur über die Funktionen der App, nicht direkt
alter table public.brands       enable row level security;
alter table public.items        enable row level security;
alter table public.outfits      enable row level security;
alter table public.outfit_items enable row level security;
alter table public.wishlist     enable row level security;
revoke all on public.brands, public.items, public.outfits, public.outfit_items, public.wishlist from anon, authenticated;

-- Indizes für Feed, Suche und Filter
create index if not exists items_feed_idx    on public.items (updated_at desc) where not deleted and vis <> 'private';
create index if not exists items_color_idx   on public.items (color) where not deleted and vis <> 'private';
create index if not exists items_size_idx    on public.items (lower(size)) where not deleted and vis <> 'private';
create index if not exists items_brand_idx   on public.items (lower(brand)) where not deleted and vis <> 'private';
create index if not exists items_user_idx    on public.items (user_id);
create index if not exists items_search_idx  on public.items using gin (search_text extensions.gin_trgm_ops);
create index if not exists outfits_feed_idx  on public.outfits (updated_at desc) where not deleted and vis = 'public';
create index if not exists outfit_items_idx  on public.outfit_items (user_id, item_id);
create index if not exists wishlist_user_idx on public.wishlist (user_id);

-- Einen Eintrag aus records in die passende strukturierte Tabelle übernehmen
create or replace function public.sync_typed(r public.records) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  d jsonb := r.data;
  del boolean := coalesce(d->>'deleted', 'false') = 'true';
  v text := coalesce(nullif(d->>'vis', ''), 'private');
  b text := nullif(trim(coalesce(d->>'brand', '')), '');
  bid bigint;
  l jsonb;
  n int := 0;
begin
  if r.kind = 'items' then
    if b is not null then
      insert into public.brands (slug, name) values (lower(b), b) on conflict (slug) do nothing;
      select id into bid from public.brands where slug = lower(b);
    end if;
    insert into public.items (user_id, id, name, category, brand, brand_id, size, sku, cond, rarity, color, hex, vis, price, swap, deleted, updated_at)
    values (r.user_id, r.id, d->>'name', d->>'category', b, bid, nullif(d->>'size', ''), nullif(d->>'sku', ''), nullif(d->>'cond', ''),
            nullif(d->>'rarity', ''), nullif(d->>'color', ''), nullif(d->>'hex', ''), v,
            case when jsonb_typeof(d->'price') = 'number' then (d->>'price')::numeric end,
            nullif(d->>'swap', ''), del, r.updated_at)
    on conflict (user_id, id) do update set
      name = excluded.name, category = excluded.category, brand = excluded.brand, brand_id = excluded.brand_id, size = excluded.size,
      sku = excluded.sku, cond = excluded.cond, rarity = excluded.rarity, color = excluded.color, hex = excluded.hex, vis = excluded.vis,
      price = excluded.price, swap = excluded.swap, deleted = excluded.deleted, updated_at = excluded.updated_at;
  elsif r.kind = 'outfits' then
    insert into public.outfits (user_id, id, name, vis, deleted, updated_at)
    values (r.user_id, r.id, d->>'name', v, del, r.updated_at)
    on conflict (user_id, id) do update set name = excluded.name, vis = excluded.vis, deleted = excluded.deleted, updated_at = excluded.updated_at;
    delete from public.outfit_items where user_id = r.user_id and outfit_id = r.id;
    if jsonb_typeof(d->'layers') = 'array' then
      for l in select * from jsonb_array_elements(d->'layers') loop
        if nullif(l->>'itemId', '') is not null then
          n := n + 1;
          insert into public.outfit_items (user_id, outfit_id, item_id, position) values (r.user_id, r.id, l->>'itemId', n);
        end if;
      end loop;
    end if;
  elsif r.kind = 'wishlist' then
    insert into public.wishlist (user_id, id, name, category, brand, size, sku, vis, deleted, updated_at)
    values (r.user_id, r.id, d->>'name', d->>'category', b, nullif(d->>'size', ''), nullif(d->>'sku', ''), v, del, r.updated_at)
    on conflict (user_id, id) do update set name = excluded.name, category = excluded.category, brand = excluded.brand, size = excluded.size,
      sku = excluded.sku, vis = excluded.vis, deleted = excluded.deleted, updated_at = excluded.updated_at;
  end if;
end $$;

create or replace function public.records_to_typed() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
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

drop trigger if exists records_typed_sync on public.records;
create trigger records_typed_sync after insert or update or delete on public.records
  for each row execute function public.records_to_typed();

revoke all on function public.sync_typed(public.records) from public, anon, authenticated;
revoke all on function public.records_to_typed() from public, anon, authenticated;

-- Bestehende Einträge einmalig übernehmen
do $$
declare r public.records;
begin
  for r in select * from public.records where kind in ('items', 'outfits', 'wishlist') loop
    perform public.sync_typed(r);
  end loop;
end $$;

-- Feed und Artikelsuche lesen jetzt aus den strukturierten Tabellen (gleiche Antwort wie vorher)
create or replace function public.feed_public(p_kind text, p_before timestamptz default null, p_color text default null) returns jsonb
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
        and (auth.uid() is null or (i.user_id <> auth.uid() and not exists (select 1 from public.blocks b
              where (b.blocker = auth.uid() and b.blocked = i.user_id) or (b.blocker = i.user_id and b.blocked = auth.uid()))))
      order by i.updated_at desc limit 30) x;
  end if;
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
      'name', i.name, 'brand', i.brand, 'size', i.size, 'cond', i.cond, 'rarity', i.rarity, 'color', i.color, 'vis', i.vis,
      'price', case when i.vis = 'sale' then to_jsonb(i.price) end,
      'swap',  case when i.vis = 'trade' then i.swap end) as j
    from public.items i join public.profiles p on p.user_id = i.user_id
    where not i.deleted and i.vis in ('public', 'trade', 'sale')
      and (auth.uid() is null or (i.user_id <> auth.uid() and not exists (select 1 from public.blocks b
            where (b.blocker = auth.uid() and b.blocked = i.user_id) or (b.blocker = i.user_id and b.blocked = auth.uid()))))
      and not exists (select 1 from unnest(tokens) t where i.search_text not like '%' || t || '%')
      and (coalesce(p_color, '') = '' or i.color = p_color)
      and (coalesce(trim(p_size), '') = '' or lower(i.size) = lower(trim(p_size)))
      and (coalesce(trim(p_brand), '') = '' or lower(coalesce(i.brand, '')) like '%' || lower(trim(p_brand)) || '%')
    order by i.updated_at desc limit 60) x;
  return res;
end $$;

notify pgrst, 'reload schema';
