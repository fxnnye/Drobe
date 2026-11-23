-- 0058: Bewertungen von 0 bis 5 Sterne (bisher 1 bis 5).
-- Im Supabase-Dashboard unter "SQL Editor" ausführen.

alter table public.review drop constraint if exists review_rating_check;
alter table public.review add constraint review_rating_check check (rating between 0 and 5);

create or replace function public.leave_review(p_offer uuid, p_rating int, p_comment text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); o public.offer; other uuid; ls text;
  txt text := left(trim(coalesce(p_comment, '')), 300);
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  if p_rating is null or p_rating < 0 or p_rating > 5 then raise exception 'Bitte wähle 0 bis 5 Sterne.'; end if;
  select * into o from public.offer where id = p_offer and me in (from_user, to_user);
  if not found then raise exception 'Angebot nicht gefunden.'; end if;
  if o.status <> 'accepted' then raise exception 'Bewerten geht erst nach einem angenommenen Angebot.'; end if;
  select status into ls from public.listing where id = o.listing_id;
  if ls is distinct from 'sold' then raise exception 'Bewerten geht erst, wenn der Verkauf abgeschlossen ist.'; end if;
  if o.confirmed_at is null then raise exception 'Bewerten geht erst, wenn der Käufer den Erhalt bestätigt hat.'; end if;
  other := case when o.from_user = me then o.to_user else o.from_user end;
  if exists (select 1 from public.blocks where (blocker = me and blocked = other) or (blocker = other and blocked = me)) then
    raise exception 'Das ist gerade nicht möglich.';
  end if;
  begin
    insert into public.review (offer_id, reviewer, reviewee, rating, comment) values (o.id, me, other, p_rating, txt);
  exception when unique_violation then
    raise exception 'Du hast diesen Kauf schon bewertet.';
  end;
  insert into public.message (thread_id, sender, kind, body) values (o.thread_id, me, 'text', 'Bewertung abgegeben: ' || case when p_rating = 0 then '0 Sterne' else repeat('★', p_rating) end);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.leave_review(uuid, int, text) from public, anon;
grant execute on function public.leave_review(uuid, int, text) to authenticated;
notify pgrst, 'reload schema';
