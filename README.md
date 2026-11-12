# Formen-Erstellen

Ein einfacher 3D-Formeneditor: Länge, Höhe und Tiefe eingeben und die Vorschau
des Quaders direkt mitverfolgen. Volumen und Oberfläche werden ebenfalls live
berechnet.

## Lokal starten

Für die Vorschau kannst du `index.html` direkt im Browser öffnen. Für die PWA
und den Offline-Modus muss die App über `localhost` oder eine HTTPS-Adresse
aufgerufen werden, da Browser Service Worker unter `file://` nicht erlauben.

Zum Beispiel im Projektordner:

```sh
python3 -m http.server 8000
```

Anschließend `http://localhost:8000` im Browser öffnen. Über das Browsermenü
kann die App installiert werden. Nach dem ersten Laden ist die App auch offline
verfügbar.
