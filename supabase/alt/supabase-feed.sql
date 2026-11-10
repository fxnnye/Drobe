-- Drobe: Feed mit öffentlichen Teilen und Outfits anderer (neueste zuerst).
-- Einmalig im Supabase-Dashboard unter "SQL Editor" ausführen (nach supabase-search-artikel.sql).
-- Es werden nur freigegebene Felder öffentlicher Einträge zurückgegeben; eigene Einträge und gesperrte Konten (in beide Richtungen) bleiben draußen.

create or replace function public.feed_public(p_kind text, p_before timestamptz default null) returns jsonb
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
      'cond', r.data->>'cond', 'rarity', r.data->>'rarity', 'vis', r.data->>'vis',
      'price', case when r.data->>'vis' = 'sale' then r.data->'price' end,
      'swap',  case when r.data->>'vis' = 'trade' then r.data->>'swap' end,
      'ts', r.updated_at
    ) as j
    from public.records r
    join public.profiles p on p.user_id = r.user_id
    where r.kind = rk
      and public.is_public_record(rk, r.data)
      and (p_before is null or r.updated_at < p_before)
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

revoke all on function public.feed_public(text, timestamptz) from public;
grant execute on function public.feed_public(text, timestamptz) to anon, authenticated;
