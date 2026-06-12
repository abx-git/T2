# T2

> **Diese Seite ist nur die Dokumentation** (GitHub-Quellcode).
>
> **Die App öffnen:** **[https://abx-git.github.io/T2/](https://abx-git.github.io/T2/)**
>
> Nicht `github.com/abx-git/T2` — das ist das Repo mit diesem Text. Die App läuft unter **`github.io`**.

Hierarchische Aufgaben als Board / Mindmap — wie **diagrams.net**: App im Browser, Daten auf Ihrem Rechner.

## Sofort loslegen

**Keine Installation.** Kein Node.js, kein Terminal, kein Server auf Ihrem PC.

### 👉 [https://abx-git.github.io/T2/](https://abx-git.github.io/T2/)

1. Link im Browser öffnen (Chrome oder Edge empfohlen).
2. Toolbar **„Daten“** → **Arbeitsdatei (JSON)** → **Datei öffnen** oder **Neue Datei**.
3. Fertig — Änderungen werden automatisch in Ihre lokale JSON geschrieben.

**Ohne Arbeitsdatei** bleibt ein Entwurf in diesem Browser (`localStorage`). Für dauerhafte Dateien auf der Festplatte: Schritt 2.

| | diagrams.net | T2 |
| --- | --- | --- |
| App starten | URL öffnen | [abx-git.github.io/T2](https://abx-git.github.io/T2/) |
| Daten | lokal auf dem PC | `t2-board.json` auf dem PC |
| Node.js nötig? | nein | **nein** |

**Browser:** Chrome oder Edge für Auto-Save in eine Datei. Safari/Firefox: **Backup erstellen** / **Backup einspielen** (Download/Upload).

**Optional — App installieren (PWA):** Einmal die URL laden → „Zum Home-Bildschirm hinzufügen“ / „App installieren“. Danach startet T2 auch offline (Oberfläche aus Cache; Board aus Browser oder Arbeitsdatei).

## Daten & Speicher

Über **„Daten“** in der Toolbar: Speicherziel, Backups, Exporte. Status beim Mouseover über den Button.

| Ziel | Bedeutung |
| ---- | --------- |
| Nur in diesem Browser | Entwurf + Notfall-Kopie in `localStorage` |
| Arbeitsdatei | Auto-Save in verknüpfte JSON (Chrome/Edge) |
| Server | Nur bei Selbst-Hosting mit Login — **nicht** auf der öffentlichen URL |

**Sicherung:**

- **Backup erstellen** — JSON herunterladen
- **Backup einspielen** — gesamtes Board ersetzen (mit Bestätigung)

## Karten-IDs (Lox)

Neue Karten erhalten eine kurze Lox-ID (`XXXX-XXXX`). Bestehende UUIDs aus älteren Exporten bleiben gültig.

---

## Für Entwickler & Selbst-Hosting

Die öffentliche URL wird per **GitHub Pages** ausgeliefert (statischer Build, kein Node auf dem Host). Der Rest dieses Abschnitts ist nur nötig, wenn Sie T2 **selbst bauen**, **entwickeln** oder **mit Server-Board** betreiben.

### GitHub Pages deployen

Repository: [github.com/abx-git/T2](https://github.com/abx-git/T2) · Workflow: `.github/workflows/deploy-github-pages.yml`

1. Auf GitHub: **Settings → Pages → Source: GitHub Actions**
2. Push auf `main` → Workflow **Deploy GitHub Pages**

Lokal testen:

```bash
npm run build:static
npx serve out
# → http://localhost:3000/T2/
```

### Voraussetzungen (nur Entwicklung / Selbst-Hosting)

- **Node.js** 20 oder 22 · `npm install` im Projektroot

### Entwicklung

```bash
npm run dev
```

→ [http://localhost:3000](http://localhost:3000)

### Standalone (eigener Server mit optional Server-Board)

```bash
npm run build
npm run start
```

ZIP-Artefakt: `npm run dist` → `dist/*.zip` (Empfänger braucht nur Node.js 20+, kein npm).

Docker: `docker compose up -d --build`

### App auf Server, Datei lokal

Wie diagrams.net Embed: Host liefert nur die Web-App, Board liegt in **Arbeitsdatei** auf dem Client.

```bash
# .env — kein zentrales Board auf dem Host
T2_SERVER_BOARD_ENABLED=0
```

HTTPS nötig für Arbeitsdatei (außer `localhost`).

### Server-Board (optional)

JSON auf dem Host, Login per Session. Konfiguration in `.env.example` (`T2_SESSION_SECRET`, `T2_AUTH_PASSWORD`, …). Multi-Client-Sync über Operations-Log.

### Nützliche Befehle

| Befehl | Bedeutung |
| ------ | --------- |
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Standalone-Build (+ optional Server-Board) |
| `npm run build:static` | Statischer Export → `out/` (GitHub Pages) |
| `npm run start` | Standalone-Server (nach `build`) |
| `npm run dist` | ZIP unter `dist/` |
| `npm run test:run` | Unit-Tests |
