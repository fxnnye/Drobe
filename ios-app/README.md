# JAWNZ für iOS (Capacitor-Hülle)

Die Web-App liegt eine Ebene höher. Dieser Ordner packt sie in ein Xcode-Projekt.

Node liegt bei diesem Mac in `~/.local/node/bin` (nicht im Standardpfad):

    export PATH=$HOME/.local/node/bin:$PATH
    cd ios-app
    npm run ios          # kopiert die Web-App nach www/ und in das Xcode-Projekt
    npx cap open ios     # öffnet Xcode

In Xcode: Projekt „App“ → Signing & Capabilities → Team = deine Apple-ID, dann ein Gerät oder den Simulator wählen und ▶ drücken.
Nach jeder Änderung an der Web-App einmal `npm run ios` ausführen.

Bundle-ID: `de.jawnz.app`. Vor dem Einreichen bei Apple Icon (ohne Transparenz, 1024 px) und Versionsnummer prüfen.

## Push-Mitteilungen einrichten (einmalig, vor dem Einreichen)

Der Code ist fertig (Swift-Brücke in `ios/App/App/AppDelegate.swift`, Einstellungen → Mitteilungen in der Web-App, Datenbank 0059, Edge Function `push-send`).
Was nur im Apple-Konto geht:

1. **App-ID:** developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → `de.jawnz.app` → Capability **Push Notifications** anhaken → Save.
2. **APNs-Schlüssel:** Keys → „+“ → Name „JAWNZ Push“ → **Apple Push Notifications service (APNs)** anhaken → Continue → Register → die **.p8-Datei herunterladen** (geht nur einmal!). Notiere die **Key ID** (10 Zeichen) und oben rechts deine **Team ID**.
3. **Supabase → Edge Functions → Secrets:** `APNS_KEY` (kompletter Inhalt der .p8-Datei inklusive BEGIN/END-Zeilen), `APNS_KEY_ID`, `APNS_TEAM_ID`.
4. **Xcode:** Target „App“ → Signing & Capabilities → Team wählen; „Push Notifications“ erscheint dort durch die Datei `App.entitlements` schon. Beim Archivieren stellt Xcode `aps-environment` automatisch auf production.
5. TestFlight- und App-Store-Builds nutzen den Produktions-Server von Apple, Debug-Läufe aus Xcode den Sandbox-Server; die App meldet das beim Registrieren mit (`env`).

## Auf dem eigenen iPhone mit kostenloser Apple-ID

Die Debug-Konfiguration nutzt `App/AppDebug.entitlements` (ohne Push), weil ein kostenloses Konto die Push-Berechtigung nicht erlaubt.
Die Release-Konfiguration (Archivieren für TestFlight/App Store) nutzt `App/App.entitlements` mit Push. Mit dem bezahlten Konto
kann man in Xcode für Debug ebenfalls `App/App.entitlements` eintragen (Build Settings → Code Signing Entitlements).
Ohne Push-Berechtigung meldet die App in Einstellungen → Mitteilungen einen Hinweis, alles andere funktioniert.
