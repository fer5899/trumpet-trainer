#!/usr/bin/env bash
# Trumpet Trainer — validation Run 1 wrapper.
# Usage (from anywhere, Git Bash on Windows or bash on Linux/macOS):
#   bash specs/create-mvp/validation-run-1/run.sh
# Starts nothing itself: validate.mjs runs the command checks first (ports must be free), then
# launches specs/create-mvp/create-environment.sh, runs the browser checks and tears it down.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ASSETS_DIR="$REPO_ROOT/specs/create-mvp/validation-assets"
REPORT="$ASSETS_DIR/validation-report-run-1.md"
cd "$REPO_ROOT"

fail() { echo "PRE-FLIGHT FAILED: $*" >&2; exit 2; }

echo "== Pre-flight =="
for cmd in node npm npx curl; do
  command -v "$cmd" > /dev/null 2>&1 || fail "'$cmd' is not on PATH"
done
echo "node $(node --version), npm $(npm --version)"

[ -d node_modules/@playwright/test ] || fail "node_modules missing — run 'npm ci' first"

port_busy() {
  local port="$1"
  if command -v netstat > /dev/null 2>&1 && [ "${OS:-}" = "Windows_NT" ]; then
    netstat -ano | grep -E "^\s*TCP\s+\S+:${port}\s+\S+\s+LISTENING" > /dev/null 2>&1
  elif command -v lsof > /dev/null 2>&1; then
    lsof -ti "tcp:${port}" -sTCP:LISTEN > /dev/null 2>&1
  else
    curl -s -o /dev/null "http://localhost:${port}/" 2>/dev/null
  fi
}
for port in 5173 5174 4173; do
  if port_busy "$port"; then
    fail "port $port is in use. Stop the process using it (e.g. a running dev server or create-environment.sh) and re-run."
  fi
done
echo "Ports 5173/5174/4173 are free."

node -e "require('@playwright/test').chromium.launch().then(b => b.close()).then(() => process.exit(0), e => { console.error(e.message); process.exit(1); })" \
  || fail "Playwright Chromium is not installed or cannot launch — run 'npx playwright install chromium'"
echo "Playwright Chromium launches."

# Bash used by validate.mjs to run create-environment.sh (Windows path under Git Bash).
if command -v cygpath > /dev/null 2>&1; then
  VALIDATE_BASH="$(cygpath -w "$(command -v bash)")"
else
  VALIDATE_BASH="$(command -v bash)"
fi
export VALIDATE_BASH

mkdir -p "$ASSETS_DIR/run-1/screenshots" "$ASSETS_DIR/run-1/output"

echo
echo "== Running validate.mjs =="
node "$SCRIPT_DIR/validate.mjs"
code=$?

echo
echo "== Result =="
if [ -f "$REPORT" ]; then
  summary="$(grep -m1 -E '^\*\*Summary:\*\*' "$REPORT" || true)"
  passed="$(echo "$summary" | sed -nE 's/.* ([0-9]+) passed.*/\1/p')"
  failed="$(echo "$summary" | sed -nE 's/.* ([0-9]+) failed.*/\1/p')"
  skipped="$(echo "$summary" | sed -nE 's/.* ([0-9]+) skipped.*/\1/p')"
  echo "PASS: ${passed:-?}  FAIL: ${failed:-?}  SKIP: ${skipped:-?}"
  echo "Report: $REPORT"
else
  echo "No report was written ($REPORT missing)."
fi
echo "validate.mjs exit code: $code"
exit "$code"
