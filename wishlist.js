// Wunschliste (Teil der App, Reihenfolge siehe index.html)
/* ---------- Wunschliste ---------- */
// Nur echte Web-Links zulassen (http/https); „zalando.de/…“ wird zu „https://zalando.de/…“ ergänzt
function cleanLink(v) {
  v = (v || '').trim();
  if (!v) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = 'https://' + v;
  try {
    const u = new URL(v);
    return /^https?:$/.test(u.protocol) ? u.href : '';
  } catch (e) {
    return '';
  }
}
const hostOf = (href) => { try { return new URL(href).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };

// Reiter „Gemerkt“ im eigenen Profil: gespeicherte Teile oder Outfits anderer (Hülle heißt noch view-wishlist)
const saved = { kind: 'items', token: 0 };
async function renderWishlist() {
  if (state.view !== 'wishlist') return; // wird nur beim Öffnen des Reiters geladen
  const grid = $('savedGrid'), empty = $('savedEmpty');
  const token = ++saved.token;
  grid.replaceChildren();
  empty.classList.remove('show');
  const done = skeletons(grid, 6);
  try {
    const all = await Profile.feed('saved');
    if (token !== saved.token) return;
    done();
    const list = all.filter((r) => !!r.outfit === (saved.kind === 'outfits'));
    await Profile.showFeed(list, grid, saved.kind);
    empty.classList.toggle('show', list.length === 0);
    if (!list.length) {
      setEmpty(empty, saved.kind === 'outfits'
        ? { ic: 'outfit', title: 'Noch keine Outfits gemerkt', text: 'Auf der Seite eines Outfits kannst du es mit „Merken“ speichern.' }
        : { ic: 'heart', title: 'Noch keine Teile gemerkt', text: 'Auf der Seite eines Teils kannst du es mit „Merken“ speichern.' });
    }
  } catch (e) {
    if (token !== saved.token) return;
    console.error(e);
    done();
    empty.classList.add('show');
    setEmpty(empty, navigator.onLine
      ? { ic: 'search', title: 'Gemerktes ist gerade nicht verfügbar', text: 'Bitte versuche es gleich noch einmal.' }
      : { ic: 'wifi', title: 'Keine Verbindung', text: 'Für Gemerktes brauchst du eine Internetverbindung.' });
  }
}
document.querySelectorAll('#savedSwitch .chip').forEach((c) => {
  c.onclick = () => {
    saved.kind = c.dataset.kind;
    document.querySelectorAll('#savedSwitch .chip').forEach((x) => x.classList.toggle('active', x === c));
    renderWishlist();
  };
});

const wishDlg = $('wishDialog');
let wishEditing = null;
function openWishDialog(w) {
  wishEditing = w;
  $('wishPreview').src = urlFor(w);
  $('wishName').value = w.name;
  $('wishCategory').value = w.category;
  $('wishNote').value = w.note || '';
  $('wishLink').value = w.link || '';
  fillDetails('wsd', w);
  $('wishMatches').replaceChildren();
  wishDlg.showModal();
}
$('wishCancel').onclick = () => wishDlg.close();
$('wishFind').onclick = () => Profile.findFor({ name: $('wishName').value, brand: $('wsdbrand').value, size: $('wsdsize').value }, $('wishMatches'), () => wishDlg.close());
// Übernimmt die Eingaben aus dem Dialog; false, wenn der Link nicht stimmt
function applyWishFields(w) {
  const raw = $('wishLink').value.trim();
  const link = cleanLink(raw);
  if (raw && !link) { toast('Der Link sieht nicht richtig aus'); return false; }
  readDetails('wsd', 'wishlist', w);
  w.name = $('wishName').value.trim() || w.name;
  w.category = $('wishCategory').value;
  const note = $('wishNote').value.trim().slice(0, 120);
  if (note) w.note = note; else delete w.note;
  if (link) w.link = link; else delete w.link;
  return true;
}
$('wishSave').onclick = async () => {
  const w = wishEditing;
  if (!applyWishFields(w)) return;
  await dbPut('wishlist', w);
  wishDlg.close();
  renderWishlist();
};
$('wishDelete').onclick = async () => {
  const w = wishEditing;
  if (!(await askConfirm(`„${w.name}“ von der Wunschliste löschen?`))) return;
  await dbDel('wishlist', w.id);
  wishlist = wishlist.filter((x) => x.id !== w.id);
  if (urls.has(w.id)) { URL.revokeObjectURL(urls.get(w.id)); urls.delete(w.id); }
  wishDlg.close();
  renderWishlist();
};
// Gekauft: das Teil wandert von der Wunschliste in den Schrank (Preis-Notiz bleibt, der Link entfällt)
$('wishBought').onclick = async () => {
  const w = wishEditing;
  if (!applyWishFields(w)) return;
  const rec = { id: w.id, name: w.name, category: w.category, blob: w.blob, created: Date.now() };
  if (w.source) { rec.source = w.source; rec.srcBox = w.srcBox; }
  if (w.note) rec.note = w.note;
  // Marke, Modell, Größe usw. wandern mit; der Schrank-Eintrag startet immer privat
  setDetails(rec, cleanDetails({ ...w, vis: 'private' }, 'items'));
  await dbPut('items', rec);
  await dbDel('wishlist', w.id);
  items.push(rec);
  wishlist = wishlist.filter((x) => x.id !== w.id);
  wishDlg.close();
  renderWishlist(); renderCloset(); renderPicker();
  toast('In den Schrank gelegt');
};
