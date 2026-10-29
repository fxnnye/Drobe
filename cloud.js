// Konto und Sync: Anmeldung mit Benutzername + Passwort (Supabase), Abgleich mit dem lokalen Speicher.
// Lokal bleibt alles in IndexedDB, damit die App schnell ist und offline läuft; Änderungen gehen im Hintergrund ins Konto.
const Cloud = (() => {
  const SUPABASE_URL = 'https://elffmxtoxvygziiztjhd.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_3goVqjFm8wKraIugwDH5pw_QZGH23tM'; // öffentlicher Schlüssel, der Schutz liegt in den Zugriffsregeln der Datenbank
  const MAIL_DOMAIN = 'drobe.example.com'; // es wird nie eine Mail verschickt, der Benutzername wird nur zu einer Pseudo-Adresse
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
    const { error } = await sb.from('records').upsert({ kind, id, data }, { onConflict: 'user_id,kind,id' });
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
    const { error } = await sb.from('records').upsert({ kind, id, data: { deleted: true, updated: Date.now() } }, { onConflict: 'user_id,kind,id' });
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
    const { data: rows, error } = await sb.from('records').select('kind,id,data').range(0, 4999);
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

  async function sync() {
    if (!sb || !user || !navigator.onLine) return;
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
    }
  }
  function setStatus(text) { const el = $('syncStatus'); if (el) el.textContent = text; }

  let lastRun = 0;
  function syncSoon() {
    if (Date.now() - lastRun < 20000) return;
    lastRun = Date.now();
    sync();
  }

  /* ---------- Anmeldung ---------- */
  const toMail = (name) => `${name}@${MAIL_DOMAIN}`;
  const cleanName = (s) => s.trim().toLowerCase();
  const NAME_OK = /^[a-z0-9._-]{3,20}$/;

  function authError(e) {
    const m = String((e && e.message) || e);
    if (/invalid login/i.test(m)) return 'Benutzername oder Passwort stimmt nicht.';
    if (/already registered|already been registered/i.test(m)) return 'Dieser Benutzername ist schon vergeben.';
    if (/password/i.test(m)) return 'Das Passwort ist zu schwach. Nimm mindestens 8 Zeichen.';
    if (/rate limit|too many/i.test(m)) return 'Zu viele Versuche. Bitte warte kurz.';
    if (/fetch|network/i.test(m)) return 'Keine Verbindung. Prüfe dein Internet.';
    return 'Das hat nicht geklappt: ' + m;
  }

  function showAuth() {
    document.body.classList.add('locked');
    $('auth').hidden = false;
  }

  let registering = false;
  function setMode(reg) {
    registering = reg;
    $('authTitle').textContent = reg ? 'Konto erstellen' : 'Anmelden';
    $('authSubmit').textContent = reg ? 'Konto erstellen' : 'Anmelden';
    $('authSwitch').textContent = reg ? 'Ich habe schon ein Konto' : 'Neues Konto erstellen';
    $('authNote').hidden = !reg;
    $('authPass').autocomplete = reg ? 'new-password' : 'current-password';
    $('authError').textContent = '';
  }

  function bindAuthUi() {
    $('authSwitch').onclick = () => setMode(!registering);
    $('authForm').onsubmit = async (e) => {
      e.preventDefault();
      const name = cleanName($('authName').value);
      const pass = $('authPass').value;
      const err = $('authError');
      err.textContent = '';
      if (!NAME_OK.test(name)) { err.textContent = 'Benutzername: 3 bis 20 Zeichen, nur Buchstaben, Zahlen, Punkt, Strich und Unterstrich.'; return; }
      if (registering && pass.length < 8) { err.textContent = 'Das Passwort braucht mindestens 8 Zeichen.'; return; }
      if (!sb) { err.textContent = 'Anmeldung gerade nicht erreichbar. Prüfe dein Internet.'; return; }
      $('authSubmit').disabled = true;
      try {
        const args = { email: toMail(name), password: pass };
        const { data, error } = registering ? await sb.auth.signUp(args) : await sb.auth.signInWithPassword(args);
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

  async function enter(u) {
    const name = (u.email || '').split('@')[0] || u.name || '';
    user = { id: u.id, name };
    try { localStorage.setItem('drobe-last-user', JSON.stringify(user)); } catch (e) { /* egal */ }
    $('auth').hidden = true;
    document.body.classList.remove('locked');
    $('accName').textContent = name;
    await startApp(user.id);
    sync();
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

  async function boot() {
    bindAuthUi();
    setMode(false);
    try {
      await loadLib();
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    } catch (e) { sb = null; }
    let session = null;
    if (sb) { try { session = (await sb.auth.getSession()).data.session; } catch (e) { /* offline */ } }
    if (session) return enter(session.user);
    // Ohne Netz bleibt der zuletzt angemeldete Nutzer mit seinen lokalen Daten nutzbar
    let last = null;
    try { last = JSON.parse(localStorage.getItem('drobe-last-user') || 'null'); } catch (e) { /* egal */ }
    if (last && last.id && (!sb || !navigator.onLine)) return enter(last);
    showAuth();
  }

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncSoon(); });
  window.addEventListener('online', syncSoon);

  return { boot, queue };
})();
