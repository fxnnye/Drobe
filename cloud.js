// Konto und Sync: Anmeldung mit E-Mail + Benutzername + Passwort (Supabase), Abgleich mit dem lokalen Speicher.
// Lokal bleibt alles in IndexedDB, damit die App schnell ist und offline läuft; Änderungen gehen im Hintergrund ins Konto.
const Cloud = (() => {
  const SUPABASE_URL = 'https://elffmxtoxvygziiztjhd.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_3goVqjFm8wKraIugwDH5pw_QZGH23tM'; // öffentlicher Schlüssel, der Schutz liegt in den Zugriffsregeln der Datenbank
  const MAIL_DOMAIN = 'drobe.example.com'; // frühere Pseudo-Adressen, werden bei der Registrierung abgelehnt
  const MAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const isPseudo = (m) => String(m || '').toLowerCase().endsWith('@' + MAIL_DOMAIN);
  const KINDS = ['items', 'outfits', 'wishlist'];
  const imgKey = (kind) => (kind === 'outfits' ? 'thumb' : 'blob');
  const LOCAL_ONLY = ['blob', 'thumb', 'source', '_fp', '_sfp'];
  const srcPath = (kind, id) => `${user.id}/${kind}-${id}-src`; // Ausgangsfoto zum Zurückholen von Hintergrund

  let sb = null;
  let user = null; // { id, name }
  let lastSync = null;

  /* ---------- Offene Änderungen (überstehen Neustart und Offline) ---------- */
  const pendKey = () => 'drobe-pending-' + user.id;
  const readPending = () => { try { return JSON.parse(localStorage.getItem(pendKey()) || '{}'); } catch (e) { return {}; } };
  const writePending = (p) => { try { localStorage.setItem(pendKey(), JSON.stringify(p)); } catch (e) { /* Speicher voll oder gesperrt: dann gleicht der nächste Start alles ab */ } };

  let timer = null;
  function queue(kind, id, op) {
    if (!user) return;
    const p = readPending();
    p[kind + '/' + id] = { op, t: Date.now() + Math.random() };
    writePending(p);
    clearTimeout(timer);
    timer = setTimeout(flush, 400);
  }

  const dbGet = (kind, id) => tx(kind, 'readonly', (o) => o.get(id));

  async function pushPut(kind, id) {
    const rec = await dbGet(kind, id);
    if (!rec) return; // inzwischen gelöscht
    const blob = rec[imgKey(kind)];
    const fp = blob ? String(blob.size) : '';
    const path = `${user.id}/${kind}-${id}`;
    if (blob && rec._fp !== fp) {
      const { error } = await sb.storage.from('images').upload(path, blob, { upsert: true, contentType: blob.type || 'image/png' });
      if (error) throw error;
    }
    const sblob = rec.source;
    const sfp = sblob ? String(sblob.size) : '';
    if (sblob && rec._sfp !== sfp) {
      const { error } = await sb.storage.from('images').upload(srcPath(kind, id), sblob, { upsert: true, contentType: sblob.type || 'image/webp' });
      if (error) throw error;
    }
    if (!sblob && rec._sfp) await sb.storage.from('images').remove([srcPath(kind, id)]); // Ausgangsfoto wurde entfernt
    const data = {};
    for (const k of Object.keys(rec)) if (!LOCAL_ONLY.includes(k)) data[k] = rec[k];
    data.fp = fp;
    if (sfp) data.sfp = sfp;
    data.updated = rec.updated || rec.created || Date.now();
    const { error } = await sb.rpc('sync_push', { p_kind: kind, p_id: id, p_data: data });
    if (error) throw error;
    if ((blob && rec._fp !== fp) || (sblob && rec._sfp !== sfp) || (!sblob && rec._sfp)) {
      // Merken, was schon oben liegt, ohne eine neuere Bearbeitung zu überschreiben
      await tx(kind, 'readwrite', (o) => {
        const r = o.get(id);
        r.onsuccess = () => {
          const cur = r.result;
          if (!cur) return;
          if (cur[imgKey(kind)] && String(cur[imgKey(kind)].size) === fp) cur._fp = fp;
          if (cur.source && String(cur.source.size) === sfp) cur._sfp = sfp;
          if (!cur.source) delete cur._sfp;
          o.put(cur);
        };
      });
    }
  }

  async function pushDelete(kind, id) {
    // Der Eintrag bleibt als „gelöscht“ stehen, damit andere Geräte das Löschen mitbekommen
    const { error } = await sb.rpc('sync_push', { p_kind: kind, p_id: id, p_data: { deleted: true, updated: Date.now() } });
    if (error) throw error;
    await sb.storage.from('images').remove([`${user.id}/${kind}-${id}`, srcPath(kind, id)]);
  }

  let running = false, again = false;
  async function flush() {
    if (!sb || !user) return;
    if (running) { again = true; return; }
    running = true;
    try {
      do {
        again = false;
        const p = readPending();
        for (const key of Object.keys(p)) {
          const [kind, id] = key.split('/');
          if (p[key].op === 'del') await pushDelete(kind, id); else await pushPut(kind, id);
          const cur = readPending();
          if (cur[key] && cur[key].t === p[key].t) { delete cur[key]; writePending(cur); }
        }
      } while (again);
    } finally { running = false; }
  }

  /* ---------- Holen ---------- */
  async function pull() {
    const { data: rows, error } = await sb.rpc('sync_pull');
    if (error) throw error;
    const pend = readPending();
    const local = {};
    for (const k of KINDS) local[k] = new Map((await dbAll(k)).map((r) => [r.id, r]));
    const seen = new Set();
    let changed = false;
    for (const row of rows) {
      if (!KINDS.includes(row.kind)) continue;
      const key = row.kind + '/' + row.id;
      seen.add(key);
      if (pend[key]) continue; // eigene, noch nicht hochgeladene Änderung hat Vorrang
      const d = row.data || {};
      const l = local[row.kind].get(row.id);
      if (d.deleted) {
        if (l && (l.updated || 0) <= d.updated) { await rawDel(row.kind, row.id); changed = true; }
        continue;
      }
      if (!l || (l.updated || 0) < d.updated) {
        const { data: blob, error: dlErr } = await sb.storage.from('images').download(`${user.id}/${row.kind}-${row.id}`);
        if (dlErr || !blob) continue;
        const rec = { ...d, [imgKey(row.kind)]: blob, _fp: d.fp };
        delete rec.fp;
        if (d.sfp) {
          const { data: sblob } = await sb.storage.from('images').download(srcPath(row.kind, row.id));
          if (sblob) { rec.source = sblob; rec._sfp = d.sfp; }
        }
        delete rec.sfp;
        await rawPut(row.kind, rec);
        changed = true;
      } else if ((l.updated || 0) > d.updated) {
        queue(row.kind, row.id, 'put');
      }
    }
    for (const k of KINDS) {
      for (const id of local[k].keys()) if (!seen.has(k + '/' + id) && !pend[k + '/' + id]) queue(k, id, 'put');
    }
    if (changed) await reloadAll();
  }

  let syncing = false;
  async function sync() {
    if (!sb || !user || !navigator.onLine || syncing) return;
    syncing = true;
    setStatus('Synchronisiere …');
    try {
      await flush();
      await pull();
      await flush();
      lastSync = new Date();
      setStatus('Zuletzt abgeglichen: ' + lastSync.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      console.error(e);
      setStatus('Abgleich fehlgeschlagen. Beim nächsten Öffnen wird es erneut versucht.');
    } finally { syncing = false; }
  }
  function setStatus(text) { const el = $('syncStatus'); if (el) el.textContent = text; }

  let lastRun = 0;
  function syncSoon() {
    if (Date.now() - lastRun < 20000) return;
    lastRun = Date.now();
    sync();
  }

  /* ---------- Anmeldung ---------- */
  const cleanName = (s) => s.trim().toLowerCase();
  const NAME_OK = /^[a-z0-9._-]{3,20}$/;

  function authError(e) {
    const m = String((e && e.message) || e);
    if (/invalid login/i.test(m)) return 'E-Mail-Adresse oder Passwort stimmt nicht.';
    if (/Benutzername vergeben|Database error saving/i.test(m)) return 'Dieser Benutzername ist schon vergeben.';
    if (/already registered|already been registered/i.test(m)) return 'Diese E-Mail-Adresse ist schon registriert.';
    if (/not confirmed/i.test(m)) return 'Bitte bestätige zuerst deine E-Mail-Adresse. Wir haben dir dazu eine Mail geschickt.';
    if (/invalid.*email|email.*invalid/i.test(m)) return 'Diese E-Mail-Adresse sieht nicht richtig aus.';
    if (/Ungültiger Benutzername/i.test(m)) return 'Benutzername: 3 bis 20 Zeichen, nur Buchstaben, Zahlen, Punkt, Strich und Unterstrich.';
    if (/password/i.test(m)) return 'Das Passwort ist zu schwach. Nimm mindestens 8 Zeichen.';
    if (/rate limit|too many/i.test(m)) return 'Zu viele Versuche. Bitte warte kurz.';
    if (/fetch|network/i.test(m)) return 'Keine Verbindung. Prüfe dein Internet.';
    return 'Das hat nicht geklappt: ' + m;
  }

  // Anmeldefenster: aus der Gast-Ansicht heraus lässt es sich wieder schließen
  function showAuth(reg) {
    setMode(!!reg);
    document.body.classList.add('locked');
    $('auth').hidden = false;
    $('authCancel').hidden = !document.body.classList.contains('guest');
  }
  // Ohne Konto: Gäste nutzen Feed und Suche und sehen öffentliche Profile, Anmelden liegt oben rechts
  function enterGuest() {
    document.body.classList.remove('locked');
    document.body.classList.add('guest');
    $('auth').hidden = true;
    $('guestActions').hidden = false;
    Profile.start();
    showView('feed'); // Gäste landen im Feed; Suche geht auch, Nachrichten und Profil verlangen die Anmeldung
    if (linkBad) { toast('Der Link ist abgelaufen oder schon benutzt. Registriere dich erneut oder melde dich an.'); showAuth(false); }
  }

  const APP_URL = 'https://fxnnye.github.io/Drobe/';
  // Nach der Registrierung: Hinweis, dass die Mail unterwegs ist
  function showSent(name, mail) {
    const f = $('authForm');
    f.replaceChildren();
    const h = document.createElement('h1'); h.textContent = 'JAWNZ';
    const h2 = document.createElement('h2'); h2.textContent = 'Fast geschafft';
    const p = document.createElement('p'); p.textContent = `Hallo ${name}, wir haben dir eine Mail an ${mail} geschickt. Tippe darin auf „E-Mail bestätigen“, dann bist du drin. Schau auch im Spam-Ordner nach.`;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn primary full'; b.textContent = 'Zur Anmeldung';
    b.onclick = () => location.reload();
    f.append(h, h2, p, b);
  }

  let registering = false;
  function setMode(reg) {
    registering = reg;
    $('authTitle').textContent = reg ? 'Konto erstellen' : 'Anmelden';
    $('authSubmit').textContent = reg ? 'Konto erstellen' : 'Anmelden';
    $('authSwitch').textContent = reg ? 'Ich habe schon ein Konto' : 'Neues Konto erstellen';
    $('authNote').hidden = !reg;
    $('authMailRow').hidden = !reg;
    $('authMail').required = reg;
    $('authForgot').hidden = reg;
    $('authNameLabel').textContent = reg ? 'Benutzername' : 'E-Mail-Adresse';
    $('authName').maxLength = reg ? 20 : 120;
    $('authConsentRow').hidden = !reg;
    $('authPass').autocomplete = reg ? 'new-password' : 'current-password';
    $('authError').textContent = '';
  }

  function bindAuthUi() {
    $('authSwitch').onclick = () => setMode(!registering);
    let resetMail = '';
    $('authForgot').onclick = async () => {
      const err = $('authError');
      const mail = $('authName').value.trim().toLowerCase();
      if (!MAIL_OK.test(mail)) { err.textContent = 'Trag oben deine E-Mail-Adresse ein, dann schicken wir dir einen Code.'; return; }
      if (!sb) { err.textContent = 'Gerade nicht erreichbar. Prüfe dein Internet.'; return; }
      try {
        const { error } = await sb.auth.resetPasswordForEmail(mail);
        if (error) throw error;
        err.textContent = '';
        resetMail = mail;
        $('resetInfo').textContent = `Falls es ein Konto für ${mail} gibt, haben wir dir einen Code geschickt. Trag ihn hier ein.`;
        $('resetErr').textContent = '';
        $('resetDialog').showModal();
      } catch (ex) { err.textContent = authError(ex); }
    };
    $('resetCancel').onclick = () => $('resetDialog').close();
    $('resetSave').onclick = async () => {
      const err = $('resetErr');
      const code = $('resetCode').value.replace(/\s/g, '');
      const a = $('resetNew').value, b = $('resetNew2').value;
      err.textContent = '';
      if (!/^\d{6,8}$/.test(code)) { err.textContent = 'Trag den Code aus der Mail ein.'; return; }
      if (a.length < 8) { err.textContent = 'Das Passwort braucht mindestens 8 Zeichen.'; return; }
      if (a !== b) { err.textContent = 'Die beiden Passwörter sind nicht gleich.'; return; }
      $('resetSave').disabled = true;
      try {
        const v = await sb.auth.verifyOtp({ email: resetMail, token: code, type: 'recovery' });
        if (v.error) throw v.error;
        const { error } = await sb.auth.updateUser({ password: a });
        if (error) throw error;
        $('resetCode').value = ''; $('resetNew').value = ''; $('resetNew2').value = '';
        $('resetDialog').close();
        location.reload(); // mit der neuen Anmeldung starten
      } catch (ex) {
        err.textContent = /expired|invalid/i.test(String(ex && ex.message)) ? 'Der Code stimmt nicht oder ist abgelaufen. Fordere einen neuen an.' : authError(ex);
      } finally { $('resetSave').disabled = false; }
    };
    $('authCancel').onclick = () => { $('auth').hidden = true; document.body.classList.remove('locked'); };
    $('guestLogin').onclick = () => showAuth(false);
    $('guestRegister').onclick = () => showAuth(true);
    $('authForm').onsubmit = async (e) => {
      e.preventDefault();
      const typed = $('authName').value.trim();
      const pass = $('authPass').value;
      const err = $('authError');
      err.textContent = '';
      if (!sb) { err.textContent = 'Anmeldung gerade nicht erreichbar. Prüfe dein Internet.'; return; }
      if (registering) {
        const name = cleanName(typed);
        const mail = $('authMail').value.trim().toLowerCase();
        if (!MAIL_OK.test(mail) || isPseudo(mail)) { err.textContent = 'Bitte gib eine echte E-Mail-Adresse ein.'; return; }
        if (!NAME_OK.test(name)) { err.textContent = 'Benutzername: 3 bis 20 Zeichen, nur Buchstaben, Zahlen, Punkt, Strich und Unterstrich.'; return; }
        if (pass.length < 8) { err.textContent = 'Das Passwort braucht mindestens 8 Zeichen.'; return; }
        if (!$('authConsent').checked) { err.textContent = 'Bitte stimme den Nutzungsbedingungen und der Datenschutzerklärung zu.'; return; }
        $('authSubmit').disabled = true;
        try {
          const free = await sb.rpc('username_free', { p_name: name });
          if (free.error) throw free.error;
          if (free.data === false) { err.textContent = 'Dieser Benutzername ist schon vergeben.'; return; }
          const { data, error } = await sb.auth.signUp({ email: mail, password: pass, options: { data: { username: name }, emailRedirectTo: APP_URL } });
          if (error) throw error;
          $('authPass').value = '';
          if (data.session) return enter(data.session.user); // falls die Bestätigung in Supabase ausgeschaltet ist
          showSent(name, mail);
        } catch (ex) {
          err.textContent = authError(ex);
        } finally { $('authSubmit').disabled = false; }
        return;
      }
      // Anmelden: nur mit E-Mail-Adresse
      const email = typed.toLowerCase();
      if (!MAIL_OK.test(email)) { err.textContent = 'Gib deine E-Mail-Adresse ein.'; return; }
      $('authSubmit').disabled = true;
      try {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        if (!data.session) throw new Error('Anmeldung nicht abgeschlossen. Bitte versuche es erneut.');
        $('authPass').value = '';
        await enter(data.session.user);
      } catch (ex) {
        err.textContent = authError(ex);
      } finally { $('authSubmit').disabled = false; }
    };
    $('syncNowBtn').onclick = async () => {
      if (!navigator.onLine) return toast('Keine Verbindung');
      await sync();
    };
    $('pwSave').onclick = async () => {
      const msg = $('pwMsg');
      const a = $('pwNew').value, b = $('pwNew2').value;
      msg.className = 'pw-msg err';
      if (a.length < 8) { msg.textContent = 'Das Passwort braucht mindestens 8 Zeichen.'; return; }
      if (a !== b) { msg.textContent = 'Die beiden Passwörter sind nicht gleich.'; return; }
      if (!sb || !navigator.onLine) { msg.textContent = 'Dafür brauchst du eine Internetverbindung.'; return; }
      $('pwSave').disabled = true;
      try {
        const { error } = await sb.auth.updateUser({ password: a });
        if (error) throw error;
        $('pwNew').value = ''; $('pwNew2').value = '';
        msg.className = 'pw-msg';
        msg.textContent = 'Passwort geändert.';
      } catch (ex) {
        msg.textContent = authError(ex);
      } finally { $('pwSave').disabled = false; }
    };
    $('logoutBtn').onclick = async () => {
      if (sb) { try { await sb.auth.signOut(); } catch (e) { /* offline: lokal abmelden reicht */ } }
      try { localStorage.removeItem('drobe-last-user'); } catch (e) { /* egal */ }
      location.reload();
    };
  }

  // Konto endgültig löschen: erst die eigenen Bilder, dann das Konto samt Datenbank-Einträgen, zuletzt der lokale Speicher
  async function deleteAccount() {
    if (!sb || !user) throw new Error('Nicht angemeldet.');
    if (!navigator.onLine) throw new Error('Dafür brauchst du eine Internetverbindung.');
    const store = sb.storage.from('images');
    for (let guard = 0; guard < 50; guard++) {
      const { data, error } = await store.list(user.id, { limit: 100 });
      if (error) throw error;
      if (!data || !data.length) break;
      const { error: rmErr } = await store.remove(data.map((f) => `${user.id}/${f.name}`));
      if (rmErr) throw rmErr;
    }
    const { error } = await sb.rpc('delete_my_account');
    if (error) throw error;
    const id = user.id;
    try { await sb.auth.signOut(); } catch (e) { /* Konto ist ohnehin weg */ }
    try { if (typeof db !== 'undefined' && db) db.close(); indexedDB.deleteDatabase('kleiderschrank-u-' + id); } catch (e) { /* egal */ }
    try {
      for (const k of ['drobe-last-user', 'drobe-pending-' + id, 'drobe-showcase-' + id]) localStorage.removeItem(k);
    } catch (e) { /* egal */ }
    location.reload();
  }

  // Bestätigungs-Link aus der Registrierung: abgelaufen oder schon benutzt hängt Supabase als Fehler an die Adresse
  const linkBad = /error_code=(otp_expired|access_denied)|error=access_denied/.test(location.hash);
  if (linkBad) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* egal */ } }
  let confirmedNow = /type=(signup|email_change)/.test(location.hash);
  async function enter(u) {
    let name = (u.user_metadata && u.user_metadata.username) || u.name;
    if (sb && navigator.onLine && u.email) {
      try { const r = await sb.rpc('my_username'); if (r.data) name = r.data; } catch (e) { /* offline: gemerkter Name */ }
    }
    user = { id: u.id, name, email: u.email || '' };
    try { localStorage.setItem('drobe-last-user', JSON.stringify(user)); } catch (e) { /* egal */ }
    $('auth').hidden = true;
    document.body.classList.remove('locked', 'guest');
    $('guestActions').hidden = true;
    $('accName').textContent = name;
    await startApp(user.id);
    Profile.start();
    sync();
    if (linkBad) toast('Der Link ist abgelaufen oder schon benutzt. Registriere dich erneut oder melde dich an.');
    if (confirmedNow) { confirmedNow = false; toast('E-Mail-Adresse bestätigt'); }
  }

  function loadLib() {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/supabase.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // Die App ist für genau diesen Datenbankstand gebaut. Ist die Datenbank neuer, läuft hier eine alte App-Version: neu laden.
  const SCHEMA = 29;
  async function checkSchema() {
    try {
      const { data, error } = await sb.rpc('schema_version');
      if (error || typeof data !== 'number') return;
      if (data > SCHEMA) {
        if (typeof toast === 'function') toast('Neue Version verfügbar, die App lädt neu …');
        try { const regs = await navigator.serviceWorker.getRegistrations(); for (const r of regs) await r.update(); } catch (e) { /* egal */ }
        setTimeout(() => location.reload(), 2500);
      } else if (data < SCHEMA) console.error(new Error('Datenbank veraltet: ' + data + ', App erwartet ' + SCHEMA));
    } catch (e) { /* offline */ }
  }

  async function boot() {
    bindAuthUi();
    setMode(false);
    try {
      await loadLib();
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    } catch (e) { sb = null; }
    let session = null;
    if (sb) { try { session = (await sb.auth.getSession()).data.session; } catch (e) { /* offline */ } }
    if (sb) checkSchema();
    if (session) return enter(session.user);
    // Ohne Netz bleibt der zuletzt angemeldete Nutzer mit seinen lokalen Daten nutzbar
    let last = null;
    try { last = JSON.parse(localStorage.getItem('drobe-last-user') || 'null'); } catch (e) { /* egal */ }
    if (last && last.id && (!sb || !navigator.onLine)) return enter(last);
    enterGuest();
  }

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncSoon(); });
  window.addEventListener('online', syncSoon);
  window.addEventListener('focus', syncSoon);
  window.addEventListener('pageshow', syncSoon);
  // Handy-Browser melden das Zurückkehren nicht immer: solange die App offen ist, regelmäßig nachsehen
  setInterval(() => { if (document.visibilityState === 'visible') syncSoon(); }, 60000);

  return { boot, queue, SCHEMA, client: () => sb, user: () => user, sync, showAuth, deleteAccount };
})();
