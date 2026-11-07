// Outfit-Builder, Export und Speichern (Teil der App, Reihenfolge siehe index.html)
/* ---------- Outfit-Builder ---------- */
function renderPicker() {
  renderChips($('pickerFilter'), 'pickerFilter', renderPicker);
  const grid = $('pickerGrid');
  grid.innerHTML = '';
  const list = items.filter((i) => matchesFilter(i, state.pickerFilter));
  list.forEach((it) => {
    const b = document.createElement('button');
    b.className = 'pick';
    b.dataset.id = it.id;
    b.title = it.name;
    b.innerHTML = '<img alt="">';
    b.firstChild.src = urlFor(it);
    b.onclick = () => toggleItem(it);
    grid.appendChild(b);
  });
  markPicks();
  $('pickerEmpty').classList.toggle('show', list.length === 0);
  $('pickerEmpty').textContent = items.length === 0
    ? 'Lade zuerst Teile in den Schrank hoch.'
    : 'Keine Teile in dieser Kategorie.';
}

function markPicks() {
  const used = new Set(state.outfit.layers.map((l) => l.itemId));
  document.querySelectorAll('.pick').forEach((b) => b.classList.toggle('active', used.has(b.dataset.id)));
}

// Antippen: Teil hinzufügen; ist es schon im Outfit, wird es wieder entfernt
function toggleItem(it) {
  const existing = state.outfit.layers.find((l) => l.itemId === it.id);
  if (existing) {
    state.outfit.layers = state.outfit.layers.filter((l) => l !== existing);
    if (state.selected === existing.uid) state.selected = null;
    relayout().then(renderStage);
    return;
  }
  addLayer(it);
}

// Seitenverhältnis (Höhe/Breite) eines Teils, einmal gemessen und gemerkt
const aspects = new Map();
async function aspectOf(it) {
  if (!aspects.has(it.id)) {
    const img = await loadImage(urlFor(it));
    aspects.set(it.id, img.naturalHeight / img.naturalWidth);
  }
  return aspects.get(it.id);
}
// Standardbreite eines Teils: so groß, wie es in die Fläche seiner Kategorie passt
const fitWidth = (it, aspect) => {
  const box = PLACEMENT[it.category];
  return Math.min(box.w, box.h * STAGE_RATIO / aspect);
};

async function addLayer(it) {
  const aspect = await aspectOf(it);
  const w = fitWidth(it, aspect) * (it.scale || 1); // it.scale: vom Nutzer gemerkte Anpassung
  // Regeln: pro Kategorie nur ein Teil (Schmuck: beliebig viele), Shirt und Pullover schließen sich aus
  const replaced = MULTI.includes(it.category) ? [] : EXCLUSIVE[it.category] || [it.category];
  state.outfit.layers = state.outfit.layers.filter((l) => !replaced.includes(itemById(l.itemId)?.category));
  const layer = { uid: uid(), itemId: it.id, x: 0.3, y: 0.3, w };
  // Standard-Stapelreihenfolge einhalten (Jacke hinter Oberteil usw.)
  const rank = STACK.indexOf(it.category);
  const at = state.outfit.layers.findIndex((l) => STACK.indexOf(itemById(l.itemId).category) > rank);
  state.outfit.layers.splice(at < 0 ? state.outfit.layers.length : at, 0, layer);
  state.selected = layer.uid;
  await relayout();
  renderStage();
}

// Ordnet die Teile wie eine Outfit-Collage an: links oben Schmuck und Cap, rechts oben die Jacke, in der Mitte das Oberteil
// (vor der Jacke), darunter die Hose, rechts davon die Tasche, links unten die Schuhe, der Gürtel auf dem Hosenbund.
// Fehlt ein Teil, rücken die anderen nach. Von Hand verschobene Teile bleiben liegen.
async function relayout() {
  const auto = state.outfit.layers.filter((l) => !l.manual && itemById(l.itemId));
  await Promise.all(auto.map((l) => aspectOf(itemById(l.itemId))));
  const of = (cat) => auto.filter((l) => itemById(l.itemId).category === cat);
  const hf = (l) => l.w * aspects.get(l.itemId) / STAGE_RATIO; // Höhe als Anteil der Bühnenhöhe
  const put = (l, x, y) => { // x = linke Kante; bleibt innerhalb der Fläche
    l.x = Math.max(0, Math.min(1 - l.w, x));
    l.y = Math.max(0, Math.min(1 - hf(l), y));
  };
  const jackets = of('Jacken'), tops = [...of('Shirts'), ...of('Pullover')], pants = of('Hosen');

  // Rechts oben: Jacke, rechtsbündig
  let jacketBottom = 0.03;
  for (const l of jackets) { put(l, 0.96 - l.w, 0.03); jacketBottom = Math.max(jacketBottom, l.y + hf(l)); }

  // Mitte: Oberteil, mittig; mit Jacke ein Stück tiefer, damit es davor liegt
  const topY = jackets.length ? 0.155 : 0.04;
  let topBottom = jackets.length ? jacketBottom : 0.04;
  for (const l of tops) { put(l, 0.49 - l.w / 2, topY); topBottom = Math.max(topBottom, l.y + hf(l)); }

  // Hose: unter dem Oberteil, mittig
  let pantsTop = topBottom, pantsBottom = 0.97;
  for (const l of pants) { put(l, 0.495 - l.w / 2, pantsTop); pantsBottom = l.y + hf(l); }

  // Gürtel auf dem Hosenbund
  for (const l of of('Gürtel')) put(l, 0.495 - l.w / 2, pantsTop + 0.005);

  // Rechts neben der Hose: Tasche auf Höhe des Hosenbunds
  let ty = pantsTop;
  for (const l of of('Taschen')) { put(l, 0.955 - l.w, ty); ty = l.y + hf(l) + 0.01; }

  // Links oben: Schmuck, darunter Cap(s)
  let ly = 0.05;
  for (const l of [...of('Schmuck'), ...of('Caps')]) { put(l, 0.18 - l.w / 2 + 0.05, ly); ly = l.y + hf(l) + 0.025; }

  // Links unten: Schuhe, am unteren Ende der Hose
  let sy = pants.length ? pantsBottom - 0.16 : 0.8;
  for (const l of of('Schuhe')) { put(l, 0.27 - l.w / 2, sy); sy = l.y + hf(l) + 0.01; }
}

function renderStage() {
  const stage = $('stage');
  stage.querySelectorAll('.layer').forEach((n) => n.remove());
  const layers = state.outfit.layers.filter((l) => itemById(l.itemId));
  $('stageHint').style.display = layers.length ? 'none' : 'grid';
  layers.forEach((l) => {
    const el = document.createElement('div');
    el.className = 'layer' + (l.uid === state.selected ? ' selected' : '');
    el.dataset.uid = l.uid;
    el.innerHTML = '<img alt=""><span class="handle"></span><span class="rot" title="Drehen"></span>';
    el.firstChild.src = urlFor(itemById(l.itemId));
    placeLayer(el, l);
    attachDrag(el, l);
    stage.appendChild(el); // DOM-Reihenfolge = Ebenen-Reihenfolge
  });
  updatePanel();
  markPicks();
}
function placeLayer(el, l) {
  el.style.transform = l.rot ? `rotate(${l.rot}deg)` : '';
  el.style.left = l.x * 100 + '%';
  el.style.top = l.y * 100 + '%';
  el.style.width = l.w * 100 + '%';
}

function attachDrag(el, l) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const resizing = e.target.classList.contains('handle');
    const rotating = e.target.classList.contains('rot');
    if (state.selected !== l.uid) {
      state.selected = l.uid;
      document.querySelectorAll('.layer').forEach((n) => n.classList.toggle('selected', n === el));
      updatePanel();
    }
    const rect = $('stage').getBoundingClientRect();
    const start = { cx: e.clientX, cy: e.clientY, x: l.x, y: l.y, w: l.w };
    const box = el.getBoundingClientRect(); // Mittelpunkt bleibt beim Drehen gleich
    const center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    const rr = (l.rot || 0) * Math.PI / 180;
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* Zeiger nicht mehr aktiv: dann bricht das Ziehen einfach ab */ }
    el.style.cursor = resizing ? 'nwse-resize' : 'grabbing';
    const move = (ev) => {
      const dx = (ev.clientX - start.cx) / rect.width;
      const dy = (ev.clientY - start.cy) / rect.height;
      l.manual = true; // ab jetzt ordnet die automatische Anordnung dieses Teil nicht mehr um
      if (rotating) {
        let deg = Math.atan2(ev.clientX - center.x, center.y - ev.clientY) * 180 / Math.PI;
        for (const snap of [0, 90, -90, 180, -180]) if (Math.abs(deg - snap) < 4) deg = snap; // rastet an geraden Winkeln ein
        l.rot = Math.round(deg);
      } else if (resizing) {
        // Ziehrichtung an die Drehung des Teils anpassen
        const along = ((ev.clientX - start.cx) * Math.cos(rr) + (ev.clientY - start.cy) * Math.sin(rr)) / rect.width;
        l.w = Math.min(1.2, Math.max(0.08, start.w + along));
      } else { l.x = start.x + dx; l.y = start.y + dy; }
      placeLayer(el, l);
    };
    const up = () => {
      el.style.cursor = '';
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
}

function updatePanel() {
  const l = state.outfit.layers.find((x) => x.uid === state.selected);
  const it = l && itemById(l.itemId);
  $('layerTools').hidden = !it;
  const bg = state.outfit.bg || '#ffffff';
  $('stage').style.background = bg;
  document.querySelectorAll('.swatch[data-color]').forEach((s) => s.classList.toggle('active', s.dataset.color === bg.toLowerCase()));
  $('bgCustom').value = bg;
  $('bgCustom').parentElement.classList.toggle('active', !BG_COLORS.includes(bg.toLowerCase()));
  $('outfitName').value = state.outfit.name;
  $('outfitVis').value = state.outfit.vis || 'private';
}
$('outfitVis').onchange = () => { state.outfit.vis = $('outfitVis').value; };
// Hintergrundfarbe des Outfits: feste Farben plus freie Farbwahl
const BG_COLORS = ['#ffffff', '#f1efe9', '#e9e9e9', '#f6d5d9', '#d6e4f0', '#d9e8d4', '#111111'];
function setupSwatches() {
  const box = $('swatches');
  BG_COLORS.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.dataset.color = c;
    b.style.background = c;
    b.title = c;
    b.onclick = () => { state.outfit.bg = c; updatePanel(); };
    box.appendChild(b);
  });
  const custom = document.createElement('label');
  custom.className = 'swatch custom';
  custom.title = 'Eigene Farbe';
  custom.innerHTML = '<input type="color" id="bgCustom" value="#ffffff">';
  custom.firstChild.addEventListener('input', (e) => { state.outfit.bg = e.target.value; updatePanel(); });
  box.appendChild(custom);
}
setupSwatches();
$('outfitName').addEventListener('input', (e) => { state.outfit.name = e.target.value; });

// Aktuelle Größe des ausgewählten Teils als Standard für dieses Teil merken (für anders geschnittene Stücke)
$('rememberSize').onclick = async () => {
  const l = state.outfit.layers.find((x) => x.uid === state.selected);
  const it = l && itemById(l.itemId);
  if (!it) return;
  const scale = Math.round(l.w / fitWidth(it, await aspectOf(it)) * 100) / 100;
  if (scale === 1) delete it.scale; else it.scale = scale;
  await dbPut('items', it);
  toast(`Größe gemerkt: „${it.name}“ wird künftig mit ${Math.round(scale * 100)} % eingefügt`);
};
$('bringFront').onclick = () => moveLayer(1);
$('sendBack').onclick = () => moveLayer(-1);
function moveLayer(dir) {
  const ls = state.outfit.layers;
  const i = ls.findIndex((l) => l.uid === state.selected);
  const j = dir > 0 ? ls.length - 1 : 0;
  if (i < 0) return;
  const [l] = ls.splice(i, 1);
  ls.splice(j, 0, l);
  renderStage();
}
$('removeLayer').onclick = removeSelected;
function removeSelected() {
  state.outfit.layers = state.outfit.layers.filter((l) => l.uid !== state.selected);
  state.selected = null;
  relayout().then(renderStage);
}
document.addEventListener('keydown', (e) => {
  const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if (!typing && (e.key === 'Delete' || e.key === 'Backspace') && state.selected
      && $('view-builder').classList.contains('active')) {
    e.preventDefault();
    removeSelected();
  }
});
$('stage').addEventListener('pointerdown', (e) => {
  if (e.target === $('stage') || e.target.id === 'stageHint') { state.selected = null; renderStage(); }
});

$('builderBack').onclick = () => showView('outfits');
$('newOutfit').onclick = async () => {
  if (state.outfit.layers.length && !(await askConfirm('Aktuelles Outfit verwerfen und neu beginnen?', 'Verwerfen'))) return;
  state.outfit = { id: null, name: '', bg: '#ffffff', layers: [] };
  state.selected = null;
  renderStage();
};

/* ---------- Export & Speichern ---------- */
async function renderOutfitCanvas(layers, w, h, bg = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  for (const l of layers) {
    const it = itemById(l.itemId);
    if (!it) continue;
    const img = await loadImage(urlFor(it));
    const dw = l.w * w;
    const dh = dw * img.naturalHeight / img.naturalWidth;
    ctx.save();
    ctx.translate(l.x * w + dw / 2, l.y * h + dh / 2);
    ctx.rotate((l.rot || 0) * Math.PI / 180);
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
  return c;
}

$('saveOutfit').onclick = async () => {
  const o = state.outfit;
  const layers = o.layers.filter((l) => itemById(l.itemId));
  if (!layers.length) return toast('Füge zuerst Teile hinzu');
  const thumb = await canvasBlob(await renderOutfitCanvas(layers, 360, 640, o.bg), 'image/jpeg', 0.85);
  const rec = {
    id: o.id || uid(),
    name: o.name.trim() || 'Outfit ' + (outfits.length + 1),
    layers: layers.map(({ itemId, x, y, w, rot }) => ({ itemId, x, y, w, rot: rot || 0 })),
    bg: o.bg || '#ffffff',
    thumb, created: Date.now(),
  };
  if (o.vis === 'public') rec.vis = 'public';
  await dbPut('outfits', rec);
  const idx = outfits.findIndex((x) => x.id === rec.id);
  if (idx >= 0) outfits[idx] = rec; else outfits.push(rec);
  urls.delete('thumb-' + rec.id);
  o.id = rec.id; o.name = rec.name;
  updatePanel();
  renderOutfits();
  toast('Outfit gespeichert');
};

function renderOutfits() {
  $('outfitCount').textContent = outfits.length;
  if (!$('meBar').hidden) renderMeHead();
  const grid = $('outfitGrid');
  grid.innerHTML = '';
  // Erste Kachel: neues Outfit bauen
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'card add-card';
  add.setAttribute('aria-label', 'Neues Outfit bauen');
  add.innerHTML = '<div class="img"><svg class="plus" viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg></div><div class="meta"><b>Neues Outfit</b></div>';
  add.onclick = async () => {
    const unsaved = state.outfit.layers.length && !state.outfit.id;
    if (!unsaved || (await askConfirm('Du hast ein nicht gespeichertes Outfit. Neu beginnen?', 'Neu beginnen'))) {
      state.outfit = { id: null, name: '', bg: '#ffffff', layers: [] };
      state.selected = null;
    }
    showView('builder');
  };
  grid.appendChild(add);
  [...outfits].sort((a, b) => b.created - a.created).forEach((o) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<div class="img"><img alt=""></div><div class="meta"><b></b><span></span></div>
      <div class="card-actions"><button class="btn" data-a="edit">Bearbeiten</button>
      <button class="btn" data-a="dl">PNG</button><button class="btn" data-a="share" hidden>Teilen</button><button class="btn danger" data-a="del">Löschen</button></div>`;
    const key = 'thumb-' + o.id;
    if (!urls.has(key)) urls.set(key, URL.createObjectURL(o.thumb));
    card.querySelector('img').src = urls.get(key);
    card.querySelector('b').textContent = o.name;
    // Teile, die inzwischen aus dem Schrank gelöscht wurden, fehlen im Outfit: kleines Ausrufezeichen
    const missing = o.layers.filter((l) => !itemById(l.itemId)).length;
    card.querySelector('span').textContent = o.layers.length + ' Teile' + (missing ? ` · ${missing} fehlt` : '') + (visOf(o) === 'public' ? ' · Öffentlich' : '');
    if (missing) {
      const w = document.createElement('button');
      w.type = 'button';
      w.className = 'warn';
      w.textContent = '!';
      const msg = missing === 1 ? 'Ein Teil aus diesem Outfit wurde aus dem Schrank gelöscht.' : `${missing} Teile aus diesem Outfit wurden aus dem Schrank gelöscht.`;
      w.title = msg;
      w.setAttribute('aria-label', msg);
      w.onclick = () => toast(msg);
      card.querySelector('.img').appendChild(w);
    }
    card.querySelector('[data-a=edit]').onclick = () => editOutfit(o);
    card.querySelector('[data-a=dl]').onclick = () => downloadOutfit(o);
    if (navigator.canShare) { // nur zeigen, wo Bilder geteilt werden können (meist Handy)
      const sb = card.querySelector('[data-a=share]');
      sb.hidden = false;
      sb.onclick = () => shareOutfit(o);
    }
    card.querySelector('[data-a=del]').onclick = async () => {
      if (!(await askConfirm(`„${o.name}" löschen?`))) return;
      await dbDel('outfits', o.id);
      outfits = outfits.filter((x) => x.id !== o.id);
      if (state.outfit.id === o.id) state.outfit.id = null;
      renderOutfits();
    };
    grid.appendChild(card);
  });
  $('outfitsEmpty').classList.toggle('show', outfits.length === 0);
}

function editOutfit(o) {
  state.outfit = {
    id: o.id, name: o.name, bg: o.bg || '#ffffff', vis: visOf(o),
    layers: o.layers.filter((l) => itemById(l.itemId)).map((l) => ({ ...l, uid: uid(), manual: true })),
  };
  state.selected = null;
  showView('builder');
  const gone = o.layers.length - state.outfit.layers.length;
  if (gone) toast(gone === 1 ? 'Ein Teil fehlt, es wurde aus dem Schrank gelöscht' : `${gone} Teile fehlen, sie wurden aus dem Schrank gelöscht`);
}
// Export im Story-Format (9:16) mit dezentem Drobe-Zeichen. Es sitzt etwas über dem unteren Rand, damit die
// Antwortleiste von Instagram es nicht verdeckt, und passt seine Farbe an den Hintergrund an.
async function outfitExportCanvas(o) {
  const c = await renderOutfitCanvas(o.layers, EXPORT_W, EXPORT_H, o.bg);
  const hex = /^#[0-9a-f]{6}$/i.test(o.bg) ? o.bg : '#ffffff';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const dark = (0.299 * r + 0.587 * g + 0.114 * b) < 128;
  const ctx = c.getContext('2d');
  ctx.font = `700 ${Math.round(EXPORT_W * 0.05)}px ${getComputedStyle(document.body).fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)';
  ctx.fillText('Drobe', EXPORT_W / 2, EXPORT_H * 0.9);
  return c;
}
const outfitFileName = (o) => (o.name || 'outfit').replace(/[^\w\-äöüÄÖÜß ]+/g, '').trim() || 'outfit';
async function downloadOutfit(o) {
  const c = await outfitExportCanvas(o);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = outfitFileName(o) + '.png';
  a.click();
}
// Teilen-Menü des Handys (Instagram, Nachrichten …); wo es das nicht gibt, wird das Bild stattdessen gespeichert
async function shareOutfit(o) {
  const blob = await canvasBlob(await outfitExportCanvas(o), 'image/png');
  const file = new File([blob], outfitFileName(o) + '.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); } catch (e) { if (e.name !== 'AbortError') toast('Teilen hat nicht geklappt'); }
  } else downloadOutfit(o);
}
