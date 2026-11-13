// Sprache (Teil der App, lädt als Erstes nach errors.js, Reihenfolge siehe index.html)
// Deutsch ist die Quelle: die Texte stehen so im Code. Englisch kommt aus dieser Liste (deutscher Text → englischer Text).
// Fehlt ein Eintrag, bleibt der deutsche Text stehen. Neue Sprache = neue Liste, neuer Eintrag = eine Zeile.
// Nicht übersetzt werden die Rechtstexte (Impressum, Datenschutz, Nutzungsbedingungen): verbindlich ist die deutsche Fassung.
const LANGS = { de: 'Deutsch', en: 'English' };
const I18N = {
  en: {
    // Navigation, Feed, Suche
    'Feed': 'Feed', 'Suche': 'Search', 'Nachrichten': 'Messages', 'Profil': 'Profile', 'Einloggen': 'Log in', 'Registrieren': 'Sign up',
    'Für dich': 'For you', 'Teile': 'Items', 'Outfits': 'Outfits', 'Gemerkt': 'Saved', 'Mehr laden': 'Load more', 'Nochmal versuchen': 'Try again',
    'Flex of the Week': 'Flex of the Week', 'Artikel': 'Items', 'Mitglieder': 'Members', 'Alle': 'All', 'Öffentlich': 'Public', 'Kaufen': 'Buy', 'Verkaufen': 'Sell',
    'Farbe': 'Color', 'Zurück': 'Back', 'Senden': 'Send', 'Marke oder Teil suchen': 'Search brand or item', 'Benutzername suchen': 'Search username',
    // Profil, Schrank
    'Bearbeiten': 'Edit', 'Schrank': 'Closet', 'Auswählen': 'Select', 'Fertig': 'Done', 'Keine': 'None', 'Privat': 'Private',
    'Löschen': 'Delete', 'Nichts ausgewählt': 'Nothing selected', 'Tippe Teile an': 'Tap items', 'Tippe weitere Teile an': 'Tap more items', 'Hinzufügen': 'Add', 'Fotos': 'Photos', 'Artikeldetails': 'Item details', 'Fotos hochladen': 'Upload photos', 'Speichern': 'Save', 'Abbrechen': 'Cancel',
    'Schließen': 'Close', 'Überspringen': 'Skip', 'Weiter': 'Next', 'Neu': 'New', 'Entfernen': 'Remove', 'Melden': 'Report', 'Foto ändern': 'Change photo',
    'Profil bearbeiten': 'Edit profile', 'Profil-Link kopieren': 'Copy profile link', 'So sehen andere mein Profil': 'How others see my profile',
    'Zum Profil': 'Open profile', 'Ansehen': 'View', 'Merken': 'Save', 'Gemerkt ': 'Saved ',
    // Hinzufügen und Hochladen
    'Hinzufügen ': 'Add ', 'Klamotten hochladen': 'Upload clothes', 'Fotos auswählen': 'Choose photos',
    'Kategorie': 'Category', 'Name': 'Name', 'Marke *': 'Brand *', 'Mit Foto suchen': 'Search by photo', 'Ähnliche Teile zu deinem Foto': 'Items similar to your photo', 'Die Fotosuche hat nicht geklappt.': 'The photo search did not work.', 'Dafür musst du angemeldet sein': 'You need to be signed in for this', 'Suche ähnliche Teile … (beim ersten Mal wird ein kleines Bildmodell geladen)': 'Searching similar items … (a small image model is loaded the first time)', 'Name des Teils': 'Item name',  'Foto entfernen': 'Remove photo', '1 Foto ausgewählt': '1 photo selected', 'Größe *': 'Size *', 'Zustand *': 'Condition *',
    'Farbe (optional)': 'Color (optional)', 'Sichtbarkeit': 'Visibility', 'Öffentlich (im Feed sichtbar)': 'Public (visible in the feed)', 'Zum Verkauf': 'For sale',
    'Hintergrund entfernen': 'Remove background', 'Bereich einzeichnen': 'Mark area', 'Radierer': 'Eraser', 'Zurückholen': 'Restore', 'Pinselgröße': 'Brush size',
    'Alle hinzufügen': 'Add all', 'Bei allen den Hintergrund entfernen': 'Remove background on all', 'Wählen …': 'Choose …', 'Automatisch, wenn freigestellt': 'Automatic when cut out',
    'Foto ersetzen': 'Replace photo', 'Ähnliche Teile von anderen': 'Similar items from others',
    'Passende Teile finden': 'Find matching items', 'Gekauft: in den Schrank legen': 'Bought: move to closet',
    // Outfits
    'PNG': 'PNG', 'Farben': 'Colors', 'Farben, die zusammenpassen': 'Colors that go together',
    // Nachrichten und Anfragen
    'Anfrage': 'Request', 'Kaufanfrage': 'Purchase request', 'Kaufanfrage senden': 'Send purchase request', 'Anfrage senden': 'Send request', 'Hab ich': 'I have it',
    'Nachricht (optional)': 'Message (optional)', 'Betrugsverdacht': 'Suspected fraud', 'Fälschung': 'Counterfeit', 'Belästigung': 'Harassment', 'Spam': 'Spam', 'Sonstiges': 'Other',
    // Anmelden
    'Anmelden': 'Log in', 'Benutzername': 'Username', 'Passwort vergessen?': 'Forgot password?', 'Neues Konto erstellen': 'Create new account', 'Neues Passwort': 'New password',
    'Passwort speichern': 'Save password', 'Abmelden': 'Log out', 'Konto löschen': 'Delete account', 'Konto endgültig löschen': 'Delete account permanently',
    // Einstellungen
    'Einstellungen': 'Settings', 'App': 'App', 'Admin': 'Admin', 'Konto': 'Account', 'Passwort ändern': 'Change password', 'Darstellung': 'Appearance', 'Sprache': 'Language', 'Backup': 'Backup',
    'Rechtliches': 'Legal', 'Moderation': 'Moderation', 'Fehlerprotokoll': 'Error log', 'Hell': 'Light', 'Dunkel': 'Dark', 'Automatisch': 'Automatic',
    'Angemeldet als': 'Signed in as', 'Jetzt synchronisieren': 'Sync now', 'Impressum': 'Imprint', 'Datenschutzerklärung': 'Privacy policy', 'Nutzungsbedingungen': 'Terms of use',
    'Datenschutz': 'Privacy', 'Gesperrte Konten': 'Blocked accounts', 'Alle löschen': 'Delete all',
    'Automatisch richtet sich nach der Einstellung deines Geräts.': 'Automatic follows your device setting.',
    'Die Rechtstexte gibt es nur auf Deutsch, verbindlich ist die deutsche Fassung.': 'The legal texts are only available in German; the German version is binding.',
    // Kategorien, Zustand, Farben
    'Oberteile': 'Tops', 'Accessoires': 'Accessories', 'Jacken': 'Jackets', 'Pullover': 'Sweaters', 'Shirts': 'Shirts', 'Hosen': 'Pants', 'Schuhe': 'Shoes',
    'Taschen': 'Bags', 'Schmuck': 'Jewelry', 'Caps': 'Caps', 'Gürtel': 'Belts',
    'Neu / DS': 'New / DS', 'Sehr gut': 'Very good', 'Gut': 'Good', 'Getragen': 'Worn', 'Alltag': 'Everyday', 'Rare': 'Rare', 'Grail': 'Grail', 'Seltenheit': 'Rarity', 'Zustand': 'Condition',
    'Schwarz': 'Black', 'Weiß': 'White', 'Grau': 'Gray', 'Beige': 'Beige', 'Braun': 'Brown', 'Rot': 'Red', 'Orange': 'Orange', 'Gelb': 'Yellow', 'Grün': 'Green',
    'Blau': 'Blue', 'Lila': 'Purple', 'Rosa': 'Pink',
    // Rückmeldungen
    'Lade …': 'Loading …', 'Teil hinzugefügt': 'Item added', 'Entfernt': 'Removed', 'Anfrage gesendet': 'Request sent', 'Gesendet': 'Sent',
    'Als Flex der Woche gesetzt': 'Set as Flex of the Week', 'Das hat nicht geklappt': 'That did not work', 'Keine Verbindung': 'No connection',
    'Der Feed ist gerade nicht verfügbar': 'The feed is not available right now', 'Bitte versuche es gleich noch einmal.': 'Please try again in a moment.',
    'Noch nichts gemerkt': 'Nothing saved yet', 'Noch keine Outfits von anderen': 'No outfits from others yet', 'Noch keine Teile von anderen': 'No items from others yet',
    'Eigenes Teil hinzufügen': 'Add your own item', 'Als Flex entfernen': 'Remove from Flex',
    // Anmelden und Willkommen
    'Wir haben dir einen Code per Mail geschickt. Trag ihn hier ein.': 'We sent you a code by email. Enter it here.',
    'Code aus der Mail': 'Code from the email', 'Noch einmal': 'Once more', 'E-Mail-Adresse': 'Email address', 'Passwort': 'Password',
    'Wir schicken dir eine Mail, mit der du die Adresse bestätigst. Erst danach kannst du dich anmelden. Der Benutzername ist später für andere sichtbar, die E-Mail-Adresse nicht.':
      'We will send you an email to confirm your address. You can only log in after that. Your username is visible to others later, your email address is not.',
    'Ich habe die': 'I have read the', 'und die': 'and the', 'gelesen und bin einverstanden.': 'and I agree.', 'Nutzung': 'Terms', 'AGB': 'Terms', 'Ich akzeptiere die': 'I accept the', ', bestätige, dass ich mindestens 18 Jahre alt bin, und habe die': ', confirm that I am at least 18 years old, and have read the', 'gelesen.': '.', 'Bitte akzeptiere die AGB, bestätige, dass du mindestens 18 Jahre alt bist, und die Datenschutzerklärung.': 'Please accept the terms, confirm that you are at least 18 years old, and the privacy policy.',
    'Willkommen bei JAWNZ': 'Welcome to JAWNZ', 'Teile hinzufügen.': 'Add items.', 'Öffentlich stellen.': 'Make public.', 'Entdecken.': 'Discover.',
    'Fotografiere Klamotten, JAWNZ schneidet sie frei. Alles ist zuerst privat.': 'Photograph your clothes, JAWNZ cuts them out. Everything is private at first.',
    'Teile auf „Öffentlich“ oder „Verkauf“ erscheinen im Feed anderer.': 'Items set to “Public” or “For sale” appear in other people’s feeds.',
    'Folge Profilen, merke dir Teile und schreib Nachrichten, wenn dir etwas gefällt.': 'Follow profiles, save items and send messages when you like something.',
    'Los geht\'s': 'Let\'s go',
    // Profil, Schrank, Hochladen
    'Sobald jemand etwas freigibt, erscheint es hier.': 'As soon as someone shares something, it shows up here.',
    'Fotos hierher ziehen oder auswählen. Am besten vor hellem, ruhigem Hintergrund fotografiert.': 'Drag photos here or choose them. Best taken against a light, calm background.',
    'Fotos von Teilen, die du kaufen willst. Du kannst Preis und einen Link zum Shop dazuschreiben.': 'Photos of items you want to buy. You can add a price and a link to the shop.',
    'Wähle ein Teil aus der Liste, um es hinzuzufügen.': 'Choose an item from the list to add it.',
    'Name des Outfits': 'Outfit name', 'Hintergrund': 'Background', 'Notizen': 'Notes', 'Details und Sichtbarkeit': 'Details and visibility',
    'Marke': 'Brand', 'Größe': 'Size', 'Artikelnummer (vom Etikett)': 'Item number (from the label)', 'Preis (€)': 'Price (€)', 'Preis / Notiz': 'Price / note',
    'Link zum Shop': 'Link to the shop', 'Größe im Outfit:': 'Size in the outfit:',
    'Teile ziehen zum Verschieben, Ecke unten rechts zum Skalieren.': 'Drag items to move them, bottom right corner to resize.',
    'Oben im Profil anpinnen (Showcase, max. 6)': 'Pin to the top of your profile (showcase, max. 6)',
    'Privat ist der Standard. Notizen und Shop-Links bleiben immer privat.': 'Private is the default. Notes and shop links always stay private.',
    'Öffentlich ist nur, was du auf „Öffentlich“ oder „Zum Verkauf“ stellst. Notizen und Shop-Links bleiben immer privat.': 'Only what you set to “Public” or “For sale” is public. Notes and shop links always stay private.',
    'Drehen, wenn das Foto schief ist': 'Rotate if the photo is crooked',
    'Zeichne mit dem Finger grob um das Teil. Alles außerhalb wird entfernt. Zoomen: zwei Finger oder Mausrad.': 'Roughly draw around the item with your finger. Everything outside is removed. Zoom: two fingers or mouse wheel.',
    'Ziehen zum Verschieben, mit zwei Fingern oder dem Mausrad zoomen.': 'Drag to move, zoom with two fingers or the mouse wheel.',
    'Auswahl ändern': 'Change selection', 'Foto senden': 'Send photo', 'Nach hinten': 'Send backward', 'Nach vorne': 'Bring forward', 'Drehen': 'Rotate',
    '90° nach links': '90° left', '90° nach rechts': '90° right', 'Eigene Farbe': 'Custom color',
    'Größe für dieses Teil merken': 'Remember size for this item', 'Ausschnitt des Profilbilds': 'Profile photo crop',
    'z. B. Büro Freitag': 'e.g. Office Friday', 'z. B. Preis, Größe, Marke': 'e.g. price, size, brand', 'z. B. 89 €': 'e.g. €89',
    'Titel, Marke, Größe, Zustand, Preis: einfach hineinkopieren': 'Title, brand, size, condition, price: just paste it in',
    'z. B. Streetwear, Vintage, Größe M': 'e.g. Streetwear, Vintage, size M', 'z. B. Hamburg': 'e.g. Hamburg',
    'Über mich': 'About me', 'Stadt': 'City', 'Angebot': 'Offer', 'Nachricht': 'Message', 'Nachricht schreiben …': 'Write a message …', 'JAWNZ, zum Feed': 'JAWNZ, to the feed',
    // Nachrichten, Melden
    'Dein Benutzername und die Nachricht gehen an die Person. Bezahlt wird nicht über JAWNZ.': 'Your username and the message go to the person. Payment does not go through JAWNZ.',
    'Zahlung direkt zwischen euch.': 'Payment directly between you.',
    'JAWNZ ist nur Vermittler, es läuft kein Geld über JAWNZ. Ohne Käuferschutz gibt es bei Betrug kein Geld zurück. Empfohlen: PayPal „Waren und Dienstleistungen“.':
      'JAWNZ is only an intermediary, no money goes through JAWNZ. Without buyer protection there is no refund in case of fraud. Recommended: PayPal “Goods and services”.',
    'Grund': 'Reason', 'Details (optional)': 'Details (optional)',
    'Die Meldung sieht nur das JAWNZ-Team. Willst du keine Nachrichten mehr bekommen, sperre die Person auf ihrem Profil.': 'Only the JAWNZ team sees the report. If you do not want any more messages, block the person on their profile.',
    // Einstellungen, Backup
    'Dein Konto mit allen Teilen, Outfits, Nachrichten und Fotos wird endgültig gelöscht. Das lässt sich nicht rückgängig machen.': 'Your account with all items, outfits, messages and photos will be deleted permanently. This cannot be undone.',
    'Die Daten auf diesem Gerät werden ebenfalls entfernt. Speichere vorher ein Backup, wenn du etwas behalten willst.': 'The data on this device is removed as well. Save a backup first if you want to keep anything.',
    'Zur Bestätigung deinen Benutzernamen eintippen': 'Type your username to confirm', 'Neues Passwort wiederholen': 'Repeat new password', 'Altes Passwort': 'Old password', 'Folge ich': 'Following', 'Bewertung abgeben': 'Leave a review', 'Bewertung senden': 'Send review', 'Bewertungen': 'Reviews', 'Noch keine Bewertungen.': 'No reviews yet.', 'Die Bewertungen konnten nicht geladen werden.': 'Reviews could not be loaded.', 'Du hast diesen Kauf bewertet.': 'You reviewed this purchase.', 'Danke für deine Bewertung': 'Thanks for your review', 'Bitte wähle 1 bis 5 Sterne.': 'Please choose 1 to 5 stars.', 'Kommentar (optional)': 'Comment (optional)', 'Wie war der Kauf? Deine Bewertung sieht jeder auf dem Profil.': 'How was the purchase? Everyone can see your review on the profile.', 'Mail erneut senden': 'Resend email', 'Dafür brauchst du eine Internetverbindung.': 'You need an internet connection for that.', 'Bitte gib dein altes Passwort ein.': 'Please enter your old password.', 'Das alte Passwort stimmt nicht.': 'The old password is wrong.',
    'Unerwartete Fehler aus der App, neueste zuerst. Gleiche Meldungen werden gezählt.': 'Unexpected errors from the app, newest first. Identical reports are counted.',
    'Dein Schrank liegt in deinem Konto und auf diesem Gerät. Speichere trotzdem ab und zu ein Backup, dann ist im Notfall alles schnell wieder da.': 'Your closet lives in your account and on this device. Still, save a backup now and then so everything is quickly back in an emergency.',
    'Backup speichern': 'Save backup', 'Backup-Datei hierher ziehen': 'Drag the backup file here', 'oder klicken zum Auswählen': 'or click to choose',
    'Beim Laden wird alles hinzugefügt. Vorhandene Teile und Outfits werden nicht überschrieben oder gelöscht.': 'Loading adds everything. Existing items and outfits are not overwritten or deleted.',
    // Farbtipps
    'Faustregel: Neutrale Farben wie Schwarz, Weiß, Grau, Beige und Navy passen zu fast allem. Eine Akzentfarbe pro Outfit reicht.': 'Rule of thumb: neutral colors like black, white, gray, beige and navy go with almost everything. One accent color per outfit is enough.',
    '2 Farben': '2 colors', '3 Farben': '3 colors',
    'Navy': 'Navy', 'Oliv': 'Olive', 'Creme': 'Cream', 'Bordeaux': 'Burgundy', 'Camel': 'Camel', 'Hellblau': 'Light blue', 'Khaki': 'Khaki', 'Dunkelgrün': 'Dark green',
    'Jeansblau': 'Denim blue', 'Senf': 'Mustard', 'Terracotta': 'Terracotta', 'Hellgrau': 'Light gray',
    'Der Klassiker. Passt immer und wirkt klar und ruhig.': 'The classic. Always fits and looks clean and calm.',
    'Zeitlos und edel, ein Liebling für Hose und Oberteil.': 'Timeless and refined, a favorite for pants and top.',
    'Weich und erdig, besonders gut für Herbst.': 'Soft and earthy, especially good for autumn.',
    'Das dunkle Rot setzt einen Akzent, Grau hält es ruhig.': 'The dark red sets an accent, gray keeps it calm.',
    'Hell und warm, wirkt sofort gepflegt.': 'Light and warm, instantly looks well kept.',
    'Überraschend frisch, Denim-Looks lassen sich so aufwerten.': 'Surprisingly fresh, a good way to upgrade denim looks.',
    'Mutig und stark. Eine der beiden Farben sparsam einsetzen.': 'Bold and strong. Use one of the two colors sparingly.',
    'Sauber und maritim, geht im Sommer wie im Winter.': 'Clean and nautical, works in summer and winter.',
    'Militärisch und lässig, gut für Cargo und Streetwear.': 'Military and casual, good for cargo and streetwear.',
    'Sanft und modern, Grau macht Rosa erwachsen.': 'Soft and modern, gray makes pink grown-up.',
    'Natürlich und ruhig, wirkt hochwertig.': 'Natural and calm, looks high quality.',
    'Denim auf Weiß: einfach, frisch, kaum falsch zu machen.': 'Denim on white: simple, fresh, hard to get wrong.',
    'Kräftiger Kontrast, Senf bringt Wärme in dunkle Looks.': 'Strong contrast, mustard brings warmth to dark looks.',
    'Elegant und weich, passt gut zu Wolle und Leder.': 'Elegant and soft, goes well with wool and leather.',
    'Erdige Töne, die sich gegenseitig tragen.': 'Earthy tones that support each other.',
    'Kühl und ordentlich, ideal fürs Büro.': 'Cool and neat, ideal for the office.',
    'Annehmen': 'Accept',
    'Ablehnen': 'Decline',
    'Zurückziehen': 'Withdraw',
    'Als verkauft markieren': 'Mark as sold',
    'Wieder anbieten': 'Offer again',
    'offen': 'open',
    'angenommen': 'accepted',
    'abgelehnt': 'declined',
    'zurückgezogen': 'withdrawn',
    'verkauft': 'sold',
    'Verkauft': 'Sold',
    'Der Verkäufer hat noch nicht geantwortet.': 'The seller has not replied yet.',
    'Dieses Teil ist verkauft.': 'This item is sold.',
    'Die Bezahlung läuft direkt zwischen euch. Empfohlen: PayPal „Waren und Dienstleistungen“, sonst gibt es bei Betrug kein Geld zurück.': 'Payment is arranged directly between you two. Recommended: PayPal “Goods and services”, otherwise there is no refund in case of fraud.',
    'Als verkauft markieren? Das Teil wird danach privat gestellt.': 'Mark as sold? The item will be set to private afterwards.',
    'Als verkauft markiert': 'Marked as sold',
    'Wieder im Angebot': 'Back on offer',
    'Angebot angenommen. Die Bezahlung läuft direkt zwischen euch.': 'Offer accepted. Payment is arranged directly between you two.',
    'Angebot abgelehnt.': 'Offer declined.',
    'Angebot zurückgezogen.': 'Offer withdrawn.',
    'Die Reservierung wurde aufgehoben.': 'The reservation was cancelled.',
    'Bitte melde dich an.': 'Please sign in.',
    'Kein Zugriff.': 'No access.',
    'Profil nicht gefunden.': 'Profile not found.',
    'Das bist du selbst.': 'That is you.',
    'Für heute ist das Limit erreicht.': 'The limit for today has been reached.',
    'Dieses Teil ist nicht mehr verfügbar.': 'This item is no longer available.',
    'Unterhaltung nicht gefunden.': 'Conversation not found.',
    'Angebot nicht gefunden.': 'Offer not found.',
    'Das Angebot ist nicht mehr offen.': 'The offer is no longer open.',
    'Nur der Käufer kann zurückziehen.': 'Only the buyer can withdraw.',
    'Nur der Verkäufer kann antworten.': 'Only the seller can reply.',
    'Ungültige Aktion.': 'Invalid action.',
    'Dieses Teil ist nicht zum Verkauf.': 'This item is not for sale.',
    'Dieses Teil ist nicht reserviert.': 'This item is not reserved.',
    'Ein Teil wurde aus dem Schrank gelöscht.': 'One item was deleted from the closet.',
    'Ein weiteres Teil ist privat.': 'One more item is private.',
    'Ein Teil fehlt, es wurde aus dem Schrank gelöscht': 'One item is missing, it was deleted from the closet',
    'Noch keine Outfits gemerkt': 'No outfits saved yet',
    'Noch keine Teile gemerkt': 'No items saved yet',
    'Auf der Seite eines Outfits kannst du es mit „Merken“ speichern.': 'On an outfit’s page you can save it with “Save”.',
    'Gemerktes ist gerade nicht verfügbar': 'Saved items are not available right now',
    'Für Gemerktes brauchst du eine Internetverbindung.': 'You need an internet connection for saved items.',
    'Auf der Seite eines Teils kannst du es mit „Merken“ speichern.': 'On an item’s page you can save it with “Save”.',
    'Offene Meldungen. „Teil verstecken“ macht den Eintrag privat (der Besitzer kann ihn nicht wieder freigeben), „Konto sperren“ meldet die Person ab und versteckt alles von ihr. Wer gemeldet hat, bekommt beim nächsten Start eine Rückmeldung.':
      'Open reports. “Hide item” makes the entry private (the owner cannot release it again), “Block account” logs the person out and hides everything from them. Whoever reported gets feedback on their next start.',
  },
};
// Sätze mit Zahlen oder Namen: [Muster, Ersatz]
const I18N_PATTERNS = {
  en: [
    [/^(\d+) Teil ausgewählt$/, '$1 item selected'], [/^(\d+) Teile ausgewählt$/, '$1 items selected'],
    [/^(\d+) Teile hinzugefügt$/, '$1 items added'], [/^von (.+)$/, 'by $1'], [/^Mehr von (.+)$/, 'More from $1'],
    [/^Marke · (\d+) Teil$/, 'Brand · $1 item'], [/^Marke · (\d+) Teile$/, 'Brand · $1 items'],
    [/^(\d+) Teile wurden aus dem Schrank gelöscht\.$/, '$1 items were deleted from the closet.'],
    [/^(\d+) weitere Teile sind privat\.$/, '$1 more items are private.'],
    [/^(\d+) Teile fehlen, sie wurden aus dem Schrank gelöscht$/, '$1 items are missing, they were deleted from the closet'],
    [/^1 Teil$/, '1 item'], [/^(\d+) Teile$/, '$1 items'],
    [/^(\d+) Teile · (\d+) fehlt$/, '$1 items · $2 missing'],
    [/^(\d+) Farben$/, '$1 colors'],
    [/^Zum Shop · (.+) ↗$/, 'To the shop · $1 ↗'],
    [/^Du kannst bis zu (\d+) Teile anpinnen$/, 'You can pin up to $1 items'],
    [/^(\d+) Fotos ausgewählt$/, '$1 photos selected'],
    [/^Vorschlag: (.+)$/, 'Suggestion: $1'],
    [/^Bitte gib (.+) an$/, 'Please enter $1'],
    [/^Konnte (.+) nicht laden$/, 'Could not load $1'],
    [/^Foto (\d+) von (\d+)$/, 'Photo $1 of $2'],
    [/^Alle (\d+) Fotos hinzufügen$/, 'Add all $1 photos'],
    [/^Wird hinzugefügt … (\d+)\/(\d+)$/, 'Adding … $1/$2'],
    [/^Bei (\d+) Foto\(s\) konnte der Hintergrund nicht entfernt werden$/, 'Background could not be removed for $1 photo(s)'],
    [/^Aktuell gespeichert: (\d+) Teile, (\d+) Outfits\.$/, 'Currently saved: $1 items, $2 outfits.'],
    [/^(\d+) von (\d+) Teilen eingesetzt\. Tippe ein Teil in der Liste, um es zu tauschen\.$/, '$1 of $2 items placed. Tap an item in the list to swap it.'],
    [/^Größe gemerkt: „(.+)“ wird künftig mit (\d+) % eingefügt$/, 'Size saved: “$1” will be inserted at $2 % from now on'],
    [/^„(.+)["“]\s?löschen\?$/, 'Delete “$1”?'],
    [/^(\d+)× · Version (.+)$/, '$1× · Version $2'],
    [/^Hallo (.+), wir haben dir eine Mail an (.+) geschickt\. Tippe darin auf „E-Mail bestätigen“, dann bist du drin\. (.+)$/, 'Hi $1, we sent an email to $2. Tap “Confirm email” in it and you are in. $3'],
    [/^Falls es ein Konto für (.+) gibt, haben wir dir einen Code geschickt\. Trag ihn hier ein\.$/, 'If an account exists for $1, we have sent you a code. Enter it here.'],
    [/^Um (.+) zu nutzen, musst du dich anmelden\.$/, 'To use $1 you need to sign in.'],
    [/^(\d+) Teile? sind? zum Verkauf, der Preis geht dabei verloren\. Trotzdem ändern\?$/, '$1 item(s) for sale, the price will be lost. Change anyway?'],
    [/^Auf diesem Gerät liegen noch (\d+) Teile und (\d+) Outfits von vor dem Login\. In dein Konto übernehmen\?$/, 'There are still $1 items and $2 outfits on this device from before login. Add them to your account?'],
    [/^(.+) sperren\? Die Person kann dir dann nichts mehr schicken\.$/, 'Block $1? They will no longer be able to send you anything.'],
    [/^(.+) von (.+) ansehen$/, 'View $1 by $2'], [/^(\d+) Follower$/, '$1 followers'], [/^(\d+) Folge ich$/, '$1 following'],
  ],
};

let LANG = 'de'; // Standard ist Deutsch
try { const l = localStorage.getItem('jawnz-lang'); if (l && I18N[l]) LANG = l; } catch (e) { /* ohne Speicher: Deutsch */ }

// Übersetzt einen deutschen Text (für Texte, die im Code gebaut werden): t('Abbrechen'), t('{n} Teile', { n: 3 })
function t(de, params) {
  const dict = I18N[LANG];
  let s = dict && dict[de] !== undefined ? dict[de] : de;
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? params[k] : m));
  return s;
}
function trText(s) {
  const dict = I18N[LANG];
  const k = s.trim();
  if (!k) return s;
  let out = dict[k];
  if (out === undefined) for (const [re, rep] of I18N_PATTERNS[LANG] || []) if (re.test(k)) { out = k.replace(re, rep); break; }
  if (out === undefined && k.includes(' + ')) { // Farbpaare wie „Schwarz + Weiß“
    const parts = k.split(' + ').map((x) => dict[x]);
    if (parts.every((x) => x !== undefined)) out = parts.join(' + ');
  }
  return out === undefined ? s : s.replace(k, out);
}
function setLang(l) {
  if (!I18N[l] && l !== 'de') return;
  try { localStorage.setItem('jawnz-lang', l); } catch (e) { /* gilt dann nur bis zum Neuladen */ }
  location.reload(); // alle Texte und Listen werden neu aufgebaut
}

// Für Englisch: alle Texte der Seite durchgehen und die gemeldeten Änderungen mitnehmen. Auf Deutsch passiert hier nichts.
if (LANG !== 'de') {
  document.documentElement.lang = LANG;
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  const SKIP = /^(SCRIPT|STYLE|TEXTAREA|INPUT|CODE)$/;
  const tr = (n) => {
    if (n.nodeType === 3) {
      const p = n.parentNode;
      if (!p || SKIP.test(p.tagName) || p.closest('[data-no-i18n]')) return;
      // Auswahllisten: der Wert bleibt deutsch (er wird gespeichert), nur der sichtbare Text wird übersetzt
      if (p.tagName === 'OPTION' && !p.hasAttribute('value')) p.setAttribute('value', n.nodeValue.trim());
      const v = trText(n.nodeValue);
      if (v !== n.nodeValue) n.nodeValue = v;
    } else if (n.nodeType === 1) {
      if (SKIP.test(n.tagName) && n.tagName !== 'INPUT' && n.tagName !== 'TEXTAREA') return;
      if (n.closest('[data-no-i18n]')) return;
      for (const a of ATTRS) { const v = n.getAttribute(a); if (v) { const w = trText(v); if (w !== v) n.setAttribute(a, w); } }
      if (n.tagName === 'OPTION' && !n.hasAttribute('value') && n.textContent.trim()) n.setAttribute('value', n.textContent.trim());
      for (const c of [...n.childNodes]) tr(c);
    }
  };
  const run = () => {
    tr(document.body);
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') tr(m.target);
        else if (m.type === 'attributes') tr(m.target);
        else m.addedNodes.forEach(tr);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };
  if (document.body) run(); else addEventListener('DOMContentLoaded', run);
}
