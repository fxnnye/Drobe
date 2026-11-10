-- Stufe 1 bis 3 des Feeds: Score, Geschmack, einstellbare Gewichte.
-- Die Stufe richtet sich nach den aktiven Nutzern der letzten 30 Tage. Stufe 3 heißt: Werte in feed_settings anpassen, ohne neue App-Version.
create table if not exists public.feed_settings (
  key   text primary key,
  value numeric not null,
  note  text
);
alter table public.feed_settings enable row level security;
revoke all on public.feed_settings from anon, authenticated;

insert into public.feed_settings (key, value, note) values
  ('stage1_users',    10,  'Ab so vielen aktiven Nutzern (30 Tage): Score und Reiter „Für dich“'),
  ('stage2_users',    100, 'Ab so vielen aktiven Nutzern (30 Tage): persönlicher Geschmack'),
  ('half_life_hours', 72,  'Nach so vielen Stunden zählt die Neuheit nur noch halb'),
  ('w_recency',       1,   'Gewicht Neuheit'),
  ('w_popularity',    0.5, 'Gewicht Beliebtheit'),
  ('w_follow',        0.5, 'Bonus für Konten, denen man folgt'),
  ('w_taste',         1,   'Gewicht eigener Geschmack'),
  ('w_view',          0.2, 'Punkte pro Ansicht'),
  ('w_save',          1,   'Punkte pro Merken'),
  ('w_interest',      2,   'Punkte pro Anfrage'),
  ('max_in_row',      2,   'Höchstens so viele Einträge eines Kontos hintereinander')
on conflict (key) do nothing;

create or replace function public.feed_stage() returns int
language sql stable security definer set search_path = public as $$
  with a as (select count(distinct user_id) as n from public.events where created_at > now() - interval '30 days'),
       s as (select coalesce(max(value) filter (where key = 'stage1_users'), 10) as s1,
                    coalesce(max(value) filter (where key = 'stage2_users'), 100) as s2 from public.feed_settings)
  select case when a.n >= s.s2 then 2 when a.n >= s.s1 then 1 else 0 end from a, s
$$;

-- Kern: nur intern aufrufbar, damit niemand fremde Nutzer-IDs einsetzen kann
create or replace function public.feed_rank_core(p_user uuid, p_stage int, p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_cfg jsonb;
  v_half float8; v_rec float8; v_pop float8; v_fol float8; v_tas float8; v_view float8; v_save float8; v_int float8;
  v_max int;
  v_recs jsonb[]; v_owners uuid[]; v_used boolean[];
  v_n int; v_i int; v_pick int; v_first int;
  v_offset int := least(greatest(coalesce(p_offset, 0), 0), 570);
  v_want int; v_placed int := 0; v_last uuid; v_run int := 0;
  v_res jsonb := '[]'::jsonb;
begin
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_cfg from public.feed_settings;
  v_half := greatest(coalesce((v_cfg->>'half_life_hours')::float8, 72), 1);
  v_rec  := coalesce((v_cfg->>'w_recency')::float8, 1);
  v_pop  := coalesce((v_cfg->>'w_popularity')::float8, 0.5);
  v_fol  := coalesce((v_cfg->>'w_follow')::float8, 0.5);
  v_tas  := coalesce((v_cfg->>'w_taste')::float8, 1);
  v_view := coalesce((v_cfg->>'w_view')::float8, 0.2);
  v_save := coalesce((v_cfg->>'w_save')::float8, 1);
  v_int  := coalesce((v_cfg->>'w_interest')::float8, 2);
  v_max  := greatest(coalesce((v_cfg->>'max_in_row')::int, 2), 1);
  v_want := v_offset + 30;

  with ev as (
    select e.owner_id, e.target_id,
           case when e.kind in ('view_outfit', 'save_outfit') then 'o' else 'i' end as cls,
           sum(case when e.kind like 'view_%' then v_view when e.kind like 'save_%' then v_save else v_int end) as pts
    from public.events e
    where e.created_at > now() - interval '30 days'
    group by 1, 2, 3
  ),
  sig as (
    select lower(nullif(trim(i.brand), '')) as brand, nullif(i.category, '') as category, nullif(i.color, '') as color,
           case when e.kind = 'view_item' then v_view when e.kind = 'save_item' then v_save else v_int end as w
    from public.events e
    join public.items i on i.user_id = e.owner_id and i.id = e.target_id
    where p_stage >= 2 and e.user_id = p_user and e.kind in ('view_item', 'save_item', 'interest')
      and e.created_at > now() - interval '90 days'
  ),
  t_brand as (select brand as v, sum(w) / nullif((select sum(w) from sig where brand is not null), 0) as sh from sig where brand is not null group by 1),
  t_cat   as (select category as v, sum(w) / nullif((select sum(w) from sig where category is not null), 0) as sh from sig where category is not null group by 1),
  t_col   as (select color as v, sum(w) / nullif((select sum(w) from sig where color is not null), 0) as sh from sig where color is not null group by 1),
  item_taste as (
    select i.user_id, i.id, (coalesce(b.sh, 0) + coalesce(c.sh, 0) + coalesce(f.sh, 0)) / 3 as t
    from public.items i
    left join t_brand b on b.v = lower(nullif(trim(i.brand), ''))
    left join t_cat c on c.v = i.category
    left join t_col f on f.v = i.color
    where p_stage >= 2 and p_user is not null and not i.deleted and i.vis in ('public', 'trade', 'sale')
  ),
  cand as (
    (select 'i' as cls, i.user_id as owner, i.id, i.updated_at as ts, jsonb_build_object(
        'username', p.username, 'id', i.id, 'path', i.user_id::text || '/items-' || i.id,
        'name', i.name, 'brand', i.brand, 'size', i.size, 'cond', i.cond, 'rarity', i.rarity, 'color', i.color, 'vis', i.vis,
        'price', case when i.vis = 'sale' then to_jsonb(i.price) end,
        'swap',  case when i.vis = 'trade' then i.swap end,
        'ts', i.updated_at) as j
     from public.items i join public.profiles p on p.user_id = i.user_id
     where not i.deleted and i.vis in ('public', 'trade', 'sale')
       and (p_user is null or (i.user_id <> p_user and not exists (select 1 from public.blocks b
             where (b.blocker = p_user and b.blocked = i.user_id) or (b.blocker = i.user_id and b.blocked = p_user))))
     order by i.updated_at desc limit 300)
    union all
    (select 'o', o.user_id, o.id, o.updated_at, jsonb_build_object(
        'username', p.username, 'id', o.id, 'path', o.user_id::text || '/outfits-' || o.id,
        'name', o.name, 'vis', o.vis, 'ts', o.updated_at, 'outfit', true)
     from public.outfits o join public.profiles p on p.user_id = o.user_id
     where not o.deleted and o.vis = 'public'
       and (p_user is null or (o.user_id <> p_user and not exists (select 1 from public.blocks b
             where (b.blocker = p_user and b.blocked = o.user_id) or (b.blocker = o.user_id and b.blocked = p_user))))
     order by o.updated_at desc limit 300)
  ),
  scored as (
    select c.owner, c.id, c.ts, c.j,
           v_rec * power(0.5::float8, least(extract(epoch from now() - c.ts)::float8 / 3600 / v_half, 40))
           + case when p_stage >= 1 then v_pop * ln(1 + greatest(coalesce(ev.pts, 0), 0)) else 0 end
           + case when p_stage >= 1 and f.follower is not null then v_fol else 0 end
           + case when p_stage >= 2 then v_tas * coalesce(it.t, ot.t, 0) else 0 end as score
    from cand c
    left join ev on ev.owner_id = c.owner and ev.target_id = c.id and ev.cls = c.cls
    left join public.follows f on f.follower = p_user and f.followee = c.owner
    left join item_taste it on c.cls = 'i' and it.user_id = c.owner and it.id = c.id
    left join lateral (
      select avg(t2.t) as t from public.outfit_items oi
      join item_taste t2 on t2.user_id = oi.user_id and t2.id = oi.item_id
      where c.cls = 'o' and oi.user_id = c.owner and oi.outfit_id = c.id
    ) ot on true
  )
  select array_agg(s.j order by s.score desc, s.ts desc, s.id),
         array_agg(s.owner order by s.score desc, s.ts desc, s.id)
  into v_recs, v_owners from scored s;

  v_n := coalesce(array_length(v_recs, 1), 0);
  if v_n = 0 then return v_res; end if;
  v_used := array_fill(false, array[v_n]);

  -- Vielfalt: nicht zu viele Einträge eines Kontos hintereinander; gibt es nichts anderes mehr, geht es trotzdem weiter
  while v_placed < v_want and v_placed < v_n loop
    v_pick := null; v_first := null;
    for v_i in 1..v_n loop
      continue when v_used[v_i];
      if v_first is null then v_first := v_i; end if;
      if not (v_owners[v_i] = v_last and v_run >= v_max) then v_pick := v_i; exit; end if;
    end loop;
    v_pick := coalesce(v_pick, v_first);
    v_used[v_pick] := true;
    if v_owners[v_pick] = v_last then v_run := v_run + 1; else v_last := v_owners[v_pick]; v_run := 1; end if;
    v_placed := v_placed + 1;
    if v_placed > v_offset then v_res := v_res || v_recs[v_pick]; end if;
  end loop;
  return v_res;
end $$;

create or replace function public.feed_ranked(p_offset int default 0) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.feed_rank_core(auth.uid(), public.feed_stage(), p_offset)
$$;

revoke all on function public.feed_rank_core(uuid, int, int) from public, anon, authenticated;
revoke all on function public.feed_stage(), public.feed_ranked(int) from public;
grant execute on function public.feed_stage(), public.feed_ranked(int) to anon, authenticated;
notify pgrst, 'reload schema';
