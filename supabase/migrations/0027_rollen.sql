-- Rollen: eine Tabelle statt einzelner Listen. Es gibt nur admin und moderator; Creator sind ganz normale Konten.
-- Die alte Tabelle admins wird nicht mehr benutzt und erst am Ende der Umstellung entfernt (nach Rückfrage).
create table if not exists public.user_role (
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('admin', 'moderator')),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  primary key (user_id, role)
);
alter table public.user_role enable row level security;
revoke all on public.user_role from anon, authenticated;

insert into public.user_role (user_id, role) select user_id, 'admin' from public.admins on conflict do nothing;

create or replace function public.has_role(p_role text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_role where user_id = auth.uid() and role = p_role)
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_role where user_id = auth.uid() and role = 'admin')
$$;
revoke all on function public.has_role(text) from public, anon;
grant execute on function public.has_role(text) to authenticated;

-- Konto sperren: ein Admin-Konto lässt sich nicht sperren (jetzt aus user_role gelesen)
create or replace function public.admin_ban(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  select target_user into t from public.reports where id = p_id;
  if t is null then raise exception 'Meldung nicht gefunden.'; end if;
  if exists (select 1 from public.user_role where user_id = t and role = 'admin') then raise exception 'Ein Admin-Konto lässt sich nicht sperren.'; end if;
  update auth.users set banned_until = now() + interval '100 years' where id = t;
  begin delete from auth.sessions where user_id = t; exception when others then null; end; -- angemeldete Geräte abmelden
  update public.profiles set banned_at = now() where user_id = t;
  update public.items    set mod_hidden = true, updated_at = now() where user_id = t;
  update public.outfits  set mod_hidden = true, updated_at = now() where user_id = t;
  update public.wishlist set mod_hidden = true, updated_at = now() where user_id = t;
  update public.reports set resolved_at = now(), outcome = 'banned' where target_user = t and resolved_at is null;
  return jsonb_build_object('ok', true);
end $$;

-- Die tägliche Sicherung deckt jetzt auch die neueren Tabellen ab
create or replace function backup.snapshot() returns jsonb
language plpgsql security definer set search_path = public, backup as $$
declare
  t text;
  d int := extract(dow from now())::int;
  tn text;
  n bigint;
  counts jsonb := '{}'::jsonb;
begin
  foreach t in array array['items', 'outfits', 'outfit_items', 'wishlist', 'brands', 'profiles', 'follows', 'saves', 'outfit_saves',
                           'interests', 'replies', 'reports', 'blocks', 'user_role', 'item_image', 'listing', 'events',
                           'feed_settings', 'categories', 'conditions', 'schema_info', 'records'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    tn := t || '_d' || d;
    execute format('drop table if exists backup.%I', tn);
    execute format('create table backup.%I as select * from public.%I', tn, t);
    execute format('alter table backup.%I enable row level security', tn);
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

update public.schema_info set version = 27, note = 'Rollen', updated_at = now();
notify pgrst, 'reload schema';
