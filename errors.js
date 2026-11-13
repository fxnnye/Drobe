// Fehlerprotokoll: schickt unerwartete Fehler (Meldung, Fundstelle im Code, Seite ohne Adressteil, App-Version) an die Datenbank,
// damit der Betreiber sie unter Einstellungen → Fehlerprotokoll sieht. Es werden keine Inhalte von Nutzern mitgeschickt.
const Errors = (() => {
  const BUILD = 233; // gleiche Zahl wie in sw.js (drobe-v78); die Tests prüfen das
  const MAX_PER_VISIT = 8;
  const IGNORE = /ResizeObserver|Script error|Load failed|NetworkError|Failed to fetch|AbortError|aborted|cancel|offline|Keine Verbindung/i;
  const seen = new Set();
  let sent = 0;
  let queue = [];
  let timer = null;

  function flush() {
    timer = null;
    const sb = typeof Cloud !== 'undefined' && Cloud.client();
    if (!sb) { if (queue.length && ++flush.tries < 10) timer = setTimeout(flush, 3000); return; }
    const batch = queue; queue = [];
    for (const e of batch) {
      try { Promise.resolve(sb.rpc('log_client_error', e)).catch(() => {}); } catch (x) { /* Protokoll darf nie selbst Fehler machen */ }
    }
  }
  flush.tries = 0;

  function report(message, stack) {
    try {
      message = String(message || '').slice(0, 400);
      if (!message || IGNORE.test(message) || !navigator.onLine || sent >= MAX_PER_VISIT) return;
      const key = message + '|' + String(stack || '').slice(0, 120);
      if (seen.has(key)) return;
      seen.add(key);
      sent++;
      queue.push({ p_message: message, p_stack: String(stack || '').slice(0, 1500), p_page: location.pathname.slice(0, 100), p_build: BUILD });
      if (!timer) timer = setTimeout(flush, 500);
    } catch (e) { /* egal */ }
  }

  window.addEventListener('error', (e) => report(e.message + (e.filename ? ' @ ' + e.filename.split('/').pop() + ':' + e.lineno : ''), e.error && e.error.stack));
  window.addEventListener('unhandledrejection', (e) => { const r = e.reason; report((r && r.message) || r, r && r.stack); });
  const orig = console.error.bind(console); // abgefangene Fehler, die die App mit console.error meldet, ebenfalls erfassen
  console.error = (...a) => { orig(...a); const x = a.find((v) => v instanceof Error); if (x) report('console: ' + x.message, x.stack); };

  return { report, BUILD };
})();
