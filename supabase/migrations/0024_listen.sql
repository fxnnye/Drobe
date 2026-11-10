-- Listen für Kategorie und Zustand (mit deutschem und englischem Namen). Marken stehen schon in public.brands
-- und wachsen automatisch mit den Teilen der Nutzer. Der Schlüssel `key` ist der Wert, den Teile heute speichern.
create table if not exists public.categories (
  key     text primary key,
  name_de text not null,
  name_en text not null,
  sort    int  not null
);
create table if not exists public.conditions (
  key     text primary key,
  name_de text not null,
  name_en text not null,
  sort    int  not null
);
alter table public.categories enable row level security;
alter table public.conditions enable row level security;
drop policy if exists categories_read on public.categories;
drop policy if exists conditions_read on public.conditions;
create policy categories_read on public.categories for select to anon, authenticated using (true);
create policy conditions_read on public.conditions for select to anon, authenticated using (true);
revoke all on public.categories, public.conditions from anon, authenticated;
grant select on public.categories, public.conditions to anon, authenticated;

insert into public.categories (key, name_de, name_en, sort) values
  ('Jacken', 'Jacken', 'Jackets', 1), ('Pullover', 'Pullover', 'Sweaters', 2), ('Shirts', 'Shirts', 'Shirts', 3),
  ('Hosen', 'Hosen', 'Pants', 4), ('Schuhe', 'Schuhe', 'Shoes', 5), ('Taschen', 'Taschen', 'Bags', 6),
  ('Schmuck', 'Schmuck', 'Jewelry', 7), ('Caps', 'Caps', 'Caps', 8), ('Gürtel', 'Gürtel', 'Belts', 9)
on conflict (key) do nothing;
insert into public.conditions (key, name_de, name_en, sort) values
  ('Neu / DS', 'Neu / DS', 'New / DS', 1), ('Sehr gut', 'Sehr gut', 'Very good', 2), ('Gut', 'Gut', 'Good', 3), ('Getragen', 'Getragen', 'Worn', 4)
on conflict (key) do nothing;

-- Unbekannte Werte werden beim Speichern zu „leer“, statt die Synchronisierung zu stören
create or replace function public.lists_normalize() returns trigger
language plpgsql as $$
begin
  if new.category is not null and not exists (select 1 from public.categories where key = new.category) then new.category := null; end if;
  if tg_table_name = 'items' then
    if new.cond is not null and not exists (select 1 from public.conditions where key = new.cond) then new.cond := null; end if;
  end if;
  return new;
end $$;
drop trigger if exists items_lists on public.items;
create trigger items_lists before insert or update on public.items for each row execute function public.lists_normalize();
drop trigger if exists wishlist_lists on public.wishlist;
create trigger wishlist_lists before insert or update on public.wishlist for each row execute function public.lists_normalize();

alter table public.items    drop constraint if exists items_category_fk;
alter table public.items    add  constraint items_category_fk foreign key (category) references public.categories(key) on update cascade;
alter table public.items    drop constraint if exists items_cond_fk;
alter table public.items    add  constraint items_cond_fk foreign key (cond) references public.conditions(key) on update cascade;
alter table public.wishlist drop constraint if exists wishlist_category_fk;
alter table public.wishlist add  constraint wishlist_category_fk foreign key (category) references public.categories(key) on update cascade;

update public.schema_info set version = 24, note = 'Listen für Kategorie und Zustand', updated_at = now();
notify pgrst, 'reload schema';
