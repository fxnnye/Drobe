-- 0014: Ein öffentliches Outfit mit seinen öffentlichen Teilen (für die Outfit-Seite).
-- Teile, die privat sind, werden nicht ausgeliefert, nur gezählt (total).
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
        'cond', t.cond, 'color', t.color, 'vis', t.vis,
        'price', case when t.vis = 'sale' then to_jsonb(t.price) end,
        'swap',  case when t.vis = 'trade' then t.swap end
      ) order by t.pos)
      from (
        select i.user_id, i.id, i.name, i.category, i.brand, i.size, i.cond, i.color, i.vis, i.price, i.swap, min(oi.position) as pos
        from public.outfit_items oi
        join public.items i on i.user_id = oi.user_id and i.id = oi.item_id
        where oi.user_id = o.user_id and oi.outfit_id = o.id and not i.deleted and i.vis in ('public', 'trade', 'sale')
        group by i.user_id, i.id, i.name, i.category, i.brand, i.size, i.cond, i.color, i.vis, i.price, i.swap
      ) t
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.public_outfit(text, text) from public;
grant execute on function public.public_outfit(text, text) to anon, authenticated;
notify pgrst, 'reload schema';
