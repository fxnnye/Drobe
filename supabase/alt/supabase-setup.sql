-- Drobe: einmalig im Supabase-Dashboard unter "SQL Editor" ausführen.

-- Alle Teile, Outfits und Wunschlisten-Einträge eines Kontos (kind = 'items' | 'outfits' | 'wishlist')
create table if not exists public.records (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('items', 'outfits', 'wishlist')),
  id         text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

alter table public.records enable row level security;

-- Jeder sieht und ändert nur seine eigenen Zeilen
create policy "eigene Zeilen lesen"      on public.records for select using (auth.uid() = user_id);
create policy "eigene Zeilen anlegen"    on public.records for insert with check (auth.uid() = user_id);
create policy "eigene Zeilen ändern"     on public.records for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "eigene Zeilen löschen"    on public.records for delete using (auth.uid() = user_id);

-- Privater Speicher für die Fotos, ein Ordner pro Konto
insert into storage.buckets (id, name, public) values ('images', 'images', false)
on conflict (id) do nothing;

create policy "eigene Bilder lesen"   on storage.objects for select
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "eigene Bilder anlegen" on storage.objects for insert
  with check (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "eigene Bilder ändern"  on storage.objects for update
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "eigene Bilder löschen" on storage.objects for delete
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
