-- 0052: Community-Legitcheck. Angemeldete Mitglieder stimmen bei öffentlichen Teilen ab, ob sie echt oder fake sind.
-- Ab 5 „Fake“-Stimmen wird das Teil eingefroren (keine neuen Kaufanfragen) und als Meldung ans Team gegeben.
-- Das Team entscheidet: „Ist echt“ hebt das Einfrieren auf (und es wird nie wieder automatisch eingefroren),
-- sonst wie bisher „Inhalt entfernen“ / verstecken in der Meldung.
-- Im Supabase-Dashboard unter "SQL Editor" ausführen.

alter table public.items add column if not exists legit_status text check (legit_status in ('frozen', 'cleared'));

create table if not exists public.legit_vote (
  owner      uuid not null references auth.users(id) on delete cascade,
  item_id    text not null,
  voter      uuid not null references auth.users(id) on delete cascade,
  verdict    text not null check (verdict in ('real', 'fake')),
  created_at timestamptz not null default now(),
  primary key (owner, item_id, voter)
);
alter table public.legit_vote enable row level security;
revoke all on public.legit_vote from anon, authenticated;

-- Stand der Abstimmung eines öffentlichen Teils (für alle lesbar; „mine“ nur wenn angemeldet)
create or replace function public.legit_info(p_username text, p_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o uuid; it public.items;
begin
  select user_id into o from public.profiles where username = lower(p_username);
  if o is null then return null; end if;
  select * into it from public.items where user_id = o and id = p_id and not deleted and visibility = 'public' and not mod_hidden;
  if not found then return null; end if;
  return jsonb_build_object(
    'real', (select count(*) from public.legit_vote v where v.owner = o and v.item_id = p_id and v.verdict = 'real'),
    'fake', (select count(*) from public.legit_vote v where v.owner = o and v.item_id = p_id and v.verdict = 'fake'),
    'mine', (select v.verdict from public.legit_vote v where v.owner = o and v.item_id = p_id and v.voter = auth.uid()),
    'status', it.legit_status);
end $$;

-- Abstimmen (p_verdict 'real' oder 'fake'; null nimmt die Stimme zurück)
create or replace function public.legit_vote(p_username text, p_id text, p_verdict text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); o uuid; it public.items; nfake int; nreal int; cnt text;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  if p_verdict is not null and p_verdict not in ('real', 'fake') then raise exception 'Ungültige Stimme.'; end if;
  select user_id into o from public.profiles where username = lower(p_username);
  if o is null then raise exception 'Profil nicht gefunden.'; end if;
  if o = me then raise exception 'Bei deinen eigenen Teilen kannst du nicht abstimmen.'; end if;
  select * into it from public.items where user_id = o and id = p_id and not deleted and visibility = 'public' and not mod_hidden;
  if not found then raise exception 'Dieses Teil ist nicht mehr verfügbar.'; end if;
  if exists (select 1 from public.blocks where (blocker = me and blocked = o) or (blocker = o and blocked = me)) then
    raise exception 'Das ist gerade nicht möglich.';
  end if;
  if p_verdict is null then
    delete from public.legit_vote where owner = o and item_id = p_id and voter = me;
  else
    if (select count(*) from public.legit_vote where voter = me and created_at > now() - interval '1 day') >= 30
       and not exists (select 1 from public.legit_vote where owner = o and item_id = p_id and voter = me) then
      raise exception 'Für heute ist das Limit erreicht.';
    end if;
    insert into public.legit_vote (owner, item_id, voter, verdict) values (o, p_id, me, p_verdict)
    on conflict (owner, item_id, voter) do update set verdict = excluded.verdict;
  end if;
  select count(*) filter (where verdict = 'fake'), count(*) filter (where verdict = 'real') into nfake, nreal
    from public.legit_vote where owner = o and item_id = p_id;
  -- ab 5 Fake-Stimmen einfrieren und dem Team melden (nicht, wenn das Team das Teil schon als echt bestätigt hat)
  if nfake >= 5 and it.legit_status is null then
    update public.items set legit_status = 'frozen', updated_at = now() where user_id = o and id = p_id;
    insert into public.reports (reporter, target_user, record_id, reason, note)
    values (me, o, p_id, 'faelschung', 'Community-Prüfung: ' || nfake || ' Fake- und ' || nreal || ' Echt-Stimmen. Das Teil ist eingefroren, bis das Team entschieden hat.');
  end if;
  return public.legit_info(p_username, p_id);
end $$;

-- Team: „Ist echt“. Hebt das Einfrieren auf, schließt die Meldung, und das Teil wird nicht mehr automatisch eingefroren.
create or replace function public.admin_legit_clear(p_report uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.reports;
begin
  if not public.is_admin() then raise exception 'Kein Zugriff.'; end if;
  select * into r from public.reports where id = p_report;
  if not found or r.record_id is null then raise exception 'Meldung nicht gefunden.'; end if;
  update public.items set legit_status = 'cleared', updated_at = now() where user_id = r.target_user and id = r.record_id;
  update public.reports set resolved_at = now(), outcome = 'dismissed'
   where target_user = r.target_user and record_id = r.record_id and resolved_at is null;
  return jsonb_build_object('ok', true);
end $$;

-- Eingefrorene Teile bekommen keine neuen Kaufanfragen (greift beim Anlegen oder Erneuern einer Unterhaltung zum Teil)
create or replace function public.thread_frozen_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'interest' and exists (select 1 from public.items where user_id = new.to_user and id = new.item_id and legit_status = 'frozen') then
    raise exception 'Dieses Teil wird gerade vom Team geprüft. Anfragen sind erst danach wieder möglich.';
  end if;
  return new;
end $$;
drop trigger if exists thread_frozen_check on public.thread;
create trigger thread_frozen_check before insert on public.thread for each row execute function public.thread_frozen_check();

revoke all on function public.legit_info(text, text), public.legit_vote(text, text, text), public.admin_legit_clear(uuid) from public, anon;
grant execute on function public.legit_info(text, text) to anon, authenticated;
grant execute on function public.legit_vote(text, text, text), public.admin_legit_clear(uuid) to authenticated;
notify pgrst, 'reload schema';
