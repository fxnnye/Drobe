-- 0038: Konten endgültig löschen über die Verwaltungsseite (admin.html).
-- Im Supabase-Dashboard unter "SQL Editor" ausführen.
--
-- Ablauf in admin.html: erst werden die Fotos des Kontos gelöscht (Speicher lässt Löschen nur über die Storage-API zu,
-- dafür bekommen Admins unten Lese- und Löschrecht im Bucket "images"), dann das Konto selbst.
-- Beim Löschen gehen Profil, Teile, Outfits, Nachrichten, Angebote, Meldungen, Folgen und Gemerktes mit (on delete cascade).
-- Fotos in Unterhaltungen (Bucket "chat") bleiben wie beim Löschen durch die Nutzer selbst als Reste liegen.
-- Admin-Konten, das eigene Konto und unbekannte Benutzernamen lassen sich nicht löschen.

create or replace function public.admin_member_id(p_username text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare t uuid;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  select user_id into t from public.profiles where username = lower(p_username);
  if t is null then raise exception 'Profil nicht gefunden.'; end if;
  return t;
end $$;

create or replace function public.admin_delete_account(p_username text, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare t uuid;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  select user_id into t from public.profiles where username = lower(p_username);
  if t is null then raise exception 'Profil nicht gefunden.'; end if;
  if t = auth.uid() or exists (select 1 from public.user_role where user_id = t and role = 'admin') then
    raise exception 'Ein Admin-Konto lässt sich nicht löschen.';
  end if;
  insert into public.admin_log (admin_id, action, target, detail)
  values (auth.uid(), 'konto gelöscht', lower(p_username), left(nullif(trim(coalesce(p_reason, '')), ''), 300));
  delete from auth.users where id = t;
  return jsonb_build_object('ok', true);
end $$;

drop policy if exists "Admins sehen alle Bilder" on storage.objects;
drop policy if exists "Admins löschen alle Bilder" on storage.objects;
create policy "Admins sehen alle Bilder" on storage.objects for select to authenticated using (bucket_id = 'images' and public.is_admin());
create policy "Admins löschen alle Bilder" on storage.objects for delete to authenticated using (bucket_id = 'images' and public.is_admin());

revoke all on function public.admin_member_id(text), public.admin_delete_account(text, text) from public, anon;
grant execute on function public.admin_member_id(text), public.admin_delete_account(text, text) to authenticated;
notify pgrst, 'reload schema';
