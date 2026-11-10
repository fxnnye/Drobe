// Schrank (Teil der App, Reihenfolge siehe index.html)
/* ---------- Schrank ---------- */
// Auswahlmodus: `closetSel` ist null (aus) oder die Menge der ausgewählten Teile; es zählen nur Teile, die gerade sichtbar sind
let closetSel = null, closetShown = [];
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
    card.innerHTML = `<div class="img"><img alt=""></div><div class="meta"><b></b><span></span><i class="note"></i></div>`;
    card.querySelector('img').src = urlFor(it);
    card.querySelector('b').textContent = it.name;
    card.querySelector('span').textContent = [it.category, visLabel(it, 'items')].filter(Boolean).join(' · ');
    card.querySelector('.note').textContent = it.note || '';
    card.onclick = () => {
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

// Sichtbarkeit eines Teils ändern, alle anderen Angaben bleiben (Preis nur bei „Verkauf“)
function applyVisibility(it, vis) {
  setDetails(it, cleanDetails({ ...it, vis }, 'items'));
}
function updateBulk() {
  const n = closetSel ? closetSel.size : 0;
  $('bulkBar').hidden = !closetSel;
  $('bulkCount').textContent = n ? n + (n === 1 ? ' Teil ausgewählt' : ' Teile ausgewählt') : 'Tippe Teile an';
  $('bulkBar').querySelectorAll('[data-vis], #bulkDelete').forEach((b) => { b.disabled = !n; });
  $('bulkAll').textContent = closetSel && closetShown.length && n === closetShown.length ? 'Keine' : 'Alle';
}
function setSelectMode(on) {
  closetSel = on ? new Set() : null;
  $('closetSelect').textContent = on ? 'Fertig' : 'Auswählen';
  $('closetSelect').classList.toggle('on', on);
  $('closetSelect').setAttribute('aria-pressed', on);
  renderCloset();
}
$('closetSelect').onclick = () => setSelectMode(!closetSel);
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
    const lost = sel.filter((i) => visOf(i) === 'sale' && i.price != null).length;
    if (lost && !(await askConfirm(`${lost} ${lost === 1 ? 'Teil ist' : 'Teile sind'} zum Verkauf, der Preis geht dabei verloren. Trotzdem ändern?`, 'Ändern'))) return;
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
