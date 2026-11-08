// Mini-Testlauf ohne Werkzeuge: Die App läuft im Rahmen #app, `W('name')` holt Funktionen und Konstanten aus ihr.
const out = document.getElementById('out');
const results = [];
let section = null;
const tests = [];
const test = (name, fn) => tests.push({ section, name, fn });
const group = (name) => { section = name; };

const eq = (a, b, msg) => {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error((msg ? msg + ': ' : '') + 'erwartet ' + y + ', bekommen ' + x);
};
const ok = (v, msg) => { if (!v) throw new Error(msg || 'war nicht wahr'); };
const frame = document.getElementById('app');
const W = (code) => frame.contentWindow.eval(code); // läuft im Kontext der App (auch const/let)
const ready = new Promise((res) => frame.addEventListener('load', () => setTimeout(res, 800)));
const text = async (path) => (await fetch('../' + path, { cache: 'no-store' })).text();
const png = (w, h, draw) => new Promise((res) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), c); c.toBlob(res, 'image/png'); });

/* ---------- Markenvorschläge ---------- */
group('Markenvorschläge');
for (const [typed, want] of [['adidsa', 'Adidas'], ['nik', 'Nike'], ['stussy', 'Stüssy'], ['levis', "Levi's"], ['north face', 'The North Face'], ['hm', 'H&M'], ['comme des garcons', 'Comme des Garçons'], ['new balence', 'New Balance']]) {
  test('brandMatches ' + typed + ' → ' + want, () => eq(W('brandMatches')(typed)[0], want));
}
test('brandMatches: Unsinn → keine Vorschläge', () => eq(W('brandMatches')('qqxzvv'), []));
test('brandMatches: leere Eingabe → keine Vorschläge', () => eq(W('brandMatches')('  '), []));
test('brandMatches: eigene Schreibweise steht vor der Liste', () => eq(W('brandMatches')('nik', ['Nikeish'])[0], 'Nikeish'));
test('brandMatches: höchstens 5 Vorschläge', () => ok(W('brandMatches')('a').length <= 5));

group('Größenvorschläge');
test('sizeMatches: feste Reihenfolge Kleidung, Schuhe, Hosen, One Size', () => eq(W('sizeMatches')('', 'Schuhe').map(([g]) => g), ['Kleidung', 'Schuhe', 'Hosen', 'Einheitsgröße']));
test('sizeMatches: One Size steht ganz unten', () => { const g = W('sizeMatches')('', 'Jacken'); eq(g[g.length - 1][1], ['One Size']); });
test('sizeMatches: Schuhgrößen 36 bis 48', () => { const s = W('sizeMatches')('', 'Schuhe')[1][1]; eq([s[0], s[s.length - 1], s.length], ['36', '48', 13]); });
test('sizeMatches: xl findet XL zuerst', () => eq(W('sizeMatches')('xl', 'Jacken')[0][1][0], 'XL'));
test('sizeMatches: 42 findet nur Schuhgröße', () => eq(W('sizeMatches')('42', 'Jacken'), [['Schuhe', ['42']]]));
test('sizeMatches: Unsinn findet nichts', () => eq(W('sizeMatches')('qqq', 'Jacken'), []));

/* ---------- Farben ---------- */
group('Farben');
const NAMES = [
  [[0, 0, 0], 'Schwarz'], [[255, 255, 255], 'Weiß'], [[140, 140, 140], 'Grau'], [[216, 195, 165], 'Beige'], [[201, 180, 143], 'Beige'],
  [[107, 74, 50], 'Braun'], [[196, 32, 46], 'Rot'], [[30, 60, 160], 'Blau'], [[60, 140, 70], 'Grün'], [[255, 200, 0], 'Gelb'],
  [[255, 140, 0], 'Orange'], [[120, 60, 180], 'Lila'], [[240, 170, 190], 'Rosa'], [[60, 62, 66], 'Grau'],
];
for (const [rgb, name] of NAMES) test('colorName ' + rgb.join(',') + ' → ' + name, () => eq(W('colorName')(...rgb), name));

const swatch = (fill, shade) => png(100, 100, (g) => { g.fillStyle = fill; g.fillRect(20, 20, 60, 60); if (shade) { g.fillStyle = shade; g.fillRect(20, 20, 60, 15); } });
for (const [label, fill, shade, want] of [
  ['Beige', '#d8c3a5', null, 'Beige'], ['Beige mit Schatten', '#d8c3a5', '#8a7f70', 'Beige'], ['Sand', '#c9b48f', null, 'Beige'],
  ['Grau', '#8c8c8c', null, 'Grau'], ['Hellgrau', '#d0d0d0', null, 'Grau'], ['Anthrazit', '#3a3d40', null, 'Grau'], ['Schwarz', '#101010', null, 'Schwarz'],
  ['Jeansblau', '#2b4a80', null, 'Blau'],
]) test('detectColor ' + label, async () => eq((await W('detectColor')(await swatch(fill, shade))).color, want));
test('detectColor: Foto ohne durchsichtigen Hintergrund → keine Farbe', async () => {
  eq(await W('detectColor')(await png(100, 100, (g) => { g.fillStyle = '#c0392b'; g.fillRect(0, 0, 100, 100); })), null);
});

/* ---------- Angaben prüfen (cleanDetails) ---------- */
group('Angaben prüfen');
const cd = (src, kind = 'items') => W('cleanDetails')(src, kind);
test('privat wird nicht gespeichert (Standard)', () => eq(cd({ vis: 'private' }), {}));
test('ungültige Sichtbarkeit entfällt', () => eq(cd({ vis: 'hacker' }), {}));
test('öffentlich bleibt', () => eq(cd({ vis: 'public' }), { vis: 'public' }));
test('Preis nur bei Verkauf', () => eq(cd({ vis: 'public', price: 20 }), { vis: 'public' }));
test('Preis bei Verkauf', () => eq(cd({ vis: 'sale', price: 20 }), { vis: 'sale', price: 20 }));
test('negativer Preis entfällt', () => eq(cd({ vis: 'sale', price: -1 }), { vis: 'sale' }));
test('absurder Preis entfällt', () => eq(cd({ vis: 'sale', price: 1e9 }), { vis: 'sale' }));
test('Tausch-Wunsch nur bei Tausch', () => eq(cd({ vis: 'trade', swap: 'Größe L' }), { vis: 'trade', swap: 'Größe L' }));
test('Zustand nur aus der Liste', () => eq(cd({ cond: 'Neu / DS' }), { cond: 'Neu / DS' }) && eq(cd({ cond: 'Kaputt' }), {}));
test('Marke wird auf 40 Zeichen gekürzt', () => eq(cd({ brand: 'x'.repeat(100) }).brand.length, 40));
test('Farbe nur aus der Liste, hex nur gültig', () => {
  eq(cd({ color: 'Beige', hex: '#aabbcc' }), { color: 'Beige', hex: '#aabbcc' });
  eq(cd({ color: 'Beige', hex: 'rot' }), { color: 'Beige' });
  eq(cd({ color: 'Türkis' }), {});
});
test('Wunschliste nimmt keinen Zustand an', () => eq(cd({ cond: 'Gut', vis: 'public' }, 'wishlist'), { vis: 'public' }));
test('Wunschliste kennt kein „Verkauf“', () => eq(cd({ vis: 'sale', price: 5 }, 'wishlist'), {}));

/* ---------- Treffer Wunsch ↔ Teil ---------- */
group('Treffer Wunschliste');
const m = (w, i) => W('Profile').matches(w, i);
test('gleiche Artikelnummer trifft immer', () => ok(m({ sku: 'AB-123' }, { sku: 'ab 123' })));
test('andere Marke trifft nicht', () => ok(!m({ brand: 'Nike', name: 'Air Max' }, { brand: 'Adidas', name: 'Air Max' })));
test('gleiche Marke und Wörter trifft', () => ok(m({ brand: 'Nike', name: 'Air Max 90' }, { brand: 'nike', name: 'Nike Air Max 90 weiß' })));
test('falsche Größe trifft nicht', () => ok(!m({ brand: 'Nike', name: 'Air Max', size: '42' }, { brand: 'Nike', name: 'Air Max', size: '44' })));
test('ohne Größe am Teil trifft', () => ok(m({ brand: 'Nike', name: 'Air Max', size: '42' }, { brand: 'Nike', name: 'Air Max' })));
test('ganz anderer Name trifft nicht', () => ok(!m({ brand: 'Nike', name: 'Tech Fleece Hoodie' }, { brand: 'Nike', name: 'Air Max Schuhe' })));

/* ---------- Kleinteile ---------- */
group('Kleinteile');
test('wrapAngle', () => { const f = W('wrapAngle'); eq(f(270), -90); eq(f(-270), 90); eq(f(180), -180); eq(f(0), 0); });
test('Zuschnitt ignoriert verirrte Pünktchen, behält das Teil', () => {
  const doc = frame.contentDocument, f = W('trimAlphaBox');
  const mk = (w, h, draw) => { const c = doc.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#000'; draw(x); return c; };
  const a = f(mk(400, 400, (x) => { x.fillRect(150, 160, 100, 80); x.fillRect(2, 3, 2, 2); }));        // Teil + Pünktchen in der Ecke
  eq([a.canvas.width, a.canvas.height], [100, 80]);
  const b = f(mk(300, 200, (x) => { x.fillRect(0, 0, 300, 200); }));                                    // volles Bild bleibt
  eq([b.canvas.width, b.canvas.height], [300, 200]);
  const c = f(mk(300, 40, (x) => { x.fillRect(10, 15, 280, 6); }));                                     // dünnes Teil (Gürtel, Schnürsenkel) bleibt
  eq([c.canvas.width, c.canvas.height], [280, 6]);
});

test('Outfit-Anordnung wie die Collage: Jacke rechts oben, Oberteil davor, Hose darunter, Schuhe links unten', async () => {
  const doc = frame.contentDocument;
  const mk = async (name, cat, asp) => { const c = doc.createElement('canvas'); c.width = 300; c.height = Math.round(300 * asp); c.getContext('2d').fillRect(0, 0, c.width, c.height); return { id: 't_' + name, name, category: cat, blob: await new Promise((r) => c.toBlob(r, 'image/png')), created: 1 }; };
  const st = W('state'), setItems = W('(v) => { items = v; }'), saveItems = W('items'), saveOutfit = st.outfit;
  try {
    const mine = [await mk('brille', 'Schmuck', 0.33), await mk('beanie', 'Caps', 1), await mk('jacke', 'Jacken', 1), await mk('hoodie', 'Pullover', 1.22), await mk('jeans', 'Hosen', 1.8), await mk('tasche', 'Taschen', 0.82), await mk('schuhe', 'Schuhe', 0.38)];
    setItems(mine);
    st.outfit = { id: null, name: '', bg: '#fff', layers: [] };
    for (const it of mine) await W('addLayer')(it);
    const L = (n) => st.outfit.layers.find((l) => l.itemId === 't_' + n);
    const H = (l) => l.w * W('aspects').get(l.itemId) / W('STAGE_RATIO');
    ok(L('jacke').x > L('hoodie').x && L('jacke').y < L('hoodie').y, 'Jacke rechts oben hinter dem Oberteil');
    ok(L('jeans').y >= L('hoodie').y + H(L('hoodie')) - 0.01, 'Hose unter dem Oberteil');
    ok(L('tasche').x < 0.3 && L('tasche').y > L('brille').y, 'Tasche links oben bei den Accessoires');
    ok(L('schuhe').x < 0.1 && L('schuhe').y > 0.7, 'Schuhe links unten');
    ok(L('brille').x < 0.3 && L('beanie').x < 0.3 && L('beanie').y < L('brille').y, 'Schmuck und Cap links oben, Cap zuerst');
    for (const l of st.outfit.layers) ok(l.x >= 0 && l.y >= 0 && l.x + l.w <= 1.0001 && l.y + H(l) <= 1.0001, 'bleibt in der Fläche: ' + l.itemId);
  } finally { setItems(saveItems); st.outfit = saveOutfit; }
});

test('Oberteile: Jacke und Pullover mischbar, höchstens zwei, Pullover an der Shirt-Stelle', async () => {
  const doc = frame.contentDocument;
  const mk = async (name, cat) => { const c = doc.createElement('canvas'); c.width = 300; c.height = 300; c.getContext('2d').fillRect(0, 0, 300, 300); return { id: 'o_' + name, name, category: cat, blob: await new Promise((r) => c.toBlob(r, 'image/png')), created: 1 }; };
  const st = W('state'), setItems = W('(v) => { items = v; }'), saveItems = W('items'), saveOutfit = st.outfit;
  try {
    const mine = [await mk('jacke', 'Jacken'), await mk('pulli', 'Pullover'), await mk('shirt', 'Shirts')];
    setItems(mine);
    st.outfit = { id: null, name: '', bg: '#fff', layers: [] };
    await W('addLayer')(mine[0]); await W('addLayer')(mine[1]);
    eq(st.outfit.layers.length, 2, 'Jacke und Pullover zusammen');
    ok(st.outfit.layers.find((l) => l.itemId === 'o_jacke').x > st.outfit.layers.find((l) => l.itemId === 'o_pulli').x, 'Jacke rechts, Pullover mittig');
    await W('addLayer')(mine[2]);
    eq(st.outfit.layers.map((l) => l.itemId).sort(), ['o_pulli', 'o_shirt'], 'drittes Oberteil ersetzt das älteste');
  } finally { setItems(saveItems); st.outfit = saveOutfit; }
});

/* ---------- Fehlerprotokoll (Client) ---------- */
group('Fehlerprotokoll');
test('meldet Fehler gekürzt, ohne Adressteil, ohne Doppelte; ignoriert Rauschen', async () => {
  const w = frame.contentWindow;
  const calls = [];
  const realClient = w.eval('Cloud.client');
  w.eval('Cloud.client = () => ({ rpc: (n, a) => { window.__calls.push([n, a]); return Promise.resolve({}); } })');
  w.__calls = calls;
  try {
    w.history.replaceState(null, '', w.location.pathname + '#/u/geheim');
    w.eval("Errors.report('Boom ' + 'x'.repeat(900), 'stack\\n' + 'y'.repeat(5000))");
    w.eval("Errors.report('Boom ' + 'x'.repeat(900), 'stack\\n' + 'y'.repeat(5000))"); // doppelt
    w.eval("Errors.report('Failed to fetch', 's')");                                  // Rauschen
    await new Promise((r) => setTimeout(r, 900));
    eq(calls.length, 1, 'Anzahl der Meldungen');
    const [name, args] = calls[0];
    eq(name, 'log_client_error');
    ok(args.p_message.length <= 400 && args.p_stack.length <= 1500, 'nicht gekürzt');
    ok(!args.p_page.includes('geheim') && !args.p_page.includes('#'), 'Adressteil wurde mitgeschickt');
    eq(args.p_build, w.eval('Errors.BUILD'));
  } finally { w.__real = realClient; w.eval('Cloud.client = window.__real'); }
});

/* ---------- Aufbau der App ---------- */
group('Aufbau');
test('sw.js hat genau 1500 Byte', async () => eq(new TextEncoder().encode(await text('sw.js')).length, 1500));
test('sw.js: Cache-Version passt zu errors.js', async () => {
  const m = /drobe-v(\d+)/.exec(await text('sw.js'));
  eq(Number(m[1]), W('Errors').BUILD);
});
test('sw.js cached alle Skripte aus index.html', async () => {
  const sw = await text('sw.js'), html = await text('index.html');
  const list = [...html.matchAll(/<script src="([a-z-]+\.js)"/g)].map((x) => x[1]).filter((f) => !f.startsWith('vendor'));
  const missing = list.filter((f) => !sw.includes("'" + f.replace('.js', '') + "'") && !sw.includes("'" + f + "'"));
  eq(missing, []);
});
test('alle Skripte aus index.html lassen sich laden', async () => {
  const html = await text('index.html');
  for (const f of [...html.matchAll(/<script src="([^"]+)"/g)].map((x) => x[1])) ok((await fetch('../' + f)).ok, f + ' fehlt');
});
test('jede $("id") im Code gibt es in index.html', async () => {
  const html = await text('index.html');
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((x) => x[1]));
  const files = [...html.matchAll(/<script src="([a-z-]+\.js)"/g)].map((x) => x[1]);
  const missing = [];
  for (const f of files) {
    const js = await text(f);
    for (const x of js.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)) if (!ids.has(x[1]) && !/^(itd|wsd|upd)/.test(x[1]) && !js.includes("id = '" + x[1]) && !js.includes('id="' + x[1])) missing.push(f + ': ' + x[1]); // itd…/wsd…: Felder, die aus dem Präfix gebaut werden
  }
  eq([...new Set(missing)], []);
});
test('App startet ohne Fehler im Gastmodus', () => { ok(frame.contentWindow.document.body.classList.contains('guest'), 'Gastansicht fehlt'); });

/* ---------- Live: die echte Datenbank ohne Anmeldung ---------- */
group('Live (ohne Anmeldung)');
let API = null;
const api = async () => {
  if (API) return API;
  const js = await text('cloud.js');
  API = { url: /SUPABASE_URL = '([^']+)'/.exec(js)[1], key: /SUPABASE_KEY = '([^']+)'/.exec(js)[1] };
  return API;
};
const rpc = async (name, args = {}) => {
  const { url, key } = await api();
  const r = await fetch(url + '/rest/v1/rpc/' + name, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const denied = (r) => r.status === 401 || r.status === 403 || r.status === 404 || (r.body && (r.body.code === '42501' || r.body.code === 'PGRST202'));
for (const [fn, args] of [
  ['my_threads', {}], ['my_follows', {}], ['my_followers', {}], ['my_username', {}], ['my_saves', {}], ['my_save_ids', {}], ['my_blocks', {}], ['my_interests', {}],
  ['is_admin', {}], ['admin_reports', {}], ['admin_errors', {}], ['delete_my_account', {}], ['my_profile_text', {}],
  ['update_my_profile', { p_bio: 'x', p_city: 'y' }], ['toggle_follow', { p_username: 'fxnnye' }], ['toggle_save', { p_username: 'fxnnye', p_item: 'x' }],
  ['send_interest', { p_to: 'fxnnye', p_kind: 'interest', p_record_id: 'x' }], ['report_user', { p_username: 'fxnnye', p_reason: 'spam' }],
  ['set_block', { p_username: 'fxnnye', p_block: true }], ['send_reply', { p_interest: '00000000-0000-0000-0000-000000000000', p_body: 'x' }],
  ['sync_pull', {}], ['sync_push', { p_kind: 'items', p_id: 'x', p_data: {} }], ['similar_public_items', { p_emb: '[]' }], ['find_public_items', { p_brand: 'a', p_query: 'b' }],
]) test('ohne Anmeldung gesperrt: ' + fn, async () => { const r = await rpc(fn, args); ok(denied(r), fn + ' ist ohne Anmeldung erreichbar: ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 120)); });

test('Tabellen sind direkt nicht lesbar', async () => {
  const { url, key } = await api();
  for (const t of ['records', 'items', 'outfits', 'wishlist', 'profiles', 'interests', 'replies', 'reports', 'follows', 'saves', 'blocks', 'admins', 'client_errors']) {
    const r = await fetch(url + '/rest/v1/' + t + '?select=*&limit=1', { headers: { apikey: key } });
    const b = await r.json().catch(() => null);
    ok(r.status >= 400 || (Array.isArray(b) && b.length === 0), t + ' liefert Daten ohne Anmeldung');
  }
});
test('feed_public liefert eine Liste, nur freigegebene Felder', async () => {
  const r = await rpc('feed_public', { p_kind: 'items' });
  eq(r.status, 200); ok(Array.isArray(r.body));
  const allowed = new Set(['username', 'id', 'path', 'name', 'brand', 'size', 'cond', 'rarity', 'color', 'vis', 'price', 'swap', 'ts']);
  for (const it of r.body) for (const k of Object.keys(it)) ok(allowed.has(k), 'unerwartetes Feld im Feed: ' + k);
  for (const it of r.body) ok(['public', 'trade', 'sale'].includes(it.vis), 'privates Teil im Feed');
});
test('public_profile: unbekannter Name → null, bekannter nur erlaubte Felder', async () => {
  eq((await rpc('public_profile', { p_username: 'gibt-es-nicht-xyz' })).body, null);
  const all = (await rpc('feed_public', { p_kind: 'items' })).body;
  if (!all.length) return;
  const p = (await rpc('public_profile', { p_username: all[0].username })).body;
  const allowed = new Set(['username', 'bio', 'city', 'followers', 'showcase', 'items', 'outfits', 'wishlist']);
  for (const k of Object.keys(p)) ok(allowed.has(k), 'unerwartetes Profil-Feld: ' + k);
  for (const it of p.items) { ok(!('note' in it) && !('link' in it) && !('emb' in it), 'private Felder in public_profile'); }
});
test('Mitgliedersuche liefert eine Liste', async () => { const r = await rpc('search_profiles', { p_query: 'fx' }); ok(Array.isArray(r.body)); });
test('Fehlerprotokoll nimmt Meldungen an, aber nur gekürzt', async () => {
  const r = await rpc('log_client_error', { p_message: 'Test-Meldung aus den automatischen Tests', p_stack: 'x'.repeat(5000), p_page: '/tests', p_build: 0 });
  ok(r.status === 200 || r.status === 204, 'log_client_error: ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 100));
});
test('Bilder-Liste ohne Anmeldung zeigt höchstens Konto-Ordner', async () => {
  const { url, key } = await api();
  const r = await fetch(url + '/storage/v1/object/list/images', { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 5 }) });
  const b = await r.json().catch(() => null);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  ok(r.status >= 400 || (Array.isArray(b) && b.every((o) => uuid.test(o.name))), 'Liste der Bilder zeigt mehr als Ordner öffentlicher Konten');
});
test('Ausgangsfotos (…-src) und private Bilder sind für Fremde nicht sichtbar', async () => {
  const { url, key } = await api();
  const feed = (await rpc('feed_public', { p_kind: 'items' })).body;
  if (!feed.length) return;
  const folder = feed[0].path.split('/')[0];
  const r = await fetch(url + '/storage/v1/object/list/images', { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: folder, limit: 100 }) });
  const names = (await r.json()).map((o) => o.name);
  ok(names.every((n) => !n.endsWith('-src')), 'Ausgangsfoto sichtbar: ' + names.find((n) => n.endsWith('-src')));
  const publicIds = new Set((await rpc('public_profile', { p_username: feed[0].username })).body.items.map((i) => 'items-' + i.id));
  const extra = names.filter((n) => n.startsWith('items-') && !publicIds.has(n));
  eq(extra, [], 'Bilder nicht-öffentlicher Teile sichtbar');
});
test('Hochladen ohne Anmeldung ist gesperrt', async () => {
  const { url, key } = await api();
  const r = await fetch(url + '/storage/v1/object/images/test/anon.txt', { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'text/plain' }, body: 'x' });
  ok(r.status >= 400, 'Upload ohne Anmeldung hat geklappt: ' + r.status);
});

/* ---------- Lauf ---------- */
(async () => {
  await ready;
  let pass = 0, fail = 0, last = null, box = null;
  for (const t of tests) {
    if (t.section !== last) { last = t.section; const h = document.createElement('h2'); h.textContent = t.section; out.append(h); }
    const row = document.createElement('div');
    row.className = 't';
    try { await t.fn(); row.classList.add('pass'); row.textContent = t.name; pass++; }
    catch (e) { row.classList.add('fail'); row.textContent = t.name; const w = document.createElement('span'); w.className = 'why'; w.textContent = e.message; row.append(w); fail++; }
    out.append(row);
    results.push({ section: t.section, name: t.name, ok: row.classList.contains('pass') });
  }
  const sum = document.getElementById('sum');
  sum.className = 'sum ' + (fail ? 'bad' : 'ok');
  sum.textContent = fail ? fail + ' von ' + (pass + fail) + ' Tests fehlgeschlagen' : 'Alle ' + pass + ' Tests bestanden';
  document.title = (fail ? 'FAIL ' : 'PASS ') + pass + '/' + (pass + fail);
  window.__results = { pass, fail, results };
})();
