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

function renderWishlist() {
  renderChips($('wishFilter'), 'wishFilter', renderWishlist);
  const f = state.wishFilter;
  if (f !== 'Alle' && !(GROUPS[f] && GROUPS[f].includes($('wishUploadCategory').value))) {
    $('wishUploadCategory').value = uploadCategoryFor(f);
  }
  const grid = $('wishGrid');
  grid.innerHTML = '';
  const list = wishlist.filter((w) => matchesFilter(w, f));
  list.forEach((w) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="img" tabindex="0" role="button"><img alt=""></div><div class="meta"><b></b><span></span><i class="note"></i></div>';
    card.querySelector('img').src = urlFor(w);
    card.querySelector('b').textContent = w.name;
    card.querySelector('span').textContent = [w.category, visLabel(w, 'wishlist')].filter(Boolean).join(' · ');
    card.querySelector('.note').textContent = w.note || '';
    if (w.link && cleanLink(w.link)) {
      const a = document.createElement('a');
      a.className = 'shop';
      a.href = w.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'Zum Shop · ' + hostOf(w.link) + ' ↗';
      card.querySelector('.meta').appendChild(a);
    }
    card.onclick = (e) => { if (!e.target.closest('a')) openWishDialog(w); };
    card.querySelector('.img').onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openWishDialog(w); } };
    grid.appendChild(card);
  });
  $('wishEmpty').classList.toggle('show', list.length === 0);
  $('wishEmpty').textContent = wishlist.length === 0
    ? 'Deine Wunschliste ist noch leer. Tippe unten auf +, um ein Teil hinzuzufügen, das du kaufen willst.'
    : 'Keine Teile in dieser Kategorie.';
}

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
