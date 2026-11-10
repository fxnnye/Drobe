// Start der App (Teil der App, Reihenfolge siehe index.html)
/* ---------- Start ---------- */
fillSelect($('uploadCategory'));
fillSelect($('itemCategory'));
fillSelect($('upCategory'));
fillSelect($('wishCategory'));
fillSelect($('wishUploadCategory'));
buildDetails($('itemMore'), 'itd', 'items');
buildDetails($('wishMore'), 'wsd', 'wishlist');
['upBrand', 'itdbrand', 'wsdbrand'].forEach((id) => brandSuggest($(id)));
[['upSize', 'upCategory'], ['itdsize', 'itemCategory'], ['wsdsize', 'wishCategory']].forEach(([id, cat]) => sizeSuggest($(id), cat));

// Alte Kategorien umsortieren (z. B. Outerwear → Jacken, Oberteile → Shirts, Accessoires → Taschen)
async function migrateCategories() {
  for (const it of items) {
    if (!CATEGORIES.includes(it.category)) { it.category = LEGACY[it.category] || 'Shirts'; await dbPut('items', it); }
  }
  for (const w of wishlist) {
    if (!CATEGORIES.includes(w.category)) { w.category = LEGACY[w.category] || 'Shirts'; await dbPut('wishlist', w); }
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
    for (const [kind, list] of [['items', items], ['wishlist', wishlist]]) {
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
  if (changed) { renderCloset(); renderWishlist(); renderOutfits(); renderPicker(); }
}

// Alles aus dem lokalen Speicher neu einlesen und anzeigen (nach dem Abgleich mit dem Konto)
async function reloadAll() {
  [items, outfits, wishlist] = await Promise.all([dbAll('items'), dbAll('outfits'), dbAll('wishlist')]);
  await migrateCategories();
  for (const u of urls.values()) URL.revokeObjectURL(u);
  urls.clear();
  items.sort((a, b) => a.created - b.created);
  wishlist.sort((a, b) => a.created - b.created);
  outfits.sort((a, b) => a.created - b.created);
  renderCloset(); renderWishlist(); renderOutfits(); renderPicker();
  upgradeOutfitThumbs().catch((e) => console.error(e));
  dropTrade().catch((e) => console.error(e));
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
  const yes = await askConfirm(text, 'Übernehmen');
  try { localStorage.setItem(flag, '1'); } catch (e) { /* egal */ } // die Frage kommt nur einmal, egal wie die Antwort ausfällt
  if (!yes) return;
  for (const name of ['items', 'outfits', 'wishlist']) {
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
    [items, outfits, wishlist] = await Promise.all([dbAll('items'), dbAll('outfits'), dbAll('wishlist')]);
    wishlist.sort((a, b) => a.created - b.created);
  } catch (e) {
    console.error(e);
    toast('Speicher im Browser nicht verfügbar');
  }
  await migrateCategories();
  items.sort((a, b) => a.created - b.created);
  renderCloset();
  renderWishlist();
  renderOutfits();
  showView('feed');
  maybeWelcome();
  backfillColors();
  backfillTrim();
}

Cloud.boot();

// Tipp auf den abgedunkelten Bereich neben einem Fenster schließt es (außer beim Hochladen, damit nichts verloren geht)
document.querySelectorAll('dialog').forEach((d) => {
  if (d.id === 'uploadDialog' || d.id === 'confirmDialog') return;
  const outside = (e) => { const r = d.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
  let down = false;
  d.addEventListener('pointerdown', (e) => { down = e.target === d && outside(e); });
  d.addEventListener('click', (e) => { if (down && e.target === d && outside(e)) d.close(); down = false; });
});
// Enter speichert und schließt den Dialog (Teil, Wunschliste, Hochladen, Profil). Mehrzeilige Felder (Notizen, Über mich) machen einen Absatz.
[['itemDialog', 'itemSave'], ['wishDialog', 'wishSave'], ['uploadDialog', 'upAdd'], ['profileDialog', 'profTextSave']].forEach(([d, btn]) => {
  $(d).addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.key !== 'Enter' || e.isComposing || e.shiftKey || ['TEXTAREA', 'BUTTON', 'A', 'SELECT', 'SUMMARY'].includes(t.tagName) || (t.tagName === 'INPUT' && ['file', 'checkbox', 'radio'].includes(t.type))) return;
    e.preventDefault();
    if (t.blur) t.blur();
    $(btn).click();
  });
});
