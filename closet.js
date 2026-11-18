// Schrank (Teil der App, Reihenfolge siehe index.html)
/* ---------- Schrank ---------- */
// Auswahlmodus: `closetSel` ist null (aus) oder die Menge der ausgewählten Teile; es zählen nur Teile, die gerade sichtbar sind
let closetSel = null, closetShown = [], closetLpAt = 0;
/* ---------- Kleine Vorschau fürs Raster (nur lokal, wird nicht hochgeladen) ---------- */
// Das Raster zeigt statt des großen Fotos eine Vorschau (max. 500 px, WebP, Transparenz bleibt). Das spart Arbeitsspeicher am Handy.
// Sie wird einmal im Hintergrund erzeugt und im Teil gespeichert (tb); ändert sich das Foto, passt _tbfp nicht mehr und sie wird neu gemacht.
const tbUrls = new Map(); // id -> { fp, url }
const tbQueue = []; let tbBusy = false;
const tbFp = (it) => String(it.blob.size);
function gridUrl(it) {
  if (it.tb && it._tbfp === tbFp(it)) {
    const c = tbUrls.get(it.id);
    if (c && c.fp === it._tbfp) return c.url;
    if (c) URL.revokeObjectURL(c.url);
    const url = URL.createObjectURL(it.tb);
    tbUrls.set(it.id, { fp: it._tbfp, url });
    return url;
  }
  if (!tbQueue.includes(it.id)) tbQueue.push(it.id);
  if (!tbBusy) { tbBusy = true; setTimeout(tbWork, 300); }
  return urlFor(it); // bis die Vorschau fertig ist: das große Foto
}
async function tbWork() {
  while (tbQueue.length) {
    const it = items.find((x) => x.id === tbQueue.shift());
    if (!it || !it.blob || (it.tb && it._tbfp === tbFp(it))) continue;
    const fp = tbFp(it);
    try {
      const src = URL.createObjectURL(it.blob);
      let small;
      try {
        const img = await loadImage(src);
        const k = Math.min(1, 500 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        small = await canvasBlob(c, 'image/webp', 0.78);
        c.width = c.height = 0;
      } finally { URL.revokeObjectURL(src); }
      if (!small || fp !== tbFp(it)) continue;
      it.tb = small; it._tbfp = fp;
      // direkt in der Datenbank ablegen, ohne die Bearbeitungszeit zu ändern und ohne Abgleich auszulösen
      await tx('items', 'readwrite', (o) => {
        const r = o.get(it.id);
        r.onsuccess = () => { const cur = r.result; if (cur && cur.blob && tbFp(cur) === fp) { cur.tb = small; cur._tbfp = fp; o.put(cur); } };
      });
      const im = document.querySelector(`#closetGrid img[data-id="${it.id}"]`);
      if (im) im.src = gridUrl(it);
    } catch (e) { /* bleibt beim großen Foto */ }
    await new Promise((r) => setTimeout(r, 30)); // zwischendurch durchatmen, damit nichts ruckelt
  }
  tbBusy = false;
}
function renderCloset() {
  renderChips($('closetFilter'), 'closetFilter', renderCloset);
  // Beim Hochladen gleich die Kategorie vorauswählen, die gerade angezeigt wird
  const f = state.closetFilter;
  if (f !== 'Alle' && !(GROUPS[f] && GROUPS[f].includes($('uploadCategory').value))) {
    $('uploadCategory').value = uploadCategoryFor(f);
  }
  const grid = $('closetGrid');
  grid.innerHTML = '';
  const q = state.search.trim().toLowerCase();
  const hit = (i) => !q || [i.name, i.brand, i.category, i.size, i.sku, i.note].some((v) => v && String(v).toLowerCase().includes(q));
  const list = items.filter((i) => matchesFilter(i, state.closetFilter) && hit(i));
  closetShown = list;
  if (closetSel) for (const id of [...closetSel]) if (!list.some((i) => i.id === id)) closetSel.delete(id); // Filter gewechselt: Verstecktes nicht mitändern
  grid.classList.toggle('selecting', !!closetSel);
  list.forEach((it) => {
    const card = document.createElement('button');
    card.className = 'card' + (closetSel && closetSel.has(it.id) ? ' selected' : '');
    if (closetSel) card.setAttribute('aria-pressed', closetSel.has(it.id));
    card.innerHTML = `<div class="img"><img alt=""></div><div class="meta"><b></b><span></span></div>`;
    const im = card.querySelector('img'); im.loading = 'lazy'; im.decoding = 'async'; im.src = gridUrl(it); im.dataset.id = it.id;
    card.querySelector('b').textContent = it.name;
    card.querySelector('span').textContent = [it.category, visLabel(it, 'items')].filter(Boolean).join(' · ');
    // Lange drücken wählt das Teil aus und startet die Auswahl
    let lp = null, sx = 0, sy = 0;
    const stopLp = () => { clearTimeout(lp); lp = null; };
    card.addEventListener('pointerdown', (e) => {
      if (closetSel || (e.pointerType === 'mouse' && e.button !== 0)) return;
      sx = e.clientX; sy = e.clientY;
      lp = setTimeout(() => {
        lp = null; closetLpAt = Date.now();
        if (navigator.vibrate) try { navigator.vibrate(12); } catch (err) { /* egal */ }
        closetSel = new Set([it.id]);
        renderCloset();
      }, 500);
    });
    card.addEventListener('pointermove', (e) => { if (lp && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) stopLp(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => card.addEventListener(ev, stopLp));
    card.addEventListener('contextmenu', (e) => e.preventDefault());
    card.onclick = () => {
      if (Date.now() - closetLpAt < 600) return; // Klick direkt nach dem langen Drücken ignorieren
      if (!closetSel) return openItemDialog(it);
      const on = !closetSel.has(it.id);
      if (on) closetSel.add(it.id); else closetSel.delete(it.id);
      card.classList.toggle('selected', on);
      card.setAttribute('aria-pressed', on);
      updateBulk();
    };
    grid.appendChild(card);
  });
  updateBulk();
  $('closetEmpty').classList.toggle('show', list.length === 0);
  if (!list.length) {
    setEmpty($('closetEmpty'), items.length === 0
      ? { ic: 'closet', title: 'Dein Schrank ist noch leer', text: 'Lade dein erstes Teil hoch, am besten mit Foto auf hellem Hintergrund.', cta: 'Erstes Teil hinzufügen', fn: () => showView('add') }
      : q ? { ic: 'search', title: 'Nichts gefunden', text: 'Versuche einen anderen Suchbegriff.' }
        : { ic: 'closet', title: 'Keine Teile in dieser Kategorie' });
  }
}

// Sichtbarkeit eines Teils ändern, alle anderen Angaben bleiben (der Preis bleibt erhalten)
function applyVisibility(it, vis) {
  setDetails(it, cleanDetails({ ...it, vis }, 'items'));
}
function updateBulk() {
  const n = closetSel ? closetSel.size : 0;
  $('bulkBar').hidden = !closetSel;
  $('bulkCount').textContent = n ? n + (n === 1 ? ' Teil ausgewählt' : ' Teile ausgewählt') : 'Tippe weitere Teile an';
  $('bulkBar').querySelectorAll('[data-vis], #bulkDelete').forEach((b) => { b.disabled = !n; });
  $('bulkAll').textContent = closetSel && closetShown.length && n === closetShown.length ? 'Keine' : 'Alle';
}
function setSelectMode(on) {
  closetSel = on ? new Set() : null;
  renderCloset();
}
$('bulkDone').onclick = () => setSelectMode(false);
$('bulkAll').onclick = () => {
  if (!closetSel) return;
  if (closetSel.size === closetShown.length) closetSel.clear(); else closetShown.forEach((i) => closetSel.add(i.id));
  renderCloset();
};
const selectedItems = () => items.filter((i) => closetSel && closetSel.has(i.id));
$('bulkBar').querySelectorAll('[data-vis]').forEach((b) => {
  b.onclick = async () => {
    const vis = b.dataset.vis, sel = selectedItems().filter((i) => visOf(i) !== vis);
    if (!sel.length) return toast('Schon so eingestellt');
    for (const it of sel) {
      applyVisibility(it, vis);
      if (vis === 'private' && typeof Profile !== 'undefined') Profile.setPinned(it.id, false); // privat gehört nicht auf das Profil
      await dbPut('items', it);
    }
    toast(sel.length + (sel.length === 1 ? ' Teil: ' : ' Teile: ') + VIS.items[vis]);
    setSelectMode(false);
  };
});
$('bulkDelete').onclick = async () => {
  const sel = selectedItems(), ids = new Set(sel.map((i) => i.id));
  if (!sel.length) return;
  const used = outfits.filter((o) => o.layers.some((l) => ids.has(l.itemId))).length;
  const msg = `${sel.length} ${sel.length === 1 ? 'Teil' : 'Teile'} löschen?` + (used ? ` ${used === 1 ? 'Ein Outfit verwendet' : used + ' Outfits verwenden'} davon Teile, sie verschwinden dort.` : '') + ' Das lässt sich nicht rückgängig machen.';
  if (!(await askConfirm(msg))) return;
  for (const it of sel) await dropItem(it);
  toast(sel.length + (sel.length === 1 ? ' Teil gelöscht' : ' Teile gelöscht'));
  setSelectMode(false);
  renderOutfits();
};
