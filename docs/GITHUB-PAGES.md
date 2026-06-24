# T2 auf GitHub Pages

Diese Anleitung richtet die **statische App** auf GitHub Pages ein. Optional kommt ein **LOX-Vault** (verschlüsselter Server-Speicher) dazu — der läuft **nicht** auf Pages, sondern auf einem kleinen Node-Host (z. B. Render).

## Übersicht

| Komponente | Wo | Kosten |
|------------|-----|--------|
| T2-App (PWA) | GitHub Pages | kostenlos |
| LOX-Vault-API | z. B. [Render](https://render.com) + `render.yaml` | Free-Tier möglich* |
| Arbeitsdatei / Browser | beim Nutzer | kostenlos |

\* Render Free: Service schläft nach Inaktivität; erster Request kann langsam sein. Persistente Festplatte ggf. kostenpflichtig — für Tests reicht oft der Container-Speicher; für Produktion Plan prüfen.

---

## Schritt 1 — GitHub Pages aktivieren

1. Repository auf **GitHub** (nicht nur lokal).
2. **Settings → Pages → Build and deployment**
3. **Source:** Deploy from a branch  
4. **Branch:** `gh-pages` · **Folder:** `/ (root)` · **Save**
5. Push auf `main` — Workflow [`.github/workflows/deploy-github-pages.yml`](../.github/workflows/deploy-github-pages.yml) erzeugt `gh-pages`.

**App-URL:** `https://<github-user>.github.io/<repo-name>/`  
Beispiel: `https://abx-git.github.io/T2/`

> Zeigt die Seite nur README? Pages-Quelle ist falsch (oft `main` statt `gh-pages`).

---

## Schritt 2 — Nur App (ohne Server-Speicher)

Nach dem ersten erfolgreichen Deploy:

1. App-URL im Browser öffnen (Chrome/Edge empfohlen).
2. **Daten** → **Arbeitsdatei** → Datei öffnen oder neu anlegen.

Ohne Vault-URL ist die **Server-Option** in der App ausgeblendet — das ist normal.

Lokal testen:

```bash
npm run build:static
# Optional anderer Pfad:
# NEXT_PUBLIC_BASE_PATH=/MeinRepo npm run build:static
npx serve out
# → http://localhost:3000<T2 oder /MeinRepo>/
```

---

## Schritt 3 — Optional: LOX-Vault + Server in der App

### 3a) Vault auf Render deployen

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**
2. Dieses Repository verbinden — `render.yaml` wird erkannt.
3. In `render.yaml` **vor dem Deploy** anpassen:
   ```yaml
   T2_VAULT_CORS_ORIGINS: https://<IHR-GITHUB-USER>.github.io,http://localhost:3000
   ```
4. Deploy starten → öffentliche URL notieren, z. B. `https://t2-vault-xxxx.onrender.com`

Alternativ: `docker compose up` auf eigenem Server/VPS — siehe [README](../README.md).

### 3b) Vault-URL in GitHub hinterlegen

**Settings → Secrets and variables → Actions → Variables → New repository variable**

| Variable | Beispiel | Pflicht |
|----------|----------|---------|
| `NEXT_PUBLIC_T2_VAULT_API_URL` | `https://t2-vault-xxxx.onrender.com` | ja (für Server-Option) |
| `NEXT_PUBLIC_BASE_PATH` | `/T2` | nein (Standard: `/` + Repo-Name) |

Kein Slash am Ende der Vault-URL.

### 3c) App neu deployen

- Push auf `main`, **oder**
- **Actions** → **Deploy GitHub Pages** → **Run workflow**  
  (optional Vault-URL im Dialog eintragen)

### 3d) Prüfen

1. App öffnen → **Daten** → Option **Server (LOX-ID)** sollte verfügbar sein.
2. **Neues Board** → LOX-ID notieren/kopieren.
3. Zweites Gerät/Browser: **Mit LOX-ID verbinden**.

---

## Repository-Variablen (Referenz)

| Variable | Wirkung |
|----------|---------|
| `NEXT_PUBLIC_BASE_PATH` | URL-Pfad der App (`/T2` bei Project Pages). Leer lassen → automatisch `/<repo-name>`. |
| `NEXT_PUBLIC_T2_VAULT_API_URL` | Vault-API für den statischen Build. Ohne Wert: keine Server-Option. |

Variablen werden **beim Build** eingebaut — nach Änderung **neu deployen**.

---

## Häufige Probleme

| Symptom | Lösung |
|---------|--------|
| Nur README sichtbar | Pages-Quelle auf Branch `gh-pages` stellen |
| 404 auf Unterseiten | `.nojekyll` liegt im Build (`out/.nojekyll`) — Workflow prüfen |
| Server-Option fehlt | `NEXT_PUBLIC_T2_VAULT_API_URL` setzen und neu deployen |
| Vault-Verbindung schlägt fehl | `T2_VAULT_CORS_ORIGINS` auf dem Vault-Host muss `https://<user>.github.io` enthalten |
| Arbeitsdatei geht nicht | HTTPS nötig (GitHub Pages OK); Safari/Firefox: Backup nutzen |

---

## Sicherheit (LOX-Vault)

- Board-LOX-ID = alleiniges Geheimnis — **sicher aufbewahren**
- ID steht **nicht** in URLs, nur im `Authorization`-Header
- Server speichert nur **verschlüsselte** Blobs
- Verlorene LOX-ID → Daten nicht wiederherstellbar
