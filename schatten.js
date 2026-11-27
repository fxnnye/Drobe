// Schatten unter freigestellten Teilen (Teil der App, Reihenfolge siehe index.html)
// Gespeichert wird davon nichts: Der Schatten entsteht beim Anzeigen aus der Durchsichtigkeit des Fotos.
// Ausprobieren und einstellen: tests/schatten.html
/* ---------- Alle Werte an einer Stelle ---------- */
// Deckkraft 0–1. Höhe, Versatz und Weichheit relativ zur längsten Seite des Fotos.
// Das Licht kommt überall von oben, leicht von vorne: Schatten werden nur nach unten versetzt.
// Wie kräftig alle zusammen wirken, regelt zusätzlich --shadow-strength in style.css (z. B. je Design).
const SHADOW = {
  color: [38, 28, 20], // sehr dunkles, warmes Braun
  res: 128,            // Rechengröße (längste Seite): der Schatten ist weich, mehr braucht er nicht
  margin: 0.14,        // Platz rund ums Foto, in dem der Schatten auslaufen kann
  reach: 0.07,         // Kontaktschatten: so weit (relativ zur Fotohöhe) über der Unterkante gilt noch als „steht auf“
  // contact: schmal unter der Unterkante. ground: Form gestaucht (squash = Anteil der Höhe); level 0 = folgt der Unterkante,
  // 1 = liegt gerade auf Höhe des tiefsten Punkts. around: ganze Form, leicht nach unten
  standing: {
    contact: { opacity: 0.34, height: 0.016, blur: 0.009 },
    ground: { opacity: 0.14, squash: 0.2, level: 0.35, offset: 0.012, blur: 0.027 },
    around: { opacity: 0.05, offset: 0.012, blur: 0.03 },
  },
  flat: {
    contact: { opacity: 0.10, height: 0.012, blur: 0.012 },
    ground: { opacity: 0.06, squash: 0.2, level: 0.5, offset: 0.015, blur: 0.036 },
    around: { opacity: 0.17, offset: 0.018, blur: 0.028 },
  },
  neutral: {
    contact: { opacity: 0.22, height: 0.014, blur: 0.01 },
    ground: { opacity: 0.10, squash: 0.2, level: 0.4, offset: 0.013, blur: 0.03 },
    around: { opacity: 0.11, offset: 0.015, blur: 0.029 },
  },
};
// Schuhe, Taschen und Caps stehen, Kleidung liegt flach; alles andere (und ohne Kategorie) bekommt den Mittelweg
const SHADOW_TYPES = { Schuhe: 'standing', Taschen: 'standing', Caps: 'standing', Jacken: 'flat', Pullover: 'flat', Shirts: 'flat', Hosen: 'flat' };
const shadowType = (category) => SHADOW_TYPES[category] || 'neutral';

/* ---------- Was für ein Foto ist das? ---------- */
function pixels(source, w, h, x = 0, y = 0, cw = w, ch = h) {
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, x, y, w, h);
  return ctx.getImageData(0, 0, cw, ch).data;
}
function isOpaque(source) { // das Foto ist nirgends durchsichtig
  const d = pixels(source, 48, 48);
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return false;
  return true;
}
// Alle vier Ecken reinweiß: der Hintergrund verschwindet beim Multiplizieren ohnehin in der Kachel
function whiteCorners(source) {
  const d = pixels(source, 48, 48);
  return [[0, 0], [44, 0], [0, 44], [44, 44]].every(([cx, cy]) => {
    let sum = 0;
    for (let y = cy; y < cy + 4; y++) for (let x = cx; x < cx + 4; x++) { const p = (y * 48 + x) * 4; sum += Math.min(d[p], d[p + 1], d[p + 2]); }
    return sum / 16 >= 250;
  });
}
// Durchsichtigkeit des Fotos in Rechengröße, mit Rand rundherum
function photoMask(source) {
  const sw = source.naturalWidth || source.width, sh = source.naturalHeight || source.height;
  const k = SHADOW.res / Math.max(sw, sh), iw = Math.max(1, Math.round(sw * k)), ih = Math.max(1, Math.round(sh * k));
  const mx = Math.round(iw * SHADOW.margin), my = Math.round(ih * SHADOW.margin), w = iw + 2 * mx, h = ih + 2 * my;
  const d = pixels(source, iw, ih, mx, my, w, h), a = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] / 255;
  return { a, w, h, iw, ih, mx, my };
}
// Freigestellt: rundherum ist wirklich etwas durchsichtig, und übrig bleibt nicht bloß ein (gedrehtes) Rechteck
function isCutOut(m) {
  let clear = 0, solid = 0;
  const edge = []; // je Zeile der erste und letzte sichtbare Punkt
  for (let y = m.my; y < m.my + m.ih; y++) {
    let first = -1, last = -1;
    for (let x = m.mx; x < m.mx + m.iw; x++) {
      const v = m.a[y * m.w + x];
      if (v < 0.08) clear++;
      if (v > 0.5) { solid++; if (first < 0) first = x; last = x; }
    }
    if (first >= 0) edge.push([first, y], [last + 1, y], [first, y + 1], [last + 1, y + 1]);
  }
  if (!solid || clear < m.iw * m.ih * 0.03) return false;
  let smallest = Infinity;
  for (let deg = 0; deg < 90; deg++) {
    const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, y] of edge) { const u = x * c + y * s, v = y * c - x * s; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
    smallest = Math.min(smallest, (u1 - u0) * (v1 - v0));
  }
  return solid / smallest < 0.95;
}

/* ---------- Schatten zeichnen ---------- */
// Weichzeichnen: dreimal gemittelt kommt einem Gauß-Verlauf nahe (Canvas-Filter gibt es nicht in jedem iPhone-Browser)
function boxPass(from, to, lines, length, step, jump, r) {
  const n = 2 * r + 1;
  for (let l = 0; l < lines; l++) {
    const start = l * jump;
    let sum = 0;
    for (let i = 0; i < Math.min(r, length); i++) sum += from[start + i * step];
    for (let i = 0; i < length; i++) {
      if (i + r < length) sum += from[start + (i + r) * step];
      if (i - r - 1 >= 0) sum -= from[start + (i - r - 1) * step];
      to[start + i * step] = sum / n;
    }
  }
}
function blur(a, w, h, sigma) {
  const r = Math.max(1, Math.round(sigma)), t = new Float32Array(a.length);
  for (let i = 0; i < 3; i++) { boxPass(a, t, h, w, 1, w, r); boxPass(t, a, w, h, w, 1, r); }
  return a;
}
// Liefert den Schatten als Bild und wie viel größer als das Foto er angezeigt werden muss
function renderShadow(m, type = 'neutral') {
  const { a, w, h, iw, ih } = m, p = SHADOW[type] || SHADOW.neutral, size = Math.max(iw, ih);
  const low = new Int32Array(w).fill(-1); // unterster sichtbarer Punkt je Spalte
  let bottom = 0;
  for (let x = 0; x < w; x++) for (let y = h - 1; y >= 0; y--) if (a[y * w + x] > 0.5) { low[x] = y; if (y > bottom) bottom = y; break; }
  const contact = new Float32Array(w * h), band = Math.max(1, Math.round(p.contact.height * size)), reach = Math.max(1, SHADOW.reach * ih);
  for (let x = 0; x < w; x++) { // nur was fast ganz unten ist, berührt den Boden: daraus ergibt sich die Breite
    const near = low[x] < 0 ? 0 : 1 - (bottom - low[x]) / reach;
    if (near <= 0) continue;
    for (let d = -1; d <= band; d++) { const y = low[x] + d; if (y >= 0 && y < h) contact[y * w + x] = near; }
  }
  const ground = new Float32Array(w * h), around = new Float32Array(w * h);
  const groundDown = p.ground.offset * size, aroundDown = Math.round(p.around.offset * size);
  for (let y = aroundDown; y < h; y++) for (let x = 0; x < w; x++) around[y * w + x] = a[(y - aroundDown) * w + x];
  // Gestaucht, Spalte für Spalte an der Unterkante verankert: so schwebt bei schräg stehenden Teilen kein Streifen darunter
  const spread = Math.max(1, Math.round(0.08 * iw));
  for (let x = 0; x < w; x++) {
    if (low[x] < 0) continue;
    let sum = 0, n = 0;
    for (let q = Math.max(0, x - spread); q <= Math.min(w - 1, x + spread); q++) if (low[q] >= 0) { sum += low[q]; n++; }
    const base = sum / n + (bottom - sum / n) * p.ground.level + groundDown;
    for (let y = 0; y < h; y++) {
      const from = Math.round(low[x] - (base - y) / p.ground.squash);
      if (from >= 0 && from <= low[x]) ground[y * w + x] = a[from * w + x];
    }
  }
  blur(contact, w, h, p.contact.blur * size);
  blur(ground, w, h, p.ground.blur * size);
  blur(around, w, h, p.around.blur * size);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'), out = ctx.createImageData(w, h);
  const [red, green, blue] = SHADOW.color;
  for (let i = 0; i < w * h; i++) {
    // Der schmale Kontaktstreifen verliert beim Weichzeichnen an Kraft, darum verstärkt
    const alpha = 1 - (1 - Math.min(1, contact[i] * 1.6) * p.contact.opacity) * (1 - ground[i] * p.ground.opacity) * (1 - around[i] * p.around.opacity);
    out.data[i * 4] = red; out.data[i * 4 + 1] = green; out.data[i * 4 + 2] = blue; out.data[i * 4 + 3] = Math.round(alpha * 255);
  }
  ctx.putImageData(out, 0, 0);
  return { url: c.toDataURL('image/png'), sx: w / iw, sy: h / ih };
}

/* ---------- In der App ---------- */
// Freigestellt: Schatten darunter (img.cut). Eigener, nicht weißer Hintergrund: füllt die Kachel (img.own-bg).
// Alles andere bleibt, wie es ist. Gerechnet wird einmal je Foto, nacheinander, damit das Scrollen flüssig bleibt.
const PHOTO_SPOTS = '.card .img, .item-photo, .pick, .msg-thumb';
const PHOTO_CACHE_MAX = 400;
const photoCache = new Map(); // Bildadresse|Art → Ergebnis
let photoTurn = Promise.resolve();
async function inspectPhoto(img, src, type) {
  let source = img, bitmap = null;
  if (/^https?:/.test(src)) { // fremde Adresse: nur über einen eigenen Abruf darf man die Punkte lesen
    const res = await fetch(src, { cache: 'force-cache' });
    if (!res.ok) throw new Error(res.status);
    source = bitmap = await createImageBitmap(await res.blob());
  }
  const turn = photoTurn.then(async () => {
    await new Promise((r) => setTimeout(r)); // Platz für Antippen und Scrollen
    if (!bitmap && img.src !== src) throw new Error('Foto gewechselt');
    if (isOpaque(source)) return { own: !whiteCorners(source) };
    if (!type) return {};
    const m = photoMask(source);
    return isCutOut(m) ? { shadow: renderShadow(m, type) } : {};
  });
  photoTurn = turn.catch(() => {});
  return turn.finally(() => bitmap && bitmap.close());
}
async function markPhoto(img) {
  const spot = img.closest(PHOTO_SPOTS);
  if (!spot || img.closest('.outfits, .feed-outfit, .add-card')) return;
  const src = img.src;
  const type = spot.matches('.msg-thumb') || img.closest('.outfit-items') ? null : shadowType(img.dataset.cat); // sehr kleine Bilder ohne Schatten
  const key = `${src}|${type}`;
  if (!photoCache.has(key)) {
    photoCache.set(key, inspectPhoto(img, src, type).catch(() => { photoCache.delete(key); return null; }));
    if (photoCache.size > PHOTO_CACHE_MAX) photoCache.delete(photoCache.keys().next().value);
  }
  const found = await photoCache.get(key);
  if (!found || img.src !== src) return;
  if (img.previousElementSibling?.classList.contains('cut-shadow')) img.previousElementSibling.remove();
  img.classList.toggle('own-bg', !!found.own);
  img.classList.toggle('cut', !!found.shadow);
  if (!found.shadow || !img.parentNode) return;
  const shade = document.createElement('span');
  shade.className = 'cut-shadow';
  shade.setAttribute('aria-hidden', 'true');
  shade.style.backgroundImage = `url(${found.shadow.url})`;
  shade.style.transform = `scale(${found.shadow.sx}, ${found.shadow.sy})`;
  img.before(shade);
}
