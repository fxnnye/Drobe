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

  function card(rec, urls, tags) {
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

    const byId = new Map(data.items.map((i) => [i.id, i]));
    const pinned = data.showcase.map((id) => byId.get(id)).filter(Boolean);
    if (pinned.length) box.append(section('Showcase', pinned.map((i) => card(i, urls, itemTags(i))), 'pub-showcase'));
    if (data.items.length) box.append(section('Schrank', data.items.map((i) => card(i, urls, itemTags(i)))));
    if (data.outfits.length) box.append(section('Outfits', data.outfits.map((o) => card(o, urls))));
    if (data.wishlist.length) box.append(section('Gesucht', data.wishlist.map((w) => card(w, urls))));
    if (!data.items.length && !data.outfits.length && !data.wishlist.length) box.append(el('p', 'muted', 'Hier ist noch nichts öffentlich.'));
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
    if (Cloud.user()) loadOwn();
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

  return { start, isPinned, setPinned, search };
})();
