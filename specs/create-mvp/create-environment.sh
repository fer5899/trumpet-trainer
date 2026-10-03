#!/usr/bin/env bash
# Sets up the Trumpet Trainer test environment for human validation.
# Starts the Vite dev server (5173), the deterministic e2e-mode dev server (5174,
# enables the ?melody= test hook) and the production preview (4173), generates the
# fake-mic tone fixture, and stops all servers on exit (Ctrl+C).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

DEV_PORT=5173
E2E_PORT=5174
PREVIEW_PORT=4173
PIDS=()

cleanup() {
  echo
  echo "Stopping background services..."
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT

wait_for() {
  local url="$1" name="$2" tries=0
  until curl -sf "$url" > /dev/null; do
    tries=$((tries + 1))
    if [ "$tries" -gt 60 ]; then
      echo "ERROR: $name did not become healthy at $url" >&2
      exit 1
    fi
    sleep 1
  done
}

port_in_use() {
  curl -s -o /dev/null "http://localhost:$1/" 2>/dev/null
}

for port in "$DEV_PORT" "$E2E_PORT" "$PREVIEW_PORT"; do
  if port_in_use "$port"; then
    echo "ERROR: port $port is already in use. Stop the process using it and re-run." >&2
    exit 1
  fi
done

echo "Installing dependencies..."
npm ci

echo "Generating fake-mic tone fixture..."
npm run generate:tones

echo "Building production bundle..."
npm run build

echo "Starting Vite dev server on port $DEV_PORT..."
npm run dev -- --port "$DEV_PORT" --strictPort > /dev/null 2>&1 &
PIDS+=("$!")
wait_for "http://localhost:$DEV_PORT/" "Vite dev server"

echo "Starting e2e-mode dev server (VITE_E2E=true) on port $E2E_PORT..."
npx vite --mode e2e --port "$E2E_PORT" --strictPort > /dev/null 2>&1 &
PIDS+=("$!")
wait_for "http://localhost:$E2E_PORT/" "E2E-mode dev server"

echo "Starting production preview on port $PREVIEW_PORT..."
npm run preview -- --port "$PREVIEW_PORT" --strictPort > /dev/null 2>&1 &
PIDS+=("$!")
wait_for "http://localhost:$PREVIEW_PORT/trumpet-trainer/" "Production preview"

cat <<EOF

============================================================
 Trumpet Trainer test environment is running
------------------------------------------------------------
 Dev server:          http://localhost:$DEV_PORT/
 Deterministic mode:  http://localhost:$E2E_PORT/?melody=71,71,71,71,71
                      (?melody= hook enabled; 71 = written Si4 = concert A4 440 Hz)
 Production preview:  http://localhost:$PREVIEW_PORT/trumpet-trainer/
 Fake-mic fixture:    e2e/fixtures/tone-a4-440hz.wav
============================================================
 Note: stop this script before running npm run test:e2e (it needs port 5173
 for its own e2e-mode server).
 Press Ctrl+C to stop all services.
EOF

wait
