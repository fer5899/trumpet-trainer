#!/usr/bin/env bash
# Trumpet Trainer — in-app configuration (Part 1) — validation Run 1 wrapper.
# Usage (from the repo root, Git Bash on Windows or bash on Linux/macOS):
#   bash specs/in-app-configuration/validation-run-1/run.sh
#
# Order:
#   1. pre-flight (node/npx/curl, node_modules/@playwright/test, WAV fixture)
#   2. start `npm run dev:e2e` in the background if http://localhost:5173/ is down
#   3. node validate.mjs --browser   (items 1–15)
#   4. stop the dev server this script started (Windows: taskkill the listener's tree) and wait until 5173 is free
#   5. regression: lint, typecheck, npm test, npm run test:e2e (Playwright starts its own server)
#   6. node validate.mjs --report    (adds item 16, writes the report) → exit code of this script
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ASSETS_DIR="$REPO_ROOT/specs/in-app-configuration/validation-assets"
RUN_DIR="$ASSETS_DIR/run-1"
OUT_DIR="$RUN_DIR/output"
REPORT="$ASSETS_DIR/validation-report-run-1.md"
PORT=5173
URL="http://localhost:$PORT/"
cd "$REPO_ROOT" || exit 2

fail() { echo "PRE-FLIGHT FAILED: $*" >&2; exit 2; }
is_windows() { [ "${OS:-}" = "Windows_NT" ]; }

# ---------------------------------------------------------------- pre-flight
echo "== Pre-flight =="
for cmd in node npm npx curl; do
  command -v "$cmd" > /dev/null 2>&1 || fail "'$cmd' is not on PATH"
done
echo "node $(node --version), npm $(npm --version)"
[ -d node_modules/@playwright/test ] || fail "node_modules/@playwright/test missing — run 'npm ci' first"

rm -rf "$OUT_DIR"
mkdir -p "$RUN_DIR/screenshots" "$RUN_DIR/api" "$OUT_DIR"

if [ ! -f e2e/fixtures/tone-a4-440hz.wav ]; then
  echo "Generating the fake-mic tone fixture"
  npm run generate:tones > "$OUT_DIR/00-generate-tones.txt" 2>&1 || fail "npm run generate:tones failed (see $OUT_DIR/00-generate-tones.txt)"
fi

# ---------------------------------------------------------------- port helpers
http_up() { [ "$(curl -s -o /dev/null -w '%{http_code}' "$URL" 2>/dev/null)" = "200" ]; }

listener_pids() {
  if is_windows; then
    netstat -ano 2>/dev/null | grep -E "[:.]$PORT[[:space:]].*LISTENING" | awk '{print $NF}' | sort -u
  elif command -v lsof > /dev/null 2>&1; then
    lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null | sort -u
  fi
}

port_busy() {
  if [ -n "$(listener_pids)" ]; then return 0; fi
  http_up
}

stop_dev_server() {
  if [ -n "${DEV_PID:-}" ]; then kill "$DEV_PID" 2>/dev/null || true; fi
  for pid in $(listener_pids); do
    if is_windows; then
      taskkill //PID "$pid" //T //F > /dev/null 2>&1 || true
    else
      kill "$pid" 2>/dev/null || true
    fi
  done
  tries=0
  while port_busy; do
    tries=$((tries + 1))
    [ "$tries" -gt 15 ] && return 1
    sleep 1
  done
  return 0
}

STARTED_SERVER=0
DEV_PID=""
cleanup() {
  if [ "$STARTED_SERVER" = "1" ]; then stop_dev_server > /dev/null 2>&1 || true; STARTED_SERVER=0; fi
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT TERM

# ---------------------------------------------------------------- dev server (e2e mode)
echo
echo "== Dev server (e2e mode) on $PORT =="
if http_up; then
  echo "A server is already running on $PORT; reusing it (it must be 'npm run dev:e2e' for ?melody= to work)."
else
  npm run dev:e2e > "$OUT_DIR/00-dev-server.txt" 2>&1 &
  DEV_PID=$!
  STARTED_SERVER=1
  tries=0
  until http_up; do
    tries=$((tries + 1))
    if [ "$tries" -gt 60 ]; then
      echo "Dev server did not answer 200 on $URL within 60 s (see $OUT_DIR/00-dev-server.txt)." >&2
      break
    fi
    sleep 1
  done
  http_up && echo "Started (npm PID $DEV_PID)."
fi

# ---------------------------------------------------------------- browser checks
echo
echo "== Browser checks (items 1–15) =="
node "$SCRIPT_DIR/validate.mjs" --browser
echo "validate.mjs --browser exit code: $?"

# ---------------------------------------------------------------- stop the dev server
NOTE=""
if [ "$STARTED_SERVER" = "1" ]; then
  echo
  echo "== Stopping the dev server =="
  if stop_dev_server; then
    echo "Port $PORT is free."
  else
    echo "WARNING: port $PORT is still in use." >&2
    NOTE="the dev server started by run.sh could not be stopped"
  fi
  STARTED_SERVER=0
else
  NOTE="a pre-existing server on $PORT was left running"
fi
if port_busy; then PORT_FREE=false; else PORT_FREE=true; fi

# ---------------------------------------------------------------- regression (item 16)
echo
echo "== Regression (item 16) =="
run_cmd() { # name outfile command...
  name="$1"; out="$2"; shift 2
  echo "-- $*"
  NO_COLOR=1 FORCE_COLOR=0 "$@" > "$OUT_DIR/$out" 2>&1
  code=$?
  echo "   exit $code (output: $OUT_DIR/$out)"
  eval "CODE_$name=$code"
}
run_cmd lint 16-lint.txt npm run lint
run_cmd typecheck 16-typecheck.txt npm run typecheck
run_cmd test 16-unit-tests.txt npm test
run_cmd e2e 16-e2e.txt npm run test:e2e

# Playwright may leave its own dev server behind on Windows; make sure nothing listens on 5173.
if port_busy && [ "$PORT_FREE" = "true" ]; then stop_dev_server > /dev/null 2>&1 || true; fi

printf '{"lint":%s,"typecheck":%s,"test":%s,"e2e":%s,"port5173FreeBeforeE2e":%s,"note":"%s"}\n' \
  "$CODE_lint" "$CODE_typecheck" "$CODE_test" "$CODE_e2e" "$PORT_FREE" "$NOTE" > "$OUT_DIR/regression-status.json"

# ---------------------------------------------------------------- report
echo
echo "== Report =="
node "$SCRIPT_DIR/validate.mjs" --report
code=$?

echo
echo "== Result =="
if [ -f "$REPORT" ]; then
  grep -m1 -E '^\*\*Summary:\*\*' "$REPORT" || true
  echo "Report: $REPORT"
else
  echo "No report was written ($REPORT missing)."
fi
echo "validate.mjs exit code: $code"
exit "$code"
