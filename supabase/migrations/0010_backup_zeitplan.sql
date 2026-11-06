-- Drobe Migration 0010: die Sicherung läuft jeden Tag um 03:00 Uhr (UTC).
-- Braucht die Erweiterung pg_cron. Falls die nächste Zeile einen Fehler meldet: im Supabase-Dashboard unter
-- Database → Extensions „pg_cron“ aktivieren und diese Datei noch einmal ausführen.
create extension if not exists pg_cron;
select cron.unschedule('drobe-backup') where exists (select 1 from cron.job where jobname = 'drobe-backup');
select cron.schedule('drobe-backup', '0 3 * * *', $$select backup.snapshot()$$);
