// Öffentliche Profile: Ansicht für Gäste und Besucher (#/u/<name>), Vorschau des eigenen Profils und der Showcase.
// Besucher bekommen Daten nur über die Funktion `public_profile` auf dem Server (siehe supabase-phase3.sql):
// Was nicht öffentlich ist, wird dort gar nicht erst ausgeliefert. Dieser Code zeigt nur an, was zurückkommt.
const Profile = (() => {
  const SHOWCASE_MAX = 6;
  const parseHash = () => { const m = /^#\/u\/([a-z0-9._-]{3,20})$/i.exec(location.hash); return m ? m[1].toLowerCase() : null; };
  const parseItemHash = () => { const m = /^#\/i\/([a-z0-9._-]{3,20})\/([A-Za-z0-9_-]{1,40})$/.exec(location.hash); return m ? { name: m[1].toLowerCase(), id: m[2] } : null; };
  const parseOutfitHash = () => { const m = /^#\/o\/([a-z0-9._-]{3,20})\/([A-Za-z0-9_-]{1,40})$/.exec(location.hash); return m ? { name: m[1].toLowerCase(), id: m[2] } : null; };
  const outfitLink = (name, id) => '#/o/' + name + '/' + id;
  const itemLink = (name, id) => '#/i/' + name + '/' + id;
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
  const scKey = () => 'jawnz-showcase-' + Cloud.user().id;
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
    for (let attempt = 0; attempt < 3; attempt++) { // fehlende Links (kurzer Netzfehler) werden noch zweimal angefragt
      const todo = [...new Set(paths)].filter((x) => x && !out[x]);
      if (!todo.length) break;
      if (attempt) await new Promise((r) => setTimeout(r, 600 * attempt));
      for (let i = 0; i < todo.length; i += 200) {
        try {
          const { data } = await sb.storage.from('images').createSignedUrls(todo.slice(i, i + 200), 3600);
          for (const r of data || []) if (r.signedUrl) out[r.path] = r.signedUrl;
        } catch (e) { /* nächster Versuch */ }
      }
    }
    return out;
  }
  const money = (n) => Number(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

  function card(rec, urls, tags, action, open) {
    const c = el('div', 'card');
    const img = el(open ? 'button' : 'div', 'img');
    if (open) { img.type = 'button'; img.onclick = open; img.setAttribute('aria-label', (rec.name || 'Teil') + ' ansehen'); }
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
      const b = action.node || el('button', 'btn pub-action', action.label);
      b.type = 'button';
      if (!action.node) b.onclick = action.fn;
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

  // Hinweis in der öffentlichen Ansicht: Ladeanzeige, Fehler mit „Nochmal versuchen“ oder schlichter Text
  function message(box, text, opts = {}) {
    box.querySelector('.pub-msg')?.remove();
    if (opts.loading) { const l = el('div', 'loading pub-msg'); l.setAttribute('role', 'status'); l.append(el('span', 'spinner'), el('span', null, text)); return box.append(l); }
    if (opts.retry) { const n = el('div', 'notice error pub-msg'); n.setAttribute('role', 'alert'); n.append(el('p', null, text)); const b = el('button', 'btn', 'Nochmal versuchen'); b.type = 'button'; b.onclick = opts.retry; n.append(b); return box.append(n); }
    box.append(el('p', 'muted pub-msg', text));
  }

  async function render(name) {
    const box = $('publicView');
    box.replaceChildren();
    box.classList.remove('has-inline-banner');
    const back = el('button', 'btn pub-back back-btn', Cloud.user() ? 'Zurück' : 'Zur Startseite');
    back.type = 'button';
    back.onclick = leave;
    box.append(back);
    message(box, 'Lade …', { loading: true });
    const sb = Cloud.client();
    if (!sb || !navigator.onLine) return message(box, 'Zum Ansehen von Profilen brauchst du eine Internetverbindung.', { retry: () => render(name) });
    let data, urls = {};
    try {
      const res = await sb.rpc('public_profile', { p_username: name });
      if (res.error) throw res.error;
      data = res.data;
      if (data && Cloud.user()) await loadBlocks(sb);
      if (data) urls = await signedUrls(sb, [...data.items, ...data.outfits].map((r) => r.path));
    } catch (e) {
      console.error(e);
      if (name === parseHash()) message(box, 'Das Profil konnte nicht geladen werden.', { retry: () => render(name) });
      return;
    }
    if (name !== parseHash()) return; // inzwischen woanders hin gewechselt
    box.querySelector('.pub-msg')?.remove();
    if (!data) return message(box, 'Dieses Profil gibt es nicht.');

    const me = Cloud.user();
    const own = !!me && me.name === data.username;
    if (me && me.name === data.username) { const ban = el('span', 'pub-banner pub-banner-inline', 'So sehen andere dein Profil.'); back.after(ban); box.classList.add('has-inline-banner'); }
    const cnt = (k, one, many) => k + ' ' + (k === 1 ? one : many);
    const head = el('div', 'me-head');
    const av = el('span', 'avatar');
    paintAvatar(av, own ? ownAvatar : null, data.username);
    const info = el('div', 'me-info');
    info.append(el('strong', null, data.username));
    info.append(el('span', 'muted small', [cnt(data.items.length, 'Teil', 'Teile'), cnt(data.outfits.length, 'Outfit', 'Outfits')].join(' · ')));
    const about = [data.city, data.followers ? cnt(data.followers, 'Follower', 'Follower') : ''].filter(Boolean).join(' · ');
    if (about) info.append(el('span', 'muted small', about));
    if (data.bio) info.append(el('span', 'small pub-bio', data.bio));
    fetchReviews(data.username).then((r) => { if (r && info.isConnected) { const rb = el('button', 'linkish small', r.count ? ratingText(r) : '0 Bewertungen'); rb.type = 'button'; rb.onclick = () => openReviews(data.username); info.append(rb); } });
    head.append(av, info);
    box.append(head);
    if (!own) avatarOf(data.username).then((url) => { if (url) paintAvatar(av, url, data.username); });
    if (me && !own) {
      const bar = el('div', 'pub-tools');
      const fb = toggle(el('button', 'btn'), 'toggle_follow', { p_username: data.username }, follows, data.username, ['Folgen', 'Du folgst']);
      fb.type = 'button';
      head.append(fb);
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

    // Bei fremden Profilen: „Interesse“ an Teilen
    const askLogin = () => Cloud.showAuth(false);
    const rep = (rec) => ({ label: 'Melden', fn: me ? () => askReport(data.username, rec) : askLogin });
    const itemCard = (it) => {
      const tags = itemTags(it);
      const buy = it.vis === 'sale';
      const open = () => { location.hash = itemLink(data.username, it.id); };
      return card(it, urls, tags, own ? null : it.vis === 'public' ? { node: saveBtn(it, data.username, 'pub-action'), alt: rep(it) } : { label: 'Anfrage senden', fn: me ? () => askInterest('interest', data.username, it) : askLogin, alt: rep(it) }, open);
    };
    // Gleicher Aufbau wie das eigene Profil: Reiter Schrank und Outfits; im Schrank Kategorie-Chips
    const byId = new Map(data.items.map((i) => [i.id, i]));
    const pinned = data.showcase.map((id) => byId.get(id)).filter(Boolean);
    if (!data.items.length && !data.outfits.length) { box.append(el('p', 'muted', 'Hier ist noch nichts öffentlich.')); return; }
    const tabs = el('div', 'subtabs');
    tabs.setAttribute('role', 'tablist');
    const pane = el('div');
    let tab = data.items.length || !data.outfits.length ? 'closet' : 'outfits', cat = 'Alle';
    const tabDefs = [['closet', 'Schrank'], ['outfits', 'Outfits', data.outfits.length]];
    const grid = (cards, cls) => { const g = el('div', 'grid' + (cls ? ' ' + cls : '')); g.append(...cards); return g; };
    const tile = (rec, sub, open, extra) => {
      const c = card(rec, urls, null, extra || null, open);
      const meta = c.querySelector('.meta');
      meta.replaceChildren(el('b', null, rec.name || ''));
      if (sub) meta.append(el('span', null, sub));
      if (extra) { const b2 = extra.node || null; if (!b2) { const bt = el('button', 'btn pub-action', extra.label); bt.type = 'button'; bt.onclick = extra.fn; meta.append(bt); } }
      return c;
    };
    const itemSub = (it) => [it.category, it.vis === 'sale' ? (it.price != null ? 'Verkauf · ' + money(it.price) : 'Zum Verkauf') : 'Öffentlich'].filter(Boolean).join(' · ');
    const itemTile = (it) => {
      const c = tile(it, itemSub(it), () => { location.hash = itemLink(data.username, it.id); });
      if (!own) withHeart(c, 'item', data.username, it.id);
      return c;
    };
    const paint = () => {
      tabs.replaceChildren();
      for (const [k, label, count] of tabDefs) {
        const b2 = el('button', 'subtab' + (k === tab ? ' active' : ''));
        b2.type = 'button';
        b2.setAttribute('role', 'tab');
        b2.append(label);
        if (count != null) { b2.append(' '); b2.append(el('span', 'badge', String(count))); }
        b2.onclick = () => { tab = k; paint(); };
        tabs.append(b2);
      }
      pane.replaceChildren();
      if (tab === 'closet') {
        if (pinned.length) pane.append(section('Showcase', pinned.map(itemTile), 'pub-showcase'));
        const chips = el('div', 'chips');
        for (const c of ['Alle', ...TOP]) {
          const b2 = el('button', 'chip' + (cat === c ? ' active' : ''), c);
          b2.type = 'button';
          b2.onclick = () => { cat = c; paint(); };
          chips.append(b2);
        }
        pane.append(chips);
        const list = data.items.filter((i) => matchesFilter(i, cat));
        pane.append(list.length ? grid(list.map(itemTile)) : el('p', 'muted', 'Nichts in dieser Kategorie.'));
      } else if (tab === 'outfits') {
        pane.append(data.outfits.length ? grid(data.outfits.map((o) => { const c = tile(o, 'Öffentlich', () => { location.hash = outfitLink(data.username, o.id); }); return c; }), 'outfits') : el('p', 'muted', 'Keine öffentlichen Outfits.'));
      }
    };
    box.append(tabs, pane);
    paint();
  }


  // Kleines Herz unten rechts im Bild: Teil oder Outfit eines anderen merken (Gast: Anmeldung)
  const HEART = (on) => '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8 3.4 5 6.5 5c2 0 3.5 1.1 4.5 2.6h2C14 6.1 15.5 5 17.5 5c3.1 0 5 3 3.8 6.3-1.8 4.6-9.3 9.2-9.3 9.2z" fill="' + (on ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  function withHeart(c, kind, username, id) {
    const img = c.querySelector('.img');
    if (!img) return;
    const wrap = el('div', 'img-wrap');
    img.replaceWith(wrap);
    const hb = el('button', 'heart-btn');
    hb.type = 'button';
    hb.setAttribute('aria-label', 'Merken');
    const set = kind === 'outfit' ? savedOutfits : saved, key = username + '/' + id;
    const rpcName = kind === 'outfit' ? 'toggle_outfit_save' : 'toggle_save';
    const args = kind === 'outfit' ? { p_username: username, p_id: id } : { p_username: username, p_item: id };
    const paintH = () => { const on = set.has(key); hb.innerHTML = HEART(on); hb.classList.toggle('on', on); hb.setAttribute('aria-pressed', on ? 'true' : 'false'); };
    paintH();
    hb.onclick = async (e) => {
      e.stopPropagation();
      if (!Cloud.user()) return Cloud.showAuth(false);
      hb.disabled = true;
      try {
        const { data, error } = await Cloud.client().rpc(rpcName, args);
        if (error) throw error;
        data ? set.add(key) : set.delete(key);
        showCounts();
        paintH();
      } catch (err) { console.error(err); toast((err && err.message) || 'Das hat nicht geklappt.'); }
      hb.disabled = false;
    };
    wrap.append(img, hb);
  }

  // Ansicht eines fremden öffentlichen Inhalts mitschreiben (Grundlage für den Feed); stört nie die Anzeige
  function logView(kind, username, id) {
    const sb = Cloud.client(), me = Cloud.user();
    if (!sb || !me || me.name === username || !navigator.onLine) return;
    sb.rpc('log_view', { p_username: username, p_kind: kind, p_id: id }).then(() => {}, () => {});
  }

  /* ---------- Outfit-Seite (#/o/<name>/<id>): das Outfit und seine öffentlichen Teile ---------- */
  async function renderOutfit(name, id) {
    const box = $('publicView');
    box.replaceChildren();
    const same = () => { const h = parseOutfitHash(); return h && h.name === name && h.id === id; };
    const back = el('button', 'btn pub-back back-btn', 'Zurück');
    back.type = 'button';
    back.onclick = () => { if (history.length > 1) history.back(); else leave(); };
    box.append(back);
    message(box, 'Lade …', { loading: true });
    const meU = Cloud.user();
    const mine = (meU && meU.name === name) || (!meU && name === 'ich');
    const lo = mine ? outfits.find((x) => x.id === id) : null;
    const sb = Cloud.client();
    if (!lo && (!sb || !navigator.onLine)) return message(box, 'Zum Ansehen brauchst du eine Internetverbindung.', { retry: () => renderOutfit(name, id) });
    let data, urls = {};
    try {
      if (lo) { // eigenes Outfit: alle Teile aus dem lokalen Schrank, auch private
        const seen = new Set(), its = [];
        let miss = 0;
        for (const l of lo.layers) { if (seen.has(l.itemId)) continue; seen.add(l.itemId); const it = itemById(l.itemId); if (it) its.push(it); else miss++; }
        data = { username: meU ? meU.name : 'ich', id: lo.id, name: lo.name, path: '__o', local: lo, total: its.length + miss, items: its.map((it) => ({ ...it, path: '__i' + it.id, vis: visOf(it) })), localItems: its };
        urls = { __o: URL.createObjectURL(lo.thumb) };
        its.forEach((it) => { urls['__i' + it.id] = urlFor(it); });
      } else {
      const res = await sb.rpc('public_outfit', { p_username: name, p_id: id });
      if (res.error) throw res.error;
      data = res.data;
      if (data) urls = await signedUrls(sb, [data.path, ...data.items.map((r) => r.path)]);
      }
    } catch (e) {
      console.error(e);
      if (same()) message(box, 'Das Outfit konnte nicht geladen werden.', { retry: () => renderOutfit(name, id) });
      return;
    }
    if (!same()) return;
    box.querySelector('.pub-msg')?.remove();
    if (!data) return message(box, 'Dieses Outfit ist nicht mehr verfügbar.');
    if (!data.local) logView('outfit', data.username, data.id);

    const page = el('div', 'outfit-page');
    const photo = el('div', 'outfit-photo');
    if (urls[data.path]) { const i = el('img'); i.alt = data.name || 'Outfit'; i.src = urls[data.path]; photo.append(i); }
    const info = el('div', 'outfit-info');
    info.append(el('h2', 'item-name', data.name || 'Outfit'));
    const owner = el('button', 'seller');
    owner.type = 'button';
    const on = el('span', 'seller-name');
    on.append(el('b', null, data.username), el('span', 'muted small', 'Zum Profil'));
    owner.append(avatarFor(data.username), on);
    owner.onclick = () => { location.hash = '#/u/' + data.username; };
    if (data.username !== 'ich') info.append(owner);
    const h = el('h3', 'outfit-sub', 'Teile in diesem Outfit');
    info.append(h);
    if (data.items.length) {
      const grid = el('div', 'grid outfit-items');
      for (const it of data.items) {
        const tags = it.vis === 'sale' && it.price != null ? [[money(it.price), 'sale']] : [];
        if (data.local) { const rec = itemById(it.id); grid.append(card(it, urls, [], null, () => openItemDialog(rec))); continue; }
        grid.append(card(it, urls, tags, null, () => { location.hash = itemLink(data.username, it.id); }));
      }
      info.append(grid);
    } else {
      info.append(el('p', 'muted', 'Die Teile dieses Outfits sind nicht öffentlich.'));
    }
    const hidden = data.total - data.items.length;
    if (data.local) {
      if (hidden > 0) info.append(el('p', 'muted small', hidden === 1 ? 'Ein Teil wurde aus dem Schrank gelöscht.' : hidden + ' Teile wurden aus dem Schrank gelöscht.'));
      const eb = el('button', 'btn primary full', 'Bearbeiten');
      eb.type = 'button';
      eb.onclick = () => { leave(); editOutfit(data.local); };
      info.append(eb);
    } else if (hidden > 0 && data.items.length) info.append(el('p', 'muted small', hidden === 1 ? 'Ein weiteres Teil ist privat.' : hidden + ' weitere Teile sind privat.'));
    const me2 = Cloud.user();
    if (!data.local && !(me2 && me2.name === data.username)) { // fremdes Outfit: mit eigenen Teilen nachbauen
      const acts = el('div', 'outfit-actions');
      const sv = el('button', 'btn save-btn');
      sv.type = 'button';
      if (!Cloud.user()) { sv.textContent = '♡ Outfit merken'; sv.onclick = () => Cloud.showAuth(false); }
      else toggle(sv, 'toggle_outfit_save', { p_username: data.username, p_id: data.id }, savedOutfits, data.username + '/' + data.id, ['♡ Outfit merken', '♥ Gemerkt']);
      const cp = el('button', 'btn primary', 'Outfit nachbauen');
      cp.type = 'button';
      acts.append(sv, cp);
      cp.onclick = me2 ? () => rebuildOutfit(data) : () => Cloud.showAuth(false);
      const hint = el('p', 'muted small', 'Setzt passende Teile aus deinem Schrank ein. Danach kannst du sie in der Liste austauschen.');
      info.insertBefore(hint, h); info.insertBefore(acts, hint);
    }
    page.append(photo, info);
    box.append(page);
  }

  // Outfit eines anderen als Vorlage: für jedes Teil das passende aus dem eigenen Schrank (gleiche Kategorie, am liebsten gleiche Marke und gleicher Name)
  async function rebuildOutfit(data) {
    if (!items.length) { toast('Dein Schrank ist noch leer. Lade zuerst Teile hoch.'); showView('add'); return; }
    state.outfit = { id: null, name: (data.name || 'Outfit') + ' (nachgebaut)', bg: '#ffffff', layers: [] };
    state.selected = null;
    history.pushState(null, '', location.pathname + location.search);
    await route();
    showView('builder');
    const low = (s) => String(s || '').toLowerCase();
    const used = new Set();
    let placed = 0;
    for (const src of data.items) {
      const cands = items.filter((i) => i.category === src.category && !used.has(i.id));
      if (!cands.length) continue;
      const pick = cands.find((i) => low(i.brand) === low(src.brand) && low(i.name) === low(src.name)) || cands.slice().sort((a, b) => (b.created || 0) - (a.created || 0))[0];
      used.add(pick.id);
      await addLayer(pick);
      placed++;
    }
    const total = data.items.length;
    toast(placed ? placed + ' von ' + total + ' Teilen eingesetzt. Tippe ein Teil in der Liste, um es zu tauschen.' : 'Kein passendes Teil in deinem Schrank gefunden. Wähle Teile aus der Liste.');
  }

  /* ---------- Detailseite eines Teils (#/i/<name>/<id>) ---------- */
  async function renderItem(name, id) {
    const box = $('publicView');
    box.replaceChildren();
    const same = () => { const h = parseItemHash(); return h && h.name === name && h.id === id; };
    const back = el('button', 'btn pub-back back-btn', 'Zurück');
    back.type = 'button';
    back.onclick = () => { if (history.length > 1) history.back(); else leave(); };
    box.append(back);
    message(box, 'Lade …', { loading: true });
    const sb = Cloud.client();
    if (!sb || !navigator.onLine) return message(box, 'Zum Ansehen brauchst du eine Internetverbindung.', { retry: () => renderItem(name, id) });
    let data, urls = {};
    try {
      const res = await sb.rpc('public_profile', { p_username: name });
      if (res.error) throw res.error;
      data = res.data;
      if (data && Cloud.user()) await loadBlocks(sb);
      if (data) urls = await signedUrls(sb, data.items.map((r) => r.path));
    } catch (e) {
      console.error(e);
      if (same()) message(box, 'Das Teil konnte nicht geladen werden.', { retry: () => renderItem(name, id) });
      return;
    }
    if (!same()) return;
    box.querySelector('.pub-msg')?.remove();
    const it = data && data.items.find((x) => x.id === id);
    if (!it) return message(box, 'Dieses Teil ist nicht mehr verfügbar.');

    const me = Cloud.user();
    const own = !!me && me.name === data.username;
    logView('item', data.username, id);
    const askLogin = () => Cloud.showAuth(false);
    if (own) box.append(el('p', 'pub-banner', 'So sehen andere dein Teil.'));

    const page = el('div', 'item-page');
    const photo = el('div', 'item-photo');
    if (urls[it.path]) { const i = el('img'); i.alt = it.name || ''; i.src = urls[it.path]; photo.append(i); }
    const info = el('div', 'item-info');
    info.append(el('h2', 'item-name', it.name || 'Teil'));
    if (it.vis === 'sale' && it.price != null) info.append(el('p', 'item-price', money(it.price)));

    const facts = el('dl', 'item-facts');
    for (const [k, v] of [['Marke', it.brand], ['Größe', it.size], ['Zustand', it.cond], ['Farbe', it.color], ['Kategorie', it.category], ['Seltenheit', it.rarity && it.rarity !== 'Alltag' ? it.rarity : '']]) {
      if (!v) continue;
      const row = el('div', 'item-fact');
      row.append(el('dt', null, k), el('dd', null, v));
      facts.append(row);
    }
    if (facts.children.length) info.append(facts);

    const seller = el('button', 'seller');
    seller.type = 'button';
    const sn = el('span', 'seller-name');
    sn.append(el('b', null, data.username), el('span', 'muted small', 'Zum Profil'));
    seller.append(avatarFor(data.username), sn);
    seller.onclick = () => { location.hash = '#/u/' + data.username; };
    info.append(seller);

    if (!own) {
      const buy = it.vis === 'sale';
      if (it.vis === 'public') { // nur gezeigt, nicht angeboten: hier gibt es nichts zu erfragen, nur zu merken
        info.append(saveBtn(it, data.username, 'primary full'));
      } else {
        const go = el('button', 'btn primary full', 'Kaufanfrage senden');
        go.type = 'button';
        go.onclick = me ? () => askInterest('interest', data.username, it) : askLogin;
        info.append(go);
        info.append(saveBtn(it, data.username, 'full'));
      }
      const rp = el('button', 'pub-report', 'Melden');
      rp.type = 'button';
      rp.onclick = me ? () => askReport(data.username, it) : askLogin;
      info.append(rp);
    }
    page.append(photo, info);
    box.append(page);

    const more = data.items.filter((x) => x.id !== id).slice(0, 6);
    if (more.length) {
      const open = (x) => () => { location.hash = itemLink(data.username, x.id); };
      box.append(section('Mehr von ' + data.username, more.map((x) => card(x, urls, itemTags(x), null, open(x)))));
    }
  }

  /* ---------- Bewertungen (nach einem erfolgreichen Kauf) ---------- */
  const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
  const ratingText = (r) => '★ ' + Number(r.avg).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' · ' + r.count + (r.count === 1 ? ' Bewertung' : ' Bewertungen');
  async function fetchReviews(name) {
    const sb = Cloud.client();
    if (!sb || !navigator.onLine) return null;
    try { const { data, error } = await sb.rpc('user_reviews', { p_username: name }); if (error) throw error; return data; } catch (e) { return null; } // Migration 0039 fehlt noch oder kein Netz
  }
  async function openReviews(name) {
    const d = $('reviewsDialog'), list = $('revList');
    $('revTitle').textContent = 'Bewertungen von ' + name;
    $('revSummary').textContent = '';
    list.replaceChildren(); message(list, 'Lade …', { loading: true });
    if (!d.open) d.showModal();
    const r = await fetchReviews(name);
    list.replaceChildren();
    if (!r) return message(list, 'Die Bewertungen konnten nicht geladen werden.');
    if (!r.count) return list.append(el('p', 'muted', 'Noch keine Bewertungen.'));
    $('revSummary').textContent = ratingText(r);
    for (const x of r.items) {
      const row = el('div', 'rev-item');
      row.append(el('b', 'rev-stars', stars(x.rating)));
      row.append(el('span', 'muted small', ' von ' + x.from + ' · ' + new Date(x.at).toLocaleDateString('de-DE')));
      if (x.comment) row.append(el('p', 'rev-text', x.comment));
      list.append(row);
    }
  }
  // Bewertung abgeben: Sterne wählen, optional ein kurzer Text; löst auf, wenn der Dialog zu ist
  function askReview(offerId, other) {
    const d = $('reviewDialog');
    let rating = 0;
    $('rvTitle').textContent = 'Bewertung für ' + other;
    $('rvText').value = ''; $('rvError').textContent = '';
    const btns = [...document.querySelectorAll('#rvStars button')];
    const paint = () => btns.forEach((b, i) => { b.textContent = i < rating ? '★' : '☆'; b.setAttribute('aria-pressed', i < rating); });
    btns.forEach((b, i) => { b.onclick = () => { rating = i + 1; paint(); }; });
    paint();
    return new Promise((resolve) => {
      const done = () => { d.onclose = null; if (d.open) d.close(); resolve(); };
      $('rvCancel').onclick = done;
      d.onclose = done;
      $('rvSend').onclick = async () => {
        if (!rating) { $('rvError').textContent = 'Bitte wähle 1 bis 5 Sterne.'; return; }
        $('rvSend').disabled = true;
        try {
          const { error } = await Cloud.client().rpc('leave_review', { p_offer: offerId, p_rating: rating, p_comment: $('rvText').value });
          if (error) throw error;
          toast('Danke für deine Bewertung');
          done();
        } catch (e) { console.error(e); $('rvError').textContent = (e && e.message) || 'Das hat nicht geklappt.'; }
        $('rvSend').disabled = false;
      };
      d.showModal();
    });
  }
  async function loadOwnRating() {
    const u = Cloud.user();
    const b = $('meRating');
    if (!u) return;
    b.onclick = () => openReviews(u.name);
    const r = await fetchReviews(u.name);
    if (r) b.textContent = r.count ? ratingText(r) : '0 Bewertungen';
  }

  /* ---------- Folgen und Merken ---------- */
  const follows = new Set(); // Benutzernamen, denen ich folge
  const saved = new Set();
  const savedOutfits = new Set();   // „benutzername/teil-id“ der gemerkten Teile
  let followerCount = 0;
  function showCounts() {
    $('meFollowers').textContent = followerCount + ' Follower';
    $('meFollowing').textContent = follows.size + ' Folge ich';
  }
  async function loadSocial() {
    const sb = Cloud.client();
    if (!sb || !Cloud.user() || !navigator.onLine) return;
    try {
      const [f, v, fr] = await Promise.all([sb.rpc('my_follows'), sb.rpc('my_save_ids'), sb.rpc('my_followers')]);
      if (!f.error) { follows.clear(); (f.data || []).forEach((n) => follows.add(n)); }
      if (!v.error) { saved.clear(); (v.data || []).forEach((n) => saved.add(n)); }
      sb.rpc('my_outfit_save_ids').then((r) => { if (!r.error) { savedOutfits.clear(); (r.data || []).forEach((n) => savedOutfits.add(n)); } }, () => {});
      if (!fr.error) followerCount = (fr.data || []).length;
      showCounts();
    } catch (e) { console.error(e); /* Funktionen fehlen noch oder kein Netz: dann gilt der letzte Stand */ }
  }
  // Schalter für Folgen oder Merken; `rpcName` liefert den neuen Zustand zurück
  function toggle(btn, rpcName, args, set, key, labels) {
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        const { data, error } = await Cloud.client().rpc(rpcName, args);
        if (error) throw error;
        data ? set.add(key) : set.delete(key);
        showCounts();
        btn.textContent = data ? labels[1] : labels[0];
        btn.classList.toggle('on', !!data);
      } catch (e) { console.error(e); toast((e && e.message) || 'Das hat nicht geklappt.'); }
      btn.disabled = false;
    };
    const on = set.has(key);
    btn.textContent = on ? labels[1] : labels[0];
    btn.classList.toggle('on', on);
    return btn;
  }

  // Merken-Knopf eines fremden Teils; ohne Konto führt er zur Anmeldung
  function saveBtn(it, username, cls) {
    const b = el('button', 'btn save-btn ' + cls);
    b.type = 'button';
    if (!Cloud.user()) { b.textContent = '♡ Merken'; b.onclick = () => Cloud.showAuth(false); return b; }
    return toggle(b, 'toggle_save', { p_username: username, p_item: it.id }, saved, username + '/' + it.id, ['♡ Merken', '♥ Gemerkt']);
  }

  // Listen unter „Profil“: wer mir folgt und wem ich folge
  async function loadPeople(which, box) {
    const sb = Cloud.client();
    if (!sb || !Cloud.user() || !navigator.onLine) return message(box, 'Dafür brauchst du eine Internetverbindung.', { retry: () => loadPeople(which, box) });
    message(box, 'Lade …', { loading: true });
    try {
      const { data, error } = await sb.rpc(which === 'followers' ? 'my_followers' : 'my_follows');
      if (error) throw error;
      const names = data || [];
      if (which === 'following') { follows.clear(); names.forEach((n) => follows.add(n)); } else followerCount = names.length;
      showCounts();
      box.replaceChildren();
      if (!names.length) return message(box, which === 'followers' ? 'Dir folgt noch niemand.' : 'Du folgst noch niemandem. Über „Suche“ findest du Mitglieder.');
      for (const n of names) {
        const b = el('button', 'member');
        b.type = 'button';
        b.append(avatarFor(n, 'md'), el('span', null, n));
        b.onclick = () => { location.hash = '#/u/' + n; };
        box.append(b);
      }
    } catch (e) { console.error(e); message(box, 'Die Liste konnte nicht geladen werden.', { retry: () => loadPeople(which, box) }); }
  }

  function openPeople(which) {
    const d = $('peopleDialog'), box = $('peopleList');
    $('peopleTitle').textContent = which === 'followers' ? 'Follower' : 'Folge ich';
    box.replaceChildren();
    loadPeople(which, box);
    box.onclick = (e) => { if (e.target.closest('.member')) d.close(); };
    if (!d.open) d.showModal();
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

  /* ---------- Interesse / Kaufanfrage ---------- */
  let intCtx = null;
  function askInterest(kind, to, rec) {
    intCtx = { kind, to, rec };
    const buy = rec.vis === 'sale';
    $('intTitle').textContent = buy ? 'Kaufanfrage' : 'Anfrage';
    $('intPayHint').hidden = !buy;
    $('intWhat').textContent = to + ' · ' + (rec.name || '');
    $('intMsg').value = '';
    $('intError').textContent = '';
    $('intMsg').placeholder = 'z. B. Ist es noch da?';
    $('interestDialog').showModal();
  }
  async function sendInterest() {
    const c = intCtx, sb = Cloud.client();
    if (!c || !sb) return;
    $('intSend').disabled = true;
    try {
      const { error } = await sb.rpc('send_interest', {
        p_to: c.to, p_kind: c.kind, p_record_id: c.rec.id,
        p_message: $('intMsg').value.trim() || null, p_ref_item: null,
      });
      if (error) throw error;
      $('interestDialog').close();
      toast('Anfrage gesendet');
      history.pushState(null, '', location.pathname + location.search); // weiter zu den Nachrichten, dort läuft die Unterhaltung
      await route();
      showView('messages');
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
    const lbox = $('inboxList');
    if (markRead && !lbox.children.length) { lbox.replaceChildren(el('div', 'loading')); lbox.firstChild.append(el('span', 'spinner'), el('span', null, 'Lade Nachrichten …')); }
    try {
      const { data, error } = await sb.rpc('my_threads');
      if (error) throw error;
      list = data || [];
    } catch (e) {
      console.error(e);
      if (markRead) { lbox.replaceChildren(); const n = el('div', 'notice error'); n.append(el('p', null, 'Die Nachrichten konnten nicht geladen werden.')); const b = el('button', 'btn', 'Nochmal versuchen'); b.type = 'button'; b.onclick = () => loadInbox(true); n.append(b); lbox.append(n); }
      return;
    }
    const unread = list.filter((x) => x.unread).length;
    $('inboxBadge').textContent = unread ? String(unread) : '';
    $('menuBtn').classList.toggle('has-unread', unread > 0 && !markRead);
    if (!markRead) return;
    inboxData = list;
    renderInbox();
  }
  // Kaufen = ich habe angefragt (oder mir bietet jemand etwas zu meinem Wunsch an), Verkaufen = jemand fragt nach meinem Teil (oder ich biete an)
  let inboxData = [], inboxTab = 'buy';
  const sideOf = (m) => (m.kind === 'team' ? 'buy' : ((m.kind === 'interest') === m.mine ? 'buy' : 'sell'));
  async function renderInbox() {
    const sb = Cloud.client();
    const box = $('inboxList');
    const buyN = inboxData.filter((m) => sideOf(m) === 'buy' && m.unread).length, sellN = inboxData.filter((m) => sideOf(m) === 'sell' && m.unread).length;
    $('msgBuyBadge').textContent = buyN || ''; $('msgSellBadge').textContent = sellN || '';
    document.querySelectorAll('#msgTabs .msg-tab').forEach((t) => { t.classList.toggle('active', t.dataset.tab === inboxTab); t.setAttribute('aria-selected', String(t.dataset.tab === inboxTab)); });
    const list = inboxData.filter((m) => sideOf(m) === inboxTab);
    $('inboxEmpty').classList.toggle('show', !list.length);
    if (!list.length) setEmpty($('inboxEmpty'), inboxTab === 'buy'
      ? { ic: 'chat', title: 'Keine Kauf-Nachrichten', text: 'Wenn du bei einem Teil nachfragst, erscheint die Unterhaltung hier.' }
      : { ic: 'chat', title: 'Keine Verkaufs-Nachrichten', text: 'Fragt jemand nach einem deiner Teile, erscheint es hier.' });
    box.replaceChildren();
    const rows = [];
    for (const m of list) {
      const row = el('button', 'inbox-item thread-row msg-row' + (m.unread ? ' unread' : ''));
      row.type = 'button';
      const subject = m.kind === 'team' ? 'Nachricht vom Drobe-Team' : m.kind === 'interest'
        ? (m.mine ? 'Interesse an „' : 'Interesse an deinem „') + (m.record_name || 'Teil') + '“'
        : (m.mine ? 'Zu „' : 'Zu deinem Wunsch „') + (m.record_name || 'Wunsch') + '“' + (m.ref_name ? ': ' + m.ref_name : '');
      const thumb = el('span', 'msg-thumb');
      const own = m.record_id && !m.mine && m.kind === 'interest' && typeof itemById === 'function' ? itemById(m.record_id) : null; // mein eigenes Teil: Foto liegt lokal
      if (own && own.blob) { const i = el('img'); i.alt = ''; i.src = urlFor(own); thumb.append(i); }
      else if (m.record_path && m.kind !== 'team') rows.push({ m, thumb });
      const main = el('span', 'msg-main');
      const top = el('span', 'thread-top');
      top.append(el('b', 'msg-title', m.kind === 'team' ? 'Drobe-Team' : (m.record_brand || m.record_name || 'Teil')), el('span', 'muted small', new Date(m.last_at).toLocaleDateString('de-DE')));
      main.append(top);
      if (m.record_brand && m.record_name) main.append(el('span', 'small msg-name', m.record_name));
      if (m.last_text) main.append(el('span', 'thread-last', (m.last_mine ? 'Du: ' : '') + m.last_text));
      const who = el('span', 'msg-who muted small');
      who.append(avatarFor(m.other, 'xs'), el('span', null, m.other));
      main.append(who);
      row.append(thumb, main);
      row.onclick = () => openThread(m, subject);
      box.append(row);
    }
    if (rows.length && sb) { // Fotos der Teile nachladen (nur öffentliche sind abrufbar)
      const urls = await signedUrls(sb, [...new Set(rows.map((r) => r.m.record_path))]);
      for (const { m, thumb } of rows) if (urls[m.record_path]) { const i = el('img'); i.alt = ''; i.src = urls[m.record_path]; thumb.append(i); }
    }
  }

  /* ---------- Unterhaltung ---------- */
  let thread = null, threadTimer = 0;
  function leaveThread() {
    clearInterval(threadTimer);
    thread = null;
    $('threadPane').hidden = true;
    document.body.classList.remove('in-thread');
    $('inboxList').hidden = false;
    $('msgTabs').hidden = false;
    document.querySelector('#view-messages .page-title').hidden = false;
  }
  function closeThread() { leaveThread(); loadInbox(true); }
  // Angebot der Unterhaltung als Karte: Verkäufer nimmt an oder lehnt ab, Käufer zieht zurück, nach der Annahme „verkauft“ oder wieder anbieten
  const OFFER_STATUS = { open: 'offen', accepted: 'angenommen', declined: 'abgelehnt', withdrawn: 'zurückgezogen' };
  function renderOffer(o) {
    const box = $('threadOffer');
    box.replaceChildren();
    box.hidden = !o;
    if (!o) return;
    const price = Number(o.amount).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
    box.append(el('b', null, 'Angebot'), el('span', null, price), el('span', 'offer-status', o.listing === 'sold' ? 'verkauft' : OFFER_STATUS[o.status] || o.status));
    const actions = el('div', 'offer-actions');
    const act = (label, cls, fn) => {
      const b = el('button', cls, label); b.type = 'button';
      b.onclick = async () => {
        b.disabled = true;
        try { await fn(); } catch (e) { console.error(e); toast((e && e.message) || 'Das hat nicht geklappt'); }
        refreshThread(true);
      };
      actions.append(b);
    };
    const rpc = async (name, args) => { const { error } = await Cloud.client().rpc(name, args); if (error) throw error; };
    if (o.listing === 'sold') {
      box.append(el('p', 'muted small offer-note', 'Dieses Teil ist verkauft.'));
      if (o.status === 'accepted') {
        if (o.reviewed) box.append(el('p', 'muted small offer-note', 'Du hast diesen Kauf bewertet.'));
        else act('Bewertung abgeben', 'btn primary', () => askReview(o.id, thread.other));
      }
    } else if (o.status === 'open' && o.seller) {
      act('Annehmen', 'btn primary', () => rpc('answer_offer', { p_offer: o.id, p_action: 'accept' }));
      act('Ablehnen', 'btn', () => rpc('answer_offer', { p_offer: o.id, p_action: 'decline' }));
    } else if (o.status === 'open' && o.buyer) {
      box.append(el('p', 'muted small offer-note', 'Der Verkäufer hat noch nicht geantwortet.'));
      act('Zurückziehen', 'btn', () => rpc('answer_offer', { p_offer: o.id, p_action: 'withdraw' }));
    } else if (o.status === 'accepted') {
      box.append(el('p', 'muted small offer-note', 'Die Bezahlung läuft direkt zwischen euch. Empfohlen: PayPal „Waren und Dienstleistungen“, sonst gibt es bei Betrug kein Geld zurück.'));
      if (o.seller) {
        act('Als verkauft markieren', 'btn primary', async () => {
          if (!(await askConfirm('Als verkauft markieren? Das Teil wird danach privat gestellt.', 'Verkauft'))) return;
          await rpc('mark_sold', { p_item: o.item_id });
          const it = typeof itemById === 'function' ? itemById(o.item_id) : null;
          if (it) {
            applyVisibility(it, 'private');
            setPinned(it.id, false);
            await dbPut('items', it);
            if (typeof renderCloset === 'function') renderCloset();
          }
          toast('Als verkauft markiert');
        });
        act('Wieder anbieten', 'btn', async () => { await rpc('release_listing', { p_item: o.item_id }); toast('Wieder im Angebot'); });
      }
    }
    if (actions.children.length) box.append(actions);
  }
  async function refreshOffer() {
    const sb = Cloud.client();
    if (!thread || !sb) return;
    const id = thread.id;
    try {
      const { data, error } = await sb.rpc('thread_offer', { p_thread: id });
      if (error) throw error;
      if (thread && thread.id === id) renderOffer(data);
    } catch (e) { console.error(e); }
  }
  async function refreshThread(scroll) {
    const sb = Cloud.client();
    if (!thread || !sb) return;
    const id = thread.id;
    refreshOffer();
    let msgs;
    try {
      const { data, error } = await sb.rpc('thread_messages', { p_interest: id });
      if (error) throw error;
      msgs = data || [];
    } catch (e) {
      console.error(e);
      const b = $('threadMsgs');
      if (thread && thread.id === id && b.querySelector('.loading')) {
        b.replaceChildren();
        const n = el('div', 'notice error'); n.append(el('p', null, 'Die Unterhaltung konnte nicht geladen werden.'));
        const r = el('button', 'btn', 'Nochmal versuchen'); r.type = 'button'; r.onclick = () => refreshThread(true); n.append(r);
        b.append(n);
      }
      return;
    }
    if (!thread || thread.id !== id) return;
    const box = $('threadMsgs');
    const atEnd = scroll || box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    const paths = msgs.filter((m) => m.image).map((m) => m.image);
    let urls = {};
    if (paths.length) {
      const { data } = await sb.storage.from('chat').createSignedUrls(paths, 3600);
      for (const r of data || []) if (r.signedUrl) urls[r.path] = r.signedUrl;
      if (!thread || thread.id !== id) return;
    }
    box.replaceChildren();
    for (const m of msgs) {
      const b = el('div', 'bubble' + (m.mine ? ' mine' : ''));
      if (m.image) {
        const a = el('a', 'bubble-img');
        a.href = urls[m.image] || '#'; a.target = '_blank'; a.rel = 'noopener';
        const im = el('img'); im.alt = 'Foto'; im.loading = 'lazy'; im.src = urls[m.image] || '';
        im.onload = () => { if (atEnd) box.scrollTop = box.scrollHeight; };
        a.append(im); b.append(a);
      }
      if (m.text) b.append(el('span', null, m.text));
      b.append( el('time', 'muted small', new Date(m.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })));
      box.append(b);
    }
    if (atEnd) box.scrollTop = box.scrollHeight;
  }
  function openThread(m, subject) {
    thread = { id: m.id, other: m.other };
    $('inboxList').hidden = true;
    $('msgTabs').hidden = true;
    $('inboxEmpty').classList.remove('show');
    document.querySelector('#view-messages .page-title').hidden = true;
    $('threadPane').hidden = false;
    document.body.classList.add('in-thread');
    $('threadWho').replaceChildren(avatarFor(m.other, 'md'), el('span', null, m.other));
    // Das Teil, um das es geht: kleines Bild, Name und Art der Anfrage
    $('threadItem').textContent = m.kind === 'team' ? 'Drobe-Team' : (m.record_name || (m.kind === 'interest' ? 'Teil' : 'Wunsch'));
    $('threadAbout').textContent = m.kind === 'team' ? 'Nachricht vom Drobe-Team' : m.kind === 'interest'
      ? (m.mine ? 'Deine Anfrage zu diesem Teil' : 'Anfrage zu deinem Teil')
      : (m.mine ? 'Dein Angebot zu diesem Wunsch' : 'Angebot zu deinem Wunsch') + (m.ref_name ? ': ' + m.ref_name : '');
    const th = $('threadThumb');
    th.replaceChildren();
    const ownIt = m.record_id && !m.mine && m.kind === 'interest' && typeof itemById === 'function' ? itemById(m.record_id) : null;
    if (ownIt && ownIt.blob) { const i = el('img'); i.alt = ''; i.src = urlFor(ownIt); th.append(i); }
    else if (m.record_path && m.kind !== 'team' && Cloud.client()) signedUrls(Cloud.client(), [m.record_path]).then((u) => { if (u[m.record_path] && thread && thread.id === m.id) { const i = el('img'); i.alt = ''; i.src = u[m.record_path]; th.replaceChildren(i); } });
    const owner = m.mine ? m.other : (Cloud.user() && Cloud.user().name);
    const box = $('threadItemBox');
    box.disabled = !(m.kind === 'interest' && m.record_id && owner);
    box.onclick = () => { if (!box.disabled) location.hash = itemLink(owner, m.record_id); };
    $('threadOffer').hidden = true;
    $('threadErr').hidden = true;
    $('threadInput').value = '';
    const tl = el('div', 'loading'); tl.append(el('span', 'spinner'), el('span', null, 'Lade …'));
    $('threadMsgs').replaceChildren(tl);
    refreshThread(true);
    clearInterval(threadTimer);
    threadTimer = setInterval(() => { if (document.hidden || !$('threadPane').offsetParent) return; refreshThread(false); }, 10000);
  }
  // Foto verkleinern (längste Seite 1280 px) und als JPEG ablegen
  function shrinkPhoto(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('Foto'))), 'image/jpeg', 0.82);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Foto')); };
      img.src = url;
    });
  }
  async function sendReply(e, file) {
    if (e) e.preventDefault();
    const text = $('threadInput').value.trim();
    const sb = Cloud.client();
    if ((!text && !file) || !thread || !sb) return;
    const err = $('threadErr');
    err.hidden = true;
    if (!navigator.onLine) { err.textContent = 'Dafür brauchst du eine Internetverbindung.'; err.hidden = false; return; }
    const btn = $('threadForm').querySelector('button');
    btn.disabled = true;
    try {
      let path = null;
      if (file) {
        const blob = await shrinkPhoto(file);
        path = thread.id + '/' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2)) + '.jpg';
        const up = await sb.storage.from('chat').upload(path, blob, { contentType: 'image/jpeg' });
        if (up.error) throw up.error;
      }
      const { error } = await sb.rpc('send_reply', { p_interest: thread.id, p_body: text, p_image: path });
      if (error) throw error;
      $('threadInput').value = '';
      await refreshThread(true);
    } catch (x) {
      console.error(x);
      err.textContent = (x && x.message) || 'Senden hat nicht geklappt.';
      err.hidden = false;
    }
    btn.disabled = false;
  }
  function wireThread() {
    $('threadBack').onclick = closeThread;
    $('threadWho').onclick = () => { if (thread) location.hash = '#/u/' + thread.other; };
    $('threadForm').onsubmit = (e) => sendReply(e);
    $('threadPhoto').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) sendReply(null, f); };
  }

  /* ---------- Eigenes Profil: Foto, Text, Stadt ---------- */
  let ownAvatar = null; // Data-URL oder null
  let pendingAvatar; // undefined = unverändert, '' = entfernen, sonst neue Data-URL
  // Zeigt ein Profilbild, sonst den Anfangsbuchstaben
  function paintAvatar(node, url, name) {
    node.replaceChildren();
    node.classList.toggle('has-img', !!url);
    if (url) { const i = el('img'); i.alt = ''; i.src = url; node.append(i); } else node.textContent = ((name || '?')[0] || '?').toUpperCase();
  }
  // Profilbild anderer: einmal je Name vom Server holen und merken, dann den Buchstaben ersetzen
  const avatarCache = new Map();
  function avatarOf(name) {
    if (!avatarCache.has(name)) {
      const sb = Cloud.client();
      avatarCache.set(name, sb && navigator.onLine
        ? sb.rpc('profile_avatar', { p_username: name }).then((r) => (r.error ? null : r.data || null), () => null)
        : Promise.resolve(null));
    }
    return avatarCache.get(name);
  }
  function avatarFor(name, cls) {
    const a = el('span', 'avatar' + (cls ? ' ' + cls : ''));
    paintAvatar(a, null, name);
    const me = Cloud.user();
    if (me && me.name === name && ownAvatar) paintAvatar(a, ownAvatar, name);
    else avatarOf(name).then((url) => { if (url) paintAvatar(a, url, name); });
    return a;
  }
  function paintOwnAvatars() {
    const u = Cloud.user();
    if ($('meAvatar')) paintAvatar($('meAvatar'), ownAvatar, u && u.name);
  }
  async function loadOwnText() {
    const sb = Cloud.client();
    if (!sb || !navigator.onLine) return;
    try {
      const { data, error } = await sb.rpc('my_profile_text');
      if (error) throw error;
      $('profBio').value = (data && data.bio) || '';
      $('profCity').value = (data && data.city) || '';
      ownAvatar = (data && data.avatar) || null;
      paintOwnAvatars();
    } catch (e) { console.error(e); }
  }
  // Ausschnitt wählen: Bild verschieben und zoomen, Ergebnis 256 × 256 px
  const crop = { bmp: null, zoom: 1, x: 0, y: 0 }; // x, y: Verschiebung des Bildmittelpunkts in Zeichenpixeln
  const CN = 256;
  function cropDraw() {
    const c = $('pfCanvas'), g = c.getContext('2d'), b = crop.bmp;
    if (!b) return;
    const s = Math.max(CN / b.width, CN / b.height) * crop.zoom, w = b.width * s, h = b.height * s;
    const mx = (w - CN) / 2, my = (h - CN) / 2; // so weit darf verschoben werden, dass der Rand nie leer bleibt
    crop.x = Math.max(-mx, Math.min(mx, crop.x));
    crop.y = Math.max(-my, Math.min(my, crop.y));
    g.fillStyle = '#fff'; g.fillRect(0, 0, CN, CN);
    g.drawImage(b, (CN - w) / 2 + crop.x, (CN - h) / 2 + crop.y, w, h);
  }
  function cropResult() { cropDraw(); return $('pfCanvas').toDataURL('image/jpeg', 0.85); }
  async function startCrop(file) {
    if (crop.bmp && crop.bmp.close) crop.bmp.close();
    crop.bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    crop.zoom = 1; crop.x = 0; crop.y = 0;
    $('pfCrop').hidden = false;
    cropDraw();
  }
  // Zoom um einen Punkt (f: Abstand zur Mitte in Zeichenpixeln); nie weiter heraus als bis das Bild den Kreis füllt
  function cropZoomTo(z, fx, fy) {
    z = Math.max(1, Math.min(5, z));
    const r = z / crop.zoom;
    crop.x = fx - (fx - crop.x) * r; crop.y = fy - (fy - crop.y) * r;
    crop.zoom = z;
    cropDraw();
  }
  function wireCrop() {
    const c = $('pfCanvas');
    const pts = new Map(); // aktive Finger/Maus
    let last = null; // Stand der Geste: Mittelpunkt und Fingerabstand
    const k = () => CN / c.getBoundingClientRect().width;
    const local = (cx, cy) => { const r = c.getBoundingClientRect(); return [(cx - r.left - r.width / 2) * k(), (cy - r.top - r.height / 2) * k()]; };
    const gesture = () => {
      const p = [...pts.values()];
      const mx = p.reduce((s, q) => s + q.x, 0) / p.length, my = p.reduce((s, q) => s + q.y, 0) / p.length;
      return { mx, my, d: p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0 };
    };
    c.onpointerdown = (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); c.setPointerCapture(e.pointerId); last = gesture(); };
    c.onpointermove = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gesture();
      crop.x += (g.mx - last.mx) * k(); crop.y += (g.my - last.my) * k();
      if (g.d && last.d) { const [fx, fy] = local(g.mx, g.my); cropZoomTo(crop.zoom * g.d / last.d, fx, fy); } else cropDraw();
      last = g;
    };
    c.onpointerup = c.onpointercancel = (e) => { pts.delete(e.pointerId); last = pts.size ? gesture() : null; };
    c.addEventListener('wheel', (e) => { e.preventDefault(); const [fx, fy] = local(e.clientX, e.clientY); cropZoomTo(crop.zoom * Math.exp(-e.deltaY / 300), fx, fy); }, { passive: false });
  }
  function openProfileEdit() {
    const u = Cloud.user();
    if (!u) return;
    pendingAvatar = undefined;
    $('pfCrop').hidden = true;
    $('pfAvatar').hidden = false;
    $('profMsg').textContent = '';
    $('profLink').value = profileLink(u.name);
    paintAvatar($('pfAvatar'), ownAvatar, u.name);
    $('pfPhotoDel').hidden = !ownAvatar;
    $('profileDialog').showModal();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // kein Fokusrahmen auf dem ersten Knopf
    loadOwnText().then(() => { if (pendingAvatar === undefined) { paintAvatar($('pfAvatar'), ownAvatar, u.name); $('pfPhotoDel').hidden = !ownAvatar; } });
  }
  async function saveOwnText() {
    const msg = $('profMsg');
    msg.className = 'pw-msg err';
    if (!Cloud.client() || !navigator.onLine) { msg.textContent = 'Dafür brauchst du eine Internetverbindung.'; return; }
    $('profTextSave').disabled = true;
    try {
      const sb = Cloud.client();
      const { error } = await sb.rpc('update_my_profile', { p_bio: $('profBio').value, p_city: $('profCity').value });
      if (error) throw error;
      if (!$('pfCrop').hidden) pendingAvatar = cropResult();
      if (pendingAvatar !== undefined) {
        const r = await sb.rpc('set_my_avatar', { p_avatar: pendingAvatar });
        if (r.error) throw r.error;
        ownAvatar = pendingAvatar || null;
        paintOwnAvatars();
      }
      $('profileDialog').close();
      toast('Profil gespeichert');
    } catch (e) { console.error(e); msg.textContent = 'Das hat nicht geklappt. Läuft die neueste Datenbank-Version?'; }
    $('profTextSave').disabled = false;
  }

  // Rückmeldung an den Melder: einmal zeigen, was aus den eigenen Meldungen wurde
  const OUTCOME = {
    hidden: 'Der gemeldete Eintrag wurde versteckt.',
    banned: 'Das Konto wurde gesperrt.',
    dismissed: 'Wir haben keinen Verstoß festgestellt.',
    done: 'Wir haben sie bearbeitet.',
  };
  async function checkReportUpdates() {
    const sb = Cloud.client();
    if (!sb || !navigator.onLine) return;
    try {
      const { data, error } = await sb.rpc('my_report_updates');
      if (error || !Array.isArray(data) || !data.length) return;
      const text = data.length === 1
        ? 'Deine Meldung zu ' + (data[0].target || 'einem Konto') + ': ' + (OUTCOME[data[0].outcome] || OUTCOME.done)
        : data.map((r) => (r.target || 'Konto') + ': ' + (OUTCOME[r.outcome] || OUTCOME.done)).join('\n');
      await sb.rpc('ack_report_updates', { p_ids: data.map((r) => r.id) });
      await askConfirm('Danke für deine Meldung.\n' + text, 'OK', true);
    } catch (e) { /* Migration 0019 fehlt noch oder kein Netz */ }
  }
  /* ---------- Navigation ---------- */
  async function route() {
    const name = parseHash(), itm = parseItemHash(), otf = parseOutfitHash();
    viewing = !!name || !!itm || !!otf;
    body.classList.toggle('viewing-profile', viewing);
    $('publicView').hidden = !viewing;
    $('landing').hidden = viewing || !body.classList.contains('guest');
    if (name) await render(name);
    else if (itm) await renderItem(itm.name, itm.id);
    else if (otf) await renderOutfit(otf.name, otf.id);
  }
  function leave() {
    history.pushState(null, '', location.pathname + location.search);
    route();
  }

  function wire() {
    window.addEventListener('hashchange', route);
    window.addEventListener('online', () => { if (readLocalSafe()?.dirty) pushShowcase().catch((e) => console.error(e)); });
    document.querySelector('.tabs').addEventListener('click', () => { if (viewing) leave(); });
    $('meProfile').onclick = openProfileEdit;
    wireCrop();
    $('pfCancel').onclick = () => $('profileDialog').close();
    $('pfPhoto').onclick = () => $('pfFile').click();
    $('pfFile').onchange = async () => {
      const f = $('pfFile').files[0];
      $('pfFile').value = '';
      if (!f) return;
      try {
        await startCrop(f);
        pendingAvatar = null; // wird beim Speichern aus dem Ausschnitt erzeugt
        $('pfAvatar').hidden = true;
        $('pfPhotoDel').hidden = false;
      } catch (e) { console.error(e); toast('Das Bild konnte nicht gelesen werden.'); }
    };
    $('pfPhotoDel').onclick = () => { pendingAvatar = ''; $('pfCrop').hidden = true; $('pfAvatar').hidden = false; paintAvatar($('pfAvatar'), null, Cloud.user().name); $('pfPhotoDel').hidden = true; };
    $('profTextSave').onclick = saveOwnText;
    $('revClose').onclick = () => $('reviewsDialog').close();
    $('peopleClose').onclick = () => $('peopleDialog').close();
    document.querySelectorAll('#msgTabs .msg-tab').forEach((t) => { t.onclick = () => { inboxTab = t.dataset.tab; renderInbox(); }; });
    $('intCancel').onclick = () => $('interestDialog').close();
    $('repCancel').onclick = () => $('reportDialog').close();
    $('repSend').onclick = sendReport;
    $('intSend').onclick = sendInterest;
    $('profCopy').onclick = async () => {
      const text = $('profLink').value;
      try { await navigator.clipboard.writeText(text); toast('Link kopiert'); }
      catch (e) { $('profLink').select(); toast('Link markiert, bitte kopieren'); }
    };
    $('profPreview').onclick = async () => {
      const u = Cloud.user();
      if (!u) return;
      $('profileDialog').close();
      toast('Einen Moment …');
      try { await Cloud.sync(); } catch (e) { /* Vorschau zeigt dann den letzten Serverstand */ }
      location.hash = '#/u/' + u.name;
    };
  }
  const readLocalSafe = () => { try { return Cloud.user() ? readLocal() : null; } catch (e) { return null; } };

  // Wird vom Konto-Code nach dem Start (Gast oder angemeldet) aufgerufen
  async function start() {
    if (!started) { started = true; wire(); wireThread(); }
    if (Cloud.user()) { loadOwn(); loadInbox(false); loadSocial(); loadOwnText(); loadOwnRating(); checkReportUpdates(); }
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
  async function fetchItems(q, f) {
    const sb = Cloud.client();
    if (!sb || !navigator.onLine) throw new Error('offline');
    const { data, error } = await sb.rpc('search_public_items', { p_query: q, p_color: (f && f.color) || null, p_size: (f && f.size) || null, p_brand: (f && f.brand) || null });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }
  // Treffer als Karten in `box` zeigen
  async function showItems(list, box, stale) {
    const sb = Cloud.client();
    box.replaceChildren();
    if (!list.length) return box.append(el('p', 'muted', 'Keine passenden Teile gefunden. Gefunden werden nur Teile, die andere öffentlich gestellt haben.'));
    const urls = await signedUrls(sb, list.map((r) => r.path));
    if (stale()) return;
    box.replaceChildren();
    const grid = el('div', 'grid');
    for (const it of list) {
      const tags = itemTags(it);
      tags.push(['von ' + it.username, '']);
      const open = () => { location.hash = itemLink(it.username, it.id); };
      grid.append(card(it, urls, tags, { label: 'Ansehen', fn: open }, open));
    }
    box.append(grid);
  }

  /* ---------- Feed ---------- */
  // kind: items, outfits, following (Teile von Profilen, denen ich folge) oder saved (gemerkte Teile, ohne Nachladen)
  async function feed(kind, before, color) {
    const sb = Cloud.client();
    if (!sb || !navigator.onLine) throw new Error('offline');
    if (kind === 'saved') {
      if (before) return [];
      const { data, error } = await sb.rpc('my_saves');
      if (error) throw error;
      const list = Array.isArray(data) ? data.slice() : [];
      try { const o = await sb.rpc('my_outfit_saves'); if (!o.error && Array.isArray(o.data)) list.push(...o.data); } catch (e) { /* Funktion fehlt noch */ }
      return list.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
    }
    if (kind === 'foryou') {
      const { data, error } = await sb.rpc('feed_ranked', { p_offset: before || 0 });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    }
    const args = { p_kind: kind === 'outfits' ? 'outfits' : 'items', p_before: before || null, p_color: color || null };
    if (kind === 'following') args.p_mode = 'following';
    const { data, error } = await sb.rpc('feed_public', args);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }
  // Stufe des Feeds (0 = neueste zuerst); ohne Netz oder bei Fehlern bleibt alles wie bisher
  async function feedStage() {
    const sb = Cloud.client();
    if (!sb || !navigator.onLine) return 0;
    try { const { data, error } = await sb.rpc('feed_stage'); return error ? 0 : Number(data) || 0; } catch (e) { return 0; }
  }
  // Karte wie bei Vinted: Besitzer oben, darunter Foto, Preis, Name und Marke · Größe
  function feedCard(rec, urls, kind) {
    const c = el('div', 'card feed-card' + (kind === 'items' ? '' : ' feed-outfit'));
    const open = () => { location.hash = kind === 'items' ? itemLink(rec.username, rec.id) : outfitLink(rec.username, rec.id); };
    const owner = el('button', 'feed-owner');
    owner.type = 'button';
    owner.append(avatarFor(rec.username, 'sm'), el('span', null, rec.username));
    owner.onclick = () => { location.hash = '#/u/' + rec.username; };
    const img = el('button', 'img feed-img');
    img.type = 'button';
    img.setAttribute('aria-label', (rec.name || 'Eintrag') + ' von ' + rec.username + ' ansehen');
    if (urls[rec.path]) { const i = el('img'); i.alt = ''; i.loading = 'lazy'; i.src = urls[rec.path]; img.append(i); }
    img.onclick = open;
    const meta = el('div', 'meta');
    if (kind === 'items') {
      meta.append(el('span', 'feed-name', rec.name || ''));
      const sub = [rec.brand, rec.size].filter(Boolean).join(' · ');
      if (sub) meta.append(el('span', 'muted small', sub));
      if (rec.vis === 'sale' && rec.price != null) meta.append(el('b', 'feed-price', money(rec.price)));
    } else {
      meta.append(el('b', null, rec.name || 'Outfit'));
    }
    c.append(owner, img, meta);
    const me3 = Cloud.user();
    if (!me3 || me3.name !== rec.username) withHeart(c, kind === 'items' ? 'item' : 'outfit', rec.username, rec.id);
    return c;
  }
  async function showFeed(list, grid, kind) {
    const sb = Cloud.client();
    const urls = list.length ? await signedUrls(sb, list.map((r) => r.path)) : {};
    const shape = kind === 'outfits' ? 'outfits' : 'items';
    for (const rec of list) grid.append(feedCard(rec, urls, rec.outfit ? 'outfits' : shape));
  }

  return { paintOwnAvatars, loadPeople, openPeople, start, isPinned, setPinned, search, fetchItems, showItems, feed, feedStage, showFeed, loadInbox, leaveThread };
})();
