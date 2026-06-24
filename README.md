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

**Nur `github.io`, nicht `github.com`.** Sehen Sie Markdown-Text statt eines Boards? → [Pages-Einrichtung](#github-pages-deployen) (Branch `gh-pages`).

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
| Server | Verschlüsseltes Board auf dem Host — Zugriff nur mit Board-LOX-ID (nie in der URL) |

**Sicherung:**

- **Backup erstellen** — JSON herunterladen
- **Backup einspielen** — gesamtes Board ersetzen (mit Bestätigung)

## Karten-IDs (Lox)

Neue Karten erhalten eine kurze Lox-ID (`XXXX-XXXX`). Bestehende UUIDs aus älteren Exporten bleiben gültig.

---

## Für Entwickler & Selbst-Hosting

Die öffentliche URL wird per **GitHub Pages** ausgeliefert (statischer Build, kein Node auf dem Host). Der Rest dieses Abschnitts ist nur nötig, wenn Sie T2 **selbst bauen**, **entwickeln** oder **mit Server-Board** betreiben.

### GitHub Pages deployen

**Ausführliche Anleitung:** [docs/GITHUB-PAGES.md](docs/GITHUB-PAGES.md) (Pages einrichten, optional LOX-Vault mit Render).

Repository: [github.com/abx-git/T2](https://github.com/abx-git/T2) · Workflow: `.github/workflows/deploy-github-pages.yml`

**Kurz:**

1. **Settings → Pages** → Branch `gh-pages`, Folder `/ (root)`
2. Push auf `main` → Workflow baut `out/` und publiziert nach `gh-pages`
3. App-URL: `https://<user>.github.io/<repo>/` (bei Repo `T2`: [abx-git.github.io/T2](https://abx-git.github.io/T2/))

**Optional Server-Speicher (LOX-Vault):**

1. Vault-Host deployen (z. B. `render.yaml` → Render Blueprint)
2. GitHub **Settings → Actions → Variables:** `NEXT_PUBLIC_T2_VAULT_API_URL` = Vault-URL
3. Erneut deployen (Push oder Workflow manuell)

| Variable | Bedeutung |
| -------- | --------- |
| `NEXT_PUBLIC_T2_VAULT_API_URL` | Vault-API für den Pages-Build |
| `NEXT_PUBLIC_BASE_PATH` | Optional; Standard `/<repo-name>` |

**Wenn nur dieses README erscheint:** Pages-Quelle ist falsch (oft `main` / root). Branch `gh-pages` wählen.

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
# .env — kein zentrales Board auf dem Host (nur App ausliefern)
T2_VAULT_ENABLED=0
```

HTTPS nötig für Arbeitsdatei (außer `localhost`).

### LOX-Vault (Server-Speicher)

Boards werden **clientseitig verschlüsselt** auf dem Host gespeichert. Zugriff nur mit **Board-LOX-ID** (`BRD-XXXX-XXXX`) im `Authorization`-Header — **nie** in der URL. Kein Username/Passwort.

Konfiguration in [`.env.example`](.env.example) (`T2_VAULT_ENABLED`, `T2_VAULT_DIR_PATH`, optional `NEXT_PUBLIC_T2_VAULT_API_URL` für GitHub Pages).

**Wichtig:** LOX-ID verlieren = Datenverlust. ID sicher aufbewahren.

### Nützliche Befehle

| Befehl | Bedeutung |
| ------ | --------- |
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Standalone-Build (+ optional Server-Board) |
| `npm run build:static` | Statischer Export → `out/` (GitHub Pages) |
| `npm run start` | Standalone-Server (nach `build`) |
| `npm run dist` | ZIP unter `dist/` |
| `npm run test:run` | Unit-Tests |
