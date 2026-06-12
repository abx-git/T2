# T2 — Standalone (ohne Quellcode)

Dieses Paket enthält **Anwendung und Node-Server** in einem Ordner. Es ist **kein** `npm install` nötig.

## Voraussetzungen

- **Node.js 20 oder 22** (LTS): [https://nodejs.org](https://nodejs.org)
- Prüfen: `node -v`

## Schnellstart

```bash
./start.sh
```

Oder: `node server.js`

Browser: **http://localhost:3000** (anderer Port: `PORT=8080 ./start.sh`)

## Server-Board (optional)

1. `.env` anlegen:
   ```bash
   cp .env.example .env
   ```
2. In `.env` mindestens setzen:
   - `T2_SESSION_SECRET` — langer Zufallsstring
   - `T2_AUTH_PASSWORD` — Login-Passwort
3. Server neu starten.

Board-Daten liegen standardmäßig unter `./data/` (im ZIP-Ordner, beim Start automatisch angelegt).

## Umgebungsvariablen

| Variable | Bedeutung |
| -------- | --------- |
| `PORT` | HTTP-Port (Standard: 3000) |
| `HOSTNAME` | Bind-Adresse (Standard: 0.0.0.0 — erreichbar im LAN) |
| `T2_SESSION_SECRET` | Session-Cookie (Server-Board) |
| `T2_AUTH_USERNAME` | Login-Benutzer (Standard: admin) |
| `T2_AUTH_PASSWORD` | Login-Passwort |
| `T2_BOARD_FILE_PATH` | Pfad zur Board-JSON (Standard: ./data/t2-board.json) |

## Plattform

Das Bundle wurde auf **diesem Betriebssystem/ dieser Architektur** gebaut. Für Linux-Server idealerweise dort bauen (`npm run dist:zip`) oder das **Docker-Image** aus dem Quellprojekt nutzen.

## PWA / Offline

Nach dem ersten Laden im Browser (über HTTP/HTTPS) kann die App installiert werden. Nach Updates im Browser **hart neu laden** (macOS: ⌘⇧R).
