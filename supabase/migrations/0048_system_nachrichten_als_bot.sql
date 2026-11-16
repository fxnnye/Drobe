-- 0048: Nachrichten, die das System in den Chat schreibt (Angebot angenommen, verkauft, Erhalt bestätigt, Bewertung …),
-- werden als kind 'system' gespeichert und in der App als „JAWNZ Bot“ gekennzeichnet.
-- Im Supabase-Dashboard unter "SQL Editor" ausführen.

do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.message'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%' loop
    execute format('alter table public.message drop constraint %I', c);
  end loop;
end $$;
alter table public.message add constraint message_kind_check check (kind in ('request', 'text', 'system'));

create or replace function public.is_system_text(b text) returns boolean
language sql immutable as $$
  select b in ('Angebot zurückgezogen.', 'Angebot abgelehnt.', 'Die Reservierung wurde aufgehoben.')
      or b like 'Angebot angenommen.%' or b like 'Als verkauft markiert.%' or b like 'Erhalt bestätigt.%'
      or b like 'Bewertung abgegeben: %' or b like 'Verkauft. Das Teil ist jetzt im Kleiderschrank%'
$$;

-- Die Funktionen schreiben weiter 'text'. Der Trigger macht daraus 'system', außer die Nachricht kommt von einer Person (send_reply setzt das Merkmal).
create or replace function public.message_mark_system() returns trigger
language plpgsql as $$
begin
  if new.kind = 'text' and coalesce(current_setting('app.user_msg', true), '') <> '1' and public.is_system_text(new.body) then
    new.kind := 'system';
  end if;
  return new;
end $$;
drop trigger if exists message_mark_system on public.message;
create trigger message_mark_system before insert on public.message for each row execute function public.message_mark_system();

-- bestehende Systemnachrichten nachträglich kennzeichnen
update public.message set kind = 'system' where kind = 'text' and image_path is null and public.is_system_text(body);

create or replace function public.send_reply(p_interest uuid, p_body text, p_image text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); t public.thread; other uuid;
  txt text := left(trim(coalesce(p_body, '')), 500);
  img text := nullif(trim(coalesce(p_image, '')), '');
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  select * into t from public.thread where id = p_interest and me in (from_user, to_user);
  if not found then raise exception 'Unterhaltung nicht gefunden.'; end if;
  if txt = '' and img is null then raise exception 'Die Nachricht ist leer.'; end if;
  if img is not null and (img not like t.id::text || '/%' or img like '%..%' or char_length(img) > 120
      or not exists (select 1 from storage.objects o where o.bucket_id = 'chat' and o.name = img)) then
    raise exception 'Das Foto wurde nicht gefunden.';
  end if;
  other := case when t.from_user = me then t.to_user else t.from_user end;
  if exists (select 1 from public.blocks b where (b.blocker = me and b.blocked = other) or (b.blocker = other and b.blocked = me)) then
    raise exception 'Du kannst hier nicht antworten.';
  end if;
  if (select count(*) from public.message where sender = me and kind = 'text' and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Gerade zu viele Nachrichten. Versuch es später noch einmal.';
  end if;
  perform set_config('app.user_msg', '1', true);
  insert into public.message (thread_id, sender, kind, body, image_path) values (t.id, me, 'text', txt, img);
  return jsonb_build_object('ok', true);
end $$;


create or replace function public.thread_messages(p_interest uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.thread; res jsonb;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  select * into t from public.thread where id = p_interest and me in (from_user, to_user);
  if not found then raise exception 'Unterhaltung nicht gefunden.'; end if;
  update public.message set read_at = now() where thread_id = t.id and sender <> me and read_at is null;
  select coalesce(jsonb_agg(jsonb_build_object('mine', m.sender = me and m.kind <> 'system', 'system', m.kind = 'system', 'text', m.body, 'at', m.created_at, 'image', m.image_path) order by m.created_at), '[]'::jsonb)
    into res from public.message m where m.thread_id = t.id and not (m.kind = 'request' and m.body = '' and m.image_path is null);
  return res;
end $$;

revoke all on function public.send_reply(uuid, text, text), public.thread_messages(uuid) from public, anon;
grant execute on function public.send_reply(uuid, text, text), public.thread_messages(uuid) to authenticated;
notify pgrst, 'reload schema';
