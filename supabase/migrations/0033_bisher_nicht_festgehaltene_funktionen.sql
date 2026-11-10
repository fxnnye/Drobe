-- Diese acht Funktionen gab es nur in der Datenbank (direkt im SQL-Editor angelegt), in keiner Migration.
-- Hier sind sie festgehalten, damit Repository und Datenbank übereinstimmen. Inhalt unverändert aus der Datenbank übernommen,
-- erneutes Ausführen ändert nichts. Rechte wie in der Datenbank: nicht für anon, nur angemeldete Nutzer (Admin-Funktionen prüfen is_admin()).

-- Admin: Protokoll der letzten 100 Admin-Aktionen
create or replace function public.admin_log_list() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('action', l.action, 'target', l.target, 'detail', l.detail, 'admin', p.username, 'created_at', l.created_at) order by l.created_at desc)
    from (select * from public.admin_log order by created_at desc limit 100) l
    left join public.profiles p on p.user_id = l.admin_id
  ), '[]'::jsonb);
end $function$;

-- Admin: Teile und Outfits eines Mitglieds
create or replace function public.admin_member_content(p_username text) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $function$
declare target uuid;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  select user_id into target from public.profiles where username = lower(p_username);
  if target is null then raise exception 'Profil nicht gefunden.'; end if;
  return coalesce((
    select jsonb_agg(x.j order by x.ts desc) from (
      select i.updated_at as ts, jsonb_build_object('kind', 'items', 'id', i.id, 'name', i.name, 'brand', i.brand, 'vis', coalesce(i.data->>'vis', 'private')) as j
      from public.items i where i.user_id = target and not i.deleted
      union all
      select o.updated_at, jsonb_build_object('kind', 'outfits', 'id', o.id, 'name', o.name, 'vis', coalesce(o.data->>'vis', 'private'))
      from public.outfits o where o.user_id = target and not o.deleted
      order by ts desc limit 200
    ) x
  ), '[]'::jsonb);
end $function$;

-- Admin: Kennzahlen
create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path to 'public', 'auth' as $function$
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  return jsonb_build_object(
    'members', (select count(*) from public.profiles),
    'new_members', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'items', (select count(*) from public.items where not deleted),
    'outfits', (select count(*) from public.outfits where not deleted),
    'open_reports', (select count(*) from public.reports where resolved_at is null),
    'errors_24h', (select coalesce(sum(n), 0) from public.client_errors where last_at > now() - interval '24 hours')
  );
end $function$;

-- Admin: ein Teil oder Outfit entfernen (als gelöscht markieren)
create or replace function public.admin_remove_content(p_username text, p_kind text, p_id text, p_reason text default null::text) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare target uuid; n int;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  if p_kind not in ('items', 'outfits') then raise exception 'Ungültige Art.'; end if;
  select user_id into target from public.profiles where username = lower(p_username);
  if target is null then raise exception 'Profil nicht gefunden.'; end if;
  if p_kind = 'items' then
    update public.items set deleted = true, updated_at = now(), data = data || '{"deleted": true}'::jsonb where user_id = target and id = p_id and not deleted;
  else
    update public.outfits set deleted = true, updated_at = now(), data = data || '{"deleted": true}'::jsonb where user_id = target and id = p_id and not deleted;
  end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Inhalt nicht gefunden.'; end if;
  insert into public.admin_log (admin_id, action, target, detail)
  values (auth.uid(), 'entfernen', lower(p_username), p_kind || '/' || p_id || coalesce(' · ' || left(nullif(trim(p_reason), ''), 300), ''));
  return jsonb_build_object('ok', true);
end $function$;

-- Admin: alle Meldungen zu einem Mitglied
create or replace function public.admin_reports_for(p_username text) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $function$
declare target uuid;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  select user_id into target from public.profiles where username = lower(p_username);
  if target is null then raise exception 'Profil nicht gefunden.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'reporter', rp.username, 'reason', r.reason, 'note', r.note, 'created_at', r.created_at, 'resolved_at', r.resolved_at,
      'content_kind', case when it.id is not null then 'items' when ou.id is not null then 'outfits' end,
      'content_name', coalesce(it.name, ou.name)
    ) order by r.created_at desc)
    from (select * from public.reports where target_user = target order by created_at desc limit 100) r
    left join public.profiles rp on rp.user_id = r.reporter
    left join public.items it on it.user_id = r.target_user and it.id = r.record_id
    left join public.outfits ou on ou.user_id = r.target_user and ou.id = r.record_id
  ), '[]'::jsonb);
end $function$;

-- Eigene Blockierliste
create or replace function public.my_blocks() returns jsonb
language sql stable security definer set search_path to 'public' as $function$
  select coalesce(jsonb_agg(p.username order by p.username), '[]'::jsonb)
  from public.blocks b join public.profiles p on p.user_id = b.blocked
  where b.blocker = auth.uid()
$function$;

-- Ein Mitglied oder einen Eintrag melden (höchstens 20 Meldungen pro Tag)
create or replace function public.report_user(p_username text, p_reason text, p_record_id text default null::text, p_note text default null::text) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare me uuid := auth.uid(); target uuid;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  select user_id into target from public.profiles where username = lower(p_username);
  if target is null then raise exception 'Profil nicht gefunden.'; end if;
  if target = me then raise exception 'Das bist du selbst.'; end if;
  if (select count(*) from public.reports where reporter = me and created_at > now() - interval '1 day') >= 20 then raise exception 'Für heute ist das Limit erreicht.'; end if;
  insert into public.reports (reporter, target_user, record_id, reason, note)
  values (me, target, nullif(left(coalesce(p_record_id, ''), 100), ''), p_reason, nullif(left(trim(coalesce(p_note, '')), 300), ''));
  return jsonb_build_object('ok', true);
end $function$;

-- Ein Mitglied blockieren oder wieder freigeben
create or replace function public.set_block(p_username text, p_block boolean) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare me uuid := auth.uid(); target uuid;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  select user_id into target from public.profiles where username = lower(p_username);
  if target is null then raise exception 'Profil nicht gefunden.'; end if;
  if target = me then raise exception 'Das bist du selbst.'; end if;
  if p_block then
    insert into public.blocks (blocker, blocked) values (me, target) on conflict do nothing;
  else
    delete from public.blocks where blocker = me and blocked = target;
  end if;
  return jsonb_build_object('ok', true);
end $function$;

revoke all on function public.admin_log_list(), public.admin_member_content(text), public.admin_overview(), public.admin_remove_content(text, text, text, text),
  public.admin_reports_for(text), public.my_blocks(), public.report_user(text, text, text, text), public.set_block(text, boolean) from public, anon;
grant execute on function public.admin_log_list(), public.admin_member_content(text), public.admin_overview(), public.admin_remove_content(text, text, text, text),
  public.admin_reports_for(text), public.my_blocks(), public.report_user(text, text, text, text), public.set_block(text, boolean) to authenticated;
