-- item_image: jedes Bild eines Teils ist eine eigene Zeile (Hauptbild, Ausgangsfoto, später Zusatzfotos).
-- Die Dateien selbst liegen weiter im Speicher „images“; hier steht, welches Bild zu welchem Teil gehört.
-- Die Zeilen für Hauptbild und Ausgangsfoto pflegt ein Trigger aus den Angaben des Teils, die App schreibt nicht direkt hinein.
create table if not exists public.item_image (
  id         uuid primary key default gen_random_uuid(),
  item_id    text not null references public.items(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('main', 'source', 'extra')),
  position   int  not null default 0,
  path       text not null,
  bytes      int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, role, position),
  unique (path)
);
create index if not exists item_image_user_idx on public.item_image (user_id);
alter table public.item_image enable row level security;
revoke all on public.item_image from anon, authenticated;
grant select on public.item_image to authenticated;
drop policy if exists item_image_own on public.item_image;
create policy item_image_own on public.item_image for select to authenticated using (user_id = auth.uid());

create or replace function public.item_image_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  fp  text := nullif(new.data->>'fp', '');
  sfp text := nullif(new.data->>'sfp', '');
  base text := new.user_id::text || '/items-' || new.id;
begin
  if new.deleted or fp is null then
    delete from public.item_image where item_id = new.id and role = 'main';
  else
    insert into public.item_image (item_id, user_id, role, position, path, bytes)
    values (new.id, new.user_id, 'main', 0, base, case when fp ~ '^[0-9]{1,9}$' then fp::int end)
    on conflict (item_id, role, position) do update set bytes = excluded.bytes, updated_at = now();
  end if;
  if new.deleted or sfp is null then
    delete from public.item_image where item_id = new.id and role = 'source';
  else
    insert into public.item_image (item_id, user_id, role, position, path, bytes)
    values (new.id, new.user_id, 'source', 0, base || '-src', case when sfp ~ '^[0-9]{1,9}$' then sfp::int end)
    on conflict (item_id, role, position) do update set bytes = excluded.bytes, updated_at = now();
  end if;
  return null;
end $$;
revoke all on function public.item_image_sync() from public, anon, authenticated;

drop trigger if exists items_image_sync on public.items;
create trigger items_image_sync after insert or update of data, deleted on public.items
  for each row execute function public.item_image_sync();

-- Bestehende Teile einmal nachtragen (der Trigger läuft bei einem leeren Update)
update public.items set data = data where not deleted and data ? 'fp';

update public.schema_info set version = 25, note = 'item_image', updated_at = now();
notify pgrst, 'reload schema';
