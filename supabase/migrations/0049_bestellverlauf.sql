-- 0049: Bestellverlauf. Alle angenommenen Angebote, bei denen ich Käufer oder Verkäufer bin.
-- Im Supabase-Dashboard unter "SQL Editor" ausführen.

create or replace function public.my_orders() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.j order by x.at desc), '[]'::jsonb) from (
    select coalesce(o.confirmed_at, o.decided_at, o.created_at) as at, jsonb_build_object(
      'id', o.id, 'buyer', o.from_user = auth.uid(),
      'other', (select p.username from public.profiles p where p.user_id = case when o.from_user = auth.uid() then o.to_user else o.from_user end),
      'name', coalesce(nullif(it.data->>'name', ''), tr.data->>'name', 'Teil'),
      'brand', coalesce(nullif(it.data->>'brand', ''), tr.data->>'brand'),
      'amount', round(o.amount_cents / 100.0, 2),
      'state', case when o.confirmed_at is not null then 'done' when l.status = 'sold' then 'sold' else 'reserved' end,
      'at', coalesce(o.confirmed_at, o.decided_at, o.created_at)
    ) as j
    from public.offer o
    join public.listing l on l.id = o.listing_id
    left join public.items it on it.user_id = o.to_user and it.id = l.item_id and not it.deleted
    left join public.item_transfer tr on tr.offer_id = o.id
    where o.status = 'accepted' and auth.uid() in (o.from_user, o.to_user)
    order by 1 desc limit 200
  ) x
$$;
revoke all on function public.my_orders() from public, anon;
grant execute on function public.my_orders() to authenticated;
notify pgrst, 'reload schema';
