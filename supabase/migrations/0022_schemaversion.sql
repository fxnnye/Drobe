-- Schemaversion: die Datenbank weiß, auf welchem Stand sie ist. Die App fragt beim Start danach.
-- Jede weitere Migration setzt am Ende: update public.schema_info set version = <Nummer>, note = '<Kurztext>', updated_at = now();
create table if not exists public.schema_info (
  id         boolean primary key default true check (id),
  version    int not null,
  note       text,
  updated_at timestamptz not null default now()
);
alter table public.schema_info enable row level security;
revoke all on public.schema_info from anon, authenticated;

insert into public.schema_info (id, version, note) values (true, 22, 'Schemaversion eingeführt')
on conflict (id) do update set version = excluded.version, note = excluded.note, updated_at = now();

create or replace function public.schema_version() returns int
language sql stable security definer set search_path = public as $$
  select version from public.schema_info where id
$$;
revoke all on function public.schema_version() from public;
grant execute on function public.schema_version() to anon, authenticated;
notify pgrst, 'reload schema';
