#!/usr/bin/env bash
# Runs the automated validation of specs/pitch-feedback-graph/validation.md (Run 1).
# Prerequisite: the servers of specs/pitch-feedback-graph/create-environment.sh are running
# (5173 dev, 5174 dev e2e mode, 4173 production preview).
# Optional: ONLY=15,22 bash run.sh runs only those steps (the others are reported as skipped).
set -eu

cd "$(dirname "$0")/../../.."

ASSETS="specs/pitch-feedback-graph/validation-assets"
REPORT="$ASSETS/validation-report-run-1.md"

check_url() {
  if ! curl -sf -o /dev/null "$1"; then
    echo "ERROR: $1 is not responding. Start the environment first:" >&2
    echo "  bash specs/pitch-feedback-graph/create-environment.sh" >&2
    exit 2
  fi
  echo "OK  $1"
}

echo "==> Checking servers"
check_url "http://localhost:5173/"
check_url "http://localhost:5174/"
check_url "http://localhost:4173/trumpet-trainer/"

echo "==> Checking Playwright Chromium"
if ! node -e "import('@playwright/test').then(({ chromium }) => { const fs = require('node:fs'); const p = chromium.executablePath(); if (!fs.existsSync(p)) { console.error('missing ' + p); process.exit(1); } console.log('OK  ' + p); })"; then
  echo "ERROR: Chromium for Playwright is not installed. Run: npx playwright install chromium" >&2
  exit 2
fi

mkdir -p "$ASSETS/run-1/screenshots" "$ASSETS/run-1/output"

echo "==> Running validation"
status=0
node specs/pitch-feedback-graph/validation-run-1/validate.mjs || status=$?

echo ""
if [ -f "$REPORT" ]; then
  grep -m1 '^\*\*Summary:\*\*' "$REPORT" || true
  echo "Report: $REPORT"
fi
exit "$status"
