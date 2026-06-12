#!/usr/bin/env bash
# Standalone-Bundle packen: static/public, Startskript, Doku, dist/*.zip
# Fehlt .next/standalone, wird automatisch `npm run build` ausgeführt (--no-build zum Überspringen).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BUNDLE="$ROOT/scripts/standalone-bundle"

RUN_BUILD=1
for arg in "$@"; do
  case "$arg" in
    --no-build) RUN_BUILD=0 ;;
    -h|--help)
      echo "Verwendung: $(basename "$0") [--no-build]"
      echo "  --no-build  Kein Build; bricht ab, wenn .next/standalone fehlt."
      exit 0
      ;;
    *)
      echo "Unbekannte Option: $arg (siehe --help)" >&2
      exit 1
      ;;
  esac
done

STAND="$ROOT/.next/standalone"
if [[ ! -f "$STAND/server.js" ]]; then
  if [[ "$RUN_BUILD" -eq 0 ]]; then
    echo "Fehler: $STAND/server.js fehlt. Build ausführen oder ohne --no-build starten." >&2
    exit 1
  fi
  echo "→ Kein Standalone-Build gefunden — starte npm run build …"
  npm run build
fi

if [[ ! -f "$STAND/server.js" ]]; then
  echo "Fehler: Nach dem Build fehlt weiterhin $STAND/server.js (Build fehlgeschlagen?)." >&2
  exit 1
fi

echo "→ Kopiere .next/static und public in standalone …"
bash "$ROOT/scripts/prepare-standalone.sh"

VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo "0.0.0")"
STAMP="$(date +%Y%m%d-%H%M)"
PKG_NAME="hierarchical-task-manager-v${VERSION}-standalone-${STAMP}"

cp "$ROOT/.env.example" "$STAND/.env.example"
cp "$BUNDLE/START.md" "$STAND/START.md"
cp "$BUNDLE/start.sh" "$STAND/start.sh"
chmod +x "$STAND/start.sh"
mkdir -p "$STAND/data"
echo "Board-JSON und Ops-Log (Server-Board)" > "$STAND/data/README.txt"

OUT="$ROOT/dist"
mkdir -p "$OUT"
ZIP="$OUT/${PKG_NAME}.zip"
rm -f "$ZIP"

echo "→ ZIP: $ZIP"
( cd "$STAND" && zip -rq "$ZIP" . )

BYTES="$(wc -c < "$ZIP" | tr -d ' ')"
echo "Fertig (${BYTES} Bytes)."
echo ""
echo "Ausliefern:"
echo "  1. ZIP entpacken"
echo "  2. optional: cp .env.example .env && Werte setzen"
echo "  3. ./start.sh   (oder: node server.js)"
echo "  4. Browser: http://localhost:3000"
