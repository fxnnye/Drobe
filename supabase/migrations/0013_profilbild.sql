-- 0013: Profilbild. Wird klein (256 px, JPEG) als Data-URL im Profil gespeichert.
alter table public.profiles add column if not exists avatar text;

create or replace function public.my_profile_text() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('bio', bio, 'city', city, 'avatar', avatar) from public.profiles where user_id = auth.uid()
$$;

-- null oder leer = Bild entfernen; sonst nur kleine JPEG-Data-URLs
create or replace function public.set_my_avatar(p_avatar text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Bitte melde dich an.'; end if;
  if p_avatar is not null and p_avatar <> '' and (p_avatar !~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$' or length(p_avatar) > 80000) then
    raise exception 'Ungültiges Bild.';
  end if;
  update public.profiles set avatar = nullif(p_avatar, '') where user_id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;

-- Profilbilder zu Benutzernamen (öffentlich, wie der Name selbst)
create or replace function public.profile_avatar(p_username text) returns text
language sql stable security definer set search_path = public as $$
  select avatar from public.profiles where username = lower(p_username)
$$;

revoke all on function public.set_my_avatar(text) from public, anon;
revoke all on function public.profile_avatar(text) from public;
grant execute on function public.set_my_avatar(text) to authenticated;
grant execute on function public.profile_avatar(text) to anon, authenticated;
notify pgrst, 'reload schema';
