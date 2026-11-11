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
