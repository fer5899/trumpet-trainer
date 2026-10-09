#!/usr/bin/env sh
# Test environment for human validation of specs/in-app-configuration (prd.md + prd2.md).
# Runs in Git Bash (Windows) or any POSIX shell. Safe to run repeatedly; Ctrl+C stops everything.
#
# Services:
#   5173  normal dev server (real random melodies, Settings panel, localStorage persistence)
#   5174  dev server in e2e mode (VITE_E2E=true: ?melody= with 3–8 notes fixes the melody)
#   4173  production build preview (/trumpet-trainer/ base path, as on GitHub Pages)
# Each port is its own origin, so each has its own localStorage (settings + threshold).
set -eu

cd "$(dirname "$0")/../.."

DEV_PORT=5173
E2E_PORT=5174
PREVIEW_PORT=4173

PIDS=""
cleanup() {
  for pid in $PIDS; do kill "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT INT TERM

port_in_use() { curl -s -o /dev/null "http://localhost:$1/" 2>/dev/null; }

wait_for() {
  url="$1"; tries=0
  until curl -sf "$url" > /dev/null; do
    tries=$((tries + 1))
    if [ "$tries" -gt 60 ]; then echo "Timed out waiting for $url" >&2; exit 1; fi
    sleep 1
  done
}

for port in "$DEV_PORT" "$E2E_PORT" "$PREVIEW_PORT"; do
  if port_in_use "$port"; then
    echo "Port $port is already in use; stop the other server first." >&2
    exit 1
  fi
done

echo "==> Installing dependencies"
npm ci

echo "==> Unit tests"
npm test

echo "==> Generating fake-mic tone fixture (for npm run test:e2e)"
npm run generate:tones

echo "==> Building the production bundle"
npm run build

echo "==> Starting Vite dev server on $DEV_PORT"
npx vite --port "$DEV_PORT" --strictPort > /dev/null 2>&1 &
PIDS="$PIDS $!"

echo "==> Starting Vite dev server in e2e mode on $E2E_PORT (enables ?melody=)"
npx vite --mode e2e --port "$E2E_PORT" --strictPort > /dev/null 2>&1 &
PIDS="$PIDS $!"

echo "==> Starting production preview on $PREVIEW_PORT"
npx vite preview --port "$PREVIEW_PORT" --strictPort > /dev/null 2>&1 &
PIDS="$PIDS $!"

wait_for "http://localhost:$DEV_PORT/"
wait_for "http://localhost:$E2E_PORT/"
wait_for "http://localhost:$PREVIEW_PORT/trumpet-trainer/"

echo ""
echo "Services running:"
echo "  App (dev):                http://localhost:$DEV_PORT/"
echo "  App (dev, e2e mode):      http://localhost:$E2E_PORT/"
echo "    5 x Si4 (matches A4):   http://localhost:$E2E_PORT/?melody=71,71,71,71,71"
echo "    3 notes:                http://localhost:$E2E_PORT/?melody=71,60,72"
echo "    8 notes:                http://localhost:$E2E_PORT/?melody=71,71,71,71,71,71,71,71"
echo "    progress then stuck:    http://localhost:$E2E_PORT/?melody=71,71,71,60,60"
echo "    Si-flat in Fa major:    http://localhost:$E2E_PORT/?melody=65,70,72 (select Fa major first)"
echo "  Production preview:       http://localhost:$PREVIEW_PORT/trumpet-trainer/"
echo ""
echo "Clear saved settings in the browser console: localStorage.clear(); location.reload()"
echo "Press Ctrl+C to stop."
wait
