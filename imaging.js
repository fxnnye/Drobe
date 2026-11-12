// Bilder laden, Bild-Vektor (CLIP), Farbe aus dem freigestellten Bild (Teil der App, Reihenfolge siehe index.html)
/* ---------- Bilder ---------- */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
function canvasBlob(canvas, type, q) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, q));
}


/* ---------- Ähnliche Teile: Bild-Vektor (CLIP) im Browser berechnen ---------- */
const EMBED_LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/+esm';
const EMBED_MODEL = 'Xenova/clip-vit-base-patch32';
let embedder = null;
async function loadEmbedder() {
  if (!embedder) {
    embedder = (async () => {
      const T = await import(EMBED_LIB);
      const processor = await T.AutoProcessor.from_pretrained(EMBED_MODEL);
      const model = await T.CLIPVisionModelWithProjection.from_pretrained(EMBED_MODEL, { dtype: 'q8' });
      return { T, processor, model };
    })().catch((e) => { embedder = null; throw e; });
  }
  return embedder;
}
// Vektor (512 Zahlen, normiert) zu einem Teilbild; durchsichtiger Hintergrund wird weiß
async function embedBlob(blob) {
  const { T, processor, model } = await loadEmbedder();
  const url = URL.createObjectURL(blob);
  let img;
  try { img = await loadImage(url); } finally { URL.revokeObjectURL(url); }
  const c = document.createElement('canvas'); c.width = 224; c.height = 224;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 224, 224);
  const k = Math.min(224 / img.naturalWidth, 224 / img.naturalHeight);
  g.drawImage(img, (224 - img.naturalWidth * k) / 2, (224 - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
  const raw = await T.RawImage.fromBlob(await canvasBlob(c, 'image/jpeg', 0.92));
  const { image_embeds } = await model(await processor(raw));
  return Array.from(image_embeds.normalize().data, (v) => Math.round(v * 1e4) / 1e4);
}
// Kleidungsart automatisch erkennen (CLIP, ohne Training): Bild-Vektor gegen Textbeschreibungen je Kategorie vergleichen
const CLASS_PROMPTS = {
  Jacken: ['a photo of a jacket', 'a photo of a coat', 'a photo of a bomber jacket', 'a photo of a puffer jacket'],
  Pullover: ['a photo of a hoodie', 'a photo of a sweater', 'a photo of a sweatshirt', 'a photo of a knitted jumper'],
  Shirts: ['a photo of a t-shirt', 'a photo of a shirt', 'a photo of a polo shirt', 'a photo of a tank top'],
  Hosen: ['a photo of pants', 'a photo of jeans', 'a photo of trousers', 'a photo of shorts'],
  Schuhe: ['a photo of shoes', 'a photo of sneakers', 'a photo of boots', 'a photo of sandals'],
  Taschen: ['a photo of a bag', 'a photo of a backpack', 'a photo of a handbag', 'a photo of a shoulder bag'],
  Schmuck: ['a photo of jewelry', 'a photo of a necklace', 'a photo of a ring', 'a photo of a watch'],
  Caps: ['a photo of a cap', 'a photo of a beanie', 'a photo of a hat'],
  Gürtel: ['a photo of a belt', 'a photo of a leather belt'],
};
let textModel = null;
function loadTextModel() {
  if (!textModel) {
    textModel = (async () => {
      const { T } = await loadEmbedder();
      const tok = await T.AutoTokenizer.from_pretrained(EMBED_MODEL);
      const tm = await T.CLIPTextModelWithProjection.from_pretrained(EMBED_MODEL, { dtype: 'q8' });
      return { tok, tm };
    })().catch((e) => { textModel = null; throw e; });
  }
  return textModel;
}
const textVec = async (p) => {
  const { tok, tm } = await loadTextModel();
  const { text_embeds } = await tm(tok([p], { padding: true, truncation: true }));
  return Float32Array.from(text_embeds.normalize().data);
};
let textEmbs = null;
function loadTextEmbs() {
  if (!textEmbs) {
    textEmbs = (async () => {
      const { tok, tm } = await loadTextModel();
      const out = [];
      for (const [cat, ps] of Object.entries(CLASS_PROMPTS)) {
        for (const p of ps) {
          const { text_embeds } = await tm(tok([p], { padding: true, truncation: true }));
          out.push({ cat, v: text_embeds.normalize().data });
        }
      }
      return out;
    })().catch((e) => { textEmbs = null; throw e; });
  }
  return textEmbs;
}
// Liefert [Kategorie, Wahrscheinlichkeit] für das wahrscheinlichste Ergebnis
async function classifyBlob(blob) {
  const [emb, texts] = await Promise.all([embedBlob(blob), loadTextEmbs()]);
  const best = {};
  for (const t of texts) {
    let s = 0;
    for (let i = 0; i < emb.length; i++) s += emb[i] * t.v[i];
    best[t.cat] = Math.max(best[t.cat] ?? -9, s);
  }
  const cats = Object.keys(best), ex = cats.map((c) => Math.exp(100 * best[c])), z = ex.reduce((a, b) => a + b, 0);
  return cats.map((c, i) => [c, ex[i] / z]).sort((a, b) => b[1] - a[1])[0];
}
// Fotosuche: aus dem Foto auch Marke (Logo, Aufdruck, Schriftzug) und Farbe erkennen, nicht nur den Gesamteindruck
const COLOR_EN = { Schwarz: 'black', Weiß: 'white', Grau: 'gray', Beige: 'beige', Braun: 'brown', Rot: 'red', Orange: 'orange', Gelb: 'yellow', Grün: 'green', Blau: 'blue', Lila: 'purple', Rosa: 'pink' };
const dotv = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const softTop = (scores) => { const ex = scores.map((s) => Math.exp(100 * s)), z = ex.reduce((a, b) => a + b, 0); let k = 0; ex.forEach((e, i) => { if (e > ex[k]) k = i; }); return [k, ex[k] / z]; };
// Marken, die man am Logo oder Aufdruck erkennt (klein gehalten, damit die einmalige Berechnung schnell geht)
const LOGO_BRANDS = ['Nike', 'Adidas', 'Puma', 'New Balance', 'Reebok', 'Converse', 'Vans', 'Jordan', 'Under Armour', 'Champion', 'Lacoste', 'Fila', 'Kappa', 'Stüssy', 'Supreme', 'Palace', 'Carhartt', 'Patagonia', 'The North Face', 'Stone Island', 'Moncler', 'Ralph Lauren', 'Tommy Hilfiger', 'Calvin Klein', "Levi's", 'Gucci', 'Louis Vuitton', 'Balenciaga', 'Off-White', 'Essentials', 'Bape', 'Comme des Garçons', 'Burberry', 'Versace', 'Prada', 'Dior', 'Chanel', 'Diesel', 'Hugo Boss', 'Gap', 'Trapstar', 'Corteiz', 'Chrome Hearts', 'Kith', 'Obey', 'Thrasher', 'Hollister', 'Abercrombie & Fitch', 'Guess', 'Dickies', 'Columbia', 'Salomon', 'Asics', 'Timberland', 'Arc\'teryx'];
// Mehrere Texte in einem Durchgang (stapelweise, mit Pausen, damit die Seite nicht einfriert)
async function textVecs(prompts) {
  const { tok, tm } = await loadTextModel();
  const out = [];
  for (let i = 0; i < prompts.length; i += 8) {
    const { text_embeds } = await tm(tok(prompts.slice(i, i + 8), { padding: true, truncation: true }));
    const n = text_embeds.dims[0], d = text_embeds.dims[1], data = text_embeds.normalize().data;
    for (let r = 0; r < n; r++) out.push(Float32Array.from(data.slice(r * d, (r + 1) * d)));
    await new Promise((res) => setTimeout(res, 0));
  }
  return out;
}
let brandVecs = null;
function loadBrandVecs() {
  if (!brandVecs) {
    brandVecs = (async () => {
      const KEY = 'jawnz-brandvec-v2', names = LOGO_BRANDS;
      try {
        const c = JSON.parse(localStorage.getItem(KEY));
        if (c && c.n === names.join('|') && c.v.length === names.length) return names.map((b, i) => ({ b, v: Float32Array.from(c.v[i]) }));
      } catch (e) { /* neu berechnen */ }
      const vs = await textVecs(names.map((b) => `a photo of clothing with the ${b} logo`));
      const out = names.map((b, i) => ({ b, v: vs[i] }));
      try { localStorage.setItem(KEY, JSON.stringify({ n: names.join('|'), v: out.map((x) => Array.from(x.v, (n) => Math.round(n * 1e4) / 1e4)) })); } catch (e) { /* Speicher voll: egal */ }
      return out;
    })().catch((e) => { brandVecs = null; throw e; });
  }
  return brandVecs;
}
let colorVecs = null;
const loadColorVecs = () => colorVecs || (colorVecs = textVecs(Object.values(COLOR_EN).map((en) => `a ${en} piece of clothing`)).then((vs) => Object.keys(COLOR_EN).map((de, i) => ({ de, v: vs[i] }))).catch((e) => { colorVecs = null; throw e; }));
let plainVecs = null;
const loadPlainVecs = () => plainVecs || (plainVecs = textVecs(['a plain piece of clothing without any logo or print', 'a photo of clothing', 'a garment with a graphic print']).catch((e) => { plainVecs = null; throw e; }));
// Liefert { emb, brand, color }: Bild-Vektor plus – nur bei klarer Erkennung – Marke und Farbe
async function describePhoto(blob) {
  const emb = await embedBlob(blob);
  const out = { emb, brand: null, color: null };
  try {
    const [bv, pv, cv] = await Promise.all([loadBrandVecs(), loadPlainVecs(), loadColorVecs()]);
    const [k, p] = softTop([...bv.map((x) => dotv(emb, x.v)), ...pv.map((v) => dotv(emb, v))]);
    if (k < bv.length && p >= 0.5) out.brand = bv[k].b;
    const [ci, cp] = softTop(cv.map((x) => dotv(emb, x.v)));
    if (cp >= 0.45) out.color = cv[ci].de;
  } catch (e) { console.warn('Marken-/Farberkennung nicht möglich', e); }
  return out;
}
// Öffentliche Teile ohne Vektor nach und nach berechnen (im Hintergrund, einmalig pro Teil)
let embedBusy = false;
async function backfillEmbeddings() {
  if (embedBusy || !navigator.onLine || !Cloud.user()) return;
  const todo = items.filter((i) => !i.emb && i.blob && visOf(i) !== 'private');
  if (!todo.length) return;
  embedBusy = true;
  try {
    for (const it of todo) {
      it.emb = await embedBlob(it.blob);
      await dbPut('items', it);
    }
  } catch (e) { console.warn('Vektor-Berechnung nicht möglich', e); } finally { embedBusy = false; }
}
setTimeout(() => backfillEmbeddings(), 8000);

$('itSimilar').addEventListener('click', async () => {
  const it = state.editingItem, box = $('itSimilarBox'), btn = $('itSimilar');
  if (!it || !Cloud.user()) { box.replaceChildren(Object.assign(document.createElement('p'), { className: 'muted small', textContent: 'Dafür musst du angemeldet sein.' })); return; }
  btn.disabled = true;
  const note = (t) => box.replaceChildren(Object.assign(document.createElement('p'), { className: 'muted small', textContent: t }));
  note('Suche ähnliche Teile … (beim ersten Mal wird ein kleines Bildmodell geladen)');
  try {
    const emb = it.emb || (it.emb = await embedBlob(it.blob));
    await dbPut('items', it);
    const { data, error } = await Cloud.client().rpc('similar_public_items', { p_emb: '[' + emb.join(',') + ']' });
    if (error) throw error;
    if (!data || !data.length) return note('Noch keine ähnlichen öffentlichen Teile von anderen.');
    await Profile.showItems(data, box, () => false);
  } catch (e) { console.error(e); note('Die Suche nach ähnlichen Teilen hat nicht geklappt.'); } finally { btn.disabled = false; }
});

/* ---------- Farbe automatisch aus dem freigestellten Bild ---------- */
const COLORS = ['Schwarz', 'Weiß', 'Grau', 'Beige', 'Braun', 'Rot', 'Orange', 'Gelb', 'Grün', 'Blau', 'Lila', 'Rosa'];
function hslOf(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
// Farbton → Name (für Flächen, die einen erkennbaren Farbton haben)
function hueName(h, s, l) {
  if (h >= 15 && h < 65 && s < 0.5 && l >= 0.45) return 'Beige';
  if (h >= 10 && h < 50 && l < 0.42) return 'Braun';
  if (h < 15 || h >= 345) return l > 0.7 ? 'Rosa' : 'Rot';
  if (h < 45) return 'Orange';
  if (h < 70) return 'Gelb';
  if (h < 165) return 'Grün';
  if (h < 255) return 'Blau';
  if (h < 295) return 'Lila';
  return 'Rosa';
}
// Dunkle Flächen mit Farbton bleiben Farbe (Navy, Dunkelgrün, Bordeaux), nur wirklich dunkle oder farblose werden Schwarz; blasse Töne bleiben Farbe statt Grau
function colorName(r, g, b) {
  const [h, s, l] = hslOf(r, g, b);
  if (l < 0.08 || (l < 0.16 && s < 0.25)) return 'Schwarz';
  if (l > 0.9 && s < 0.4) return 'Weiß';
  // Helle, blasse Flächen (Creme, Off-White) haben in HSL oft hohe Sättigung, sind aber praktisch weiß/beige
  const ch = (Math.max(r, g, b) - Math.min(r, g, b));
  if (l > 0.72 && ch < 70 && h >= 20 && h < 120) return h < 65 && ch >= 25 ? 'Beige' : 'Weiß';
  if (s < 0.08) return l > 0.82 ? 'Weiß' : (h >= 15 && h < 65 && s >= 0.05 && l >= 0.45) ? 'Beige' : 'Grau';
  return hueName(h, s, l);
}
// Häufigste Farbe der sichtbaren Pixel; nur bei freigestellten Bildern (mit durchsichtigem Hintergrund), sonst null
async function detectColor(blob) {
  try {
    const url = URL.createObjectURL(blob);
    let img;
    try { img = await loadImage(url); } finally { URL.revokeObjectURL(url); }
    const k = Math.min(1, 120 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data;
    const sum = {}; let seen = 0, clear = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 40) { clear++; continue; }
      if (px[i + 3] < 200) continue;
      seen++;
      const n = colorName(px[i], px[i + 1], px[i + 2]);
      const s = sum[n] || (sum[n] = { n: 0, r: 0, g: 0, b: 0 });
      s.n++; s.r += px[i]; s.g += px[i + 1]; s.b += px[i + 2];
    }
    if (seen < 30 || clear < w * h * 0.03) return null;
    // Grau und Beige liegen eng beieinander und Schatten mischen sie: erst zusammenfassen, dann nach dem Farbstich entscheiden
    if (sum.Grau && sum.Beige) {
      for (const k of ['n', 'r', 'g', 'b']) sum.Grau[k] += sum.Beige[k];
      delete sum.Beige;
    }
    let [name, top] = Object.entries(sum).sort((x, y) => y[1].n - x[1].n)[0];
    if (name === 'Grau' || name === 'Beige') {
      const warm = (top.r - top.b) / top.n, light = (top.r + top.g + top.b) / (3 * top.n * 255);
      if (warm >= 9 && light >= 0.4) name = 'Beige';
      else {
        // Grau mit erkennbarem Farbstich (egal welcher Farbe) zählt als diese Farbe
        const m = [top.r, top.g, top.b].map((v) => v / top.n), chroma = Math.max(...m) - Math.min(...m);
        const [h, s, l] = hslOf(...m);
        name = chroma >= 10 && light > 0.2 && l < 0.9 ? hueName(h, Math.max(s, 0.2), l) : 'Grau';
      }
    }
    const hex = '#' + [top.r, top.g, top.b].map((v) => Math.round(v / top.n).toString(16).padStart(2, '0')).join('');
    return { color: name, hex };
  } catch (e) { return null; }
}
const applyColor = (rec, c) => { if (c) { rec.color = c.color; rec.hex = c.hex; } };
// Stellt Teile frei: Hintergrund wird vom Rand aus entfernt, wenn er einfarbig ist (z. B. weißer
// Produktfoto-Hintergrund). Danach auf den sichtbaren Bereich zugeschnitten. Sonst bleibt das Bild unverändert.
function cutOut(canvas, tol = 30) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const px = (x, y) => (y * w + x) * 4;
  const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)].map((i) => [d[i], d[i + 1], d[i + 2]]);
  const bg = [0, 1, 2].map((k) => Math.round(corners.reduce((s, c) => s + c[k], 0) / 4));
  const near = (i) => Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2])) <= tol;
  if (!corners.every((c) => Math.max(...c.map((v, k) => Math.abs(v - bg[k]))) <= tol)) return canvas; // Hintergrund nicht einfarbig

  const gone = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  const push = (x, y) => {
    const p = y * w + x;
    if (!gone[p] && near(p * 4)) { gone[p] = 1; queue[tail++] = p; }
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (head < tail) {
    const p = queue[head++], x = p % w, y = (p - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  if (tail < w * h * 0.05 || tail > w * h * 0.97) return canvas; // nichts oder fast alles erkannt: lieber nicht anfassen

  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (gone[p]) { d[p * 4 + 3] = 0; continue; }
      // Randpixel leicht abschwächen, damit kein heller Saum bleibt
      const edge = (x > 0 && gone[p - 1]) || (x < w - 1 && gone[p + 1]) || (y > 0 && gone[p - w]) || (y < h - 1 && gone[p + w]);
      if (edge) d[p * 4 + 3] = 150;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  ctx.putImageData(img, 0, 0);
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1; out.height = maxY - minY + 1;
  out.getContext('2d').drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

// Verkleinert Uploads auf max. 1400px, damit der Browser-Speicher nicht vollläuft
async function shrink(file, removeBg) {
  const src = URL.createObjectURL(file);
  try {
    const img = await loadImage(src);
    const scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    let c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    if (removeBg) c = cutOut(c);
    return (await canvasBlob(c, 'image/webp', 0.92)) || (await canvasBlob(c, 'image/png'));
  } finally {
    URL.revokeObjectURL(src);
  }
}
