# T2

Web-Anwendung (Next.js) für hierarchische Aufgaben als Board / Mindmap. Diese Anleitung beschreibt, wie Sie das Projekt auf **einem anderen Rechner** einrichten und starten.

## Voraussetzungen

- **Node.js** Version **20** oder **22** (LTS empfohlen). Prüfen im Terminal:
  ```bash
  node -v
  ```
  Falls Node fehlt: [nodejs.org](https://nodejs.org/) herunterladen und installieren (npm ist dabei).
- **npm** (kommt mit Node.js), optional **Git**, wenn Sie den Quellcode per Repository kopieren.

Es sind **keine** `.env`-Dateien oder externen Datenbanken nötig; die App läuft lokal im Browser.

## Projekt auf den neuen Rechner bringen

### Variante A: Mit Git

```bash
git clone <URL-Ihres-Repositories> T2
cd T2
```

Ersetzen Sie `<URL-Ihres-Repositories>` durch die echte Clone-URL (HTTPS oder SSH).

### Variante B: Ohne Git (ZIP / USB)

1. Auf dem Quellrechner den Projektordner **ohne** `node_modules` packen (der Ordner ist groß und plattformabhängig).
2. Archiv auf den neuen Rechner kopieren und entpacken.
3. Im Terminal in den entpackten Ordner wechseln, z. B.:
  ```bash
   cd Pfad/zum/T2
  ```

## Abhängigkeiten installieren

Im Projektroot (dort, wo die `package.json` liegt):

```bash
npm install
```

Das lädt alle JavaScript-Pakete nach `node_modules`. Einmalig pro Rechner bzw. nach jeder frischen Kopie des Projekts ausführen.

## Anwendung starten

### Entwicklung (lokal mit Hot-Reload)

```bash
npm run dev
```

Standard: [http://localhost:3000](http://localhost:3000) im Browser öffnen.

**Zugriff von anderen Geräten im gleichen Netzwerk** (optional):

```bash
npx next dev -H 0.0.0.0
```

Dann im Browser auf dem anderen Gerät `http://<IP-des-Rechners>:3000` verwenden (Firewall am Host ggf. Port 3000 freigeben).

### Produktion (gebaute Version)

Das Projekt nutzt **`output: standalone`**. `npm run start` startet den Server aus `.next/standalone` (nicht `next start` — das liefert mit dieser Konfiguration oft **veralteten** Code).

```bash
npm run build
npm run start
```

Ebenfalls typischerweise Port **3000**. Anderer Port:

```bash
PORT=4000 npm run start
```

Nach einem Update im Browser **hart neu laden** (macOS: **⌘⇧R**), damit kein alter Service-Worker-Cache greift.

**Während der Entwicklung** immer `npm run dev` verwenden — Änderungen am Quellcode sind so sofort sichtbar, ohne Build.

### Als ZIP-Artefakt ausliefern (Standalone inkl. Server)

Das Projekt nutzt **`output: "standalone"`**. Nach dem Build liegt unter `.next/standalone` ein **minimales Node-Bundle** (App + Server) — ohne das große `node_modules` des Quellprojekts.

**ZIP erzeugen (zum Weitergeben):**

```bash
npm run dist
```

- Ergebnis: `dist/hierarchical-task-manager-v<Version>-standalone-<Datum>.zip`
- Enthält: `server.js`, gebündelte Abhängigkeiten, `public/`, `START.md`, `start.sh`, `.env.example`, leerer `data/`-Ordner

**Empfänger (nur Node.js 20+ nötig, kein npm):**

```bash
unzip hierarchical-task-manager-*.zip -d t2
cd t2
cp .env.example .env   # optional, für Server-Board
./start.sh
```

Browser: **http://localhost:3000** · anderer Port: `PORT=8080 ./start.sh`

**Plattform:** Native Module sind an die **Build-Plattform** gebunden — für Linux-Server idealerweise dort bauen oder Docker nutzen (siehe unten).

### Docker (Standalone-Container)

```bash
cp .env.example .env   # T2_SESSION_SECRET, T2_AUTH_PASSWORD setzen
docker compose up -d --build
```

Oder ohne Compose:

```bash
docker build -t t2 .
docker run --rm -p 3000:3000 --env-file .env -v t2-data:/app/data t2
```

Board-Daten bleiben im Volume `t2-data` (bzw. `./data` im ZIP-Betrieb).

## Nützliche Befehle


| Befehl             | Bedeutung                                       |
| ------------------ | ----------------------------------------------- |
| `npm run dev`      | Entwicklungsserver                              |
| `npm run build`    | Produktions-Build erzeugen (Standalone + optional Server-Board) |
| `npm run build:static` | Statischer Export nach `out/` (GitHub Pages, kein Node) |
| `npm run start`    | Standalone-Produktionsserver (nach `build`)     |
| `npm run dist`     | ZIP-Artefakt unter `dist/` (baut bei Bedarf automatisch) |
| `docker compose up -d --build` | Standalone im Container (Port 3000) |
| `npm run lint`     | ESLint                                          |
| `npm run test:run` | Unit-Tests (Vitest)                             |


## GitHub Pages (nur Browser, kein eigener Server)

T2 kann wie **diagrams.net** als reine Web-App ausgeliefert werden — **ohne Node.js auf dem Host**. Board-Daten bleiben im Browser (`localStorage`) oder in einer **Arbeitsdatei** auf dem Rechner.

**Live-URL (nach Einrichtung):** [https://abx-git.github.io/T2/](https://abx-git.github.io/T2/)

### Einmalige Einrichtung

1. Repository: [github.com/abx-git/T2](https://github.com/abx-git/T2)
2. Code auf `main` pushen (Workflow liegt unter `.github/workflows/deploy-github-pages.yml`).
3. Auf GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Nach dem ersten Push auf `main` läuft der Workflow **Deploy GitHub Pages**; die Seite ist unter der URL oben erreichbar.

### Lokal testen

```bash
npm run build:static
npx serve out
```

Browser: `http://localhost:3000/T2/` (Unterpfad `/T2` entspricht dem Repo-Namen auf GitHub Pages).

Anderer Unterpfad oder Root-Domain: `NEXT_PUBLIC_BASE_PATH=/ npm run build:static`

### Nutzung

1. App unter **HTTPS** öffnen (GitHub Pages erfüllt das).
2. **„Daten“** → **Arbeitsdatei (JSON)** → Datei öffnen oder neu anlegen — Auto-Save auf Ihrem PC.
3. Ohne Arbeitsdatei: Entwurf in `localStorage` (Notfall-Kopie, kein Server).

**Hinweis:** Server-Board (Login, JSON auf dem Host) gibt es nur im **Standalone**-Build (`npm run build` + `npm run start`), nicht auf GitHub Pages.

## App auf Server, Datei lokal (wie diagrams.net)

So betreiben Sie T2 wie **diagrams.net**: Der Server liefert nur die **Web-App** (HTML/JS). Ihr Board liegt in einer **JSON-Datei auf Ihrem Rechner** — nicht in `data/` auf dem Host.

**Ablauf:**

1. App auf dem Server starten (ZIP, Docker oder `npm run build` && `npm run start`).
2. Im Browser die Server-URL öffnen — **mit HTTPS** (siehe unten).
3. Toolbar **„Daten“** → **Arbeitsdatei (JSON)** → **Datei öffnen** oder **Neue Datei**.
4. Ab dann schreibt T2 automatisch in diese lokale Datei. Beim nächsten Besuch fragt der Browser ggf. erneut nach Lese-/Schreibzugriff; die Verknüpfung wird im Browser gemerkt.

**Server-Konfiguration (empfohlen für diesen Modus):**

```bash
# .env — kein zentrales Board auf dem Host
T2_SERVER_BOARD_ENABLED=0
```

Ohne `T2_SESSION_SECRET` / `T2_AUTH_PASSWORD` ist das Server-Board ohnehin deaktiviert; mit `T2_SERVER_BOARD_ENABLED=0` bleibt es auch bei gesetzten Secrets aus.

**HTTPS:** Die Arbeitsdatei nutzt die File-System-Access-API. Die funktioniert auf `https://…` und `http://localhost`, **nicht** auf plain `http://192.168.x.x`. Für LAN/Server: Reverse-Proxy mit TLS (z. B. Caddy, nginx + Let’s Encrypt oder internes Zertifikat).

**Browser:** Chrome oder Edge (Brave nur mit aktivierter File-System-API). Safari/Firefox: **Backup erstellen** / **Backup einspielen** statt Arbeitsdatei.

| | diagrams.net | T2 (dieser Modus) |
| --- | --- | --- |
| App | vom Server/CDN | Next.js auf Ihrem Host |
| Diagramm/Board | lokal / Host-Adapter | `t2-board.json` auf Ihrem PC |
| Server speichert Inhalt? | nein (Embed) | nein |

## Daten & Speicher

Über **„Daten“** in der Toolbar steuern Sie Speicherziel, Backups und Exporte. Der Speicherstatus erscheint beim Mouseover über den Button.

**Ein Ziel für Auto-Speichern** (gleichzeitig nur eines aktiv):

| Ziel | Bedeutung |
| ---- | --------- |
| Nur in diesem Browser | Entwurf + Notfall-Kopie in `localStorage` |
| Arbeitsdatei | Auto-Save in eine verknüpfte JSON auf dem Rechner (Chrome/Edge) |
| Server | Auto-Save auf dem Host (Login nötig) |

**Sicherung** (bewusst, mit Bestätigung beim Einspielen):

- **Backup erstellen** — JSON herunterladen (überschreibt nichts)
- **Backup einspielen** — gesamtes Board ersetzen; danach optional Ziel wählen

Die **File System Access API** für die Arbeitsdatei funktioniert zuverlässig in **Chrome** und **Edge**. In **Brave** ggf. `brave://flags/#file-system-access-api` → **Enabled**. Ohne API: **Backup erstellen** nutzen.

## Server-Board (JSON auf dem Host)

Im Panel **„Daten“** → **Server** speichert T2 den Board-Stand in einer **JSON-Datei auf dem Server** (nicht im Browser). **Login ist erforderlich** (Session-Cookie).

**Konfiguration** (z. B. `.env` aus `.env.example`):

| Variable | Bedeutung |
| -------- | --------- |
| `T2_SERVER_BOARD_ENABLED` | `0` = nur App-Host (lokale Arbeitsdatei); Standard: an, wenn Secrets gesetzt |
| `T2_SESSION_SECRET` | Geheimnis für signierte Session-Cookies |
| `T2_AUTH_PASSWORD` | Passwort für den Zugang |
| `T2_AUTH_USERNAME` | Benutzername (Standard: `admin`) |
| `T2_BOARD_FILE_PATH` | Pfad zur JSON-Datei (Standard: `./data/t2-board.json`) |

- **Verbinden / Trennen / Abmelden** im Panel unter „Server“
- **Mouseover auf „Daten“:** aktueller Speicherstatus (z. B. gespeichert, ungespeichert, Offline-Entwurf)

**Offline:** Verknüpfung trennen (Unlink), lokal weiterarbeiten — der Entwurf bleibt im Browser gespeichert. Beim erneuten Verbinden gleicht T2 lokal und Server ab (nur Server geändert → übernehmen; nur lokal geändert → hochladen; beides geändert → Auswahl).

**Automatisch:** Fällt die Netzverbindung weg oder ist der Server nicht erreichbar, während das Server-Board verknüpft ist, wechselt T2 in den Offline-Entwurf (Wolke wird amber). Sobald das Netz wieder da ist, verbindet und gleicht T2 automatisch ab (nur bei diesem automatischen Modus; nach manuellem Trennen bleibt es manuell).

**Mehrere Clients:** Änderungen werden als **Operations-Log** (`/api/board/ops`) mit Zeitstempel gespeichert. Beim Abgleich werden alle Ops chronologisch zusammengeführt (nicht „letzter Client gewinnt“). Pro Karte/Feld gilt: spätere Änderung in der Zeitlinie setzt sich durch. Ops-Datei: neben der Board-JSON (Standard: `data/t2-board-ops.json`).

**Lokale Browser-Kopie (ohne Backup-Datei):** T2 speichert den Board-Stand automatisch in `localStorage` (Schlüssel `t2-board-local-mirror-v1`), auch beim Schließen des Tabs. Nach Neustart wird die Kopie wieder geladen, wenn Sie offline waren, ausstehende Ops haben oder nicht am Server angemeldet sind. Funktioniert auch über **HTTP** (ohne HTTPS).

| Funktion | HTTP (z. B. `http://192.168.x.x:3000`) | HTTPS |
| -------- | -------------------------------------- | ----- |
| Server-Board + Offline-Entwurf | ja | ja |
| Automatische Browser-Kopie | ja | ja |
| Arbeitsdatei (File System Access) | nein | ja |
| PWA / Offline-App starten | nein | ja |

Funktioniert in **allen gängigen Browsern** (keine File-System-API nötig). Die Datei kann per Backup des Server-Ordners gesichert werden.

## PWA (offline starten)

T2 ist als **Progressive Web App** installierbar. Die App-Oberfläche wird per Service Worker gecacht; **Server-Board-Daten** nutzen weiterhin den Offline-Entwurf (siehe oben).

**Ersteinrichtung (einmal online):**

1. Produktion starten (PWA ist im Dev-Modus deaktiviert):
   ```bash
   npm run build
   npm run start
   ```
2. Im Browser `http://localhost:3000` öffnen und Seite vollständig laden.
3. Optional: „Zum Home-Bildschirm hinzufügen“ / „App installieren“ (Chrome, Edge, Safari).

**Danach offline:** Installierte App oder gecachte Seite öffnen — UI läuft ohne Netz. Mit Server-Board: nach vorheriger Anmeldung/Verbindung Entwurf lokal; bei Netz wieder automatischer Abgleich.

**Hinweis:** `npm run dev` registriert keinen Service Worker. ZIP-Standalone (`npm run dist:zip`) enthält `public/sw.js` nach dem Build.

## Karten-IDs (Lox)

Neue Karten erhalten eine **kurze Lox-ID** (Format `XXXX-XXXX`, mit Prüfziffer — wie in `apps/L2`). Sie erscheint auf der Karte (Feld „Karten-ID“ in den Kartenfeldern) und im Detail-Dialog. Bestehende UUIDs aus älteren Exporten bleiben gültig.

## Kurzüberblick

1. Node.js installieren
2. Projektordner auf den Rechner kopieren (`git clone` oder ZIP)
3. `npm install`
4. `npm run dev` oder `npm run build` && `npm run start`
5. Browser: `http://localhost:3000`

Bei Problemen mit `npm install` (Netzwerk, Berechtigungen) Terminalausgabe prüfen; auf Firmenrechnern kann ein Proxy nötig sein.

