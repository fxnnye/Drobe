-- 0015: Nachrichtenliste mit Teilfoto und Marke (Kaufen/Verkaufen-Ansicht).
-- my_threads liefert zusätzlich record_id, record_brand und record_path (Speicherpfad des Fotos, das nur bei öffentlichen Teilen abrufbar ist).
create or replace function public.my_threads() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(t.j order by t.last_at desc), '[]'::jsonb) from (
    select
      greatest(i.created_at, coalesce(lr.created_at, i.created_at)) as last_at,
      jsonb_build_object(
        'id', i.id,
        'other', p.username,
        'mine', i.from_user = auth.uid(),
        'kind', i.kind,
        'record_name', case i.kind
          when 'interest' then (select it.name from public.items it where it.user_id = i.to_user and it.id = i.record_id)
          else (select w.name from public.wishlist w where w.user_id = i.to_user and w.id = i.record_id) end,
        'record_id', i.record_id,
        'record_brand', case i.kind
          when 'interest' then (select it.brand from public.items it where it.user_id = i.to_user and it.id = i.record_id)
          else (select w.brand from public.wishlist w where w.user_id = i.to_user and w.id = i.record_id) end,
        'record_path', i.to_user::text || (case i.kind when 'interest' then '/items-' else '/wishlist-' end) || i.record_id,
        'ref_name', (select it.name from public.items it where it.user_id = i.from_user and it.id = i.ref_item),
        'last_text', coalesce(nullif(lr.body, ''), case when lr.image_path is not null then 'Foto' end, i.message),
        'last_mine', case when lr.id is not null then lr.from_user = auth.uid() else i.from_user = auth.uid() end,
        'last_at', greatest(i.created_at, coalesce(lr.created_at, i.created_at)),
        'unread', (i.to_user = auth.uid() and i.read_at is null)
                  or exists (select 1 from public.replies x where x.interest_id = i.id and x.from_user <> auth.uid() and x.read_at is null)
      ) as j
    from public.interests i
    join public.profiles p on p.user_id = case when i.from_user = auth.uid() then i.to_user else i.from_user end
    left join lateral (
      select * from public.replies x where x.interest_id = i.id order by x.created_at desc limit 1
    ) lr on true
    where auth.uid() in (i.from_user, i.to_user)
    order by greatest(i.created_at, coalesce(lr.created_at, i.created_at)) desc
    limit 100
  ) t
$$;

notify pgrst, 'reload schema';
