-- Drobe Migration 0003: Ähnliche Teile über Bild-Vektoren (Embeddings).
-- Im Supabase-Dashboard unter "SQL Editor" ausführen (nach 0002).
--
-- Die App berechnet für öffentliche Teile im Browser einen 512-dimensionalen Vektor (CLIP) und legt ihn im Eintrag ab (emb).
-- Der Trigger übernimmt ihn in items.embedding. similar_public_items findet die ähnlichsten öffentlichen Teile anderer.
-- Vektoren selbst werden nie ausgegeben, nur die freigegebenen Felder der Treffer.

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
    insert into public.items (user_id, id, name, category, brand, brand_id, size, sku, cond, rarity, color, hex, vis, price, swap, deleted, updated_at, embedding)
    values (r.user_id, r.id, d->>'name', d->>'category', b, bid, nullif(d->>'size', ''), nullif(d->>'sku', ''), nullif(d->>'cond', ''),
            nullif(d->>'rarity', ''), nullif(d->>'color', ''), nullif(d->>'hex', ''), v,
            case when jsonb_typeof(d->'price') = 'number' then (d->>'price')::numeric end,
            nullif(d->>'swap', ''), del, r.updated_at,
            case when jsonb_typeof(d->'emb') = 'array' and jsonb_array_length(d->'emb') = 512 then (d->'emb')::text::extensions.vector end)
    on conflict (user_id, id) do update set
      name = excluded.name, category = excluded.category, brand = excluded.brand, brand_id = excluded.brand_id, size = excluded.size,
      sku = excluded.sku, cond = excluded.cond, rarity = excluded.rarity, color = excluded.color, hex = excluded.hex, vis = excluded.vis,
      price = excluded.price, swap = excluded.swap, deleted = excluded.deleted, updated_at = excluded.updated_at, embedding = excluded.embedding;
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


-- Bereits vorhandene Einträge mit Vektor nachziehen
do $$
declare r public.records;
begin
  for r in select * from public.records where kind = 'items' and jsonb_typeof(data->'emb') = 'array' loop
    perform public.sync_typed(r);
  end loop;
end $$;

create index if not exists items_embedding_idx on public.items using hnsw (embedding extensions.vector_cosine_ops) where embedding is not null;

-- Die ähnlichsten öffentlichen Teile anderer zu einem Vektor (als Text wie [0.1,0.2,…])
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
      'name', i.name, 'brand', i.brand, 'size', i.size, 'cond', i.cond, 'color', i.color, 'vis', i.vis,
      'price', case when i.vis = 'sale' then to_jsonb(i.price) end,
      'swap',  case when i.vis = 'trade' then i.swap end) as j
    from public.items i join public.profiles p on p.user_id = i.user_id
    where i.embedding is not null and not i.deleted and i.vis in ('public', 'trade', 'sale')
      and i.user_id <> auth.uid()
      and not exists (select 1 from public.blocks b
            where (b.blocker = auth.uid() and b.blocked = i.user_id) or (b.blocker = i.user_id and b.blocked = auth.uid()))
    order by i.embedding <=> q
    limit 12) x;
  return res;
end $$;

revoke all on function public.similar_public_items(text) from public, anon;
grant execute on function public.similar_public_items(text) to authenticated;

notify pgrst, 'reload schema';
