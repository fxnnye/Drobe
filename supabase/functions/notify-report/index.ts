// Schickt dem Betreiber eine Mail, wenn eine neue Meldung eingeht (Edge Function, wird vom Datenbank-Auslöser aus 0020 angestoßen).
// Der Aufruf ist nur ein Signal ohne Inhalt: die Funktion liest die noch nicht gemeldeten Meldungen selbst aus der Datenbank
// und markiert sie vorher als verschickt, damit jede Meldung genau eine Mail auslöst. Verify JWT ist deshalb abgeschaltet.
// Geheimnis: SMTP_PASS (App-Passwort von drobe.information@gmail.com) unter Edge Functions → Secrets.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const TO = 'drobe.information@gmail.com';
const FROM_USER = 'drobe.information@gmail.com';
const REASONS: Record<string, string> = {
  betrug: 'Betrugsverdacht', faelschung: 'Fälschung', belaestigung: 'Belästigung', spam: 'Spam', sonstiges: 'Sonstiges',
};

Deno.serve(async () => {
  const pass = Deno.env.get('SMTP_PASS');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // Offene, noch nicht gemeldete Meldungen auf einmal beanspruchen (zweiter Aufruf bekommt dann nichts mehr)
  const { data: due, error: e1 } = await db.from('reports').select('id').is('notified_at', null).is('resolved_at', null).order('created_at').limit(10);
  if (e1) return new Response('Fehler: ' + e1.message, { status: 500 });
  if (!due || !due.length) return new Response('nichts zu tun');
  const ids = due.map((r) => r.id);
  const { data: rows, error: e2 } = await db.from('reports').update({ notified_at: new Date().toISOString() }).in('id', ids).is('notified_at', null)
    .select('id, reason, note, record_id, created_at, reporter, target_user');
  if (e2) return new Response('Fehler: ' + e2.message, { status: 500 });
  if (!rows || !rows.length) return new Response('schon verschickt');
  const undo = () => db.from('reports').update({ notified_at: null }).in('id', rows.map((r) => r.id));
  if (!pass) { await undo(); return new Response('SMTP_PASS fehlt', { status: 500 }); }

  const users = [...new Set(rows.flatMap((r) => [r.reporter, r.target_user]))];
  const { data: profs } = await db.from('profiles').select('user_id, username').in('user_id', users);
  const name = (id: string) => profs?.find((p) => p.user_id === id)?.username ?? 'unbekannt';
  const recName = async (r: { record_id: string | null; target_user: string }) => {
    if (!r.record_id) return null;
    for (const t of ['items', 'outfits', 'wishlist']) {
      const { data } = await db.from(t).select('name').eq('user_id', r.target_user).eq('id', r.record_id).maybeSingle();
      if (data) return data.name || '(ohne Namen)';
    }
    return null;
  };

  const client = new SMTPClient({ connection: { hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: FROM_USER, password: pass } } });
  try {
    for (const r of rows) {
      const rec = await recName(r);
      const reason = REASONS[r.reason] ?? r.reason;
      const lines = [
        `Neue Meldung bei Drobe: ${reason}`,
        '',
        `Gemeldete Person: ${name(r.target_user)}`,
        `Gemeldet von: ${name(r.reporter)}`,
        rec ? `Eintrag: ${rec}` : null,
        r.note ? `Notiz: ${r.note}` : null,
        `Zeit: ${new Date(r.created_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`,
        '',
        'Ansehen und bearbeiten: Drobe öffnen → Einstellungen → Moderation',
        'https://fxnnye.github.io/Drobe/',
      ].filter((x) => x !== null).join('\n');
      await client.send({ from: `Drobe <${FROM_USER}>`, to: TO, subject: `Drobe: neue Meldung (${reason}) zu ${name(r.target_user)}`, content: lines });
    }
  } catch (e) {
    await undo(); // nicht verschickt: beim nächsten Signal erneut versuchen
    return new Response('Mail fehlgeschlagen: ' + (e as Error).message, { status: 500 });
  } finally {
    try { await client.close(); } catch { /* egal */ }
  }
  return new Response(`${rows.length} Mail(s) verschickt`);
});
