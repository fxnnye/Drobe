// Freistellen mit grobem Umriss: Der eingezeichnete Umriss ist nur ein Hinweis (Vorwissen).
// Die genaue Kante entsteht aus den Farben: erst aus dem Kern des Umrisses (Teil) und dem Bereich weit außerhalb
// (Hintergrund) Farbmodelle lernen, dann jedes Pixel danach einordnen, ähnlich wie bei GrabCut.
const SmartCut = (() => {
  const WORK = 640;     // Arbeitsauflösung für das Lernen der Farbmodelle
  const K = 5;          // Farbgruppen pro Modell
  const PRIOR = 30;     // Gewicht des Umrisses gegenüber der Farbe (in Farbabstand)
  const SAMPLES = 5000; // Stichprobe je Modell

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function rasterize(pts, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff';
    x.beginPath();
    pts.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y)));
    x.closePath(); x.fill();
    const d = x.getImageData(0, 0, w, h).data;
    const m = new Uint8Array(w * h);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4] > 127 ? 1 : 0;
    return m;
  }

  // Abstand zum nächsten Pixel des anderen Zustands (Chamfer), nur für Pixel mit mask === value
  function distance(mask, w, h, value) {
    const BIG = 1e9, d = new Float32Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = mask[i] === value ? BIG : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; let v = d[i];
      if (!v) continue;
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[i - w] + 1);
        if (x > 0) v = Math.min(v, d[i - w - 1] + 1.414);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + 1.414);
      }
      d[i] = v;
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x; let v = d[i];
      if (!v) continue;
      if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + 1);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + 1.414);
        if (x > 0) v = Math.min(v, d[i + w - 1] + 1.414);
      }
      d[i] = v;
    }
    for (let i = 0; i < d.length; i++) if (d[i] >= BIG) d[i] = 1e5;
    return d;
  }

  function kmeans(samples, n) {
    const centers = new Float32Array(K * 3);
    // Startwerte: weit auseinander liegende Stichproben
    let first = Math.floor(n / 2);
    centers.set(samples.subarray(first * 3, first * 3 + 3), 0);
    const minD = new Float32Array(n).fill(1e12);
    for (let k = 1; k < K; k++) {
      let best = 0, bd = -1;
      for (let i = 0; i < n; i++) {
        const dr = samples[i * 3] - centers[(k - 1) * 3], dg = samples[i * 3 + 1] - centers[(k - 1) * 3 + 1], db = samples[i * 3 + 2] - centers[(k - 1) * 3 + 2];
        const d = dr * dr + dg * dg + db * db;
        if (d < minD[i]) minD[i] = d;
        if (minD[i] > bd) { bd = minD[i]; best = i; }
      }
      centers.set(samples.subarray(best * 3, best * 3 + 3), k * 3);
    }
    const sum = new Float32Array(K * 3), cnt = new Uint32Array(K);
    for (let it = 0; it < 6; it++) {
      sum.fill(0); cnt.fill(0);
      for (let i = 0; i < n; i++) {
        const r = samples[i * 3], g = samples[i * 3 + 1], b = samples[i * 3 + 2];
        let bk = 0, bdist = 1e12;
        for (let k = 0; k < K; k++) {
          const dr = r - centers[k * 3], dg = g - centers[k * 3 + 1], db = b - centers[k * 3 + 2];
          const d = dr * dr + dg * dg + db * db;
          if (d < bdist) { bdist = d; bk = k; }
        }
        sum[bk * 3] += r; sum[bk * 3 + 1] += g; sum[bk * 3 + 2] += b; cnt[bk]++;
      }
      for (let k = 0; k < K; k++) if (cnt[k]) {
        centers[k * 3] = sum[k * 3] / cnt[k]; centers[k * 3 + 1] = sum[k * 3 + 1] / cnt[k]; centers[k * 3 + 2] = sum[k * 3 + 2] / cnt[k];
      }
    }
    // Winzige Gruppen (meist Ausreißer oder Kantenmischfarben) nicht als Farbe des Teils zählen
    for (let k = 0; k < K; k++) if (cnt[k] < n * 0.03) centers.fill(1e5, k * 3, k * 3 + 3);
    return centers;
  }

  // Entfernung einer Farbe zur nächsten Farbgruppe des Modells
  function modelDist(model, r, g, b) {
    let best = 1e12;
    for (let k = 0; k < K; k++) {
      const dr = r - model[k * 3], dg = g - model[k * 3 + 1], db = b - model[k * 3 + 2];
      const d = dr * dr + dg * dg + db * db;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  function fit(px, w, h, pick) {
    const idx = [];
    for (let i = 0; i < w * h; i++) if (px[i * 4 + 3] >= 128 && pick(i)) idx.push(i); // schon transparente Stellen zählen nicht
    if (idx.length < K * 2) return null;
    const step = Math.max(1, Math.floor(idx.length / SAMPLES));
    const n = Math.floor(idx.length / step);
    const s = new Float32Array(n * 3);
    for (let j = 0; j < n; j++) {
      const p = idx[j * step] * 4;
      s[j * 3] = px[p]; s[j * 3 + 1] = px[p + 1]; s[j * 3 + 2] = px[p + 2];
    }
    return kmeans(s, n);
  }

  function boxBlur(a, w, h, r) {
    const t = new Float32Array(a.length);
    for (let y = 0; y < h; y++) {
      let acc = 0, cnt = 0;
      const row = y * w;
      for (let x = -r; x < w; x++) {
        const add = x + r, rem = x - r - 1;
        if (add < w) { acc += a[row + add]; cnt++; }
        if (rem >= 0) { acc -= a[row + rem]; cnt--; }
        if (x >= 0) t[row + x] = acc / cnt;
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0, cnt = 0;
      for (let y = -r; y < h; y++) {
        const add = y + r, rem = y - r - 1;
        if (add < h) { acc += t[add * w + x]; cnt++; }
        if (rem >= 0) { acc -= t[rem * w + x]; cnt--; }
        if (y >= 0) a[y * w + x] = acc / cnt;
      }
    }
  }

  // Zusammenhängende Flächen (4er-Nachbarschaft) mit Wert `value` markieren
  function components(bin, w, h, value) {
    const lab = new Int32Array(w * h).fill(-1);
    const stack = new Int32Array(w * h);
    const areas = [], border = [];
    for (let s = 0; s < w * h; s++) {
      if (bin[s] !== value || lab[s] !== -1) continue;
      const id = areas.length;
      let sp = 0, area = 0, touches = false;
      stack[sp++] = s; lab[s] = id;
      while (sp) {
        const i = stack[--sp];
        area++;
        const x = i % w, y = (i - x) / w;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true;
        if (x > 0 && bin[i - 1] === value && lab[i - 1] === -1) { lab[i - 1] = id; stack[sp++] = i - 1; }
        if (x < w - 1 && bin[i + 1] === value && lab[i + 1] === -1) { lab[i + 1] = id; stack[sp++] = i + 1; }
        if (y > 0 && bin[i - w] === value && lab[i - w] === -1) { lab[i - w] = id; stack[sp++] = i - w; }
        if (y < h - 1 && bin[i + w] === value && lab[i + w] === -1) { lab[i + w] = id; stack[sp++] = i + w; }
      }
      areas.push(area); border.push(touches);
    }
    return { lab, areas, border };
  }

  // canvas: Foto, pts: grober Umriss in Bildpixeln. Liefert ein Canvas mit Transparenz oder null.
  function run(canvas, pts) {
    const W = canvas.width, H = canvas.height;
    const sc = Math.min(1, WORK / Math.max(W, H));
    const w = Math.max(8, Math.round(W * sc)), h = Math.max(8, Math.round(H * sc));
    const wc = document.createElement('canvas');
    wc.width = w; wc.height = h;
    wc.getContext('2d').drawImage(canvas, 0, 0, w, h);
    const px = wc.getContext('2d').getImageData(0, 0, w, h).data;

    const mask = rasterize(pts.map((p) => ({ x: p.x * sc, y: p.y * sc })), w, h);
    let inside = 0;
    for (let i = 0; i < mask.length; i++) inside += mask[i];
    if (inside < 100 || inside > mask.length - 100) return null;

    const dIn = distance(mask, w, h, 1), dOut = distance(mask, w, h, 0);
    let maxD = 0;
    for (let i = 0; i < dIn.length; i++) if (dIn[i] > maxD) maxD = dIn[i];
    let minX = w, maxX = 0, minY = h, maxY = 0;
    for (const p of pts) {
      minX = Math.min(minX, p.x * sc); maxX = Math.max(maxX, p.x * sc);
      minY = Math.min(minY, p.y * sc); maxY = Math.max(maxY, p.y * sc);
    }
    const m = Math.max(4, 0.08 * Math.max(maxX - minX, maxY - minY)); // Spielraum um die gezeichnete Linie
    const coreD = 0.45 * maxD;                                       // innerer Kern: sicher Teil
    const farD = 1.6 * m;                                            // weit außen: sicher Hintergrund

    let bg = fit(px, w, h, (i) => mask[i] === 0 && dOut[i] > m);
    if (!bg) return null;
    // Wie weit liegen typische Hintergrundpixel von ihrem Modell entfernt? Alles darüber ist „anders als der Hintergrund“.
    const bgDist = [];
    for (let i = 0, n = 0; i < w * h && bgDist.length < 4000; i++) {
      if (mask[i] === 0 && dOut[i] > m && px[i * 4 + 3] >= 128 && (n++ % 7) === 0) bgDist.push(modelDist(bg, px[i * 4], px[i * 4 + 1], px[i * 4 + 2]));
    }
    bgDist.sort((a, b) => a - b);
    const bgLimit = Math.max(30, (bgDist[Math.floor(bgDist.length * 0.98)] || 0) * 1.3);
    // Teil-Farben: Pixel im Umriss, die nicht wie der Hintergrund aussehen. Der Umriss ist grob und enthält
    // oft viel Hintergrund, deshalb wird der Kern nicht blind als Teil genommen.
    let fg = fit(px, w, h, (i) => mask[i] === 1 && modelDist(bg, px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) > bgLimit)
      || fit(px, w, h, (i) => dIn[i] >= coreD && mask[i] === 1);
    if (!fg) return null;

    const prior = (sd) => clamp(sd / m, -1, 1);
    const score = new Float32Array(w * h);
    const lab = new Uint8Array(w * h);
    for (let it = 0; it < 4; it++) {
      for (let i = 0; i < w * h; i++) {
        const p = i * 4, r = px[p], g = px[p + 1], b = px[p + 2];
        const sd = mask[i] ? dIn[i] : -dOut[i];
        score[i] = px[p + 3] < 128 ? -60 : modelDist(bg, r, g, b) - modelDist(fg, r, g, b) + PRIOR * prior(sd);
      }
      boxBlur(score, w, h, 2);
      for (let i = 0; i < w * h; i++) {
        lab[i] = (!mask[i] && dOut[i] > farD) ? 0 : (score[i] > 0 ? 1 : 0);
      }
      if (it < 3) {
        // Nur eindeutige Pixel für die neuen Modelle verwenden, sonst „wandern“ Fehler von Runde zu Runde
        const nf = fit(px, w, h, (i) => lab[i] === 1 && score[i] > 20 && modelDist(bg, px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) > bgLimit);
        const nb = fit(px, w, h, (i) => (mask[i] === 0 && dOut[i] > m) || (lab[i] === 0 && score[i] < -20));
        if (nf) fg = nf;
        if (nb) bg = nb;
      }
    }

    // Endgültige Entscheidung in voller Auflösung mit den gelernten Farbmodellen
    const ctx = canvas.getContext('2d');
    const full = ctx.getImageData(0, 0, W, H);
    const fd = full.data;
    const sdW = new Float32Array(w * h);
    for (let i = 0; i < sdW.length; i++) sdW[i] = mask[i] ? dIn[i] : -dOut[i];
    const sdAt = (x, y) => { // bilinear aus der Arbeitsauflösung
      const fx = clamp(x * sc - 0.5, 0, w - 1), fy = clamp(y * sc - 0.5, 0, h - 1);
      const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
      const tx = fx - x0, ty = fy - y0;
      const a = sdW[y0 * w + x0] * (1 - tx) + sdW[y0 * w + x1] * tx;
      const b = sdW[y1 * w + x0] * (1 - tx) + sdW[y1 * w + x1] * tx;
      return a * (1 - ty) + b * ty;
    };
    const fs = new Float32Array(W * H);
    const sdFull = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, p = i * 4;
      const sd = sdAt(x, y);
      sdFull[i] = sd;
      fs[i] = fd[p + 3] < 128 ? -60 : modelDist(bg, fd[p], fd[p + 1], fd[p + 2]) - modelDist(fg, fd[p], fd[p + 1], fd[p + 2]) + PRIOR * prior(sd);
    }
    boxBlur(fs, W, H, Math.max(1, Math.round(1 / sc)));
    const bin = new Uint8Array(W * H);
    for (let i = 0; i < bin.length; i++) {
      const sd = sdFull[i];
      bin[i] = sd < -farD ? 0 : (fs[i] > 3 ? 1 : 0);
    }

    // Aufräumen: kleine Inseln weg, kleine Löcher füllen
    const fgc = components(bin, W, H, 1);
    let biggest = 1;
    for (const a of fgc.areas) if (a > biggest) biggest = a;
    const keep = new Uint8Array(W * H);
    let keptArea = 0;
    for (let i = 0; i < keep.length; i++) {
      const id = fgc.lab[i];
      if (id >= 0 && fgc.areas[id] >= biggest * 0.15) { keep[i] = 1; keptArea++; }
    }
    const holes = components(keep, W, H, 0);
    for (let i = 0; i < keep.length; i++) {
      const id = holes.lab[i];
      if (id >= 0 && !holes.border[id] && holes.areas[id] < keptArea * 0.015) keep[i] = 1;
    }

    // Weiche Kante aus dem Farb-Score
    const E = 8;
    for (let i = 0; i < keep.length; i++) {
      const p = i * 4;
      if (!keep[i]) { fd[p + 3] = 0; continue; }
      const a = clamp((fs[i] - 3) / (2 * E) + 0.5, 0, 1);
      fd[p + 3] = Math.round(a * fd[p + 3]); // vorhandene Transparenz bleibt erhalten
    }
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    out.getContext('2d').putImageData(full, 0, 0);
    return out;
  }

  return { run };
})();
