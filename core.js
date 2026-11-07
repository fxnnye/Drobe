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
  Gürtel: { w: 0.28, h: 0.05 },
  Taschen: { w: 0.40, h: 0.22 },
  Schmuck: { w: 0.22, h: 0.07 },
  'Caps': { w: 0.30, h: 0.12 },
  Schuhe: { w: 0.44, h: 0.15 },
};
const STAGE_RATIO = 16 / 9; // Höhe : Breite der Bühne
const MULTI = ['Schmuck']; // Kategorien, von denen mehrere Teile gleichzeitig im Outfit sein dürfen
const EXCLUSIVE = { Shirts: ['Shirts', 'Pullover'], Pullover: ['Shirts', 'Pullover'] }; // ersetzen sich gegenseitig
// Standard-Stapelreihenfolge (hinten → vorne)
const STACK = ['Jacken', 'Shirts', 'Pullover', 'Hosen', 'Gürtel', 'Taschen', 'Schmuck', 'Caps', 'Schuhe'];
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
  view: 'feed',
  search: '',
  searchMode: 'items',
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
