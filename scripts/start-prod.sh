#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .next/standalone/server.js ]]; then
  echo "Kein Produktions-Build gefunden." >&2
  echo "Bitte zuerst ausführen: npm run build" >&2
  exit 1
fi

bash "$ROOT/scripts/prepare-standalone.sh"
cd "$ROOT/.next/standalone"
echo "→ Standalone-Server: http://localhost:${PORT:-3000}"
exec node server.js
