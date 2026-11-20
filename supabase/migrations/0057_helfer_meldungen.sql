-- 0057: Helfer (Rolle moderator) dürfen die offenen Meldungen und den Legit-Check in der Verwaltung ansehen (nur lesen, entscheiden dürfen nur Admins).
-- Gleiche Angaben wie admin_reports(), aber auch für Helfer. Keine E-Mail-Adressen. Setzt 0055 voraus.
-- Im Supabase-Dashboard unter "SQL Editor" ausführen.

create or replace function public.staff_reports() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.staff_can() then raise exception 'Kein Zugriff.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'reporter', rp.username, 'target', tp.username, 'record_id', r.record_id,
      'record_name', coalesce(it.name, ou.name),
      'reason', r.reason, 'note', r.note, 'created_at', r.created_at, 'target_banned', tp.banned_at is not null,
      'target_is_admin', exists (select 1 from public.user_role a where a.user_id = r.target_user and a.role = 'admin'),
      'target_since', (select u.created_at from auth.users u where u.id = r.target_user),
      'target_items', (select count(*) from public.items i where i.user_id = r.target_user and not i.deleted),
      'target_outfits', (select count(*) from public.outfits o where o.user_id = r.target_user and not o.deleted),
      'target_reports', (select count(*) from public.reports x where x.target_user = r.target_user),
      'target_terms_at', tp.terms_accepted_at, 'target_terms_version', tp.terms_version,
      'content_kind', case when it.id is not null then 'items' when ou.id is not null then 'outfits' end,
      'content_name', coalesce(it.name, ou.name),
      'content_deleted', coalesce(it.deleted, ou.deleted)
    ) order by r.created_at desc)
    from (select * from public.reports where resolved_at is null order by created_at desc limit 100) r
    left join public.profiles rp on rp.user_id = r.reporter
    left join public.profiles tp on tp.user_id = r.target_user
    left join public.items   it on it.user_id = r.target_user and it.id = r.record_id
    left join public.outfits ou on ou.user_id = r.target_user and ou.id = r.record_id
  ), '[]'::jsonb);
end $$;


create or replace function public.staff_legit_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.staff_can() then raise exception 'Kein Zugriff.'; end if;
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

create or replace function public.staff_legit_votes(p_username text, p_id text) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare t uuid;
begin
  if not public.staff_can() then raise exception 'Kein Zugriff.'; end if;
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

revoke all on function public.staff_reports(), public.staff_legit_list(), public.staff_legit_votes(text, text) from public, anon;
grant execute on function public.staff_reports(), public.staff_legit_list(), public.staff_legit_votes(text, text) to authenticated;
notify pgrst, 'reload schema';
