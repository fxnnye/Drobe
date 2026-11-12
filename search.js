// Suche (Teil der App, Reihenfolge siehe index.html)
/* Suche wie bei Vinted: Antippen öffnet ein eigenes Fenster (Rest ausgeblendet) mit Artikel/Mitglieder und Suchverlauf */
let searchTimer = null;
const HISTORY_KEY = 'jawnz-search-history', HISTORY_MAX = 10;
const readHistory = () => { try { const h = JSON.parse(localStorage.getItem(HISTORY_KEY)); return Array.isArray(h) ? h.filter((x) => x && typeof x.q === 'string') : []; } catch { return []; } };
const writeHistory = (h) => { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, HISTORY_MAX))); } catch {} };
function rememberSearch() {
  const q = $('soInput').value.trim();
  if (q.length < 2) return;
  const mode = state.searchMode;
  writeHistory([{ q, mode }, ...readHistory().filter((x) => !(x.q.toLowerCase() === q.toLowerCase() && x.mode === mode))]);
}
function renderHistory() {
  const box = $('soHistory'), list = readHistory();
  box.replaceChildren();
  box.hidden = !list.length || $('soInput').value.trim() !== '';
  if (box.hidden) return;
  const head = document.createElement('div');
  head.className = 'so-history-head';
  const t = document.createElement('b');
  t.textContent = 'Zuletzt gesucht';
  const clear = document.createElement('button');
  clear.type = 'button'; clear.className = 'so-link'; clear.textContent = 'Löschen';
  clear.onclick = () => { writeHistory([]); renderHistory(); };
  head.append(t, clear);
  box.append(head);
  list.forEach((x, idx) => {
    const row = document.createElement('div');
    row.className = 'so-history-row';
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'so-history-item';
    const m = document.createElement('span');
    m.className = 'muted small'; m.textContent = x.mode === 'members' ? 'Mitglied' : 'Artikel';
    b.append(document.createTextNode(x.q + ' '), m);
    b.onclick = () => { $('soInput').value = x.q; setSearchMode(x.mode === 'members' ? 'members' : 'items', true); };
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'icon so-del'; del.setAttribute('aria-label', 'Eintrag entfernen'); del.textContent = '×';
    del.onclick = () => { const h = readHistory(); h.splice(idx, 1); writeHistory(h); renderHistory(); };
    row.append(b, del);
    box.append(row);
  });
}
// Angebot: Alle, Öffentlich oder Kaufen (filtert die Treffer)
let searchKind = '';
function setKind(k) {
  searchKind = k;
  document.querySelectorAll('#fKind .chip').forEach((c) => c.classList.toggle('active', c.dataset.kind === k));
}
const byKind = (list) => (searchKind ? list.filter((r) => r.vis === searchKind) : list);
// Farbe, Größe und Marke gibt es erst, wenn ein Artikel gesucht wurde (Ergebnisse sind sichtbar); sonst werden sie geleert
function syncFilters() {
  const show = state.searchMode === 'items' && state.showResults;
  $('soFilters').hidden = !show;
  if (!show) { $('fColor').value = ''; $('fSize').value = ''; $('fBrand').value = ''; setKind(''); }
}
function setSearchMode(mode, showResults = false) {
  state.searchMode = mode;
  state.showResults = showResults;
  document.querySelectorAll('#searchMode .chip').forEach((c) => c.classList.toggle('active', c.dataset.mode === mode));
  $('soInput').placeholder = mode === 'members' ? 'Benutzername suchen' : 'Marke oder Teil suchen';
  runSearch();
}
// Vorschläge beim Tippen: passende Marken und Artikelnamen; ein Tipp zeigt alle Teile, bei denen Marke oder Beschreibung passt
function renderSuggestions(list, t, box) {
  const variants = expandQuery(t).map((v) => v.split(' ').filter(Boolean));
  const hit = (s) => variants.some((words) => words.every((w) => String(s || '').toLowerCase().includes(w)));
  const brands = new Map(), names = new Map();
  for (const it of list) {
    if (it.brand && hit(it.brand)) { const k = it.brand.toLowerCase(); brands.set(k, { text: it.brand, n: (brands.get(k)?.n || 0) + 1 }); }
    if (it.name && hit(it.name)) { const k = it.name.toLowerCase(); if (!names.has(k)) names.set(k, { text: it.name }); }
  }
  const rows = [
    { text: t, label: 'Alle Ergebnisse', strong: true },
    ...[...brands.values()].slice(0, 4).map((b) => ({ text: b.text, label: 'Marke · ' + b.n + (b.n === 1 ? ' Teil' : ' Teile') })),
    ...[...names.values()].slice(0, 6).map((n) => ({ text: n.text, label: 'Artikel' })),
  ];
  box.replaceChildren();
  for (const r of rows) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'so-suggest';
    const s = document.createElement('b');
    s.textContent = r.text;
    const l = document.createElement('span');
    l.className = 'muted small';
    l.textContent = r.label;
    b.append(s, l);
    b.onclick = () => { $('soInput').value = r.text; state.showResults = true; rememberSearch(); runSearch(); };
    box.append(b);
  }
}
// Filter für Artikel: Farbe (automatisch erkannt), Größe, Marke
const searchFilters = () => ({ color: $('fColor').value, size: $('fSize').value.trim(), brand: $('fBrand').value.trim() });
// Artikel suchen: auch mit verwandten Begriffen (siehe begriffe.js), Treffer der eigenen Eingabe stehen vorn, doppelte fallen weg
async function fetchRelated(t, filters) {
  const variants = t ? expandQuery(t) : [''];
  const lists = await Promise.all(variants.map((v, i) => Profile.fetchItems(v, filters).catch((e) => { if (i === 0) throw e; return []; }))); // fehlt nur eine Erweiterung, bleibt die Suche gültig
  const seen = new Set(), out = [];
  for (const r of lists.flat()) { const k = r.username + '/' + r.id; if (!seen.has(k)) { seen.add(k); out.push(r); } }
  return out;
}
const filtersActive = () => state.searchMode === 'items' && Object.values(searchFilters()).some(Boolean);
async function runSearch() {
  syncFilters();
  const q = $('soInput').value, mode = state.searchMode, t = q.trim();
  const box = $('memberResults');
  renderHistory();
  if (!t && !filtersActive()) { box.hidden = true; box.replaceChildren(); return; }
  box.hidden = false;
  box.replaceChildren();
  const note = (m) => { const p = document.createElement('p'); p.className = 'muted'; p.textContent = m; box.append(p); };
  const fail = (m) => { box.replaceChildren(); errorNotice(box, m, runSearch); };
  const fkey = JSON.stringify(searchFilters()), kkey = searchKind;
  const stale = () => $('soInput').value !== q || state.searchMode !== mode || JSON.stringify(searchFilters()) !== fkey || searchKind !== kkey; // inzwischen weitergetippt
  if (mode === 'items') {
    const filters = searchFilters();
    const hasFilter = Object.values(filters).some(Boolean);
    if (t.length < 2 && !hasFilter) return note('Gib mindestens 2 Zeichen ein.');
    if (state.showResults || hasFilter) { const g = document.createElement('div'); g.className = 'grid'; box.append(g); skeletons(g, 4); }
    try {
      const list = await fetchRelated(t.length >= 2 ? t : '', filters);
      if (stale()) return;
      if (state.showResults || hasFilter) return await Profile.showItems(byKind(list), box, stale);
      renderSuggestions(list, t, box);
    } catch (e) { console.error(e); if (!stale()) fail(navigator.onLine ? 'Die Suche ist gerade nicht verfügbar.' : 'Für die Suche brauchst du eine Internetverbindung.'); }
    return;
  }
  if (t.length < 2) return note('Gib mindestens 2 Zeichen eines Benutzernamens ein.');
  let names;
  try { names = await Profile.search(t); } catch (e) { console.error(e); if (!stale()) fail('Die Mitgliedersuche ist gerade nicht verfügbar.'); return; }
  if (stale()) return;
  if (!names.length) return note('Keine Mitglieder gefunden. Prüfe die Schreibweise des Benutzernamens.');
  for (const n of names) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'member';
    b.textContent = n;
    b.onclick = () => { rememberSearch(); location.hash = '#/u/' + n; };
    box.append(b);
  }
}
$('soInput').addEventListener('input', () => { state.showResults = false; syncFilters(); clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 300); });
$('soInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(searchTimer); state.showResults = true; rememberSearch(); runSearch(); $('soInput').blur(); } });
$('memberResults').addEventListener('click', (e) => { if (e.target.closest('.card')) rememberSearch(); }, true);
document.querySelectorAll('#searchMode .chip').forEach((c) => { c.onclick = () => setSearchMode(c.dataset.mode); });
for (const c of COLORS) { $('fColor').append(new Option(c, c)); $('upColor').append(new Option(c, c)); }
document.querySelectorAll('#fKind .chip').forEach((c) => { c.onclick = () => { setKind(c.dataset.kind); clearTimeout(searchTimer); runSearch(); }; });
for (const id of ['fColor', 'fSize', 'fBrand']) {
  $(id).addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 300); });
}

// Fotosuche: ein Foto wählen, dann zeigt die Suche ähnliche (am besten gleiche) öffentliche Teile anderer.
// Neben dem Gesamteindruck (Bild-Vektor) zählen erkannte Marke (Logo, Aufdruck) und Farbe: passende Teile rücken nach vorn.
{
  const box = $('photoSearch'), res = $('photoResults'), thumb = $('photoThumb'), tags = $('photoTags');
  let token = 0, thumbUrl = null, found = null, use = {};
  const note = (t) => res.replaceChildren(Object.assign(document.createElement('p'), { className: 'muted small', textContent: t }));
  const close = () => {
    token++; box.hidden = true; res.replaceChildren(); tags.replaceChildren(); found = null;
    if (thumbUrl) { URL.revokeObjectURL(thumbUrl); thumbUrl = null; }
    thumb.removeAttribute('src');
  };
  $('photoClose').addEventListener('click', close);
  $('soInput').addEventListener('input', () => { if (!box.hidden) close(); }); // Tippen beendet die Fotosuche
  const same = (a, b) => a && b && brandKey(a) === brandKey(b);
  // Reihenfolge: passende Marke, dann passende Farbe, dann der Bildeindruck (Platz in der Ähnlichkeitsliste)
  async function render(my) {
    const { visual, byBrand, brand, color } = found;
    const all = new Map();
    visual.forEach((it, i) => all.set(it.id, { it, rank: i }));
    byBrand.forEach((it) => { if (!all.has(it.id)) all.set(it.id, { it, rank: 50 }); });
    const score = ({ it, rank }) => rank - (use.brand && brand && same(it.brand, brand) ? 100 : 0) - (use.color && color && it.color === color ? 20 : 0);
    const list = [...all.values()].sort((x, y) => score(x) - score(y)).slice(0, 24).map((x) => x.it);
    await Profile.showItems(list, res, () => my !== token);
  }
  function drawTags(my) {
    tags.replaceChildren();
    for (const k of ['brand', 'color']) {
      if (!found[k]) continue;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip' + (use[k] ? ' active' : ''); b.textContent = found[k];
      b.setAttribute('aria-pressed', use[k]);
      b.onclick = () => { use[k] = !use[k]; drawTags(my); render(my); }; // antippen schaltet die Gewichtung aus oder an
      tags.append(b);
    }
  }
  $('soPhotoInput').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!Cloud.user()) { toast('Dafür musst du angemeldet sein'); return; }
    close();
    const my = ++token;
    thumbUrl = URL.createObjectURL(f); thumb.src = thumbUrl;
    box.hidden = false; $('soHistory').hidden = true;
    note('Suche ähnliche Teile … (beim ersten Mal wird ein kleines Bildmodell geladen)');
    try {
      const d = await describePhoto(f);
      if (my !== token) return;
      const sb = Cloud.client();
      const [vis, brandList] = await Promise.all([
        sb.rpc('similar_public_items', { p_emb: '[' + d.emb.join(',') + ']' }),
        d.brand ? Profile.fetchItems(d.brand, { brand: d.brand }).catch(() => []) : [],
      ]);
      if (vis.error) throw vis.error;
      if (my !== token) return;
      found = { visual: vis.data || [], byBrand: brandList, brand: d.brand, color: d.color };
      use = { brand: !!d.brand, color: !!d.color };
      drawTags(my);
      await render(my);
    } catch (err) { console.error(err); if (my === token) note('Die Fotosuche hat nicht geklappt.'); }
  });
}
