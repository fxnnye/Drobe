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
            if (urls.has(it.id)) { URL.revokeObjectURL(urls.get(it.id)); urls.delete(it.id); }
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
  for (const u of urls.values()) URL.revokeObjectURL(u);
  urls.clear();
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

// Startbildschirm ausblenden: erst wenn die App bereit ist, aber mindestens 1,5 Sekunden nach dem Start (Schriften, Bilder und Daten brauchen die Zeit), spätestens nach 12 Sekunden
const SPLASH_MIN_MS = 1500;
let splashHiding = false;
function hideSplash(force) {
  if (splashHiding) return;
  const wait = force === true ? 0 : Math.max(0, SPLASH_MIN_MS - performance.now());
  splashHiding = true;
  Promise.race([document.fonts ? document.fonts.ready : null, new Promise((r) => setTimeout(r, 3000))]).catch(() => {}).then(() => setTimeout(() => {
    try { window.Capacitor?.Plugins?.SplashScreen?.hide(); } catch (e) { /* kein iOS-App-Rahmen */ }
    const sp = document.getElementById('splash');
    if (!sp || sp.classList.contains('gone')) return;
    sp.classList.add('gone');
    setTimeout(() => sp.remove(), 400);
  }, wait));
}
setTimeout(() => hideSplash(true), 12000);
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
    const img = e.target.closest && e.target.closest('.item-photo img');
    if (img && img.src) open(img.currentSrc || img.src, img.alt);
  });
})();
