// Start der App (Teil der App, Reihenfolge siehe index.html)
/* ---------- Start ---------- */
fillSelect($('uploadCategory'));
fillSelect($('itemCategory'));
buildDetails($('itemMore'), 'itd', 'items');
['upBrand', 'itdbrand'].forEach((id) => brandSuggest($(id)));
[['upSize', 'uploadCategory'], ['itdsize', 'itemCategory']].forEach(([id, cat]) => sizeSuggest($(id), cat));

// Alte Kategorien umsortieren (z. B. Outerwear → Jacken, Oberteile → Shirts, Accessoires → Taschen)
async function migrateCategories() {
  for (const it of items) {
    if (!CATEGORIES.includes(it.category)) { it.category = LEGACY[it.category] || 'Shirts'; await dbPut('items', it); }
  }
}

// Teile ohne Farbe nachträglich auswerten (nur freigestellte; die anderen werden als geprüft markiert).
// Läuft bei jedem Start und nach jedem Abgleich; `colorV` hebt frühere „geprüft“-Markierungen auf, wenn sich die Erkennung ändert.
const COLOR_V = 3;
let colorBusy = false;
async function backfillColors() {
  if (colorBusy) return;
  colorBusy = true;
  try {
    for (const it of items.filter((i) => i.blob && i.colorV !== COLOR_V && (!i.color || i.hex))) { // von Hand gewählte Farben (ohne hex) bleiben
      const c = await detectColor(it.blob);
      if (c) applyColor(it, c);
      it.colorV = COLOR_V;
      await dbPut('items', it);
    }
  } finally { colorBusy = false; }
}

// Gespeicherte Freisteller einmalig neu zuschneiden: verirrte Pünktchen am Rand machten manche Teile (z. B. Caps) winzig.
// `trimV` merkt sich, dass ein Teil geprüft ist; ändert sich der Zuschnitt, hebt eine neue Nummer die Markierung auf.
const TRIM_V = 1;
let trimBusy = false;
async function backfillTrim() {
  if (trimBusy) return;
  trimBusy = true;
  let changed = false;
  try {
    for (const [kind, list] of [['items', items]]) {
      for (const it of list.filter((i) => i.blob && i.trimV !== TRIM_V)) {
        try {
          const t = await retrimBlob(it.blob);
          if (t) {
            it.blob = t.blob;
            if (it.srcBox) it.srcBox = { x: it.srcBox.x + t.x, y: it.srcBox.y + t.y };
            delete it.emb; // Bild geändert: Vektor neu berechnen
            renewUrl(it.id);
            aspects.delete(it.id);
            changed = true;
          }
          it.trimV = TRIM_V;
          if (t) await dbPut(kind, it); else await rawPut(kind, it); // ohne Änderung kein Abgleich nötig
        } catch (e) { console.error(e); }
      }
    }
  } finally { trimBusy = false; }
  if (changed) { renderCloset(); renderOutfits(); renderPicker(); }
}

// Alles aus dem lokalen Speicher neu einlesen und anzeigen (nach dem Abgleich mit dem Konto)
async function reloadAll() {
  [items, outfits] = await Promise.all([dbAll('items'), dbAll('outfits')]);
  await migrateCategories();
  for (const key of [...urls.keys()]) renewUrl(key);
  items.sort((a, b) => a.created - b.created);
  outfits.sort((a, b) => a.created - b.created);
  renderCloset(); renderOutfits(); renderPicker();
  upgradeOutfitThumbs().catch((e) => console.error(e));
  backfillColors();
  backfillTrim();
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
        for (const name of ['items', 'outfits']) {
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
  const flag = 'jawnz-legacy-' + userId;
  try { if (localStorage.getItem(flag)) return; } catch (e) { return; }
  const old = await readLegacyDb();
  if (!old) return;
  const total = old.items.length + old.outfits.length;
  if (!total) return;
  const text = `Auf diesem Gerät liegen noch ${old.items.length} Teile und ${old.outfits.length} Outfits von vor dem Login. In dein Konto übernehmen?`;
  const yes = await askConfirm(text, 'Übernehmen');
  try { localStorage.setItem(flag, '1'); } catch (e) { /* egal */ } // die Frage kommt nur einmal, egal wie die Antwort ausfällt
  if (!yes) return;
  for (const name of ['items', 'outfits']) {
    const have = new Set((await dbAll(name)).map((r) => r.id));
    for (const rec of old[name]) {
      if (have.has(rec.id)) continue;
      await rawPut(name, rec);
      Cloud.queue(name, rec.id, 'put');
    }
  }
}

// Wird nach der Anmeldung aufgerufen; jeder Nutzer hat auf dem Gerät seine eigene lokale Datenbank
async function startApp(userId) {
  // Browser bitten, die Daten dauerhaft zu behalten (nicht bei Speicherknappheit aufzuräumen)
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  try {
    db = await openDb('kleiderschrank-u-' + userId);
    await offerLegacy(userId);
    [items, outfits] = await Promise.all([dbAll('items'), dbAll('outfits')]);
  } catch (e) {
    console.error(e);
    toast('Speicher im Browser nicht verfügbar');
  }
  await migrateCategories();
  items.sort((a, b) => a.created - b.created);
  renderCloset();
  renderOutfits();
  showView('feed');
  maybeWelcome();
  backfillColors();
  backfillTrim();
}

// Startbildschirm ausblenden: erst wenn die App bereit ist, mindestens 2,5 Sekunden nach dem Start. Danach wartet er noch, bis der Feed geladen ist
// und die ersten 6 Fotos im Feed da sind (höchstens bis 3 Sekunden), spätestens dann geht er auf jeden Fall weg. Der Rest lädt in der App.
const SPLASH_MIN_MS = 2500, SPLASH_PRELOAD_MAX_MS = 3000;
let splashHiding = false;
function contentReady() {
  if (!Cloud.user()) return true; // abgemeldet gibt es nichts vorzuladen
  const feedGrid = $('feedGrid');
  if (!feed.stageChecked || feed.loading || feedGrid.querySelector('.skeleton-card')) return false;
  return [...feedGrid.querySelectorAll('img')].slice(0, 6).every((i) => i.complete);
}
function hideSplash(force) {
  if (splashHiding) return;
  const wait = force === true ? 0 : Math.max(0, SPLASH_MIN_MS - performance.now());
  splashHiding = true;
  const preload = async () => {
    if (force === true) return;
    while (performance.now() < SPLASH_PRELOAD_MAX_MS && !contentReady()) await new Promise((r) => setTimeout(r, 150));
  };
  Promise.race([document.fonts ? document.fonts.ready : null, new Promise((r) => setTimeout(r, 1500))]).catch(() => {}).then(() => setTimeout(() => preload().then(() => {
    try { window.Capacitor?.Plugins?.SplashScreen?.hide(); } catch (e) { /* kein iOS-App-Rahmen */ }
    const sp = document.getElementById('splash');
    if (!sp || sp.classList.contains('gone')) return;
    sp.classList.add('gone');
    setTimeout(() => sp.remove(), 400);
  }), wait));
}
setTimeout(() => hideSplash(true), SPLASH_PRELOAD_MAX_MS);
Cloud.boot().then(() => hideSplash(), () => hideSplash());

// Tipp auf den abgedunkelten Bereich neben einem Fenster schließt es (außer beim Hochladen, damit nichts verloren geht)
document.querySelectorAll('dialog').forEach((d) => {
  if (d.id === 'uploadDialog' || d.id === 'confirmDialog') return;
  const outside = (e) => { const r = d.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
  let down = false;
  d.addEventListener('pointerdown', (e) => { down = e.target === d && outside(e); });
  d.addEventListener('click', (e) => { if (down && e.target === d && outside(e)) d.close(); down = false; });
});
// Enter speichert und schließt den Dialog (Teil, Hochladen, Profil). Mehrzeilige Felder (Notizen, Über mich) machen einen Absatz.
[['itemDialog', 'itemSave'], ['uploadDialog', 'upAdd'], ['profileDialog', 'profTextSave']].forEach(([d, btn]) => {
  $(d).addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.key !== 'Enter' || e.isComposing || e.shiftKey || ['TEXTAREA', 'BUTTON', 'A', 'SELECT', 'SUMMARY'].includes(t.tagName) || (t.tagName === 'INPUT' && ['file', 'checkbox', 'radio'].includes(t.type))) return;
    e.preventDefault();
    if (t.blur) t.blur();
    $(btn).click();
  });
});

// Ist ein Fenster offen, scrollt nur das Fenster und nicht die Seite dahinter (Seite wird eingefroren, Position bleibt erhalten)
{
  let lockY = null;
  const sync = () => {
    const open = [...document.querySelectorAll('dialog[open]')].some((d) => !d.classList.contains('up-inline'));
    const b = document.body;
    if (open && lockY === null) {
      lockY = window.scrollY;
      b.style.top = -lockY + 'px';
      b.classList.add('dlg-lock');
    } else if (!open && lockY !== null) {
      b.classList.remove('dlg-lock');
      b.style.top = '';
      window.scrollTo(0, lockY);
      lockY = null;
    }
  };
  document.querySelectorAll('dialog').forEach((d) => new MutationObserver(sync).observe(d, { attributes: true, attributeFilter: ['open'] }));
}

/* ---------- Bild vergrößern: Foto auf der Teil-Seite antippen, dann zoomen (zwei Finger / Mausrad) und schieben ---------- */
(() => {
  let box = null;
  function close() { if (box) { box.remove(); box = null; document.removeEventListener('keydown', onKey); } }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function open(src, alt) {
    close();
    box = document.createElement('div'); box.className = 'zoom-view'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Bild');
    const img = document.createElement('img'); img.src = src; img.alt = alt || ''; img.draggable = false;
    const x = document.createElement('button'); x.type = 'button'; x.className = 'zoom-close'; x.setAttribute('aria-label', 'Schließen'); x.textContent = '×';
    box.append(img, x); document.body.append(box);
    let s = 1, tx = 0, ty = 0;
    const pts = new Map(); let last = null, moved = false;
    const apply = () => { img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`; };
    const clamp = () => { const r = box.getBoundingClientRect(), mx = Math.max(0, (img.offsetWidth * s - r.width) / 2), my = Math.max(0, (img.offsetHeight * s - r.height) / 2); tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty)); };
    const zoomAt = (ns, cx, cy) => {
      ns = Math.max(1, Math.min(6, ns));
      const r = box.getBoundingClientRect(), px = cx - r.left - r.width / 2, py = cy - r.top - r.height / 2;
      tx = px - (px - tx) * ns / s; ty = py - (py - ty) * ns / s; s = ns; if (s === 1) { tx = 0; ty = 0; } clamp(); apply();
    };
    const mid = () => { const p = [...pts.values()]; return { x: p.reduce((t, q) => t + q.x, 0) / p.length, y: p.reduce((t, q) => t + q.y, 0) / p.length, d: p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0 }; };
    box.addEventListener('pointerdown', (e) => { if (e.target === x) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); box.setPointerCapture(e.pointerId); last = mid(); moved = false; });
    box.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const m = mid();
      if (Math.abs(m.x - last.x) + Math.abs(m.y - last.y) > 3 || (last.d && m.d && Math.abs(m.d - last.d) > 3)) moved = true;
      if (pts.size > 1 && last.d && m.d) zoomAt(s * m.d / last.d, m.x, m.y);
      if (s > 1) { tx += m.x - last.x; ty += m.y - last.y; clamp(); apply(); }
      last = m;
    });
    const up = (e) => {
      if (!pts.delete(e.pointerId)) return;
      if (!pts.size && !moved && e.target !== x) { if (s > 1) { s = 1; tx = ty = 0; apply(); } else close(); } // Tippen: heranzoomen zurücksetzen bzw. schließen
      last = pts.size ? mid() : null;
    };
    box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
    box.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(s * Math.exp(-e.deltaY / 300), e.clientX, e.clientY); }, { passive: false });
    box.addEventListener('dblclick', (e) => { if (e.target === x) return; zoomAt(s > 1 ? 1 : 2.5, e.clientX, e.clientY); });
    x.onclick = close;
    document.addEventListener('keydown', onKey);
  }
  document.addEventListener('click', (e) => {
    const img = e.target.closest && e.target.closest('.item-photo img, .outfit-photo img');
    if (img && img.src) open(img.currentSrc || img.src, img.alt);
  });
})();

/* ---------- App-Gefühl: Haptik, Runterziehen zum Aktualisieren, Fenster von unten, Bilder, Tastatur ---------- */
(() => {
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = () => matchMedia('(max-width: 700px)').matches;
  const touch = 'ontouchstart' in window || matchMedia('(pointer: coarse)').matches;

  // 1) Haptik: Reiter, Chips, Herz, Senden
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('.tab, .subtab, .chip, .heart-btn, .picks-btn');
    if (t) haptic(t.classList.contains('heart-btn') || t.classList.contains('picks-btn') ? 'light' : 'select');
  }, true);
  document.addEventListener('submit', (e) => { if (e.target && e.target.id === 'threadForm') haptic('light'); }, true);

  // 2) Runterziehen zum Aktualisieren (Feed, Nachrichten, Schrank, Outfits, Gemerkt)
  if (touch) {
    const ind = document.createElement('div');
    ind.className = 'ptr';
    ind.setAttribute('aria-hidden', 'true');
    ind.innerHTML = '<span class="spinner"></span>';
    document.body.append(ind);
    const actions = {
      feed: () => loadFeed(true),
      messages: () => Profile.loadInbox(true),
      closet: () => $('syncNowBtn').click(),
      outfits: () => $('syncNowBtn').click(),
      saved: () => renderSaved(),
    };
    let p = null, busy = false;
    const can = () => !busy && window.scrollY <= 0 && actions[state.view] && $('publicView').hidden && !document.querySelector('dialog[open]') && !document.body.classList.contains('in-thread');
    let tg = [];
    const paint = (y, armed) => {
      tg.forEach((n) => { n.style.transform = y ? 'translateY(' + y + 'px)' : ''; }); // Beiträge wandern mit nach unten, der Kreis liegt nie darauf
      ind.style.transform = 'translate(-50%, ' + (y - 48) + 'px)';
      ind.style.opacity = Math.min(1, y / 14);
      ind.style.clipPath = ind.dataset.under ? (y >= 48 ? 'none' : 'inset(' + (48 - y) + 'px -24px -24px -24px)') : ''; // unter einer Leiste schiebt sich der Kreis darunter heraus, statt darüber zu gleiten
      ind.classList.toggle('armed', !!armed);
    };
    document.addEventListener('touchstart', (e) => {
      p = null;
      const t = e.touches[0];
      if (e.touches.length === 1 && t.clientX > 28 && t.clientX < window.innerWidth - 28 && can()) p = { y0: t.clientY, x0: t.clientX, dy: 0, on: false, armed: false };
      if (p) { // im Feed erscheint der Kreis unter „Für dich / Outfits“, im Profil unter „Schrank / Outfits / Gemerkt“, sonst ganz oben
        const view = document.querySelector('.view.active');
        const anchor = state.view === 'feed' ? document.querySelector('.feed-top') : ME_VIEWS.includes(state.view) ? $('meBar') : null;
        ind.style.top = anchor ? Math.round(anchor.getBoundingClientRect().bottom) + 'px' : '';
        ind.dataset.under = anchor ? '1' : '';
        tg.forEach((n) => { n.classList.remove('ptr-t', 'ptr-drag'); n.style.transform = ''; });
        // unter einer Leiste wandert alles darunter mit nach unten (die Leiste selbst bleibt stehen)
        tg = !view ? [] : anchor ? [...view.children].filter((n) => n !== anchor && !n.classList.contains('bulk-bar')) : [view];
        tg.forEach((n) => n.classList.add('ptr-t'));
      }
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (!p) return;
      const t = e.touches[0], dy = t.clientY - p.y0, dx = t.clientX - p.x0;
      if (!p.on) {
        if (dy < -4 || Math.abs(dx) > Math.abs(dy)) { p = null; return; }
        if (dy < 10) return;
        p.on = true;
      }
      if (window.scrollY > 0) { p = null; paint(0); return; }
      e.preventDefault();
      p.dy = dy;
      const y = Math.min(96, dy * 0.45);
      const armed = y >= 62;
      if (armed && !p.armed) haptic('select');
      p.armed = armed;
      ind.style.transition = 'none';
      tg.forEach((n) => n.classList.add('ptr-drag'));
      paint(y, armed);
    }, { passive: false });
    const end = async () => {
      if (!p) return;
      const { on, armed } = p; p = null;
      if (!on) return;
      ind.style.transition = '';
      tg.forEach((n) => n.classList.remove('ptr-drag'));
      if (!armed) { paint(0); return; }
      busy = true;
      ind.classList.add('spin');
      paint(62, true);
      const started = Date.now();
      try { await actions[state.view](); } catch (e) { /* die Ansicht zeigt ihren eigenen Fehler */ }
      await new Promise((r) => setTimeout(r, Math.max(0, 600 - (Date.now() - started))));
      ind.classList.remove('spin');
      paint(0);
      busy = false;
    };
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', () => { if (p && p.on) paint(0); p = null; }, { passive: true });
  }

  // 4) Fenster von unten (nur Handy): Griff oben, nach unten wegziehbar
  ['oldItemDialog', 'ordersDialog', 'peopleDialog', 'reviewsDialog', 'reviewDialog', 'reportDialog', 'interestDialog', 'backupDialog'].forEach((id) => {
    const d = $(id);
    if (!d) return;
    d.classList.add('bsheet');
    const nativeClose = d.close.bind(d);
    let closing = false;
    d.close = (v) => {
      if (!d.open || closing || !phone() || reduce()) return nativeClose(v);
      closing = true;
      const from = d._dragY || 0;
      const a = d.animate([{ transform: 'translateY(' + from + 'px)' }, { transform: 'translateY(100%)' }], { duration: 220, easing: 'cubic-bezier(.23, 1, .32, 1)', fill: 'forwards' });
      a.onfinish = () => { closing = false; d._dragY = 0; a.cancel(); nativeClose(v); };
    };
    d.addEventListener('cancel', (e) => { e.preventDefault(); d.close(); });
    let g = null;
    d.addEventListener('touchstart', (e) => {
      g = null;
      if (!phone() || e.touches.length !== 1) return;
      const t = e.touches[0], r = d.getBoundingClientRect();
      if (t.clientY - r.top <= 44) g = { y0: t.clientY, t0: Date.now(), dy: 0 };
    }, { passive: true });
    d.addEventListener('touchmove', (e) => {
      if (!g) return;
      g.dy = Math.max(0, e.touches[0].clientY - g.y0);
      d._dragY = g.dy;
      e.preventDefault();
      d.style.transition = 'none';
      d.style.transform = 'translateY(' + g.dy + 'px)';
    }, { passive: false });
    const done = () => {
      if (!g) return;
      const { dy, t0 } = g; g = null;
      const fast = dy / Math.max(1, Date.now() - t0) > 0.5;
      d.style.transition = '';
      if (dy > 110 || (dy > 40 && fast)) { d.close(); d.style.transform = ''; return; }
      const a = reduce() ? null : d.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.23, 1, .32, 1)' });
      d.style.transform = ''; d._dragY = 0;
      if (a) a.onfinish = () => { d.style.transform = ''; };
    };
    d.addEventListener('touchend', done, { passive: true });
    d.addEventListener('touchcancel', done, { passive: true });
  });

  // 6) Bilder weich einblenden, sobald sie geladen sind
  const mark = (e) => { const i = e.target; if (i && i.tagName === 'IMG') i.classList.add('loaded'); };
  document.addEventListener('load', mark, true);
  document.addEventListener('error', mark, true);

  // 7) Tastatur: untere Leiste im Chat sitzt über der Tastatur, Eingabefelder scrollen sichtbar
  if (window.visualViewport) {
    const vv = window.visualViewport;
    let native = false; // in der iOS-App meldet iOS die Tastaturhöhe selbst (window.JawnzKB)
    const setKb = (kb) => {
      document.documentElement.style.setProperty('--kb', kb + 'px');
      document.body.classList.toggle('kb-open', kb > 120);
      if (kb > 120) { const m = document.querySelector('.thread-msgs'); if (m && document.body.classList.contains('in-thread')) m.scrollTop = m.scrollHeight; }
    };
    const sync = () => { if (!native) setKb(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))); };
    window.JawnzKB = (h) => { native = true; setKb(Math.max(0, Number(h) || 0)); if (h > 120) window.scrollTo(0, 0); };
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
  }
  document.addEventListener('focusin', (e) => {
    const f = e.target;
    if (!f || !/^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName) || f.closest('.thread-form, .so-head') || !phone()) return;
    setTimeout(() => { try { f.scrollIntoView({ block: 'center', behavior: reduce() ? 'auto' : 'smooth' }); } catch (err) { /* egal */ } }, 320);
  });

  // 8) Statusleiste/Browserleiste in der Farbe der Seite
  const themeColor = () => {
    const m = document.querySelector('meta[name=theme-color]');
    if (m) m.content = getComputedStyle(document.body).backgroundColor;
  };
  themeColor();
  new MutationObserver(themeColor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => setTimeout(themeColor, 50));

  // 9) Ohne Internet: nur eigener Schrank und eigene Outfits
  const bar = document.createElement('div');
  bar.className = 'offline-bar'; bar.setAttribute('role', 'status'); bar.textContent = 'Offline – nur dein Schrank und deine Outfits';
  document.body.append(bar);
  const netState = () => {
    const off = !navigator.onLine;
    document.body.classList.toggle('offline', off);
    if (off && !['closet', 'outfits', 'builder', 'add'].includes(state.view) && !isGuest()) showView('closet');
  };
  window.addEventListener('offline', netState);
  window.addEventListener('online', netState);
  netState();
})();

/* ---------- Neue Version ---------- */
// Eine lange offene App (im Dock, auf dem Home-Bildschirm, in einem alten Tab) lädt sonst nie neu und behält alte Fehler.
const newerBuild = (text, current) => { const m = /const BUILD = (\d+)/.exec(text || ''); return m && Number(m[1]) > current ? Number(m[1]) : 0; };
// Beschäftigt: Dann nie von selbst neu laden, damit nichts verloren geht
const appBusy = () => !!document.querySelector('dialog[open]') || $('view-builder').classList.contains('active')
  || [...document.querySelectorAll('textarea, input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=range]):not([type=file])')].some((f) => f.offsetParent && f.value);
(() => {
  if (window.Capacitor) return; // die iPhone-App bringt ihre Dateien selbst mit
  let last = 0;
  async function check(returning) {
    if (!navigator.onLine || Date.now() - last < 60000) return;
    last = Date.now();
    let build = 0;
    try { const r = await fetch('errors.js', { cache: 'no-store' }); if (r.ok) build = newerBuild(await r.text(), Errors.BUILD); } catch (e) { return; }
    if (!build) return;
    // beim Zurückkommen von selbst neu laden, je Version höchstens einmal (sonst Endlosschleife bei hartnäckig altem Cache)
    let tried = false;
    try { tried = sessionStorage.getItem('jawnz-neu') === String(build); } catch (e) { tried = true; }
    if (returning && !tried && !appBusy()) { try { sessionStorage.setItem('jawnz-neu', String(build)); } catch (e) { /* egal */ } location.reload(); return; }
    if (document.querySelector('.update-hint')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn primary update-hint'; b.textContent = 'Neue Version: neu laden';
    b.onclick = () => location.reload();
    document.body.append(b);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(true); });
  window.addEventListener('focus', () => check(true));
  setInterval(() => { if (document.visibilityState === 'visible') check(false); }, 10 * 60 * 1000);
})();
