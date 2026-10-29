// Service Worker: legt die App-Dateien im Cache ab, damit Drobe auch offline startet.
// Bei jeder Änderung an den App-Dateien die Versionsnummer erhöhen.
const CACHE = 'drobe-v21';
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'colors.js', 'cloud.js', 'vendor/supabase.js', 'manifest.webmanifest',
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

// Eigene Dateien: zuerst Netzwerk (immer die neueste Version), bei Offline aus dem Cache.
// Alles von fremden Servern (z. B. Hintergrund-Entfernung) läuft unverändert am Cache vorbei.
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
