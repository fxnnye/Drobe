-- Tauschen entfällt: bestehende Tausch-Teile werden öffentlich, neue werden automatisch so gespeichert.
-- Die Spalte swap bleibt vorerst leer bestehen und wird erst am Ende der Umstellung entfernt.
update public.items set vis = 'public', swap = null where vis = 'trade' or swap is not null;

create or replace function public.items_no_trade() returns trigger
language plpgsql as $$
begin
  if new.vis = 'trade' then new.vis := 'public'; end if;
  new.swap := null;
  return new;
end $$;

drop trigger if exists items_no_trade on public.items;
create trigger items_no_trade before insert or update on public.items
  for each row execute function public.items_no_trade();
notify pgrst, 'reload schema';
