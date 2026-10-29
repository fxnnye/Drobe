const CATEGORIES = ['Outerwear', 'Sweater', 'Shirts', 'Hosen', 'Schuhe', 'Taschen', 'Schmuck', 'Caps/Beanies', 'Belts'];
// Hauptkategorien mit Unterkategorien (Teile selbst tragen immer eine Unterkategorie)
const GROUPS = {
  Oberteile: ['Outerwear', 'Sweater', 'Shirts'],
  Accessoires: ['Taschen', 'Schmuck', 'Caps/Beanies', 'Belts'],
};
const DEFAULT_SUB = { Oberteile: 'Shirts', Accessoires: 'Taschen' }; // Vorauswahl beim Hochladen
const TOP = ['Oberteile', 'Hosen', 'Schuhe', 'Accessoires'];
// Alte Kategorien aus früheren Versionen
const LEGACY = { Jacken: 'Outerwear', Oberteile: 'Shirts', Accessoires: 'Taschen', Kleider: 'Shirts' };
// Maximalgröße je Kategorie (w: Anteil der Bühnenbreite, h: Anteil der Bühnenhöhe). Ein Teil wird mit seinem
// Seitenverhältnis so eingepasst, dass es hineinpasst: so wirken Hose, Jacke und Schuhe im gleichen Maßstab.
const PLACEMENT = {
  Outerwear: { w: 0.55, h: 0.32 },
  Shirts: { w: 0.52, h: 0.30 },
  Sweater: { w: 0.58, h: 0.32 },
  Hosen: { w: 0.50, h: 0.50 },
  Belts: { w: 0.28, h: 0.05 },
  Taschen: { w: 0.40, h: 0.22 },
  Schmuck: { w: 0.14, h: 0.08 },
  'Caps/Beanies': { w: 0.30, h: 0.12 },
  Schuhe: { w: 0.44, h: 0.15 },
};
const STAGE_RATIO = 16 / 9; // Höhe : Breite der Bühne
const MULTI = ['Schmuck']; // Kategorien, von denen mehrere Teile gleichzeitig im Outfit sein dürfen
const EXCLUSIVE = { Shirts: ['Shirts', 'Sweater'], Sweater: ['Shirts', 'Sweater'] }; // ersetzen sich gegenseitig
// Standard-Stapelreihenfolge (hinten → vorne)
const STACK = ['Outerwear', 'Shirts', 'Sweater', 'Hosen', 'Belts', 'Taschen', 'Schmuck', 'Caps/Beanies', 'Schuhe'];
const EXPORT_W = 900, EXPORT_H = 1600;

const $ = (id) => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------- Speicher (IndexedDB) ---------- */
let db;
function openDb(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 2);
    req.onupgradeneeded = () => {
      for (const name of ['items', 'outfits', 'wishlist']) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx(store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r && r.result);
    t.onerror = () => reject(t.error);
  });
}
const dbAll = (s) => tx(s, 'readonly', (o) => o.getAll());
const rawPut = (s, v) => tx(s, 'readwrite', (o) => o.put(v));
const rawDel = (s, id) => tx(s, 'readwrite', (o) => o.delete(id));
// Alle Änderungen der App laufen hier durch: lokal speichern, dann im Hintergrund ins Konto
async function dbPut(s, v) {
  v.updated = Date.now();
  const r = await rawPut(s, v);
  Cloud.queue(s, v.id, 'put');
  return r;
}
async function dbDel(s, id) {
  const r = await rawDel(s, id);
  Cloud.queue(s, id, 'del');
  return r;
}

/* ---------- Zustand ---------- */
let items = [];
let outfits = [];
let wishlist = [];
const urls = new Map(); // id -> Object-URL
const state = {
  closetFilter: 'Alle',
  wishFilter: 'Alle',
  pickerFilter: 'Alle',
  outfit: { id: null, name: '', layers: [] }, // layers: {uid,itemId,x,y,w}
  selected: null,
  editingItem: null,
};
const itemById = (id) => items.find((i) => i.id === id);
function urlFor(rec) {
  if (!urls.has(rec.id)) urls.set(rec.id, URL.createObjectURL(rec.blob));
  return urls.get(rec.id);
}

// Eigene Rückfrage statt confirm(), das in eingebetteten Browsern oft stumm „Nein“ liefert
function askConfirm(text, yesLabel = 'Löschen') {
  const d = $('confirmDialog');
  $('confirmText').textContent = text;
  $('confirmYes').textContent = yesLabel;
  return new Promise((resolve) => {
    const done = (v) => {
      $('confirmYes').onclick = $('confirmNo').onclick = d.onclose = null;
      if (d.open) d.close();
      resolve(v);
    };
    $('confirmYes').onclick = () => done(true);
    $('confirmNo').onclick = () => done(false);
    d.onclose = () => done(false); // Esc
    d.showModal();
  });
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- Bilder ---------- */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
function canvasBlob(canvas, type, q) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, q));
}
// Stellt Teile frei: Hintergrund wird vom Rand aus entfernt, wenn er einfarbig ist (z. B. weißer
// Produktfoto-Hintergrund). Danach auf den sichtbaren Bereich zugeschnitten. Sonst bleibt das Bild unverändert.
function cutOut(canvas, tol = 30) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const px = (x, y) => (y * w + x) * 4;
  const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)].map((i) => [d[i], d[i + 1], d[i + 2]]);
  const bg = [0, 1, 2].map((k) => Math.round(corners.reduce((s, c) => s + c[k], 0) / 4));
  const near = (i) => Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2])) <= tol;
  if (!corners.every((c) => Math.max(...c.map((v, k) => Math.abs(v - bg[k]))) <= tol)) return canvas; // Hintergrund nicht einfarbig

  const gone = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  const push = (x, y) => {
    const p = y * w + x;
    if (!gone[p] && near(p * 4)) { gone[p] = 1; queue[tail++] = p; }
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (head < tail) {
    const p = queue[head++], x = p % w, y = (p - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  if (tail < w * h * 0.05 || tail > w * h * 0.97) return canvas; // nichts oder fast alles erkannt: lieber nicht anfassen

  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (gone[p]) { d[p * 4 + 3] = 0; continue; }
      // Randpixel leicht abschwächen, damit kein heller Saum bleibt
      const edge = (x > 0 && gone[p - 1]) || (x < w - 1 && gone[p + 1]) || (y > 0 && gone[p - w]) || (y < h - 1 && gone[p + w]);
      if (edge) d[p * 4 + 3] = 150;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  ctx.putImageData(img, 0, 0);
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1; out.height = maxY - minY + 1;
  out.getContext('2d').drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

// Verkleinert Uploads auf max. 900px, damit der Browser-Speicher nicht vollläuft
async function shrink(file, removeBg) {
  const src = URL.createObjectURL(file);
  try {
    const img = await loadImage(src);
    const scale = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
    let c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    if (removeBg) c = cutOut(c);
    return (await canvasBlob(c, 'image/webp', 0.9)) || (await canvasBlob(c, 'image/png'));
  } finally {
    URL.revokeObjectURL(src);
  }
}

/* ---------- Navigation ---------- */
function showView(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
  if (name === 'builder') { renderPicker(); renderStage(); }
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));

/* ---------- Filter-Chips ---------- */
// Filterwert ist eine Hauptkategorie, eine Unterkategorie oder „Alle“
const matchesFilter = (it, f) => f === 'Alle' || it.category === f || !!GROUPS[f]?.includes(it.category);
const inGroup = (f) => GROUPS[f] ? f : Object.keys(GROUPS).find((g) => GROUPS[g].includes(f));

function renderChips(el, key, onChange) {
  el.innerHTML = '';
  const chip = (parent, label, value) => {
    const b = document.createElement('button');
    const group = inGroup(state[key]);
    const active = parent === el ? (state[key] === value || group === value) : state[key] === value;
    b.className = 'chip' + (active ? ' active' : '');
    b.textContent = label;
    b.onclick = () => { state[key] = value; onChange(); };
    parent.appendChild(b);
  };
  ['Alle', ...TOP].forEach((c) => chip(el, c, c));
  const group = inGroup(state[key]);
  if (group) { // zweite Reihe mit den Unterkategorien
    const sub = document.createElement('div');
    sub.className = 'subchips';
    chip(sub, 'Alle ' + group, group);
    GROUPS[group].forEach((c) => chip(sub, c, c));
    el.appendChild(sub);
  }
}
// Kategorie, die beim Hochladen zum aktuellen Filter passt
const uploadCategoryFor = (f) => DEFAULT_SUB[f] || f;
function fillSelect(sel) {
  const opt = (c) => `<option>${c}</option>`;
  sel.innerHTML = TOP.map((c) => GROUPS[c]
    ? `<optgroup label="${c}">${GROUPS[c].map(opt).join('')}</optgroup>` : opt(c)).join('');
}

/* ---------- Schrank ---------- */
function renderCloset() {
  renderChips($('closetFilter'), 'closetFilter', renderCloset);
  // Beim Hochladen gleich die Kategorie vorauswählen, die gerade angezeigt wird
  const f = state.closetFilter;
  if (f !== 'Alle' && !(GROUPS[f] && GROUPS[f].includes($('uploadCategory').value))) {
    $('uploadCategory').value = uploadCategoryFor(f);
  }
  const grid = $('closetGrid');
  grid.innerHTML = '';
  const list = items.filter((i) => matchesFilter(i, state.closetFilter));
  list.forEach((it) => {
    const card = document.createElement('button');
    card.className = 'card';
    card.innerHTML = `<div class="img"><img alt=""></div><div class="meta"><b></b><span></span><i class="note"></i></div>`;
    card.querySelector('img').src = urlFor(it);
    card.querySelector('b').textContent = it.name;
    card.querySelector('span').textContent = it.category;
    card.querySelector('.note').textContent = it.note || '';
    card.onclick = () => openItemDialog(it);
    grid.appendChild(card);
  });
  $('closetEmpty').classList.toggle('show', list.length === 0);
  $('closetEmpty').textContent = items.length === 0
    ? 'Dein Schrank ist noch leer. Lade oben das erste Teil hoch.'
    : 'Keine Teile in dieser Kategorie.';
}

/* Upload-Dialog: pro Foto Vorschau, Name, Kategorie und optional „Hintergrund entfernen“ */
const upDlg = $('uploadDialog');
const BG_LIB = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm';
let upQueue = [], upCur = null, upTotal = 0, upDone = 0, upAdded = 0;

function trimAlpha(canvas) {
  const { width: w, height: h } = canvas;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 8) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return canvas;
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1; out.height = maxY - minY + 1;
  out.getContext('2d').drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}
// KI-Freistellen im Browser (lädt beim ersten Mal das Modell, danach schnell). Ohne Netz: einfache Methode.
async function removeBackground(blob, onProgress = () => {}) {
  const src = URL.createObjectURL(blob);
  try {
    const img = await loadImage(src);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    try {
      const lib = await import(BG_LIB);
      const out = await lib.removeBackground(blob, {
        output: { format: 'image/png' },
        progress: (key, cur, total) => onProgress(key.startsWith('fetch') ? 'download' : 'compute', total ? cur / total : 0),
      });
      const oi = await loadImage(URL.createObjectURL(out));
      c.getContext('2d').drawImage(oi, 0, 0, c.width, c.height);
      return canvasBlob(trimAlpha(c), 'image/webp', 0.9);
    } catch (e) {
      console.warn('KI-Freistellen nicht verfügbar, nutze einfache Methode', e);
      c.getContext('2d').drawImage(img, 0, 0);
      const simple = cutOut(c);
      if (simple === c) throw new Error('Hintergrund nicht erkannt');
      return canvasBlob(simple, 'image/webp', 0.9);
    }
  } finally {
    URL.revokeObjectURL(src);
  }
}

let upTarget = 'closet'; // 'closet' oder 'wish': wohin die aktuell hochgeladenen Fotos kommen
const upColl = () => (upTarget === 'wish' ? { store: 'wishlist', list: wishlist } : { store: 'items', list: items });
const renderLists = () => { renderCloset(); renderWishlist(); };

async function addFiles(files, target = 'closet') {
  const imgs = [...files].filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) return;
  if (!upCur) upTarget = target;
  upQueue.push(...imgs);
  upTotal += imgs.length;
  if (!upCur) nextUpload();
}
const nameFromFile = (f) => f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 60) || 'Neues Teil';

async function nextUpload() {
  const f = upQueue.shift();
  if (upCur && upCur.url) URL.revokeObjectURL(upCur.url);
  if (!f) {
    upCur = null; upTotal = upDone = 0;
    if (upDlg.open) upDlg.close();
    renderLists();
    if (upAdded) toast(upAdded === 1 ? 'Teil hinzugefügt' : upAdded + ' Teile hinzugefügt');
    upAdded = 0;
    return;
  }
  try {
    const orig = await shrink(f);
    upCur = { file: f, orig, cut: null, useCut: false, busy: false, url: null, angle: 0 };
    $('upAngle').value = 0;
    $('upName').value = nameFromFile(f);
    $('upCategory').value = (upTarget === 'wish' ? $('wishUploadCategory') : $('uploadCategory')).value;
    $('upWish').hidden = upTarget !== 'wish';
    $('upNote').value = '';
    $('upLink').value = '';
    upDone++;
    refreshUpload();
    if (!upDlg.open) upDlg.showModal();
  } catch (e) {
    console.error(e);
    toast('Konnte ' + f.name + ' nicht laden');
    upCur = upCur && upCur.url ? null : upCur;
    nextUpload();
  }
}
// Dreht ein Bild um beliebige Grad; die Leinwand wächst mit, überstehende leere Ränder werden abgeschnitten
async function rotateBlob(blob, deg) {
  if (!deg) return blob;
  const src = URL.createObjectURL(blob);
  try {
    const img = await loadImage(src);
    const r = deg * Math.PI / 180, cos = Math.abs(Math.cos(r)), sin = Math.abs(Math.sin(r));
    const c = document.createElement('canvas');
    c.width = Math.ceil(img.naturalWidth * cos + img.naturalHeight * sin);
    c.height = Math.ceil(img.naturalWidth * sin + img.naturalHeight * cos);
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(r);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    return await canvasBlob(trimAlpha(c), 'image/webp', 0.9);
  } finally {
    URL.revokeObjectURL(src);
  }
}
const wrapAngle = (a) => ((a + 180) % 360 + 360) % 360 - 180;

async function updateUpPreview(u) {
  const seq = u.seq = (u.seq || 0) + 1;
  const blob = await rotateBlob(u.useCut ? u.cut : u.orig, u.angle || 0);
  if (seq !== u.seq || upCur !== u) return;
  if (u.url) URL.revokeObjectURL(u.url);
  u.url = URL.createObjectURL(blob);
  $('upPreview').src = u.url;
}
function setUpAngle(a) {
  if (!upCur || upCur.busy) return;
  upCur.angle = a;
  $('upAngle').value = a;
  updateUpPreview(upCur);
}
$('upRotL').onclick = () => setUpAngle(wrapAngle((upCur.angle || 0) - 90));
$('upRotR').onclick = () => setUpAngle(wrapAngle((upCur.angle || 0) + 90));
$('upAngle').oninput = (e) => setUpAngle(+e.target.value);

function refreshUpload() {
  const u = upCur;
  updateUpPreview(u);
  $('upProgress').textContent = upTotal > 1 ? `Foto ${upDone} von ${upTotal}` : '';
  $('upRemove').disabled = u.busy;
  $('upAdd').disabled = u.busy;
  $('upSkip').disabled = u.busy;
  $('upAll').disabled = u.busy;
  $('upBatch').hidden = upQueue.length === 0 || upTarget === 'wish'; // Links sind pro Teil, deshalb kein Sammel-Upload
  if (!u.busy) $('upAll').textContent = `Alle ${upQueue.length + 1} Fotos hinzufügen`;
  $('upRemove').textContent = u.busy ? (u.status || 'Hintergrund wird entfernt …') : u.useCut ? 'Original anzeigen' : 'Hintergrund entfernen';
  $('upPreview').parentElement.classList.toggle('busy', u.busy);
}
$('upRemove').addEventListener('click', async () => {
  const u = upCur;
  if (u.busy) return;
  if (u.cut) { u.useCut = !u.useCut; return refreshUpload(); }
  u.busy = true; refreshUpload();
  try {
    u.status = 'KI-Modell wird geladen … (einmalig, kann etwas dauern)';
    u.cut = await removeBackground(u.orig, (phase, frac) => {
      u.status = phase === 'download'
        ? `KI-Modell wird geladen … ${Math.round(frac * 100)} % (einmalig)`
        : 'Hintergrund wird entfernt …';
      if (upCur === u) $('upRemove').textContent = u.status;
    });
    u.useCut = true;
  } catch (e) {
    console.error(e);
    toast('Hintergrund konnte nicht entfernt werden');
  }
  u.busy = false;
  if (upCur === u) refreshUpload();
});
$('upAdd').addEventListener('click', async () => {
  const u = upCur;
  const coll = upColl();
  const rawLink = $('upLink').value.trim();
  const link = upTarget === 'wish' ? cleanLink(rawLink) : '';
  if (rawLink && upTarget === 'wish' && !link) return toast('Der Link sieht nicht richtig aus');
  const rec = {
    id: uid(), name: $('upName').value.trim() || 'Neues Teil', category: $('upCategory').value,
    blob: await rotateBlob(u.useCut ? u.cut : u.orig, u.angle || 0), created: Date.now(),
  };
  const note = $('upNote').value.trim().slice(0, 120);
  if (upTarget === 'wish' && note) rec.note = note;
  if (link) rec.link = link;
  await dbPut(coll.store, rec);
  coll.list.push(rec);
  upAdded++;
  nextUpload();
});
$('upSkip').addEventListener('click', () => nextUpload());

// Alle übrigen Fotos auf einmal mit der gewählten Kategorie hinzufügen (optional mit Hintergrund-Entfernen)
$('upAll').addEventListener('click', async () => {
  const u = upCur;
  if (u.busy) return;
  const category = $('upCategory').value;
  const bgAll = $('upAllBg').checked;
  const jobs = [
    { name: $('upName').value.trim() || nameFromFile(u.file), blob: await rotateBlob(u.useCut ? u.cut : u.orig, u.angle || 0), cut: u.useCut },
    ...upQueue.map((file) => ({ file, name: nameFromFile(file) })),
  ];
  upQueue = [];
  u.busy = true;
  refreshUpload();
  let failed = 0;
  for (const [i, j] of jobs.entries()) {
    $('upAll').textContent = `Wird hinzugefügt … ${i + 1}/${jobs.length}`;
    try {
      let blob = j.blob || await shrink(j.file);
      if (bgAll && !j.cut) {
        try { blob = await removeBackground(blob); } catch (e) { failed++; } // bei Fehler: Original behalten
      }
      const rec = { id: uid(), name: j.name, category, blob, created: Date.now() };
      const coll = upColl();
      await dbPut(coll.store, rec);
      coll.list.push(rec);
      upAdded++;
    } catch (e) {
      console.error(e);
      toast('Ein Foto konnte nicht geladen werden');
    }
  }
  u.busy = false;
  await nextUpload(); // Warteschlange ist leer: schließt den Dialog und zeigt die Meldung
  if (failed) toast(`Bei ${failed} Foto(s) konnte der Hintergrund nicht entfernt werden`);
});
upDlg.addEventListener('cancel', (e) => { if (upCur && upCur.busy) e.preventDefault(); });
upDlg.addEventListener('close', () => { // Esc: Rest der Warteschlange verwerfen
  if (!upCur) return;
  URL.revokeObjectURL(upCur.url);
  upCur = null; upQueue = []; upTotal = upDone = 0;
  renderLists();
  if (upAdded) toast(upAdded === 1 ? 'Teil hinzugefügt' : upAdded + ' Teile hinzugefügt');
  upAdded = 0;
});
$('fileInput').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
const dz = $('dropzone');
['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
dz.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));
$('wishFileInput').addEventListener('change', (e) => { addFiles(e.target.files, 'wish'); e.target.value = ''; });
const wdz = $('wishDrop');
['dragenter', 'dragover'].forEach((ev) => wdz.addEventListener(ev, (e) => { e.preventDefault(); wdz.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => wdz.addEventListener(ev, (e) => { e.preventDefault(); wdz.classList.remove('over'); }));
wdz.addEventListener('drop', (e) => addFiles(e.dataTransfer.files, 'wish'));

/* Teil bearbeiten */
const dlg = $('itemDialog');
let itAngle = 0, itSeq = 0, itUrl = null;
async function updateItemPreview() {
  const seq = ++itSeq;
  const blob = await rotateBlob(state.editingItem.blob, itAngle);
  if (seq !== itSeq) return;
  if (itUrl) URL.revokeObjectURL(itUrl);
  itUrl = URL.createObjectURL(blob);
  $('itemPreview').src = itUrl;
}
function setItemAngle(a) {
  itAngle = a;
  $('itAngle').value = a;
  updateItemPreview();
}
$('itRotL').onclick = () => setItemAngle(wrapAngle(itAngle - 90));
$('itRotR').onclick = () => setItemAngle(wrapAngle(itAngle + 90));
$('itAngle').oninput = (e) => setItemAngle(+e.target.value);
$('itScale').oninput = (e) => { $('itScaleVal').textContent = e.target.value + ' %'; };

function setItemEditOpen(open) {
  $('itEdit').hidden = !open;
  $('itEditToggle').setAttribute('aria-expanded', open);
  $('itEditToggle').textContent = open ? 'Bearbeiten schließen' : 'Bearbeiten';
}
$('itEditToggle').onclick = () => setItemEditOpen($('itEdit').hidden);

// Größenregler im Teil-Dialog: Schuhe dürfen größer eingestellt werden als alles andere
const scaleMax = (category) => (category === 'Schuhe' ? 200 : 150);
$('itemCategory').addEventListener('change', () => {
  const max = scaleMax($('itemCategory').value);
  $('itScale').max = max;
  if (+$('itScale').value > max) $('itScale').value = max;
  $('itScaleVal').textContent = $('itScale').value + ' %';
});

function openItemDialog(it) {
  state.editingItem = it;
  itAngle = 0;
  $('itAngle').value = 0;
  $('itemCategory').value = it.category;
  $('itScale').max = scaleMax(it.category);
  $('itScale').value = Math.round((it.scale || 1) * 100);
  $('itScaleVal').textContent = $('itScale').value + ' %';
  setItemEditOpen(false); // Drehen und Größe sind erst nach „Bearbeiten“ sichtbar
  $('itemPreview').src = urlFor(it);
  $('itemName').value = it.name;
  $('itemNote').value = it.note || '';
  dlg.showModal();
}
$('itemForm').addEventListener('submit', async (e) => {
  if (e.submitter && e.submitter.value === 'save') {
    const it = state.editingItem;
    it.name = $('itemName').value.trim() || it.name;
    it.category = $('itemCategory').value;
    const note = $('itemNote').value.trim();
    if (note) it.note = note; else delete it.note;
    const scale = +$('itScale').value / 100;
    if (scale === 1) delete it.scale; else it.scale = scale;
    if (itAngle) { // gedrehtes Bild dauerhaft übernehmen
      it.blob = await rotateBlob(it.blob, itAngle);
      if (urls.has(it.id)) { URL.revokeObjectURL(urls.get(it.id)); urls.delete(it.id); }
      aspects.delete(it.id);
    }
    await dbPut('items', it);
    renderCloset();
    renderPicker();
    renderStage();
  }
});
$('itemDelete').addEventListener('click', async () => {
  const it = state.editingItem;
  const used = outfits.filter((o) => o.layers.some((l) => l.itemId === it.id)).length;
  const msg = used
    ? `„${it.name}" wird in ${used} Outfit(s) verwendet und verschwindet dort. Trotzdem löschen?`
    : `„${it.name}" löschen?`;
  if (!(await askConfirm(msg))) return;
  await dbDel('items', it.id);
  items = items.filter((i) => i.id !== it.id);
  URL.revokeObjectURL(urls.get(it.id));
  urls.delete(it.id);
  aspects.delete(it.id);
  state.outfit.layers = state.outfit.layers.filter((l) => l.itemId !== it.id);
  dlg.close();
  renderCloset();
  renderOutfits();
});

/* ---------- Outfit-Builder ---------- */
function renderPicker() {
  renderChips($('pickerFilter'), 'pickerFilter', renderPicker);
  const grid = $('pickerGrid');
  grid.innerHTML = '';
  const list = items.filter((i) => matchesFilter(i, state.pickerFilter));
  list.forEach((it) => {
    const b = document.createElement('button');
    b.className = 'pick';
    b.dataset.id = it.id;
    b.title = it.name;
    b.innerHTML = '<img alt="">';
    b.firstChild.src = urlFor(it);
    b.onclick = () => toggleItem(it);
    grid.appendChild(b);
  });
  markPicks();
  $('pickerEmpty').classList.toggle('show', list.length === 0);
  $('pickerEmpty').textContent = items.length === 0
    ? 'Lade zuerst Teile in den Schrank hoch.'
    : 'Keine Teile in dieser Kategorie.';
}

function markPicks() {
  const used = new Set(state.outfit.layers.map((l) => l.itemId));
  document.querySelectorAll('.pick').forEach((b) => b.classList.toggle('active', used.has(b.dataset.id)));
}

// Antippen: Teil hinzufügen; ist es schon im Outfit, wird es wieder entfernt
function toggleItem(it) {
  const existing = state.outfit.layers.find((l) => l.itemId === it.id);
  if (existing) {
    state.outfit.layers = state.outfit.layers.filter((l) => l !== existing);
    if (state.selected === existing.uid) state.selected = null;
    relayout().then(renderStage);
    return;
  }
  addLayer(it);
}

// Seitenverhältnis (Höhe/Breite) eines Teils, einmal gemessen und gemerkt
const aspects = new Map();
async function aspectOf(it) {
  if (!aspects.has(it.id)) {
    const img = await loadImage(urlFor(it));
    aspects.set(it.id, img.naturalHeight / img.naturalWidth);
  }
  return aspects.get(it.id);
}
// Standardbreite eines Teils: so groß, wie es in die Fläche seiner Kategorie passt
const fitWidth = (it, aspect) => {
  const box = PLACEMENT[it.category];
  return Math.min(box.w, box.h * STAGE_RATIO / aspect);
};

async function addLayer(it) {
  const aspect = await aspectOf(it);
  const w = fitWidth(it, aspect) * (it.scale || 1); // it.scale: vom Nutzer gemerkte Anpassung
  // Regeln: pro Kategorie nur ein Teil (Schmuck: beliebig viele), Shirt und Sweater schließen sich aus
  const replaced = MULTI.includes(it.category) ? [] : EXCLUSIVE[it.category] || [it.category];
  state.outfit.layers = state.outfit.layers.filter((l) => !replaced.includes(itemById(l.itemId)?.category));
  const layer = { uid: uid(), itemId: it.id, x: 0.3, y: 0.3, w };
  // Standard-Stapelreihenfolge einhalten (Jacke hinter Oberteil usw.)
  const rank = STACK.indexOf(it.category);
  const at = state.outfit.layers.findIndex((l) => STACK.indexOf(itemById(l.itemId).category) > rank);
  state.outfit.layers.splice(at < 0 ? state.outfit.layers.length : at, 0, layer);
  state.selected = layer.uid;
  await relayout();
  renderStage();
}

// Ordnet die Teile in zwei Spalten mit gleichmäßigem Abstand an: links Cap, Oberteil, Hose; rechts Jacke, Tasche,
// Schuhe (Gürtel auf dem Hosenbund, Schmuck in einer Reihe darunter). Von Hand verschobene Teile bleiben liegen.
const GAP = -0.006; // gleicher Abstand zwischen allen Teilen (leicht negativ = sie berühren sich knapp)
const COL_LEFT = 0.29, COL_RIGHT = 0.71; // Mittellinien der beiden Spalten
async function relayout() {
  const auto = state.outfit.layers.filter((l) => !l.manual && itemById(l.itemId));
  await Promise.all(auto.map((l) => aspectOf(itemById(l.itemId))));
  const of = (cat) => auto.filter((l) => itemById(l.itemId).category === cat);
  const hf = (l) => l.w * aspects.get(l.itemId) / STAGE_RATIO; // Höhe als Anteil der Bühnenhöhe
  const clampX = (x, l) => Math.max(0, Math.min(1 - l.w, x));
  const place = (l, cx, y) => { l.x = clampX(cx - l.w / 2, l); l.y = y; return y + hf(l) + GAP; };

  // Linke Spalte von oben nach unten
  let y = 0.03, pants = null;
  for (const cat of ['Caps/Beanies', 'Shirts', 'Sweater', 'Hosen']) {
    for (const l of of(cat)) {
      if (cat === 'Hosen') pants = l;
      y = place(l, COL_LEFT, y);
    }
  }
  for (const l of of('Belts')) place(l, COL_LEFT, pants ? pants.y + 0.005 : y); // Gürtel auf dem Hosenbund

  // Rechte Spalte: ohne Jacke beginnt sie auf Höhe der Hose
  let yr = of('Outerwear').length ? 0.03 : (pants ? pants.y : 0.3);
  for (const cat of ['Outerwear', 'Taschen', 'Schuhe']) for (const l of of(cat)) yr = place(l, COL_RIGHT, yr);

  // Schmuck: kleine Reihe unter der rechten Spalte
  of('Schmuck').forEach((l, k) => {
    l.x = clampX(0.52 + (k % 3) * 0.15, l);
    l.y = yr + 0.01 + Math.floor(k / 3) * 0.1;
  });
}

function renderStage() {
  const stage = $('stage');
  stage.querySelectorAll('.layer').forEach((n) => n.remove());
  const layers = state.outfit.layers.filter((l) => itemById(l.itemId));
  $('stageHint').style.display = layers.length ? 'none' : 'grid';
  layers.forEach((l) => {
    const el = document.createElement('div');
    el.className = 'layer' + (l.uid === state.selected ? ' selected' : '');
    el.dataset.uid = l.uid;
    el.innerHTML = '<img alt=""><span class="handle"></span><span class="rot" title="Drehen"></span>';
    el.firstChild.src = urlFor(itemById(l.itemId));
    placeLayer(el, l);
    attachDrag(el, l);
    stage.appendChild(el); // DOM-Reihenfolge = Ebenen-Reihenfolge
  });
  updatePanel();
  markPicks();
}
function placeLayer(el, l) {
  el.style.transform = l.rot ? `rotate(${l.rot}deg)` : '';
  el.style.left = l.x * 100 + '%';
  el.style.top = l.y * 100 + '%';
  el.style.width = l.w * 100 + '%';
}

function attachDrag(el, l) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const resizing = e.target.classList.contains('handle');
    const rotating = e.target.classList.contains('rot');
    if (state.selected !== l.uid) {
      state.selected = l.uid;
      document.querySelectorAll('.layer').forEach((n) => n.classList.toggle('selected', n === el));
      updatePanel();
    }
    const rect = $('stage').getBoundingClientRect();
    const start = { cx: e.clientX, cy: e.clientY, x: l.x, y: l.y, w: l.w };
    const box = el.getBoundingClientRect(); // Mittelpunkt bleibt beim Drehen gleich
    const center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    const rr = (l.rot || 0) * Math.PI / 180;
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* Zeiger nicht mehr aktiv: dann bricht das Ziehen einfach ab */ }
    el.style.cursor = resizing ? 'nwse-resize' : 'grabbing';
    const move = (ev) => {
      const dx = (ev.clientX - start.cx) / rect.width;
      const dy = (ev.clientY - start.cy) / rect.height;
      l.manual = true; // ab jetzt ordnet die automatische Anordnung dieses Teil nicht mehr um
      if (rotating) {
        let deg = Math.atan2(ev.clientX - center.x, center.y - ev.clientY) * 180 / Math.PI;
        for (const snap of [0, 90, -90, 180, -180]) if (Math.abs(deg - snap) < 4) deg = snap; // rastet an geraden Winkeln ein
        l.rot = Math.round(deg);
      } else if (resizing) {
        // Ziehrichtung an die Drehung des Teils anpassen
        const along = ((ev.clientX - start.cx) * Math.cos(rr) + (ev.clientY - start.cy) * Math.sin(rr)) / rect.width;
        l.w = Math.min(1.2, Math.max(0.08, start.w + along));
      } else { l.x = start.x + dx; l.y = start.y + dy; }
      placeLayer(el, l);
    };
    const up = () => {
      el.style.cursor = '';
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
}

function updatePanel() {
  const l = state.outfit.layers.find((x) => x.uid === state.selected);
  const it = l && itemById(l.itemId);
  $('layerTools').hidden = !it;
  const bg = state.outfit.bg || '#ffffff';
  $('stage').style.background = bg;
  document.querySelectorAll('.swatch[data-color]').forEach((s) => s.classList.toggle('active', s.dataset.color === bg.toLowerCase()));
  $('bgCustom').value = bg;
  $('bgCustom').parentElement.classList.toggle('active', !BG_COLORS.includes(bg.toLowerCase()));
  $('outfitName').value = state.outfit.name;
}
// Hintergrundfarbe des Outfits: feste Farben plus freie Farbwahl
const BG_COLORS = ['#ffffff', '#f1efe9', '#e9e9e9', '#f6d5d9', '#d6e4f0', '#d9e8d4', '#111111'];
function setupSwatches() {
  const box = $('swatches');
  BG_COLORS.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.dataset.color = c;
    b.style.background = c;
    b.title = c;
    b.onclick = () => { state.outfit.bg = c; updatePanel(); };
    box.appendChild(b);
  });
  const custom = document.createElement('label');
  custom.className = 'swatch custom';
  custom.title = 'Eigene Farbe';
  custom.innerHTML = '<input type="color" id="bgCustom" value="#ffffff">';
  custom.firstChild.addEventListener('input', (e) => { state.outfit.bg = e.target.value; updatePanel(); });
  box.appendChild(custom);
}
setupSwatches();
$('outfitName').addEventListener('input', (e) => { state.outfit.name = e.target.value; });

// Aktuelle Größe des ausgewählten Teils als Standard für dieses Teil merken (für anders geschnittene Stücke)
$('rememberSize').onclick = async () => {
  const l = state.outfit.layers.find((x) => x.uid === state.selected);
  const it = l && itemById(l.itemId);
  if (!it) return;
  const scale = Math.round(l.w / fitWidth(it, await aspectOf(it)) * 100) / 100;
  if (scale === 1) delete it.scale; else it.scale = scale;
  await dbPut('items', it);
  toast(`Größe gemerkt: „${it.name}“ wird künftig mit ${Math.round(scale * 100)} % eingefügt`);
};
$('bringFront').onclick = () => moveLayer(1);
$('sendBack').onclick = () => moveLayer(-1);
function moveLayer(dir) {
  const ls = state.outfit.layers;
  const i = ls.findIndex((l) => l.uid === state.selected);
  const j = dir > 0 ? ls.length - 1 : 0;
  if (i < 0) return;
  const [l] = ls.splice(i, 1);
  ls.splice(j, 0, l);
  renderStage();
}
$('removeLayer').onclick = removeSelected;
function removeSelected() {
  state.outfit.layers = state.outfit.layers.filter((l) => l.uid !== state.selected);
  state.selected = null;
  relayout().then(renderStage);
}
document.addEventListener('keydown', (e) => {
  const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if (!typing && (e.key === 'Delete' || e.key === 'Backspace') && state.selected
      && $('view-builder').classList.contains('active')) {
    e.preventDefault();
    removeSelected();
  }
});
$('stage').addEventListener('pointerdown', (e) => {
  if (e.target === $('stage') || e.target.id === 'stageHint') { state.selected = null; renderStage(); }
});

$('newOutfit').onclick = async () => {
  if (state.outfit.layers.length && !(await askConfirm('Aktuelles Outfit verwerfen und neu beginnen?', 'Verwerfen'))) return;
  state.outfit = { id: null, name: '', bg: '#ffffff', layers: [] };
  state.selected = null;
  renderStage();
};

/* ---------- Export & Speichern ---------- */
async function renderOutfitCanvas(layers, w, h, bg = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  for (const l of layers) {
    const it = itemById(l.itemId);
    if (!it) continue;
    const img = await loadImage(urlFor(it));
    const dw = l.w * w;
    const dh = dw * img.naturalHeight / img.naturalWidth;
    ctx.save();
    ctx.translate(l.x * w + dw / 2, l.y * h + dh / 2);
    ctx.rotate((l.rot || 0) * Math.PI / 180);
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
  return c;
}

$('saveOutfit').onclick = async () => {
  const o = state.outfit;
  const layers = o.layers.filter((l) => itemById(l.itemId));
  if (!layers.length) return toast('Füge zuerst Teile hinzu');
  const thumb = await canvasBlob(await renderOutfitCanvas(layers, 360, 640, o.bg), 'image/jpeg', 0.85);
  const rec = {
    id: o.id || uid(),
    name: o.name.trim() || 'Outfit ' + (outfits.length + 1),
    layers: layers.map(({ itemId, x, y, w, rot }) => ({ itemId, x, y, w, rot: rot || 0 })),
    bg: o.bg || '#ffffff',
    thumb, created: Date.now(),
  };
  await dbPut('outfits', rec);
  const idx = outfits.findIndex((x) => x.id === rec.id);
  if (idx >= 0) outfits[idx] = rec; else outfits.push(rec);
  urls.delete('thumb-' + rec.id);
  o.id = rec.id; o.name = rec.name;
  updatePanel();
  renderOutfits();
  toast('Outfit gespeichert');
};

function renderOutfits() {
  $('outfitCount').textContent = outfits.length;
  const grid = $('outfitGrid');
  grid.innerHTML = '';
  [...outfits].sort((a, b) => b.created - a.created).forEach((o) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<div class="img"><img alt=""></div><div class="meta"><b></b><span></span></div>
      <div class="card-actions"><button class="btn" data-a="edit">Bearbeiten</button>
      <button class="btn" data-a="dl">PNG</button><button class="btn danger" data-a="del">Löschen</button></div>`;
    const key = 'thumb-' + o.id;
    if (!urls.has(key)) urls.set(key, URL.createObjectURL(o.thumb));
    card.querySelector('img').src = urls.get(key);
    card.querySelector('b').textContent = o.name;
    card.querySelector('span').textContent = o.layers.length + ' Teile';
    card.querySelector('[data-a=edit]').onclick = () => editOutfit(o);
    card.querySelector('[data-a=dl]').onclick = () => downloadOutfit(o);
    card.querySelector('[data-a=del]').onclick = async () => {
      if (!(await askConfirm(`„${o.name}" löschen?`))) return;
      await dbDel('outfits', o.id);
      outfits = outfits.filter((x) => x.id !== o.id);
      if (state.outfit.id === o.id) state.outfit.id = null;
      renderOutfits();
    };
    grid.appendChild(card);
  });
  $('outfitsEmpty').classList.toggle('show', outfits.length === 0);
}

function editOutfit(o) {
  state.outfit = {
    id: o.id, name: o.name, bg: o.bg || '#ffffff',
    layers: o.layers.filter((l) => itemById(l.itemId)).map((l) => ({ ...l, uid: uid(), manual: true })),
  };
  state.selected = null;
  showView('builder');
}
async function downloadOutfit(o) {
  const c = await renderOutfitCanvas(o.layers, EXPORT_W, EXPORT_H, o.bg);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = (o.name || 'outfit').replace(/[^\w\-äöüÄÖÜß ]+/g, '') + '.png';
  a.click();
}

/* ---------- Wunschliste ---------- */
// Nur echte Web-Links zulassen (http/https); „zalando.de/…“ wird zu „https://zalando.de/…“ ergänzt
function cleanLink(v) {
  v = (v || '').trim();
  if (!v) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = 'https://' + v;
  try {
    const u = new URL(v);
    return /^https?:$/.test(u.protocol) ? u.href : '';
  } catch (e) {
    return '';
  }
}
const hostOf = (href) => { try { return new URL(href).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };

function renderWishlist() {
  renderChips($('wishFilter'), 'wishFilter', renderWishlist);
  const f = state.wishFilter;
  if (f !== 'Alle' && !(GROUPS[f] && GROUPS[f].includes($('wishUploadCategory').value))) {
    $('wishUploadCategory').value = uploadCategoryFor(f);
  }
  const grid = $('wishGrid');
  grid.innerHTML = '';
  const list = wishlist.filter((w) => matchesFilter(w, f));
  list.forEach((w) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="img" tabindex="0" role="button"><img alt=""></div><div class="meta"><b></b><span></span><i class="note"></i></div>';
    card.querySelector('img').src = urlFor(w);
    card.querySelector('b').textContent = w.name;
    card.querySelector('span').textContent = w.category;
    card.querySelector('.note').textContent = w.note || '';
    if (w.link && cleanLink(w.link)) {
      const a = document.createElement('a');
      a.className = 'shop';
      a.href = w.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'Zum Shop · ' + hostOf(w.link) + ' ↗';
      card.querySelector('.meta').appendChild(a);
    }
    card.onclick = (e) => { if (!e.target.closest('a')) openWishDialog(w); };
    card.querySelector('.img').onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openWishDialog(w); } };
    grid.appendChild(card);
  });
  $('wishEmpty').classList.toggle('show', list.length === 0);
  $('wishEmpty').textContent = wishlist.length === 0
    ? 'Deine Wunschliste ist noch leer. Lade oben ein Teil hoch, das du kaufen willst.'
    : 'Keine Teile in dieser Kategorie.';
}

const wishDlg = $('wishDialog');
let wishEditing = null;
function openWishDialog(w) {
  wishEditing = w;
  $('wishPreview').src = urlFor(w);
  $('wishName').value = w.name;
  $('wishCategory').value = w.category;
  $('wishNote').value = w.note || '';
  $('wishLink').value = w.link || '';
  wishDlg.showModal();
}
$('wishCancel').onclick = () => wishDlg.close();
// Übernimmt die Eingaben aus dem Dialog; false, wenn der Link nicht stimmt
function applyWishFields(w) {
  const raw = $('wishLink').value.trim();
  const link = cleanLink(raw);
  if (raw && !link) { toast('Der Link sieht nicht richtig aus'); return false; }
  w.name = $('wishName').value.trim() || w.name;
  w.category = $('wishCategory').value;
  const note = $('wishNote').value.trim().slice(0, 120);
  if (note) w.note = note; else delete w.note;
  if (link) w.link = link; else delete w.link;
  return true;
}
$('wishSave').onclick = async () => {
  const w = wishEditing;
  if (!applyWishFields(w)) return;
  await dbPut('wishlist', w);
  wishDlg.close();
  renderWishlist();
};
$('wishDelete').onclick = async () => {
  const w = wishEditing;
  if (!(await askConfirm(`„${w.name}“ von der Wunschliste löschen?`))) return;
  await dbDel('wishlist', w.id);
  wishlist = wishlist.filter((x) => x.id !== w.id);
  if (urls.has(w.id)) { URL.revokeObjectURL(urls.get(w.id)); urls.delete(w.id); }
  wishDlg.close();
  renderWishlist();
};
// Gekauft: das Teil wandert von der Wunschliste in den Schrank (Preis-Notiz bleibt, der Link entfällt)
$('wishBought').onclick = async () => {
  const w = wishEditing;
  if (!applyWishFields(w)) return;
  const rec = { id: w.id, name: w.name, category: w.category, blob: w.blob, created: Date.now() };
  if (w.note) rec.note = w.note;
  await dbPut('items', rec);
  await dbDel('wishlist', w.id);
  items.push(rec);
  wishlist = wishlist.filter((x) => x.id !== w.id);
  wishDlg.close();
  renderWishlist(); renderCloset(); renderPicker();
  toast('In den Schrank gelegt');
};

/* ---------- Farblexikon ---------- */
state.colorCount = 2;
function renderColors() {
  const bar = $('colorFilter');
  bar.innerHTML = '';
  [2, 3].forEach((n) => {
    const b = document.createElement('button');
    b.className = 'chip' + (state.colorCount === n ? ' active' : '');
    b.textContent = n + ' Farben';
    b.onclick = () => { state.colorCount = n; renderColors(); };
    bar.appendChild(b);
  });
  const grid = $('colorGrid');
  grid.innerHTML = '';
  COLOR_COMBOS[state.colorCount].forEach((c) => {
    const el = document.createElement('div');
    el.className = 'combo';
    const pal = document.createElement('div');
    pal.className = 'palette';
    c.colors.forEach(([name, hex]) => {
      const s = document.createElement('div');
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      s.style.background = hex;
      s.style.color = (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111' : '#fff'; // lesbare Schriftfarbe
      s.textContent = name;
      s.title = hex;
      pal.appendChild(s);
    });
    el.appendChild(pal);
    el.insertAdjacentHTML('beforeend', '<b></b><p></p>');
    el.querySelector('b').textContent = c.colors.map((x) => x[0]).join(' + ');
    el.querySelector('p').textContent = c.tip;
    grid.appendChild(el);
  });
}
renderColors();
$('colorsBtn').onclick = () => $('colorsDialog').showModal();
$('colorsClose').onclick = () => $('colorsDialog').close();

/* ---------- Sicherung ---------- */
const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});
const dataUrlToBlob = async (url) => (await fetch(url)).blob();

const backupDlg = $('backupDialog');
const settingsDlg = $('settingsDialog');
$('menuBtn').onclick = () => settingsDlg.showModal();
$('settingsClose').onclick = () => settingsDlg.close();
$('backupOpen').onclick = () => {
  settingsDlg.close();
  $('backupInfo').textContent = `Aktuell gespeichert: ${items.length} Teile, ${outfits.length} Outfits, ${wishlist.length} Wünsche.`;
  backupDlg.showModal();
};

/* ---------- Erscheinungsbild ---------- */
function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') root.dataset.theme = mode; else delete root.dataset.theme;
  document.querySelectorAll('#themeChips .chip').forEach((c) => c.classList.toggle('active', c.dataset.theme === (mode === 'light' || mode === 'dark' ? mode : 'system')));
  const dark = mode === 'dark' || (mode !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]').content = dark ? '#121212' : '#333638';
}
let themeMode = 'system';
try { themeMode = localStorage.getItem('drobe-theme') || 'system'; } catch (e) { /* ohne Speicher: automatisch */ }
applyTheme(themeMode);
document.querySelectorAll('#themeChips .chip').forEach((c) => {
  c.onclick = () => {
    themeMode = c.dataset.theme;
    try { localStorage.setItem('drobe-theme', themeMode); } catch (e) { /* gilt dann nur bis zum Neuladen */ }
    applyTheme(themeMode);
  };
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(themeMode));
$('backupClose').onclick = () => backupDlg.close();

$('backupExport').onclick = async () => {
  if (!items.length && !outfits.length && !wishlist.length) return toast('Es gibt noch nichts zu sichern');
  const btn = $('backupExport');
  btn.disabled = true;
  try {
    const data = {
      app: 'kleiderschrank', version: 1, exported: new Date().toISOString(),
      items: await Promise.all(items.map(async (i) => ({
        id: i.id, name: i.name, category: i.category, created: i.created, scale: i.scale, note: i.note, image: await blobToDataUrl(i.blob),
      }))),
      wishlist: await Promise.all(wishlist.map(async (w) => ({
        id: w.id, name: w.name, category: w.category, created: w.created, note: w.note, link: w.link, image: await blobToDataUrl(w.blob),
      }))),
      outfits: await Promise.all(outfits.map(async (o) => ({
        id: o.id, name: o.name, layers: o.layers, bg: o.bg || '#ffffff', created: o.created, thumb: await blobToDataUrl(o.thumb),
      }))),
    };
    const file = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = `kleiderschrank-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Sicherung gespeichert');
  } catch (e) {
    console.error(e);
    toast('Sicherung fehlgeschlagen');
  } finally {
    btn.disabled = false;
  }
};

const num = (v) => typeof v === 'number' && Number.isFinite(v);
async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
    if (data.app !== 'kleiderschrank' || !Array.isArray(data.items) || !Array.isArray(data.outfits)) throw new Error('format');
  } catch (e) {
    return toast('Das ist keine gültige Sicherungsdatei');
  }
  const haveItems = new Set(items.map((i) => i.id));
  const haveOutfits = new Set(outfits.map((o) => o.id));
  const haveWish = new Set(wishlist.map((w) => w.id));
  let addedItems = 0, addedOutfits = 0, addedWish = 0;
  for (const i of data.items) {
    if (typeof i.id !== 'string' || haveItems.has(i.id) || typeof i.image !== 'string' || !i.image.startsWith('data:image/')) continue;
    const category = CATEGORIES.includes(i.category) ? i.category : (LEGACY[i.category] || 'Shirts');
    const rec = {
      id: i.id, name: String(i.name || 'Neues Teil').slice(0, 60), category,
      blob: await dataUrlToBlob(i.image), created: num(i.created) ? i.created : Date.now(),
    };
    if (num(i.scale) && i.scale >= 0.3 && i.scale <= 3 && i.scale !== 1) rec.scale = i.scale;
    if (typeof i.note === 'string' && i.note.trim()) rec.note = i.note.trim().slice(0, 120);
    await dbPut('items', rec);
    items.push(rec);
    addedItems++;
  }
  for (const o of data.outfits) {
    if (typeof o.id !== 'string' || haveOutfits.has(o.id) || typeof o.thumb !== 'string' || !o.thumb.startsWith('data:image/')) continue;
    const layers = (Array.isArray(o.layers) ? o.layers : [])
      .filter((l) => typeof l.itemId === 'string' && num(l.x) && num(l.y) && num(l.w))
      .map(({ itemId, x, y, w, rot }) => ({ itemId, x, y, w, rot: num(rot) ? rot : 0 }));
    const rec = {
      id: o.id, name: String(o.name || 'Outfit').slice(0, 60), layers,
      bg: /^#[0-9a-f]{6}$/i.test(o.bg) ? o.bg : '#ffffff',
      thumb: await dataUrlToBlob(o.thumb), created: num(o.created) ? o.created : Date.now(),
    };
    await dbPut('outfits', rec);
    outfits.push(rec);
    addedOutfits++;
  }
  for (const w of Array.isArray(data.wishlist) ? data.wishlist : []) {
    if (typeof w.id !== 'string' || haveWish.has(w.id) || typeof w.image !== 'string' || !w.image.startsWith('data:image/')) continue;
    const rec = {
      id: w.id, name: String(w.name || 'Neues Teil').slice(0, 60),
      category: CATEGORIES.includes(w.category) ? w.category : (LEGACY[w.category] || 'Shirts'),
      blob: await dataUrlToBlob(w.image), created: num(w.created) ? w.created : Date.now(),
    };
    if (typeof w.note === 'string' && w.note.trim()) rec.note = w.note.trim().slice(0, 120);
    const link = typeof w.link === 'string' ? cleanLink(w.link) : '';
    if (link) rec.link = link;
    await dbPut('wishlist', rec);
    wishlist.push(rec);
    addedWish++;
  }
  items.sort((a, b) => a.created - b.created);
  renderCloset(); renderOutfits(); renderPicker(); renderWishlist();
  $('backupInfo').textContent = `Aktuell gespeichert: ${items.length} Teile, ${outfits.length} Outfits, ${wishlist.length} Wünsche.`;
  toast(addedItems || addedOutfits || addedWish
    ? `${addedItems} Teile, ${addedOutfits} Outfits und ${addedWish} Wünsche hinzugefügt`
    : 'Alles aus der Sicherung war schon vorhanden');
}
$('backupFile').addEventListener('change', (e) => { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; });
const drop = $('backupDrop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) importBackup(e.dataTransfer.files[0]); });

/* ---------- Start ---------- */
fillSelect($('uploadCategory'));
fillSelect($('itemCategory'));
fillSelect($('upCategory'));
fillSelect($('wishCategory'));
fillSelect($('wishUploadCategory'));

// Alles aus dem lokalen Speicher neu einlesen und anzeigen (nach dem Abgleich mit dem Konto)
async function reloadAll() {
  [items, outfits, wishlist] = await Promise.all([dbAll('items'), dbAll('outfits'), dbAll('wishlist')]);
  for (const u of urls.values()) URL.revokeObjectURL(u);
  urls.clear();
  items.sort((a, b) => a.created - b.created);
  wishlist.sort((a, b) => a.created - b.created);
  outfits.sort((a, b) => a.created - b.created);
  renderCloset(); renderWishlist(); renderOutfits(); renderPicker();
}

// Daten aus der Zeit vor dem Login (gleicher Browser, alte Datenbank) lesen
function readLegacyDb() {
  return new Promise(async (resolve) => {
    try {
      if (indexedDB.databases && !(await indexedDB.databases()).some((d) => d.name === 'kleiderschrank')) return resolve(null);
    } catch (e) { /* ältere Browser: einfach versuchen */ }
    const req = indexedDB.open('kleiderschrank');
    req.onerror = () => resolve(null);
    req.onsuccess = async () => {
      const old = req.result;
      const out = {};
      try {
        for (const name of ['items', 'outfits', 'wishlist']) {
          out[name] = old.objectStoreNames.contains(name)
            ? await new Promise((res, rej) => { const r = old.transaction(name, 'readonly').objectStore(name).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })
            : [];
        }
      } catch (e) { old.close(); return resolve(null); }
      old.close();
      resolve(out);
    };
  });
}

async function offerLegacy(userId) {
  const flag = 'drobe-legacy-' + userId;
  try { if (localStorage.getItem(flag)) return; } catch (e) { return; }
  const old = await readLegacyDb();
  if (!old) return;
  const total = old.items.length + old.outfits.length + old.wishlist.length;
  if (!total) return;
  const text = `Auf diesem Gerät liegen noch ${old.items.length} Teile, ${old.outfits.length} Outfits und ${old.wishlist.length} Wünsche von vor dem Login. In dein Konto übernehmen?`;
  if (!(await askConfirm(text, 'Übernehmen'))) return;
  for (const name of ['items', 'outfits', 'wishlist']) {
    const have = new Set((await dbAll(name)).map((r) => r.id));
    for (const rec of old[name]) {
      if (have.has(rec.id)) continue;
      await rawPut(name, rec);
      Cloud.queue(name, rec.id, 'put');
    }
  }
  try { localStorage.setItem(flag, '1'); } catch (e) { /* egal */ }
}

// Wird nach der Anmeldung aufgerufen; jeder Nutzer hat auf dem Gerät seine eigene lokale Datenbank
async function startApp(userId) {
  // Browser bitten, die Daten dauerhaft zu behalten (nicht bei Speicherknappheit aufzuräumen)
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  try {
    db = await openDb('kleiderschrank-u-' + userId);
    await offerLegacy(userId);
    [items, outfits, wishlist] = await Promise.all([dbAll('items'), dbAll('outfits'), dbAll('wishlist')]);
    wishlist.sort((a, b) => a.created - b.created);
  } catch (e) {
    console.error(e);
    toast('Speicher im Browser nicht verfügbar');
  }
  // Alte Kategorien umsortieren (Jacken → Outerwear, Oberteile → Shirts, Accessoires → Taschen)
  for (const it of items) {
    if (!CATEGORIES.includes(it.category)) { it.category = LEGACY[it.category] || 'Shirts'; await dbPut('items', it); }
  }
  for (const w of wishlist) {
    if (!CATEGORIES.includes(w.category)) { w.category = LEGACY[w.category] || 'Shirts'; await dbPut('wishlist', w); }
  }
  items.sort((a, b) => a.created - b.created);
  renderCloset();
  renderWishlist();
  renderOutfits();
}

Cloud.boot();
