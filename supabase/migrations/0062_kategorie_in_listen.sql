-- 0062: Feed, Suche, Merkliste, Staff Picks und „Ähnliche Teile“ liefern die Kategorie eines Teils mit.
-- Die App wählt damit den Schatten unter freigestellten Teilen (schatten.js: stehend oder liegend).
-- Setzt 0060 voraus. Im Supabase-Dashboard unter "SQL Editor" ausführen. Tabellen und Daten bleiben unverändert,
-- die Schemaversion auch. Die App läuft mit und ohne diese Änderung.
--
-- Die Funktionen werden nicht neu abgeschrieben: Der Block nimmt die Fassung, die gerade in der Datenbank läuft,
-- und ergänzt nur das eine Feld (Rechte, search_path und alles andere bleiben). Passt eine Funktion nicht zur
-- Erwartung, bricht er ab und nichts wird geändert. Nochmal ausführen schadet nicht.
-- Rückgängig: denselben Block mit v_add als zu ersetzendem Text und v_at als Ersatz ausführen.

do $$
declare
  v_at  constant text := $q$'brand', i.brand,$q$;
  v_add constant text := $q$'category', i.category, 'brand', i.brand,$q$;
  v_fn regprocedure;
  v_def text;
  v_hits int;
begin
  foreach v_fn in array array[
    'public.feed_public(text, timestamptz, text, text)',  -- Neu, Outfits, Folge ich
    'public.feed_rank_core(uuid, integer, integer)',      -- Für dich
    'public.search_public_items(text, text, text, text)', -- Suche
    'public.similar_public_items(text)',                  -- Ähnliche Teile
    'public.my_saves()',                                  -- Merkliste
    'public.staff_pick_list()'                            -- Staff Picks
  ]::regprocedure[] loop
    v_def := pg_get_functiondef(v_fn);
    continue when position($q$'category', i.category$q$ in v_def) > 0; -- liefert sie schon
    v_hits := (length(v_def) - length(replace(v_def, v_at, ''))) / length(v_at);
    if v_hits <> 1 then raise exception '%: erwartet 1 Stelle, gefunden %', v_fn, v_hits; end if;
    execute replace(v_def, v_at, v_add);
  end loop;
end $$;

notify pgrst, 'reload schema';
