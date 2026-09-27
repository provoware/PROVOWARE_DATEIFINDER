#!/usr/bin/env bash
set -Eeuo pipefail
cd -- "$(dirname -- "$0")"
echo "PROVOWARE DateiFinder – Startprüfung"
for cmd in node npm cargo; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "FEHLT: $cmd"; exit 2; }
done
if [[ ! -d node_modules ]]; then
  echo "Abhängigkeiten fehlen – führe reproduzierbares npm ci aus …"
  npm ci --ignore-scripts --no-audit --no-fund
fi
exec npm run tauri dev
