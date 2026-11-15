-- 0045: Ein bereits übergebenes Teil kann der frühere Besitzer nicht mehr zurückholen.
-- Im Supabase-Dashboard unter "SQL Editor" ausführen.
--
-- Hängt beim Verkäufer noch eine Änderung in der Warteschlange, während der Käufer den Erhalt bestätigt, würde sie das Teil
-- beim Verkäufer sonst wieder anlegen. sync_push nimmt solche Änderungen jetzt an und verwirft sie (die App räumt beim nächsten Abgleich auf).
-- Sonst unverändert gegenüber 0035.

create or replace function public.sync_push(p_kind text, p_id text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); known boolean;
begin
  if me is null then raise exception 'Bitte melde dich an.'; end if;
  if p_kind = 'wishlist' then return jsonb_build_object('ok', true); end if;
  if p_kind not in ('items', 'outfits') then raise exception 'Ungültige Art.'; end if;
  if p_id is null or p_id !~ '^[A-Za-z0-9_-]{1,40}$' then raise exception 'Ungültige ID.'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 150000 then
    raise exception 'Eintrag ungültig oder zu groß.';
  end if;
  if p_kind = 'items' and exists (select 1 from public.item_transfer where from_user = me and item_id = p_id) then
    return jsonb_build_object('ok', true, 'ignored', 'übergeben'); -- gehört jetzt dem Käufer
  end if;
  known := case p_kind
    when 'items' then exists (select 1 from public.items where user_id = me and id = p_id)
    else exists (select 1 from public.outfits where user_id = me and id = p_id) end;
  if not known and (select (select count(*) from public.items where user_id = me)
                         + (select count(*) from public.outfits where user_id = me)) >= 2000 then
    raise exception 'Du hast die Obergrenze von 2000 Einträgen erreicht.';
  end if;
  perform public.apply_row(me, p_kind, p_id, p_data, now());
  return jsonb_build_object('ok', true);
end $$;
