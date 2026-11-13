// Teil bearbeiten (Teil der App, Reihenfolge siehe index.html)
/* Teil bearbeiten */
const dlg = $('itemDialog');
$('itScale').oninput = (e) => { $('itScaleVal').textContent = e.target.value + ' %'; };

function setItemEditOpen(open) {
  $('itEdit').hidden = !open;
  dlg.classList.toggle('editing', open); // Vorschau bleibt beim Bearbeiten oben sichtbar
  $('itEditToggle').setAttribute('aria-expanded', open);
  $('itEditToggle').textContent = open ? 'Bearbeiten schließen' : 'Bearbeiten';
}
$('itEditToggle').onclick = () => setItemEditOpen($('itEdit').hidden);

// Foto ersetzen: neues Bild an die Stelle des alten setzen; Name, Kategorie und Angaben bleiben, Werkzeuge starten von vorn
$('itReplace').onclick = () => $('itReplaceFile').click();
$('itReplaceFile').onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f || !f.type.startsWith('image/') || !itCur || itCur.busy || itCur.queue > 0) return;
  try {
    const orig = await shrink(f);
    if (!itCur) return; // Dialog wurde inzwischen geschlossen
    if (itCur.url) URL.revokeObjectURL(itCur.url);
    itCur = { orig, src: orig, pendingBox: null, hadSource: false, cut: null, useCut: false, busy: false, url: null, angle: 0, history: [], erased: false, replaced: true };
    $('itAngle').value = 0;
    stopDraw();
    activeCtx.refresh();
  } catch (err) {
    console.error(err);
    toast('Konnte das Foto nicht laden');
  }
};

// Größenregler im Teil-Dialog: Schuhe dürfen größer eingestellt werden als alles andere
const scaleMax = (category) => (category === 'Schuhe' ? 200 : 150);
$('itemCategory').addEventListener('change', () => {
  const max = scaleMax($('itemCategory').value);
  $('itScale').max = max;
  if (+$('itScale').value > max) $('itScale').value = max;
  $('itScaleVal').textContent = $('itScale').value + ' %';
});

// Ansicht wie bei anderen Nutzern; erst „Bearbeiten“ zeigt die Felder
function setViewing(on) { dlg.classList.toggle('viewing', on); }
function buildItemView(it) {
  const v = $('itView');
  v.replaceChildren();
  const h = document.createElement('h2'); h.className = 'item-name'; h.textContent = it.name || 'Teil'; v.append(h);
  if (it.vis === 'sale' && it.price != null) { const p = document.createElement('p'); p.className = 'item-price'; p.textContent = Number(it.price).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); v.append(p); }
  const dl = document.createElement('dl'); dl.className = 'item-facts';
  for (const [k, val] of [['Marke', it.brand], ['Größe', it.size], ['Zustand', it.cond], ['Farbe', it.color], ['Kategorie', it.category], ['Seltenheit', it.rarity && it.rarity !== 'Alltag' ? it.rarity : ''], ['Artikelnummer', it.sku], ['Sichtbarkeit', VIS.items[visOf(it)]], ['Notizen', it.note]]) {
    if (!val) continue;
    const row = document.createElement('div'); row.className = 'item-fact';
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = val;
    row.append(dt, dd); dl.append(row);
  }
  v.append(dl);
}
$('itEditStart').onclick = () => { setViewing(false); setItemEditOpen(false); $('itemName').focus({ preventScroll: true }); };
function openItemDialog(it) {
  state.editingItem = it;
  stopDraw();
  activeCtx = ctxIt;
  // Bildzustand fürs Bearbeiten: startet mit dem gespeicherten Bild, gespeichert wird nur bei Änderungen
  itCur = { orig: it.blob, src: it.source || it.blob, pendingBox: it.source ? it.srcBox : null, hadSource: false, cut: null, useCut: false, busy: false, url: null, angle: 0, history: [], erased: false };
  $('itAngle').value = 0;
  $('itemCategory').value = it.category;
  $('itScale').max = scaleMax(it.category);
  $('itScale').value = Math.round((it.scale || 1) * 100);
  $('itScaleVal').textContent = $('itScale').value + ' %';
  setItemEditOpen(false); // Drehen und Größe sind erst nach „Bearbeiten“ sichtbar
  $('itemPreview').src = urlFor(it);
  renderTools(itCur);
  $('itemName').value = it.name;
  $('itemNote').value = it.note || '';
  fillDetails('itd', it);
  $('itSimilarBox').replaceChildren();
  buildItemView(it);
  setViewing(true);
  dlg.showModal();
}
$('itemForm').addEventListener('submit', async (e) => {
  if (e.submitter && e.submitter.value === 'save') {
    const it = state.editingItem;
    const prevColor = it.color, prevAuto = !!it.hex; // hex gibt es nur bei automatisch erkannter Farbe
    if (!readDetails('itd', 'items', it)) return e.preventDefault(); // Preis falsch: Dialog bleibt offen
    if (typeof Profile !== 'undefined') Profile.setPinned(it.id, visOf(it) !== 'private' && $('itdpin').checked);
    it.name = $('itemName').value.trim() || it.name;
    it.category = $('itemCategory').value;
    const note = $('itemNote').value.trim();
    if (note) it.note = note; else delete it.note;
    const scale = +$('itScale').value / 100;
    if (scale === 1) delete it.scale; else it.scale = scale;
    const u = itCur;
    if (u && upEdited(u)) { // bearbeitetes Bild dauerhaft übernehmen
      const res = await upResult(u);
      it.blob = res.blob;
      delete it.emb; // Bild geändert: Vektor neu berechnen
      if (it.color === prevColor && (prevAuto || !prevColor)) { const c = await detectColor(res.blob); if (c) applyColor(it, c); else { delete it.color; delete it.hex; } } // Farbe nur neu, wenn sie nicht von Hand geändert wurde
      if (res.source) { it.source = res.source; it.srcBox = res.srcBox; } else { delete it.source; delete it.srcBox; }
      if (urls.has(it.id)) { URL.revokeObjectURL(urls.get(it.id)); urls.delete(it.id); }
      aspects.delete(it.id);
    }
    await dbPut('items', it);
    renderCloset();
    renderPicker();
    renderStage();
  }
});
dlg.addEventListener('close', () => {
  stopDraw();
  if (itCur && itCur.url) URL.revokeObjectURL(itCur.url);
  itCur = null;
});
// Teil endgültig entfernen: Datenbank, Bild-Zwischenspeicher und Outfits (Aufrufer zeichnet danach neu)
async function dropItem(it) {
  await dbDel('items', it.id);
  items = items.filter((i) => i.id !== it.id);
  URL.revokeObjectURL(urls.get(it.id));
  urls.delete(it.id);
  aspects.delete(it.id);
  state.outfit.layers = state.outfit.layers.filter((l) => l.itemId !== it.id);
}
$('itemDelete').addEventListener('click', async () => {
  const it = state.editingItem;
  const used = outfits.filter((o) => o.layers.some((l) => l.itemId === it.id)).length;
  const msg = used
    ? `„${it.name}" wird in ${used} Outfit(s) verwendet und verschwindet dort. Trotzdem löschen?`
    : `„${it.name}" löschen?`;
  if (!(await askConfirm(msg))) return;
  await dropItem(it);
  dlg.close();
  renderCloset();
  renderOutfits();
});
