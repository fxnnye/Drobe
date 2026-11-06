-- Drobe Migration 0011: Umzug, Schritt 2 von 2 – die Tabelle `records` entfernen.
-- Erst ausführen, wenn die neue App-Version (sync_push / sync_pull) eine Weile läuft und
-- die Prüfung am Ende von 0008 (Zählung und Vergleich) keine Abweichung gezeigt hat.

-- sync_push ohne die Brücke zu records
create or replace function public.sync_push(p_kind text, p_id text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  known boolean;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  if p_kind not in ('items', 'outfits', 'wishlist') then raise exception 'Ungültige Art.'; end if;
  if p_id is null or p_id !~ '^[A-Za-z0-9_-]{1,40}$' then raise exception 'Ungültige ID.'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 150000 then raise exception 'Eintrag ungültig oder zu groß.'; end if;

  known := case p_kind
    when 'items' then exists (select 1 from public.items where user_id = me and id = p_id)
    when 'outfits' then exists (select 1 from public.outfits where user_id = me and id = p_id)
    else exists (select 1 from public.wishlist where user_id = me and id = p_id) end;
  if not known and (select (select count(*) from public.items where user_id = me)
                         + (select count(*) from public.outfits where user_id = me)
                         + (select count(*) from public.wishlist where user_id = me)) >= 2000 then
    raise exception 'Du hast die Obergrenze von 2000 Einträgen erreicht.';
  end if;

  perform public.apply_row(me, p_kind, p_id, p_data, now());
  return jsonb_build_object('ok', true);
end $$;

-- Speicher-Regel „öffentliche Bilder“ hängt nicht mehr an records (siehe 0008), alte Trigger und Funktionen entfernen
drop trigger if exists records_typed_sync on public.records;
drop trigger if exists records_limit on public.records;
drop function if exists public.records_to_typed();
drop function if exists public.sync_typed(public.records);
drop function if exists public.limit_records();
drop function if exists public.is_public_record(text, jsonb);
drop table if exists public.records;

notify pgrst, 'reload schema';
