-- 0053: Verwaltungsseite (admin.html) erweitert: Legit-Check, Verkäufe und Bestellungen, Bewertungen,
-- versteckte Inhalte und gesperrte Konten, Flex of the Week, Rollen, mehr Kennzahlen.
-- Im Supabase-Dashboard unter "SQL Editor" ausführen. Die Schemaversion bleibt unverändert (nur neue und erweiterte Funktionen).
--
-- Jede Änderung, die hier möglich ist, steht mit Grund im Verwaltungsprotokoll (admin_log). Alle Funktionen prüfen is_admin().

-- ---------- Hilfsfunktion: Name eines Teils ----------
create or replace function public.admin_item_name(p_user uuid, p_id text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(i.name, ''), nullif(i.data->>'name', ''), 'Teil') from public.items i where i.user_id = p_user and i.id = p_id
$$;

-- ---------- 1. Legit-Check ----------
-- „Ist echt“ aus der Meldung: jetzt mit Protokolleintrag
create or replace function public.admin_legit_clear(p_report uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.reports; uname text;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  select * into r from public.reports where id = p_report;
  if not found or r.record_id is null then raise exception 'Meldung nicht gefunden.'; end if;
  update public.items set legit_status = 'cleared', updated_at = now() where user_id = r.target_user and id = r.record_id;
  update public.reports set resolved_at = now(), outcome = 'dismissed'
   where target_user = r.target_user and record_id = r.record_id and resolved_at is null;
  select username into uname from public.profiles where user_id = r.target_user;
  insert into public.admin_log (admin_id, action, target, detail)
  values (auth.uid(), 'legit echt', uname, left(public.admin_item_name(r.target_user, r.record_id) || ' (' || r.record_id || ')', 300));
  return jsonb_build_object('ok', true);
end $$;

-- „Ist echt“ direkt aus der Legit-Check-Liste (ohne Meldung)
create or replace function public.admin_legit_clear_item(p_username text, p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  select user_id into t from public.profiles where username = lower(p_username);
  if t is null then raise exception 'Profil nicht gefunden.'; end if;
  update public.items set legit_status = 'cleared', updated_at = now() where user_id = t and id = p_id and not deleted;
  if not found then raise exception 'Teil nicht gefunden.'; end if;
  update public.reports set resolved_at = now(), outcome = 'dismissed' where target_user = t and record_id = p_id and resolved_at is null;
  insert into public.admin_log (admin_id, action, target, detail)
  values (auth.uid(), 'legit echt', lower(p_username), left(public.admin_item_name(t, p_id) || ' (' || p_id || ')', 300));
  return jsonb_build_object('ok', true);
end $$;

-- Liste: eingefrorene Teile und Teile mit auffällig vielen Fake-Stimmen (ab 3, noch nicht eingefroren oder bestätigt)
create or replace function public.admin_legit_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  return coalesce((
    select jsonb_agg(x.j order by x.frozen desc, x.fake desc, x.ts desc) from (
      select (i.legit_status = 'frozen') as frozen, v.n_fake as fake, i.updated_at as ts, jsonb_build_object(
        'username', p.username, 'id', i.id, 'name', coalesce(nullif(i.name, ''), nullif(i.data->>'name', ''), 'Teil'), 'brand', i.brand,
        'status', i.legit_status, 'real', v.n_real, 'fake', v.n_fake, 'since', i.updated_at,
        'deleted', i.deleted) as j
      from public.items i
      join public.profiles p on p.user_id = i.user_id
      join (select owner, item_id,
                   count(*) filter (where verdict = 'real') as n_real, count(*) filter (where verdict = 'fake') as n_fake
              from public.legit_vote group by owner, item_id) v on v.owner = i.user_id and v.item_id = i.id
      where not i.deleted and (i.legit_status = 'frozen' or (i.legit_status is null and v.n_fake >= 3))
      limit 200
    ) x
  ), '[]'::jsonb);
end $$;

-- Stimmen zu einem Teil: wer, wie, und ob das Konto auffällt (frisch, oder stimmt fast nur „fake“ ab)
create or replace function public.admin_legit_votes(p_username text, p_id text) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare t uuid;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  select user_id into t from public.profiles where username = lower(p_username);
  if t is null then raise exception 'Profil nicht gefunden.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'voter', pv.username, 'verdict', v.verdict, 'at', v.created_at,
      'voter_since', u.created_at,
      'voter_votes', s.total, 'voter_fake', s.fake,
      'fresh', u.created_at > now() - interval '7 days',
      'only_fake', s.total >= 3 and s.fake = s.total,
      'banned', pv.banned_at is not null
    ) order by v.created_at)
    from public.legit_vote v
    join auth.users u on u.id = v.voter
    left join public.profiles pv on pv.user_id = v.voter
    join lateral (select count(*) as total, count(*) filter (where x.verdict = 'fake') as fake from public.legit_vote x where x.voter = v.voter) s on true
    where v.owner = t and v.item_id = p_id
  ), '[]'::jsonb);
end $$;

-- „Ist fake“: Teil entfernen, Meldungen schließen, dem Besitzer eine Nachricht schicken, ins Protokoll – in einem Schritt
create or replace function public.admin_legit_fake(p_username text, p_id text, p_message text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t uuid; nm text; txt text := left(nullif(trim(coalesce(p_message, '')), ''), 500);
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  select user_id into t from public.profiles where username = lower(p_username);
  if t is null then raise exception 'Profil nicht gefunden.'; end if;
  if t = auth.uid() then raise exception 'Das ist dein eigenes Konto.'; end if;
  nm := public.admin_item_name(t, p_id);
  update public.items set deleted = true, updated_at = now(), data = data || '{"deleted": true}'::jsonb where user_id = t and id = p_id and not deleted;
  if not found then raise exception 'Teil nicht gefunden.'; end if;
  update public.reports set resolved_at = now(), outcome = 'done' where target_user = t and record_id = p_id and resolved_at is null;
  perform public.admin_send_message(p_username,
    coalesce(txt, 'Dein Teil „' || left(nm, 60) || '“ wurde vom Team entfernt, weil es sich nach der Prüfung nicht als echt bestätigt hat. Bei Fragen antworte einfach hier.'));
  insert into public.admin_log (admin_id, action, target, detail)
  values (auth.uid(), 'legit fake', lower(p_username), left(nm || ' (' || p_id || ') entfernt', 300));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- 2. Verkäufe und Bestellungen ----------
-- Anzeigen mit Status (p_status: active, reserved, sold oder leer für alle)
create or replace function public.admin_listings(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'seller', p.username, 'item_id', l.item_id, 'name', coalesce(nullif(i.name, ''), nullif(i.data->>'name', ''), 'Teil'), 'brand', i.brand,
      'price', round(l.price_cents / 100.0, 2), 'status', l.status, 'since', l.created_at, 'updated', l.updated_at,
      'frozen', i.legit_status = 'frozen'
    ) order by l.updated_at desc)
    from (select * from public.listing where p_status is null or p_status = '' or status = p_status order by updated_at desc limit 200) l
    join public.profiles p on p.user_id = l.user_id
    left join public.items i on i.user_id = l.user_id and i.id = l.item_id
  ), '[]'::jsonb);
end $$;

-- Angebote und Bestellungen: Käufer, Verkäufer, Betrag, Stand. „stuck_days“: verkauft, Erhalt seit so vielen Tagen nicht bestätigt.
create or replace function public.admin_orders() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'thread', o.thread_id, 'buyer', pb.username, 'seller', ps.username,
      'amount', round(o.amount_cents / 100.0, 2), 'offer_status', o.status, 'listing_status', l.status,
      'created_at', o.created_at, 'decided_at', o.decided_at, 'confirmed_at', o.confirmed_at,
      'items', coalesce((select string_agg(coalesce(nullif(i.name, ''), nullif(i.data->>'name', ''), 'Teil'), ', ')
                           from public.offer_item oi join public.items i on i.id = oi.item_id and i.user_id = o.to_user where oi.offer_id = o.id), 'Teil'),
      'reviews', (select count(*) from public.review r where r.offer_id = o.id),
      'transfer', (select t.status from public.item_transfer t where t.offer_id = o.id order by t.created_at desc limit 1),
      'stuck_days', case when o.status = 'accepted' and l.status = 'sold' and o.confirmed_at is null
                         then floor(extract(epoch from now() - l.updated_at) / 86400)::int end
    ) order by o.created_at desc)
    from (select * from public.offer where status in ('open', 'accepted') order by created_at desc limit 200) o
    join public.profiles pb on pb.user_id = o.from_user
    join public.profiles ps on ps.user_id = o.to_user
    left join public.listing l on l.id = o.listing_id
  ), '[]'::jsonb);
end $$;

-- Übergaben, die noch offen sind (Teil wartet auf Abholung ins Konto des Käufers)
create or replace function public.admin_open_transfers() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', coalesce(t.data->>'name', 'Teil'), 'from', pf.username, 'to', pt.username,
      'created_at', t.created_at, 'days', floor(extract(epoch from now() - t.created_at) / 86400)::int
    ) order by t.created_at)
    from public.item_transfer t
    left join public.profiles pf on pf.user_id = t.from_user
    left join public.profiles pt on pt.user_id = t.to_user
    where t.status = 'pending'
  ), '[]'::jsonb);
end $$;

-- Chat zu einer Bestellung (Lesen wird im Protokoll festgehalten)
create or replace function public.admin_order_chat(p_offer uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.offer; pb text; ps text;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  select * into o from public.offer where id = p_offer;
  if not found then raise exception 'Angebot nicht gefunden.'; end if;
  select username into pb from public.profiles where user_id = o.from_user;
  select username into ps from public.profiles where user_id = o.to_user;
  insert into public.admin_log (admin_id, action, target, detail)
  values (auth.uid(), 'chat gelesen', ps, 'Bestellung von ' || coalesce(pb, '?') || ' (' || left(o.id::text, 8) || ')');
  return coalesce((
    select jsonb_agg(jsonb_build_object('sender', sp.username, 'body', m.body, 'system', m.kind = 'system', 'photo', m.image_path is not null, 'at', m.created_at) order by m.created_at)
    from public.message m left join public.profiles sp on sp.user_id = m.sender where m.thread_id = o.thread_id
  ), '[]'::jsonb);
end $$;

-- Erhalt erzwingen: wie „Erhalt bestätigt“ des Käufers (Teil geht in seinen Kleiderschrank), mit Grund im Protokoll
create or replace function public.admin_force_receipt(p_offer uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o public.offer; l public.listing; it public.items; buyer text; sellername text; hist jsonb; snap jsonb;
  ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  select * into o from public.offer where id = p_offer for update;
  if not found then raise exception 'Angebot nicht gefunden.'; end if;
  if o.status <> 'accepted' then raise exception 'Das Angebot wurde nicht angenommen.'; end if;
  if o.confirmed_at is not null then raise exception 'Der Erhalt ist schon bestätigt.'; end if;
  select * into l from public.listing where id = o.listing_id;
  if l.id is null or l.status <> 'sold' then raise exception 'Der Verkäufer hat das Teil noch nicht als verkauft markiert.'; end if;
  update public.offer set confirmed_at = now() where id = o.id;
  select * into it from public.items where user_id = o.to_user and id = l.item_id and not deleted;
  select username into sellername from public.profiles where user_id = o.to_user;
  select username into buyer from public.profiles where user_id = o.from_user;
  if it.id is not null then
    hist := case when jsonb_typeof(it.data->'history') = 'array' then it.data->'history' else '[]'::jsonb end
            || jsonb_build_array(jsonb_build_object('user', sellername, 'at', ms));
    snap := jsonb_strip_nulls(jsonb_build_object(
      'name', it.data->'name', 'category', it.data->'category', 'brand', it.data->'brand', 'size', it.data->'size',
      'sku', it.data->'sku', 'cond', it.data->'cond', 'rarity', it.data->'rarity', 'color', it.data->'color', 'hex', it.data->'hex',
      'emb', it.data->'emb', 'history', hist));
    insert into public.item_transfer (item_id, from_user, to_user, offer_id, path, data)
    values (it.id, o.to_user, o.from_user, o.id, o.to_user::text || '/items-' || it.id, snap);
    update public.items set deleted = true, visibility = 'private', updated_at = now(),
           data = jsonb_build_object('deleted', true, 'updated', ms)
     where user_id = o.to_user and id = it.id;
  end if;
  insert into public.message (thread_id, sender, kind, body)
  values (o.thread_id, o.from_user, 'text', 'Erhalt bestätigt. Das Team hat den Erhalt bestätigt. Das Teil ist jetzt im Kleiderschrank von @' || coalesce(buyer, 'dem Käufer') || '. Ihr könnt euch jetzt bewerten.');
  insert into public.admin_log (admin_id, action, target, detail)
  values (auth.uid(), 'erhalt erzwungen', sellername, left('Käufer ' || coalesce(buyer, '?') || ', Bestellung ' || left(o.id::text, 8) || coalesce(' · ' || nullif(trim(p_reason), ''), ''), 300));
  return jsonb_build_object('ok', true);
end $$;

-- Verkauf rückgängig machen (nur solange der Käufer den Erhalt nicht bestätigt hat, also noch nichts übergeben wurde)
create or replace function public.admin_undo_sale(p_offer uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.offer; l public.listing; buyer text; sellername text;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  select * into o from public.offer where id = p_offer for update;
  if not found then raise exception 'Angebot nicht gefunden.'; end if;
  if o.status <> 'accepted' then raise exception 'Das Angebot wurde nicht angenommen.'; end if;
  if o.confirmed_at is not null then raise exception 'Der Erhalt ist schon bestätigt, das Teil wurde übergeben.'; end if;
  select * into l from public.listing where id = o.listing_id;
  if l.id is not null and l.status = 'sold' then
    update public.listing set status = 'active', updated_at = now() where id = l.id;
  end if;
  update public.offer set status = 'withdrawn', decided_at = now() where id = o.id;
  select username into sellername from public.profiles where user_id = o.to_user;
  select username into buyer from public.profiles where user_id = o.from_user;
  insert into public.message (thread_id, sender, kind, body)
  values (o.thread_id, o.to_user, 'text', 'Angebot zurückgezogen. Das Team hat den Verkauf rückgängig gemacht, das Teil ist wieder im Verkauf.');
  insert into public.admin_log (admin_id, action, target, detail)
  values (auth.uid(), 'verkauf rückgängig', sellername, left('Käufer ' || coalesce(buyer, '?') || ', Bestellung ' || left(o.id::text, 8) || coalesce(' · ' || nullif(trim(p_reason), ''), ''), 300));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- 3. Bewertungen ----------
create or replace function public.admin_reviews() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  return jsonb_build_object(
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'reviewer', a.username, 'reviewee', b.username, 'rating', r.rating, 'comment', r.comment, 'at', r.created_at) order by r.created_at desc)
      from (select * from public.review order by created_at desc limit 200) r
      join public.profiles a on a.user_id = r.reviewer join public.profiles b on b.user_id = r.reviewee
    ), '[]'::jsonb),
    'stats', coalesce((
      select jsonb_agg(jsonb_build_object('username', p.username, 'avg', s.avg, 'n', s.n) order by s.n desc, s.avg desc)
      from (select reviewee, round(avg(rating), 2) as avg, count(*) as n from public.review group by reviewee order by count(*) desc limit 50) s
      join public.profiles p on p.user_id = s.reviewee
    ), '[]'::jsonb));
end $$;

create or replace function public.admin_review_delete(p_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.review; a text; b text;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  delete from public.review where id = p_id returning * into r;
  if not found then raise exception 'Bewertung nicht gefunden.'; end if;
  select username into a from public.profiles where user_id = r.reviewer;
  select username into b from public.profiles where user_id = r.reviewee;
  insert into public.admin_log (admin_id, action, target, detail)
  values (auth.uid(), 'bewertung gelöscht', b, left(r.rating || ' Sterne von ' || coalesce(a, '?') || coalesce(' · „' || nullif(left(r.comment, 80), '') || '“', '') || coalesce(' · Grund: ' || nullif(trim(p_reason), ''), ''), 300));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- 4. Versteckte Inhalte und gesperrte Konten ----------
-- Vom Team versteckte Teile und Outfits (Besitzer nicht gesperrt: bei gesperrten Konten ist ohnehin alles versteckt)
create or replace function public.admin_hidden_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  return coalesce((
    select jsonb_agg(x.j order by x.ts desc) from (
      select i.updated_at as ts, jsonb_build_object('username', p.username, 'kind', 'items', 'id', i.id, 'name', coalesce(nullif(i.name, ''), nullif(i.data->>'name', ''), 'Teil')) as j
      from public.items i join public.profiles p on p.user_id = i.user_id where i.mod_hidden and not i.deleted and p.banned_at is null
      union all
      select o.updated_at, jsonb_build_object('username', p.username, 'kind', 'outfits', 'id', o.id, 'name', coalesce(nullif(o.name, ''), 'Outfit'))
      from public.outfits o join public.profiles p on p.user_id = o.user_id where o.mod_hidden and not o.deleted and p.banned_at is null
      limit 200
    ) x
  ), '[]'::jsonb);
end $$;

-- Teil oder Outfit verstecken oder wieder freigeben
create or replace function public.admin_set_hidden(p_username text, p_kind text, p_id text, p_hidden boolean, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t uuid; n int;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  if p_kind not in ('items', 'outfits') then raise exception 'Ungültige Art.'; end if;
  select user_id into t from public.profiles where username = lower(p_username);
  if t is null then raise exception 'Profil nicht gefunden.'; end if;
  if p_kind = 'items' then
    update public.items set mod_hidden = p_hidden, updated_at = now() where user_id = t and id = p_id and not deleted;
  else
    update public.outfits set mod_hidden = p_hidden, updated_at = now() where user_id = t and id = p_id and not deleted;
  end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Inhalt nicht gefunden.'; end if;
  insert into public.admin_log (admin_id, action, target, detail)
  values (auth.uid(), case when p_hidden then 'verstecken' else 'freigeben' end, lower(p_username),
          p_kind || '/' || p_id || coalesce(' · ' || left(nullif(trim(p_reason), ''), 300), ''));
  return jsonb_build_object('ok', true);
end $$;

-- Gesperrte Konten
create or replace function public.admin_banned_list() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'username', p.username, 'email', u.email, 'banned_at', p.banned_at,
      'reason', (select l.detail from public.admin_log l where l.action = 'sperren' and l.target = p.username order by l.created_at desc limit 1)
    ) order by p.banned_at desc)
    from public.profiles p join auth.users u on u.id = p.user_id where p.banned_at is not null
  ), '[]'::jsonb);
end $$;

-- ---------- 5. Flex of the Week ----------
create or replace function public.admin_flex_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare wk date := date_trunc('week', now() at time zone 'Europe/Berlin')::date;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  return jsonb_build_object('week_start', wk, 'entries', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'username', p.username, 'kind', e.kind, 'target', e.target_id, 'note', e.note,
      'name', case when e.kind = 'item' then public.admin_item_name(e.owner_id, e.target_id)
                   else (select coalesce(nullif(o.name, ''), 'Outfit') from public.outfits o where o.user_id = e.owner_id and o.id = e.target_id) end
    ) order by e.position)
    from public.flex_entry e
    join public.flex_week w on w.id = e.flex_id and w.week_start = wk
    join public.profiles p on p.user_id = e.owner_id
  ), '[]'::jsonb));
end $$;

-- ---------- 6. Rollen ----------
create or replace function public.admin_roles_list() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('username', p.username, 'email', u.email, 'role', r.role, 'granted_at', r.granted_at,
                                        'me', r.user_id = auth.uid()) order by r.role, r.granted_at)
    from public.user_role r join public.profiles p on p.user_id = r.user_id join auth.users u on u.id = r.user_id
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_set_role(p_username text, p_role text, p_grant boolean, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  if p_role not in ('admin', 'moderator') then raise exception 'Ungültige Rolle.'; end if;
  select user_id into t from public.profiles where username = lower(p_username);
  if t is null then raise exception 'Profil nicht gefunden.'; end if;
  if p_grant then
    if exists (select 1 from public.profiles where user_id = t and banned_at is not null) then raise exception 'Ein gesperrtes Konto kann keine Rolle bekommen.'; end if;
    insert into public.user_role (user_id, role, granted_by) values (t, p_role, auth.uid()) on conflict do nothing;
  else
    if p_role = 'admin' and t = auth.uid() then raise exception 'Du kannst dir die Admin-Rolle nicht selbst entziehen.'; end if;
    if p_role = 'admin' and (select count(*) from public.user_role where role = 'admin') <= 1 then raise exception 'Das ist der letzte Admin.'; end if;
    delete from public.user_role where user_id = t and role = p_role;
  end if;
  insert into public.admin_log (admin_id, action, target, detail)
  values (auth.uid(), case when p_grant then 'rolle vergeben' else 'rolle entzogen' end, lower(p_username),
          p_role || coalesce(' · ' || left(nullif(trim(p_reason), ''), 300), ''));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- 7. Kennzahlen und 9. Protokoll ----------
create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path to 'public', 'auth' as $function$
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  return jsonb_build_object(
    'members', (select count(*) from public.profiles),
    'new_members', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'items', (select count(*) from public.items where not deleted),
    'outfits', (select count(*) from public.outfits where not deleted),
    'open_reports', (select count(*) from public.reports where resolved_at is null),
    'errors_24h', (select coalesce(sum(n), 0) from public.client_errors where last_at > now() - interval '24 hours'),
    'frozen', (select count(*) from public.items where legit_status = 'frozen' and not deleted),
    'listings_active', (select count(*) from public.listing where status in ('active', 'reserved')),
    'open_sales', (select count(*) from public.offer o join public.listing l on l.id = o.listing_id
                    where o.status = 'accepted' and o.confirmed_at is null and l.status = 'sold'),
    'stuck_orders', (select count(*) from public.offer o join public.listing l on l.id = o.listing_id
                      where o.status = 'accepted' and o.confirmed_at is null and l.status = 'sold' and l.updated_at < now() - interval '7 days'),
    'open_transfers', (select count(*) from public.item_transfer where status = 'pending'),
    'reviews_7d', (select count(*) from public.review where created_at > now() - interval '7 days')
  );
end $function$;

-- Protokoll: bis zu 500 Einträge (Filter nach Aktion und Person macht die Seite)
create or replace function public.admin_log_list() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('action', l.action, 'target', l.target, 'detail', l.detail, 'admin', p.username, 'created_at', l.created_at) order by l.created_at desc)
    from (select * from public.admin_log order by created_at desc limit 500) l
    left join public.profiles p on p.user_id = l.admin_id
  ), '[]'::jsonb);
end $function$;

revoke all on function
  public.admin_item_name(uuid, text), public.admin_legit_clear(uuid), public.admin_legit_clear_item(text, text), public.admin_legit_list(),
  public.admin_legit_votes(text, text), public.admin_legit_fake(text, text, text), public.admin_listings(text), public.admin_orders(),
  public.admin_open_transfers(), public.admin_order_chat(uuid), public.admin_force_receipt(uuid, text), public.admin_undo_sale(uuid, text),
  public.admin_reviews(), public.admin_review_delete(uuid, text), public.admin_hidden_list(), public.admin_set_hidden(text, text, text, boolean, text),
  public.admin_banned_list(), public.admin_flex_list(), public.admin_roles_list(), public.admin_set_role(text, text, boolean, text),
  public.admin_overview(), public.admin_log_list()
  from public, anon;
revoke execute on function public.admin_item_name(uuid, text) from authenticated;
grant execute on function
  public.admin_legit_clear(uuid), public.admin_legit_clear_item(text, text), public.admin_legit_list(),
  public.admin_legit_votes(text, text), public.admin_legit_fake(text, text, text), public.admin_listings(text), public.admin_orders(),
  public.admin_open_transfers(), public.admin_order_chat(uuid), public.admin_force_receipt(uuid, text), public.admin_undo_sale(uuid, text),
  public.admin_reviews(), public.admin_review_delete(uuid, text), public.admin_hidden_list(), public.admin_set_hidden(text, text, text, boolean, text),
  public.admin_banned_list(), public.admin_flex_list(), public.admin_roles_list(), public.admin_set_role(text, text, boolean, text),
  public.admin_overview(), public.admin_log_list()
  to authenticated;
notify pgrst, 'reload schema';
