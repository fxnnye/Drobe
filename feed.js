// Navigation, Feed und Filter-Chips (Teil der App, Reihenfolge siehe index.html)
/* ---------- Navigation ---------- */
document.querySelectorAll('.add-btn').forEach((b) => { b.onclick = () => showView('add'); }); // Plus neben den Kategorien (nur Computer)
$('addBack').onclick = () => showView(state.addFrom && state.addFrom !== 'add' ? state.addFrom : 'closet');
// Obere Reiter: Feed, Suche, Hinzufügen, Nachrichten, Profil. Schrank, Outfits und Gemerkt sind Unterseiten von „Profil“.
const ME_VIEWS = ['closet', 'outfits', 'saved', 'followers', 'following'];
const topTab = (name) => (name === 'builder' || ME_VIEWS.includes(name) ? 'me' : name);
// Ohne Konto sind nur Feed und Suche offen; alles andere verlangt die Anmeldung
const isGuest = () => document.body.classList.contains('guest');
async function loginGate(what) {
  if (await askConfirm('Um ' + what + ' zu nutzen, musst du dich anmelden.', 'Anmelden')) $('guestLogin').click();
}
const GATE_TEXT = { messages: 'Nachrichten', me: 'dein Profil', add: 'das Hinzufügen' };
// Schwarzer Strich unter „Schrank / Outfits / Gemerkt“ (Handy): gleitet zum aktiven Reiter, statt zu springen
function placeIndicator(bar) {
  const a = bar && bar.querySelector('.subtab.active');
  if (!a || !bar.offsetWidth) return;
  const first = !bar.dataset.placed;
  if (first) bar.classList.add('no-anim');
  bar.style.setProperty('--ind-x', a.offsetLeft + 'px');
  bar.style.setProperty('--ind-w', a.offsetWidth + 'px');
  if (first) { bar.dataset.placed = '1'; void bar.offsetWidth; bar.classList.remove('no-anim'); }
}
const placeSubInd = () => placeIndicator(document.querySelector('#meBar .subtabs'));
window.addEventListener('resize', placeSubInd);
// Seiten und Fenster wachsen aus der angetippten Karte heraus (Teil, Outfit, Profil, eigenes Teil)
let growFrom = null;
document.addEventListener('click', (e) => {
  const c = e.target.closest && e.target.closest('.card, .grid > *');
  growFrom = c ? { rect: (c.querySelector('.img, img') || c).getBoundingClientRect(), t: Date.now() } : null;
}, true);
function growIn(node, fromTop) {
  const o = growFrom; growFrom = null;
  if (!o || Date.now() - o.t > 1500 || !node.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const b = node.getBoundingClientRect();
  if (!b.width || !o.rect.width) return;
  const dx = o.rect.left + o.rect.width / 2 - (b.left + b.width / 2);
  const dy = fromTop ? o.rect.top + o.rect.height / 2 - b.top : o.rect.top + o.rect.height / 2 - (b.top + b.height / 2);
  const sc = Math.max(0.3, Math.min(0.6, o.rect.width / b.width * 1.2));
  node.style.transformOrigin = fromTop ? '50% 0' : '';
  const a = node.animate([
    { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sc + ')', opacity: 0, borderRadius: '28px' },
    { opacity: 1, offset: 0.35 },
    { transform: 'none', opacity: 1, borderRadius: '0px' },
  ], { duration: 400, easing: 'cubic-bezier(.23, 1, .32, 1)' });
  a.onfinish = a.oncancel = () => { node.style.transformOrigin = ''; };
}
function showView(name) {
  if (isGuest() && !['feed', 'search'].includes(name)) { loginGate(GATE_TEXT[name] || 'diese Funktion'); return; }
  if (name === 'me') name = state.lastMe || 'closet';
  const prev = state.view;
  if (prev === 'feed' && name !== 'feed') feed.scrollY = window.scrollY; // beim Zurückkommen wieder dort weitermachen
  state.view = name;
  if (['closet', 'outfits', 'saved'].includes(name)) state.lastMe = name;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === topTab(name)));
  document.querySelectorAll('.subtab').forEach((t) => t.classList.toggle('active', t.dataset.sub === (name === 'builder' ? 'outfits' : name)));
  $('meBar').hidden = !ME_VIEWS.includes(name);
  placeSubInd();
  document.body.classList.toggle('not-feed', name !== 'feed'); // Logo nur im Feed
  if (name === 'add') { state.addFrom = prev === 'add' ? state.addFrom : prev; }
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
  if (name === 'builder') { renderPicker(); renderStage(); }
  // Zurück zum Feed (z. B. vom Profil): Der geladene Feed bleibt stehen und wird nicht neu geholt. Ein Tipp auf „Feed“ im Feed oder ein alter Stand (über 10 Minuten) lädt neu.
  const keepFeed = name === 'feed' && prev !== 'feed' && !!feed.loadedAt && Date.now() - feed.loadedAt < 10 * 60 * 1000 && $('feedGrid').children.length > 0 && !feed.loading;
  if (name === 'feed' && !keepFeed) loadFeed(true);
  if (name === 'saved') renderSaved();
  if (name === 'messages') Profile.leaveThread(), Profile.loadInbox(true);
  if (name === 'search') { renderHistory(); runSearch(); if (matchMedia('(pointer: fine)').matches) $('soInput').focus(); }
  if (name === 'followers' || name === 'following') Profile.loadPeople(name, $(name === 'followers' ? 'followersList' : 'followingList'));
  if (ME_VIEWS.includes(name)) renderMeHead();
  window.scrollTo(0, keepFeed ? (feed.scrollY || 0) : 0);
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
// Tipp auf „JAWNZ“ oben links: wie der Reiter Feed (verlässt auch ein geöffnetes Profil)
const logo = document.querySelector('.top h1');
logo.setAttribute('role', 'link'); logo.tabIndex = 0; logo.setAttribute('aria-label', 'JAWNZ, zum Feed');
logo.onclick = () => document.querySelector('.tab[data-view=feed]').click();
logo.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); logo.onclick(); } };
document.querySelectorAll('.subtab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.sub)));
$('meFollowers').onclick = () => Profile.openPeople('followers');
$('meFollowing').onclick = () => Profile.openPeople('following');
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
const feed = { kind: 'items', ranked: false, before: null, loading: false, seen: new Set(), stageChecked: false };
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
      feed.ranked = true;
      if (feed.kind === 'items') feed.kind = 'foryou';
      paintFeedKind();
    }
  }
  const kind = feed.kind;
  const done = skeletons(grid, reset ? 8 : 4);
  try {
    const list = await Profile.feed(kind, feed.before, feed.color);
    if (kind !== feed.kind) return; // inzwischen umgeschaltet
    done();
    // „Für dich“ wird nach Punkten sortiert: beim Nachladen kann sich die Reihenfolge verschieben, Doppelte fallen weg
    const fresh = kind === 'foryou' ? list.filter((r) => { const k = (r.outfit ? 'o/' : 'i/') + r.username + '/' + r.id; if (feed.seen.has(k)) return false; feed.seen.add(k); return true; }) : list;
    await Profile.showFeed(fresh, grid, kind);
    if (reset) feed.loadedAt = Date.now();
    if (list.length) feed.before = kind === 'foryou' ? (feed.before || 0) + list.length : list[list.length - 1].ts;
    more.hidden = kind === 'picks' || list.length < 30;
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
  if (kind === 'picks') setEmpty(e, { ic: 'closet', title: 'Noch keine Staff Picks', text: 'Das JAWNZ-Team wählt hier bald Teile aus.' });
  else if (kind === 'saved') setEmpty(e, { ic: 'heart', title: 'Noch nichts gemerkt', text: 'Auf der Seite eines Teils kannst du es mit „Merken“ speichern.' });
  else if (kind === 'outfits') setEmpty(e, { ic: 'outfit', title: 'Noch keine Outfits von anderen', text: 'Sobald jemand ein Outfit öffentlich stellt, erscheint es hier.' });
  else setEmpty(e, { ic: 'closet', title: 'Noch keine Teile von anderen', text: 'Sobald jemand etwas freigibt, erscheint es hier.', cta: 'Eigenes Teil hinzufügen', fn: () => showView('add') });
}
$('feedRetry').onclick = () => loadFeed(false);
// Umschalten zwischen den Reitern und den Staff Picks (Flammen-Knopf oben rechts)
function paintFeedKind() {
  document.querySelectorAll('#feedSwitch .chip').forEach((x) => x.classList.toggle('active', feed.kind !== 'picks' && x.dataset.kind === (feed.kind === 'items' ? 'foryou' : feed.kind)));
  $('picksBtn').classList.toggle('active', feed.kind === 'picks');
  $('picksBtn').setAttribute('aria-pressed', feed.kind === 'picks' ? 'true' : 'false');
  $('picksNote').hidden = feed.kind !== 'picks';
}
document.querySelectorAll('#feedSwitch .chip').forEach((c) => {
  c.onclick = () => {
    if (isGuest() && c.dataset.kind === 'saved') { loginGate('„Gemerkt“'); return; }
    feed.kind = c.dataset.kind === 'foryou' && !feed.ranked ? 'items' : c.dataset.kind; // „Für dich“ ist anfangs einfach die Liste der Teile
    paintFeedKind();
    loadFeed(true);
  };
});
document.addEventListener('picks-changed', () => { feed.loadedAt = 0; });
$('picksBtn').onclick = () => {
  feed.kind = feed.kind === 'picks' ? (feed.ranked ? 'foryou' : 'items') : 'picks';
  paintFeedKind();
  loadFeed(true);
};
$('feedMore').onclick = () => loadFeed(false);

/* ---------- Filter-Chips ---------- */
// Filterwert ist eine Hauptkategorie, eine Unterkategorie oder „Alle“
const matchesFilter = (it, f) => f === 'Alle' || it.category === f || !!GROUPS[f]?.includes(it.category);
const inGroup = (f) => GROUPS[f] ? f : Object.keys(GROUPS).find((g) => GROUPS[g].includes(f));

function renderChips(el, key, onChange) {
  const prevScroll = el.scrollLeft, prevIdx = el._idx;
  const oldSub = el.querySelector(':scope > .subchips'), oldGroup = el._group; // wird beim Wechsel weich ausgeblendet
  const idx = ['Alle', ...TOP].indexOf(inGroup(state[key]) || state[key]);
  el._idx = idx;
  // Wechselt die Hauptkategorie, rückt die Reihe (am Handy) in Klickrichtung so weit, dass die Nachbarn links und rechts der gewählten Kategorie noch ganz zu sehen und anzutippen sind
  const nudge = (sel, after) => {
    el.scrollLeft = prevScroll;
    if (!window.matchMedia('(max-width: 700px)').matches || !sel || idx === prevIdx && prevIdx != null) return;
    const x = (n) => n.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
    const prev = sel.previousElementSibling, next = after !== undefined ? after : sel.nextElementSibling; // mit Unterkategorien ist der rechte Nachbar die nächste Hauptkategorie hinter dem Block
    const gap = 12, view = el.clientWidth;
    const L = Math.max(0, x(prev || sel) - gap), R = x(next || sel) + (next || sel).offsetWidth + gap;
    let t = prevScroll;
    if (prevIdx == null || idx > prevIdx) { if (L < t) t = L; if (R > t + view) t = R - view; }
    else { if (R > t + view) t = R - view; if (L < t) t = L; }
    t = Math.max(0, t);
    if (t === prevScroll) return;
    // Eigene Bewegung statt scrollTo: der Block wächst gerade noch, das Ziel liegt anfangs außerhalb des Scrollbereichs
    const t0 = performance.now(), dur = 300;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.scrollLeft = prevScroll + (t - prevScroll) * e;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  // Der alte Unterkategorien-Block bleibt kurz als Kopie stehen und blendet aus, statt plötzlich zu verschwinden
  const leave = (chips, group) => {
    if (!oldSub || !oldGroup || oldGroup === group) return;
    oldSub.classList.remove('enter'); oldSub.classList.add('leave'); oldSub.setAttribute('inert', ''); oldSub.style.animation = '';
    if (window.matchMedia('(max-width: 700px)').matches && chips[oldGroup]) chips[oldGroup].after(oldSub); else el.appendChild(oldSub);
    setTimeout(() => oldSub.remove(), 380);
  };
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
  const fresh = el._group !== group; // Block nur beim Öffnen einblenden, nicht bei jedem Antippen einer Unterkategorie
  el._group = group || null;
  if (!group) { nudge(chips[state[key]]); leave(chips, null); return; }
  const sub = document.createElement('div');
  sub.className = 'subchips' + (fresh ? ' enter' : '');
  chip(sub, 'Alle ' + group, group);
  GROUPS[group].forEach((c) => chip(sub, c, c));
  if (window.matchMedia('(max-width: 700px)').matches || el.closest('.filter-row')) {
    // Handy und Schrank am Computer: der Block mit den Unterkategorien (untereinander) steht direkt rechts neben der gewählten Hauptkategorie
    chips[group].after(sub);
    sub.style.animation = 'none'; // für die Messung die Endgröße verwenden
    nudge(chips[group], sub.nextElementSibling || sub); // ohne Nachbarn rechts: der Unterkategorien-Block selbst (nur am Handy)
    void sub.offsetWidth; sub.style.animation = '';
  } else { // Outfit-Auswahl am Computer: zweite Reihe darunter
    el.appendChild(sub);
  }
  leave(chips, group);
}
// Kategorie, die beim Hochladen zum aktuellen Filter passt
const uploadCategoryFor = (f) => DEFAULT_SUB[f] || f;
function fillSelect(sel) {
  const opt = (c) => `<option>${c}</option>`;
  sel.innerHTML = TOP.map((c) => GROUPS[c]
    ? `<optgroup label="${c}">${GROUPS[c].map(opt).join('')}</optgroup>` : opt(c)).join('');
}

// Untere Leiste (Handy): runder Hintergrund gleitet zum aktiven Reiter
(() => {
  const nav = document.querySelector('nav.tabs');
  if (!nav) return;
  const pill = document.createElement('span');
  pill.className = 'tab-pill';
  pill.setAttribute('aria-hidden', 'true');
  nav.prepend(pill);
  const place = (animate) => {
    if (nav.offsetHeight) document.documentElement.style.setProperty('--tabs-h', nav.offsetHeight + 'px');
    const a = nav.querySelector('.tab.active');
    if (!a || !a.offsetWidth) { pill.style.opacity = '0'; return; }
    pill.style.transition = animate ? '' : 'none';
    pill.style.opacity = '1';
    pill.style.width = a.offsetWidth + 'px';
    pill.style.transform = 'translateX(' + a.offsetLeft + 'px)';
  };
  let last = null;
  const sync = () => {
    const a = nav.querySelector('.tab.active');
    place(last !== null);
    last = a;
  };
  new MutationObserver(sync).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
  if (window.ResizeObserver) new ResizeObserver(() => place(false)).observe(nav);
  window.addEventListener('resize', () => place(false));
  window.addEventListener('orientationchange', () => setTimeout(() => place(false), 200));
  setTimeout(sync, 0);
})();

// „Zurück“ wie in einer App (Handy): die Seite wird nach rechts weggewischt, per Tipp auf Zurück oder per Wischen vom linken Rand
(() => {
  const mq = matchMedia('(max-width: 700px)');
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const visible = (b) => b && b.offsetParent !== null && b.getBoundingClientRect().width > 0;
  // sichtbarer Zurück-Knopf und die Seite, die er schließt
  function current() {
    if (document.querySelector('dialog[open]')) return null; // kleine Fenster: außerhalb tippen schließt sie, kein Wischen
    const btns = [...document.querySelectorAll('#publicView .back-btn, #threadPane .back-btn, .view.active .back-btn')].filter(visible);
    const b = btns[0];
    if (!b) return null;
    const page = b.closest('#publicView') || b.closest('#threadPane') || b.closest('.view');
    return page ? { btn: b, page, close: () => b.click() } : null;
  }
  const OUT = 'transform .24s var(--ease-out), opacity .24s ease';
  // Die Seite wird als Abbild darübergelegt und bewegt; darunter wird die vorherige Seite sichtbar
  function startPeek(c) {
    if (c.ghost) return c.ghost;
    const rc = c.page.getBoundingClientRect(), cs = getComputedStyle(c.page);
    const gh = c.page.cloneNode(true);
    gh.classList.add('ghost');
    gh.removeAttribute('hidden');
    gh.inert = true;
    gh.style.cssText = 'top:' + rc.top + 'px;padding-left:' + (parseFloat(cs.paddingLeft) + rc.left) + 'px;padding-right:' + (parseFloat(cs.paddingRight) + innerWidth - rc.right) + 'px';
    const src = c.page.querySelector('.thread-msgs'), dst = gh.querySelector('.thread-msgs');
    document.body.append(gh);
    if (src && dst) dst.scrollTop = src.scrollTop;
    c.page.style.visibility = 'hidden';
    document.body.classList.add('peek');
    if (c.page.classList.contains('view')) { const u = document.getElementById('view-' + (state.lastMe || 'closet')); if (u && u !== c.page) { u.classList.add('peek-under'); c.under = u; c.page.style.display = 'none'; } }
    c.ghost = gh;
    return gh;
  }
  function endPeek(c) {
    if (!c.ghost) return;
    c.ghost.remove(); c.ghost = null;
    c.page.style.visibility = '';
    if (c.under) { c.under.classList.remove('peek-under'); c.under = null; c.page.style.display = ''; }
    document.body.classList.remove('peek');
  }
  function slideOut(c) {
    const { btn } = c, gh = startPeek(c);
    void gh.offsetWidth;
    gh.style.transition = OUT;
    gh.style.transform = 'translateX(100%)';
    gh.style.opacity = '.6';
    if (btn) btn.dataset.go = '1';
    setTimeout(() => { c.close(); if (btn) delete btn.dataset.go; setTimeout(() => endPeek(c), 30); }, calm.matches ? 0 : 200);
  }
  // Tipp auf Zurück: erst wegwischen, dann zurück
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.back-btn');
    if (!b || b.dataset.go || !mq.matches || calm.matches) return;
    const c = current();
    if (!c || c.btn !== b) return;
    e.stopImmediatePropagation(); e.preventDefault();
    slideOut(c);
  }, true);
  // Wischen vom linken Rand
  let g = null;
  document.addEventListener('touchstart', (e) => {
    g = null;
    if (!mq.matches || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.clientX > 30) return;
    const c = current();
    if (c) g = { c, x: t.clientX, y: t.clientY, t: Date.now(), on: false, dead: false };
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!g || g.dead) return;
    const t = e.touches[0], dx = t.clientX - g.x, dy = t.clientY - g.y;
    if (!g.on) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { g.dead = true; return; }
      if (dx > 10) { g.on = true; g.gh = startPeek(g.c); g.gh.style.transition = 'none'; } else return;
    }
    e.preventDefault();
    g.gh.style.transform = 'translateX(' + Math.max(0, dx) + 'px)';
  }, { passive: false });
  const end = (e) => {
    if (!g || !g.on) { g = null; return; }
    const t = e.changedTouches[0], dx = t.clientX - g.x, v = dx / Math.max(1, Date.now() - g.t);
    const c = g.c; g = null;
    if (dx > innerWidth * 0.33 || v > 0.6) slideOut(c);
    else { c.ghost.style.transition = 'transform .25s var(--ease-out)'; c.ghost.style.transform = 'translateX(0)'; setTimeout(() => endPeek(c), 260); }
  };
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);
})();
