// Sprache (Teil der App, lädt als Erstes nach errors.js, Reihenfolge siehe index.html)
// Deutsch ist die Quelle: die Texte stehen so im Code. Englisch kommt aus dieser Liste (deutscher Text → englischer Text).
// Fehlt ein Eintrag, bleibt der deutsche Text stehen. Neue Sprache = neue Liste, neuer Eintrag = eine Zeile.
// Nicht übersetzt werden die Rechtstexte (Impressum, Datenschutz, Nutzungsbedingungen): verbindlich ist die deutsche Fassung.
const LANGS = { de: 'Deutsch', en: 'English' };
const I18N = {
  en: {
    // Navigation, Feed, Suche
    'Feed': 'Feed', 'Suche': 'Search', 'Nachrichten': 'Messages', 'Profil': 'Profile', 'Einloggen': 'Log in', 'Registrieren': 'Sign up',
    'Mitteilungen': 'Notifications', 'Mitteilungen erlauben': 'Allow notifications', 'Das möchte ich bekommen': 'What I want to get', 'Nachrichten': 'Messages', 'Wenn dir jemand schreibt': 'When someone writes to you', 'Kaufanfragen': 'Purchase requests', 'Wenn sich jemand für dein Teil interessiert': 'When someone is interested in your item', 'Angebote': 'Offers', 'Angenommen, abgelehnt oder zurückgezogen': 'Accepted, declined or withdrawn', 'Bestellungen': 'Orders', 'Verkauft, Erhalt bestätigt, Reservierung aufgehoben': 'Sold, receipt confirmed, reservation lifted', 'Wenn dich jemand bewertet': 'When someone reviews you', 'Neue Follower': 'New followers', 'Wenn dir jemand folgt': 'When someone follows you', 'Nachrichten vom JAWNZ-Team': 'Messages from the JAWNZ team', 'Wichtige Hinweise zu deinem Konto': 'Important notices about your account', 'Mitteilungen sind auf diesem iPhone an.': 'Notifications are on for this iPhone.', 'Erlaube Mitteilungen, damit du nichts verpasst.': 'Allow notifications so you never miss anything.', 'Die Einstellungen konnten nicht geladen werden.': 'Settings could not be loaded.', 'Für dich': 'For you', 'Teile': 'Items', 'Outfits': 'Outfits', 'Gemerkt': 'Saved', 'Mehr laden': 'Load more', 'Nochmal versuchen': 'Try again',
    'Flex of the Week': 'Flex of the Week', 'Artikel': 'Items', 'Mitglieder': 'Members', 'Alle': 'All', 'Öffentlich': 'Public', 'Kaufen': 'Buy', 'Verkaufen': 'Sell',
    'Farbe': 'Color', 'Zurück': 'Back', 'Zurück zur Verwaltung': 'Back to admin', 'Senden': 'Send', 'Marke oder Teil suchen': 'Search brand or item', 'Benutzername suchen': 'Search username',
    // Profil, Schrank
    'Bearbeiten': 'Edit', 'Schrank': 'Closet', 'Auswählen': 'Select', 'Fertig': 'Done', 'Keine': 'None', 'Privat': 'Private',
    'Löschen': 'Delete', 'Nichts ausgewählt': 'Nothing selected', 'Tippe Teile an': 'Tap items', 'Tippe weitere Teile an': 'Tap more items', 'Hinzufügen': 'Add', 'Fotos': 'Photos', 'Artikeldetails': 'Item details', 'Fotos hochladen': 'Upload photos', 'Speichern': 'Save', 'Abbrechen': 'Cancel',
    'Schließen': 'Close', 'Überspringen': 'Skip', 'Weiter': 'Next', 'Neu': 'New', 'Entfernen': 'Remove', 'Melden': 'Report', 'Foto ändern': 'Change photo',
    'Profil bearbeiten': 'Edit profile', 'Profil-Link kopieren': 'Copy profile link', 'So sehen andere mein Profil': 'How others see my profile',
    'Zum Profil': 'Open profile', 'Ansehen': 'View', 'Merken': 'Save', 'Gemerkt ': 'Saved ',
    // Hinzufügen und Hochladen
    'Hinzufügen ': 'Add ', 'Klamotten hochladen': 'Upload clothes', 'Fotos auswählen': 'Choose photos',
    'Kategorie': 'Category', 'Name': 'Name', 'Marke *': 'Brand *', 'Mit Foto suchen': 'Search by photo', 'Finde andere Mitglieder': 'Find other members', 'Suche nach Benutzernamen, sieh dir ihre Teile an und folge ihnen.': 'Search for usernames, look at their items and follow them.', 'Ähnliche Teile zu deinem Foto': 'Items similar to your photo', 'Die Fotosuche hat nicht geklappt.': 'The photo search did not work.', 'Dafür musst du angemeldet sein': 'You need to be signed in for this', 'Suche ähnliche Teile … (beim ersten Mal wird ein kleines Bildmodell geladen)': 'Searching similar items … (a small image model is loaded the first time)', 'Name des Teils': 'Item name',  'Foto entfernen': 'Remove photo', '1 Foto ausgewählt': '1 photo selected', 'Größe *': 'Size *', 'Zustand *': 'Condition *',
    'Farbe (optional)': 'Color (optional)', 'Sichtbarkeit': 'Visibility', 'Öffentlich (im Feed sichtbar)': 'Public (visible in the feed)', 'Zum Verkauf': 'For sale',
    'Hintergrund entfernen': 'Remove background', 'Bereich einzeichnen': 'Mark area', 'Radierer': 'Eraser', 'Zurückholen': 'Restore', 'Ausbessern': 'Clean up', 'Neues Teil': 'New item', 'So funktioniert JAWNZ': 'How JAWNZ works', 'Über JAWNZ': 'About JAWNZ', 'Die Hilfe konnte nicht geladen werden. Prüfe deine Verbindung und versuche es noch einmal.': 'Help could not be loaded. Check your connection and try again.', 'Über uns': 'About us', 'Kontakt': 'Contact', 'Hilfe': 'Help', 'So funktioniert’s': 'How it works', 'Kaufen & Verkaufen': 'Buying & selling', 'Legit-Check & Sicherheit': 'Legit check & safety', 'Rechtliches': 'Legal', 'Mehr über JAWNZ': 'More about JAWNZ', 'Neue Version: neu laden': 'New version: reload', 'KI nicht erreichbar, einfache Methode benutzt. Zum Wiederholen: „Original anzeigen“, dann nochmal': 'AI not reachable, used the simple method. To retry: “Show original”, then again', 'Wird ausgebessert …': 'Cleaning up …', 'Ausgebessert. „Zurück“ macht es rückgängig': 'Cleaned up. “Back” undoes it', 'Hier gibt es zu wenig zum Vergleichen. Nimm den Radierer': 'Not enough to compare here. Use the eraser', 'Hier ist kein Hintergrund zu erkennen': 'No background found here', 'Das Ausbessern hat nicht geklappt': 'Cleaning up did not work', 'Pinselgröße': 'Brush size',
    'Alle hinzufügen': 'Add all', 'Bei allen den Hintergrund entfernen': 'Remove background on all', 'Wählen …': 'Choose …', 'Automatisch, wenn freigestellt': 'Automatic when cut out',
    'Foto ersetzen': 'Replace photo', 'Ähnliche Teile von anderen': 'Similar items from others',
    'Passende Teile finden': 'Find matching items', 'Gekauft: in den Schrank legen': 'Bought: move to closet',
    // Outfits
    'PNG': 'PNG', 'Farben': 'Colors', 'Farben, die zusammenpassen': 'Colors that go together',
    // Nachrichten und Anfragen
    'Dein Angebot (€)': 'Your offer (€)', 'Bitte gib dein Angebot ein.': 'Please enter your offer.', 'Das Angebot darf nicht über dem Preis liegen.': 'The offer cannot be higher than the price.', 'JAWNZ Bot': 'JAWNZ Bot', 'Anzeige': 'Listing', 'Diese Anzeige ist nicht mehr öffentlich.': 'This listing is no longer public.', 'Verkäufer': 'Seller', 'Status': 'Status', 'Angebot offen': 'Offer open', 'Angebot abgelehnt': 'Offer declined', 'Angebot zurückgezogen': 'Offer withdrawn', 'verkauft und übergeben': 'sold and handed over', 'Bestellungen': 'Orders', 'Bestellverlauf': 'Order history', 'Noch keine Bestellungen.': 'No orders yet.', 'Der Bestellverlauf konnte nicht geladen werden.': 'The order history could not be loaded.', 'reserviert': 'reserved', 'verkauft, wartet auf Erhalt': 'sold, waiting for receipt', 'abgeschlossen': 'completed', 'Anfrage': 'Request', 'Kaufanfrage': 'Purchase request', 'Kaufanfrage senden': 'Send purchase request', 'Staff Picks': 'Staff picks', 'Staff Pick': 'Staff pick', 'Zu Staff Picks hinzufügen': 'Add to staff picks', 'Aus Staff Picks entfernen': 'Remove from staff picks', 'Noch keine Staff Picks': 'No staff picks yet', 'Das JAWNZ-Team wählt hier bald Teile aus.': 'The JAWNZ team will pick items here soon.', 'Staff Picks: Teile, die das JAWNZ-Team ausgewählt hat.': 'Staff picks: items chosen by the JAWNZ team.', 'Legit-Check': 'Legit check', 'Die Community entscheidet mit, ob dieses Teil echt ist.': 'The community helps decide whether this item is real.', 'Sieht echt aus': 'Looks real', 'Sieht fake aus': 'Looks fake', 'Danke für deine Stimme': 'Thanks for your vote', 'Vom JAWNZ-Team geprüft.': 'Checked by the JAWNZ team.', 'Eingefroren: Dieses Teil wird gerade vom JAWNZ-Team geprüft. Neue Anfragen sind erst danach möglich.': 'Frozen: the JAWNZ team is checking this item. New requests are possible afterwards.', 'Anfrage senden': 'Send request', 'Hab ich': 'I have it',
    'Nachricht (optional)': 'Message (optional)', 'Betrugsverdacht': 'Suspected fraud', 'Fälschung': 'Counterfeit', 'Belästigung': 'Harassment', 'Spam': 'Spam', 'Sonstiges': 'Other',
    // Anmelden
    'Anmelden': 'Log in', 'Benutzername': 'Username', 'Passwort vergessen?': 'Forgot password?', 'Neues Konto erstellen': 'Create new account', 'Neues Passwort': 'New password',
    'Passwort speichern': 'Save password', 'Abmelden': 'Log out', 'Konto löschen': 'Delete account', 'Konto endgültig löschen': 'Delete account permanently',
    // Einstellungen
    'Einstellungen': 'Settings', 'App': 'App', 'Admin': 'Admin', 'Konto': 'Account', 'Passwort ändern': 'Change password', 'Darstellung': 'Appearance', 'Sprache': 'Language', 'Backup': 'Backup',
    'Rechtliches': 'Legal', 'Moderation': 'Moderation', 'Fehlerprotokoll': 'Error log', 'Hell': 'Light', 'Dunkel': 'Dark', 'Automatisch': 'Automatic',
    'Angemeldet als': 'Signed in as', 'Jetzt synchronisieren': 'Sync now', 'Impressum': 'Imprint', 'Datenschutzerklärung': 'Privacy policy', 'Nutzungsbedingungen': 'Terms of use',
    'Offline – nur dein Schrank und deine Outfits': 'Offline – only your closet and outfits', 'Alle Angebote': 'All offers', 'Datenschutz': 'Privacy', 'Gesperrte Konten': 'Blocked accounts', 'Alle löschen': 'Delete all',
    'Automatisch richtet sich nach der Einstellung deines Geräts.': 'Automatic follows your device setting.',
    'Die Rechtstexte gibt es nur auf Deutsch, verbindlich ist die deutsche Fassung.': 'The legal texts are only available in German; the German version is binding.',
    // Kategorien, Zustand, Farben
    'Oberteile': 'Tops', 'Accessoires': 'Accessories', 'Jacken': 'Jackets', 'Pullover': 'Sweaters', 'Shirts': 'Shirts', 'Hosen': 'Pants', 'Schuhe': 'Shoes',
    'Taschen': 'Bags', 'Schmuck': 'Jewelry', 'Caps': 'Caps', 'Gürtel': 'Belts',
    'Neu / DS': 'New / DS', 'Sehr gut': 'Very good', 'Gut': 'Good', 'Getragen': 'Worn', 'Alltag': 'Everyday', 'Du': 'You', 'Rare': 'Rare', 'Grail': 'Grail', 'Seltenheit': 'Rarity', 'Zustand': 'Condition',
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
    'Code aus der Mail': 'Code from the email', 'Noch einmal': 'Once more', 'E-Mail-Adresse': 'Email address', 'E-Mail-Adresse oder Benutzername': 'Email address or username', 'Gib deine E-Mail-Adresse oder deinen Benutzernamen ein.': 'Enter your email address or username.', 'E-Mail-Adresse, Benutzername oder Passwort stimmt nicht.': 'Email address, username or password is wrong.', 'Passwort': 'Password',
    'Wir schicken dir eine Mail, mit der du die Adresse bestätigst. Erst danach kannst du dich anmelden. Der Benutzername ist später für andere sichtbar, die E-Mail-Adresse nicht.':
      'We will send you an email to confirm your address. You can only log in after that. Your username is visible to others later, your email address is not.',
    'Ich habe die': 'I have read the', 'und die': 'and the', 'gelesen und bin einverstanden.': 'and I agree.', 'Nutzung': 'Terms', 'AGB': 'Terms', 'Ich akzeptiere die': 'I accept the', ', bestätige, dass ich mindestens 18 Jahre alt bin, und habe die': ', confirm that I am at least 18 years old, and have read the', 'gelesen.': '.', 'Bitte akzeptiere die AGB, bestätige, dass du mindestens 18 Jahre alt bist, und die Datenschutzerklärung.': 'Please accept the terms, confirm that you are at least 18 years old, and the privacy policy.',
    'Willkommen bei JAWNZ': 'Welcome to JAWNZ', 'Teile hinzufügen.': 'Add items.', 'Entdecken.': 'Discover.',
    'Folge Profilen, merke dir Teile und schreib Nachrichten, wenn dir etwas gefällt.': 'Follow profiles, save items and send messages when you like something.',
    'Los geht\'s': 'Let\'s go',
    // Profil, Schrank, Hochladen
    'Sobald jemand etwas freigibt, erscheint es hier.': 'As soon as someone shares something, it shows up here.',
    'Fotos hierher ziehen oder auswählen. Am besten vor hellem, ruhigem Hintergrund fotografiert.': 'Drag photos here or choose them. Best taken against a light, calm background.',
    'Am besten vor hellem, ruhigem Hintergrund fotografiert.': 'Best taken against a light, calm background.', 'Backup-Datei auswählen': 'Choose backup file',
    'Angaben': 'Details', 'Teil löschen': 'Delete item', 'Gerade drehen': 'Straighten',
    'Fotos von Teilen, die du kaufen willst. Du kannst Preis und einen Link zum Shop dazuschreiben.': 'Photos of items you want to buy. You can add a price and a link to the shop.',
    'Wähle ein Teil aus der Liste, um es hinzuzufügen.': 'Choose an item from the list to add it.',
    'Name des Outfits': 'Outfit name', 'Hintergrund': 'Background', 'Notizen': 'Notes', 'Details und Sichtbarkeit': 'Details and visibility',
    'Marke': 'Brand', 'Größe': 'Size', 'Artikelnummer (vom Etikett)': 'Item number (from the label)', 'Preis (€)': 'Price (€)', 'Preis / Notiz': 'Price / note',
    'Link zum Shop': 'Link to the shop', 'Größe im Outfit:': 'Size in the outfit:',
    'Teile ziehen zum Verschieben, Ecke unten rechts zum Skalieren.': 'Drag items to move them, bottom right corner to resize.',
    'Oben im Profil anpinnen (Showcase, max. 6)': 'Pin to the top of your profile (showcase, max. 6)',
    'Bei „Öffentlich“ und „Zum Verkauf“ sehen andere das Teil samt Notizen.': 'With “Public” and “For sale”, others see the item including its notes.',
    'Notizen (optional)': 'Notes (optional)', 'Bei „Öffentlich“ und „Zum Verkauf“ sehen andere deine Notizen.': 'With “Public” and “For sale”, others see your notes.',
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
    'Zur Bestätigung deinen Benutzernamen eintippen': 'Type your username to confirm', 'Neues Passwort wiederholen': 'Repeat new password', 'Altes Passwort': 'Old password', 'JAWNZ-Team': 'JAWNZ team', 'Folge ich': 'Following', 'Bewertung abgeben': 'Leave a review', 'Bewertung senden': 'Send review', 'Bewertungen': 'Reviews', 'Noch keine Bewertungen.': 'No reviews yet.', 'Die Bewertungen konnten nicht geladen werden.': 'Reviews could not be loaded.', 'Du hast diesen Kauf bewertet.': 'You reviewed this purchase.', 'Danke für deine Bewertung': 'Thanks for your review', 'Bitte wähle 0 bis 5 Sterne.': 'Please choose 0 to 5 stars.', 'Bitte wähle 1 bis 5 Sterne.': 'Please choose 0 to 5 stars.', 'Kommentar (optional)': 'Comment (optional)', 'Wie war der Kauf? Deine Bewertung sieht jeder auf dem Profil.': 'How was the purchase? Everyone can see your review on the profile.', 'Mail erneut senden': 'Resend email', 'Dafür brauchst du eine Internetverbindung.': 'You need an internet connection for that.', 'Bitte gib dein altes Passwort ein.': 'Please enter your old password.', 'Das alte Passwort stimmt nicht.': 'The old password is wrong.',
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
    'Als verkauft markieren? Das Teil wird privat gestellt. Es wechselt in den Kleiderschrank des Käufers, sobald er den Erhalt bestätigt.': 'Mark as sold? The item is set to private. It moves to the buyer\'s closet once they confirm receipt.', 'Erhalt bestätigen, alles passt': 'Confirm receipt, all good', 'Alles passt': 'All good', 'Bestätigt, das Teil kommt in deinen Kleiderschrank': 'Confirmed, the item is coming to your closet', 'Gekauftes Teil ist jetzt in deinem Kleiderschrank': 'The item you bought is now in your closet', 'Verlauf': 'History',
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
// Weitere Texte (Profil, Nachrichten, Schrank, Anmeldung, Hinzufügen)
Object.assign(I18N.en, {
    'Fotografiere Klamotten, JAWNZ schneidet sie frei.': 'Photograph your clothes, JAWNZ cuts them out.',
    'Neue Teile sind auf „Öffentlich“ voreingestellt und erscheinen so im Feed anderer. Auf „Privat“ sehen andere sie nicht.': 'New items are preset to “Public” and then appear in other people’s feeds. Set them to “Private” and others won’t see them.',
    'Andere sehen, was auf „Öffentlich“ oder „Zum Verkauf“ steht, bei solchen Teilen auch deine Notizen. Profiltext und Profilbild sind immer sichtbar.': 'Others see whatever is set to “Public” or “For sale”, including your notes on those items. Your profile text and picture are always visible.',
    'Sichtbarkeit wählen.': 'Choose visibility.',
    'heute': 'today', 'gestern': 'yesterday', 'Noch keine Bewertungen': 'No reviews yet',
    'Folgen': 'Follow', 'Du folgst': 'Following', 'Sperren': 'Block', 'Entsperren': 'Unblock', 'Gesperrt': 'Blocked', 'Entsperrt': 'Unblocked', '♡ Merken': '♡ Save', '♥ Gemerkt': '♥ Saved',
    '♡ Outfit merken': '♡ Save outfit', 'Outfit nachbauen': 'Recreate outfit',
    'Setzt passende Teile aus deinem Schrank ein. Danach kannst du sie in der Liste austauschen.': 'Places matching items from your closet. You can swap them in the list afterwards.',
    'Teile in diesem Outfit': 'Items in this outfit', 'Die Teile dieses Outfits sind nicht öffentlich.': 'The items in this outfit are not public.',
    'Zum Ansehen von Profilen brauchst du eine Internetverbindung.': 'You need an internet connection to view profiles.',
    'Das Profil konnte nicht geladen werden.': 'The profile could not be loaded.', 'Dieses Profil gibt es nicht.': 'This profile does not exist.',
    'So sehen andere dein Profil.': 'This is how others see your profile.', 'So sehen andere dein Teil.': 'This is how others see your item.',
    'Hier ist noch nichts öffentlich.': 'Nothing is public here yet.', 'Nichts in dieser Kategorie.': 'Nothing in this category.', 'Keine öffentlichen Outfits.': 'No public outfits.',
    'Zum Ansehen brauchst du eine Internetverbindung.': 'You need an internet connection to view this.', 'Das Outfit konnte nicht geladen werden.': 'The outfit could not be loaded.',
    'Dieses Outfit ist nicht mehr verfügbar.': 'This outfit is no longer available.', 'Das Teil konnte nicht geladen werden.': 'The item could not be loaded.',
    'Dein Schrank ist noch leer. Lade zuerst Teile hoch.': 'Your closet is still empty. Upload some items first.',
    'Kein passendes Teil in deinem Schrank gefunden. Wähle Teile aus der Liste.': 'No matching item found in your closet. Pick items from the list.', 'Das hat nicht geklappt.': 'That did not work.',
    'Danke, wir schauen es uns an': 'Thanks, we will take a look', 'Dir folgt noch niemand.': 'Nobody follows you yet.',
    'Du folgst noch niemandem. Über „Suche“ findest du Mitglieder.': 'You are not following anyone yet. Use “Search” to find members.',
    'Die Liste konnte nicht geladen werden.': 'The list could not be loaded.', 'Noch keine Follower.': 'No followers yet.', 'Folgt noch niemandem.': 'Not following anyone yet.',
    'Bewertung': 'Review', 'z. B. schnelle Antwort, Teil wie beschrieben': 'e.g. quick reply, item as described', 'z. B. Ist es noch da?': 'e.g. Is it still available?', 'Preis': 'Price',
    'Lade Nachrichten': 'Loading messages', 'Die Nachrichten konnten nicht geladen werden.': 'The messages could not be loaded.', 'Keine Kauf-Nachrichten': 'No buying messages',
    'Wenn du bei einem Teil nachfragst, erscheint die Unterhaltung hier.': 'When you ask about an item, the conversation shows up here.', 'Keine Verkaufs-Nachrichten': 'No selling messages',
    'Fragt jemand nach einem deiner Teile, erscheint es hier.': 'When someone asks about one of your items, it shows up here.', 'Nachricht von JAWNZ': 'Message from JAWNZ',
    'Hast du das Teil bekommen und passt alles? Dann bestätige den Erhalt: Es landet in deinem Kleiderschrank, danach könnt ihr euch bewerten.': 'Did you receive the item and is everything fine? Then confirm receipt: it moves into your closet, and you can review each other.',
    'Teil erhalten und alles in Ordnung? Es kommt in deinen Kleiderschrank und verschwindet beim Verkäufer.': 'Received the item and everything is fine? It moves into your closet and leaves the seller’s.',
    'Sobald der Käufer den Erhalt bestätigt, wechselt das Teil in seinen Kleiderschrank. Danach könnt ihr euch bewerten.': 'As soon as the buyer confirms receipt, the item moves into their closet. Then you can review each other.',
    'Die Unterhaltung konnte nicht geladen werden.': 'The conversation could not be loaded.', 'Foto': 'Photo', 'Deine Anfrage zu diesem Teil': 'Your request about this item',
    'Anfrage zu deinem Teil': 'Request about your item', 'Dein Angebot zu diesem Wunsch': 'Your offer for this wish', 'Angebot zu deinem Wunsch': 'Offer for your wish',
    'Senden hat nicht geklappt.': 'Sending failed.', 'Das hat nicht geklappt. Läuft die neueste Datenbank-Version?': 'That did not work. Is the latest database version running?',
    'Der gemeldete Eintrag wurde versteckt.': 'The reported entry was hidden.', 'Das Konto wurde gesperrt.': 'The account was blocked.',
    'Wir haben keinen Verstoß festgestellt.': 'We found no violation.', 'Wir haben sie bearbeitet.': 'We have handled it.', 'einem Konto': 'an account',
    'Danke für deine Meldung.': 'Thanks for your report.', 'Das Bild konnte nicht gelesen werden.': 'The image could not be read.',
    'Keine passenden Teile gefunden. Gefunden werden nur Teile, die andere öffentlich gestellt haben.': 'No matching items found. Only items that others made public are searched.',
    'Profil gespeichert': 'Profile saved', 'Link kopiert': 'Link copied', 'Link markiert, bitte kopieren': 'Link selected, please copy it', 'Einen Moment …': 'One moment …',
    'Dein Schrank ist noch leer': 'Your closet is still empty',
    'Lade dein erstes Teil hoch, am besten mit Foto auf hellem Hintergrund.': 'Upload your first item, ideally photographed on a light background.', 'Erstes Teil hinzufügen': 'Add your first item',
    'Keine Teile in dieser Kategorie': 'No items in this category', 'Nichts gefunden': 'Nothing found', 'Versuche einen anderen Suchbegriff.': 'Try a different search term.',
    'Schon so eingestellt': 'Already set that way', 'Dein Schrank ist leer': 'Your closet is empty',
    'Lade zuerst Teile hoch, dann kannst du sie kombinieren.': 'Upload items first, then you can combine them.', 'Teil hinzufügen': 'Add item',
    'Höchstens 2 Oberteile: das älteste wurde ersetzt': 'At most 2 tops: the oldest one was replaced', 'Füge zuerst Teile hinzu': 'Add items first',
    'Aktuelles Outfit verwerfen und neu beginnen?': 'Discard the current outfit and start over?', 'Du hast ein nicht gespeichertes Outfit. Neu beginnen?': 'You have an unsaved outfit. Start over?',
    'Neu beginnen': 'Start over', 'Verwerfen': 'Discard', 'Ein Teil aus diesem Outfit wurde aus dem Schrank gelöscht.': 'One item of this outfit was deleted from the closet.',
    'Noch keine Outfits': 'No outfits yet', 'Kombiniere Teile aus deinem Schrank zu einem Outfit.': 'Combine items from your closet into an outfit.', 'Teilen hat nicht geklappt': 'Sharing failed',
    'Outfit gespeichert': 'Outfit saved', 'Neues Outfit bauen': 'Build a new outfit', 'Outfit erstellen': 'Create outfit', 'Bearbeiten schließen': 'Close editing', 'Artikelnummer': 'Item number',
    'Preis in € (optional)': 'Price in € (optional)', 'z. B. Gekauft bei …, Pflegehinweis': 'e.g. bought at …, care note',
    'Für den Feed brauchst du eine Internetverbindung.': 'You need an internet connection for the feed.',
    'Sobald jemand ein Outfit öffentlich stellt, erscheint es hier.': 'As soon as someone makes an outfit public, it shows up here.', 'dein Profil': 'your profile', 'das Hinzufügen': 'adding items',
    'diese Funktion': 'this feature', '„Gemerkt“': '“Saved”', 'Neu hochgeladen': 'Newly uploaded', 'Alle Ergebnisse': 'All results', 'Zuletzt gesucht': 'Recent searches', 'Mitglied': 'Member',
    'Eintrag entfernen': 'Remove entry', 'Gib mindestens 2 Zeichen ein.': 'Enter at least 2 characters.', 'Die Suche ist gerade nicht verfügbar.': 'Search is not available right now.',
    'Für die Suche brauchst du eine Internetverbindung.': 'You need an internet connection to search.',
    'Gib mindestens 2 Zeichen eines Benutzernamens ein.': 'Enter at least 2 characters of a username.', 'Die Mitgliedersuche ist gerade nicht verfügbar.': 'Member search is not available right now.',
    'Keine Mitglieder gefunden. Prüfe die Schreibweise des Benutzernamens.': 'No members found. Check the spelling of the username.',
    'Dafür musst du angemeldet sein.': 'You need to be signed in for this.', 'Noch keine ähnlichen öffentlichen Teile von anderen.': 'No similar public items from others yet.',
    'Die Suche nach ähnlichen Teilen hat nicht geklappt.': 'Searching for similar items failed.', 'Synchronisiere …': 'Syncing …',
    'Abgleich fehlgeschlagen. Beim nächsten Öffnen wird es erneut versucht.': 'Sync failed. It will be retried the next time you open the app.',
    'Dieser Benutzername ist schon vergeben.': 'This username is already taken.', 'Diese E-Mail-Adresse ist schon registriert.': 'This email address is already registered.',
    'Bitte bestätige zuerst deine E-Mail-Adresse. Wir haben dir dazu eine Mail geschickt.': 'Please confirm your email address first. We have sent you an email.',
    'Diese E-Mail-Adresse sieht nicht richtig aus.': 'This email address does not look right.',
    'Benutzername: 3 bis 20 Zeichen, nur Buchstaben, Zahlen, Punkt, Strich und Unterstrich.': 'Username: 3 to 20 characters, only letters, numbers, dot, hyphen and underscore.',
    'Das Passwort ist zu schwach. Nimm mindestens 8 Zeichen.': 'The password is too weak. Use at least 8 characters.', 'Keine Verbindung. Prüfe dein Internet.': 'No connection. Check your internet.',
    'Der Link ist abgelaufen oder schon benutzt. Registriere dich erneut oder melde dich an.': 'The link has expired or was already used. Register again or sign in.',
    'Wir haben dir die Mail noch einmal geschickt. Schau auch im Spam-Ordner nach.': 'We sent you the email again. Check your spam folder too.',
    'Bitte warte einen Moment, bevor du es noch einmal versuchst.': 'Please wait a moment before trying again.',
    'Das hat nicht geklappt. Versuche es gleich noch einmal.': 'That did not work. Please try again in a moment.', 'Zu viele Versuche. Bitte warte kurz.': 'Too many attempts. Please wait a moment.',
    'Konto erstellen': 'Create account', 'Ich habe schon ein Konto': 'I already have an account',
    'Trag oben deine E-Mail-Adresse ein, dann schicken wir dir einen Code.': 'Enter your email address above and we will send you a code.',
    'Gerade nicht erreichbar. Prüfe dein Internet.': 'Not reachable right now. Check your internet.', 'Trag den Code aus der Mail ein.': 'Enter the code from the email.',
    'Das Passwort braucht mindestens 8 Zeichen.': 'The password needs at least 8 characters.', 'Die beiden Passwörter sind nicht gleich.': 'The two passwords do not match.',
    'Der Code stimmt nicht oder ist abgelaufen. Fordere einen neuen an.': 'The code is wrong or has expired. Request a new one.',
    'Anmeldung gerade nicht erreichbar. Prüfe dein Internet.': 'Sign-in is not reachable right now. Check your internet.',
    'Bitte gib eine echte E-Mail-Adresse ein.': 'Please enter a real email address.', 'Anmeldung nicht abgeschlossen. Bitte versuche es erneut.': 'Sign-in not completed. Please try again.',
    'Bitte melde dich neu an.': 'Please sign in again.', 'Nicht angemeldet.': 'Not signed in.', 'Passwort geändert.': 'Password changed.', 'E-Mail-Adresse bestätigt': 'Email address confirmed',
    'Neue Version verfügbar, die App lädt neu …': 'New version available, the app is reloading …', 'Fast geschafft': 'Almost done', 'Zur Anmeldung': 'To sign-in',
    'Keine Mail angekommen? Du kannst sie jetzt erneut anfordern.': 'No email arrived? You can request it again now.',
    'Mitteilungen bekommst du in der JAWNZ-App auf dem iPhone. Hier kannst du schon einstellen, welche du haben möchtest.': 'You receive notifications in the JAWNZ app on iPhone. You can already choose here which ones you want.',
    'Das hat nicht geklappt. Dein Konto ist unverändert.': 'That did not work. Your account is unchanged.', 'Es gibt noch nichts zu sichern': 'There is nothing to back up yet',
    'Das ist keine gültige Backup-Datei': 'This is not a valid backup file', 'Backup gespeichert': 'Backup saved', 'Backup fehlgeschlagen': 'Backup failed',
    'Alles aus dem Backup war schon vorhanden': 'Everything in the backup was already there',
    'Mitteilungen sind für JAWNZ ausgeschaltet. Du kannst sie in den iPhone-Einstellungen unter Mitteilungen → JAWNZ wieder erlauben.': 'Notifications are turned off for JAWNZ. You can allow them again in the iPhone settings under Notifications → JAWNZ.',
    'Übernehmen': 'Add', 'Speicher im Browser nicht verfügbar': 'Browser storage is not available', 'Bild': 'Image', 'Hintergrund nicht erkannt': 'Background not recognised',
    'Zeichne einmal rund um das Teil': 'Draw once around the item', 'Der Bereich konnte nicht übernommen werden': 'The area could not be applied',
    'Male über Stellen, die weg sollen. Mit „Zurückholen“ malst du Gelöschtes wieder ein, „Ausbessern“ nimmt dort den Hintergrund wieder weg. „Zurück“ macht den letzten Schritt rückgängig. Zoomen: zwei Finger oder Mausrad.': 'Paint over areas that should go. “Restore” paints erased parts back in, “Touch up” removes the background there again. “Back” undoes the last step. Zoom: two fingers or mouse wheel.',
    'Das Radieren hat nicht geklappt': 'Erasing failed', 'Hintergrund wird entfernt …': 'Removing background …',
    'KI-Modell wird geladen … (einmalig, kann etwas dauern)': 'Loading AI model … (once, may take a while)', 'Hintergrund konnte nicht entfernt werden': 'Background could not be removed',
    'die Marke': 'the brand', 'die Größe': 'the size', 'den Zustand': 'the condition', 'Der Preis sieht nicht richtig aus': 'The price does not look right',
    'Ein Foto konnte nicht geladen werden': 'A photo could not be loaded', 'Konnte das Foto nicht laden': 'Could not load the photo', 'Einzeichnen abbrechen': 'Cancel drawing',
    'Original anzeigen': 'Show original', 'Einheitsgröße': 'One size', 'Kleidung': 'Clothing',
});
// Sätze mit Zahlen oder Namen: [Muster, Ersatz]
const I18N_PATTERNS = {
  en: [
    // zusammengesetzte Sätze mit Zahlen und Namen; Teile davon werden mit trText mitübersetzt
    [/^seit (\d.+)$/, 'since $1'], [/^bis (\d.+)$/, 'until $1'], [/^1 Outfit$/, '1 outfit'], [/^(\d+) Outfits$/, '$1 outfits'], [/^1 Bewertung$/, '1 review'], [/^(\d+) Bewertungen$/, '$1 reviews'], [/^(\d+) fehlt$/, '$1 missing'],
    [/^✓ (\d+) echt$/, '✓ $1 real'], [/^Ab (\d+) Fake-Stimmen wird das Teil eingefroren und vom Team geprüft\.$/, 'From $1 fake votes on, the item is frozen and checked by the team.'],
    [/^(\d+) Teil: (.+)$/, (m, n, v) => n + ' item: ' + trText(v)], [/^(\d+) Teile: (.+)$/, (m, n, v) => n + ' items: ' + trText(v)],
    [/^1 Teil gelöscht$/, '1 item deleted'], [/^(\d+) Teile gelöscht$/, '$1 items deleted'],
    [/^(\d+) Teile? löschen\?(?: (Ein Outfit verwendet|(\d+) Outfits verwenden) davon Teile, sie verschwinden dort\.)? Das lässt sich nicht rückgängig machen\.$/, (m, n, used, u) => 'Delete ' + n + (n === '1' ? ' item?' : ' items?') + (used ? ' ' + (u ? u + ' outfits use' : 'One outfit uses') + ' some of them; they will disappear there.' : '') + ' This cannot be undone.'],
    [/^„(.+)" wird in (\d+) Outfit\(s\) verwendet und verschwindet dort\. Trotzdem löschen\?$/, '“$1” is used in $2 outfit(s) and will disappear there. Delete anyway?'],
    [/^(\d+) Teile aus diesem Outfit wurden aus dem Schrank gelöscht\.$/, '$1 items of this outfit were deleted from the closet.'],
    [/^(\d+) gekaufte Teile sind jetzt in deinem Kleiderschrank$/, '$1 bought items are now in your closet'],
    [/^(\d+) Teile und (\d+) Outfits hinzugefügt$/, '$1 items and $2 outfits added'],
    [/^Bewertungen von (.+)$/, 'Reviews of $1'], [/^Bewertung für (.+)$/, 'Review for $1'],
    [/^Preis (.+)\. Du kannst höchstens 25 % darunter bieten, mindestens (.+)\.$/, 'Price $1. You can offer at most 25 % below, at least $2.'],
    [/^Dein Angebot darf höchstens 25 % unter dem Preis liegen \(mindestens (.+)\)\.$/, 'Your offer may be at most 25 % below the price (at least $1).'],
    [/^Interesse an deinem „(.*)“$/, 'Interest in your “$1”'], [/^Interesse an „(.*)“$/, 'Interest in “$1”'],
    [/^Zu deinem Wunsch „(.*?)“(.*)$/, 'About your wish “$1”$2'], [/^Zu „(.*?)“(.*)$/, 'About “$1”$2'], [/^Du: ([\s\S]*)$/, 'You: $1'],
    [/^(Dein Angebot zu diesem Wunsch|Angebot zu deinem Wunsch): (.*)$/, (m, a, b) => trText(a) + ': ' + b],
    [/^Danke für deine Meldung\.\n([\s\S]*)$/, (m, rest) => 'Thanks for your report.\n' + rest.split('\n').map((l) => { const p = /^(?:Deine Meldung zu )?(.+?): (.+)$/.exec(l); return p ? (l.startsWith('Deine Meldung') ? 'Your report about ' : '') + trText(p[1]) + ': ' + trText(p[2]) : l; }).join('\n')],
    [/^Zuletzt abgeglichen: (.+)$/, 'Last synced: $1'], [/^Das hat nicht geklappt: (.+)$/, 'That did not work: $1'],
    [/^Keine Mail angekommen\? In (\d+) Sekunden kannst du sie erneut anfordern\.$/, 'No email arrived? You can request it again in $1 seconds.'],
    [/^„(.+)“ so lassen$/, 'Keep “$1”'],
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
    [/^Vorschlag: (.+)$/, (m, v) => 'Suggestion: ' + trText(v)],
    [/^Bitte gib (.+) an$/, (m, v) => 'Please enter ' + trText(v)],
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
    [/^Um (.+) zu nutzen, musst du dich anmelden\.$/, (m, v) => 'To use ' + trText(v) + ' you need to sign in.'],
    [/^(\d+) Teile? sind? zum Verkauf, der Preis geht dabei verloren\. Trotzdem ändern\?$/, '$1 item(s) for sale, the price will be lost. Change anyway?'],
    [/^Auf diesem Gerät liegen noch (\d+) Teile und (\d+) Outfits von vor dem Login\. In dein Konto übernehmen\?$/, 'There are still $1 items and $2 outfits on this device from before login. Add them to your account?'],
    [/^(.+) sperren\? Die Person kann dir dann nichts mehr schicken\.$/, 'Block $1? They will no longer be able to send you anything.'],
    [/^(.+) von (.+) ansehen$/, 'View $1 by $2'], [/^Gekauft von @(.+)$/, 'Bought from @$1'], [/^Verkauft an @(.+)$/, 'Sold to @$1'], [/^(\d+) Follower$/, '$1 followers'], [/^(\d+) Folge ich$/, '$1 following'],
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
  if (out === undefined && k.includes(' · ')) { // zusammengesetzte Zeilen wie „24 Teile · 3 Outfits“: jeden Abschnitt einzeln
    const parts = k.split(' · '), done = parts.map((x) => trText(x));
    if (done.some((x, i) => x !== parts[i])) out = done.join(' · ');
  }
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
