# Hierarchischer Task-Manager (T2)

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

```bash
npm run build
npm run start
```

Ebenfalls typischerweise Port **3000**. Für einen anderen Port, z. B. 4000:

```bash
npx next start -p 4000
```

### Als ZIP-Artefakt ausliefern (Standalone)

Das Projekt ist mit **`output: 'standalone'`** konfiguriert. Damit entsteht nach dem Build ein **minimales Node-Bundle** unter `.next/standalone`, das Sie als **eine ZIP-Datei** weitergeben können (ohne gesamtes `node_modules` aus dem Quellprojekt).

```bash
npm run dist:zip
```

- Ergebnis: **`dist/hierarchical-task-manager-standalone-<Datum-Zeit>.zip`**
- **Empfänger:** ZIP entpacken, im entpackten Ordner **`node server.js`** ausführen (weiterhin **Node.js 20+** nötig). Standardport **3000**, z. B. `PORT=8080 node server.js`.
- **Hinweis:** Das Bundle enthält nur die für den Server nötigen Abhängigkeiten. Native Module sind an die **Build-Plattform** gebunden — für Linux-Server idealerweise auf **Linux** bauen (oder Docker-Image bauen).

## Nützliche Befehle

| Befehl            | Bedeutung                          |
| ----------------- | ---------------------------------- |
| `npm run dev`     | Entwicklungsserver                 |
| `npm run build`   | Produktions-Build erzeugen         |
| `npm run start`   | Produktionsserver (nach `build`)  |
| `npm run dist:zip` | Build + ZIP-Artefakt unter `dist/` (Standalone) |
| `npm run lint`    | ESLint                             |
| `npm run test:run`| Unit-Tests (Vitest)                |

## Speichern in eine Datei (Browser)

Die Funktion **„Stand in eine Datei sichern“** nutzt die **File System Access API** („Speichern unter“). Das funktioniert zuverlässig in **Chrome** und **Edge**. In **Brave** ist die API oft standardmäßig aus: in der Adresszeile `brave://flags/#file-system-access-api` öffnen, **File System Access API** auf **Enabled** setzen und Brave neu starten.

Ohne diese API können Sie den Stand weiterhin über **Export (Download)** als JSON sichern.

## Kurzüberblick

1. Node.js installieren  
2. Projektordner auf den Rechner kopieren (`git clone` oder ZIP)  
3. `npm install`  
4. `npm run dev` oder `npm run build` && `npm run start`  
5. Browser: `http://localhost:3000`

Bei Problemen mit `npm install` (Netzwerk, Berechtigungen) Terminalausgabe prüfen; auf Firmenrechnern kann ein Proxy nötig sein.
