-- 0061: Staff Picks: Admins und Helfer dürfen auch ihre eigenen öffentlichen Teile auswählen.
-- Setzt 0055 und 0056 voraus. Im Supabase-Dashboard unter "SQL Editor" ausführen. Die Schemaversion bleibt unverändert.

-- Hinzufügen oder Entfernen (nur Admin oder Moderator, nur öffentliche Teile; auch eigene)
create or replace function public.staff_pick_set(p_username text, p_id text, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  if not public.staff_can() then raise exception 'Kein Zugriff.'; end if;
  select user_id into o from public.profiles where username = lower(p_username);
  if o is null then raise exception 'Profil nicht gefunden.'; end if;
  if p_on then
    if not exists (select 1 from public.items where user_id = o and id = p_id and not deleted and visibility = 'public' and not mod_hidden) then
      raise exception 'Dieses Teil ist nicht öffentlich.';
    end if;
    insert into public.staff_pick (owner, item_id, added_by) values (o, p_id, auth.uid()) on conflict do nothing;
  else
    delete from public.staff_pick where owner = o and item_id = p_id;
  end if;
  insert into public.admin_log (admin_id, action, target, detail)
  values (auth.uid(), case when p_on then 'staff pick gesetzt' else 'staff pick entfernt' end, lower(p_username), p_id);
  return jsonb_build_object('ok', true, 'picked', p_on);
end $$;

-- Öffentliche Teile suchen (Name, Marke oder Benutzername), eigene eingeschlossen; ohne Suchwort die neuesten
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
      where not i.deleted and i.visibility = 'public' and not i.mod_hidden and p.banned_at is null
        and (q = '' or lower(coalesce(i.name, '')) like '%' || q || '%' or lower(coalesce(i.brand, '')) like '%' || q || '%' or p.username like '%' || q || '%')
      order by i.updated_at desc limit 40) x
  ), '[]'::jsonb);
end $$;

revoke all on function public.staff_pick_set(text, text, boolean), public.staff_item_search(text) from public, anon;
grant execute on function public.staff_pick_set(text, text, boolean), public.staff_item_search(text) to authenticated;
notify pgrst, 'reload schema';
