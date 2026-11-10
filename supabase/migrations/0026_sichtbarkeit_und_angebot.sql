-- Sichtbarkeit und Verkaufsangebot sind zwei getrennte Dinge:
--   items.visibility  = private | public   (wer das Teil sehen darf)
--   public.listing    = ein Verkaufsangebot zu einem Teil: Preis in Cent, Währung, Status
-- Beides leiten Trigger aus den bisherigen Feldern vis/price ab, die App ändert sich dadurch nicht.
-- Die alten Spalten vis (mit „sale“) und price entfallen erst am Ende der Umstellung, wenn Feed und Suche umgestellt sind.
alter table public.items add column if not exists visibility text not null default 'private';
alter table public.items drop constraint if exists items_visibility_check;
alter table public.items add constraint items_visibility_check check (visibility in ('private', 'public'));

create table if not exists public.listing (
  id          uuid primary key default gen_random_uuid(),
  item_id     text not null unique references public.items(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  price_cents int  not null check (price_cents between 0 and 10000000),
  currency    text not null default 'EUR' check (currency = 'EUR'),
  status      text not null default 'active' check (status in ('active', 'reserved', 'sold')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists listing_user_idx on public.listing (user_id);
alter table public.listing enable row level security;
revoke all on public.listing from anon, authenticated;
grant select on public.listing to authenticated;
drop policy if exists listing_own on public.listing;
create policy listing_own on public.listing for select to authenticated using (user_id = auth.uid());

create or replace function public.items_visibility() returns trigger
language plpgsql as $$
begin
  new.visibility := case when new.vis in ('public', 'sale', 'trade') then 'public' else 'private' end;
  return new;
end $$;
drop trigger if exists items_visibility on public.items;
create trigger items_visibility before insert or update of vis on public.items
  for each row execute function public.items_visibility();

create or replace function public.listing_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.deleted and new.vis = 'sale' and new.price is not null and new.price >= 0 then
    insert into public.listing (item_id, user_id, price_cents, currency)
    values (new.id, new.user_id, least(round(new.price * 100), 10000000)::int, 'EUR')
    on conflict (item_id) do update set price_cents = excluded.price_cents, updated_at = now()
      where public.listing.status <> 'sold';
  else
    delete from public.listing where item_id = new.id and status <> 'sold';
  end if;
  return null;
end $$;
revoke all on function public.listing_sync() from public, anon, authenticated;
drop trigger if exists items_listing_sync on public.items;
create trigger items_listing_sync after insert or update of vis, price, deleted on public.items
  for each row execute function public.listing_sync();

-- Bestehende Teile einmal nachtragen (inhaltlich ändert sich nichts)
update public.items set vis = vis where vis in ('private', 'public', 'sale', 'trade');

update public.schema_info set version = 26, note = 'visibility und listing', updated_at = now();
notify pgrst, 'reload schema';
