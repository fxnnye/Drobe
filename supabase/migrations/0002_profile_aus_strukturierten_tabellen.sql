-- Drobe Migration 0002: Profil-Abfrage, Mitgliedersuche und Wunsch-Treffer lesen aus den strukturierten Tabellen.
-- Im Supabase-Dashboard unter "SQL Editor" ausführen (nach 0001). Die Antworten bleiben gleich, nur die Quelle ändert sich.

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

-- Mitglieder mit mindestens einem öffentlichen Eintrag
create or replace function public.search_profiles(p_query text) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(username order by username), '{}') from (
    select p.username from public.profiles p
    where length(trim(p_query)) >= 2
      and strpos(p.username, lower(trim(p_query))) > 0
      and (exists (select 1 from public.items i where i.user_id = p.user_id and not i.deleted and i.vis in ('public', 'trade', 'sale'))
        or exists (select 1 from public.outfits o where o.user_id = p.user_id and not o.deleted and o.vis = 'public')
        or exists (select 1 from public.wishlist w where w.user_id = p.user_id and not w.deleted and w.vis = 'public'))
    order by p.username
    limit 20
  ) s
$$;

-- Treffer für einen Wunsch: öffentliche Teile anderer mit gleicher Marke, passendem Namen und passender Größe
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
      'name', i.name, 'brand', i.brand, 'size', i.size, 'vis', i.vis,
      'price', case when i.vis = 'sale' then to_jsonb(i.price) end
    ) as j
    from public.items i
    join public.profiles p on p.user_id = i.user_id
    where not i.deleted and i.vis in ('public', 'trade', 'sale')
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

notify pgrst, 'reload schema';
