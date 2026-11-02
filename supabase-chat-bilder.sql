-- Drobe: Fotos in Unterhaltungen.
-- Einmalig im Supabase-Dashboard unter "SQL Editor" ausführen (nach supabase-chat.sql).
--
-- Fotos liegen in einem eigenen privaten Speicher ("chat"), je Unterhaltung ein Ordner. Hoch- und herunterladen
-- dürfen nur die beiden Beteiligten der Unterhaltung. Erlaubt sind nur JPEG-Dateien bis 3 MB.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', false, 3145728, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg'];

alter table public.replies add column if not exists image_path text;
alter table public.replies drop constraint if exists replies_body_check;
alter table public.replies add constraint replies_body_check
  check (char_length(body) <= 500 and (body <> '' or image_path is not null));

-- Gehört die Datei zu einer Unterhaltung des angemeldeten Kontos?
create or replace function public.is_thread_object(obj_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.interests i
    where i.id::text = (storage.foldername(obj_name))[1] and auth.uid() in (i.from_user, i.to_user)
  )
$$;

drop policy if exists "Chat-Fotos hochladen" on storage.objects;
drop policy if exists "Chat-Fotos lesen" on storage.objects;
create policy "Chat-Fotos hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and public.is_thread_object(name));
create policy "Chat-Fotos lesen" on storage.objects for select to authenticated
  using (bucket_id = 'chat' and public.is_thread_object(name));

-- Übersicht: bei reinen Foto-Nachrichten steht „Foto“
create or replace function public.my_threads() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(t.j order by t.last_at desc), '[]'::jsonb) from (
    select
      greatest(i.created_at, coalesce(lr.created_at, i.created_at)) as last_at,
      jsonb_build_object(
        'id', i.id,
        'other', p.username,
        'mine', i.from_user = auth.uid(),
        'kind', i.kind,
        'record_name', r.data->>'name',
        'ref_name', ri.data->>'name',
        'last_text', coalesce(nullif(lr.body, ''), case when lr.image_path is not null then 'Foto' end, i.message),
        'last_mine', case when lr.id is not null then lr.from_user = auth.uid() else i.from_user = auth.uid() end,
        'last_at', greatest(i.created_at, coalesce(lr.created_at, i.created_at)),
        'unread', (i.to_user = auth.uid() and i.read_at is null)
                  or exists (select 1 from public.replies x where x.interest_id = i.id and x.from_user <> auth.uid() and x.read_at is null)
      ) as j
    from public.interests i
    join public.profiles p on p.user_id = case when i.from_user = auth.uid() then i.to_user else i.from_user end
    left join public.records r on r.user_id = i.to_user and r.id = i.record_id
          and r.kind = case i.kind when 'interest' then 'items' else 'wishlist' end
    left join public.records ri on ri.user_id = i.from_user and ri.id = i.ref_item and ri.kind = 'items'
    left join lateral (
      select * from public.replies x where x.interest_id = i.id order by x.created_at desc limit 1
    ) lr on true
    where auth.uid() in (i.from_user, i.to_user)
    order by greatest(i.created_at, coalesce(lr.created_at, i.created_at)) desc
    limit 100
  ) t
$$;

create or replace function public.thread_messages(p_interest uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  i public.interests;
  res jsonb;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  select * into i from public.interests where id = p_interest and me in (from_user, to_user);
  if not found then raise exception 'Unterhaltung nicht gefunden.'; end if;

  update public.replies set read_at = now() where interest_id = i.id and from_user <> me and read_at is null;
  if i.to_user = me and i.read_at is null then
    update public.interests set read_at = now() where id = i.id;
  end if;

  select coalesce(jsonb_agg(m.j order by m.at), '[]'::jsonb) into res from (
    select i.created_at as at, jsonb_build_object('mine', i.from_user = me, 'text', i.message, 'at', i.created_at) as j
    where i.message is not null
    union all
    select x.created_at, jsonb_build_object('mine', x.from_user = me, 'text', x.body, 'at', x.created_at, 'image', x.image_path)
    from public.replies x where x.interest_id = i.id
  ) m;
  return res;
end $$;

-- Antwort senden, optional mit Foto (Pfad muss im Ordner dieser Unterhaltung liegen)
drop function if exists public.send_reply(uuid, text);
create or replace function public.send_reply(p_interest uuid, p_body text, p_image text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  i public.interests;
  other uuid;
  txt text := left(trim(coalesce(p_body, '')), 500);
  img text := nullif(trim(coalesce(p_image, '')), '');
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  select * into i from public.interests where id = p_interest and me in (from_user, to_user);
  if not found then raise exception 'Unterhaltung nicht gefunden.'; end if;
  if txt = '' and img is null then raise exception 'Die Nachricht ist leer.'; end if;
  if img is not null and (img not like i.id::text || '/%' or img like '%..%' or char_length(img) > 120
       or not exists (select 1 from storage.objects o where o.bucket_id = 'chat' and o.name = img)) then
    raise exception 'Das Foto wurde nicht gefunden.';
  end if;
  other := case when i.from_user = me then i.to_user else i.from_user end;
  if exists (select 1 from public.blocks b where (b.blocker = me and b.blocked = other) or (b.blocker = other and b.blocked = me)) then
    raise exception 'Du kannst hier nicht antworten.';
  end if;
  if (select count(*) from public.replies where from_user = me and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Gerade zu viele Nachrichten. Versuch es später noch einmal.';
  end if;
  insert into public.replies (interest_id, from_user, body, image_path) values (i.id, me, txt, img);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.send_reply(uuid, text, text) from public, anon;
grant execute on function public.send_reply(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
