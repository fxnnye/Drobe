-- 0044: Das Teil wechselt erst den Kleiderschrank, wenn der Käufer den Erhalt bestätigt. Bewerten geht erst danach.
-- Im Supabase-Dashboard unter "SQL Editor" ausführen.
--
--   mark_sold(item)          : Verkäufer markiert „verkauft“ (wie bisher), das Teil bleibt aber noch bei ihm
--   confirm_receipt(offer)   : Käufer bestätigt „erhalten, alles passt“. Erst dann
--                              - verschwindet das Teil beim Verkäufer und kommt in den Kleiderschrank des Käufers (Übergabe aus 0043, mit Verlauf)
--                              - können beide Seiten sich bewerten
--   thread_offer / leave_review: kennen jetzt „confirmed“

alter table public.offer add column if not exists confirmed_at timestamptz;
-- Bereits verkaufte Teile von früher gelten als bestätigt (sonst könnte niemand mehr bewerten); es gibt dazu keine Übergabe
update public.offer set confirmed_at = coalesce(decided_at, now())
 where status = 'accepted' and confirmed_at is null
   and exists (select 1 from public.listing l where l.id = offer.listing_id and l.status = 'sold');

create or replace function public.mark_sold(p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); l public.listing; o public.offer;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  select * into l from public.listing where item_id = p_item and user_id = me and status in ('active', 'reserved') for update;
  if not found then raise exception 'Dieses Teil ist nicht zum Verkauf.'; end if;
  update public.listing set status = 'sold', updated_at = now() where id = l.id;
  update public.offer set status = 'declined', decided_at = now() where listing_id = l.id and status = 'open';
  select * into o from public.offer where listing_id = l.id and status = 'accepted' order by decided_at desc nulls last limit 1;
  if o.id is not null then
    insert into public.message (thread_id, sender, kind, body)
    values (o.thread_id, me, 'text', 'Als verkauft markiert. Wenn alles passt, bestätigt der Käufer den Erhalt. Dann wechselt das Teil in seinen Kleiderschrank und ihr könnt euch bewerten.');
  end if;
  return jsonb_build_object('ok', true, 'transferred', false);
end $$;

create or replace function public.confirm_receipt(p_offer uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); o public.offer; l public.listing; it public.items; myname text; sellername text; hist jsonb; snap jsonb;
  ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  select * into o from public.offer where id = p_offer and from_user = me for update;
  if not found then raise exception 'Angebot nicht gefunden.'; end if;
  if o.status <> 'accepted' then raise exception 'Das Angebot wurde nicht angenommen.'; end if;
  if o.confirmed_at is not null then return jsonb_build_object('ok', true); end if;
  select * into l from public.listing where id = o.listing_id;
  if l.id is null or l.status <> 'sold' then raise exception 'Der Verkäufer hat das Teil noch nicht als verkauft markiert.'; end if;
  update public.offer set confirmed_at = now() where id = o.id;
  select * into it from public.items where user_id = o.to_user and id = l.item_id and not deleted;
  select username into sellername from public.profiles where user_id = o.to_user;
  if it.id is not null then
    hist := case when jsonb_typeof(it.data->'history') = 'array' then it.data->'history' else '[]'::jsonb end
            || jsonb_build_array(jsonb_build_object('user', sellername, 'at', ms));
    snap := jsonb_strip_nulls(jsonb_build_object(
      'name', it.data->'name', 'category', it.data->'category', 'brand', it.data->'brand', 'size', it.data->'size',
      'sku', it.data->'sku', 'cond', it.data->'cond', 'rarity', it.data->'rarity', 'color', it.data->'color', 'hex', it.data->'hex',
      'emb', it.data->'emb', 'history', hist));
    insert into public.item_transfer (item_id, from_user, to_user, offer_id, path, data)
    values (it.id, o.to_user, me, o.id, o.to_user::text || '/items-' || it.id, snap);
    update public.items set deleted = true, visibility = 'private', updated_at = now(),
           data = jsonb_build_object('deleted', true, 'updated', ms)
     where user_id = o.to_user and id = it.id;
  end if;
  select username into myname from public.profiles where user_id = me;
  insert into public.message (thread_id, sender, kind, body)
  values (o.thread_id, me, 'text', 'Erhalt bestätigt. Das Teil ist jetzt im Kleiderschrank von @' || coalesce(myname, 'dem Käufer') || '. Ihr könnt euch jetzt bewerten.');
  return jsonb_build_object('ok', true);
end $$;

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
  insert into public.message (thread_id, sender, kind, body) values (o.thread_id, me, 'text', 'Bewertung abgegeben: ' || repeat('★', p_rating));
  return jsonb_build_object('ok', true);
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
    'confirmed', o.confirmed_at is not null,
    'reviewed', exists (select 1 from public.review r where r.offer_id = o.id and r.reviewer = me));
end $$;

revoke all on function public.mark_sold(text), public.confirm_receipt(uuid), public.leave_review(uuid, int, text), public.thread_offer(uuid) from public, anon;
grant execute on function public.mark_sold(text), public.confirm_receipt(uuid), public.leave_review(uuid, int, text), public.thread_offer(uuid) to authenticated;

update public.schema_info set version = 41, note = 'Erhalt bestätigen vor Übergabe und Bewertung', updated_at = now() where true;
notify pgrst, 'reload schema';
