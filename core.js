// Grundlagen: Konstanten, lokaler Speicher (IndexedDB), Zustand (Teil der App, Reihenfolge siehe index.html)
const CATEGORIES = ['Jacken', 'Pullover', 'Shirts', 'Hosen', 'Schuhe', 'Taschen', 'Schmuck', 'Caps', 'Gürtel'];
// Hauptkategorien mit Unterkategorien (Teile selbst tragen immer eine Unterkategorie)
const GROUPS = {
  Oberteile: ['Jacken', 'Pullover', 'Shirts'],
  Accessoires: ['Taschen', 'Schmuck', 'Caps', 'Gürtel'],
};
const DEFAULT_SUB = { Oberteile: 'Shirts', Accessoires: 'Taschen' }; // Vorauswahl beim Hochladen
const TOP = ['Oberteile', 'Hosen', 'Schuhe', 'Accessoires'];
// Alte Kategorien aus früheren Versionen (inklusive der früheren englischen Namen)
const LEGACY = {
  Outerwear: 'Jacken', Sweater: 'Pullover', 'Caps/Beanies': 'Caps', Kopfbedeckung: 'Caps', Belts: 'Gürtel',
  Oberteile: 'Shirts', Accessoires: 'Taschen', Kleider: 'Shirts',
};
// Maximalgröße je Kategorie (w: Anteil der Bühnenbreite, h: Anteil der Bühnenhöhe). Ein Teil wird mit seinem
// Seitenverhältnis so eingepasst, dass es hineinpasst: so wirken Hose, Jacke und Schuhe im gleichen Maßstab.
const PLACEMENT = {
  Jacken: { w: 0.55, h: 0.32 },
  Shirts: { w: 0.52, h: 0.30 },
  Pullover: { w: 0.58, h: 0.32 },
  Hosen: { w: 0.50, h: 0.50 },
  Gürtel: { w: 0.24, h: 0.05 },
  Taschen: { w: 0.24, h: 0.17 },
  Schmuck: { w: 0.20, h: 0.07 },
  'Caps': { w: 0.22, h: 0.10 },
  Schuhe: { w: 0.44, h: 0.15 },
};
const STAGE_RATIO = 16 / 9; // Höhe : Breite der Bühne
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
  closetFilter: 'Alle',
  pickerFilter: 'Alle',
  outfit: { id: null, name: '', layers: [] }, // layers: {uid,itemId,x,y,w}
  selected: null,
  editingItem: null,
};
const itemById = (id) => items.find((i) => i.id === id);

/* ---------- Bilder aus dem Netz: schlägt ein Abruf kurz fehl (Funkloch, Server ausgelastet), wird er bis zu 3-mal wiederholt ---------- */
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  const src = img.currentSrc || img.src;
  if (!/^https?:/.test(src)) return; // Bilder vom Gerät (blob:) sind nicht betroffen
  const n = Number(img.dataset.retry || 0);
  if (n >= 3) return;
  img.dataset.retry = String(n + 1);
  setTimeout(() => {
    if (!img.isConnected) return;
    try { const u = new URL(src); u.searchParams.set('r', String(n + 1)); img.src = u.toString(); } catch (err) { img.src = src; }
  }, [800, 2000, 4000][n]);
}, true);
// Kommt die Verbindung zurück, werden kaputte Bilder sofort neu geladen
window.addEventListener('online', () => {
  document.querySelectorAll('img').forEach((img) => {
    if (img.complete && img.naturalWidth === 0 && /^https?:/.test(img.src)) { img.dataset.retry = '0'; const u = new URL(img.src); u.searchParams.set('r', String(Date.now())); img.src = u.toString(); }
  });
});
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
