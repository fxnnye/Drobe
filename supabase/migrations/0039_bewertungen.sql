-- 0039: Bewertungen nach einem erfolgreichen Kauf.
-- Im Supabase-Dashboard unter "SQL Editor" ausführen.
--
-- Ein Kauf gilt als erfolgreich, wenn das Angebot angenommen wurde und der Verkäufer das Teil als „verkauft“ markiert hat.
-- Danach kann jede Seite die andere einmal bewerten (1 bis 5 Sterne, optional ein kurzer Text bis 300 Zeichen).
--   leave_review(offer, rating, comment) : Bewertung abgeben (nur Beteiligte, nur einmal pro Angebot und Person)
--   user_reviews(username)               : Durchschnitt, Anzahl und die letzten Bewertungen eines Profils (auch für Besucher)
--   thread_offer(thread)                 : liefert zusätzlich „reviewed“, ob man das Angebot schon bewertet hat
-- Die Tabelle ist für Nutzer gesperrt, alles läuft über diese Funktionen. Bewertungen verschwinden mit dem Konto.

create table if not exists public.review (
  id         uuid primary key default gen_random_uuid(),
  offer_id   uuid not null references public.offer(id) on delete cascade,
  reviewer   uuid not null references auth.users(id) on delete cascade,
  reviewee   uuid not null references auth.users(id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  comment    text not null default '' check (char_length(comment) <= 300),
  created_at timestamptz not null default now(),
  unique (offer_id, reviewer),
  check (reviewer <> reviewee)
);
create index if not exists review_reviewee_idx on public.review (reviewee, created_at desc);
alter table public.review enable row level security;
revoke all on public.review from anon, authenticated;

create or replace function public.leave_review(p_offer uuid, p_rating int, p_comment text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); o public.offer; other uuid; ls text;
  txt text := left(trim(coalesce(p_comment, '')), 300);
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Bitte wähle 1 bis 5 Sterne.'; end if;
  select * into o from public.offer where id = p_offer and me in (from_user, to_user);
  if not found then raise exception 'Angebot nicht gefunden.'; end if;
  if o.status <> 'accepted' then raise exception 'Bewerten geht erst nach einem angenommenen Angebot.'; end if;
  select status into ls from public.listing where id = o.listing_id;
  if ls is distinct from 'sold' then raise exception 'Bewerten geht erst, wenn der Verkauf abgeschlossen ist.'; end if;
  other := case when o.from_user = me then o.to_user else o.from_user end;
  if exists (select 1 from public.blocks where (blocker = me and blocked = other) or (blocker = other and blocked = me)) then
    raise exception 'Das ist gerade nicht möglich.';
  end if;
  begin
    insert into public.review (offer_id, reviewer, reviewee, rating, comment) values (o.id, me, other, p_rating, txt);
  exception when unique_violation then
    raise exception 'Du hast diesen Kauf schon bewertet.';
  end;
  insert into public.message (thread_id, sender, kind, body) values (o.thread_id, me, 'text', 'Bewertung abgegeben: ' || repeat('★', p_rating));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.user_reviews(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid; res jsonb;
begin
  select user_id into uid from public.profiles where username = lower(p_username);
  if uid is null then return null; end if;
  select jsonb_build_object(
    'count', count(*),
    'avg', coalesce(round(avg(rating)::numeric, 1), 0),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('rating', x.rating, 'comment', x.comment, 'from', p.username, 'at', x.created_at) order by x.created_at desc)
      from (select * from public.review where reviewee = uid order by created_at desc limit 50) x
      join public.profiles p on p.user_id = x.reviewer
    ), '[]'::jsonb)
  ) into res from public.review where reviewee = uid;
  return res;
end $$;

create or replace function public.thread_offer(p_thread uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.thread; o public.offer; ls text;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  select * into t from public.thread where id = p_thread and me in (from_user, to_user);
  if not found then raise exception 'Unterhaltung nicht gefunden.'; end if;
  select * into o from public.offer where thread_id = t.id order by created_at desc limit 1;
  if not found then return null; end if;
  select status into ls from public.listing where id = o.listing_id;
  return jsonb_build_object('id', o.id, 'status', o.status, 'amount', round(o.amount_cents / 100.0, 2),
    'buyer', o.from_user = me, 'seller', o.to_user = me, 'item_id', t.item_id, 'listing', ls,
    'reviewed', exists (select 1 from public.review r where r.offer_id = o.id and r.reviewer = me));
end $$;

revoke all on function public.leave_review(uuid, int, text), public.user_reviews(text) from public, anon, authenticated;
grant execute on function public.leave_review(uuid, int, text) to authenticated;
grant execute on function public.user_reviews(text) to anon, authenticated;

update public.schema_info set version = 39, note = 'Bewertungen nach erfolgreichem Kauf', updated_at = now() where true;
notify pgrst, 'reload schema';
