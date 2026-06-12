#!/usr/bin/env bash
# Startet den T2-Standalone-Server (nach Entpacken der ZIP im gleichen Ordner ausführen).
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f server.js ]]; then
  echo "Fehler: server.js fehlt. ZIP vollständig entpacken." >&2
  exit 1
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
elif [[ -f .env.example ]]; then
  echo "Hinweis: Keine .env — Server-Board optional mit: cp .env.example .env"
fi

: "${PORT:=3000}"
: "${HOSTNAME:=0.0.0.0}"

echo "→ T2 läuft auf http://127.0.0.1:${PORT} (Bind: ${HOSTNAME})"
exec node server.js
