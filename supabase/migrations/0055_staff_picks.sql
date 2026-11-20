-- 0055: Staff Picks. Admins und Moderatoren (die Helfer) wählen öffentliche Teile aus, die im Feed unter dem Flammen-Knopf erscheinen.
-- Im Supabase-Dashboard unter "SQL Editor" ausführen.

create table if not exists public.staff_pick (
  owner      uuid not null references auth.users(id) on delete cascade,
  item_id    text not null,
  added_by   uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (owner, item_id)
);
alter table public.staff_pick enable row level security;
revoke all on public.staff_pick from anon, authenticated;

-- Wer darf Staff Picks setzen: Admin oder Moderator
create or replace function public.staff_can() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_role where user_id = auth.uid() and role in ('admin', 'moderator'))
$$;

-- Die Staff Picks für den Feed (für alle lesbar, gleiche Felder wie feed_public). Nur öffentliche, nicht versteckte, nicht eingefrorene Teile.
create or replace function public.staff_pick_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce((
    select jsonb_agg(x.j order by x.ts desc) from (
      select s.created_at as ts, jsonb_build_object(
        'username', p.username, 'id', i.id, 'path', i.user_id::text || '/items-' || i.id,
        'name', i.name, 'brand', i.brand, 'size', i.size, 'cond', i.cond, 'rarity', i.rarity, 'color', i.color, 'vis', public.item_vis(i.id),
        'price', public.item_price(i.id), 'ts', s.created_at) as j
      from public.staff_pick s
      join public.items i on i.user_id = s.owner and i.id = s.item_id
      join public.profiles p on p.user_id = i.user_id
      where not i.deleted and i.visibility = 'public' and not i.mod_hidden and i.legit_status is distinct from 'frozen'
        and p.banned_at is null
        and (auth.uid() is null or not exists (select 1 from public.blocks b
              where (b.blocker = auth.uid() and b.blocked = i.user_id) or (b.blocker = i.user_id and b.blocked = auth.uid())))
      order by s.created_at desc limit 100) x
  ), '[]'::jsonb);
end $$;

-- Stand eines Teils: ist es ein Staff Pick, und darf ich das ändern
create or replace function public.staff_pick_state(p_username text, p_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o uuid;
begin
  select user_id into o from public.profiles where username = lower(p_username);
  return jsonb_build_object(
    'picked', o is not null and exists (select 1 from public.staff_pick where owner = o and item_id = p_id),
    'can', public.staff_can());
end $$;

-- Hinzufügen oder Entfernen (nur Admin oder Moderator, nur öffentliche Teile anderer)
create or replace function public.staff_pick_set(p_username text, p_id text, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  if not public.staff_can() then raise exception 'Kein Zugriff.'; end if;
  select user_id into o from public.profiles where username = lower(p_username);
  if o is null then raise exception 'Profil nicht gefunden.'; end if;
  if p_on then
    if o = auth.uid() then raise exception 'Eigene Teile kannst du nicht als Staff Pick auswählen.'; end if;
    if not exists (select 1 from public.items where user_id = o and id = p_id and not deleted and visibility = 'public' and not mod_hidden) then
      raise exception 'Dieses Teil ist nicht öffentlich.';
    end if;
    insert into public.staff_pick (owner, item_id, added_by) values (o, p_id, auth.uid()) on conflict do nothing;
  else
    delete from public.staff_pick where owner = o and item_id = p_id;
  end if;
  insert into public.admin_log (admin_id, action, target, detail)
  values (auth.uid(), case when p_on then 'staff pick gesetzt' else 'staff pick entfernt' end, lower(p_username), p_id);
  return jsonb_build_object('ok', true, 'picked', p_on);
end $$;

revoke all on function public.staff_can(), public.staff_pick_list(), public.staff_pick_state(text, text), public.staff_pick_set(text, text, boolean) from public, anon;
grant execute on function public.staff_pick_list(), public.staff_pick_state(text, text) to anon, authenticated;
grant execute on function public.staff_can(), public.staff_pick_set(text, text, boolean) to authenticated;
notify pgrst, 'reload schema';
