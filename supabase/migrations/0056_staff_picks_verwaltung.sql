-- 0056: Staff Picks in der Verwaltung. Helfer (Rolle moderator) und Admins sehen dort die aktuellen Picks und suchen öffentliche Teile zum Auswählen.
-- Setzt 0055 voraus. Im Supabase-Dashboard unter "SQL Editor" ausführen.

-- Alle aktuellen Picks mit Hinweis, ob sie gerade im Feed zu sehen sind
create or replace function public.staff_pick_admin_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.staff_can() then raise exception 'Kein Zugriff.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'username', p.username, 'id', i.id, 'path', i.user_id::text || '/items-' || i.id,
      'name', i.name, 'brand', i.brand, 'size', i.size,
      'added_by', (select a.username from public.profiles a where a.user_id = s.added_by),
      'created_at', s.created_at,
      'live', (not i.deleted and i.visibility = 'public' and not i.mod_hidden and i.legit_status is distinct from 'frozen' and p.banned_at is null)
    ) order by s.created_at desc)
    from public.staff_pick s
    join public.items i on i.user_id = s.owner and i.id = s.item_id
    join public.profiles p on p.user_id = i.user_id
    where not i.deleted
  ), '[]'::jsonb);
end $$;

-- Öffentliche Teile anderer suchen (Name, Marke oder Benutzername); ohne Suchwort die neuesten
create or replace function public.staff_item_search(p_query text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q text := lower(trim(coalesce(p_query, '')));
begin
  if not public.staff_can() then raise exception 'Kein Zugriff.'; end if;
  q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  return coalesce((
    select jsonb_agg(x.j order by x.ts desc) from (
      select i.updated_at as ts, jsonb_build_object(
        'username', p.username, 'id', i.id, 'path', i.user_id::text || '/items-' || i.id,
        'name', i.name, 'brand', i.brand, 'size', i.size, 'category', i.category,
        'picked', exists (select 1 from public.staff_pick s where s.owner = i.user_id and s.item_id = i.id)) as j
      from public.items i join public.profiles p on p.user_id = i.user_id
      where not i.deleted and i.visibility = 'public' and not i.mod_hidden and i.user_id <> auth.uid() and p.banned_at is null
        and (q = '' or lower(coalesce(i.name, '')) like '%' || q || '%' or lower(coalesce(i.brand, '')) like '%' || q || '%' or p.username like '%' || q || '%')
      order by i.updated_at desc limit 40) x
  ), '[]'::jsonb);
end $$;

revoke all on function public.staff_pick_admin_list(), public.staff_item_search(text) from public, anon;
grant execute on function public.staff_pick_admin_list(), public.staff_item_search(text) to authenticated;
notify pgrst, 'reload schema';
