-- Drobe: Artikelsuche über öffentliche Teile anderer (nach Marke, Name oder Kategorie).
-- Einmalig im Supabase-Dashboard unter "SQL Editor" ausführen (nach supabase-phase5.sql).
-- Es werden nur Felder öffentlicher Teile zurückgegeben, eigene und gesperrte Konten (in beide Richtungen) bleiben draußen.

create or replace function public.search_public_items(p_query text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  res jsonb;
  tokens text[] := array(
    select t from unnest(string_to_array(regexp_replace(lower(coalesce(p_query, '')), '[^a-z0-9äöüß]+', ' ', 'g'), ' ')) t
    where length(t) >= 2
    limit 5
  );
begin
  if cardinality(tokens) = 0 then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(x.j), '[]'::jsonb) into res from (
    select jsonb_build_object(
      'username', p.username,
      'id', r.id,
      'path', r.user_id::text || '/items-' || r.id,
      'name', r.data->>'name', 'brand', r.data->>'brand', 'size', r.data->>'size',
      'cond', r.data->>'cond', 'rarity', r.data->>'rarity', 'vis', r.data->>'vis',
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
            where strpos(lower(coalesce(r.data->>'brand', '') || ' ' || coalesce(r.data->>'name', '') || ' ' || coalesce(r.data->>'category', '')), t) = 0)
    order by r.updated_at desc
    limit 60
  ) x;

  return res;
end $$;

revoke all on function public.search_public_items(text) from public;
grant execute on function public.search_public_items(text) to anon, authenticated;
