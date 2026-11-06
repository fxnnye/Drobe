-- Drobe Migration 0009: tägliche Sicherung der Daten innerhalb der Datenbank (7 Tage rückwirkend).
--
-- backup.snapshot() kopiert alle Tabellen mit Nutzerdaten in das Schema `backup`, je Wochentag eine eigene Kopie
-- (items_d0 … items_d6). Das schützt vor Versehen und Programmfehlern (z. B. versehentlich gelöschte Einträge).
-- Es ersetzt KEINE Sicherung außerhalb des Projekts: Fotos liegen im Speicher und sind nicht enthalten.
--
-- Wiederherstellen (Beispiel, Teile von vor 2 Tagen zurückholen), im SQL Editor:
--   select * from backup.log order by taken_at desc;                       -- welche Tage gibt es?
--   insert into public.items select * from backup.items_d3 on conflict (user_id, id) do update set data = excluded.data;
--   (danach den Abgleich der App abwarten; Spalten werden aus data neu abgeleitet, wenn der Eintrag erneut gespeichert wird)

create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;

create table if not exists backup.log (
  taken_at timestamptz primary key default now(),
  dow      int not null,
  counts   jsonb not null
);
revoke all on backup.log from public, anon, authenticated;

create or replace function backup.snapshot() returns jsonb
language plpgsql security definer set search_path = public, backup as $$
declare
  t text;
  d int := extract(dow from now())::int;
  tn text;
  n bigint;
  counts jsonb := '{}'::jsonb;
begin
  foreach t in array array['items', 'outfits', 'outfit_items', 'wishlist', 'brands', 'profiles', 'follows', 'saves',
                           'interests', 'replies', 'reports', 'blocks', 'admins', 'records'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    tn := t || '_d' || d;
    execute format('drop table if exists backup.%I', tn);
    execute format('create table backup.%I as select * from public.%I', tn, t);
    execute format('alter table backup.%I enable row level security', tn); -- ohne Regel: für App-Konten gesperrt
    execute format('revoke all on backup.%I from public, anon, authenticated', tn);
    execute format('select count(*) from backup.%I', tn) into n;
    counts := counts || jsonb_build_object(t, n);
  end loop;
  insert into backup.log (taken_at, dow, counts) values (now(), d, counts)
  on conflict (taken_at) do nothing;
  delete from backup.log where taken_at < now() - interval '30 days';
  return counts;
end $$;
revoke all on function backup.snapshot() from public, anon, authenticated;

-- Sofort eine erste Sicherung anlegen
select backup.snapshot();
