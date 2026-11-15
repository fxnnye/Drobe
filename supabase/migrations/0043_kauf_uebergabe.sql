-- 0043: Verkauf abgeschlossen = Teil wechselt den Kleiderschrank, mit Verlauf der Vorbesitzer.
-- Im Supabase-Dashboard unter "SQL Editor" ausführen.
--
-- Ablauf: Der Verkäufer setzt ein Teil mit angenommenem Angebot auf „verkauft“ (mark_sold).
--   1. Das Teil verschwindet sofort aus seinem Kleiderschrank (wird wie gelöscht markiert, seine Geräte entfernen es beim nächsten Abgleich).
--   2. Für den Käufer wird eine Übergabe angelegt: Angaben des Teils (ohne Notizen und Preis) und der Verlauf der bisherigen Besitzer.
--   3. Beim nächsten Abgleich holt die App des Käufers das Teil ab (my_transfers), legt es privat in seinen Kleiderschrank
--      und meldet das zurück (finish_transfer). Das Foto darf der Käufer dafür aus dem Speicher des Verkäufers lesen.
-- Notizen, Preis und Shop-Links des Verkäufers bleiben bei ihm. Verkauft ohne angenommenes Angebot: nichts ändert sich.

create table if not exists public.item_transfer (
  id         uuid primary key default gen_random_uuid(),
  item_id    text not null,
  from_user  uuid not null references auth.users(id) on delete cascade,
  to_user    uuid not null references auth.users(id) on delete cascade,
  offer_id   uuid references public.offer(id) on delete set null,
  path       text not null,                         -- Foto des Verkäufers im Speicher „images“
  data       jsonb not null,                        -- Angaben des Teils inkl. history
  status     text not null default 'pending' check (status in ('pending', 'done')),
  created_at timestamptz not null default now(),
  done_at    timestamptz
);
create index if not exists item_transfer_to_idx on public.item_transfer (to_user, status);
alter table public.item_transfer enable row level security;
revoke all on public.item_transfer from anon, authenticated;

-- Foto lesen: nur der Käufer, nur solange die Übergabe offen ist
create or replace function public.is_transfer_object(obj_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.item_transfer t
                 where t.status = 'pending' and t.to_user = auth.uid()
                   and t.from_user::text = (storage.foldername(obj_name))[1]
                   and storage.filename(obj_name) in ('items-' || t.item_id, 'items-' || t.item_id || '-t'))
$$;
revoke all on function public.is_transfer_object(text) from public, anon;
grant execute on function public.is_transfer_object(text) to authenticated;
drop policy if exists "Kaufteile lesen" on storage.objects;
create policy "Kaufteile lesen" on storage.objects for select to authenticated
  using (bucket_id = 'images' and public.is_transfer_object(name));

create or replace function public.mark_sold(p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); l public.listing; o public.offer; it public.items; myname text; buyername text; hist jsonb; snap jsonb;
  ms bigint := (extract(epoch from now()) * 1000)::bigint; moved boolean := false;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  select * into l from public.listing where item_id = p_item and user_id = me and status in ('active', 'reserved') for update;
  if not found then raise exception 'Dieses Teil ist nicht zum Verkauf.'; end if;
  update public.listing set status = 'sold', updated_at = now() where id = l.id;
  select * into o from public.offer where listing_id = l.id and status = 'accepted' order by decided_at desc nulls last limit 1;
  update public.offer set status = 'declined', decided_at = now() where listing_id = l.id and status = 'open';
  if o.id is not null then
    select * into it from public.items where user_id = me and id = p_item;
    select username into myname from public.profiles where user_id = me;
    select username into buyername from public.profiles where user_id = o.from_user;
    if it.id is not null and o.from_user <> me then
      hist := case when jsonb_typeof(it.data->'history') = 'array' then it.data->'history' else '[]'::jsonb end
              || jsonb_build_array(jsonb_build_object('user', myname, 'at', ms));
      snap := jsonb_strip_nulls(jsonb_build_object(
        'name', it.data->'name', 'category', it.data->'category', 'brand', it.data->'brand', 'size', it.data->'size',
        'sku', it.data->'sku', 'cond', it.data->'cond', 'rarity', it.data->'rarity', 'color', it.data->'color', 'hex', it.data->'hex',
        'emb', it.data->'emb', 'history', hist));
      insert into public.item_transfer (item_id, from_user, to_user, offer_id, path, data)
      values (it.id, me, o.from_user, o.id, me::text || '/items-' || it.id, snap);
      -- raus aus dem Kleiderschrank des Verkäufers (Geräte entfernen es beim Abgleich)
      update public.items set deleted = true, visibility = 'private', updated_at = now(),
             data = jsonb_build_object('deleted', true, 'updated', ms)
       where user_id = me and id = it.id;
      moved := true;
      insert into public.message (thread_id, sender, kind, body)
      values (o.thread_id, me, 'text', 'Verkauft. Das Teil ist jetzt im Kleiderschrank von @' || coalesce(buyername, 'dem Käufer') || '.');
    end if;
  end if;
  return jsonb_build_object('ok', true, 'transferred', moved);
end $$;

create or replace function public.my_transfers() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'path', t.path, 'data', t.data, 'at', t.created_at) order by t.created_at), '[]'::jsonb)
  from public.item_transfer t where t.to_user = auth.uid() and t.status = 'pending'
$$;

create or replace function public.finish_transfer(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Bitte melde dich an.'; end if;
  update public.item_transfer set status = 'done', done_at = now() where id = p_id and to_user = auth.uid() and status = 'pending';
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.mark_sold(text), public.my_transfers(), public.finish_transfer(uuid) from public, anon;
grant execute on function public.mark_sold(text), public.my_transfers(), public.finish_transfer(uuid) to authenticated;

update public.schema_info set version = 40, note = 'Kauf-Übergabe und Besitzerverlauf', updated_at = now() where true;
notify pgrst, 'reload schema';
