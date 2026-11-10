// Offline-Cache. Bei Änderung die Version anheben (Datei bleibt 1500 Byte).
const CACHE = 'drobe-v153';
const JS = ['colors', 'begriffe', 'profile', 'cloud', 'core', 'details', 'imaging', 'feed', 'closet', 'search', 'upload', 'item', 'outfits', 'wishlist', 'settings', 'start', 'errors'].map((n) => n + '.js');
const FILES = [
  './', 'index.html', 'style.css', ...JS, 'vendor/supabase.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Eigene Dateien: erst Netz, offline Cache. Fremde Server bleiben draußen.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
  );
});
//-----------------------