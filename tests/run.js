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

/* ---------- Verwandte Suchbegriffe ---------- */
group('Verwandte Suchbegriffe');
test('expandQuery: sneaker findet Schuhe und Jordan', () => { const v = W('expandQuery')('sneaker'); eq(v[0], 'sneaker'); ok(v.includes('schuhe') && v.includes('jordan'), v.join(', ')); });
test('expandQuery: hoodie findet Pullover', () => ok(W('expandQuery')('Hoodie').includes('pullover')));
test('expandQuery: Mehrzahl und Anfang des Wortes', () => { ok(W('expandQuery')('sneakers').includes('schuhe')); ok(W('expandQuery')('hoodi').includes('pullover')); });
test('expandQuery: Marke bleibt erhalten', () => ok(W('expandQuery')('nike sneaker').includes('nike schuhe')));
test('expandQuery: Modell mit Leerzeichen', () => ok(W('expandQuery')('air force 1').includes('schuhe 1') || W('expandQuery')('air force 1').some((x) => x.includes('schuhe'))));
test('expandQuery: Unbekanntes bleibt unverändert', () => eq(W('expandQuery')('qqxzvv'), ['qqxzvv']));
test('expandQuery: höchstens 5 Anfragen', () => ok(W('expandQuery')('sneaker hoodie jacke').length <= 5));
test('expandQuery: keine doppelten Anfragen', () => { const v = W('expandQuery')('schuhe'); eq(v.length, new Set(v).size); });

/* ---------- Sammelaktionen im Schrank ---------- */
group('Sichtbarkeit sammelweise');
const vis = (rec, v) => { const r = JSON.parse(JSON.stringify(rec)); W('applyVisibility')(r, v); return r; };
test('applyVisibility: privat entfernt vis, Marke bleibt', () => eq(vis({ name: 'A', brand: 'Nike', vis: 'public' }, 'private'), { name: 'A', brand: 'Nike' }));
test('applyVisibility: öffentlich setzt vis', () => eq(vis({ name: 'A' }, 'public').vis, 'public'));
test('applyVisibility: Verkauf → öffentlich verwirft den Preis', () => { const r = vis({ name: 'A', vis: 'sale', price: 50 }, 'public'); eq([r.vis, r.price], ['public', undefined]); });


group('IDs');
test('uid liefert UUIDs (v4) und keine Doppelten', () => {
  const ids = Array.from({ length: 500 }, () => W('uid')());
  ok(ids.every((i) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(i)), 'kein UUID v4');
  eq(new Set(ids).size, ids.length);
});

/* ---------- Farben ---------- */
group('Farben');
const NAMES = [
  [[0, 0, 0], 'Schwarz'], [[255, 255, 255], 'Weiß'], [[140, 140, 140], 'Grau'], [[216, 195, 165], 'Beige'], [[201, 180, 143], 'Beige'],
  [[107, 74, 50], 'Braun'], [[196, 32, 46], 'Rot'], [[30, 60, 160], 'Blau'], [[26, 34, 56], 'Blau'], [[40, 52, 70], 'Blau'], [[170, 200, 230], 'Blau'], [[200, 210, 222], 'Blau'], [[120, 140, 170], 'Blau'], [[60, 140, 70], 'Grün'], [[255, 200, 0], 'Gelb'],
  [[255, 140, 0], 'Orange'], [[120, 60, 180], 'Lila'], [[240, 170, 190], 'Rosa'], [[60, 62, 66], 'Grau'],
];
for (const [rgb, name] of NAMES) test('colorName ' + rgb.join(',') + ' → ' + name, () => eq(W('colorName')(...rgb), name));

const swatch = (fill, shade) => png(100, 100, (g) => { g.fillStyle = fill; g.fillRect(20, 20, 60, 60); if (shade) { g.fillStyle = shade; g.fillRect(20, 20, 60, 15); } });
for (const [label, fill, shade, want] of [
  ['Beige', '#d8c3a5', null, 'Beige'], ['Beige mit Schatten', '#d8c3a5', '#8a7f70', 'Beige'], ['Sand', '#c9b48f', null, 'Beige'],
  ['Grau', '#8c8c8c', null, 'Grau'], ['Hellgrau', '#d0d0d0', null, 'Grau'], ['Anthrazit', '#3a3d40', null, 'Grau'], ['Schwarz', '#101010', null, 'Schwarz'],
  ['Jeansblau', '#4a6a94', null, 'Blau'], ['Dunkelblau wird Blau', '#1f2a44', null, 'Blau'], ['Hellblau wird Blau', '#a9c4e0', null, 'Blau'], ['Mattes Hellblau', '#c5ced9', null, 'Blau'],
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
test('Zustand nur aus der Liste', () => eq(cd({ cond: 'Neu / DS' }), { cond: 'Neu / DS' }) && eq(cd({ cond: 'Kaputt' }), {}));
test('Marke wird auf 40 Zeichen gekürzt', () => eq(cd({ brand: 'x'.repeat(100) }).brand.length, 40));
test('Farbe nur aus der Liste, hex nur gültig', () => {
  eq(cd({ color: 'Beige', hex: '#aabbcc' }), { color: 'Beige', hex: '#aabbcc' });
  eq(cd({ color: 'Beige', hex: 'rot' }), { color: 'Beige' });
  eq(cd({ color: 'Türkis' }), {});
});

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
    const mine = [await mk('brille', 'Schmuck', 0.33), await mk('beanie', 'Caps', 1), await mk('jacke', 'Jacken', 1), await mk('hoodie', 'Pullover', 1.22), await mk('jeans', 'Hosen', 1.8), await mk('tasche', 'Taschen', 0.82), await mk('schuhe', 'Schuhe', 0.38), await mk('guertel', 'Gürtel', 0.12)];
    setItems(mine);
    st.outfit = { id: null, name: '', bg: '#fff', layers: [] };
    for (const it of mine) await W('addLayer')(it);
    const L = (n) => st.outfit.layers.find((l) => l.itemId === 't_' + n);
    const H = (l) => l.w * W('aspects').get(l.itemId) / W('STAGE_RATIO');
    ok(L('jacke').x > L('hoodie').x && L('jacke').y < L('hoodie').y, 'Jacke rechts oben hinter dem Oberteil');
    ok(L('jeans').y >= L('hoodie').y + H(L('hoodie')) - 0.01, 'Hose unter dem Oberteil');
    ok(L('tasche').x < 0.3 && L('tasche').y > L('brille').y, 'Tasche links oben bei den Accessoires');
    ok(L('guertel').x > 0.5 && Math.abs(L('guertel').y - L('jeans').y) < 0.02, 'Gürtel rechts neben der Hose auf Bundhöhe');
    ok(L('schuhe').x < 0.1 && L('schuhe').y > 0.7, 'Schuhe links unten');
    ok(L('brille').x < 0.3 && L('beanie').x > L('brille').x && L('beanie').x < 0.35 && L('beanie').y < 0.1, 'Schmuck links oben, Cap etwas weiter innen');
    ok(Math.max(...['jacke', 'hoodie', 'jeans', 'schuhe'].map((n) => L(n).y + H(L(n)))) > 0.9, 'Collage füllt die Fläche bis fast nach unten');
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

/* ---------- Sprache ---------- */
group('Sprache');
test('Standardsprache ist Deutsch, t() lässt deutschen Text unverändert', () => {
  eq(W('LANG'), 'de');
  eq(W("t('Abbrechen')"), 'Abbrechen');
  eq(W("t('{n} Teile', { n: 3 })"), '3 Teile');
});
test('Sprachliste: nur Einträge mit Text, Muster sind gültig', () => {
  const d = W('I18N').en;
  const bad = Object.entries(d).filter(([k, v]) => !k.trim() || typeof v !== 'string' || !v.trim());
  eq(bad, []);
  ok(Object.keys(d).length > 100, 'zu wenige Einträge');
  for (const [re, rep] of W('I18N_PATTERNS').en) ok(Object.prototype.toString.call(re) === '[object RegExp]' && typeof rep === 'string');
});
test('Sprachliste: Kategorien, Zustände und Farben der App sind übersetzt', () => {
  const d = W('I18N').en;
  const need = [...W('COLORS'), ...['Neu / DS', 'Sehr gut', 'Gut', 'Getragen'], ...W('CATEGORIES').filter((c) => typeof c === 'string')];
  eq(need.filter((x) => d[x] === undefined), []);
});
test('Englisch: Texte werden übersetzt, Auswahlwerte bleiben deutsch', async () => {
  localStorage.setItem('jawnz-lang', 'en');
  const f = document.createElement('iframe');
  f.style.cssText = 'width:420px;height:700px;position:absolute;left:-9999px';
  f.src = '../index.html';
  document.body.append(f);
  try {
    await new Promise((res) => f.addEventListener('load', () => setTimeout(res, 1200)));
    localStorage.removeItem('jawnz-lang');
    const w = f.contentWindow, d = w.document;
    eq(w.eval('LANG'), 'en');
    eq(d.documentElement.lang, 'en');
    eq(d.querySelector('[data-open=theme]').textContent.trim(), 'Appearance');
    eq(d.querySelector('[data-open=lang]').textContent.trim(), 'Language');
    const opts = [...d.querySelectorAll('#upCond option')].map((o) => [o.textContent.trim(), o.value]);
    eq(opts.slice(1), [['New / DS', 'Neu / DS'], ['Very good', 'Sehr gut'], ['Good', 'Gut'], ['Worn', 'Getragen']]);
    // später eingefügte Texte und Listeneinträge werden auch übersetzt
    const sel = d.createElement('select');
    d.body.append(sel);
    sel.append(new w.Option('Schwarz'));
    await new Promise((r) => setTimeout(r, 50));
    eq([sel.options[0].textContent, sel.value], ['Black', 'Schwarz']);
    sel.remove();
    // Rechtstexte bleiben deutsch
    const legal = d.getElementById('legalBody');
    ok(legal.hasAttribute('data-no-i18n') && legal.textContent.includes('Angaben gemäß § 5 DDG'), 'Rechtstexte müssen deutsch bleiben');
  } finally { localStorage.removeItem('jawnz-lang'); f.remove(); }
});
test('Englisch: Sätze mit Zahlen, Namen und Serverfehler', async () => {
  localStorage.setItem('jawnz-lang', 'en');
  const f = document.createElement('iframe');
  f.style.cssText = 'width:420px;height:700px;position:absolute;left:-9999px';
  f.src = '../index.html';
  document.body.append(f);
  try {
    await new Promise((res) => f.addEventListener('load', () => setTimeout(res, 1200)));
    localStorage.removeItem('jawnz-lang');
    const w = f.contentWindow;
    const tr = (x) => w.eval('trText(' + JSON.stringify(x) + ')');
    eq(tr('3 Teile hinzugefügt'), '3 items added');
    eq(tr('1 Teil'), '1 item'); eq(tr('5 Teile'), '5 items');
    eq(tr('Foto 2 von 4'), 'Photo 2 of 4');
    eq(tr('Wird hinzugefügt … 1/3'), 'Adding … 1/3');
    eq(tr('Kein Zugriff.'), 'No access.');
    eq(tr('Das bist du selbst.'), 'That is you.');
    eq(tr('Annehmen'), 'Accept'); eq(tr('Als verkauft markieren'), 'Mark as sold');
    eq(tr('Angebot abgelehnt.'), 'Offer declined.');
    eq(tr('Aktuell gespeichert: 4 Teile, 2 Outfits.'), 'Currently saved: 4 items, 2 outfits.');
  } finally { localStorage.removeItem('jawnz-lang'); f.remove(); }
});

test('Bilder aus dem Netz werden bei Fehlern neu versucht', async () => {
  const d = frame.contentWindow.document;
  const i = d.createElement('img');
  i.src = '../nicht-da-' + Date.now() + '.png';
  d.body.append(i);
  await new Promise((r) => setTimeout(r, 1800));
  const n = Number(i.dataset.retry || 0);
  i.remove();
  ok(n >= 1, 'kaputtes Bild wurde nicht neu versucht');
});

test('Sprache umschalten: Chips für Deutsch und English vorhanden', () => {
  eq([...frame.contentDocument.querySelectorAll('#langChips .chip')].map((c) => c.dataset.lang), ['de', 'en']);
  ok(frame.contentDocument.querySelector('#langChips .chip[data-lang=de]').classList.contains('active'));
});

test('alte Speicherschlüssel drobe-* werden zu jawnz-* übernommen', async () => {
  localStorage.setItem('drobe-theme', 'dark'); localStorage.setItem('drobe-welcomed', '1'); localStorage.setItem('jawnz-showcase-x', 'neu'); localStorage.setItem('drobe-showcase-x', 'alt');
  const f = document.createElement('iframe');
  f.style.cssText = 'width:420px;height:700px;position:absolute;left:-9999px';
  f.src = '../index.html';
  document.body.append(f);
  try {
    await new Promise((res) => f.addEventListener('load', () => setTimeout(res, 800)));
    eq([localStorage.getItem('jawnz-theme'), localStorage.getItem('jawnz-welcomed'), localStorage.getItem('drobe-theme'), localStorage.getItem('drobe-welcomed')], ['dark', '1', null, null]);
    eq(localStorage.getItem('jawnz-showcase-x'), 'neu', 'vorhandener neuer Wert wird nicht überschrieben');
    eq(localStorage.getItem('drobe-showcase-x'), null);
  } finally { for (const k of ['jawnz-theme', 'jawnz-welcomed', 'jawnz-showcase-x', 'drobe-showcase-x', 'drobe-theme', 'drobe-welcomed']) localStorage.removeItem(k); f.remove(); }
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
  ['is_admin', {}], ['has_role', { p_role: 'admin' }], ['admin_set_flex', { p_username: 'fxnnye', p_kind: 'item', p_id: 'x' }], ['admin_remove_flex', { p_entry: '00000000-0000-0000-0000-000000000000' }], ['answer_offer', { p_offer: '00000000-0000-0000-0000-000000000000', p_action: 'accept' }], ['admin_reports', {}], ['admin_errors', {}], ['delete_my_account', {}], ['my_profile_text', {}],
  ['update_my_profile', { p_bio: 'x', p_city: 'y' }], ['toggle_follow', { p_username: 'fxnnye' }], ['toggle_save', { p_username: 'fxnnye', p_item: 'x' }],
  ['send_interest', { p_to: 'fxnnye', p_kind: 'interest', p_record_id: 'x' }], ['report_user', { p_username: 'fxnnye', p_reason: 'spam' }],
  ['set_block', { p_username: 'fxnnye', p_block: true }], ['send_reply', { p_interest: '00000000-0000-0000-0000-000000000000', p_body: 'x' }],
  ['thread_offer', { p_thread: '00000000-0000-0000-0000-000000000000' }], ['mark_sold', { p_item: 'x' }], ['release_listing', { p_item: 'x' }], ['answer_offer', { p_offer: '00000000-0000-0000-0000-000000000000', p_action: 'accept' }], ['item_vis', { p_id: 'x' }], ['item_price', { p_id: 'x' }], ['apply_row', { p_user: '00000000-0000-0000-0000-000000000000', p_kind: 'items', p_id: 'x', d: {}, p_updated: '2026-01-01T00:00:00Z' }],
  ['sync_pull', {}], ['sync_push', { p_kind: 'items', p_id: 'x', p_data: {} }], ['similar_public_items', { p_emb: '[]' }], ['find_public_items', { p_brand: 'a', p_query: 'b' }],
]) test('ohne Anmeldung gesperrt: ' + fn, async () => { const r = await rpc(fn, args); ok(denied(r), fn + ' ist ohne Anmeldung erreichbar: ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 120)); });

test('Tabellen sind direkt nicht lesbar', async () => {
  const { url, key } = await api();
  for (const t of ['records', 'items', 'outfits', 'profiles', 'interests', 'replies', 'thread', 'message', 'offer', 'offer_item', 'flex_week', 'flex_entry', 'reports', 'follows', 'saves', 'blocks', 'admins', 'client_errors']) {
    const r = await fetch(url + '/rest/v1/' + t + '?select=*&limit=1', { headers: { apikey: key } });
    const b = await r.json().catch(() => null);
    ok(r.status >= 400 || (Array.isArray(b) && b.length === 0), t + ' liefert Daten ohne Anmeldung');
  }
});
test('feed_public liefert eine Liste, nur freigegebene Felder', async () => {
  const r = await rpc('feed_public', { p_kind: 'items' });
  eq(r.status, 200); ok(Array.isArray(r.body));
  const allowed = new Set(['username', 'id', 'path', 'name', 'brand', 'size', 'cond', 'rarity', 'color', 'vis', 'price', 'ts']);
  for (const it of r.body) for (const k of Object.keys(it)) ok(allowed.has(k), 'unerwartetes Feld im Feed: ' + k);
  for (const it of r.body) ok(['public', 'sale'].includes(it.vis), 'privates Teil im Feed');
});
test('schema_version passt zur App und ist ohne Anmeldung lesbar', async () => {
  const r = await rpc('schema_version');
  eq(r.status, 200); eq(r.body, W('Cloud').SCHEMA);
  const { url, key } = await api();
  const t = await fetch(url + '/rest/v1/schema_info?select=*', { headers: { apikey: key } });
  ok(t.status >= 400 || (await t.json()).length === 0, 'schema_info direkt lesbar');
});
test('Listen in der Datenbank stimmen mit der App überein (Kategorie, Zustand)', async () => {
  const { url, key } = await api();
  const get = async (t) => (await (await fetch(url + '/rest/v1/' + t + '?select=key,name_de,name_en&order=sort', { headers: { apikey: key } })).json());
  const cats = await get('categories'), conds = await get('conditions');
  eq(cats.map((c) => c.key), W('CATEGORIES'));
  eq(conds.map((c) => c.key), W('CONDS'));
  ok([...cats, ...conds].every((x) => x.name_de && x.name_en), 'Name fehlt');
});
test('item_image ist ohne Anmeldung nicht lesbar und nicht beschreibbar', async () => {
  const { url, key } = await api();
  const g = await fetch(url + '/rest/v1/item_image?select=*&limit=1', { headers: { apikey: key } });
  const gb = await g.json().catch(() => null);
  ok(g.status >= 400 || (Array.isArray(gb) && gb.length === 0), 'item_image liefert Daten ohne Anmeldung');
  const p = await fetch(url + '/rest/v1/item_image', { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: 'x', user_id: '00000000-0000-0000-0000-000000000000', role: 'main', path: 'x/x' }) });
  ok(p.status >= 400, 'item_image ohne Anmeldung beschreibbar');
});
test('listing ist ohne Anmeldung nicht lesbar und nicht beschreibbar', async () => {
  const { url, key } = await api();
  const g = await fetch(url + '/rest/v1/listing?select=*&limit=1', { headers: { apikey: key } });
  const gb = await g.json().catch(() => null);
  ok(g.status >= 400 || (Array.isArray(gb) && gb.length === 0), 'listing liefert Daten ohne Anmeldung');
  const p = await fetch(url + '/rest/v1/listing', { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: 'x', user_id: '00000000-0000-0000-0000-000000000000', price_cents: 1 }) });
  ok(p.status >= 400, 'listing ohne Anmeldung beschreibbar');
});
test('user_role ist ohne Anmeldung nicht lesbar und nicht beschreibbar', async () => {
  const { url, key } = await api();
  const g = await fetch(url + '/rest/v1/user_role?select=*&limit=1', { headers: { apikey: key } });
  const gb = await g.json().catch(() => null);
  ok(g.status >= 400 || (Array.isArray(gb) && gb.length === 0), 'user_role liefert Daten ohne Anmeldung');
  const p = await fetch(url + '/rest/v1/user_role', { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: '00000000-0000-0000-0000-000000000000', role: 'admin' }) });
  ok(p.status >= 400, 'user_role ohne Anmeldung beschreibbar');
});
test('current_flex ist öffentlich lesbar und liefert eine Liste im Feed-Format', async () => {
  const r = await rpc('current_flex');
  eq(r.status, 200); ok(Array.isArray(r.body));
  const allowed = new Set(['entry', 'note', 'week', 'username', 'id', 'path', 'name', 'brand', 'size', 'cond', 'rarity', 'color', 'vis', 'price', 'ts', 'outfit']);
  for (const it of r.body) { for (const k of Object.keys(it)) ok(allowed.has(k), 'unerwartetes Feld im Flex: ' + k); ok(['public', 'sale'].includes(it.vis), 'privates im Flex'); }
});
test('feed_stage liefert 0, 1 oder 2; Kernfunktion ist gesperrt', async () => {
  const r = await rpc('feed_stage', {});
  eq(r.status, 200); ok([0, 1, 2].includes(r.body), 'feed_stage: ' + JSON.stringify(r.body));
  const c = await rpc('feed_rank_core', { p_user: '00000000-0000-0000-0000-000000000001', p_stage: 2, p_offset: 0 });
  ok(c.status >= 400, 'feed_rank_core ist öffentlich aufrufbar');
});
test('feed_ranked liefert nur freigegebene Felder', async () => {
  const r = await rpc('feed_ranked', { p_offset: 0 });
  eq(r.status, 200); ok(Array.isArray(r.body)); ok(r.body.length <= 30, 'mehr als 30 Einträge');
  const allowed = new Set(['username', 'id', 'path', 'name', 'brand', 'size', 'cond', 'rarity', 'color', 'vis', 'price', 'ts', 'outfit']);
  for (const it of r.body) for (const k of Object.keys(it)) ok(allowed.has(k), 'unerwartetes Feld: ' + k);
  for (const it of r.body) ok(['public', 'sale'].includes(it.vis), 'privater Eintrag');
});
test('public_profile: unbekannter Name → null, bekannter nur erlaubte Felder', async () => {
  eq((await rpc('public_profile', { p_username: 'gibt-es-nicht-xyz' })).body, null);
  const all = (await rpc('feed_public', { p_kind: 'items' })).body;
  if (!all.length) return;
  const p = (await rpc('public_profile', { p_username: all[0].username })).body;
  const allowed = new Set(['username', 'bio', 'city', 'followers', 'showcase', 'items', 'outfits']);
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
