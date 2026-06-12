#!/usr/bin/env bash
# Kopiert static/public in .next/standalone (nötig für node server.js).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAND="$ROOT/.next/standalone"

if [[ ! -f "$STAND/server.js" ]]; then
  exit 0
fi

mkdir -p "$STAND/.next/static" "$STAND/public"
rsync -a --delete "$ROOT/.next/static/" "$STAND/.next/static/"
rsync -a --delete "$ROOT/public/" "$STAND/public/"
