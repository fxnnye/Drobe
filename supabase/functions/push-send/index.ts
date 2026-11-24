// Schickt die vorgemerkten Mitteilungen (Tabelle push_queue, Migration 0059) an die iOS-Geräte über Apple (APNs).
// Der Aufruf ist nur ein Signal ohne Inhalt (Datenbank-Auslöser, wie bei notify-report): die Funktion holt die offenen Einträge selbst
// und markiert sie vorher als gesendet. Verify JWT ist deshalb abgeschaltet.
// Geheimnisse (Edge Functions → Secrets): APNS_KEY (Inhalt der .p8-Datei), APNS_KEY_ID, APNS_TEAM_ID. Optional APNS_TOPIC (Standard de.jawnz.app).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TOPIC = Deno.env.get('APNS_TOPIC') || 'de.jawnz.app';

const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

let cached: { jwt: string; at: number } | null = null;
async function providerToken(): Promise<string> {
  if (cached && Date.now() - cached.at < 40 * 60 * 1000) return cached.jwt; // Apple verlangt eine Erneuerung höchstens alle 20, spätestens nach 60 Minuten
  const pem = (Deno.env.get('APNS_KEY') || '').replace(/\\n/g, '\n');
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'ES256', kid: Deno.env.get('APNS_KEY_ID') })));
  const body = b64url(new TextEncoder().encode(JSON.stringify({ iss: Deno.env.get('APNS_TEAM_ID'), iat: Math.floor(Date.now() / 1000) })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(head + '.' + body));
  cached = { jwt: head + '.' + body + '.' + b64url(sig), at: Date.now() };
  return cached.jwt;
}

Deno.serve(async () => {
  if (!Deno.env.get('APNS_KEY') || !Deno.env.get('APNS_KEY_ID') || !Deno.env.get('APNS_TEAM_ID')) return new Response('APNS-Geheimnisse fehlen', { status: 500 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // Alte, längst gesendete Einträge aufräumen
  await db.from('push_queue').delete().lt('created_at', new Date(Date.now() - 7 * 86400000).toISOString());
  // Offene Einträge auf einmal beanspruchen (ein zweiter Aufruf bekommt sie dann nicht noch einmal)
  const { data: due, error: e1 } = await db.from('push_queue').select('id').is('sent_at', null).order('created_at').limit(50);
  if (e1) return new Response('Fehler: ' + e1.message, { status: 500 });
  if (!due || !due.length) return new Response('nichts zu tun');
  const { data: rows, error: e2 } = await db.from('push_queue').update({ sent_at: new Date().toISOString() }).in('id', due.map((r) => r.id)).is('sent_at', null)
    .select('id, user_id, kind, title, body, link');
  if (e2) return new Response('Fehler: ' + e2.message, { status: 500 });
  if (!rows || !rows.length) return new Response('schon verschickt');

  let jwt: string;
  try { jwt = await providerToken(); } catch (e) {
    await db.from('push_queue').update({ sent_at: null }).in('id', rows.map((r) => r.id));
    return new Response('APNS_KEY unbrauchbar: ' + (e as Error).message, { status: 500 });
  }
  const { data: devices } = await db.from('push_device').select('token, user_id, env').in('user_id', [...new Set(rows.map((r) => r.user_id))]);
  let sent = 0, failed = 0;
  for (const r of rows) {
    for (const d of (devices || []).filter((x) => x.user_id === r.user_id)) {
      const host = d.env === 'sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
      try {
        const res = await fetch(`https://${host}/3/device/${d.token}`, {
          method: 'POST',
          headers: { authorization: 'bearer ' + jwt, 'apns-topic': TOPIC, 'apns-push-type': 'alert', 'apns-priority': '10', 'content-type': 'application/json' },
          body: JSON.stringify({
            aps: { alert: { title: r.title, body: r.body }, sound: 'default', 'thread-id': r.kind },
            link: r.link || 'messages',
          }),
        });
        if (res.ok) { sent++; continue; }
        failed++;
        const reason = await res.text();
        // Gerät ist nicht mehr gültig (App gelöscht, Token abgelaufen): Eintrag entfernen
        if (res.status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(reason)) await db.from('push_device').delete().eq('token', d.token);
        console.log('APNs', res.status, reason);
      } catch (e) { failed++; console.log('APNs-Fehler', (e as Error).message); }
    }
  }
  return new Response(`gesendet: ${sent}, fehlgeschlagen: ${failed}`);
});
