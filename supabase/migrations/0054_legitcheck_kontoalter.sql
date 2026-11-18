-- 0054: Legit-Check: abstimmen dürfen nur Konten, die mindestens 3 Tage alt sind (gegen frische Fake-Konten, die Teile einfrieren).
-- Stimmen zurücknehmen geht jederzeit. Im Supabase-Dashboard unter "SQL Editor" ausführen.

create or replace function public.legit_vote(p_username text, p_id text, p_verdict text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); o uuid; it public.items; nfake int; nreal int; made timestamptz;
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
    select created_at into made from auth.users where id = me;
    if made is null or made > now() - interval '3 days' then raise exception 'Dein Konto ist noch zu neu zum Abstimmen. Das geht ab dem dritten Tag.'; end if;
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

revoke all on function public.legit_vote(text, text, text) from public, anon;
grant execute on function public.legit_vote(text, text, text) to authenticated;
notify pgrst, 'reload schema';
