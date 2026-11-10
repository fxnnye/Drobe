-- Angebote und Nachrichten: thread (Gespräch), message (Nachricht), offer (Kaufangebot), offer_item (Teile im Angebot).
-- Ersetzt interests und replies. Die Gespräche behalten ihre IDs, die App-Funktionen liefern dasselbe Format wie vorher.
-- Die alten Tabellen interests und replies bleiben unbenutzt stehen und werden erst am Ende der Umstellung entfernt (nach Rückfrage).
-- Bezahlt wird direkt zwischen den Nutzern; hier steht nur, wer wem welches Teil zu welchem Preis angeboten hat und wie es ausging.
create table public.thread (
  id         uuid primary key default gen_random_uuid(),
  from_user  uuid not null references auth.users(id) on delete cascade,  -- wer das Gespräch begonnen hat
  to_user    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('interest', 'have', 'team')),  -- Anfrage zu einem Teil, „Hab ich“ zu einem Wunsch, Team-Nachricht
  item_id    text not null,                                               -- Teil oder Wunsch des Gegenübers, worum es geht
  ref_item   text,                                                        -- eigenes Teil, das beim „Hab ich“ angehängt wurde
  created_at timestamptz not null default now(),
  unique (from_user, to_user, kind, item_id)
);
create index thread_to_idx   on public.thread (to_user);
create index thread_from_idx on public.thread (from_user);

create table public.message (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.thread(id) on delete cascade,
  sender     uuid not null references auth.users(id) on delete cascade,
  kind       text not null default 'text' check (kind in ('request', 'text')),
  body       text not null default '',
  image_path text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index message_thread_idx on public.message (thread_id, created_at);
create unique index message_request_key on public.message (thread_id) where kind = 'request';

create table public.offer (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references public.thread(id) on delete cascade,
  listing_id   uuid references public.listing(id) on delete set null,
  from_user    uuid not null references auth.users(id) on delete cascade,  -- Käufer
  to_user      uuid not null references auth.users(id) on delete cascade,  -- Verkäufer
  amount_cents int  not null check (amount_cents between 0 and 10000000),
  currency     text not null default 'EUR' check (currency = 'EUR'),
  status       text not null default 'open' check (status in ('open', 'accepted', 'declined', 'withdrawn')),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz
);
create index offer_thread_idx on public.offer (thread_id);

create table public.offer_item (
  offer_id uuid not null references public.offer(id) on delete cascade,
  item_id  text not null references public.items(id) on delete cascade,
  primary key (offer_id, item_id)
);

alter table public.thread     enable row level security;
alter table public.message    enable row level security;
alter table public.offer      enable row level security;
alter table public.offer_item enable row level security;
revoke all on public.thread, public.message, public.offer, public.offer_item from anon, authenticated;
grant select on public.thread, public.message, public.offer, public.offer_item to authenticated;
create policy thread_own on public.thread for select to authenticated using (auth.uid() in (from_user, to_user));
create policy message_own on public.message for select to authenticated
  using (exists (select 1 from public.thread t where t.id = thread_id and auth.uid() in (t.from_user, t.to_user)));
create policy offer_own on public.offer for select to authenticated using (auth.uid() in (from_user, to_user));
create policy offer_item_own on public.offer_item for select to authenticated
  using (exists (select 1 from public.offer o where o.id = offer_id and auth.uid() in (o.from_user, o.to_user)));

-- Bestehende Anfragen und Antworten übernehmen
insert into public.thread (id, from_user, to_user, kind, item_id, ref_item, created_at)
select id, from_user, to_user, kind, record_id, ref_item, created_at from public.interests;

insert into public.message (thread_id, sender, kind, body, created_at, read_at)
select id, from_user, 'request', coalesce(message, ''), created_at, read_at from public.interests;

insert into public.message (id, thread_id, sender, kind, body, image_path, created_at, read_at)
select id, interest_id, from_user, 'text', body, image_path, created_at, read_at from public.replies;

-- Offene Kaufanfragen zu Teilen mit aktivem Angebot bekommen ein offer
insert into public.offer (thread_id, listing_id, from_user, to_user, amount_cents, created_at)
select t.id, l.id, t.from_user, t.to_user, l.price_cents, t.created_at
from public.thread t join public.listing l on l.item_id = t.item_id and l.user_id = t.to_user and l.status = 'active'
where t.kind = 'interest';
insert into public.offer_item (offer_id, item_id)
select o.id, l.item_id from public.offer o join public.listing l on l.id = o.listing_id;

-- Funktionen der App: gleiche Namen, gleiches Format, jetzt auf den neuen Tabellen
create or replace function public.send_interest(p_to text, p_kind text, p_record_id text, p_message text default null, p_ref_item text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); target public.profiles; ref_ok text; tid uuid; oid uuid; lst public.listing;
  msg text := nullif(left(trim(coalesce(p_message, '')), 200), '');
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  if p_kind not in ('interest', 'have') then raise exception 'Ungültige Anfrage.'; end if;
  select * into target from public.profiles where username = lower(p_to);
  if not found then raise exception 'Profil nicht gefunden.'; end if;
  if target.user_id = me then raise exception 'Das bist du selbst.'; end if;
  if exists (select 1 from public.blocks where blocker = me and blocked = target.user_id) then raise exception 'Du hast diese Person gesperrt.'; end if;
  if exists (select 1 from public.blocks where blocker = target.user_id and blocked = me) then raise exception 'Das ist gerade nicht möglich.'; end if;
  if p_kind = 'interest' then
    perform 1 from public.items where user_id = target.user_id and id = p_record_id and not deleted and vis in ('public', 'trade', 'sale');
  else
    perform 1 from public.wishlist where user_id = target.user_id and id = p_record_id and not deleted and vis = 'public';
  end if;
  if not found then raise exception 'Dieser Eintrag ist nicht mehr verfügbar.'; end if;
  if (select count(*) from public.message m join public.thread t on t.id = m.thread_id
      where t.from_user = me and m.kind = 'request' and m.created_at > now() - interval '1 day') >= 30 then
    raise exception 'Für heute ist das Limit erreicht.';
  end if;
  -- ein angehängtes Teil muss dem Absender gehören und öffentlich sein, sonst wird es ignoriert
  if p_ref_item is not null then
    select id into ref_ok from public.items where user_id = me and id = p_ref_item and not deleted and vis in ('public', 'trade', 'sale');
  end if;
  insert into public.thread (from_user, to_user, kind, item_id, ref_item) values (me, target.user_id, p_kind, p_record_id, ref_ok)
  on conflict (from_user, to_user, kind, item_id) do update set ref_item = excluded.ref_item, created_at = now()
  returning id into tid;
  update public.message set body = coalesce(msg, ''), created_at = now(), read_at = null where thread_id = tid and kind = 'request';
  if not found then insert into public.message (thread_id, sender, kind, body) values (tid, me, 'request', coalesce(msg, '')); end if;
  -- Kaufanfrage zu einem Teil mit aktivem Angebot: ein offenes offer zum Angebotspreis
  if p_kind = 'interest' then
    select * into lst from public.listing where item_id = p_record_id and user_id = target.user_id and status = 'active';
    if found then
      select id into oid from public.offer where thread_id = tid and listing_id = lst.id and status = 'open';
      if oid is null then
        insert into public.offer (thread_id, listing_id, from_user, to_user, amount_cents, currency)
        values (tid, lst.id, me, target.user_id, lst.price_cents, lst.currency) returning id into oid;
        insert into public.offer_item (offer_id, item_id) values (oid, p_record_id);
      else
        update public.offer set amount_cents = lst.price_cents where id = oid;
      end if;
    end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.my_interests() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'from', p.username, 'kind', t.kind, 'record_id', t.item_id,
    'record_name', case t.kind when 'interest' then (select it.name from public.items it where it.user_id = t.to_user and it.id = t.item_id)
                               else (select w.name from public.wishlist w where w.user_id = t.to_user and w.id = t.item_id) end,
    'ref_item', t.ref_item,
    'ref_name', (select it.name from public.items it where it.user_id = t.from_user and it.id = t.ref_item),
    'message', nullif(t.body, ''), 'created_at', t.req_at, 'unread', t.req_read is null
  ) order by t.req_at desc), '[]'::jsonb)
  from (
    select th.*, m.body, m.created_at as req_at, m.read_at as req_read
    from public.thread th join public.message m on m.thread_id = th.id and m.kind = 'request'
    where th.to_user = auth.uid() and th.from_user not in (select blocked from public.blocks where blocker = auth.uid())
    order by m.created_at desc limit 100
  ) t join public.profiles p on p.user_id = t.from_user
$$;

create or replace function public.my_threads() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.j order by x.last_at desc), '[]'::jsonb)
  from (
    select lm.created_at as last_at, jsonb_build_object(
      'id', t.id, 'other', p.username, 'mine', t.from_user = auth.uid(), 'kind', t.kind,
      'record_name', case t.kind when 'interest' then (select it.name from public.items it where it.user_id = t.to_user and it.id = t.item_id)
                                 else (select w.name from public.wishlist w where w.user_id = t.to_user and w.id = t.item_id) end,
      'record_id', t.item_id,
      'record_brand', case t.kind when 'interest' then (select it.brand from public.items it where it.user_id = t.to_user and it.id = t.item_id)
                                  else (select w.brand from public.wishlist w where w.user_id = t.to_user and w.id = t.item_id) end,
      'record_path', t.to_user::text || (case t.kind when 'interest' then '/items-' else '/wishlist-' end) || t.item_id,
      'ref_name', (select it.name from public.items it where it.user_id = t.from_user and it.id = t.ref_item),
      'last_text', coalesce(nullif(lm.body, ''), case when lm.image_path is not null then 'Foto' end),
      'last_mine', lm.sender = auth.uid(),
      'last_at', lm.created_at,
      'unread', exists (select 1 from public.message x where x.thread_id = t.id and x.sender <> auth.uid() and x.read_at is null)
    ) as j
    from public.thread t
    join public.profiles p on p.user_id = case when t.from_user = auth.uid() then t.to_user else t.from_user end
    join lateral (select * from public.message x where x.thread_id = t.id order by x.created_at desc limit 1) lm on true
    where auth.uid() in (t.from_user, t.to_user)
    order by lm.created_at desc limit 100
  ) x
$$;

create or replace function public.thread_messages(p_interest uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.thread; res jsonb;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  select * into t from public.thread where id = p_interest and me in (from_user, to_user);
  if not found then raise exception 'Unterhaltung nicht gefunden.'; end if;
  update public.message set read_at = now() where thread_id = t.id and sender <> me and read_at is null;
  select coalesce(jsonb_agg(jsonb_build_object('mine', m.sender = me, 'text', m.body, 'at', m.created_at, 'image', m.image_path) order by m.created_at), '[]'::jsonb)
    into res from public.message m where m.thread_id = t.id and not (m.kind = 'request' and m.body = '' and m.image_path is null);
  return res;
end $$;

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
  insert into public.message (thread_id, sender, kind, body, image_path) values (t.id, me, 'text', txt, img);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.mark_interests_read() returns void
language sql security definer set search_path = public as $$
  update public.message m set read_at = now() from public.thread t
  where t.id = m.thread_id and t.to_user = auth.uid() and m.kind = 'request' and m.read_at is null
$$;

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
    insert into public.message (thread_id, sender, kind, body) values (tid, me, 'request', 'Nachricht vom Drobe-Team');
  end if;
  insert into public.message (thread_id, sender, kind, body) values (tid, me, 'text', txt);
  insert into public.admin_log (admin_id, action, target, detail) values (me, 'nachricht', lower(p_username), left(txt, 300));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_thread(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare target uuid;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  select user_id into target from public.profiles where username = lower(p_username);
  if target is null then raise exception 'Profil nicht gefunden.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('from_member', r.sender = target, 'body', r.body, 'at', r.created_at) order by r.created_at)
    from (select x.* from public.message x join public.thread t on t.id = x.thread_id
          where t.kind = 'team' and t.to_user = target and x.kind = 'text' order by x.created_at desc limit 50) r
  ), '[]'::jsonb);
end $$;

create or replace function public.is_thread_object(obj_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.thread t
    where t.id::text = (storage.foldername(obj_name))[1] and auth.uid() in (t.from_user, t.to_user)
  )
$$;

-- Angebot beantworten: der Verkäufer nimmt an oder lehnt ab, der Käufer zieht zurück. Bei Annahme ist das Angebot reserviert.
create or replace function public.answer_offer(p_offer uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); o public.offer;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  if p_action not in ('accept', 'decline', 'withdraw') then raise exception 'Ungültige Aktion.'; end if;
  select * into o from public.offer where id = p_offer and me in (from_user, to_user) for update;
  if not found then raise exception 'Angebot nicht gefunden.'; end if;
  if o.status <> 'open' then raise exception 'Das Angebot ist nicht mehr offen.'; end if;
  if p_action = 'withdraw' then
    if me <> o.from_user then raise exception 'Nur der Käufer kann zurückziehen.'; end if;
    update public.offer set status = 'withdrawn', decided_at = now() where id = o.id;
  else
    if me <> o.to_user then raise exception 'Nur der Verkäufer kann antworten.'; end if;
    update public.offer set status = case p_action when 'accept' then 'accepted' else 'declined' end, decided_at = now() where id = o.id;
    if p_action = 'accept' then
      update public.listing set status = 'reserved', updated_at = now() where id = o.listing_id and status = 'active';
    end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.answer_offer(uuid, text) from public, anon;
grant execute on function public.answer_offer(uuid, text) to authenticated;

-- Ereignis „Anfrage“ für den Feed kommt jetzt vom neuen Gespräch
create or replace function public.event_from_thread() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'interest' and new.from_user <> new.to_user then
    insert into public.events (user_id, kind, owner_id, target_id) values (new.from_user, 'interest', new.to_user, new.item_id) on conflict do nothing;
  end if;
  return null;
end $$;
revoke all on function public.event_from_thread() from public, anon, authenticated;
drop trigger if exists events_interests on public.interests;
drop trigger if exists events_threads on public.thread;
create trigger events_threads after insert on public.thread for each row execute function public.event_from_thread();

-- Die tägliche Sicherung deckt die neuen Tabellen ab
create or replace function backup.snapshot() returns jsonb
language plpgsql security definer set search_path = public, backup as $$
declare
  t text;
  d int := extract(dow from now())::int;
  tn text;
  n bigint;
  counts jsonb := '{}'::jsonb;
begin
  foreach t in array array['items', 'outfits', 'outfit_items', 'wishlist', 'brands', 'profiles', 'follows', 'saves', 'outfit_saves',
                           'interests', 'replies', 'thread', 'message', 'offer', 'offer_item', 'reports', 'blocks', 'user_role',
                           'item_image', 'listing', 'events', 'feed_settings', 'categories', 'conditions', 'schema_info', 'records'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    tn := t || '_d' || d;
    execute format('drop table if exists backup.%I', tn);
    execute format('create table backup.%I as select * from public.%I', tn, t);
    execute format('alter table backup.%I enable row level security', tn);
    execute format('revoke all on backup.%I from public, anon, authenticated', tn);
    execute format('select count(*) from backup.%I', tn) into n;
    counts := counts || jsonb_build_object(t, n);
  end loop;
  insert into backup.log (taken_at, dow, counts) values (now(), d, counts)
  on conflict (taken_at) do nothing;
  delete from backup.log where taken_at < now() - interval '30 days';
  return counts;
end $$;
revoke all on function backup.snapshot() from public, anon, authenticated;

update public.schema_info set version = 28, note = 'Angebote und Nachrichten', updated_at = now();
notify pgrst, 'reload schema';
