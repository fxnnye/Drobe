-- 0046: Anmelden mit Benutzername statt E-Mail-Adresse (für alle Konten).
-- login_email gibt die E-Mail-Adresse NUR zurück, wenn das Passwort stimmt, damit Adressen nicht ausgelesen werden können.
-- Sperre gegen Passwort-Raten: nach 5 falschen Versuchen in 15 Minuten antwortet die Funktion für diesen Namen nur noch mit null.
-- (Die Anmeldung mit E-Mail-Adresse ist davon nicht betroffen.)
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.login_fail (
  id bigint generated always as identity primary key,
  username text not null,
  at timestamptz not null default now()
);
create index if not exists login_fail_idx on public.login_fail (username, at);
alter table public.login_fail enable row level security;
revoke all on public.login_fail from anon, authenticated;

create or replace function public.login_email(p_name text, p_pass text) returns text
language plpgsql security definer set search_path = public, auth, extensions as $$
declare u auth.users; uname text := lower(trim(coalesce(p_name, '')));
begin
  delete from public.login_fail where at < now() - interval '1 day';
  if (select count(*) from public.login_fail where username = uname and at > now() - interval '15 minutes') >= 5 then
    perform pg_sleep(1);
    return null;
  end if;
  select a.* into u from auth.users a join public.profiles p on p.user_id = a.id
   where p.username = uname and a.deleted_at is null;
  if u.id is not null and u.encrypted_password = crypt(p_pass, u.encrypted_password) then
    delete from public.login_fail where username = uname;
    return u.email;
  end if;
  insert into public.login_fail (username) values (uname);
  perform pg_sleep(1);
  return null;
end $$;
revoke all on function public.login_email(text, text) from public;
grant execute on function public.login_email(text, text) to anon, authenticated;
notify pgrst, 'reload schema';
