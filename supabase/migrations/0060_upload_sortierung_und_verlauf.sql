-- 0060: Sortierung strikt nach Upload-Zeit und öffentlicher Besitzerverlauf.
-- Im Supabase-Dashboard unter "SQL Editor" ausführen.
--
--   items.created_at       : wann ein Teil zum ersten Mal gespeichert wurde (bisherige Teile bekommen ihre letzte Änderung als Zeitpunkt)
--   feed_public / search_public_items : sortieren nach created_at statt nach der letzten Änderung. Ein Preis oder Foto ändern schiebt ein Teil nicht mehr nach oben.
--   item_history(username, id) : Verlauf der bisherigen Besitzer eines öffentlichen Teils (Name und Datum), für alle sichtbar

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'items' and column_name = 'created_at') then
    alter table public.items add column created_at timestamptz not null default now();
    update public.items set created_at = updated_at;
  end if;
end $$;
create index if not exists items_created_idx on public.items (created_at desc) where visibility = 'public' and not deleted;

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
      select i.created_at as ts, jsonb_build_object(
        'username', p.username, 'id', i.id, 'path', i.user_id::text || '/items-' || i.id,
        'name', i.name, 'brand', i.brand, 'size', i.size, 'cond', i.cond, 'rarity', i.rarity, 'color', i.color, 'vis', public.item_vis(i.id),
        'price', public.item_price(i.id),
        'ts', i.created_at) as j
      from public.items i join public.profiles p on p.user_id = i.user_id
      where not i.deleted and i.visibility = 'public'
        and (p_before is null or i.created_at < p_before)
        and (coalesce(p_color, '') = '' or i.color = p_color)
        and (coalesce(p_mode, '') <> 'following' or i.user_id in (select followee from public.follows where follower = auth.uid()))
        and (auth.uid() is null or (i.user_id <> auth.uid() and not exists (select 1 from public.blocks b
              where (b.blocker = auth.uid() and b.blocked = i.user_id) or (b.blocker = i.user_id and b.blocked = auth.uid()))))
      order by i.created_at desc limit 30) x;
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
    order by i.created_at desc limit 60) x;
  return res;
end $$;


create or replace function public.item_history(p_username text, p_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o uuid; h jsonb;
begin
  select user_id into o from public.profiles where username = lower(p_username) and banned_at is null;
  if o is null then return '[]'::jsonb; end if;
  select data -> 'history' into h from public.items
   where user_id = o and id = p_id and not deleted and visibility = 'public' and not mod_hidden
     and (auth.uid() is null or not exists (select 1 from public.blocks b
          where (b.blocker = auth.uid() and b.blocked = o) or (b.blocker = o and b.blocked = auth.uid())));
  if h is null or jsonb_typeof(h) <> 'array' then return '[]'::jsonb; end if;
  -- nur Name und Datum, sonst nichts aus dem Datensatz
  return coalesce((select jsonb_agg(jsonb_build_object('user', e ->> 'user', 'at', e -> 'at')) from jsonb_array_elements(h) e), '[]'::jsonb);
end $$;
revoke all on function public.item_history(text, text) from public;
grant execute on function public.item_history(text, text) to anon, authenticated;
notify pgrst, 'reload schema';
