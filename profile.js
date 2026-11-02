// Öffentliche Profile: Ansicht für Gäste und Besucher (#/u/<name>), Vorschau des eigenen Profils und der Showcase.
// Besucher bekommen Daten nur über die Funktion `public_profile` auf dem Server (siehe supabase-phase3.sql):
// Was nicht öffentlich ist, wird dort gar nicht erst ausgeliefert. Dieser Code zeigt nur an, was zurückkommt.
const Profile = (() => {
  const SHOWCASE_MAX = 6;
  const parseHash = () => { const m = /^#\/u\/([a-z0-9._-]{3,20})$/i.exec(location.hash); return m ? m[1].toLowerCase() : null; };
  const profileLink = (name) => location.origin + location.pathname + '#/u/' + name;
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text; // immer textContent: Inhalte anderer Nutzer sind nie HTML
    return e;
  };
  const body = document.body;
  let viewing = false;
  let started = false;
  let showcase = []; // IDs der eigenen angepinnten Teile

  /* ---------- Eigener Showcase ---------- */
  const scKey = () => 'drobe-showcase-' + Cloud.user().id;
  const readLocal = () => { try { return JSON.parse(localStorage.getItem(scKey()) || 'null'); } catch (e) { return null; } };
  const writeLocal = (ids, dirty) => { try { localStorage.setItem(scKey(), JSON.stringify({ ids, dirty })); } catch (e) { /* nur lokal, egal */ } };

  async function pushShowcase() {
    const sb = Cloud.client(), u = Cloud.user();
    if (!sb || !u || !navigator.onLine) return;
    const { error } = await sb.from('profiles').update({ showcase }).eq('user_id', u.id);
    if (error) throw error;
    writeLocal(showcase, false);
  }
  async function loadOwn() {
    const sb = Cloud.client(), u = Cloud.user();
    if (!sb || !u) return;
    const local = readLocal();
    showcase = local ? local.ids : [];
    try {
      if (local && local.dirty) { await pushShowcase(); return; }
      if (!navigator.onLine) return;
      const { data, error } = await sb.from('profiles').select('showcase').maybeSingle();
      if (error) throw error;
      if (data) { showcase = data.showcase || []; writeLocal(showcase, false); }
    } catch (e) { console.error(e); /* Profil-Tabelle fehlt noch oder kein Netz: lokaler Stand bleibt */ }
  }
  const isPinned = (id) => showcase.includes(id);
  // Pinnt ein Teil an oder löst es; false, wenn schon 6 angepinnt sind
  function setPinned(id, on) {
    const has = showcase.includes(id);
    if (on === has) return true;
    if (on && showcase.length >= SHOWCASE_MAX) { toast('Du kannst bis zu ' + SHOWCASE_MAX + ' Teile anpinnen'); return false; }
    showcase = on ? [...showcase, id] : showcase.filter((x) => x !== id);
    writeLocal(showcase, true);
    pushShowcase().catch((e) => console.error(e)); // klappt es nicht, bleibt der Stand lokal markiert und geht beim nächsten Start hoch
    return true;
  }

  /* ---------- Öffentliche Ansicht ---------- */
  async function signedUrls(sb, paths) {
    const out = {};
    for (let i = 0; i < paths.length; i += 200) {
      const { data } = await sb.storage.from('images').createSignedUrls(paths.slice(i, i + 200), 3600);
      for (const r of data || []) if (r.signedUrl) out[r.path] = r.signedUrl;
    }
    return out;
  }
  const money = (n) => Number(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

  /* ---------- Treffer: passt ein Wunsch zu einem Teil? ---------- */
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').trim();
  const words = (s) => norm(s).split(/\s+/).filter((t) => t.length >= 3);
  // Gleiche Artikelnummer ist ein sicherer Treffer; sonst müssen Marke gleich sein, die Größe (falls beide angegeben) passen
  // und mindestens die Hälfte der Wörter aus dem Wunschnamen im Namen des Teils vorkommen.
  function matches(wish, item) {
    if (wish.sku && item.sku && norm(wish.sku).replace(/ /g, '') === norm(item.sku).replace(/ /g, '')) return true;
    if (!wish.brand || !item.brand || norm(wish.brand) !== norm(item.brand)) return false;
    if (wish.size && item.size && norm(wish.size) !== norm(item.size)) return false;
    const a = words(wish.name), b = new Set(words(item.name));
    return !a.length || a.filter((t) => b.has(t)).length >= Math.ceil(a.length / 2);
  }
  const mine = (k) => (k === 'items' ? (typeof items !== 'undefined' ? items : []) : (typeof wishlist !== 'undefined' ? wishlist : []));

  function card(rec, urls, tags, action) {
    const c = el('div', 'card');
    const img = el('div', 'img');
    if (urls[rec.path]) { const i = el('img'); i.alt = ''; i.src = urls[rec.path]; img.append(i); }
    const meta = el('div', 'meta');
    meta.append(el('b', null, rec.name || ''));
    const sub = [rec.brand, rec.size].filter(Boolean).join(' · ');
    if (sub) meta.append(el('span', null, sub));
    if (tags && tags.length) {
      const row = el('div', 'pub-tags');
      for (const [text, cls] of tags) row.append(el('span', 'pub-tag' + (cls ? ' ' + cls : ''), text));
      meta.append(row);
    }
    if (action) {
      const b = el('button', 'btn pub-action', action.label);
      b.type = 'button';
      b.onclick = action.fn;
      meta.append(b);
      if (action.alt) {
        const r = el('button', 'pub-report', action.alt.label);
        r.type = 'button';
        r.onclick = action.alt.fn;
        meta.append(r);
      }
    }
    c.append(img, meta);
    return c;
  }
  const itemTags = (it) => {
    const t = [];
    if (it.vis === 'sale') t.push([it.price != null ? 'Verkauf · ' + money(it.price) : 'Zum Verkauf', 'hot']);
    if (it.vis === 'trade') t.push(['Tausch' + (it.swap ? ' · sucht: ' + it.swap : ''), 'hot']);
    if (it.rarity && it.rarity !== 'Alltag') t.push([it.rarity, '']);
    if (it.cond) t.push([it.cond, '']);
    return t;
  };
  function section(title, cards, cls) {
    const s = el('div', 'pub-section');
    s.append(el('h3', null, title));
    const g = el('div', 'grid' + (cls ? ' ' + cls : ''));
    g.append(...cards);
    s.append(g);
    return s;
  }

  function message(box, text) { box.querySelector('.pub-msg')?.remove(); box.append(el('p', 'muted pub-msg', text)); }

  async function render(name) {
    const box = $('publicView');
    box.replaceChildren();
    const back = el('button', 'btn pub-back', Cloud.user() ? '← Zurück zu Drobe' : '← Zur Startseite');
    back.type = 'button';
    back.onclick = leave;
    box.append(back);
    message(box, 'Lade …');
    const sb = Cloud.client();
    if (!sb || !navigator.onLine) return message(box, 'Zum Ansehen von Profilen brauchst du eine Internetverbindung.');
    let data, urls = {};
    try {
      const res = await sb.rpc('public_profile', { p_username: name });
      if (res.error) throw res.error;
      data = res.data;
      if (data && Cloud.user()) await loadBlocks(sb);
      if (data) urls = await signedUrls(sb, [...data.items, ...data.outfits, ...data.wishlist].map((r) => r.path));
    } catch (e) {
      console.error(e);
      if (name === parseHash()) message(box, 'Das Profil konnte nicht geladen werden.');
      return;
    }
    if (name !== parseHash()) return; // inzwischen woanders hin gewechselt
    box.querySelector('.pub-msg')?.remove();
    if (!data) return message(box, 'Dieses Profil gibt es nicht.');

    const me = Cloud.user();
    if (me && me.name === data.username) box.append(el('p', 'pub-banner', 'So sehen andere dein Profil. Nur Öffentliches, zum Tausch oder zum Verkauf Freigegebenes ist sichtbar.'));
    box.append(el('h2', 'pub-name', data.username));
    if (me && !own) {
      const bar = el('div', 'pub-tools');
      const rb = el('button', 'btn', 'Melden');
      rb.type = 'button';
      rb.onclick = () => askReport(data.username, null);
      const bb = el('button', 'btn', blocked.has(data.username) ? 'Entsperren' : 'Sperren');
      bb.type = 'button';
      bb.onclick = async () => {
        const on = !blocked.has(data.username);
        if (on && !confirm(data.username + ' sperren? Die Person kann dir dann nichts mehr schicken.')) return;
        bb.disabled = true;
        try {
          const { error } = await Cloud.client().rpc('set_block', { p_username: data.username, p_block: on });
          if (error) throw error;
          on ? blocked.add(data.username) : blocked.delete(data.username);
          bb.textContent = on ? 'Entsperren' : 'Sperren';
          toast(on ? 'Gesperrt' : 'Entsperrt');
        } catch (e) { console.error(e); toast('Das hat nicht geklappt.'); }
        bb.disabled = false;
      };
      bar.append(rb, bb);
      box.append(bar);
    }

    // Bei fremden Profilen: „Interesse“ an Teilen, „Hab ich“ bei Wünschen und Treffer mit der eigenen Liste
    const own = !!me && me.name === data.username;
    const askLogin = () => Cloud.showAuth(false);
    const rep = (rec) => ({ label: 'Melden', fn: me ? () => askReport(data.username, rec) : askLogin });
    const wishMatch = (it) => mine('wishlist').find((w) => matches(w, it));
    const itemMatch = (w) => mine('items').find((i) => matches(w, i));
    const itemCard = (it) => {
      const tags = itemTags(it), w = !own && me ? wishMatch(it) : null;
      if (w) tags.unshift(['Passt zu deinem Wunsch: ' + w.name, 'match']);
      const buy = it.vis === 'sale';
      return card(it, urls, tags, own ? null : { label: buy ? 'Anfrage senden' : 'Interesse', fn: me ? () => askInterest('interest', data.username, it) : askLogin, alt: rep(it) });
    };
    const wishCard = (w) => {
      const m = !own && me ? itemMatch(w) : null;
      const tags = m ? [['Du hast: ' + m.name, 'match']] : [];
      return card(w, urls, tags, own ? null : { label: 'Hab ich', fn: me ? () => askInterest('have', data.username, w, m) : askLogin, alt: rep(w) });
    };
    if (!own && me) {
      const n = data.items.filter(wishMatch).length;
      if (n) box.append(el('p', 'pub-banner match', n === 1 ? 'Ein Teil hier passt zu deiner Wunschliste.' : n + ' Teile hier passen zu deiner Wunschliste.'));
    }

    const byId = new Map(data.items.map((i) => [i.id, i]));
    const pinned = data.showcase.map((id) => byId.get(id)).filter(Boolean);
    if (pinned.length) box.append(section('Showcase', pinned.map(itemCard), 'pub-showcase'));
    if (data.items.length) box.append(section('Schrank', data.items.map(itemCard)));
    if (data.outfits.length) box.append(section('Outfits', data.outfits.map((o) => card(o, urls))));
    if (data.wishlist.length) box.append(section('Gesucht', data.wishlist.map(wishCard)));
    if (!data.items.length && !data.outfits.length && !data.wishlist.length) box.append(el('p', 'muted', 'Hier ist noch nichts öffentlich.'));
  }

  /* ---------- Melden und Sperren ---------- */
  const blocked = new Set();
  async function loadBlocks(sb) {
    try {
      const { data, error } = await sb.rpc('my_blocks');
      if (error) throw error;
      blocked.clear();
      (data || []).forEach((n) => blocked.add(n));
    } catch (e) { console.error(e); }
  }
  let repCtx = null;
  function askReport(user, rec) {
    repCtx = { user, id: rec ? rec.id : null };
    $('repWhat').textContent = user + (rec ? ' · ' + (rec.name || '') : '');
    $('repReason').value = 'betrug';
    $('repNote').value = '';
    $('repError').textContent = '';
    $('reportDialog').showModal();
  }
  async function sendReport() {
    const c = repCtx, sb = Cloud.client();
    if (!c || !sb) return;
    $('repSend').disabled = true;
    try {
      const { error } = await sb.rpc('report_user', {
        p_username: c.user, p_reason: $('repReason').value, p_record_id: c.id, p_note: $('repNote').value.trim() || null,
      });
      if (error) throw error;
      $('reportDialog').close();
      toast('Danke, wir schauen es uns an');
    } catch (e) {
      console.error(e);
      $('repError').textContent = (e && e.message) || 'Das hat nicht geklappt.';
    } finally { $('repSend').disabled = false; }
  }

  /* ---------- Interesse und „Hab ich“ ---------- */
  let intCtx = null;
  function askInterest(kind, to, rec, myItem) {
    intCtx = { kind, to, rec, ref: null };
    const buy = kind === 'interest' && rec.vis === 'sale';
    $('intTitle').textContent = buy ? 'Kaufanfrage' : kind === 'interest' ? 'Interesse melden' : 'Hab ich';
    $('intPayHint').hidden = !buy;
    $('intWhat').textContent = (kind === 'interest' ? to + ' · ' : to + ' sucht · ') + (rec.name || '');
    $('intMsg').value = '';
    $('intError').textContent = '';
    // Ein passendes eigenes Teil lässt sich anhängen, wenn es öffentlich ist (sonst könnte die Person es nicht sehen)
    const pub = kind === 'have' && myItem && myItem.vis && myItem.vis !== 'private';
    $('intRefRow').hidden = !pub;
    if (pub) { intCtx.ref = myItem.id; $('intRefText').textContent = 'Mein Teil anhängen: ' + myItem.name; $('intRef').checked = true; }
    $('intMsg').placeholder = kind === 'interest' ? 'z. B. Ist es noch da?' : 'z. B. Habe ich in Größe L';
    $('interestDialog').showModal();
  }
  async function sendInterest() {
    const c = intCtx, sb = Cloud.client();
    if (!c || !sb) return;
    $('intSend').disabled = true;
    try {
      const { error } = await sb.rpc('send_interest', {
        p_to: c.to, p_kind: c.kind, p_record_id: c.rec.id,
        p_message: $('intMsg').value.trim() || null, p_ref_item: c.ref && $('intRef').checked ? c.ref : null,
      });
      if (error) throw error;
      $('interestDialog').close();
      toast(c.kind === 'interest' ? 'Interesse gesendet' : 'Gesendet');
    } catch (e) {
      console.error(e);
      $('intError').textContent = (e && e.message) || 'Das hat nicht geklappt.';
    } finally { $('intSend').disabled = false; }
  }

  /* ---------- Mitteilungen ---------- */
  async function loadInbox(markRead) {
    const sb = Cloud.client();
    if (!sb || !Cloud.user() || !navigator.onLine) return;
    let list;
    try {
      const { data, error } = await sb.rpc('my_interests');
      if (error) throw error;
      list = data || [];
      if (markRead) await sb.rpc('mark_interests_read');
    } catch (e) { console.error(e); return; }
    const unread = list.filter((x) => x.unread).length;
    $('inboxBadge').textContent = unread ? String(unread) : '';
    $('menuBtn').classList.toggle('has-unread', unread > 0 && !markRead);
    if (!markRead) return;
    $('inboxEmpty').hidden = list.length > 0;
    const box = $('inboxList');
    box.replaceChildren();
    for (const m of list) {
      const row = el('div', 'inbox-item' + (m.unread ? ' unread' : ''));
      const what = m.kind === 'interest'
        ? m.from + ' hat Interesse an „' + (m.record_name || 'einem Teil') + '“'
        : m.from + ' hat etwas zu deinem Wunsch „' + (m.record_name || 'Wunsch') + '“' + (m.ref_name ? ': ' + m.ref_name : '');
      row.append(el('b', null, what));
      if (m.message) row.append(el('p', null, m.message));
      row.append(el('span', 'muted small', new Date(m.created_at).toLocaleDateString('de-DE')));
      const open = el('button', 'btn', 'Profil ansehen');
      open.type = 'button';
      open.onclick = () => { $('settingsDialog').close(); location.hash = '#/u/' + m.from; };
      row.append(open);
      box.append(row);
    }
  }

  // Zu einem Wunsch passende öffentliche Teile anderer suchen
  async function findFor(w, box, onOpen) {
    box.replaceChildren();
    const note = (t) => box.append(el('p', 'muted small', t));
    const sb = Cloud.client();
    if (!w.brand.trim()) return note('Trag zuerst unter „Details und Sichtbarkeit“ eine Marke ein, dann kann ich passende Teile suchen.');
    if (!sb || !navigator.onLine) return note('Dafür brauchst du eine Internetverbindung.');
    note('Suche …');
    let list;
    try {
      const { data, error } = await sb.rpc('find_public_items', { p_brand: w.brand, p_query: w.name, p_size: w.size || null });
      if (error) throw error;
      list = data || [];
    } catch (e) { console.error(e); box.replaceChildren(); return note('Die Suche ist gerade nicht verfügbar.'); }
    box.replaceChildren();
    if (!list.length) return note('Noch keine passenden öffentlichen Teile.');
    for (const it of list) {
      const b = el('button', 'member', it.username + ' · ' + (it.name || '') + (it.size ? ' · ' + it.size : '') + (it.vis === 'sale' && it.price != null ? ' · ' + money(it.price) : it.vis === 'trade' ? ' · Tausch' : ''));
      b.type = 'button';
      b.onclick = () => { if (onOpen) onOpen(); location.hash = '#/u/' + it.username; };
      box.append(b);
    }
  }

  /* ---------- Navigation ---------- */
  async function route() {
    const name = parseHash();
    viewing = !!name;
    body.classList.toggle('viewing-profile', viewing);
    $('publicView').hidden = !viewing;
    $('landing').hidden = viewing || !body.classList.contains('guest');
    if (name) await render(name);
  }
  function leave() {
    history.pushState(null, '', location.pathname + location.search);
    route();
  }

  function wire() {
    window.addEventListener('hashchange', route);
    window.addEventListener('online', () => { if (readLocalSafe()?.dirty) pushShowcase().catch((e) => console.error(e)); });
    document.querySelector('.tabs').addEventListener('click', () => { if (viewing) leave(); });
    $('findForm').onsubmit = (e) => {
      e.preventDefault();
      const n = $('findName').value.trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,20}$/.test(n)) { $('findError').textContent = 'Benutzernamen haben 3 bis 20 Zeichen: Buchstaben, Zahlen, Punkt, Strich, Unterstrich.'; return; }
      $('findError').textContent = '';
      location.hash = '#/u/' + n;
    };
    document.querySelector('[data-open=profile]').addEventListener('click', () => {
      const u = Cloud.user();
      $('profLink').value = u ? profileLink(u.name) : '';
    });
    $('intCancel').onclick = () => $('interestDialog').close();
    $('repCancel').onclick = () => $('reportDialog').close();
    $('repSend').onclick = sendReport;
    $('intSend').onclick = sendInterest;
    document.querySelector('[data-open=inbox]').addEventListener('click', () => loadInbox(true));
    $('profCopy').onclick = async () => {
      const text = $('profLink').value;
      try { await navigator.clipboard.writeText(text); toast('Link kopiert'); }
      catch (e) { $('profLink').select(); toast('Link markiert, bitte kopieren'); }
    };
    $('profPreview').onclick = async () => {
      const u = Cloud.user();
      if (!u) return;
      $('settingsDialog').close();
      toast('Einen Moment …');
      try { await Cloud.sync(); } catch (e) { /* Vorschau zeigt dann den letzten Serverstand */ }
      location.hash = '#/u/' + u.name;
    };
  }
  const readLocalSafe = () => { try { return Cloud.user() ? readLocal() : null; } catch (e) { return null; } };

  // Wird vom Konto-Code nach dem Start (Gast oder angemeldet) aufgerufen
  async function start() {
    if (!started) { started = true; wire(); }
    if (Cloud.user()) { loadOwn(); loadInbox(false); }
    await route();
  }

  // Mitglieder nach Benutzername suchen (nur Profile mit öffentlichen Einträgen)
  async function search(q) {
    const sb = Cloud.client();
    if (!sb || !navigator.onLine) throw new Error('offline');
    const { data, error } = await sb.rpc('search_profiles', { p_query: q });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  // Öffentliche Teile anderer nach Marke oder Name suchen (Marke, Name oder Kategorie enthalten jedes Suchwort)
  async function fetchItems(q) {
    const sb = Cloud.client();
    if (!sb || !navigator.onLine) throw new Error('offline');
    const { data, error } = await sb.rpc('search_public_items', { p_query: q });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }
  // Treffer als Karten in `box` zeigen
  async function showItems(list, box, stale) {
    const sb = Cloud.client();
    box.replaceChildren();
    if (!list.length) return box.append(el('p', 'muted', 'Keine Teile gefunden. Gefunden werden nur Teile, die andere öffentlich gestellt haben.'));
    const urls = await signedUrls(sb, list.map((r) => r.path));
    if (stale()) return;
    box.replaceChildren();
    const grid = el('div', 'grid');
    for (const it of list) {
      const tags = itemTags(it);
      tags.push(['von ' + it.username, '']);
      grid.append(card(it, urls, tags, { label: 'Profil ansehen', fn: () => { location.hash = '#/u/' + it.username; } }));
    }
    box.append(grid);
  }

  return { start, isPinned, setPinned, search, fetchItems, showItems, findFor };
})();
