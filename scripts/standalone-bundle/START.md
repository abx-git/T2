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

## LOX-Vault (optional)

1. `.env` anlegen:
   ```bash
   cp .env.example .env
   ```
2. Standard: `T2_VAULT_ENABLED=1` — verschlüsselte Boards unter `./data/vaults/`
3. Nur App ausliefern (ohne Server-Speicher): `T2_VAULT_ENABLED=0`

Im Browser: **Daten** → **Server (LOX-ID)** → neues Board anlegen oder mit bestehender Board-LOX-ID verbinden.

## Umgebungsvariablen

| Variable | Bedeutung |
| -------- | --------- |
| `PORT` | HTTP-Port (Standard: 3000) |
| `HOSTNAME` | Bind-Adresse (Standard: 0.0.0.0 — erreichbar im LAN) |
| `T2_VAULT_ENABLED` | `1` = Vault-API aktiv (Standard), `0` = nur App |
| `T2_VAULT_DIR_PATH` | Speicherordner für verschlüsselte Blobs (Standard: ./data/vaults) |
| `T2_VAULT_MAX_BYTES` | Maximale Blob-Größe in Bytes (Standard: 8 MiB) |
| `T2_VAULT_CORS_ORIGINS` | Kommagetrennte Origins für Cross-Origin-Zugriff |

## Plattform

Das Bundle wurde auf **diesem Betriebssystem/ dieser Architektur** gebaut. Für Linux-Server idealerweise dort bauen (`npm run dist:zip`) oder das **Docker-Image** aus dem Quellprojekt nutzen.

## PWA / Offline

Nach dem ersten Laden im Browser (über HTTP/HTTPS) kann die App installiert werden. Nach Updates im Browser **hart neu laden** (macOS: ⌘⇧R).
