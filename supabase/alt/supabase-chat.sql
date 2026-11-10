-- Drobe: Antworten auf Nachrichten (Unterhaltungen).
-- Einmalig im Supabase-Dashboard unter "SQL Editor" ausführen (nach supabase-phase4.sql und supabase-phase5.sql).
--
-- Eine Unterhaltung gehört zu einer Interesse-/„Hab ich“-Nachricht (Tabelle interests). Antworten kann nur, wer
-- an dieser Nachricht beteiligt ist (Absender oder Empfänger) und nicht gesperrt wurde. Direkt auf die Tabelle
-- zugreifen kann niemand, alles läuft über die Funktionen unten.

create table if not exists public.replies (
  id          uuid primary key default gen_random_uuid(),
  interest_id uuid not null references public.interests(id) on delete cascade,
  from_user   uuid not null references auth.users(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 500),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists replies_interest_idx on public.replies (interest_id, created_at);

alter table public.replies enable row level security;
revoke all on public.replies from anon, authenticated;

-- Alle Unterhaltungen des Kontos (neueste zuerst, höchstens 100)
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
        'last_text', coalesce(lr.body, i.message),
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

-- Verlauf einer Unterhaltung; markiert alles Eingegangene als gelesen
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
    select x.created_at, jsonb_build_object('mine', x.from_user = me, 'text', x.body, 'at', x.created_at)
    from public.replies x where x.interest_id = i.id
  ) m;
  return res;
end $$;

-- Antwort senden
create or replace function public.send_reply(p_interest uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  i public.interests;
  other uuid;
  txt text := left(trim(coalesce(p_body, '')), 500);
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  if txt = '' then raise exception 'Die Nachricht ist leer.'; end if;
  select * into i from public.interests where id = p_interest and me in (from_user, to_user);
  if not found then raise exception 'Unterhaltung nicht gefunden.'; end if;
  other := case when i.from_user = me then i.to_user else i.from_user end;
  if exists (select 1 from public.blocks b where (b.blocker = me and b.blocked = other) or (b.blocker = other and b.blocked = me)) then
    raise exception 'Du kannst hier nicht antworten.';
  end if;
  if (select count(*) from public.replies where from_user = me and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Gerade zu viele Nachrichten. Versuch es später noch einmal.';
  end if;
  insert into public.replies (interest_id, from_user, body) values (i.id, me, txt);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.my_threads() from public, anon;
revoke all on function public.thread_messages(uuid) from public, anon;
revoke all on function public.send_reply(uuid, text) from public, anon;
grant execute on function public.my_threads() to authenticated;
grant execute on function public.thread_messages(uuid) to authenticated;
grant execute on function public.send_reply(uuid, text) to authenticated;

notify pgrst, 'reload schema';
