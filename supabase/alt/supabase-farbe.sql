-- Drobe: Farbe bei Teilen (automatisch aus dem freigestellten Bild) für Feed-Filter, Suche und Profile.
-- Einmalig im Supabase-Dashboard unter "SQL Editor" ausführen (nach supabase-chat-bilder.sql).
-- Es kommt nur ein weiteres freigegebenes Feld („color“) zu öffentlichen Teilen dazu.

drop function if exists public.feed_public(text, timestamptz);
drop function if exists public.search_public_items(text);

create or replace function public.feed_public(p_kind text, p_before timestamptz default null, p_color text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  res jsonb;
  rk text := case p_kind when 'outfits' then 'outfits' else 'items' end;
begin
  select coalesce(jsonb_agg(x.j order by x.ts desc), '[]'::jsonb) into res from (
    select r.updated_at as ts, jsonb_build_object(
      'username', p.username,
      'id', r.id,
      'path', r.user_id::text || '/' || rk || '-' || r.id,
      'name', r.data->>'name', 'brand', r.data->>'brand', 'size', r.data->>'size',
      'cond', r.data->>'cond', 'rarity', r.data->>'rarity', 'color', r.data->>'color', 'vis', r.data->>'vis',
      'price', case when r.data->>'vis' = 'sale' then r.data->'price' end,
      'swap',  case when r.data->>'vis' = 'trade' then r.data->>'swap' end,
      'ts', r.updated_at
    ) as j
    from public.records r
    join public.profiles p on p.user_id = r.user_id
    where r.kind = rk
      and public.is_public_record(rk, r.data)
      and (p_before is null or r.updated_at < p_before)
      and (p_color is null or p_color = '' or r.data->>'color' = p_color)
      and (auth.uid() is null or (
            r.user_id <> auth.uid()
            and not exists (select 1 from public.blocks b
                            where (b.blocker = auth.uid() and b.blocked = r.user_id)
                               or (b.blocker = r.user_id and b.blocked = auth.uid()))))
    order by r.updated_at desc
    limit 30
  ) x;

  return res;
end $$;

revoke all on function public.feed_public(text, timestamptz, text) from public;
grant execute on function public.feed_public(text, timestamptz, text) to anon, authenticated;

create or replace function public.search_public_items(p_query text, p_color text default null, p_size text default null, p_brand text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  res jsonb;
  tokens text[] := array(
    select t from unnest(string_to_array(regexp_replace(lower(coalesce(p_query, '')), '[^a-z0-9äöüß]+', ' ', 'g'), ' ')) t
    where length(t) >= 2
    limit 5
  );
begin
  if cardinality(tokens) = 0 and coalesce(p_color, '') = '' and coalesce(p_size, '') = '' and coalesce(p_brand, '') = '' then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(x.j), '[]'::jsonb) into res from (
    select jsonb_build_object(
      'username', p.username,
      'id', r.id,
      'path', r.user_id::text || '/items-' || r.id,
      'name', r.data->>'name', 'brand', r.data->>'brand', 'size', r.data->>'size',
      'cond', r.data->>'cond', 'rarity', r.data->>'rarity', 'color', r.data->>'color', 'vis', r.data->>'vis',
      'price', case when r.data->>'vis' = 'sale' then r.data->'price' end,
      'swap',  case when r.data->>'vis' = 'trade' then r.data->>'swap' end
    ) as j
    from public.records r
    join public.profiles p on p.user_id = r.user_id
    where r.kind = 'items'
      and public.is_public_record('items', r.data)
      and (auth.uid() is null or (
            r.user_id <> auth.uid()
            and not exists (select 1 from public.blocks b
                            where (b.blocker = auth.uid() and b.blocked = r.user_id)
                               or (b.blocker = r.user_id and b.blocked = auth.uid()))))
      and not exists (
            select 1 from unnest(tokens) t
            where strpos(lower(coalesce(r.data->>'brand', '') || ' ' || coalesce(r.data->>'name', '') || ' ' || coalesce(r.data->>'category', '') || ' ' || coalesce(r.data->>'color', '')), t) = 0)
      and (coalesce(p_color, '') = '' or r.data->>'color' = p_color)
      and (coalesce(trim(p_size), '') = '' or lower(coalesce(r.data->>'size', '')) = lower(trim(p_size)))
      and (coalesce(trim(p_brand), '') = '' or strpos(lower(coalesce(r.data->>'brand', '')), lower(trim(p_brand))) > 0)
    order by r.updated_at desc
    limit 60
  ) x;

  return res;
end $$;

revoke all on function public.search_public_items(text, text, text, text) from public;
grant execute on function public.search_public_items(text, text, text, text) to anon, authenticated;

create or replace function public.public_profile(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where username = lower(p_username);
  if not found then return null; end if;

  return jsonb_build_object(
    'username', p.username,
    'showcase', to_jsonb(p.showcase),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'path', r.user_id::text || '/items-' || r.id,
        'name', r.data->>'name', 'category', r.data->>'category',
        'brand', r.data->>'brand', 'size', r.data->>'size', 'sku', r.data->>'sku',
        'cond', r.data->>'cond', 'rarity', r.data->>'rarity', 'color', r.data->>'color', 'vis', r.data->>'vis',
        'price', case when r.data->>'vis' = 'sale' then r.data->'price' end,
        'swap',  case when r.data->>'vis' = 'trade' then r.data->>'swap' end
      ) order by r.updated_at desc)
      from (select * from public.records x
            where x.user_id = p.user_id and x.kind = 'items' and public.is_public_record('items', x.data)
            limit 500) r
    ), '[]'::jsonb),
    'outfits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'path', r.user_id::text || '/outfits-' || r.id,
        'name', r.data->>'name'
      ) order by r.updated_at desc)
      from (select * from public.records x
            where x.user_id = p.user_id and x.kind = 'outfits' and public.is_public_record('outfits', x.data)
            limit 200) r
    ), '[]'::jsonb),
    'wishlist', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'path', r.user_id::text || '/wishlist-' || r.id,
        'name', r.data->>'name', 'category', r.data->>'category',
        'brand', r.data->>'brand', 'size', r.data->>'size', 'sku', r.data->>'sku'
      ) order by r.updated_at desc)
      from (select * from public.records x
            where x.user_id = p.user_id and x.kind = 'wishlist' and public.is_public_record('wishlist', x.data)
            limit 500) r
    ), '[]'::jsonb)
  );
end $$;


revoke all on function public.public_profile(text) from public;
grant execute on function public.public_profile(text) to anon, authenticated;

notify pgrst, 'reload schema';
