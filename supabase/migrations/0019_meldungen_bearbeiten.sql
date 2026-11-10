-- Drobe Migration 0019: Meldungen bearbeiten.
-- Betreiber können eine Meldung abschließen und dabei ein Teil verstecken, ein Konto sperren oder „kein Verstoß“ festhalten.
-- Wer gemeldet hat, bekommt beim nächsten Start der App eine Rückmeldung. Der Betreiber sieht die Zahl offener Meldungen.
-- Einmalig im Supabase-Dashboard unter „SQL Editor“ ausführen (nach 0018).

-- 1. Ausgang und Rückmeldung an den Melder
alter table public.reports add column if not exists outcome text check (outcome in ('done', 'dismissed', 'hidden', 'banned'));
alter table public.reports add column if not exists reporter_seen boolean not null default false;
update public.reports set reporter_seen = true where resolved_at is not null and outcome is null; -- alte erledigte Meldungen melden niemandem etwas

-- 2. Versteckt vom Betreiber: so ein Eintrag bleibt privat, auch wenn der Besitzer ihn wieder öffentlich stellt
alter table public.items    add column if not exists mod_hidden boolean not null default false;
alter table public.outfits  add column if not exists mod_hidden boolean not null default false;
alter table public.wishlist add column if not exists mod_hidden boolean not null default false;
alter table public.profiles add column if not exists banned_at timestamptz;

create or replace function public.keep_hidden() returns trigger
language plpgsql as $$
begin
  if new.mod_hidden then
    new.vis := 'private';
    if new.data is not null and new.data <> '{}'::jsonb then new.data := jsonb_set(new.data, '{vis}', '"private"'); end if;
  end if;
  return new;
end $$;
drop trigger if exists items_keep_hidden on public.items;
create trigger items_keep_hidden before insert or update on public.items for each row execute function public.keep_hidden();
drop trigger if exists outfits_keep_hidden on public.outfits;
create trigger outfits_keep_hidden before insert or update on public.outfits for each row execute function public.keep_hidden();
drop trigger if exists wishlist_keep_hidden on public.wishlist;
create trigger wishlist_keep_hidden before insert or update on public.wishlist for each row execute function public.keep_hidden();

-- 3. Offene Meldungen (mit Name des gemeldeten Eintrags) und deren Anzahl
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

create or replace function public.admin_report_count() returns int
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then (select count(*)::int from public.reports where resolved_at is null) else 0 end
$$;

-- 4. Abschließen: erledigt oder kein Verstoß (ersetzt die alte Funktion ohne Ausgang)
drop function if exists public.admin_resolve_report(uuid);
create or replace function public.admin_resolve_report(p_id uuid, p_outcome text default 'done') returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  if p_outcome not in ('done', 'dismissed') then raise exception 'Ungültiger Ausgang.'; end if;
  update public.reports set resolved_at = now(), outcome = p_outcome where id = p_id and resolved_at is null;
  return jsonb_build_object('ok', true);
end $$;

-- 5. Eintrag verstecken (Teil, Outfit oder Wunsch): wird privat und bleibt es
create or replace function public.admin_hide_record(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.reports;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  select * into r from public.reports where id = p_id;
  if not found then raise exception 'Meldung nicht gefunden.'; end if;
  if r.record_id is null then raise exception 'Die Meldung betrifft keinen einzelnen Eintrag.'; end if;
  update public.items    set mod_hidden = true, updated_at = now() where user_id = r.target_user and id = r.record_id;
  update public.outfits  set mod_hidden = true, updated_at = now() where user_id = r.target_user and id = r.record_id;
  update public.wishlist set mod_hidden = true, updated_at = now() where user_id = r.target_user and id = r.record_id;
  update public.reports set resolved_at = now(), outcome = 'hidden' where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- 6. Konto sperren: keine Anmeldung mehr, alle Einträge versteckt; alle offenen Meldungen gegen dieses Konto sind damit erledigt
create or replace function public.admin_ban(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  select target_user into t from public.reports where id = p_id;
  if t is null then raise exception 'Meldung nicht gefunden.'; end if;
  if exists (select 1 from public.admins where user_id = t) then raise exception 'Ein Admin-Konto lässt sich nicht sperren.'; end if;
  update auth.users set banned_until = now() + interval '100 years' where id = t;
  begin delete from auth.sessions where user_id = t; exception when others then null; end; -- angemeldete Geräte abmelden
  update public.profiles set banned_at = now() where user_id = t;
  update public.items    set mod_hidden = true, updated_at = now() where user_id = t;
  update public.outfits  set mod_hidden = true, updated_at = now() where user_id = t;
  update public.wishlist set mod_hidden = true, updated_at = now() where user_id = t;
  update public.reports set resolved_at = now(), outcome = 'banned' where target_user = t and resolved_at is null;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_banned() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('username', username, 'banned_at', banned_at) order by banned_at desc)
                   from public.profiles where banned_at is not null), '[]'::jsonb);
end $$;

-- Entsperren: Anmeldung wieder möglich, die Einträge sind wieder freigegeben (aber privat; der Besitzer stellt sie selbst wieder öffentlich)
create or replace function public.admin_unban(p_username text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  select user_id into t from public.profiles where username = lower(p_username) and banned_at is not null;
  if t is null then raise exception 'Konto nicht gefunden.'; end if;
  update auth.users set banned_until = null where id = t;
  update public.profiles set banned_at = null where user_id = t;
  update public.items    set mod_hidden = false where user_id = t;
  update public.outfits  set mod_hidden = false where user_id = t;
  update public.wishlist set mod_hidden = false where user_id = t;
  return jsonb_build_object('ok', true);
end $$;

-- 7. Rückmeldung an den Melder: was aus seinen Meldungen wurde (einmalig)
create or replace function public.my_report_updates() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'target', tp.username, 'outcome', coalesce(r.outcome, 'done')) order by r.resolved_at), '[]'::jsonb)
  from public.reports r left join public.profiles tp on tp.user_id = r.target_user
  where r.reporter = auth.uid() and r.resolved_at is not null and not r.reporter_seen
$$;

create or replace function public.ack_report_updates(p_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  update public.reports set reporter_seen = true where reporter = auth.uid() and resolved_at is not null and id = any(p_ids)
$$;

-- Rechte: nur angemeldete Konten (die Admin-Funktionen prüfen zusätzlich is_admin())
revoke all on function public.admin_reports() from public, anon;
revoke all on function public.admin_report_count() from public, anon;
revoke all on function public.admin_resolve_report(uuid, text) from public, anon;
revoke all on function public.admin_hide_record(uuid) from public, anon;
revoke all on function public.admin_ban(uuid) from public, anon;
revoke all on function public.admin_banned() from public, anon;
revoke all on function public.admin_unban(text) from public, anon;
revoke all on function public.my_report_updates() from public, anon;
revoke all on function public.ack_report_updates(uuid[]) from public, anon;
revoke all on function public.keep_hidden() from public, anon, authenticated;
grant execute on function public.admin_reports() to authenticated;
grant execute on function public.admin_report_count() to authenticated;
grant execute on function public.admin_resolve_report(uuid, text) to authenticated;
grant execute on function public.admin_hide_record(uuid) to authenticated;
grant execute on function public.admin_ban(uuid) to authenticated;
grant execute on function public.admin_banned() to authenticated;
grant execute on function public.admin_unban(text) to authenticated;
grant execute on function public.my_report_updates() to authenticated;
grant execute on function public.ack_report_updates(uuid[]) to authenticated;

-- Damit die neuen Funktionen sofort über die API erreichbar sind
notify pgrst, 'reload schema';
