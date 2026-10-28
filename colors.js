// Farblexikon: Kombinationen, die bei Kleidung zuverlässig zusammenpassen
const C = {
  schwarz: ['Schwarz', '#1a1a1a'], weiss: ['Weiß', '#ffffff'], grau: ['Grau', '#8c8c8c'], hellgrau: ['Hellgrau', '#d9d9d9'],
  creme: ['Creme', '#f2ead9'], beige: ['Beige', '#d8c3a5'], sand: ['Sand', '#c9b48f'], camel: ['Camel', '#b98a52'],
  braun: ['Braun', '#6b4a32'], navy: ['Navy', '#1f2a44'], jeans: ['Jeansblau', '#4a6a94'], hellblau: ['Hellblau', '#a9c4e0'],
  oliv: ['Oliv', '#6b6f3a'], khaki: ['Khaki', '#a39a6b'], gruen: ['Dunkelgrün', '#2f4a3a'], bordeaux: ['Bordeaux', '#6d1f2f'],
  rot: ['Rot', '#c4202e'], rosa: ['Rosa', '#e8b4bc'], senf: ['Senf', '#d6a516'], terracotta: ['Terracotta', '#c1633f'],
};
const combo = (keys, tip) => ({ colors: keys.map((k) => C[k]), tip });

const COLOR_COMBOS = {
  2: [
    combo(['schwarz', 'weiss'], 'Der Klassiker. Passt immer und wirkt klar und ruhig.'),
    combo(['navy', 'beige'], 'Zeitlos und edel, ein Liebling für Hose und Oberteil.'),
    combo(['oliv', 'creme'], 'Weich und erdig, besonders gut für Herbst.'),
    combo(['grau', 'bordeaux'], 'Das dunkle Rot setzt einen Akzent, Grau hält es ruhig.'),
    combo(['camel', 'weiss'], 'Hell und warm, wirkt sofort gepflegt.'),
    combo(['braun', 'hellblau'], 'Überraschend frisch, Denim-Looks lassen sich so aufwerten.'),
    combo(['schwarz', 'rot'], 'Mutig und stark. Eine der beiden Farben sparsam einsetzen.'),
    combo(['navy', 'weiss'], 'Sauber und maritim, geht im Sommer wie im Winter.'),
    combo(['khaki', 'schwarz'], 'Militärisch und lässig, gut für Cargo und Streetwear.'),
    combo(['rosa', 'grau'], 'Sanft und modern, Grau macht Rosa erwachsen.'),
    combo(['gruen', 'beige'], 'Natürlich und ruhig, wirkt hochwertig.'),
    combo(['jeans', 'weiss'], 'Denim auf Weiß: einfach, frisch, kaum falsch zu machen.'),
    combo(['senf', 'navy'], 'Kräftiger Kontrast, Senf bringt Wärme in dunkle Looks.'),
    combo(['bordeaux', 'creme'], 'Elegant und weich, passt gut zu Wolle und Leder.'),
    combo(['terracotta', 'oliv'], 'Erdige Töne, die sich gegenseitig tragen.'),
    combo(['hellgrau', 'navy'], 'Kühl und ordentlich, ideal fürs Büro.'),
  ],
  3: [
    combo(['schwarz', 'weiss', 'grau'], 'Alles neutral: Basis für jeden Tag und leicht zu kombinieren.'),
    combo(['navy', 'weiss', 'camel'], 'Klassischer Preppy-Look mit warmem Akzent.'),
    combo(['oliv', 'beige', 'schwarz'], 'Outdoor trifft City, Schwarz erdet die Erdtöne.'),
    combo(['braun', 'creme', 'gruen'], 'Herbstlich und gemütlich, vieles davon liegt im Strick.'),
    combo(['grau', 'bordeaux', 'schwarz'], 'Düster und stylish, das Rot bleibt der Blickfang.'),
    combo(['jeans', 'weiss', 'sand'], 'Leichter Sommerlook, die Sandfarbe verbindet alles.'),
    combo(['khaki', 'schwarz', 'weiss'], 'Lässig mit klaren Kanten, gut für Sneaker-Outfits.'),
    combo(['senf', 'navy', 'creme'], 'Warmer Akzent zwischen ruhigem Dunkelblau und Creme.'),
    combo(['rosa', 'grau', 'weiss'], 'Zart und aufgeräumt, wirkt frisch statt süß.'),
    combo(['terracotta', 'beige', 'oliv'], 'Mediterran und erdig, besonders schön bei Leinen.'),
    combo(['schwarz', 'camel', 'creme'], 'Elegant und teuer wirkend, schöner Mantel-Look.'),
    combo(['gruen', 'braun', 'sand'], 'Natürliche Palette aus Wald und Holz.'),
  ],
};
