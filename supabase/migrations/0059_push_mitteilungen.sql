-- 0059: Push-Mitteilungen für die iOS-App.
-- Im Supabase-Dashboard unter "SQL Editor" ausführen. Danach die Edge Function "push-send" bereitstellen
-- (supabase/functions/push-send) und die Geheimnisse APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID setzen (siehe ios-app/README.md).
--
--   push_device        : Geräte-Kennungen (Token) der angemeldeten Nutzer, nur über Funktionen erreichbar
--   push_pref          : was jemand bekommen möchte (alles standardmäßig an)
--   push_queue         : Warteschlange der zu sendenden Mitteilungen; die Edge Function holt sie ab und schickt sie an Apple
--   push_register / push_unregister / push_prefs_get / push_prefs_set : Funktionen der App
--   Auslöser: neue Nachricht (Chat, Anfrage, Angebot angenommen/abgelehnt, verkauft, Erhalt, Bewertung, Team) und neuer Follower

create extension if not exists pg_net with schema extensions;

create table if not exists public.push_device (
  token      text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  env        text not null default 'production' check (env in ('sandbox', 'production')),
  updated_at timestamptz not null default now()
);
create index if not exists push_device_user_idx on public.push_device (user_id);
alter table public.push_device enable row level security;
revoke all on public.push_device from anon, authenticated;

create table if not exists public.push_pref (
  user_id uuid primary key references auth.users(id) on delete cascade,
  prefs   jsonb not null default '{}'::jsonb
);
alter table public.push_pref enable row level security;
revoke all on public.push_pref from anon, authenticated;

create table if not exists public.push_queue (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null default '',
  link       text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index if not exists push_queue_open_idx on public.push_queue (created_at) where sent_at is null;
alter table public.push_queue enable row level security;
revoke all on public.push_queue from anon, authenticated;

-- Arten: messages, requests, offers, orders, reviews, follows, team. Fehlt ein Eintrag, gilt „an“.
create or replace function public.push_pref_on(p_user uuid, p_kind text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (prefs ->> p_kind)::boolean from public.push_pref where user_id = p_user), true)
$$;

-- Eine Mitteilung vormerken (nur wenn der Nutzer ein Gerät hat und die Art nicht abgeschaltet hat) und die Edge Function anstoßen
create or replace function public.push_enqueue(p_user uuid, p_kind text, p_title text, p_body text, p_link text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_user is null then return; end if;
  if not exists (select 1 from public.push_device where user_id = p_user) then return; end if;
  if not public.push_pref_on(p_user, p_kind) then return; end if;
  insert into public.push_queue (user_id, kind, title, body, link) values (p_user, p_kind, left(p_title, 80), left(coalesce(p_body, ''), 160), p_link);
  begin
    perform net.http_post(
      url := 'https://elffmxtoxvygziiztjhd.supabase.co/functions/v1/push-send',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_3goVqjFm8wKraIugwDH5pw_QZGH23tM", "apikey": "sb_publishable_3goVqjFm8wKraIugwDH5pw_QZGH23tM"}'::jsonb,
      body := '{}'::jsonb
    );
  exception when others then null; -- eine fehlende Mitteilung darf nie das Schreiben verhindern
  end;
end $$;
revoke all on function public.push_pref_on(uuid, text), public.push_enqueue(uuid, text, text, text, text) from public, anon, authenticated;

-- Neue Nachricht: je nach Inhalt Chat, Anfrage, Angebot, Verkauf, Bewertung oder Team
create or replace function public.push_on_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t public.thread; rcpt uuid; sname text; iname text; k text; ttl text; bd text; lnk text := 'messages';
  b text := coalesce(new.body, '');
begin
  begin
    select * into t from public.thread where id = new.thread_id;
    if t.id is null then return null; end if;
    rcpt := case when new.sender = t.from_user then t.to_user else t.from_user end;
    if rcpt is null or rcpt = new.sender then return null; end if;
    select username into sname from public.profiles where user_id = new.sender;
    sname := coalesce(sname, 'Jemand');
    -- Name des Teils, um das es geht (gehört dem Empfänger der Anfrage)
    select name into iname from public.items where user_id = t.to_user and id = t.item_id;
    iname := coalesce(nullif(iname, ''), 'dein Teil');
    if t.kind = 'team' then
      if new.kind = 'request' then return null; end if;
      k := 'team'; ttl := 'JAWNZ'; bd := b;
    elsif new.kind = 'request' then
      k := 'requests'; ttl := 'Neue Kaufanfrage'; bd := '@' || sname || ' interessiert sich für „' || iname || '“.';
    elsif b like 'Angebot angenommen%' then
      k := 'offers'; ttl := 'Angebot angenommen'; bd := '@' || sname || ' hat dein Angebot für „' || iname || '“ angenommen.';
    elsif b like 'Angebot abgelehnt%' then
      k := 'offers'; ttl := 'Angebot abgelehnt'; bd := '@' || sname || ' hat dein Angebot für „' || iname || '“ abgelehnt.';
    elsif b like 'Angebot zurückgezogen%' then
      k := 'offers'; ttl := 'Angebot zurückgezogen'; bd := '@' || sname || ' hat das Angebot für „' || iname || '“ zurückgezogen.';
    elsif b like 'Als verkauft markiert%' then
      k := 'orders'; ttl := 'Als verkauft markiert'; bd := 'Bestätige den Erhalt von „' || iname || '“, sobald es bei dir ist.';
    elsif b like 'Erhalt bestätigt%' then
      k := 'orders'; ttl := 'Erhalt bestätigt'; bd := '@' || sname || ' hat den Erhalt von „' || iname || '“ bestätigt. Ihr könnt euch jetzt bewerten.';
    elsif b like 'Die Reservierung wurde aufgehoben%' then
      k := 'orders'; ttl := 'Reservierung aufgehoben'; bd := '@' || sname || ' hat die Reservierung von „' || iname || '“ aufgehoben.';
    elsif b like 'Bewertung abgegeben%' then
      k := 'reviews'; ttl := 'Neue Bewertung'; bd := '@' || sname || ' hat dich bewertet. ' || substr(b, 22);
    else
      k := 'messages'; ttl := '@' || sname; bd := case when b <> '' then b when new.image_path is not null then 'Foto' else 'Neue Nachricht' end;
    end if;
    perform public.push_enqueue(rcpt, k, ttl, bd, lnk);
  exception when others then null; -- Mitteilungen dürfen das Senden nie verhindern
  end;
  return null;
end $$;
revoke all on function public.push_on_message() from public, anon, authenticated;
drop trigger if exists push_message on public.message;
create trigger push_message after insert on public.message for each row execute function public.push_on_message();

-- Neuer Follower
create or replace function public.push_on_follow() returns trigger
language plpgsql security definer set search_path = public as $$
declare fname text;
begin
  begin
    select username into fname from public.profiles where user_id = new.follower;
    perform public.push_enqueue(new.followee, 'follows', 'Neuer Follower', '@' || coalesce(fname, 'Jemand') || ' folgt dir jetzt.', '#/u/' || coalesce(fname, ''));
  exception when others then null;
  end;
  return null;
end $$;
revoke all on function public.push_on_follow() from public, anon, authenticated;
drop trigger if exists push_follow on public.follows;
create trigger push_follow after insert on public.follows for each row execute function public.push_on_follow();

-- App: Gerät anmelden (ein Token gehört immer nur zum zuletzt angemeldeten Konto) und abmelden
create or replace function public.push_register(p_token text, p_env text default 'production') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  if p_token is null or length(p_token) < 20 or length(p_token) > 400 then raise exception 'Ungültiges Gerät.'; end if;
  insert into public.push_device (token, user_id, env, updated_at)
  values (p_token, me, case when p_env = 'sandbox' then 'sandbox' else 'production' end, now())
  on conflict (token) do update set user_id = excluded.user_id, env = excluded.env, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.push_unregister(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Bitte melde dich an.'; end if;
  delete from public.push_device where token = p_token and user_id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.push_prefs_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p jsonb;
begin
  if auth.uid() is null then raise exception 'Bitte melde dich an.'; end if;
  select prefs into p from public.push_pref where user_id = auth.uid();
  return jsonb_build_object(
    'messages', coalesce((p ->> 'messages')::boolean, true), 'requests', coalesce((p ->> 'requests')::boolean, true),
    'offers',   coalesce((p ->> 'offers')::boolean, true),   'orders',   coalesce((p ->> 'orders')::boolean, true),
    'reviews',  coalesce((p ->> 'reviews')::boolean, true),  'follows',  coalesce((p ->> 'follows')::boolean, true),
    'team',     coalesce((p ->> 'team')::boolean, true));
end $$;

create or replace function public.push_prefs_set(p_kind text, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Bitte melde dich an.'; end if;
  if p_kind not in ('messages', 'requests', 'offers', 'orders', 'reviews', 'follows', 'team') then raise exception 'Ungültige Art.'; end if;
  insert into public.push_pref (user_id, prefs) values (auth.uid(), jsonb_build_object(p_kind, coalesce(p_on, true)))
  on conflict (user_id) do update set prefs = public.push_pref.prefs || jsonb_build_object(p_kind, coalesce(p_on, true));
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.push_register(text, text), public.push_unregister(text), public.push_prefs_get(), public.push_prefs_set(text, boolean) from public, anon;
grant execute on function public.push_register(text, text), public.push_unregister(text), public.push_prefs_get(), public.push_prefs_set(text, boolean) to authenticated;

-- Die tägliche Sicherung braucht die neuen Tabellen nicht (Geräte-Tokens ändern sich ständig)
notify pgrst, 'reload schema';
