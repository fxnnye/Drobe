-- 0051: Die Anzeige hinter einer Unterhaltung bleibt für beide Seiten sichtbar, auch nach Verkauf und Übergabe.
-- Im Supabase-Dashboard unter "SQL Editor" ausführen.
--
--   thread_item(thread) : Angaben des Teils (aus der Tabelle items, die Spalten bleiben auch nach der Übergabe erhalten), Angebotspreis,
--                         und ob die Anzeige noch öffentlich ist
--   Foto               : beide Seiten der Unterhaltung dürfen das Foto des Verkäufers lesen

create or replace function public.thread_item(p_thread uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.thread; i public.items; o public.offer; uname text;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  select * into t from public.thread where id = p_thread and me in (from_user, to_user);
  if not found then raise exception 'Unterhaltung nicht gefunden.'; end if;
  if t.kind <> 'interest' then return null; end if;
  select * into i from public.items where user_id = t.to_user and id = t.item_id;
  if i.id is null then return null; end if;
  select username into uname from public.profiles where user_id = t.to_user;
  select * into o from public.offer where thread_id = t.id order by created_at desc limit 1;
  return jsonb_build_object(
    'seller', uname, 'id', i.id, 'path', i.user_id::text || '/items-' || i.id,
    'name', i.name, 'brand', i.brand, 'size', i.size, 'cond', i.cond, 'rarity', i.rarity, 'color', i.color, 'category', i.category,
    'available', (not i.deleted and i.visibility = 'public' and not i.mod_hidden),
    'amount', case when o.id is not null then round(o.amount_cents / 100.0, 2) end,
    'state', case when o.id is null then null when o.confirmed_at is not null then 'done' when o.status = 'accepted' and exists (select 1 from public.listing l where l.id = o.listing_id and l.status = 'sold') then 'sold' else o.status end);
end $$;
revoke all on function public.thread_item(uuid) from public, anon;
grant execute on function public.thread_item(uuid) to authenticated;

create or replace function public.is_thread_item_object(obj_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.thread t
                 where t.kind = 'interest' and auth.uid() in (t.from_user, t.to_user)
                   and t.to_user::text = (storage.foldername(obj_name))[1]
                   and storage.filename(obj_name) in ('items-' || t.item_id, 'items-' || t.item_id || '-t'))
$$;
revoke all on function public.is_thread_item_object(text) from public, anon;
grant execute on function public.is_thread_item_object(text) to authenticated;
drop policy if exists "Anzeigefoto im Chat lesen" on storage.objects;
create policy "Anzeigefoto im Chat lesen" on storage.objects for select to authenticated
  using (bucket_id = 'images' and public.is_thread_item_object(name));
notify pgrst, 'reload schema';
