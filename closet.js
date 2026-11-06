// Schrank (Teil der App, Reihenfolge siehe index.html)
/* ---------- Schrank ---------- */
function renderCloset() {
  renderChips($('closetFilter'), 'closetFilter', renderCloset);
  // Beim Hochladen gleich die Kategorie vorauswählen, die gerade angezeigt wird
  const f = state.closetFilter;
  if (f !== 'Alle' && !(GROUPS[f] && GROUPS[f].includes($('uploadCategory').value))) {
    $('uploadCategory').value = uploadCategoryFor(f);
  }
  const grid = $('closetGrid');
  grid.innerHTML = '';
  const q = state.search.trim().toLowerCase();
  const hit = (i) => !q || [i.name, i.brand, i.category, i.size, i.sku, i.note].some((v) => v && String(v).toLowerCase().includes(q));
  const list = items.filter((i) => matchesFilter(i, state.closetFilter) && hit(i));
  list.forEach((it) => {
    const card = document.createElement('button');
    card.className = 'card';
    card.innerHTML = `<div class="img"><img alt=""></div><div class="meta"><b></b><span></span><i class="note"></i></div>`;
    card.querySelector('img').src = urlFor(it);
    card.querySelector('b').textContent = it.name;
    card.querySelector('span').textContent = [it.category, visLabel(it, 'items')].filter(Boolean).join(' · ');
    card.querySelector('.note').textContent = it.note || '';
    card.onclick = () => openItemDialog(it);
    grid.appendChild(card);
  });
  $('closetEmpty').classList.toggle('show', list.length === 0);
  $('closetEmpty').textContent = items.length === 0
    ? 'Dein Schrank ist noch leer. Tippe unten auf +, um das erste Teil hinzuzufügen.'
    : (q ? 'Nichts gefunden.' : 'Keine Teile in dieser Kategorie.');
}
