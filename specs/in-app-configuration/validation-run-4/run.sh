#!/usr/bin/env bash
# Trumpet Trainer — in-app configuration — validation Run 4 wrapper (post /t-review #2):
# prd2.md items 1–51 re-run + Appendix B items 52–60.
# Usage (from anywhere, Git Bash on Windows or bash on Linux/macOS):
#   bash specs/in-app-configuration/validation-run-4/run.sh
#
# Order:
#   1. pre-flight (node/npm/npx/curl, node_modules/@playwright/test, WAV fixture; warns if the Run 3 report is missing)
#   2. stop anything already listening on 5173 / 5174 / 4173, then start FRESH servers: dev on 5173,
#      e2e-mode dev on 5174 and, after `npm run build`, the production preview on 4173
#   3. node validate.mjs --browser   (items 1–49, 51 and 52–56)
#   4. stop every server this script started (Windows: taskkill the listener's tree); verify 5173 is free
#   5. regression (item 50): lint, typecheck, npm test, test:scripts, build, test:e2e (= item 57 run 1)
#   6. item 57: two more `npm run test:e2e` runs (port 5173 freed before each)
#   7. node validate.mjs --report    (items 50, 57–60, comparison with Run 3, report) → exit code of this script
#
# Optional: VALIDATE_ONLY=52,53 runs only the browser groups containing those items (debugging); the
# regression commands and the report phase still run.
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ASSETS_DIR="$REPO_ROOT/specs/in-app-configuration/validation-assets"
RUN_DIR="$ASSETS_DIR/run-4"
OUT_DIR="$RUN_DIR/output"
REPORT="$ASSETS_DIR/validation-report-run-4.md"
DEV_PORT=5173
E2E_PORT=5174
PREVIEW_PORT=4173
DEV_URL="http://localhost:$DEV_PORT/"
E2E_URL="http://localhost:$E2E_PORT/"
PREVIEW_URL="http://localhost:$PREVIEW_PORT/trumpet-trainer/"
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
[ -f "$ASSETS_DIR/validation-report-run-3.md" ] || echo "WARNING: validation-report-run-3.md not found; the comparison section will be empty." >&2

rm -rf "$OUT_DIR"
mkdir -p "$RUN_DIR/screenshots" "$RUN_DIR/api" "$OUT_DIR"

if [ ! -f e2e/fixtures/tone-a4-440hz.wav ]; then
  echo "Generating the fake-mic tone fixture"
  npm run generate:tones > "$OUT_DIR/00-generate-tones.txt" 2>&1 || fail "npm run generate:tones failed (see $OUT_DIR/00-generate-tones.txt)"
fi

# ---------------------------------------------------------------- port helpers
http_up() { [ "$(curl -s -o /dev/null -w '%{http_code}' "$1" 2>/dev/null)" = "200" ]; }

listener_pids() { # port
  if is_windows; then
    netstat -ano 2>/dev/null | grep -E "[:.]$1[[:space:]].*LISTENING" | awk '{print $NF}' | sort -u
  elif command -v lsof > /dev/null 2>&1; then
    lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null | sort -u
  fi
}

port_busy() { # port — any listener, or anything answering on the port
  if [ -n "$(listener_pids "$1")" ]; then return 0; fi
  curl -s -o /dev/null "http://localhost:$1/" 2>/dev/null
}

stop_port() { # port
  for pid in $(listener_pids "$1"); do
    if is_windows; then
      taskkill //PID "$pid" //T //F > /dev/null 2>&1 || true
    else
      kill "$pid" 2>/dev/null || true
    fi
  done
  tries=0
  while port_busy "$1"; do
    tries=$((tries + 1))
    [ "$tries" -gt 15 ] && return 1
    sleep 1
  done
  return 0
}

STARTED_PORTS=""
BG_PIDS=""
cleanup() {
  for pid in $BG_PIDS; do kill "$pid" 2>/dev/null || true; done
  for port in $STARTED_PORTS; do stop_port "$port" > /dev/null 2>&1 || true; done
  STARTED_PORTS=""
  BG_PIDS=""
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT TERM

start_server() { # port health-url logfile command...
  port="$1"; url="$2"; log="$3"; shift 3
  "$@" > "$OUT_DIR/$log" 2>&1 &
  BG_PIDS="$BG_PIDS $!"
  STARTED_PORTS="$STARTED_PORTS $port"
  tries=0
  until http_up "$url"; do
    tries=$((tries + 1))
    if [ "$tries" -gt 60 ]; then
      echo "Server on $port did not answer 200 on $url within 60 s (see $OUT_DIR/$log)." >&2
      return 1
    fi
    sleep 1
  done
  echo "Started on $port ($url)."
}

# ---------------------------------------------------------------- servers (always fresh)
echo
echo "== Servers =="
for port in $DEV_PORT $E2E_PORT $PREVIEW_PORT; do
  if port_busy "$port"; then
    echo "Port $port is in use; stopping it so this run uses a fresh server."
    stop_port "$port" || fail "port $port is still in use after trying to stop it; free it and re-run"
  fi
done
echo "-- dev server on $DEV_PORT"
start_server "$DEV_PORT" "$DEV_URL" 00-dev-server.txt npx vite --port "$DEV_PORT" --strictPort
echo "-- e2e-mode dev server on $E2E_PORT (?melody= enabled)"
start_server "$E2E_PORT" "$E2E_URL" 00-e2e-server.txt npx vite --mode e2e --port "$E2E_PORT" --strictPort
echo "-- production preview on $PREVIEW_PORT"
echo "   npm run build (output: $OUT_DIR/00-build.txt)"
if NO_COLOR=1 npm run build > "$OUT_DIR/00-build.txt" 2>&1; then
  start_server "$PREVIEW_PORT" "$PREVIEW_URL" 00-preview-server.txt npx vite preview --port "$PREVIEW_PORT" --strictPort
else
  echo "WARNING: npm run build failed; the preview is not started (item 49 will fail)." >&2
fi

# ---------------------------------------------------------------- browser checks
echo
echo "== Browser checks (items 1–49, 51, 52–56) =="
node "$SCRIPT_DIR/validate.mjs" --browser
echo "validate.mjs --browser exit code: $?"

# ---------------------------------------------------------------- stop the servers
echo
echo "== Stopping the servers started by this script =="
NOTE=""
for port in $STARTED_PORTS; do
  if stop_port "$port"; then echo "Port $port is free."; else echo "WARNING: port $port is still in use." >&2; NOTE="$NOTE port $port could not be stopped;"; fi
done
for pid in $BG_PIDS; do kill "$pid" 2>/dev/null || true; done
STARTED_PORTS=""
BG_PIDS=""
if port_busy "$DEV_PORT"; then
  PORT_FREE=false
  NOTE="$NOTE a server on $DEV_PORT is still running (test:e2e reuses it; it must be in e2e mode);"
else
  PORT_FREE=true
fi

# Playwright's webServer may leave its dev server behind on Windows; free 5173 before / after each e2e run.
free_dev_port() {
  if [ "$PORT_FREE" = "true" ] && port_busy "$DEV_PORT"; then stop_port "$DEV_PORT" > /dev/null 2>&1 || true; fi
}

# ---------------------------------------------------------------- regression (item 50)
echo
echo "== Regression (item 50) =="
run_cmd() { # name outfile command...
  name="$1"; out="$2"; shift 2
  echo "-- $*"
  NO_COLOR=1 FORCE_COLOR=0 "$@" > "$OUT_DIR/$out" 2>&1
  code=$?
  echo "   exit $code (output: $OUT_DIR/$out)"
  eval "CODE_$name=$code"
}
run_cmd lint 50-lint.txt npm run lint
run_cmd typecheck 50-typecheck.txt npm run typecheck
run_cmd test 50-unit-tests.txt npm test
run_cmd scripts 50-script-tests.txt npm run test:scripts
run_cmd build 50-build.txt npm run build
run_cmd e2e 50-e2e.txt npm run test:e2e
free_dev_port

# ---------------------------------------------------------------- item 57: two more e2e runs
echo
echo "== Item 57: npm run test:e2e runs 2 and 3 (run 1 = item 50) =="
run_cmd e2eRun2 57-e2e-run-2.txt npm run test:e2e
free_dev_port
run_cmd e2eRun3 57-e2e-run-3.txt npm run test:e2e
free_dev_port

NOTE="$(echo "$NOTE" | sed 's/"/'"'"'/g; s/^ *//; s/;$//')"
printf '{"lint":%s,"typecheck":%s,"test":%s,"scripts":%s,"build":%s,"e2e":%s,"e2eRun2":%s,"e2eRun3":%s,"port5173FreeBeforeE2e":%s,"note":"%s"}\n' \
  "$CODE_lint" "$CODE_typecheck" "$CODE_test" "$CODE_scripts" "$CODE_build" "$CODE_e2e" "$CODE_e2eRun2" "$CODE_e2eRun3" "$PORT_FREE" "$NOTE" > "$OUT_DIR/regression-status.json"

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
for port in $DEV_PORT $E2E_PORT $PREVIEW_PORT; do
  if port_busy "$port"; then echo "WARNING: port $port is still in use after the run." >&2; fi
done
echo "validate.mjs exit code: $code"
exit "$code"
