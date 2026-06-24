#!/usr/bin/env bash
# Statischer Export für GitHub Pages / beliebigen Static-Host (kein Node-Server).
# API-Routen werden nur für Standalone gebraucht und hier temporär ausgeblendet.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_STASH=""
cleanup() {
  if [[ -n "$API_STASH" && -d "$API_STASH/api" ]]; then
    rm -rf "$ROOT/src/app/api"
    mv "$API_STASH/api" "$ROOT/src/app/api"
    rmdir "$API_STASH" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [[ ! -d "$ROOT/src/app/api" ]]; then
  echo "Fehler: src/app/api fehlt." >&2
  exit 1
fi

API_STASH="$(mktemp -d)"
mv "$ROOT/src/app/api" "$API_STASH/api"

export T2_BUILD_TARGET=static
export NEXT_PUBLIC_BASE_PATH="${NEXT_PUBLIC_BASE_PATH:-/T2}"

if [[ -n "${NEXT_PUBLIC_T2_VAULT_API_URL:-}" ]]; then
  echo "→ Vault-API (Build-Zeit): ${NEXT_PUBLIC_T2_VAULT_API_URL}"
else
  echo "→ Kein NEXT_PUBLIC_T2_VAULT_API_URL — Server-Option in der App deaktiviert."
  echo "  Für LOX-Vault: Variable in GitHub Actions setzen oder export NEXT_PUBLIC_T2_VAULT_API_URL=…"
fi

echo "→ Statischer Build (basePath=${NEXT_PUBLIC_BASE_PATH}) …"
npx next build

if [[ ! -d "$ROOT/out" ]]; then
  echo "Fehler: out/ wurde nicht erzeugt." >&2
  exit 1
fi

if [[ ! -f "$ROOT/out/.nojekyll" ]]; then
  cp "$ROOT/public/.nojekyll" "$ROOT/out/.nojekyll"
fi

echo "→ Fertig: $ROOT/out"
echo "   Vorschau: npx serve out   dann Browser: http://localhost:3000${NEXT_PUBLIC_BASE_PATH}/"
