# JAWNZ: Angaben für App Store Connect

Alles zum Reinkopieren. Längen sind die Grenzen von Apple.

## Grunddaten

| Feld | Wert |
|---|---|
| Name (max. 30) | JAWNZ |
| Untertitel (max. 30) | Dein digitaler Kleiderschrank |
| Bundle-ID | de.jawnz.app |
| Primäre Kategorie | Lifestyle |
| Sekundäre Kategorie | Shopping |
| Sprache | Deutsch (Hauptsprache), Englisch optional |
| Support-URL | https://jawnz.de |
| Marketing-URL (optional) | https://jawnz.de |
| Datenschutz-URL | https://jawnz.de/datenschutz.html |
| AGB / Impressum | https://jawnz.de/agb.html, https://jawnz.de/impressum.html |
| Urheberrecht | © 2026 Finn Freund |
| Preis | Kostenlos |

## Werbetext (max. 170, jederzeit änderbar)

Lade deine Klamotten hoch, baue Outfits, entdecke die Schränke anderer und finde besondere Einzelstücke. Fair, ohne Provision.

## Stichwörter (max. 100, mit Komma, ohne Leerzeichen)

kleiderschrank,outfit,mode,secondhand,vinted,kleidung,garderobe,wunschliste,sneaker,vintage,stylen

## Beschreibung (max. 4000)

JAWNZ ist dein digitaler Kleiderschrank und eine Community für besondere Einzelstücke.

SCHRANK
Fotografiere deine Teile, schneide sie mit einem Tipp frei und sortiere sie nach Kategorie, Marke, Größe und Farbe. Dein Schrank gehört dir und funktioniert auch ohne Internet.

OUTFITS
Baue aus deinen Teilen Outfits, speichere sie und zeig sie, wem du willst.

FEED UND SUCHE
Entdecke Teile und Outfits von anderen. Der Feed lernt, was dir gefällt. Mit der Suche findest du Marken, Größen und Farben.

KAUFEN UND VERKAUFEN
Gib Teile zum Verkauf frei, schick eine Anfrage oder ein Angebot und regelt alles im Chat. JAWNZ nimmt keine Provision. Der Verlauf zeigt, wem ein Teil vorher gehört hat.

COMMUNITY
Folge anderen, merke dir Teile, bewerte Käufer und Verkäufer mit null bis fünf Sternen. Fälschungen sind verboten, Inhalte lassen sich melden, Nutzer lassen sich sperren.

MITTEILUNGEN
Auf Wunsch bekommst du eine Mitteilung bei neuen Nachrichten, Anfragen, Angeboten und Bewertungen. Jede Art lässt sich einzeln abschalten.

Kein Tracking durch Dritte, keine Werbung.

## Was ist neu (erste Version)

Erste Version von JAWNZ.

## Hinweise für die App-Prüfung (App Review)

- Für den Test wird ein Konto gebraucht. Lege vor dem Einreichen ein Testkonto an (E-Mail und Passwort in das Feld „Anmeldeinformationen“ eintragen) und fülle es mit ein paar Teilen, zwei öffentlich.
- Konto löschen: Menü → Einstellungen → Konto löschen.
- Melden: auf der Seite eines Teils oder Profils „Melden“. Sperren: auf dem Profil „Sperren“ (Liste unter Einstellungen → Gesperrte Konten).
- Zahlungen: Es gibt keine Zahlungen und keine In-App-Käufe. Käufer und Verkäufer einigen sich im Chat, JAWNZ bekommt kein Geld und liefert nichts aus.
- Nutzergenerierte Inhalte: Melde- und Sperrfunktion, Moderation durch das Team, Verbot von Fälschungen in den AGB.
- Mitteilungen: optional, erst nach Erlaubnis.

## Altersfreigabe (Fragebogen)

- Nutzergenerierte Inhalte: ja (mit Melden, Sperren und Moderation)
- Alles andere (Gewalt, Sexuelles, Glücksspiel, Alkohol …): nein
- Erwartetes Ergebnis: 12+ oder 17+ wegen frei zugänglicher Nutzerinhalte; die AGB verlangen 18+. In den Fragen „Unbeschränkter Webzugriff“ ebenfalls nein.

## Datenschutz-Angaben („App-Datenschutz“)

Tracking: **Nein** (keine Werbung, keine Tracker, keine Weitergabe an Datenhändler).

Erhobene Daten, alle „mit dem Nutzer verknüpft“, Zweck „App-Funktionalität“, nicht zum Tracking:

| Kategorie bei Apple | Was |
|---|---|
| Kontaktdaten → E-Mail-Adresse | Anmeldung |
| Kontaktdaten → Name | Benutzername |
| Nutzerinhalte → Fotos oder Videos | Fotos der Teile, Chat-Fotos |
| Nutzerinhalte → Kundensupport / sonstige Nutzerinhalte | Nachrichten, Beschreibungen, Bewertungen, Meldungen |
| Kennungen → Geräte-ID | Push-Token (nur nach Erlaubnis) |
| Nutzung → Produktinteraktion | angesehene, gemerkte, angefragte Teile für die Feed-Reihenfolge (Zweck: App-Funktionalität und Personalisierung) |
| Diagnose → Absturzdaten / Leistungsdaten | Fehlerprotokoll ohne Inhalte, 30 Tage |

Nicht erhoben: Standort, Kontakte, Gesundheit, Finanzdaten, Browserverlauf, Suchverlauf auf dem Server.

## Export-Compliance

Die App nutzt nur Standard-Verschlüsselung (HTTPS): „Nein“ bei eigener Verschlüsselung, Ausnahme gilt.

## Screenshots

Apple verlangt mindestens 3 (bis 10) für 6,9 Zoll (1320 × 2868 px). Die anderen Größen werden daraus abgeleitet. Der Simulator, den ich benutze, liefert 1206 × 2622 (6,3 Zoll), das reicht für den 6,9-Zoll-Platz nicht. Aufnehmen am besten im Simulator „iPhone 17 Pro Max“ oder ähnlich, mit einem Konto voller Beispielteile (das Konto lege ich nicht an, ich melde mich nie an). Vorschlag für die Reihenfolge: Feed, Teil-Seite, Schrank, Outfit-Baukasten, Chat, Profil.

## Offen (Aufgaben für dich)

1. ~~Datenschutz-URL~~ erledigt: Seiten entstehen mit `python3 ios-app/make-legal.py` aus den Texten in index.html (nach jeder Textänderung neu ausführen und pushen).
2. **Testkonto** für die App-Prüfung anlegen.
3. **Entwickler-Account** (erst wenn alles passt), dann App in App Store Connect anlegen und diese Felder einfügen.
4. **Push** einrichten (README im selben Ordner).
