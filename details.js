// Details und Sichtbarkeit eines Teils; Prüfen und Kürzen der Angaben (Teil der App, Reihenfolge siehe index.html)
/* ---------- Details und Sichtbarkeit ---------- */
// Alles ist standardmäßig privat: fehlt `vis` an einem Eintrag, gilt er als privat (so auch bei allen alten Teilen).
const DETAIL_TEXT = { brand: ['Marke', 40], size: ['Größe', 20], sku: ['Artikelnummer (vom Etikett)', 40] };
const CONDS = ['Neu / DS', 'Sehr gut', 'Gut', 'Getragen'];
const RARITIES = ['Alltag', 'Rare', 'Grail'];
const VIS = {
  items: { private: 'Privat', public: 'Öffentlich', sale: 'Zum Verkauf' },
  outfits: { private: 'Privat', public: 'Öffentlich' },
};
const visOf = (rec) => rec.vis || 'private';
const PRICE_MAX = 100000;

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
  return out;
}

const DETAIL_KEYS = [...Object.keys(DETAIL_TEXT), 'cond', 'rarity', 'color', 'hex', 'vis', 'price'];
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
    $(p + 'priceRow').hidden = v !== 'sale';
    $(p + 'pinRow').hidden = v === 'private'; // Anpinnen nur bei Teilen, die andere überhaupt sehen
  }
}
function fillDetails(p, rec) {
  for (const k of Object.keys(DETAIL_TEXT)) $(p + k).value = rec[k] || '';
  if ($(p + 'cond')) { $(p + 'cond').value = rec.cond || ''; $(p + 'rarity').value = rec.rarity || ''; $(p + 'color').value = rec.color || ''; }
  $(p + 'vis').value = visOf(rec);
  if ($(p + 'price')) {
    $(p + 'price').value = rec.price != null ? String(rec.price).replace('.', ',') : '';
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
  }
  setDetails(rec, cleanDetails(src, kind));
  return true;
}
const visLabel = (rec, kind) => (visOf(rec) === 'private' ? '' : VIS[kind][visOf(rec)]);

// Eigene Rückfrage statt confirm(), das in eingebetteten Browsern oft stumm „Nein“ liefert
function askConfirm(text, yesLabel = 'Löschen', info = false) { // info: nur ein Hinweis mit einem Knopf
  const d = $('confirmDialog');
  $('confirmText').textContent = text;
  $('confirmNo').hidden = info;
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

/* ---------- Markenvorschläge (wie bei Vinted): man tippt, bekommt die richtige Schreibweise vorgeschlagen, kann die eigene aber behalten ---------- */
const KNOWN_BRANDS = ['Nike', 'Adidas', 'Puma', 'New Balance', 'Reebok', 'Asics', 'Converse', 'Vans', 'Jordan', 'Under Armour', 'Fila', 'Kappa', 'Umbro', 'Champion', 'Lacoste', 'Fred Perry', 'Ellesse', 'Diadora', 'Saucony', 'Hoka', 'On', 'Salomon', 'Mizuno', 'Brooks', 'Skechers', 'Timberland', 'Dr. Martens', 'Birkenstock', 'Crocs', 'UGG', 'Clarks', 'Camper', 'Stüssy', 'Supreme', 'Palace', 'Carhartt', 'Carhartt WIP', 'Dickies', 'Patagonia', 'The North Face', 'Arc\'teryx', 'Columbia', 'Helly Hansen', 'Fjällräven', 'Napapijri', 'Moncler', 'Canada Goose', 'Stone Island', 'C.P. Company', 'Barbour', 'Burberry', 'Belstaff', 'Woolrich', 'Ralph Lauren', 'Polo Ralph Lauren', 'Tommy Hilfiger', 'Calvin Klein', 'Levi\'s', 'Wrangler', 'Lee', 'Diesel', 'G-Star RAW', 'Pepe Jeans', 'Replay', 'Jack & Jones', 'Only', 'Vero Moda', 'Pull&Bear', 'Bershka', 'Zara', 'H&M', 'Mango', 'Massimo Dutti', 'Stradivarius', 'Uniqlo', 'COS', 'Arket', '& Other Stories', 'Weekday', 'Monki', 'Primark', 'C&A', 'Gap', 'Old Navy', 'Banana Republic', 'J.Crew', 'American Eagle', 'Abercrombie & Fitch', 'Hollister', 'Brandy Melville', 'Urban Outfitters', 'ASOS', 'Topshop', 'River Island', 'Next', 'Marks & Spencer', 'Boss', 'Hugo', 'Hugo Boss', 'Armani', 'Emporio Armani', 'Armani Exchange', 'Versace', 'Gucci', 'Prada', 'Miu Miu', 'Fendi', 'Dolce & Gabbana', 'Valentino', 'Balenciaga', 'Saint Laurent', 'Givenchy', 'Louis Vuitton', 'Dior', 'Chanel', 'Hermès', 'Celine', 'Loewe', 'Bottega Veneta', 'Burberry', 'Alexander McQueen', 'Off-White', 'Palm Angels', 'Fear of God', 'Essentials', 'Amiri', 'Rhude', 'Represent', 'Trapstar', 'Corteiz', 'Gallery Dept', 'Chrome Hearts', 'Kith', 'Aimé Leon Dore', 'Noah', 'Human Made', 'Bape', 'A Bathing Ape', 'Comme des Garçons', 'Maison Margiela', 'Acne Studios', 'Ami Paris', 'A.P.C.', 'Sandro', 'Maje', 'Zadig & Voltaire', 'Isabel Marant', 'Jacquemus', 'Lemaire', 'Marni', 'Jil Sander', 'Issey Miyake', 'Yohji Yamamoto', 'Rick Owens', 'Ann Demeulemeester', 'Raf Simons', 'Vetements', 'Y-3', 'Ader Error', 'Wales Bonner', 'Marine Serre', 'Kenzo', 'Moschino', 'Etro', 'Missoni', 'Pinko', 'Liu Jo', 'Guess', 'Michael Kors', 'Kate Spade', 'Coach', 'Tory Burch', 'Marc Jacobs', 'Ted Baker', 'Paul Smith', 'Vivienne Westwood', 'Superdry', 'Hackett', 'Gant', 'Scotch & Soda', 'Selected', 'S.Oliver', 'Tom Tailor', 'Esprit', 'Marc O\'Polo', 'Closed', 'Drykorn', 'Bogner', 'Peuterey', 'Lyle & Scott', 'Pringle', 'Sun68', 'Aritzia', 'Lululemon', 'Gymshark', 'Alo Yoga', 'Sweaty Betty', 'Vuori', 'Oakley', 'Ray-Ban', 'Maui Jim', 'Casio', 'G-Shock', 'Seiko', 'Rolex', 'Omega', 'Swatch', 'Daniel Wellington', 'Fossil', 'Pandora', 'Swarovski', 'Tiffany & Co.', 'Cartier', 'Thomas Sabo', 'Bulgari', 'Eastpak', 'Herschel', 'Jansport', 'Kånken', 'Longchamp', 'Rimowa', 'Samsonite', 'Tumi', 'Mammut', 'Jack Wolfskin', 'Vaude', 'Maier Sports', 'Schöffel', 'Odlo', 'Icebreaker', 'Smartwool', 'Falke', 'Happy Socks', 'Stance', 'Hanes', 'Fruit of the Loom', 'Gildan', 'Russell Athletic', 'Starter', 'Mitchell & Ness', 'New Era', 'Kangol', 'Stetson', 'Brixton', 'Rains', 'Hunter', 'Blundstone', 'Red Wing', 'Allen Edmonds', 'Church\'s', 'Tod\'s', 'Geox', 'Ecco', 'Gabor', 'Vagabond', 'Dune', 'Steve Madden', 'Public Desire', 'Boohoo', 'Shein', 'Pretty Little Thing', 'Fashion Nova', 'NA-KD', 'Nelly', 'Reserved', 'Cropp', 'House', 'Sinsay', 'Tally Weijl', 'Terranova', 'Orsay', 'Takko', 'KiK', 'Bonprix', 'Ernsting\'s Family', 'Wolford', 'Hunkemöller', 'Triumph', 'Schiesser', 'Sloggi', 'Calzedonia', 'Intimissimi', 'Victoria\'s Secret', 'Oysho', 'Nanushka', 'Ganni', 'Rotate', 'Cecilie Bahnsen', 'Samsøe Samsøe', 'Norse Projects', 'Wood Wood', 'Soulland', 'Han Kjøbenhavn', 'Daily Paper', 'Patta', 'Filling Pieces', 'Axel Arigato', 'Common Projects', 'Veja', 'Golden Goose', 'Autry', 'Karhu', 'Merrell', 'Teva', 'Keen', 'Sorel', 'Kickers', 'Pointer', 'Lonsdale', 'Ben Sherman', 'Farah', 'Gabicci', 'Sergio Tacchini', 'Hummel', 'Joma', 'Erima', 'Jako', 'Macron', 'Errea', 'Le Coq Sportif', 'Kappa Kontroll', 'Peak Performance', 'Tretorn', 'Sail Racing', 'Musto', 'Henri Lloyd', 'Gill', 'Quiksilver', 'Billabong', 'Volcom', 'Rip Curl', 'O\'Neill', 'Roxy', 'Element', 'Santa Cruz', 'Thrasher', 'Obey', 'Huf', 'Brain Dead', 'Polar Skate Co.', 'Hockey', 'Butter Goods', 'Pleasures', 'Cav Empt', 'Neighborhood', 'Wacko Maria', 'Sacai', 'Undercover', 'Junya Watanabe', 'Needles', 'Kapital', 'Beams', 'Nanamica', 'Snow Peak', 'Gramicci', 'Taion', 'Orslow'];
const brandKey = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
// Vorschläge zu einer Eingabe: erst eigene und bekannte Marken, die passen, dann ähnliche (Tippfehler); `own` sind die schon benutzten Schreibweisen
function brandMatches(q, own = [], limit = 5) {
  const nq = brandKey(q);
  if (!nq) return [];
  const seen = new Set(), pool = [];
  for (const b of own) if (b && !seen.has(brandKey(b))) { seen.add(brandKey(b)); pool.push({ b, own: true }); }
  for (const b of KNOWN_BRANDS) if (!seen.has(brandKey(b))) { seen.add(brandKey(b)); pool.push({ b, own: false }); }
  const tol = nq.length <= 2 ? 0 : nq.length <= 4 ? 1 : 2;
  const scored = [];
  for (const { b, own: mine } of pool) {
    const nb = brandKey(b);
    const words = b.split(/[\s\-&]+/).map(brandKey).filter(Boolean);
    let s;
    if (nb === nq) s = 0;
    else if (nb.startsWith(nq)) s = 1;
    else if (words.some((w) => w.startsWith(nq))) s = 2;
    else if (nq.length >= 3 && nb.includes(nq)) s = 3;
    else if (tol) {
      const d = Math.min(levenshtein(nq, nb), levenshtein(nq, nb.slice(0, nq.length)), levenshtein(nq, nb.slice(0, nq.length + 1)));
      if (d <= tol) s = 4 + d;
    }
    if (s !== undefined) scored.push({ b, s, mine });
  }
  scored.sort((x, y) => x.s - y.s || (y.mine - x.mine) || x.b.length - y.b.length || x.b.localeCompare(y.b));
  return scored.slice(0, limit).map((x) => x.b);
}
// Hängt die Vorschlagsliste unter ein Markenfeld. Die Liste enthält immer auch „so lassen“ mit der eigenen Schreibweise.
function brandSuggest(input) {
  if (!input) return;
  const list = document.createElement('div');
  list.className = 'brand-list';
  list.hidden = true;
  input.after(list);
  let accepted = null; // Schreibweise, die der Nutzer bestätigt hat: dazu erscheint keine Liste mehr
  const used = () => [...(typeof items !== 'undefined' ? items : [])].map((r) => r.brand).filter(Boolean);
  const hide = () => { list.hidden = true; list.replaceChildren(); };
  const take = (value) => { input.value = value; accepted = value; hide(); };
  const row = (label, value, cls) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'brand-opt' + (cls ? ' ' + cls : ''); b.textContent = label;
    b.onclick = () => take(value);
    list.appendChild(b);
  };
  const show = () => {
    const q = input.value.trim();
    hide();
    if (!q || q === accepted) return;
    const found = brandMatches(q, used());
    if (found.includes(q)) return; // genau so geschrieben wie ein bekannter Name
    found.forEach((b) => row(b, b));
    row('„' + q + '“ so lassen', q, 'keep');
    list.hidden = false;
  };
  input.addEventListener('input', () => { accepted = null; show(); });
  input.addEventListener('focus', show);
  input.addEventListener('blur', hide);
  list.addEventListener('mousedown', (e) => e.preventDefault()); // Tippen auf einen Vorschlag nimmt dem Feld nicht den Fokus
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('autocorrect', 'off');
}

/* ---------- Größenvorschläge: scrollbare Liste (Kleidung, Schuhe, Hosen); eigene Eingabe bleibt möglich ---------- */
const SIZE_GROUPS = {
  Kleidung: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  Schuhe: Array.from({ length: 13 }, (_, i) => String(36 + i)),
  Hosen: Array.from({ length: 15 }, (_, i) => 'W' + (26 + i)),
  Einheitsgröße: ['One Size'],
};
const sizeOrder = () => Object.keys(SIZE_GROUPS); // feste Reihenfolge: Kleidung, Schuhe, Hosen, ganz unten One Size
// Passende Größen zu einer Eingabe, gruppiert; ohne Eingabe die ganze Liste
function sizeMatches(q, category) {
  const nq = brandKey(q);
  return sizeOrder(category).map((g) => {
    const all = SIZE_GROUPS[g];
    const hit = !nq ? all : [...all.filter((s) => brandKey(s).startsWith(nq)), ...all.filter((s) => !brandKey(s).startsWith(nq) && brandKey(s).includes(nq))];
    return [g, hit];
  }).filter(([, hit]) => hit.length);
}
function sizeSuggest(input, categoryId) {
  if (!input) return;
  const list = document.createElement('div');
  list.className = 'brand-list size-list';
  list.hidden = true;
  input.after(list);
  let accepted = null;
  const hide = () => { list.hidden = true; list.replaceChildren(); };
  const take = (v) => { input.value = v; accepted = v; hide(); };
  const row = (label, value, cls) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'brand-opt' + (cls ? ' ' + cls : ''); b.textContent = label;
    b.onclick = () => take(value);
    list.appendChild(b);
  };
  const show = () => {
    const q = input.value.trim();
    hide();
    if (q && q === accepted) return;
    const groups = sizeMatches(q, categoryId && $(categoryId) ? $(categoryId).value : '');
    if (q && groups.some(([, hit]) => hit.includes(q))) return; // genau eine Größe aus der Liste
    for (const [g, hit] of groups) {
      const h = document.createElement('div');
      h.className = 'size-head'; h.textContent = g;
      list.appendChild(h);
      hit.forEach((s) => row(s, s));
    }
    if (q) row('„' + q + '“ so lassen', q, 'keep');
    if (!list.children.length) return;
    list.hidden = false;
  };
  input.addEventListener('input', () => { accepted = null; show(); });
  input.addEventListener('focus', show);
  input.addEventListener('blur', hide);
  list.addEventListener('mousedown', (e) => e.preventDefault());
  input.setAttribute('autocomplete', 'off');
}
