-- Die Tabelle public.wishlist mit allen Wunschdaten wird endgültig gelöscht (ausdrücklich freigegeben).
-- Ohne CASCADE: hängt noch etwas daran, schlägt das Löschen fehl, statt etwas Fremdes mitzureißen.
drop table public.wishlist;

update public.schema_info set version = 36, note = 'Wunschlisten-Tabelle gelöscht', updated_at = now() where true;
