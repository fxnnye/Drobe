// Grundlagen: Konstanten, lokaler Speicher (IndexedDB), Zustand (Teil der App, Reihenfolge siehe index.html)
const CATEGORIES = ['Jacken', 'Pullover', 'Shirts', 'Hosen', 'Schuhe', 'Taschen', 'Schmuck', 'Caps', 'Gürtel'];
// Hauptkategorien mit Unterkategorien (Teile selbst tragen immer eine Unterkategorie)
const GROUPS = {
  Oberteile: ['Jacken', 'Pullover', 'Shirts'],
  Accessoires: ['Taschen', 'Schmuck', 'Caps', 'Gürtel'],
};
const DEFAULT_SUB = { Oberteile: 'Shirts', Accessoires: 'Taschen' }; // Vorauswahl beim Hochladen
// Reihenfolge wie in den Filtern (CATEGORIES); innerhalb einer Kategorie bleibt die bisherige Reihenfolge
const byCategory = (list) => {
  const at = (i) => { const n = CATEGORIES.indexOf(i.category); return n < 0 ? CATEGORIES.length : n; };
  return [...list].sort((a, b) => at(a) - at(b));
};
const TOP = ['Oberteile', 'Hosen', 'Schuhe', 'Accessoires'];
// Alte Kategorien aus früheren Versionen (inklusive der früheren englischen Namen)
const LEGACY = {
  Outerwear: 'Jacken', Sweater: 'Pullover', 'Caps/Beanies': 'Caps', Kopfbedeckung: 'Caps', Belts: 'Gürtel',
  Oberteile: 'Shirts', Accessoires: 'Taschen', Kleider: 'Shirts',
};
// Maximalgröße je Kategorie (w: Anteil der Bühnenbreite, h: Anteil der Bühnenhöhe). Ein Teil wird mit seinem
// Seitenverhältnis so eingepasst, dass es hineinpasst: so wirken Hose, Jacke und Schuhe im gleichen Maßstab.
// Bei Oberteilen und Hosen bestimmt die Länge (h) die Größe, damit alle gleich lang sind; w fängt nur sehr breite Fotos ab.
const PLACEMENT = {
  Jacken: { w: 0.70, h: 0.31 },
  Shirts: { w: 0.66, h: 0.29 },
  Pullover: { w: 0.70, h: 0.30 },
  Hosen: { w: 0.48, h: 0.41 },
  Gürtel: { w: 0.30, h: 0.07 },
  Taschen: { w: 0.24, h: 0.17 },
  Schmuck: { w: 0.20, h: 0.07 },
  'Caps': { w: 0.22, h: 0.10 },
  Schuhe: { w: 0.44, h: 0.15 },
};
const STAGE_RATIO = 16 / 9; // Höhe : Breite der Bühne
// Ausnahmen von der einheitlichen Länge: Mäntel und Kleider sind länger, kurze Hosen kürzer
const LONG_BOX = { w: 0.70, h: 0.42 };
const SHORTS_BOX = { w: 0.48, h: 0.22 };
// aspect: Höhe geteilt durch Breite des freigestellten Fotos
function placementFor(it, aspect) {
  const name = String(it.name || '').toLowerCase();
  if (it.category === 'Hosen' && (/short|jorts|bermuda|kurze/.test(name) || aspect < 1.25)) return SHORTS_BOX;
  if (it.category === 'Jacken' && (/mantel|coat|trench|parka/.test(name) || aspect > 1.6)) return LONG_BOX;
  if (it.category === 'Shirts' && /kleid\b/.test(name)) return LONG_BOX;
  return PLACEMENT[it.category];
}
// Am Handy hat jede Kategorie eine Einheitsgröße. Oberteile: der Rumpf ist gleich groß (body), egal wie weit die Ärmel
// liegen oder ob eine Kapuze dran ist (torsoOf misst das am Foto). Hosen: gleich lang. Schuhe: längste Seite gleich lang.
// Mäntel und Shorts bleiben Ausnahmen.
const PHONE_BOX = {
  Jacken: { body: 0.46, w: 0.82, h: 0.36 },
  Shirts: { body: 0.44, w: 0.82, h: 0.36 },
  Pullover: { body: 0.44, w: 0.82, h: 0.36 },
  Hosen: { w: 0.55, h: 0.45 },
  Schuhe: { w: 0.30, h: 0.30 / STAGE_RATIO },
};
// torso: Größe des Rumpfs im Verhältnis zur Fotobreite (lange, abstehende Ärmel: klein; T-Shirt: groß)
function phoneWidth(it, aspect, torso) {
  let box = placementFor(it, aspect);
  if (box === SHORTS_BOX) box = { w: 0.52, h: 0.26 };
  else if (box === LONG_BOX) box = { w: 0.56, h: 0.42 };
  else box = PHONE_BOX[it.category] || box;
  const measured = torso && torso < 0.95 ? torso : 0.72; // 0 oder fast 1: nicht messbar (z. B. Foto mit Hintergrund)
  const byBody = box.body ? box.body / Math.max(0.45, Math.min(0.8, measured)) : box.w;
  return Math.min(box.w, box.h * STAGE_RATIO / aspect, byBody);
}
const MULTI = ['Schmuck']; // Kategorien, von denen mehrere Teile gleichzeitig im Outfit sein dürfen
const MAX_OBERTEILE = 2; // Jacke, Pullover und Shirt lassen sich mischen, zusammen aber höchstens zwei
// Standard-Stapelreihenfolge (hinten → vorne)
const STACK = ['Jacken', 'Shirts', 'Pullover', 'Hosen', 'Gürtel', 'Taschen', 'Schmuck', 'Caps', 'Schuhe'];
const EXPORT_W = 1080, EXPORT_H = 1920;

const $ = (id) => document.getElementById(id);
// Neue IDs sind echte UUIDs (v4) und damit über alle Konten hinweg eindeutig; ältere Kurz-IDs bleiben gültig
const uid = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

/* ---------- Speicher (IndexedDB) ---------- */
let db;
function openDb(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 2);
    req.onupgradeneeded = () => {
      for (const name of ['items', 'outfits']) {
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
const urls = new Map(); // id -> Object-URL
const state = {
  view: 'feed',
  search: '',
  searchMode: 'items',
  soStage: 'home', // Suche am Handy: 'home', 'open' (Suchfenster) oder 'results'
  closetFilter: 'Alle',
  profileFilter: 'Alle', // Kategorie im geöffneten fremden Profil
  pickerFilter: 'Alle',
  outfit: { id: null, name: '', layers: [] }, // layers: {uid,itemId,x,y,w}
  selected: null,
  editingItem: null,
};
const itemById = (id) => items.find((i) => i.id === id);
// Notizen als eigener Abschnitt: Überschrift, darunter der Text linksbündig mit seinen Zeilenumbrüchen
function noteBlock(text) {
  const box = document.createElement('div'); box.className = 'item-note';
  const h = document.createElement('h3'); h.textContent = 'Notizen';
  const p = document.createElement('p'); p.textContent = String(text).trim().replace(/\n{3,}/g, '\n\n'); p.setAttribute('data-no-i18n', '');
  box.append(h, p);
  return box;
}

/* ---------- Bild-Absicherung für die ganze App ----------
   Jedes <img> läuft hier durch: Ein Bild, das nicht lädt, wird nie als kaputt angezeigt (Klasse "img-wait" zeigt eine Fläche)
   und so lange erneut geholt, bis es da ist. Aus dem Netz: neu anfragen, Link neu holen, ersatzweise das große statt des kleinen Bildes.
   Vom Gerät: neu aus dem Speicher lesen, notfalls aus dem Konto wiederherstellen. */
const IMG_RETRY_MS = [800, 2000, 4000, 10000, 30000]; // danach jede Minute
const imgTimers = new WeakMap();
// Zeitlich begrenzter Speicher-Link: Ablage, Pfad und ob er abgelaufen oder nur ein Platzhalter ist
function signedLink(src, now = Date.now()) {
  const m = /\/storage\/v1\/object\/sign\/([^/]+)\/([^?]+)\?(?:[^#]*&)?token=([^&#]+)/.exec(src);
  if (!m) return null;
  let stale = true;
  try { stale = !(JSON.parse(atob(m[3].split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000 > now + 5000); } catch (e) { /* Platzhalter */ }
  return { bucket: m[1], path: decodeURIComponent(m[2]), stale };
}
// Konnte für ein Bild kein Link geholt werden, steht dieser Platzhalter da; die Absicherung holt den Link später nach
const emptyLink = (bucket, path) => `${Cloud.url}/storage/v1/object/sign/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}?token=neu`;
async function reloadImg(img, src, n) {
  const link = signedLink(src);
  const sb = link && Cloud.client();
  if (sb) {
    // ab dem dritten Versuch ersetzt das große Bild eine Vorschau (…-t), die sich nicht laden lässt
    const path = n >= 3 && link.path.endsWith('-t') ? link.path.slice(0, -2) : link.path;
    if (link.stale || n >= 2 || path !== link.path) {
      try {
        const { data } = await sb.storage.from(link.bucket).createSignedUrl(path, 3600);
        if (data && data.signedUrl) { img.src = data.signedUrl; return; }
      } catch (e) { /* dann wie ein normaler neuer Versuch */ }
    }
  }
  try { const u = new URL(src); u.searchParams.set('r', `${n}-${Date.now()}`); img.src = u.toString(); } catch (e) { img.src = src; }
}
const imgDecodes = (blob) => new Promise((resolve) => {
  if (!blob || !blob.size) return resolve(false);
  const url = URL.createObjectURL(blob), probe = new Image();
  const done = (ok) => { URL.revokeObjectURL(url); resolve(ok); };
  probe.onload = () => done(true); probe.onerror = () => done(false); probe.src = url;
});
// Ein gespeichertes Bild lässt sich nicht anzeigen: frisch lesen, sonst die Kopie aus dem Konto holen
async function repairLocalImg(img, src) {
  const small = [...tbUrls].find(([, c]) => c.url === src);
  if (small) { // nur die kleine Vorschau ist kaputt: weg damit, sie wird neu erzeugt
    const it = itemById(small[0]);
    tbUrls.delete(small[0]); URL.revokeObjectURL(src);
    if (it) { delete it.tb; delete it._tbfp; img.src = gridUrl(it); }
    return;
  }
  const hit = [...urls].find(([, u]) => u === src);
  if (!hit) { // veraltete Adresse: das Bild bekommt die aktuelle seines Teils
    const el = img.closest('[data-id], [data-uid]');
    const layer = el && state.outfit.layers.find((l) => l.uid === el.dataset.uid);
    const it = el && itemById(el.dataset.id || (layer && layer.itemId));
    if (it && it.blob) { const now = urlFor(it); if (now !== src) img.src = now; }
    return;
  }
  const key = hit[0], thumb = key.startsWith('thumb-');
  const store = thumb ? 'outfits' : 'items', field = thumb ? 'thumb' : 'blob', id = thumb ? key.slice(6) : key;
  const rec = thumb ? outfits.find((o) => o.id === id) : itemById(id);
  if (!rec) return;
  const cur = await tx(store, 'readonly', (o) => o.get(id));
  let blob = cur && cur[field];
  if (!(await imgDecodes(blob))) {
    blob = await Cloud.fetchImage(store, id);
    if (!(await imgDecodes(blob))) { // z. B. offline: der nächste Versuch probiert es wieder
      if (navigator.onLine) Errors.report(`Bild auf dem Gerät nicht reparierbar (${store}/${id})`);
      return;
    }
    if (cur) { cur[field] = blob; cur._fp = String(blob.size); await rawPut(store, cur); }
  }
  rec[field] = blob;
  renewUrl(key);
}
function retryImg(img) {
  clearTimeout(imgTimers.get(img));
  const src = img.getAttribute('src') ? img.src : '';
  if (!/^(https?|blob):/.test(src)) return;
  const n = Number(img.dataset.retry || 0);
  img.dataset.retry = String(n + 1);
  const wait = n === 0 && signedLink(src)?.stale ? 0 : IMG_RETRY_MS[n] ?? 60000;
  imgTimers.set(img, setTimeout(() => {
    // unsichtbar, weg oder offline: beim Zurückkommen geht es weiter (siehe retryBrokenImages)
    if (!img.isConnected || img.src !== src || document.visibilityState === 'hidden') return;
    if (src.startsWith('blob:')) repairLocalImg(img, src).catch((e) => console.error(e));
    else if (navigator.onLine) reloadImg(img, src, n + 1);
  }, wait));
}
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  img.classList.add('img-wait');
  retryImg(img);
}, true);
document.addEventListener('load', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  clearTimeout(imgTimers.get(img));
  img.classList.remove('img-wait');
  delete img.dataset.retry;
  const a = img.closest('a.bubble-img');
  if (a) a.href = img.src; // Foto im Chat: Antippen öffnet den Link, der gerade funktioniert
  markOwnBg(img);
}, true);
// Fotos mit eigenem Hintergrund (nicht freigestellt): am Computer füllen sie die ganze Kachel (style.css, img.own-bg).
// Gelingt die Prüfung nicht, bleibt das Foto, wie es ist.
const ownBg = new Map(); // Bildadresse → Antwort
function isOpaque(source) { // das Foto ist nirgends durchsichtig
  const c = document.createElement('canvas'); c.width = c.height = 48;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(source, 0, 0, 48, 48);
  const d = x.getImageData(0, 0, 48, 48).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return false;
  return true;
}
async function markOwnBg(img) {
  if (!matchMedia('(min-width: 701px)').matches || !img.closest('.card .img, .item-photo, .pick, .msg-thumb') || img.closest('.outfits, .feed-outfit, .add-card')) return;
  const src = img.src;
  if (!ownBg.has(src)) ownBg.set(src, (async () => {
    if (!/^https?:/.test(src)) return isOpaque(img);
    const res = await fetch(src, { cache: 'force-cache' });
    if (!res.ok) throw new Error(res.status);
    const bitmap = await createImageBitmap(await res.blob()), own = isOpaque(bitmap);
    bitmap.close();
    return own;
  })().catch(() => { ownBg.delete(src); return false; }));
  const own = await ownBg.get(src);
  if (img.src === src) img.classList.toggle('own-bg', own);
}
// Kommt die Verbindung oder die App zurück, werden alle wartenden Bilder sofort neu geladen
function retryBrokenImages() {
  document.querySelectorAll('img.img-wait').forEach((img) => { img.dataset.retry = '0'; retryImg(img); });
}
window.addEventListener('online', retryBrokenImages);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') retryBrokenImages(); });
// Neue Adresse für ein gespeichertes Bild: überall, wo die alte noch steht, wird sie ersetzt, erst dann freigegeben
function renewUrl(key) {
  const old = urls.get(key);
  if (!old) return;
  urls.delete(key);
  const rec = key.startsWith('thumb-') ? outfits.find((o) => o.id === key.slice(6)) : itemById(key);
  const blob = rec && (key.startsWith('thumb-') ? rec.thumb : rec.blob);
  if (blob) urls.set(key, URL.createObjectURL(blob));
  document.querySelectorAll('img').forEach((img) => {
    if (img.getAttribute('src') !== old) return;
    if (blob) img.src = urls.get(key); else img.removeAttribute('src');
  });
  URL.revokeObjectURL(old);
}
function urlFor(rec) {
  if (!urls.has(rec.id)) urls.set(rec.id, URL.createObjectURL(rec.blob));
  return urls.get(rec.id);
}

/* ---------- Leere Ansichten: Symbol, Titel, Satz und nächster Schritt ---------- */
const EMPTY_ICONS = {
  closet: '<path d="M12 4a2 2 0 1 1 2 2c-1 0-2 .6-2 1.6V9"/><path d="M12 9L3.5 15.2A1.3 1.3 0 0 0 4.3 17.5h15.4a1.3 1.3 0 0 0 .8-2.3z"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.600-7 10-7 10z"/>',
  outfit: '<path d="M8 4l-5 3 2 4 3-1v10h8V10l3 1 2-4-5-3a4 4 0 0 1-8 0z"/>',
  chat: '<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.500a10.500 10.500 0 0 1 14 0M8.500 16a5.500 5.500 0 0 1 7 0"/><path d="M12 19.500h.01"/><path d="M3 3l18 18"/>',
};
// node leeren und mit Symbol, Titel, Text und (optional) Knopf füllen
function setEmpty(node, o) {
  node.replaceChildren();
  const ic = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ic.setAttribute('viewBox', '0 0 24 24'); ic.setAttribute('width', '40'); ic.setAttribute('height', '40');
  ic.setAttribute('fill', 'none'); ic.setAttribute('stroke', 'currentColor'); ic.setAttribute('stroke-width', '1.6');
  ic.setAttribute('stroke-linecap', 'round'); ic.setAttribute('stroke-linejoin', 'round'); ic.setAttribute('aria-hidden', 'true');
  ic.setAttribute('class', 'empty-ic');
  ic.innerHTML = EMPTY_ICONS[o.ic || 'closet'];
  const t = document.createElement('b'); t.className = 'empty-title'; t.textContent = o.title;
  node.append(ic, t);
  if (o.text) { const p = document.createElement('span'); p.className = 'empty-text'; p.textContent = o.text; node.append(p); }
  if (o.cta) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn primary'; b.textContent = o.cta; b.onclick = o.fn; node.append(b); }
}
