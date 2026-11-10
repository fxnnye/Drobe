-- Stufe 0 des Feed-Algorithmus: Ereignisse mitschreiben (Ansehen, Merken, Anfrage)
-- Nur angemeldete Nutzer, nur fremde öffentliche Inhalte, pro Tag und Ziel höchstens einmal, nach 12 Monaten gelöscht.
create table if not exists public.events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('view_item', 'view_outfit', 'save_item', 'save_outfit', 'interest')),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  target_id  text not null,
  day        date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, kind, owner_id, target_id, day)
);
create index if not exists events_target_idx on public.events (owner_id, target_id, kind);
create index if not exists events_created_idx on public.events (created_at);
alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;

create or replace function public.log_view(p_username text, p_kind text, p_id text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); target uuid;
begin
  if me is null or p_kind not in ('item', 'outfit') then return; end if;
  select user_id into target from public.profiles where username = lower(p_username);
  if target is null or target = me then return; end if;
  if p_kind = 'item' and not exists (select 1 from public.items i where i.user_id = target and i.id = p_id and not i.deleted and i.vis in ('public', 'trade', 'sale')) then return; end if;
  if p_kind = 'outfit' and not exists (select 1 from public.outfits o where o.user_id = target and o.id = p_id and not o.deleted and o.vis = 'public') then return; end if;
  insert into public.events (user_id, kind, owner_id, target_id) values (me, 'view_' || p_kind, target, p_id) on conflict do nothing;
  if random() < 0.01 then delete from public.events where created_at < now() - interval '12 months'; end if;
end $$;

-- Merken und Anfragen schreibt die Datenbank selbst mit
create or replace function public.event_from_save() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id <> new.owner_id then
    insert into public.events (user_id, kind, owner_id, target_id) values (new.user_id, 'save_item', new.owner_id, new.item_id) on conflict do nothing;
  end if;
  return null;
end $$;
create or replace function public.event_from_outfit_save() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id <> new.owner_id then
    insert into public.events (user_id, kind, owner_id, target_id) values (new.user_id, 'save_outfit', new.owner_id, new.outfit_id) on conflict do nothing;
  end if;
  return null;
end $$;
create or replace function public.event_from_interest() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'interest' and new.from_user <> new.to_user then
    insert into public.events (user_id, kind, owner_id, target_id) values (new.from_user, 'interest', new.to_user, new.record_id) on conflict do nothing;
  end if;
  return null;
end $$;

drop trigger if exists events_saves on public.saves;
create trigger events_saves after insert on public.saves for each row execute function public.event_from_save();
drop trigger if exists events_outfit_saves on public.outfit_saves;
create trigger events_outfit_saves after insert on public.outfit_saves for each row execute function public.event_from_outfit_save();
drop trigger if exists events_interests on public.interests;
create trigger events_interests after insert on public.interests for each row execute function public.event_from_interest();

revoke all on function public.log_view(text, text, text) from public, anon;
grant execute on function public.log_view(text, text, text) to authenticated;
revoke all on function public.event_from_save(), public.event_from_outfit_save(), public.event_from_interest() from public, anon, authenticated;
notify pgrst, 'reload schema';
