// Details und Sichtbarkeit eines Teils; Prüfen und Kürzen der Angaben (Teil der App, Reihenfolge siehe index.html)
/* ---------- Details und Sichtbarkeit ---------- */
// Alles ist standardmäßig privat: fehlt `vis` an einem Eintrag, gilt er als privat (so auch bei allen alten Teilen).
const DETAIL_TEXT = { brand: ['Marke', 40], size: ['Größe', 20], sku: ['Artikelnummer (vom Etikett)', 40] };
const CONDS = ['Neu / DS', 'Sehr gut', 'Gut', 'Getragen'];
const RARITIES = ['Alltag', 'Rare', 'Grail'];
const VIS = {
  items: { private: 'Privat', public: 'Öffentlich', trade: 'Zum Tausch', sale: 'Zum Verkauf' },
  wishlist: { private: 'Privat', public: 'Öffentlich' },
  outfits: { private: 'Privat', public: 'Öffentlich' },
};
const visOf = (rec) => rec.vis || 'private';
const PRICE_MAX = 100000, SWAP_MAX = 200;

// Prüft und kürzt die Detailfelder eines Eintrags (für Backup-Import und Speichern): unbekannte oder ungültige Werte entfallen
function cleanDetails(src, kind) {
  const out = {};
  if (kind !== 'outfits') {
    for (const [k, [, max]] of Object.entries(DETAIL_TEXT)) {
      if (typeof src[k] === 'string' && src[k].trim()) out[k] = src[k].trim().slice(0, max);
    }
  }
  if (kind === 'items') {
    if (CONDS.includes(src.cond)) out.cond = src.cond;
    if (RARITIES.includes(src.rarity)) out.rarity = src.rarity;
    if (COLORS.includes(src.color)) { out.color = src.color; if (/^#[0-9a-f]{6}$/.test(src.hex || '')) out.hex = src.hex; }
  }
  if (src.vis && src.vis !== 'private' && VIS[kind][src.vis]) out.vis = src.vis;
  if (kind === 'items' && out.vis === 'sale' && num(src.price) && src.price >= 0 && src.price <= PRICE_MAX) out.price = src.price;
  if (kind === 'items' && out.vis === 'trade' && typeof src.swap === 'string' && src.swap.trim()) out.swap = src.swap.trim().slice(0, SWAP_MAX);
  return out;
}

const DETAIL_KEYS = [...Object.keys(DETAIL_TEXT), 'cond', 'rarity', 'color', 'hex', 'vis', 'price', 'swap'];
const setDetails = (rec, clean) => { for (const k of DETAIL_KEYS) delete rec[k]; Object.assign(rec, clean); };

// Baut die ausklappbaren Detailfelder in einen Dialog (p = Präfix der Feld-IDs)
function buildDetails(box, p, kind) {
  const text = Object.entries(DETAIL_TEXT).map(([k, [label, max]]) =>
    `<label class="field">${label}<input type="text" id="${p}${k}" maxlength="${max}"></label>`).join('');
  const sel = (id, label, opts) => `<label class="field">${label}<select id="${p}${id}">${opts}</select></label>`;
  const visOpts = Object.entries(VIS[kind]).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  const extra = kind === 'items'
    ? sel('cond', 'Zustand', '<option value="">–</option>' + CONDS.map((c) => `<option>${c}</option>`).join(''))
      + sel('rarity', 'Seltenheit', '<option value="">–</option>' + RARITIES.map((c) => `<option>${c}</option>`).join(''))
      + sel('color', 'Farbe', '<option value="">–</option>' + COLORS.map((c) => `<option>${c}</option>`).join(''))
    : '';
  const sale = kind === 'items'
    ? `<label class="field" id="${p}priceRow" hidden>Preis (€)<input type="text" id="${p}price" inputmode="decimal" maxlength="9"></label>
       <label class="field" id="${p}swapRow" hidden>Tauschwunsch<input type="text" id="${p}swap" maxlength="${SWAP_MAX}" placeholder="z. B. Größe M oder Nike Dunk Low"></label>
       <label class="check" id="${p}pinRow" hidden><input type="checkbox" id="${p}pin"> Oben im Profil anpinnen (Showcase, max. 6)</label>`
    : '';
  box.innerHTML = `<details class="more"><summary>Details und Sichtbarkeit</summary>
    <div class="more-grid">${text}${extra}</div>
    ${sel('vis', 'Sichtbarkeit', visOpts)}${sale}
    <p class="muted small">Privat ist der Standard. Notizen und Shop-Links bleiben immer privat.</p></details>`;
  $(p + 'vis').onchange = () => syncVisRows(p);
}
function syncVisRows(p) {
  const v = $(p + 'vis').value;
  if ($(p + 'priceRow')) {
    $(p + 'priceRow').hidden = v !== 'sale'; $(p + 'swapRow').hidden = v !== 'trade';
    $(p + 'pinRow').hidden = v === 'private'; // Anpinnen nur bei Teilen, die andere überhaupt sehen
  }
}
function fillDetails(p, rec) {
  for (const k of Object.keys(DETAIL_TEXT)) $(p + k).value = rec[k] || '';
  if ($(p + 'cond')) { $(p + 'cond').value = rec.cond || ''; $(p + 'rarity').value = rec.rarity || ''; $(p + 'color').value = rec.color || ''; }
  $(p + 'vis').value = visOf(rec);
  if ($(p + 'price')) {
    $(p + 'price').value = rec.price != null ? String(rec.price).replace('.', ',') : ''; $(p + 'swap').value = rec.swap || '';
    $(p + 'pin').checked = typeof Profile !== 'undefined' && Profile.isPinned(rec.id);
  }
  syncVisRows(p);
  const d = $(p + 'vis').closest('details');
  d.open = visOf(rec) !== 'private' || Object.keys(DETAIL_TEXT).some((k) => rec[k]);
}
// Liest die Felder zurück in den Eintrag; false, wenn der Preis nicht stimmt
function readDetails(p, kind, rec) {
  const src = { vis: $(p + 'vis').value };
  for (const k of Object.keys(DETAIL_TEXT)) src[k] = $(p + k).value;
  if (kind === 'items') {
    src.cond = $(p + 'cond').value; src.rarity = $(p + 'rarity').value; src.color = $(p + 'color').value; src.hex = src.color && src.color === rec.color ? rec.hex : '';
    const raw = $(p + 'price').value.trim().replace(',', '.');
    if (src.vis === 'sale' && raw) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > PRICE_MAX) { toast('Der Preis sieht nicht richtig aus'); return false; }
      src.price = Math.round(n * 100) / 100;
    }
    src.swap = $(p + 'swap').value;
  }
  setDetails(rec, cleanDetails(src, kind));
  return true;
}
const visLabel = (rec, kind) => (visOf(rec) === 'private' ? '' : VIS[kind][visOf(rec)]);

// Eigene Rückfrage statt confirm(), das in eingebetteten Browsern oft stumm „Nein“ liefert
function askConfirm(text, yesLabel = 'Löschen') {
  const d = $('confirmDialog');
  $('confirmText').textContent = text;
  $('confirmYes').textContent = yesLabel;
  return new Promise((resolve) => {
    const done = (v) => {
      $('confirmYes').onclick = $('confirmNo').onclick = d.onclose = null;
      if (d.open) d.close();
      resolve(v);
    };
    $('confirmYes').onclick = () => done(true);
    $('confirmNo').onclick = () => done(false);
    d.onclose = () => done(false); // Esc
    d.showModal();
  });
}

function toast(msg) {
  const t = $('toast');
  const bad = /nicht|Fehler|konnte|fehlt|falsch|Limit|zu viele/i.test(msg); // Fehlermeldungen sehen anders aus und bleiben länger
  t.textContent = msg;
  t.classList.toggle('error', bad);
  t.setAttribute('role', bad ? 'alert' : 'status');
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), bad ? 4200 : 2200);
}
// Platzhalter-Karten, solange etwas lädt
function skeletons(parent, n = 6) {
  const els = [];
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div');
    s.className = 'skeleton-card';
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<div class="skeleton img"></div><div class="skeleton line"></div><div class="skeleton line short"></div>';
    els.push(s);
  }
  parent.append(...els);
  return () => els.forEach((s) => s.remove());
}
// Fehlerhinweis mit „Nochmal versuchen“
function errorNotice(box, text, retry) {
  const n = document.createElement('div');
  n.className = 'notice error';
  n.setAttribute('role', 'alert');
  const p = document.createElement('p');
  p.textContent = text;
  n.append(p);
  if (retry) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn'; b.textContent = 'Nochmal versuchen';
    b.onclick = retry;
    n.append(b);
  }
  box.append(n);
  return n;
}
