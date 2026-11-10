-- Drobe Migration 0020: Bei jeder neuen Meldung geht eine Mail an den Betreiber.
-- Der Auslöser ruft nur die Edge Function „notify-report“ auf (ohne Inhalt); die liest die Meldungen selbst und schickt die Mail.
-- Voraussetzung: Die Funktion ist bereitgestellt (supabase/functions/notify-report) und das Secret SMTP_PASS gesetzt.
-- Einmalig im Supabase-Dashboard unter „SQL Editor“ ausführen (nach 0019).

create extension if not exists pg_net with schema extensions;

alter table public.reports add column if not exists notified_at timestamptz;
update public.reports set notified_at = coalesce(resolved_at, created_at) where notified_at is null; -- alte Meldungen lösen keine Mail aus

create or replace function public.notify_new_report() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  begin
    perform net.http_post(
      url := 'https://elffmxtoxvygziiztjhd.supabase.co/functions/v1/notify-report',
      -- der öffentliche Schlüssel der App (steht auch in cloud.js) genügt der Prüfung der Funktion; ihr Aufruf ist ohnehin nur ein Signal
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_3goVqjFm8wKraIugwDH5pw_QZGH23tM", "apikey": "sb_publishable_3goVqjFm8wKraIugwDH5pw_QZGH23tM"}'::jsonb,
      body := '{}'::jsonb
    );
  exception when others then null; -- eine fehlende Mail darf nie das Melden verhindern
  end;
  return new;
end $$;
revoke all on function public.notify_new_report() from public, anon, authenticated;

drop trigger if exists reports_notify on public.reports;
create trigger reports_notify after insert on public.reports for each row execute function public.notify_new_report();
