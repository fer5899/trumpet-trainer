#!/usr/bin/env sh
# Test environment for human validation of specs/in-app-configuration.
# Runs in Git Bash (Windows) or any POSIX shell. Safe to run repeatedly; Ctrl+C stops everything.
set -eu

cd "$(dirname "$0")/../.."

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

echo "==> Installing dependencies"
npm ci

echo "==> Unit tests (the Part 1 domain modules are validated here)"
npm test

echo "==> Generating fake-mic tone fixture"
npm run generate:tones

if port_in_use 5173; then
  echo "Port 5173 is already in use; stop the other server first." >&2
  exit 1
fi

echo "==> Starting Vite dev server in e2e mode (enables ?melody=)"
npm run dev:e2e > /dev/null 2>&1 &
PIDS="$PIDS $!"
wait_for http://localhost:5173/

echo ""
echo "Services running:"
echo "  App (dev, e2e mode):  http://localhost:5173/"
echo "  Deterministic melody: http://localhost:5173/?melody=71,71,71,71,71"
echo ""
echo "Press Ctrl+C to stop."
wait
