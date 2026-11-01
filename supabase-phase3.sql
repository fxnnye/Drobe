-- Drobe Phase 3: öffentliche Profile.
-- Einmalig im Supabase-Dashboard unter "SQL Editor" ausführen (nach supabase-setup.sql).
--
-- Grundidee: Die Tabelle `records` bleibt für alle außer dem Besitzer gesperrt. Besucher bekommen Daten nur über
-- die Funktion `public_profile`, die ausschließlich freigegebene Felder von nicht-privaten Einträgen zurückgibt.
-- Notizen, Shop-Links und alles Private verlassen den Server dadurch nie.

-- 1. Profile: ein Eintrag pro Konto (Benutzername = Anzeigename) plus angepinnte Teile
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  username   text not null unique,
  showcase   text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9._-]{3,20}$'),
  constraint showcase_max check (cardinality(showcase) <= 6)
);

alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (showcase) on public.profiles to authenticated; -- nur der Showcase ist änderbar, nicht der Name

create policy "eigenes Profil lesen"  on public.profiles for select using (auth.uid() = user_id);
create policy "eigenes Profil ändern" on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Neue Konten bekommen automatisch ein Profil (Benutzername = Teil vor dem @ der Pseudo-Adresse)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare uname text := lower(split_part(new.email, '@', 1));
begin
  if uname ~ '^[a-z0-9._-]{3,20}$' then
    insert into public.profiles (user_id, username) values (new.id, uname) on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profile für schon vorhandene Konten nachtragen
insert into public.profiles (user_id, username)
select id, lower(split_part(email, '@', 1)) from auth.users
where lower(split_part(email, '@', 1)) ~ '^[a-z0-9._-]{3,20}$'
on conflict do nothing;

-- 2. Was ist öffentlich? Fehlt `vis`, gilt ein Eintrag als privat.
create or replace function public.is_public_record(k text, d jsonb) returns boolean
language sql immutable as $$
  select coalesce(d->>'deleted', 'false') <> 'true' and case k
    when 'items'    then coalesce(d->>'vis', 'private') in ('public', 'trade', 'sale')
    when 'wishlist' then coalesce(d->>'vis', 'private') = 'public'
    when 'outfits'  then coalesce(d->>'vis', 'private') = 'public'
    else false
  end
$$;

-- 3. Die öffentliche Abfrage: nur freigegebene Felder nicht-privater Einträge
create or replace function public.public_profile(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where username = lower(p_username);
  if not found then return null; end if;

  return jsonb_build_object(
    'username', p.username,
    'showcase', to_jsonb(p.showcase),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'path', r.user_id::text || '/items-' || r.id,
        'name', r.data->>'name', 'category', r.data->>'category',
        'brand', r.data->>'brand', 'size', r.data->>'size', 'sku', r.data->>'sku',
        'cond', r.data->>'cond', 'rarity', r.data->>'rarity', 'vis', r.data->>'vis',
        'price', case when r.data->>'vis' = 'sale' then r.data->'price' end,
        'swap',  case when r.data->>'vis' = 'trade' then r.data->>'swap' end
      ) order by r.updated_at desc)
      from (select * from public.records x
            where x.user_id = p.user_id and x.kind = 'items' and public.is_public_record('items', x.data)
            limit 500) r
    ), '[]'::jsonb),
    'outfits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'path', r.user_id::text || '/outfits-' || r.id,
        'name', r.data->>'name'
      ) order by r.updated_at desc)
      from (select * from public.records x
            where x.user_id = p.user_id and x.kind = 'outfits' and public.is_public_record('outfits', x.data)
            limit 200) r
    ), '[]'::jsonb),
    'wishlist', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'path', r.user_id::text || '/wishlist-' || r.id,
        'name', r.data->>'name', 'category', r.data->>'category',
        'brand', r.data->>'brand', 'size', r.data->>'size', 'sku', r.data->>'sku'
      ) order by r.updated_at desc)
      from (select * from public.records x
            where x.user_id = p.user_id and x.kind = 'wishlist' and public.is_public_record('wishlist', x.data)
            limit 500) r
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.public_profile(text) from public;
grant execute on function public.public_profile(text) to anon, authenticated;

-- 4. Bilder: Besucher bekommen (signierte) Links nur für Fotos nicht-privater Einträge.
--    Das Ausgangsfoto (…-src) ist nie dabei, weil der Dateiname genau `art-id` sein muss.
create or replace function public.is_public_object(obj_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.records r
    where r.user_id::text = (storage.foldername(obj_name))[1]
      and r.kind || '-' || r.id = storage.filename(obj_name)
      and public.is_public_record(r.kind, r.data)
  )
$$;

create policy "öffentliche Bilder lesen" on storage.objects for select to anon, authenticated
  using (bucket_id = 'images' and public.is_public_object(name));
