// Navigation, Feed und Filter-Chips (Teil der App, Reihenfolge siehe index.html)
/* ---------- Navigation ---------- */
document.querySelectorAll('.add-btn').forEach((b) => { b.onclick = () => showView('add'); }); // Plus neben den Kategorien
$('addBack').onclick = () => showView(state.addFrom && state.addFrom !== 'add' ? state.addFrom : 'closet');
// Obere Reiter: Feed, Suche, Hinzufügen, Nachrichten, Profil. Schrank, Outfits und Gemerkt sind Unterseiten von „Profil“.
const ME_VIEWS = ['closet', 'outfits', 'saved', 'followers', 'following'];
const topTab = (name) => (name === 'builder' || ME_VIEWS.includes(name) ? 'me' : name);
// Ohne Konto sind nur Feed und Suche offen; alles andere verlangt die Anmeldung
const isGuest = () => document.body.classList.contains('guest');
async function loginGate(what) {
  if (await askConfirm('Um ' + what + ' zu nutzen, musst du dich anmelden.', 'Anmelden')) $('guestLogin').click();
}
const GATE_TEXT = { messages: 'Nachrichten', me: 'dein Profil' };
function showView(name) {
  if (isGuest() && !['feed', 'search'].includes(name)) { loginGate(GATE_TEXT[name] || 'diese Funktion'); return; }
  if (name === 'me') name = state.lastMe || 'closet';
  const prev = state.view;
  state.view = name;
  if (['closet', 'outfits', 'saved'].includes(name)) state.lastMe = name;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === topTab(name)));
  document.querySelectorAll('.subtab').forEach((t) => t.classList.toggle('active', t.dataset.sub === (name === 'builder' ? 'outfits' : name)));
  $('meBar').hidden = !ME_VIEWS.includes(name);
  if (name === 'add') { state.addFrom = prev === 'add' ? state.addFrom : prev; }
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
  if (name === 'builder') { renderPicker(); renderStage(); }
  if (name === 'feed') loadFeed(true);
  if (name === 'saved') renderSaved();
  if (name === 'messages') Profile.leaveThread(), Profile.loadInbox(true);
  if (name === 'search') { renderHistory(); runSearch(); if (matchMedia('(pointer: fine)').matches) $('soInput').focus(); }
  if (name === 'followers' || name === 'following') Profile.loadPeople(name, $(name === 'followers' ? 'followersList' : 'followingList'));
  if (ME_VIEWS.includes(name)) renderMeHead();
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
// Tipp auf „JAWNZ“ oben links: wie der Reiter Feed (verlässt auch ein geöffnetes Profil)
const logo = document.querySelector('.top h1');
logo.setAttribute('role', 'link'); logo.tabIndex = 0; logo.setAttribute('aria-label', 'JAWNZ, zum Feed');
logo.onclick = () => document.querySelector('.tab[data-view=feed]').click();
logo.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); logo.onclick(); } };
document.querySelectorAll('.subtab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.sub)));
$('meFollowers').onclick = () => showView('followers');
$('meFollowing').onclick = () => showView('following');
document.querySelectorAll('[data-back-me]').forEach((b) => { b.onclick = () => showView('me'); });

function renderMeHead() {
  const u = Cloud.user();
  const name = u ? u.name : '';
  $('meName').textContent = name;
  Profile.paintOwnAvatars();
  const n = (k, one, many) => k + ' ' + (k === 1 ? one : many);
  $('meCounts').textContent = [n(items.length, 'Teil', 'Teile'), n(outfits.length, 'Outfit', 'Outfits')].join(' · ');
  $('meProfile').hidden = !u;
}

/* ---------- Feed: öffentliche Teile oder Outfits anderer, neueste zuerst ---------- */
const feed = { kind: 'items', before: null, loading: false, seen: new Set(), stageChecked: false };
async function loadFeed(reset) {
  if (feed.loading) return;
  const grid = $('feedGrid'), empty = $('feedEmpty'), more = $('feedMore'), retry = $('feedRetry');
  if (reset) { feed.before = null; feed.seen = new Set(); grid.replaceChildren(); }
  feed.loading = true;
  retry.hidden = true;
  empty.hidden = true;
  if (!feed.stageChecked) { // „Für dich“ erscheint erst, wenn genug aktive Nutzer da sind, und ist dann der Start-Reiter
    feed.stageChecked = true;
    if ((await Profile.feedStage()) >= 1) {
      const fy = document.querySelector('#feedSwitch [data-kind=foryou]');
      fy.hidden = false;
      if (feed.kind === 'items') {
        feed.kind = 'foryou';
        document.querySelectorAll('#feedSwitch .chip').forEach((x) => x.classList.toggle('active', x === fy));
      }
    }
  }
  const kind = feed.kind;
  if (reset) { // Flex of the Week steht über den Teilen, nicht bei Outfits, Gemerkt und Folge ich
    if (kind === 'items' || kind === 'foryou') Profile.showFlex($('flexBox')).catch((e) => console.error(e));
    else $('flexBox').hidden = true;
  }
  const done = skeletons(grid, reset ? 8 : 4);
  try {
    const list = await Profile.feed(kind, feed.before, feed.color);
    if (kind !== feed.kind) return; // inzwischen umgeschaltet
    done();
    // „Für dich“ wird nach Punkten sortiert: beim Nachladen kann sich die Reihenfolge verschieben, Doppelte fallen weg
    const fresh = kind === 'foryou' ? list.filter((r) => { const k = (r.outfit ? 'o/' : 'i/') + r.username + '/' + r.id; if (feed.seen.has(k)) return false; feed.seen.add(k); return true; }) : list;
    await Profile.showFeed(fresh, grid, kind);
    if (list.length) feed.before = kind === 'foryou' ? (feed.before || 0) + list.length : list[list.length - 1].ts;
    more.hidden = list.length < 30;
    empty.hidden = grid.children.length > 0;
    feedEmptyState(kind);
  } catch (e) {
    console.error(e);
    more.hidden = true;
    empty.hidden = false;
    setEmpty(empty, navigator.onLine
      ? { ic: 'search', title: 'Der Feed ist gerade nicht verfügbar', text: 'Bitte versuche es gleich noch einmal.' }
      : { ic: 'wifi', title: 'Keine Verbindung', text: 'Für den Feed brauchst du eine Internetverbindung.' });
    retry.hidden = false;
  } finally { done(); feed.loading = false; }
}
// Leerer Feed: sagt, warum, und bietet den nächsten Schritt an
function feedEmptyState(kind) {
  const e = $('feedEmpty');
  if (kind === 'saved') setEmpty(e, { ic: 'heart', title: 'Noch nichts gemerkt', text: 'Auf der Seite eines Teils kannst du es mit „Merken“ speichern.' });
  else if (kind === 'outfits') setEmpty(e, { ic: 'outfit', title: 'Noch keine Outfits von anderen', text: 'Sobald jemand ein Outfit öffentlich stellt, erscheint es hier.' });
  else setEmpty(e, { ic: 'closet', title: 'Noch keine Teile von anderen', text: 'Sobald jemand etwas freigibt, erscheint es hier.', cta: 'Eigenes Teil hinzufügen', fn: () => showView('add') });
}
$('feedRetry').onclick = () => loadFeed(false);
document.querySelectorAll('#feedSwitch .chip').forEach((c) => {
  c.onclick = () => {
    if (isGuest() && c.dataset.kind === 'saved') { loginGate('„Gemerkt“'); return; }
    feed.kind = c.dataset.kind;
    document.querySelectorAll('#feedSwitch .chip').forEach((x) => x.classList.toggle('active', x === c));
    loadFeed(true);
  };
});
$('feedMore').onclick = () => loadFeed(false);

/* ---------- Filter-Chips ---------- */
// Filterwert ist eine Hauptkategorie, eine Unterkategorie oder „Alle“
const matchesFilter = (it, f) => f === 'Alle' || it.category === f || !!GROUPS[f]?.includes(it.category);
const inGroup = (f) => GROUPS[f] ? f : Object.keys(GROUPS).find((g) => GROUPS[g].includes(f));

function renderChips(el, key, onChange) {
  el.innerHTML = '';
  const chip = (parent, label, value) => {
    const b = document.createElement('button');
    const group = inGroup(state[key]);
    const active = parent === el ? (state[key] === value || group === value) : state[key] === value;
    b.className = 'chip' + (active ? ' active' : '');
    b.textContent = label;
    b.onclick = () => { state[key] = value; onChange(); };
    parent.appendChild(b);
    return b;
  };
  const chips = {};
  ['Alle', ...TOP].forEach((c) => { chips[c] = chip(el, c, c); });
  const group = inGroup(state[key]);
  if (!group) return;
  const sub = document.createElement('div');
  sub.className = 'subchips';
  chip(sub, 'Alle ' + group, group);
  GROUPS[group].forEach((c) => chip(sub, c, c));
  if (window.matchMedia('(max-width: 700px)').matches) {
    // Am Handy steht der Block mit den Unterkategorien (untereinander) direkt rechts neben der gewählten Hauptkategorie
    chips[group].after(sub);
    el.scrollLeft = Math.max(0, chips[group].offsetLeft - 12);
  } else { // am Computer: zweite Reihe darunter
    el.appendChild(sub);
  }
}
// Kategorie, die beim Hochladen zum aktuellen Filter passt
const uploadCategoryFor = (f) => DEFAULT_SUB[f] || f;
function fillSelect(sel) {
  const opt = (c) => `<option>${c}</option>`;
  sel.innerHTML = TOP.map((c) => GROUPS[c]
    ? `<optgroup label="${c}">${GROUPS[c].map(opt).join('')}</optgroup>` : opt(c)).join('');
}
