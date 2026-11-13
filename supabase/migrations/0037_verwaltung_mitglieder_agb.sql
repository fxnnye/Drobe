-- 0037: Verwaltungsseite (admin.html) auf dem heutigen Schema: Mitglieder, Sperren nach Benutzername, AGB-Zustimmung.
-- Im Supabase-Dashboard unter "SQL Editor" ausführen.
--
-- 1. Zustimmung zu den AGB: wird bei der Registrierung vom Server mit der Serverzeit festgehalten (nicht vom Gerät).
--    Konten, die vor dieser Migration angelegt wurden, haben keinen Eintrag (Spalte bleibt leer, "nicht erfasst").
-- 2. admin_members und admin_set_ban ersetzen die in 0032 entfernten Funktionen, jetzt auf profiles.banned_at und mod_hidden.
-- 3. admin_reports liefert zusätzlich Angaben zum gemeldeten Konto (bisherige Felder bleiben gleich).

alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists terms_version text;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uname text := lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  agreed boolean := coalesce(new.raw_user_meta_data->>'terms_accepted', '') = 'true';
begin
  if uname !~ '^[a-z0-9._-]{3,20}$' then raise exception 'Ungültiger Benutzername'; end if;
  if exists (select 1 from public.profiles where username = uname) then raise exception 'Benutzername vergeben'; end if;
  insert into public.profiles (user_id, username, terms_accepted_at, terms_version)
  values (new.id, uname, case when agreed then now() end, case when agreed then left(nullif(new.raw_user_meta_data->>'terms_version', ''), 40) end);
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Mitglieder suchen (Benutzername oder E-Mail, leer = neueste)
create or replace function public.admin_members(p_query text default '') returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare q text := lower(trim(coalesce(p_query, '')));
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'username', p.username, 'email', u.email, 'created_at', u.created_at, 'last_sign_in', u.last_sign_in_at,
      'banned', p.banned_at is not null, 'banned_at', p.banned_at,
      'ban_reason', (select l.detail from public.admin_log l where l.action = 'sperren' and l.target = p.username order by l.created_at desc limit 1),
      'is_admin', exists (select 1 from public.user_role r where r.user_id = p.user_id and r.role = 'admin'),
      'items', (select count(*) from public.items i where i.user_id = p.user_id and not i.deleted),
      'outfits', (select count(*) from public.outfits o where o.user_id = p.user_id and not o.deleted),
      'reports_against', (select count(*) from public.reports x where x.target_user = p.user_id),
      'terms_accepted_at', p.terms_accepted_at, 'terms_version', p.terms_version
    ) order by u.created_at desc)
    from (select * from public.profiles
          where q = '' or username like '%' || q || '%' or user_id in (select id from auth.users where lower(email) like '%' || q || '%')
          order by created_at desc limit 30) p
    join auth.users u on u.id = p.user_id
  ), '[]'::jsonb);
end $$;

-- Konto sperren oder entsperren (nach Benutzername), mit Eintrag im Verwaltungsprotokoll
create or replace function public.admin_set_ban(p_username text, p_ban boolean, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare t uuid; why text := left(nullif(trim(coalesce(p_reason, '')), ''), 300);
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  select user_id into t from public.profiles where username = lower(p_username);
  if t is null then raise exception 'Profil nicht gefunden.'; end if;
  if p_ban then
    if t = auth.uid() or exists (select 1 from public.user_role where user_id = t and role = 'admin') then raise exception 'Ein Admin-Konto lässt sich nicht sperren.'; end if;
    update auth.users set banned_until = now() + interval '100 years' where id = t;
    begin delete from auth.sessions where user_id = t; exception when others then null; end; -- angemeldete Geräte abmelden
    update public.profiles set banned_at = now() where user_id = t;
    update public.items   set mod_hidden = true, updated_at = now() where user_id = t;
    update public.outfits set mod_hidden = true, updated_at = now() where user_id = t;
    update public.reports set resolved_at = now(), outcome = 'banned' where target_user = t and resolved_at is null;
  else
    update auth.users set banned_until = null where id = t;
    update public.profiles set banned_at = null where user_id = t;
    update public.items   set mod_hidden = false where user_id = t;
    update public.outfits set mod_hidden = false where user_id = t;
  end if;
  insert into public.admin_log (admin_id, action, target, detail)
  values (auth.uid(), case when p_ban then 'sperren' else 'entsperren' end, lower(p_username), why);
  return jsonb_build_object('ok', true);
end $$;

-- Offene Meldungen mit Angaben zum gemeldeten Konto
create or replace function public.admin_reports() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'reporter', rp.username, 'target', tp.username, 'record_id', r.record_id,
      'record_name', coalesce(it.name, ou.name),
      'reason', r.reason, 'note', r.note, 'created_at', r.created_at, 'target_banned', tp.banned_at is not null,
      'target_is_admin', exists (select 1 from public.user_role a where a.user_id = r.target_user and a.role = 'admin'),
      'target_since', (select u.created_at from auth.users u where u.id = r.target_user),
      'target_items', (select count(*) from public.items i where i.user_id = r.target_user and not i.deleted),
      'target_outfits', (select count(*) from public.outfits o where o.user_id = r.target_user and not o.deleted),
      'target_reports', (select count(*) from public.reports x where x.target_user = r.target_user),
      'target_terms_at', tp.terms_accepted_at, 'target_terms_version', tp.terms_version,
      'content_kind', case when it.id is not null then 'items' when ou.id is not null then 'outfits' end,
      'content_name', coalesce(it.name, ou.name),
      'content_deleted', coalesce(it.deleted, ou.deleted)
    ) order by r.created_at desc)
    from (select * from public.reports where resolved_at is null order by created_at desc limit 100) r
    left join public.profiles rp on rp.user_id = r.reporter
    left join public.profiles tp on tp.user_id = r.target_user
    left join public.items   it on it.user_id = r.target_user and it.id = r.record_id
    left join public.outfits ou on ou.user_id = r.target_user and ou.id = r.record_id
  ), '[]'::jsonb);
end $$;

revoke all on function public.admin_members(text), public.admin_set_ban(text, boolean, text), public.admin_reports() from public, anon;
grant execute on function public.admin_members(text), public.admin_set_ban(text, boolean, text), public.admin_reports() to authenticated;
notify pgrst, 'reload schema';
