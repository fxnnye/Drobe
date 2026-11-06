-- 0012: Anmeldung mit echter E-Mail-Adresse. Der Benutzername steht ab jetzt in den Konto-Metadaten
-- (bei alten Konten aus der Pseudo-Adresse abgeleitet) und im Profil.

-- 1. Neues Konto: Benutzername aus den Metadaten, sonst Teil vor dem @; ungültig oder vergeben = Abbruch
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare uname text := lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
begin
  if uname !~ '^[a-z0-9._-]{3,20}$' then raise exception 'Ungültiger Benutzername'; end if;
  if exists (select 1 from public.profiles where username = uname) then raise exception 'Benutzername vergeben'; end if;
  insert into public.profiles (user_id, username) values (new.id, uname);
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- 2. Bestehende Konten: Benutzername in die Metadaten schreiben
update auth.users u set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('username', p.username)
from public.profiles p where p.user_id = u.id;

-- 3. Ist der Benutzername frei? (für die Registrierung, auch ohne Anmeldung)
create or replace function public.username_free(p_name text) returns boolean
language sql security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where username = lower(p_name))
$$;
revoke all on function public.username_free(text) from public;
grant execute on function public.username_free(text) to anon, authenticated;

-- 4. Der eigene Benutzername, unabhängig von der E-Mail-Adresse
create or replace function public.my_username() returns text
language sql security definer set search_path = public as $$
  select username from public.profiles where user_id = auth.uid()
$$;
revoke all on function public.my_username() from public, anon;
grant execute on function public.my_username() to authenticated;
