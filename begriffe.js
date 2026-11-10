// Verwandte Begriffe für die Suche (Teil der App, Reihenfolge siehe index.html)
// Wer „sneaker“ eingibt, findet auch Schuhe, Jordans usw.; „hoodie“ findet auch Pullover. Das ist ein Wörterbuch, keine KI:
// es antwortet sofort, funktioniert offline und lässt sich hier einfach erweitern.
// Jede Gruppe: `cat` ist die Kategorie, unter der solche Teile gespeichert werden (die Suche findet sie darüber),
// `terms` sind Wörter, die zu dieser Gruppe gehören (deutsch, englisch, Modelle). Das erste Wort ist der Hauptbegriff.
const TERM_GROUPS = [
  { cat: 'Schuhe', terms: ['sneaker', 'jordan', 'dunk', 'air force', 'yeezy', 'schuh', 'schuhe', 'turnschuh', 'sportschuh', 'shoe', 'shoes', 'air jordan', 'air max', 'samba', 'gazelle', 'campus', 'superstar', 'stan smith', 'new balance', 'converse', 'chucks', 'vans', 'boot', 'boots', 'stiefel', 'stiefelette', 'sandale', 'sandalen', 'slides', 'loafer', 'halbschuh', 'slipper'] },
  { cat: 'Pullover', terms: ['hoodie', 'pullover', 'pulli', 'kapuzenpullover', 'sweatshirt', 'hoody', 'kapuzenpulli', 'kapuze', 'sweater', 'crewneck', 'strickpullover', 'strick', 'cardigan', 'strickjacke', 'zip hoodie', 'zipper'] },
  { cat: 'Shirts', terms: ['shirt', 'shirts', 't-shirt', 'tshirt', 'tee', 'oberteil', 'top', 'longsleeve', 'langarmshirt', 'polo', 'poloshirt', 'hemd', 'bluse', 'trikot', 'jersey', 'tanktop'] },
  { cat: 'Jacken', terms: ['jacke', 'jacken', 'jacket', 'mantel', 'coat', 'parka', 'bomber', 'bomberjacke', 'windbreaker', 'windjacke', 'regenjacke', 'daunenjacke', 'puffer', 'pufferjacke', 'lederjacke', 'jeansjacke', 'denim jacket', 'fleece', 'weste', 'vest', 'anorak', 'trenchcoat', 'blazer', 'sakko', 'varsity'] },
  { cat: 'Hosen', terms: ['hose', 'hosen', 'jeans', 'pants', 'trousers', 'denim', 'cargo', 'cargohose', 'jogger', 'jogginghose', 'sweatpants', 'trainingshose', 'chino', 'chinos', 'shorts', 'kurze hose', 'leggings', 'baggy'] },
  { cat: 'Taschen', terms: ['tasche', 'taschen', 'bag', 'bags', 'rucksack', 'backpack', 'umhängetasche', 'crossbody', 'beutel', 'tote', 'shopper', 'gürteltasche', 'bauchtasche', 'handtasche', 'sporttasche', 'duffle'] },
  { cat: 'Caps', terms: ['cap', 'caps', 'kappe', 'mütze', 'beanie', 'hut', 'bucket hat', 'fischerhut', 'snapback', 'basecap', 'kopfbedeckung', 'schirmmütze'] },
  { cat: 'Gürtel', terms: ['gürtel', 'belt', 'belts', 'ledergürtel'] },
  { cat: 'Schmuck', terms: ['schmuck', 'kette', 'halskette', 'chain', 'ring', 'armband', 'bracelet', 'ohrring', 'ohrringe', 'earrings', 'uhr', 'watch', 'anhänger', 'necklace'] },
];

const MAX_VARIANTS = 5; // so viele Suchanfragen gehen höchstens an den Server (die eingegebene zuerst)
const normTerm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Welche Wörter der Eingabe gehören zu einer Gruppe? Gibt { group, matched } zurück, matched ist der Teil der Eingabe.
// Passt, wenn Wort gleich ist, auch Mehrzahl („sneakers“), oder wenn der Anfang eines Wortes schon eindeutig ist („sneak“).
function termHits(query) {
  const q = normTerm(query), words = q.split(' ').filter(Boolean);
  const hits = [];
  for (const group of TERM_GROUPS) {
    let matched = null;
    for (const term of group.terms) {
      if (term.includes(' ')) { if (q.includes(term)) { matched = term; break; } continue; }
      const w = words.find((x) => x === term || (x.length >= 4 && term.startsWith(x)) || (term.length >= 4 && x.startsWith(term) && x.length - term.length <= 2));
      if (w) { matched = w; break; }
    }
    if (matched) hits.push({ group, matched });
  }
  return hits;
}

// Aus einer Eingabe mehrere Suchanfragen machen: die eingegebene zuerst, dann dieselbe Anfrage mit Kategorie und Synonymen.
// „nike sneaker“ → [„nike sneaker“, „nike schuhe“, „nike jordan“, …]. Unbekanntes bleibt unverändert.
function expandQuery(query) {
  const q = normTerm(query);
  const out = [q];
  if (q.length < 2) return out;
  const add = (v) => { v = normTerm(v); if (v && !out.includes(v) && out.length < MAX_VARIANTS) out.push(v); };
  for (const { group, matched } of termHits(q)) {
    const rest = q.replace(matched, ' ');
    const cat = normTerm(group.cat);
    // Wörter, die nur eine Form der Kategorie oder des gefundenen Wortes sind, bringen nichts Neues
    const same = (t) => t === matched || t.includes(cat) || cat.includes(t) || matched.includes(t) || t.includes(matched);
    const alternatives = [group.cat, ...group.terms.filter((t) => !same(t)).slice(0, 3)];
    for (const alt of alternatives) {
      add(rest.replace(/\s+/g, ' ').trim() ? rest + ' ' + alt : alt);
    }
  }
  return out;
}
