-- Globale IDs: Teile, Outfits und Wünsche sind künftig über alle Konten hinweg eindeutig.
-- Neue IDs erzeugt die App als UUID (v4). Ältere Kurz-IDs bleiben gültig; sie sind zufällig genug,
-- dass keine Doppelten vorkommen (der Index unten schlägt sonst fehl, ohne etwas zu verändern).
-- Damit können spätere Tabellen (Angebote, Nachrichten) direkt auf ein Teil verweisen.
create unique index if not exists items_id_key    on public.items (id);
create unique index if not exists outfits_id_key  on public.outfits (id);
create unique index if not exists wishlist_id_key on public.wishlist (id);

update public.schema_info set version = 23, note = 'Globale eindeutige IDs', updated_at = now();
notify pgrst, 'reload schema';
