-- 0047: Kaufanfrage braucht ein Preisangebot des Käufers, höchstens 25 % unter dem Verkaufspreis (und nicht darüber).
-- Im Supabase-Dashboard unter "SQL Editor" ausführen.

drop function if exists public.send_interest(text, text, text, text, text);

create or replace function public.send_interest(p_to text, p_kind text, p_record_id text, p_message text default null, p_ref_item text default null, p_amount numeric default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); target public.profiles; ref_ok text; tid uuid; oid uuid; lst public.listing; cents int;
  msg text := nullif(left(trim(coalesce(p_message, '')), 200), '');
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  if p_kind <> 'interest' then raise exception 'Ungültige Anfrage.'; end if;
  select * into target from public.profiles where username = lower(p_to);
  if not found then raise exception 'Profil nicht gefunden.'; end if;
  if target.user_id = me then raise exception 'Das bist du selbst.'; end if;
  if exists (select 1 from public.blocks where blocker = me and blocked = target.user_id) then raise exception 'Du hast diese Person gesperrt.'; end if;
  if exists (select 1 from public.blocks where blocker = target.user_id and blocked = me) then raise exception 'Das ist gerade nicht möglich.'; end if;
  perform 1 from public.items where user_id = target.user_id and id = p_record_id and not deleted and visibility = 'public';
  if not found then raise exception 'Dieser Eintrag ist nicht mehr verfügbar.'; end if;
  -- Teil im Verkauf: Angebot Pflicht, 75 % bis 100 % des Preises
  select * into lst from public.listing where item_id = p_record_id and user_id = target.user_id and status = 'active';
  if found then
    if p_amount is null then raise exception 'Bitte gib dein Angebot ein.'; end if;
    cents := round(p_amount * 100);
    if cents > lst.price_cents then raise exception 'Das Angebot darf nicht über dem Preis liegen.'; end if;
    if cents < ceil(lst.price_cents * 0.75) then
      raise exception 'Dein Angebot darf höchstens 25 %% unter dem Preis liegen (mindestens % €).', to_char(ceil(lst.price_cents * 0.75) / 100.0, 'FM999990.00');
    end if;
  end if;
  if (select count(*) from public.message m join public.thread t on t.id = m.thread_id
      where t.from_user = me and m.kind = 'request' and m.created_at > now() - interval '1 day') >= 30 then
    raise exception 'Für heute ist das Limit erreicht.';
  end if;
  if p_ref_item is not null then
    select id into ref_ok from public.items where user_id = me and id = p_ref_item and not deleted and visibility = 'public';
  end if;
  insert into public.thread (from_user, to_user, kind, item_id, ref_item)
  values (me, target.user_id, p_kind, p_record_id, ref_ok)
  on conflict (from_user, to_user, kind, item_id) do update set ref_item = excluded.ref_item, created_at = now()
  returning id into tid;
  update public.message set body = coalesce(msg, ''), created_at = now(), read_at = null where thread_id = tid and kind = 'request';
  if not found then
    insert into public.message (thread_id, sender, kind, body) values (tid, me, 'request', coalesce(msg, ''));
  end if;
  if lst.id is not null then
    select id into oid from public.offer where thread_id = tid and listing_id = lst.id and status = 'open';
    if oid is null then
      insert into public.offer (thread_id, listing_id, from_user, to_user, amount_cents, currency)
      values (tid, lst.id, me, target.user_id, cents, lst.currency) returning id into oid;
      insert into public.offer_item (offer_id, item_id) values (oid, p_record_id);
    else
      update public.offer set amount_cents = cents where id = oid;
    end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.send_interest(text, text, text, text, text, numeric) from public, anon;
grant execute on function public.send_interest(text, text, text, text, text, numeric) to authenticated;
notify pgrst, 'reload schema';
