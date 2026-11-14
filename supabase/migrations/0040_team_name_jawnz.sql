-- 0040: Nachrichten aus der Verwaltung heißen jetzt „JAWNZ“ statt „Drobe-Team“.
-- Im Supabase-Dashboard unter "SQL Editor" ausführen. Die Schemaversion bleibt bei 39 (nur ein Text ändert sich).

-- Bestehende Unterhaltungen: Starttext umbenennen
update public.message set body = 'Nachricht von JAWNZ' where kind = 'request' and body = 'Nachricht vom Drobe-Team';

-- Neue Unterhaltungen: gleicher Text (Funktion sonst unverändert gegenüber 0028)
create or replace function public.admin_send_message(p_username text, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); target uuid; txt text := left(trim(coalesce(p_text, '')), 500); tid uuid;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  if txt = '' then raise exception 'Die Nachricht ist leer.'; end if;
  select user_id into target from public.profiles where username = lower(p_username);
  if target is null then raise exception 'Profil nicht gefunden.'; end if;
  if target = me then raise exception 'Das bist du selbst.'; end if;
  select id into tid from public.thread where from_user = me and to_user = target and kind = 'team' and item_id = 'team';
  if tid is null then
    insert into public.thread (from_user, to_user, kind, item_id) values (me, target, 'team', 'team') returning id into tid;
    insert into public.message (thread_id, sender, kind, body) values (tid, me, 'request', 'Nachricht von JAWNZ');
  end if;
  insert into public.message (thread_id, sender, kind, body) values (tid, me, 'text', txt);
  insert into public.admin_log (admin_id, action, target, detail) values (me, 'nachricht', lower(p_username), left(txt, 300));
  return jsonb_build_object('ok', true);
end $$;
