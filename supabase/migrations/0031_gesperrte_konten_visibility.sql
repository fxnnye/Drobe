-- Nachtrag zu 0030: Die ältere Sperrliste public.bans (leer) hält Teile gesperrter Konten privat.
-- Der Trigger setzte nur vis; jetzt setzt er bei Teilen visibility (bei Outfits und Wünschen bleibt es vis).
-- Diese Funktion stand in keiner Migration, sie war direkt in der Datenbank angelegt worden. Hier ist sie festgehalten.
create or replace function public.keep_banned_private() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.bans where user_id = new.user_id) then
    if tg_table_name = 'items' then new.visibility := 'private'; else new.vis := 'private'; end if;
  end if;
  return new;
end $$;

update public.schema_info set version = 31, note = 'Sperrliste setzt visibility', updated_at = now();
notify pgrst, 'reload schema';
