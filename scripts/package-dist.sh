#!/usr/bin/env bash
# Nach `npm run build`: kopiert .next/static und public ins Standalone-Bundle und erzeugt dist/*.zip
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STAND="$ROOT/.next/standalone"
if [[ ! -f "$STAND/server.js" ]]; then
  echo "Fehler: Zuerst 'npm run build' ausführen (output: standalone)." >&2
  exit 1
fi

echo "→ Kopiere .next/static und public in standalone …"
mkdir -p "$STAND/.next/static"
mkdir -p "$STAND/public"
rsync -a --delete "$ROOT/.next/static/" "$STAND/.next/static/"
rsync -a --delete "$ROOT/public/" "$STAND/public/"

OUT="$ROOT/dist"
mkdir -p "$OUT"
STAMP="$(date +%Y%m%d-%H%M)"
ZIP="$OUT/hierarchical-task-manager-standalone-${STAMP}.zip"
rm -f "$ZIP"

echo "→ ZIP: $ZIP"
( cd "$STAND" && zip -rq "$ZIP" . )

echo "Fertig. Ausliefern: ZIP entpacken, dann: node server.js (Port 3000, oder PORT=8080 node server.js)"
