-- 0042: Kleine Vorschaubilder (…-t) dürfen von anderen gelesen werden, genau wie das Hauptbild.
-- Im Supabase-Dashboard unter "SQL Editor" ausführen.
--
-- Die App legt zu jedem Teil und Outfit eine kleine Vorschau (480 px) unter dem Namen „items-<id>-t“ bzw. „outfits-<id>-t“ ab.
-- Raster und Feed laden diese statt des großen Bildes und sind dadurch deutlich schneller.
-- Die Regel bleibt so streng wie vorher: lesbar nur, wenn das Teil / Outfit öffentlich und nicht gelöscht ist.
-- Ausgangsfotos (…-src) und Bilder privater Teile bleiben gesperrt.

create or replace function public.is_public_object(obj_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.items i
                 where i.user_id::text = (storage.foldername(obj_name))[1]
                   and storage.filename(obj_name) in ('items-' || i.id, 'items-' || i.id || '-t')
                   and not i.deleted and i.visibility = 'public')
      or exists (select 1 from public.outfits o
                 where o.user_id::text = (storage.foldername(obj_name))[1]
                   and storage.filename(obj_name) in ('outfits-' || o.id, 'outfits-' || o.id || '-t')
                   and not o.deleted and o.vis = 'public')
$$;
