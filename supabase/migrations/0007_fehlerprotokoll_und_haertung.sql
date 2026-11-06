-- Drobe Migration 0007: Fehlerprotokoll der App und Härtung (Ergebnis des Sicherheitsdurchgangs).

-- 1. Fehlerprotokoll: die App meldet unerwartete Fehler, nur der Admin liest sie (Einstellungen → Fehlerprotokoll)
create table if not exists public.client_errors (
  id         bigint generated always as identity primary key,
  message    text not null,
  stack      text,
  page       text,
  build      int,
  n          int not null default 1,       -- wie oft dieselbe Meldung auftrat
  created_at timestamptz not null default now(),
  last_at    timestamptz not null default now()
);
alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;
create index if not exists client_errors_last_idx on public.client_errors (last_at desc);

create or replace function public.log_client_error(p_message text, p_stack text default null, p_page text default null, p_build int default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  msg text := left(trim(coalesce(p_message, '')), 400);
  hit bigint;
begin
  if msg = '' then return; end if;
  -- Schutz vor Überflutung: insgesamt höchstens 300 Meldungen pro Stunde
  if (select count(*) from public.client_errors where last_at > now() - interval '1 hour') >= 300 then return; end if;
  -- gleiche Meldung in der gleichen Version innerhalb von 6 Stunden: nur zählen
  select id into hit from public.client_errors
    where message = msg and build is not distinct from p_build and last_at > now() - interval '6 hours' order by last_at desc limit 1;
  if hit is not null then
    update public.client_errors set n = n + 1, last_at = now() where id = hit;
  else
    insert into public.client_errors (message, stack, page, build)
    values (msg, left(p_stack, 1500), left(p_page, 100), p_build);
  end if;
  if random() < 0.02 then delete from public.client_errors where last_at < now() - interval '30 days'; end if;
end $$;

create or replace function public.admin_errors() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'message', e.message, 'stack', e.stack, 'page', e.page, 'build', e.build, 'n', e.n, 'last_at', e.last_at) order by e.last_at desc)
    from (select * from public.client_errors order by last_at desc limit 100) e
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_clear_errors() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  delete from public.client_errors;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.log_client_error(text, text, text, int) from public;
grant execute on function public.log_client_error(text, text, text, int) to anon, authenticated;
revoke all on function public.admin_errors() from public, anon;
revoke all on function public.admin_clear_errors() from public, anon;
grant execute on function public.admin_errors() to authenticated;
grant execute on function public.admin_clear_errors() to authenticated;

-- 2. Neue Funktionen sind ab jetzt für Gäste standardmäßig gesperrt (jede Freigabe muss ausdrücklich erteilt werden)
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public;

-- 3. Foto-Speicher: nur Bilder, höchstens 10 MB pro Datei
update storage.buckets set file_size_limit = 10485760, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'images';

-- 4. Folgen: höchstens 1000 Konten pro Person (sonst Spam-Folgen)
create or replace function public.toggle_follow(p_username text) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); target uuid; now_on boolean;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  select user_id into target from public.profiles where username = lower(p_username);
  if target is null then raise exception 'Profil nicht gefunden.'; end if;
  if target = me then raise exception 'Das bist du selbst.'; end if;
  if exists (select 1 from public.blocks b where (b.blocker = me and b.blocked = target) or (b.blocker = target and b.blocked = me)) then
    raise exception 'Das geht hier nicht.';
  end if;
  if exists (select 1 from public.follows where follower = me and followee = target) then
    delete from public.follows where follower = me and followee = target;
    now_on := false;
  else
    if (select count(*) from public.follows where follower = me) >= 1000 then raise exception 'Du folgst schon 1000 Konten.'; end if;
    insert into public.follows (follower, followee) values (me, target);
    now_on := true;
  end if;
  return now_on;
end $$;
revoke all on function public.toggle_follow(text) from public, anon;
grant execute on function public.toggle_follow(text) to authenticated;

notify pgrst, 'reload schema';
