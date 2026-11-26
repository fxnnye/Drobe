// Offline-Cache. Datei bleibt 1500 Byte.
const CACHE = 'drobe-v347', KI = 'jawnz-ki';
const JS = ['colors','begriffe','profile','cloud','core','details','imaging','feed','closet','search','upload','item','outfits','saved','settings','start','errors','i18n'].map((n) => n + '.js');
const FILES = ['./', 'index.html', 'style.css', ...JS, 'vendor/supabase.js', 'manifest.webmanifest',
  ...['icon-192','icon-512','icon-maskable-512','apple-touch-icon','favicon-32'].map((n) => `icons/${n}.png`)];
const on = (t, f) => self.addEventListener(t, f);
on('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
on('activate', (e) => e.waitUntil(caches.keys()
  .then((l) => Promise.all(l.map((k) => k === CACHE || k === KI || caches.delete(k))))
  .then(() => self.clients.claim())));
on('fetch', (e) => {
  const req = e.request, url = new URL(req.url), hit = () => caches.match(req);
  if (req.method !== 'GET') return;
  const keep = (name) => (res) => {
    const copy = res.clone();
    if (res.ok) caches.open(name).then((c) => c.put(req, copy)).catch(() => {});
    return res;
  };
  // KI-Dateien: einmal laden
  if (/staticimgly\.com$|cdn\.jsdelivr\.net$/.test(url.host))
    e.respondWith(hit().then((h) => h || fetch(req).then(keep(KI))));
  else if (url.origin === location.origin)
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(keep(CACHE))
      .catch(() => hit().then((h) => h || caches.match('index.html'))));
});
//------
