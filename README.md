# CodePad – Python & C Editor für Handy und PC

Ein Code-Editor im Stil von VS Code, mit dem du **Python, C (und C++)** schreiben und **direkt ausführen** kannst.
Er läuft im Browser und lässt sich auf dem Handy **als App installieren**. Deine Dateien liegen zentral auf
deinem Server, deshalb siehst und bearbeitest du überall denselben Stand, egal ob auf Handy oder PC.

## Anime-Look ✿

- **4 Themes:** Sakura Night 桜, Neon Tokyo 夜, Matcha 茶 und Klassisch (VS-Code-Stil ohne Effekte), wählbar über das ⋮-Menü
- **Code-chan:** Das Maskottchen im Terminal freut sich, wenn dein Code läuft, ist traurig bei Fehlern,
  denkt beim Kompilieren mit und schläft ein, wenn du lange nichts machst. Tippst du sie an, gibt sie dir einen Tipp.
- **Combo-Zähler und Funken** beim Tippen, Konfetti bei erfolgreichem Ausführen, Wackeln bei Fehlern
- **Level-System:** XP für Tippen, erfolgreiche Programme und besiegte Bugs, mit Level-up-Animation
- **Fallende Sakura-Blüten** im Hintergrund
- Effekte, Blüten und Code-chan lassen sich einzeln abschalten. Ist im System „Bewegung reduzieren“ an,
  bleiben die Animationen automatisch aus.

## Funktionen

- Editor mit Syntax-Hervorhebung, Zeilennummern, Autovervollständigung von Klammern, Code-Faltung,
  Suchen & Ersetzen (Strg+F) und mehreren Cursorn (CodeMirror 6)
- Explorer mit Ordnern: Dateien anlegen, umbenennen, löschen und per Drag & Drop verschieben
- Tabs, die beim nächsten Öffnen wiederhergestellt werden
- **Ausführen** mit ▶ oder Strg+Enter / F5:
  - Python mit `python3`
  - C mit `gcc` (C17, `-Wall`, `-lm`), C++ mit `g++`
  - Terminal mit Eingabefeld, sodass `input()`, `scanf()` usw. funktionieren
  - Fehlermeldungen wie `main.c:5:3: error …` lassen sich anklicken und springen zur Zeile
  - Stopp-Knopf, Zeitlimit und Ausgabelimit
- **Synchronisierung**: Speichert automatisch. Änderungen von einem anderen Gerät erscheinen sofort
  (live über WebSocket). Wurde eine Datei auf zwei Geräten gleichzeitig geändert, fragt CodePad nach.
  Wer offline weiterschreibt, verliert nichts: Die Änderungen werden lokal gesichert und später hochgeladen.
- **Für das Handy gemacht**: Explorer als Seitenmenü, Leiste mit Sonderzeichen (Tab, Klammern, `;`, `#` …),
  große Touch-Flächen, installierbar als App (PWA)
- Passwortschutz

## Starten

### Variante A: Docker (empfohlen)

```bash
# In docker-compose.yml das Passwort ändern, dann:
docker compose up -d
```

Danach ist CodePad unter `http://<deine-ip>:3000` erreichbar.

### Variante B: direkt mit Node.js

Du brauchst Node.js 18 oder neuer, `python3` und `gcc`.

```bash
npm install
npm run build
PASSWORD=meinpasswort npm start
```

Ohne `PASSWORD` wird beim ersten Start ein Passwort erzeugt. Es steht in der Konsole und in
`workspace/.codepad/password`.

| Variable      | Standard      | Bedeutung                                   |
|---------------|---------------|---------------------------------------------|
| `PASSWORD`    | (generiert)   | Passwort für die Anmeldung                  |
| `PORT`        | `3000`        | Port des Servers                            |
| `WORKSPACE`   | `./workspace` | Ordner, in dem deine Dateien liegen         |
| `RUN_TIMEOUT` | `60`          | maximale Laufzeit eines Programms (Sekunden)|

## Von überall erreichbar machen

Damit Handy und PC von überall auf denselben Server kommen, gibt es zwei einfache Wege:

1. **Server läuft auf deinem PC**, und du nutzt [Tailscale](https://tailscale.com) (kostenlos).
   Installiere es auf PC und Handy und öffne dann `http://<pc-name>:3000`.
   Mit `tailscale serve 3000` bekommst du sogar eine HTTPS-Adresse, die nur deine eigenen Geräte erreichen.
2. **Server läuft auf einem kleinen VPS** (z. B. Hetzner, Oracle Free Tier) mit Docker.
   Setze einen Reverse-Proxy mit HTTPS davor, etwa [Caddy](https://caddyserver.com):
   ```
   code.deine-domain.de {
       reverse_proxy localhost:3000
   }
   ```

**Für die Installation als App braucht es HTTPS** (Ausnahme: `localhost`). Beide Wege oben liefern HTTPS.

## Als App aufs Handy

- **Android (Chrome):** CodePad öffnen, dann ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“
- **iPhone (Safari):** CodePad öffnen, dann Teilen → „Zum Home-Bildschirm“

Danach startet CodePad wie eine normale App im Vollbild.

## Tastenkürzel

| Kürzel             | Aktion                     |
|--------------------|----------------------------|
| Strg+Enter / F5    | Ausführen                  |
| Strg+S             | Speichern (passiert auch automatisch) |
| Strg+B             | Explorer ein/aus           |
| Strg+J             | Terminal ein/aus           |
| Strg+F             | Suchen / Ersetzen          |
| Strg+D (im Terminal) | Eingabe beenden (EOF)    |

## Sicherheit

CodePad führt beliebigen Code auf dem Server aus. Teile das Passwort also nur mit Leuten, denen du vertraust,
und betreibe CodePad am besten in Docker. Der Container läuft ohne Root-Rechte.

## Aufbau

- `server.js`: Express-Server, Datei-API, Anmeldung und Code-Ausführung über WebSocket
- `src/main.js`: Oberfläche (Editor, Explorer, Tabs, Terminal, Synchronisierung), gebaut mit esbuild nach `public/dist/`
- `src/theme.js`: Editor-Farben (über CSS-Variablen, daher pro Theme austauschbar)
- `src/mascot.js`: Code-chan (SVG) mit Stimmungen und Sprüchen
- `src/effects.js`: Sakura-Blüten, Funken, Combo, Konfetti, XP und Level
- `public/`: HTML, CSS, Manifest, Service Worker und Icons
