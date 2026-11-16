-- 0050: Die Notizen eines Teils sind sichtbar, sobald das Teil öffentlich ist (öffentlich oder zum Verkauf).
-- Private Teile geben nichts heraus. Im Supabase-Dashboard unter "SQL Editor" ausführen.

create or replace function public.public_item_note(p_username text, p_id text) returns text
language sql stable security definer set search_path = public as $$
  select nullif(left(trim(i.data->>'note'), 1000), '')
  from public.items i join public.profiles p on p.user_id = i.user_id
  where p.username = lower(p_username) and i.id = p_id and i.visibility = 'public' and not i.deleted and not i.mod_hidden
$$;
revoke all on function public.public_item_note(text, text) from public;
grant execute on function public.public_item_note(text, text) to anon, authenticated;
notify pgrst, 'reload schema';
