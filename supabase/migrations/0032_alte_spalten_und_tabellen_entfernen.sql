-- Schritt 12, Stufe 2: Alte Spalten und Tabellen entfernen (vom Nutzer am 2026-11-11 freigegeben).
-- Alles Entfernte ist an neuer Stelle vorhanden: vis/price → visibility + listing, admins → user_role,
-- interests/replies → thread/message/offer, Sperrliste bans → profiles.banned_at + items.mod_hidden. swap war überall leer.
-- Vorher wird die tägliche Sicherung einmal frisch ausgelöst (backup.*_dN enthält danach auch die alten Tabellen).
select backup.snapshot();

-- Zwei ältere Admin-Funktionen benutzten bans/admins und werden von der App nicht aufgerufen (Sperren läuft über admin_ban/admin_unban/admin_banned).
drop function if exists public.admin_members(text);
drop function if exists public.admin_set_ban(text, boolean, text);
-- admin_reports in der Datenbank war eine abweichende, nirgends festgehaltene Fassung (bans/admins, ohne Namen des Eintrags).
-- Zurück auf die Fassung aus 0019, die die App erwartet: record_name, target_banned über profiles.banned_at.
create or replace function public.admin_reports() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'reporter', rp.username, 'target', tp.username, 'record_id', r.record_id,
      'record_name', coalesce(
        (select i.name from public.items i where i.user_id = r.target_user and i.id = r.record_id),
        (select o.name from public.outfits o where o.user_id = r.target_user and o.id = r.record_id),
        (select w.name from public.wishlist w where w.user_id = r.target_user and w.id = r.record_id)),
      'reason', r.reason, 'note', r.note, 'created_at', r.created_at,
      'target_banned', tp.banned_at is not null
    ) order by r.created_at desc)
    from (select * from public.reports where resolved_at is null order by created_at desc limit 100) r
    left join public.profiles rp on rp.user_id = r.reporter
    left join public.profiles tp on tp.user_id = r.target_user
  ), '[]'::jsonb);
end $$;

-- keep_banned_private hängt an Teilen, Outfits und Wünschen; die Sperre hält dort keep_hidden über mod_hidden aufrecht
do $$
declare r record;
begin
  for r in select tgrelid::regclass::text as t, tgname from pg_trigger where tgfoid = 'public.keep_banned_private'::regproc loop
    execute format('drop trigger %I on %s', r.tgname, r.t);
  end loop;
end $$;
drop function if exists public.keep_banned_private();
drop table public.bans;

drop table public.replies;
drop table public.interests;
drop function if exists public.event_from_interest();
drop table public.admins;

drop index if exists public.items_feed_idx;
drop index if exists public.items_color_idx;
drop index if exists public.items_size_idx;
drop index if exists public.items_brand_idx;
alter table public.items drop column vis, drop column price, drop column swap;

update public.schema_info set version = 32, note = 'alte Spalten und Tabellen entfernt', updated_at = now();
notify pgrst, 'reload schema';
