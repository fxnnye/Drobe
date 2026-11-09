// Farblexikon, Backup, Rechtliches, Konto löschen, Willkommen, Einstellungen (Teil der App, Reihenfolge siehe index.html)
/* ---------- Farblexikon ---------- */
state.colorCount = 2;
function renderColors() {
  const bar = $('colorFilter');
  bar.innerHTML = '';
  [2, 3].forEach((n) => {
    const b = document.createElement('button');
    b.className = 'chip' + (state.colorCount === n ? ' active' : '');
    b.textContent = n + ' Farben';
    b.onclick = () => { state.colorCount = n; renderColors(); };
    bar.appendChild(b);
  });
  const grid = $('colorGrid');
  grid.innerHTML = '';
  COLOR_COMBOS[state.colorCount].forEach((c) => {
    const el = document.createElement('div');
    el.className = 'combo';
    const pal = document.createElement('div');
    pal.className = 'palette';
    c.colors.forEach(([name, hex]) => {
      const s = document.createElement('div');
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      s.style.background = hex;
      s.style.color = (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111' : '#fff'; // lesbare Schriftfarbe
      s.textContent = name;
      s.title = hex;
      pal.appendChild(s);
    });
    el.appendChild(pal);
    el.insertAdjacentHTML('beforeend', '<b></b><p></p>');
    el.querySelector('b').textContent = c.colors.map((x) => x[0]).join(' + ');
    el.querySelector('p').textContent = c.tip;
    grid.appendChild(el);
  });
}
renderColors();
$('colorsBtn').onclick = () => $('colorsDialog').showModal();
$('colorsClose').onclick = () => $('colorsDialog').close();

/* ---------- Backup ---------- */
const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});
const dataUrlToBlob = async (url) => (await fetch(url)).blob();

const backupDlg = $('backupDialog');
const settingsDlg = $('settingsDialog');
// Schließen mit kurzer Ausblend-Bewegung nach oben (auch beim Tipp daneben und mit Esc)
{
  const nativeClose = settingsDlg.close.bind(settingsDlg);
  settingsDlg.close = (v) => {
    if (!settingsDlg.open || settingsDlg.classList.contains('closing') || matchMedia('(prefers-reduced-motion: reduce)').matches) return nativeClose(v);
    settingsDlg.classList.add('closing');
    settingsDlg.addEventListener('animationend', (e) => { if (e.target !== settingsDlg) return; settingsDlg.classList.remove('closing'); nativeClose(v); }, { once: true });
  };
  settingsDlg.addEventListener('cancel', (e) => { e.preventDefault(); settingsDlg.close(); });
}
// Einstellungen: erst eine grobe Liste, ein Klick öffnet den jeweiligen Bereich im selben Fenster
function showSetPanel(name) {
  document.querySelectorAll('.set-panel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  const panel = document.querySelector(`.set-panel[data-panel="${name}"]`);
  $('setTitle').textContent = name === 'main' ? 'Einstellungen' : panel.dataset.title;
  $('setBack').hidden = name === 'main';
}
document.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => showSetPanel(b.dataset.open); });
$('setBack').onclick = () => showSetPanel('main');
$('menuBtn').onclick = () => { showSetPanel('main'); settingsDlg.showModal(); };
$('settingsClose').onclick = () => settingsDlg.close();
$('backupOpen').onclick = () => {
  settingsDlg.close();
  $('backupInfo').textContent = `Aktuell gespeichert: ${items.length} Teile, ${outfits.length} Outfits, ${wishlist.length} Wünsche.`;
  backupDlg.showModal();
};

/* ---------- Rechtliches ---------- */
const legalDlg = $('legalDialog');
function showLegal(page) {
  document.querySelectorAll('[data-legal-page]').forEach((p) => { p.hidden = p.dataset.legalPage !== page; });
  document.querySelectorAll('#legalTabs .chip').forEach((c) => c.classList.toggle('active', c.dataset.legalTab === page));
  $('legalBody').scrollTop = 0;
  if (!legalDlg.open) legalDlg.showModal();
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-legal]');
  if (!a) return;
  e.preventDefault();
  showLegal(a.dataset.legal);
});
document.querySelectorAll('#legalTabs .chip').forEach((c) => { c.onclick = () => showLegal(c.dataset.legalTab); });
$('legalClose').onclick = () => legalDlg.close();

/* ---------- Konto löschen ---------- */
$('delName').oninput = () => { $('delGo').disabled = $('delName').value.trim().toLowerCase() !== ((Cloud.user() || {}).name || '\0'); };
document.querySelector('[data-open=delete]').addEventListener('click', () => { $('delName').value = ''; $('delGo').disabled = true; $('delMsg').textContent = ''; });
$('delGo').onclick = async () => {
  const msg = $('delMsg');
  msg.className = 'pw-msg err';
  msg.textContent = '';
  $('delGo').disabled = true;
  try {
    await Cloud.deleteAccount();
  } catch (e) {
    console.error(e);
    msg.textContent = (e && e.message) || 'Das hat nicht geklappt. Dein Konto ist unverändert.';
    $('delGo').disabled = false;
  }
};

/* ---------- Willkommen (nur beim ersten Start ohne Inhalte) ---------- */
function maybeWelcome() {
  try {
    if (localStorage.getItem('drobe-welcomed') || items.length || outfits.length || wishlist.length) return;
    $('welcomeDialog').showModal();
  } catch (e) { /* ohne Speicher: kein Willkommen */ }
}
$('welcomeGo').onclick = () => {
  try { localStorage.setItem('drobe-welcomed', '1'); } catch (e) { /* dann erscheint es nochmal */ }
  $('welcomeDialog').close();
  showView('add');
};

/* ---------- Erscheinungsbild ---------- */
function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') root.dataset.theme = mode; else delete root.dataset.theme;
  document.querySelectorAll('#themeChips .chip').forEach((c) => c.classList.toggle('active', c.dataset.theme === (mode === 'light' || mode === 'dark' ? mode : 'system')));
  const dark = mode === 'dark' || (mode !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]').content = dark ? '#121212' : '#ffffff';
}
let themeMode = 'system';
try { themeMode = localStorage.getItem('drobe-theme') || 'system'; } catch (e) { /* ohne Speicher: automatisch */ }
applyTheme(themeMode);
document.querySelectorAll('#themeChips .chip').forEach((c) => {
  c.onclick = () => {
    themeMode = c.dataset.theme;
    try { localStorage.setItem('drobe-theme', themeMode); } catch (e) { /* gilt dann nur bis zum Neuladen */ }
    applyTheme(themeMode);
  };
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(themeMode));
$('backupClose').onclick = () => backupDlg.close();

$('backupExport').onclick = async () => {
  if (!items.length && !outfits.length && !wishlist.length) return toast('Es gibt noch nichts zu sichern');
  const btn = $('backupExport');
  btn.disabled = true;
  try {
    const data = {
      app: 'kleiderschrank', version: 2, exported: new Date().toISOString(),
      items: await Promise.all(items.map(async (i) => ({
        id: i.id, name: i.name, category: i.category, created: i.created, scale: i.scale, note: i.note, image: await blobToDataUrl(i.blob),
        ...cleanDetails(i, 'items'),
        source: i.source ? await blobToDataUrl(i.source) : undefined, srcBox: i.source ? i.srcBox : undefined,
      }))),
      wishlist: await Promise.all(wishlist.map(async (w) => ({
        id: w.id, name: w.name, category: w.category, created: w.created, note: w.note, link: w.link, image: await blobToDataUrl(w.blob),
        ...cleanDetails(w, 'wishlist'),
      }))),
      outfits: await Promise.all(outfits.map(async (o) => ({
        id: o.id, name: o.name, layers: o.layers, bg: o.bg || '#ffffff', created: o.created, thumb: await blobToDataUrl(o.thumb),
        ...cleanDetails(o, 'outfits'),
      }))),
    };
    const file = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = `kleiderschrank-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Backup gespeichert');
  } catch (e) {
    console.error(e);
    toast('Backup fehlgeschlagen');
  } finally {
    btn.disabled = false;
  }
};

const num = (v) => typeof v === 'number' && Number.isFinite(v);
async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
    if (data.app !== 'kleiderschrank' || !Array.isArray(data.items) || !Array.isArray(data.outfits)) throw new Error('format');
  } catch (e) {
    return toast('Das ist keine gültige Backup-Datei');
  }
  const haveItems = new Set(items.map((i) => i.id));
  const haveOutfits = new Set(outfits.map((o) => o.id));
  const haveWish = new Set(wishlist.map((w) => w.id));
  let addedItems = 0, addedOutfits = 0, addedWish = 0;
  for (const i of data.items) {
    if (typeof i.id !== 'string' || haveItems.has(i.id) || typeof i.image !== 'string' || !i.image.startsWith('data:image/')) continue;
    const category = CATEGORIES.includes(i.category) ? i.category : (LEGACY[i.category] || 'Shirts');
    const rec = {
      id: i.id, name: String(i.name || 'Neues Teil').slice(0, 60), category,
      blob: await dataUrlToBlob(i.image), created: num(i.created) ? i.created : Date.now(),
    };
    if (num(i.scale) && i.scale >= 0.3 && i.scale <= 3 && i.scale !== 1) rec.scale = i.scale;
    if (typeof i.note === 'string' && i.note.trim()) rec.note = i.note.trim().slice(0, 120);
    Object.assign(rec, cleanDetails(i, 'items'));
    if (typeof i.source === 'string' && i.source.startsWith('data:image/') && i.srcBox && num(i.srcBox.x) && num(i.srcBox.y)) {
      rec.source = await dataUrlToBlob(i.source);
      rec.srcBox = { x: i.srcBox.x, y: i.srcBox.y };
    }
    await dbPut('items', rec);
    items.push(rec);
    addedItems++;
  }
  for (const o of data.outfits) {
    if (typeof o.id !== 'string' || haveOutfits.has(o.id) || typeof o.thumb !== 'string' || !o.thumb.startsWith('data:image/')) continue;
    const layers = (Array.isArray(o.layers) ? o.layers : [])
      .filter((l) => typeof l.itemId === 'string' && num(l.x) && num(l.y) && num(l.w))
      .map(({ itemId, x, y, w, rot }) => ({ itemId, x, y, w, rot: num(rot) ? rot : 0 }));
    const rec = {
      id: o.id, name: String(o.name || 'Outfit').slice(0, 60), layers,
      bg: /^#[0-9a-f]{6}$/i.test(o.bg) ? o.bg : '#ffffff',
      thumb: await dataUrlToBlob(o.thumb), created: num(o.created) ? o.created : Date.now(),
      ...cleanDetails(o, 'outfits'),
    };
    await dbPut('outfits', rec);
    outfits.push(rec);
    addedOutfits++;
  }
  for (const w of Array.isArray(data.wishlist) ? data.wishlist : []) {
    if (typeof w.id !== 'string' || haveWish.has(w.id) || typeof w.image !== 'string' || !w.image.startsWith('data:image/')) continue;
    const rec = {
      id: w.id, name: String(w.name || 'Neues Teil').slice(0, 60),
      category: CATEGORIES.includes(w.category) ? w.category : (LEGACY[w.category] || 'Shirts'),
      blob: await dataUrlToBlob(w.image), created: num(w.created) ? w.created : Date.now(),
    };
    if (typeof w.note === 'string' && w.note.trim()) rec.note = w.note.trim().slice(0, 120);
    Object.assign(rec, cleanDetails(w, 'wishlist'));
    const link = typeof w.link === 'string' ? cleanLink(w.link) : '';
    if (link) rec.link = link;
    await dbPut('wishlist', rec);
    wishlist.push(rec);
    addedWish++;
  }
  items.sort((a, b) => a.created - b.created);
  renderCloset(); renderOutfits(); renderPicker(); renderWishlist();
  $('backupInfo').textContent = `Aktuell gespeichert: ${items.length} Teile, ${outfits.length} Outfits, ${wishlist.length} Wünsche.`;
  toast(addedItems || addedOutfits || addedWish
    ? `${addedItems} Teile, ${addedOutfits} Outfits und ${addedWish} Wünsche hinzugefügt`
    : 'Alles aus dem Backup war schon vorhanden');
}
$('backupFile').addEventListener('change', (e) => { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; });
const drop = $('backupDrop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) importBackup(e.dataTransfer.files[0]); });
