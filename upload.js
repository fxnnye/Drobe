// Hinzufügen: Upload-Dialog und Bildwerkzeuge (Teil der App, Reihenfolge siehe index.html)
/* Upload-Dialog: pro Foto Vorschau, Name, Kategorie und optional „Hintergrund entfernen“ */
const upDlg = $('uploadDialog');
const BG_LIB = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm';
// Nach dem Hinzufügen zurück zur Liste, in die die Teile gekommen sind
const leaveAddPage = () => { if (upAdded && state.view === 'add') showView(upTarget === 'wish' ? 'wishlist' : 'closet'); };
let upQueue = [], upCur = null, upTotal = 0, upDone = 0, upAdded = 0;

function trimAlpha(canvas) {
  return trimAlphaBox(canvas).canvas;
}
// Wie trimAlpha, liefert zusätzlich die Position des Zuschnitts im Original.
// Einzelne verirrte Pünktchen (Reste vom Freistellen) zählen nicht: eine Zeile oder Spalte gehört erst dazu,
// wenn sie genug sichtbare Punkte hat. Sonst bleibt das Bild riesig und das Teil wirkt winzig.
function trimAlphaBox(canvas) {
  const { width: w, height: h } = canvas;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const rows = new Uint32Array(h), cols = new Uint32Array(w);
  let any = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 24) { rows[y]++; cols[x]++; any = true; }
  }
  if (!any) return { canvas, x: 0, y: 0 };
  const needRow = Math.max(4, Math.round(w * 0.01)), needCol = Math.max(4, Math.round(h * 0.01));
  let minY = 0, maxY = h - 1, minX = 0, maxX = w - 1;
  while (minY < h && rows[minY] < needRow) minY++;
  while (maxY > minY && rows[maxY] < needRow) maxY--;
  while (minX < w && cols[minX] < needCol) minX++;
  while (maxX > minX && cols[maxX] < needCol) maxX--;
  if (minX >= w || minY >= h) return { canvas, x: 0, y: 0 }; // nur Pünktchen: nichts zuschneiden
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1; out.height = maxY - minY + 1;
  out.getContext('2d').drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return { canvas: out, x: minX, y: minY };
}
// KI-Freistellen im Browser (lädt beim ersten Mal das Modell, danach schnell). Ohne Netz: einfache Methode.
async function removeBackground(blob, onProgress = () => {}, trim = true) {
  const src = URL.createObjectURL(blob);
  try {
    const img = await loadImage(src);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    try {
      const lib = await import(BG_LIB);
      const out = await lib.removeBackground(blob, {
        output: { format: 'image/png' },
        progress: (key, cur, total) => onProgress(key.startsWith('fetch') ? 'download' : 'compute', total ? cur / total : 0),
      });
      const oi = await loadImage(URL.createObjectURL(out));
      c.getContext('2d').drawImage(oi, 0, 0, c.width, c.height);
      return canvasBlob(trim ? trimAlpha(c) : c, 'image/webp', 0.92);
    } catch (e) {
      console.warn('KI-Freistellen nicht verfügbar, nutze einfache Methode', e);
      c.getContext('2d').drawImage(img, 0, 0);
      const simple = cutOut(c);
      if (simple === c) throw new Error('Hintergrund nicht erkannt');
      return canvasBlob(trim ? simple : c, 'image/webp', 0.92); // cutOut verändert c selbst und liefert nur eine zugeschnittene Kopie
    }
  } finally {
    URL.revokeObjectURL(src);
  }
}

let upTarget = 'closet'; // 'closet' oder 'wish': wohin die aktuell hochgeladenen Fotos kommen
const upColl = () => (upTarget === 'wish' ? { store: 'wishlist', list: wishlist } : { store: 'items', list: items });
const renderLists = () => { renderCloset(); renderWishlist(); };

async function addFiles(files, target = 'closet') {
  const imgs = [...files].filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) return;
  if (!upCur) upTarget = target;
  upQueue.push(...imgs);
  upTotal += imgs.length;
  if (!upCur) nextUpload();
}
const nameFromFile = (f) => f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 60) || 'Neues Teil';

async function nextUpload() {
  stopDraw();
  activeCtx = ctxUp;
  const f = upQueue.shift();
  if (upCur && upCur.url) URL.revokeObjectURL(upCur.url);
  if (!f) {
    upCur = null; upTotal = upDone = 0;
    if (upDlg.open) upDlg.close();
    renderLists();
    if (upAdded) toast(upAdded === 1 ? 'Teil hinzugefügt' : upAdded + ' Teile hinzugefügt');
    leaveAddPage();
    upAdded = 0;
    return;
  }
  try {
    const orig = await shrink(f);
    upCur = { file: f, orig, src: orig, cut: null, useCut: false, busy: false, url: null, angle: 0 };
    $('upAngle').value = 0;
    $('upName').value = nameFromFile(f);
    $('upCategory').value = (upTarget === 'wish' ? $('wishUploadCategory') : $('uploadCategory')).value;
    $('upWish').hidden = upTarget !== 'wish';
    $('upItem').hidden = upTarget === 'wish';
    $('upBrand').value = ''; $('upSize').value = ''; $('upCond').value = ''; $('upColor').value = '';
    $('upNote').value = '';
    $('upLink').value = '';
    upDone++;
    refreshUpload();
    if (!upDlg.open) upDlg.showModal();
  } catch (e) {
    console.error(e);
    toast('Konnte ' + f.name + ' nicht laden');
    upCur = upCur && upCur.url ? null : upCur;
    nextUpload();
  }
}
// Dreht ein Bild um beliebige Grad; die Leinwand wächst mit. Zugeschnitten wird erst beim Speichern (trim), damit
// beim Bearbeiten Original und Bearbeitung dieselbe Größe behalten und sich Gelöschtes zurückholen lässt.
async function rotateBlob(blob, deg, trim = false) {
  if (!deg) return blob;
  const src = URL.createObjectURL(blob);
  try {
    const img = await loadImage(src);
    const r = deg * Math.PI / 180, cos = Math.abs(Math.cos(r)), sin = Math.abs(Math.sin(r));
    const c = document.createElement('canvas');
    c.width = Math.ceil(img.naturalWidth * cos + img.naturalHeight * sin);
    c.height = Math.ceil(img.naturalWidth * sin + img.naturalHeight * cos);
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(r);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    return await canvasBlob(trim ? trimAlpha(c) : c, 'image/webp', 0.92);
  } finally {
    URL.revokeObjectURL(src);
  }
}
const wrapAngle = (a) => ((a + 180) % 360 + 360) % 360 - 180;

// Die Bildwerkzeuge (Drehen, Einzeichnen, Radierer, Hintergrund entfernen) gibt es im Upload-Dialog und beim Bearbeiten eines Teils.
// Es ist immer nur ein Dialog offen; `activeCtx` sagt, welcher: seine Elemente und sein Bildzustand werden benutzt.
const ctxUp = {
  cur: () => upCur, refresh: () => refreshUpload(),
  el: { preview: $('upPreview'), draw: $('upDraw'), erase: $('upErase'), undo: $('upUndo'), brush: $('upBrush'), brushRow: $('upBrushRow'), hint: $('upDrawHint'), remove: $('upRemove'), angle: $('upAngle') },
};
let itCur = null;
const ctxIt = {
  cur: () => itCur, refresh: () => { renderTools(itCur); $('itemSave').disabled = !!itCur && (itCur.busy || itCur.queue > 0); },
  el: { preview: $('itemPreview'), draw: $('itDraw'), erase: $('itErase'), undo: $('itUndo'), brush: $('itBrush'), brushRow: $('itBrushRow'), hint: $('itDrawHint'), remove: $('itRemove'), angle: $('itAngle') },
};
let activeCtx = ctxUp;
const cur = () => activeCtx.cur();
const el = () => activeCtx.el;
const bindTool = (name, fn) => [ctxUp, ctxIt].forEach((c) => c.el[name].addEventListener('click', fn));

async function updatePreview(u) {
  const seq = u.seq = (u.seq || 0) + 1;
  const blob = await rotateBlob(u.useCut ? u.cut : u.orig, u.angle || 0);
  if (seq !== u.seq || cur() !== u) return;
  u.shown = blob; // genau das, was die Vorschau gerade zeigt (gedreht, ggf. freigestellt)
  if (u.url) URL.revokeObjectURL(u.url);
  u.url = URL.createObjectURL(blob);
  el().preview.src = u.url;
}
function setAngle(a) {
  const u = cur();
  if (!u || u.busy) return;
  stopDraw();
  u.angle = a;
  el().angle.value = a;
  updatePreview(u);
}
[ctxUp, ctxIt].forEach((c, i) => {
  const p = i ? 'it' : 'up';
  $(p + 'RotL').onclick = () => setAngle(wrapAngle((cur().angle || 0) - 90));
  $(p + 'RotR').onclick = () => setAngle(wrapAngle((cur().angle || 0) + 90));
  c.el.angle.oninput = (e) => setAngle(+e.target.value);
});

// Zoom und Verschieben direkt im Foto: Handy mit zwei Fingern (zoomen und schieben), PC mit Mausrad (zoomen) und gedrückter Maus (schieben).
// Ist Einzeichnen oder Radierer an, malt ein Finger bzw. die linke Maustaste; dann schiebt man mit zwei Fingern, mittlerer/rechter Maustaste oder Leertaste + Ziehen.
let zoomNow = 1;
function setZoom(z, cx, cy) {
  z = Math.max(1, Math.min(5, z));
  const wrap = el().preview.parentElement; // .up-zoom
  const box = wrap.parentElement;          // .up-preview (scrollt)
  const br = box.getBoundingClientRect();
  const px = cx == null ? br.left + br.width / 2 : cx, py = cy == null ? br.top + br.height / 2 : cy;
  const w0 = box.scrollWidth, h0 = box.scrollHeight;
  const fx = box.scrollLeft + px - br.left, fy = box.scrollTop + py - br.top; // Punkt unter dem Finger bzw. Zeiger
  wrap.style.setProperty('--z', z);
  zoomNow = z;
  const w1 = box.scrollWidth, h1 = box.scrollHeight;
  box.scrollLeft = fx * (w0 ? w1 / w0 : 1) - (px - br.left); // der Punkt bleibt, wo er war
  box.scrollTop = fy * (h0 ? h1 / h0 : 1) - (py - br.top);
  if (drawCanvas) { // Zeichenfläche folgt der neuen Größe
    const r = wrap.getBoundingClientRect();
    drawCanvas.width = r.width; drawCanvas.height = r.height;
  }
}
let spaceDown = false;
addEventListener('keydown', (e) => { if (e.code === 'Space' && !/INPUT|TEXTAREA|BUTTON|SELECT/.test((e.target || {}).tagName || '') && drawCanvas) { spaceDown = true; e.preventDefault(); } });
addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });
[ctxUp, ctxIt].forEach((c) => {
  const box = c.el.preview.parentElement.parentElement; // .up-preview
  const pts = new Map();
  let last = null, pan = null, gesturing = false;
  const mid = () => { const p = [...pts.values()]; return { x: p.reduce((t, q) => t + q.x, 0) / p.length, y: p.reduce((t, q) => t + q.y, 0) / p.length, d: p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0 }; };
  const mine = () => activeCtx === c;
  box.addEventListener('wheel', (e) => { if (!mine()) return; e.preventDefault(); setZoom(zoomNow * Math.exp(-e.deltaY / 300), e.clientX, e.clientY); }, { passive: false });
  box.addEventListener('contextmenu', (e) => { if (drawCanvas) e.preventDefault(); });
  box.addEventListener('pointerdown', (e) => {
    if (!mine()) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const tool = !!drawCanvas;
    const mousePan = e.pointerType === 'mouse' && (e.button !== 0 || spaceDown || !tool);
    if (pts.size > 1 && e.pointerType !== 'mouse') {
      gesturing = true; // zweiter Finger: nicht zeichnen, sondern zoomen und schieben
      if (drawCanvas) drawCanvas.dispatchEvent(new PointerEvent('pointercancel', { pointerId: [...pts.keys()][0] }));
      last = mid(); e.stopPropagation(); e.preventDefault(); return;
    }
    if (mousePan || (!tool && e.pointerType !== 'mouse')) { // ohne Werkzeug schiebt auch ein Finger
      pan = { id: e.pointerId, x: e.clientX, y: e.clientY, sl: box.scrollLeft, st: box.scrollTop };
      box.setPointerCapture(e.pointerId);
      box.classList.add('grabbing');
      e.stopPropagation(); e.preventDefault();
    }
  }, true);
  box.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesturing && pts.size > 1) {
      const m = mid();
      box.scrollLeft -= m.x - last.x; box.scrollTop -= m.y - last.y;
      if (last.d && m.d) setZoom(zoomNow * m.d / last.d, m.x, m.y);
      last = m; e.stopPropagation(); e.preventDefault(); return;
    }
    if (gesturing) { e.stopPropagation(); return; }
    if (pan && pan.id === e.pointerId) {
      box.scrollLeft = pan.sl - (e.clientX - pan.x); box.scrollTop = pan.st - (e.clientY - pan.y);
      e.stopPropagation(); e.preventDefault();
    }
  }, true);
  const up = (e) => {
    const was = pts.delete(e.pointerId);
    if (gesturing) { e.stopPropagation(); if (!pts.size) gesturing = false; else last = mid(); }
    if (pan && pan.id === e.pointerId) { pan = null; box.classList.remove('grabbing'); e.stopPropagation(); }
    return was;
  };
  box.addEventListener('pointerup', up, true);
  box.addEventListener('pointercancel', (e) => { if (gesturing && e.isTrusted === false) return; up(e); }, true);
});

/* Bereich einzeichnen: grob um das Teil malen, alles außerhalb wird transparent und abgeschnitten */
let drawCanvas = null;
function stopDraw() {
  if (drawCanvas) { drawCanvas.remove(); drawCanvas = null; }
  el().draw.classList.remove('on');
  el().draw.textContent = 'Bereich einzeichnen';
  el().erase.classList.remove('on');
  el().erase.textContent = 'Radierer';
  el().brushRow.hidden = true;
  el().hint.textContent = 'Zeichne mit dem Finger grob um das Teil. Alles außerhalb wird entfernt. Zoomen: zwei Finger oder Mausrad.';
  el().hint.hidden = true;
  setZoom(1);
  el().preview.closest('dialog').classList.remove('tooling');
}
// Abgebildeter Bereich des Fotos innerhalb des Elements (object-fit: contain)
function containedRect(img, box) {
  const r = img.getBoundingClientRect();
  const s = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
  const w = img.naturalWidth * s, h = img.naturalHeight * s;
  return { x: r.left - box.left + (r.width - w) / 2, y: r.top - box.top + (r.height - h) / 2, w, h, s };
}
async function cropToPath(blob, pts, area) {
  const src = URL.createObjectURL(blob);
  try {
    const img = await loadImage(src);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = (p.x - area.x) / area.s, y = (p.y - area.y) / area.s;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, 0, 0);
    return await canvasBlob(c, 'image/webp', 0.92); // gleiche Größe wie vorher, außerhalb der Linie transparent
  } finally {
    URL.revokeObjectURL(src);
  }
}
bindTool('draw', async () => {
  const u = cur();
  if (!u || u.busy) return;
  if (drawCanvas) return stopDraw();
  if (u.pendingBox) { await ensureFull(u); activeCtx.refresh(); }
  const box = el().preview.parentElement;
  const cv = document.createElement('canvas');
  const br = box.getBoundingClientRect();
  cv.width = br.width; cv.height = br.height;
  cv.className = 'up-draw';
  box.appendChild(cv);
  drawCanvas = cv;
  el().draw.classList.add('on');
  el().draw.textContent = 'Einzeichnen abbrechen';
  el().hint.hidden = false;
  el().preview.closest('dialog').classList.add('tooling'); // Foto bleibt oben stehen, während man die Werkzeuge darunter benutzt
  const ctx = cv.getContext('2d');
  let pts = [];
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.onpointerdown = (e) => {
    e.preventDefault();
    pts = [pos(e)];
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* Zeiger schon weg: dann bricht die Linie einfach ab */ }
  };
  cv.onpointermove = (e) => {
    if (!pts.length) return;
    const p = pos(e);
    const last = pts[pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
    pts.push(p);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = '#e60023';
    ctx.fillStyle = 'rgba(230, 0, 35, .12)';
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath(); ctx.fill(); ctx.stroke();
  };
  cv.onpointerup = async (e) => {
    if (pts.length < 8) { pts = []; ctx.clearRect(0, 0, cv.width, cv.height); return toast('Zeichne einmal rund um das Teil'); }
    const drawn = pts; pts = [];
    u.busy = true; activeCtx.refresh();
    try {
      const area = containedRect(el().preview, cv.getBoundingClientRect());
      const out = await cropToPath(u.shown || u.orig, drawn, area);
      (u.history = u.history || []).push({ orig: u.orig, cut: u.cut, useCut: u.useCut, angle: u.angle, erased: u.erased, src: u.src });
      if (u.angle) u.src = await rotateBlob(u.src, u.angle); // Ausgangsfoto bekommt dieselbe Drehung, damit Zurückholen passt
      u.orig = out; u.cut = null; u.useCut = false; u.angle = 0;
      el().angle.value = 0;
    } catch (ex) {
      console.error(ex);
      toast('Der Bereich konnte nicht übernommen werden');
    }
    u.busy = false;
    stopDraw();
    if (cur() === u) activeCtx.refresh();
  };
  cv.onpointercancel = () => { pts = []; ctx.clearRect(0, 0, cv.width, cv.height); };
});
// Fertiges Bild für das Speichern: gedreht und von leeren Rändern befreit. Gibt außerdem Ausgangsfoto und Lage des Zuschnitts
// zurück, damit sich später (beim Bearbeiten) Hintergrund und Weggeschnittenes zurückholen lässt.
async function trimBlobBox(blob) {
  const src = URL.createObjectURL(blob);
  try {
    const img = await loadImage(src);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    const { x, y, canvas } = trimAlphaBox(c);
    return { blob: await canvasBlob(canvas, 'image/webp', 0.92), x, y };
  } finally {
    URL.revokeObjectURL(src);
  }
}
// Schon gespeichertes Bild noch einmal sauber zuschneiden; null, wenn sich nichts ändert
async function retrimBlob(blob) {
  const src = URL.createObjectURL(blob);
  try {
    const img = await loadImage(src);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    const t = trimAlphaBox(c);
    if (t.canvas.width >= c.width * 0.98 && t.canvas.height >= c.height * 0.98) return null;
    return { blob: await canvasBlob(t.canvas, 'image/webp', 0.92), x: t.x, y: t.y };
  } finally {
    URL.revokeObjectURL(src);
  }
}
const upEdited = (u) => !!((u.history && u.history.length) || u.angle || u.useCut || u.erased || u.replaced);
async function upResult(u) {
  if (!upEdited(u)) return { blob: u.useCut ? u.cut : u.orig };
  await ensureFull(u);
  const b = await rotateBlob(u.useCut ? u.cut : u.orig, u.angle || 0);
  const t = await trimBlobBox(b);
  const res = { blob: t.blob };
  if (u.erased || u.useCut || (u.history && u.history.length) || u.hadSource) {
    res.source = u.angle ? await rotateBlob(u.src, u.angle) : u.src;
    res.srcBox = { x: t.x, y: t.y };
  }
  return res;
}
// Ein gespeichertes, zugeschnittenes Teil wieder auf die Größe des Ausgangsfotos bringen, bevor man damit arbeitet
async function ensureFull(u) {
  if (!u.pendingBox) return;
  const box = u.pendingBox;
  u.pendingBox = null;
  const [a, b] = await Promise.all([blobToImage(u.orig), blobToImage(u.src)]);
  const c = document.createElement('canvas');
  c.width = Math.max(b.naturalWidth, box.x + a.naturalWidth);
  c.height = Math.max(b.naturalHeight, box.y + a.naturalHeight);
  c.getContext('2d').drawImage(a, box.x, box.y);
  u.orig = await canvasBlob(c, 'image/png');
  u.cut = null; u.useCut = false;
  u.shown = null; // Vorschau wird gleich neu gerechnet
  u.hadSource = true;
}
async function blobToImage(blob) {
  const url = URL.createObjectURL(blob);
  try { return await loadImage(url); } finally { URL.revokeObjectURL(url); }
}
// Einen Pinselstrich in das Foto radieren (verlustfrei, damit mehrfaches Radieren die Qualität nicht mindert)
async function eraseStroke(blob, pts, area, width, restoreFrom) {
  const src = URL.createObjectURL(blob);
  try {
    const img = await loadImage(src);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const at = pts.map((p) => ({ x: (p.x - area.x) / area.s, y: (p.y - area.y) / area.s }));
    // Maske des Strichs ohne weiche Kante: Löschen und Zurückholen treffen so genau dieselben Pixel.
    // Zurückholen nimmt auch halb getroffene Randpixel mit, damit nach dem Zurückholen kein Rand stehen bleibt.
    const m = document.createElement('canvas');
    m.width = c.width; m.height = c.height;
    const mx = m.getContext('2d');
    mx.lineWidth = width; mx.lineCap = 'round'; mx.lineJoin = 'round';
    mx.fillStyle = mx.strokeStyle = '#000';
    mx.beginPath();
    at.forEach((p, i) => (i ? mx.lineTo(p.x, p.y) : mx.moveTo(p.x, p.y)));
    if (at.length === 1) { mx.arc(at[0].x, at[0].y, width / 2, 0, Math.PI * 2); mx.fill(); } else mx.stroke();
    const xs = at.map((p) => p.x), ys = at.map((p) => p.y);
    const x0 = Math.max(0, Math.floor(Math.min(...xs) - width)), y0 = Math.max(0, Math.floor(Math.min(...ys) - width));
    const x1 = Math.min(m.width, Math.ceil(Math.max(...xs) + width)), y1 = Math.min(m.height, Math.ceil(Math.max(...ys) + width));
    if (x1 > x0 && y1 > y0) {
      const md = mx.getImageData(x0, y0, x1 - x0, y1 - y0);
      const limit = restoreFrom ? 0 : 127;
      for (let i = 3; i < md.data.length; i += 4) md.data[i] = md.data[i] > limit ? 255 : 0;
      mx.putImageData(md, x0, y0);
    }
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(m, 0, 0); // Strich: Pixel löschen
    if (restoreFrom) {
      // Zurückholen: an der Stelle des Strichs die Pixel aus dem Zustand vor dem Radieren wieder einsetzen
      const bsrc = URL.createObjectURL(restoreFrom);
      try {
        const bimg = await loadImage(bsrc);
        const layer = document.createElement('canvas');
        layer.width = c.width; layer.height = c.height;
        const lx = layer.getContext('2d');
        lx.drawImage(bimg, 0, 0, c.width, c.height);
        lx.globalCompositeOperation = 'destination-in';
        lx.drawImage(m, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(layer, 0, 0);
      } finally {
        URL.revokeObjectURL(bsrc);
      }
    }
    return await canvasBlob(c, 'image/png');
  } finally {
    URL.revokeObjectURL(src);
  }
}
// Radierer: „Löschen“ macht Stellen transparent, „Zurückholen“ malt Gelöschtes aus dem Zustand vor dem Radieren wieder ein
let eraseMode = 'erase';
document.querySelectorAll('.up-mode .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    eraseMode = chip.dataset.mode;
    document.querySelectorAll('.up-mode .chip').forEach((c) => c.classList.toggle('active', c.dataset.mode === eraseMode));
  });
});
bindTool('erase', async () => {
  const u = cur();
  if (!u || u.busy) return;
  const wasOn = el().erase.classList.contains('on');
  stopDraw();
  if (wasOn) return;
  if (u.pendingBox) { await ensureFull(u); activeCtx.refresh(); }
  const box = el().preview.parentElement;
  const cv = document.createElement('canvas');
  const br = box.getBoundingClientRect();
  cv.width = br.width; cv.height = br.height;
  cv.className = 'up-draw';
  box.appendChild(cv);
  drawCanvas = cv;
  el().erase.classList.add('on');
  el().erase.textContent = 'Fertig';
  el().brushRow.hidden = false;
  el().hint.textContent = 'Male über Stellen, die weg sollen. Mit „Zurückholen“ malst du Gelöschtes wieder ein, „Zurück“ nimmt den letzten Strich zurück. Zoomen: zwei Finger oder Mausrad.';
  el().hint.hidden = false;
  el().preview.closest('dialog').classList.add('tooling'); // Foto bleibt oben stehen, während man die Werkzeuge darunter benutzt
  const ctx = cv.getContext('2d');
  let pts = [];
  const pending = []; // Striche, die schon gemalt, aber noch nicht eingerechnet sind: sie bleiben sichtbar
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const line = (list, width, mode) => {
    ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = ctx.fillStyle = mode === 'restore' ? 'rgba(26, 158, 92, .5)' : 'rgba(230, 0, 35, .45)';
    ctx.beginPath();
    list.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    if (list.length === 1) { ctx.arc(list[0].x, list[0].y, width / 2, 0, Math.PI * 2); ctx.fill(); } else ctx.stroke();
  };
  const paint = () => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    pending.forEach((st) => line(st.pts, st.brush, st.mode));
    if (pts.length) line(pts, +el().brush.value, eraseMode);
  };
  // Einen Strich ins Bild rechnen. Die Striche laufen nacheinander, es geht keiner verloren.
  const apply = async (st) => {
    try {
      const now = u.shown || u.orig;
      // Ausgangsfoto in derselben Drehung wie das Bild: daraus wird alles zurückgeholt, auch Hintergrund und Weggeschnittenes
      const srcNow = u.angle ? await rotateBlob(u.src, u.angle) : u.src;
      {
        const out = await eraseStroke(now, st.pts, st.area, st.brush / st.area.s, st.mode === 'restore' ? srcNow : null);
        (u.history = u.history || []).push({ orig: u.orig, cut: u.cut, useCut: u.useCut, angle: u.angle, erased: u.erased, src: u.src });
        u.src = srcNow;
        u.orig = out; u.cut = null; u.useCut = false; u.angle = 0; u.erased = true;
        u.shown = out; // angle ist 0: die Vorschau zeigt genau dieses Bild, der nächste Strich kann sofort darauf aufbauen
        el().angle.value = 0;
      }
    } catch (ex) {
      console.error(ex);
      toast('Das Radieren hat nicht geklappt');
    }
    pending.splice(pending.indexOf(st), 1);
    u.queue--;
    paint();
    if (cur() === u) activeCtx.refresh();
  };
  cv.onpointerdown = (e) => {
    e.preventDefault();
    pts = [pos(e)];
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* Zeiger schon weg: dann bricht der Strich einfach ab */ }
    paint();
  };
  cv.onpointermove = (e) => {
    if (!pts.length) return;
    pts.push(pos(e));
    paint();
  };
  cv.onpointerup = () => {
    if (!pts.length) return;
    const st = { pts, brush: +el().brush.value, mode: eraseMode, area: containedRect(el().preview, cv.getBoundingClientRect()) };
    pts = [];
    pending.push(st);
    u.queue = (u.queue || 0) + 1;
    paint();
    activeCtx.refresh();
    u.chain = (u.chain || Promise.resolve()).then(() => apply(st));
  };
  cv.onpointercancel = () => { pts = []; paint(); };
});
bindTool('undo', () => {
  const u = cur();
  if (!u || u.busy || u.queue > 0 || !u.history || !u.history.length) return;
  if (!el().erase.classList.contains('on')) stopDraw(); // beim Radieren darf es direkt weitergehen
  Object.assign(u, u.history.pop());
  el().angle.value = u.angle || 0;
  activeCtx.refresh();
});

// Gemeinsamer Teil: Vorschau und Zustand der Werkzeug-Knöpfe
function renderTools(u) {
  updatePreview(u);
  const e = el();
  const locked = u.busy || u.queue > 0; // beim Einrechnen von Strichen nichts anderes anfassen
  e.remove.disabled = locked;
  e.draw.disabled = locked;
  e.erase.disabled = locked;
  e.undo.hidden = !(u.history && u.history.length);
  e.undo.disabled = locked;
  e.remove.textContent = u.busy ? (u.status || 'Hintergrund wird entfernt …') : u.useCut ? 'Original anzeigen' : 'Hintergrund entfernen';
  e.preview.parentElement.classList.toggle('busy', u.busy);
}
function refreshUpload() {
  const u = cur();
  renderTools(u);
  $('upProgress').textContent = upTotal > 1 ? `Foto ${upDone} von ${upTotal}` : '';
  const locked = u.busy || u.queue > 0;
  $('upAdd').disabled = locked;
  $('upSkip').disabled = locked;
  $('upAll').disabled = locked;
  $('upBatch').hidden = upQueue.length === 0 || upTarget === 'wish'; // Links sind pro Teil, deshalb kein Sammel-Upload
  if (!u.busy) $('upAll').textContent = `Alle ${upQueue.length + 1} Fotos hinzufügen`;
}
bindTool('remove', async () => {
  const u = cur();
  if (u.busy) return;
  stopDraw();
  await ensureFull(u);
  if (u.cut) { u.useCut = !u.useCut; return activeCtx.refresh(); }
  u.busy = true; activeCtx.refresh();
  try {
    u.status = 'KI-Modell wird geladen … (einmalig, kann etwas dauern)';
    u.cut = await removeBackground(u.orig, (phase, frac) => {
      u.status = phase === 'download'
        ? `KI-Modell wird geladen … ${Math.round(frac * 100)} % (einmalig)`
        : 'Hintergrund wird entfernt …';
      if (cur() === u) el().remove.textContent = u.status;
    }, false); // ohne Zuschnitt: bleibt deckungsgleich mit dem Ausgangsfoto
    u.useCut = true;
  } catch (e) {
    console.error(e);
    toast('Hintergrund konnte nicht entfernt werden');
  }
  u.busy = false;
  if (cur() === u) activeCtx.refresh();
});
// Marke, Größe und Zustand sind bei Teilen Pflicht; Sichtbarkeit ist vorausgewählt „Öffentlich“
function upItemDetails() {
  if (upTarget === 'wish') return {};
  const need = [['upBrand', 'die Marke'], ['upSize', 'die Größe'], ['upCond', 'den Zustand']].find(([id]) => !$(id).value.trim());
  if (need) { toast('Bitte gib ' + need[1] + ' an'); $(need[0]).focus(); return null; }
  return cleanDetails({ brand: $('upBrand').value, size: $('upSize').value, cond: $('upCond').value, color: $('upColor').value, vis: $('upVis').value }, 'items');
}
$('upAdd').addEventListener('click', async () => {
  const u = upCur;
  const coll = upColl();
  const det = upItemDetails();
  if (!det) return;
  const rawLink = $('upLink').value.trim();
  const link = upTarget === 'wish' ? cleanLink(rawLink) : '';
  if (rawLink && upTarget === 'wish' && !link) return toast('Der Link sieht nicht richtig aus');
  const res = await upResult(u);
  const rec = {
    id: uid(), name: $('upName').value.trim() || 'Neues Teil', category: $('upCategory').value,
    blob: res.blob, created: Date.now(),
  };
  if (res.source) { rec.source = res.source; rec.srcBox = res.srcBox; }
  const note = $('upNote').value.trim().slice(0, 120);
  if (upTarget === 'wish' && note) rec.note = note;
  if (link) rec.link = link;
  Object.assign(rec, det);
  if (upTarget !== 'wish' && !rec.color) applyColor(rec, await detectColor(res.blob)); // von Hand gewählte Farbe hat Vorrang
  await dbPut(coll.store, rec);
  coll.list.push(rec);
  upAdded++;
  nextUpload();
});
$('upSkip').addEventListener('click', () => nextUpload());

// Alle übrigen Fotos auf einmal mit der gewählten Kategorie hinzufügen (optional mit Hintergrund-Entfernen)
$('upAll').addEventListener('click', async () => {
  const u = upCur;
  if (u.busy) return;
  const det = upItemDetails();
  if (!det) return;
  const category = $('upCategory').value;
  const bgAll = $('upAllBg').checked;
  const jobs = [
    { name: $('upName').value.trim() || nameFromFile(u.file), res: await upResult(u), cut: u.useCut },
    ...upQueue.map((file) => ({ file, name: nameFromFile(file) })),
  ];
  upQueue = [];
  u.busy = true;
  refreshUpload();
  let failed = 0;
  for (const [i, j] of jobs.entries()) {
    $('upAll').textContent = `Wird hinzugefügt … ${i + 1}/${jobs.length}`;
    try {
      let blob = j.res ? j.res.blob : await shrink(j.file);
      if (bgAll && !j.cut) {
        try { blob = await removeBackground(blob); } catch (e) { failed++; } // bei Fehler: Original behalten
      }
      const rec = { id: uid(), name: j.name, category, blob, created: Date.now(), ...det };
      if (upTarget !== 'wish' && !rec.color) applyColor(rec, await detectColor(blob));
      if (j.res && j.res.source) { rec.source = j.res.source; rec.srcBox = j.res.srcBox; }
      const coll = upColl();
      await dbPut(coll.store, rec);
      coll.list.push(rec);
      upAdded++;
    } catch (e) {
      console.error(e);
      toast('Ein Foto konnte nicht geladen werden');
    }
  }
  u.busy = false;
  await nextUpload(); // Warteschlange ist leer: schließt den Dialog und zeigt die Meldung
  if (failed) toast(`Bei ${failed} Foto(s) konnte der Hintergrund nicht entfernt werden`);
});
upDlg.addEventListener('cancel', (e) => { if (upCur && upCur.busy) e.preventDefault(); });
upDlg.addEventListener('close', () => { // Esc: Rest der Warteschlange verwerfen
  if (!upCur) return;
  URL.revokeObjectURL(upCur.url);
  upCur = null; upQueue = []; upTotal = upDone = 0;
  renderLists();
  if (upAdded) toast(upAdded === 1 ? 'Teil hinzugefügt' : upAdded + ' Teile hinzugefügt');
  leaveAddPage();
  upAdded = 0;
});
$('fileInput').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
const dz = $('dropzone');
['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
dz.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));
$('wishFileInput').addEventListener('change', (e) => { addFiles(e.target.files, 'wish'); e.target.value = ''; });
const wdz = $('wishDrop');
['dragenter', 'dragover'].forEach((ev) => wdz.addEventListener(ev, (e) => { e.preventDefault(); wdz.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => wdz.addEventListener(ev, (e) => { e.preventDefault(); wdz.classList.remove('over'); }));
wdz.addEventListener('drop', (e) => addFiles(e.dataTransfer.files, 'wish'));
