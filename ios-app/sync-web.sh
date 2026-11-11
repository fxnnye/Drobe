#!/bin/sh
# Kopiert die Web-App (eine Ebene höher) nach www/, damit Capacitor sie einpacken kann.
set -e
cd "$(dirname "$0")"
rm -rf www && mkdir www
cp ../index.html ../*.js ../style.css ../manifest.webmanifest www/
rm -f www/sw.js   # der Offline-Cache läuft in der App-Hülle nicht über den Service Worker
cp -R ../icons ../fonts ../vendor www/
echo "www/ aktualisiert"
