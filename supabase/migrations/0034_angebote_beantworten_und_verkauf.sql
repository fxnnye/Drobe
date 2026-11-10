-- Angebote beantworten und Verkauf abschließen.
--   thread_offer(thread)    : das aktuelle Angebot einer Unterhaltung (für die Karte in der App)
--   answer_offer(...)       : wie bisher, schreibt zusätzlich eine kurze Nachricht in die Unterhaltung, damit die andere Seite es sieht
--   mark_sold(item)         : Verkäufer setzt sein Angebot auf „verkauft“, offene Anfragen dazu werden abgelehnt
--   release_listing(item)   : Verkäufer hebt die Reservierung auf, das Teil ist wieder zu haben
-- Bezahlt wird weiter direkt zwischen den Nutzern, hier läuft kein Geld.

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
    'buyer', o.from_user = me, 'seller', o.to_user = me, 'item_id', t.item_id, 'listing', ls);
end $$;

create or replace function public.answer_offer(p_offer uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); o public.offer; msg text;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  if p_action not in ('accept', 'decline', 'withdraw') then raise exception 'Ungültige Aktion.'; end if;
  select * into o from public.offer where id = p_offer and me in (from_user, to_user) for update;
  if not found then raise exception 'Angebot nicht gefunden.'; end if;
  if o.status <> 'open' then raise exception 'Das Angebot ist nicht mehr offen.'; end if;
  if p_action = 'withdraw' then
    if me <> o.from_user then raise exception 'Nur der Käufer kann zurückziehen.'; end if;
    update public.offer set status = 'withdrawn', decided_at = now() where id = o.id;
    msg := 'Angebot zurückgezogen.';
  else
    if me <> o.to_user then raise exception 'Nur der Verkäufer kann antworten.'; end if;
    update public.offer set status = case p_action when 'accept' then 'accepted' else 'declined' end, decided_at = now() where id = o.id;
    if p_action = 'accept' then
      update public.listing set status = 'reserved', updated_at = now() where id = o.listing_id and status = 'active';
      msg := 'Angebot angenommen. Die Bezahlung läuft direkt zwischen euch.';
    else
      msg := 'Angebot abgelehnt.';
    end if;
  end if;
  insert into public.message (thread_id, sender, kind, body) values (o.thread_id, me, 'text', msg);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.mark_sold(p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); l public.listing;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  select * into l from public.listing where item_id = p_item and user_id = me and status in ('active', 'reserved') for update;
  if not found then raise exception 'Dieses Teil ist nicht zum Verkauf.'; end if;
  update public.listing set status = 'sold', updated_at = now() where id = l.id;
  update public.offer set status = 'declined', decided_at = now() where listing_id = l.id and status = 'open';
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.release_listing(p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); l public.listing;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  select * into l from public.listing where item_id = p_item and user_id = me and status = 'reserved' for update;
  if not found then raise exception 'Dieses Teil ist nicht reserviert.'; end if;
  update public.listing set status = 'active', updated_at = now() where id = l.id;
  with u as (update public.offer set status = 'withdrawn', decided_at = now() where listing_id = l.id and status = 'accepted' returning thread_id)
  insert into public.message (thread_id, sender, kind, body) select thread_id, me, 'text', 'Die Reservierung wurde aufgehoben.' from u;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.thread_offer(uuid), public.answer_offer(uuid, text), public.mark_sold(text), public.release_listing(text) from public, anon;
grant execute on function public.thread_offer(uuid), public.answer_offer(uuid, text), public.mark_sold(text), public.release_listing(text) to authenticated;

update public.schema_info set version = 34, note = 'Angebote beantworten, Verkauf abschließen', updated_at = now();
notify pgrst, 'reload schema';
