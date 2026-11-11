// Gemerkt: im eigenen Profil die Teile und Outfits anderer, die du mit „Merken“ gespeichert hast (Teil der App, Reihenfolge siehe index.html)
// Reiter „Gemerkt“ im eigenen Profil: gespeicherte Teile oder Outfits anderer 
const saved = { kind: 'items', token: 0 };
async function renderSaved() {
  if (state.view !== 'saved') return; // wird nur beim Öffnen des Reiters geladen
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
    renderSaved();
  };
});
