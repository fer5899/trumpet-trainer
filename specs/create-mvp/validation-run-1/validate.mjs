#!/usr/bin/env node
/* global window, document, getComputedStyle, HTMLInputElement -- browser globals used inside page.evaluate callbacks */
// Trumpet Trainer — automated validation, Run 1.
// Automates specs/create-mvp/validation.md (Part 1: prd.md steps 1–13, Part 2: prd2.md steps 1–19).
//
// Flow:
//   Phase A (ports 5173/5174/4173 must be free): npm test, lint, typecheck, test:e2e,
//            vitest subsets, file-based checks (tsconfig, WAV fixture, ci.yml, git remote).
//   Phase B: spawns specs/create-mvp/create-environment.sh (npm ci + tones + build, then dev 5173,
//            e2e-mode dev 5174, preview 4173), waits for health, imports Playwright *after* the
//            environment's `npm ci` has finished, runs the browser checks.
//   Always:  closes browsers, kills the environment process tree and any listener left on the
//            three ports, writes the Markdown report.
// Exit code: 0 if no FAIL, else 1.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------- paths ---------------------------
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..');
const FEATURE_DIR = path.resolve(ROOT, 'specs', 'create-mvp');
const ASSETS_DIR = path.resolve(FEATURE_DIR, 'validation-assets');
const RUN_DIR = path.resolve(ASSETS_DIR, 'run-1');
const SHOTS_DIR = path.resolve(RUN_DIR, 'screenshots');
const OUT_DIR = path.resolve(RUN_DIR, 'output');
const REPORT_PATH = path.resolve(ASSETS_DIR, 'validation-report-run-1.md');
const WAV_PATH = path.resolve(ROOT, 'e2e', 'fixtures', 'tone-a4-440hz.wav');
const ENV_SCRIPT = 'specs/create-mvp/create-environment.sh';
const IS_WIN = process.platform === 'win32';
const BASH = process.env.VALIDATE_BASH || 'bash';
// Debug switches (not used by run.sh): skip the command phase / reuse servers already running.
const SKIP_COMMANDS = process.env.VALIDATE_SKIP_COMMANDS === '1';
const USE_RUNNING_ENV = process.env.VALIDATE_USE_RUNNING_ENV === '1';

const DEV = 'http://localhost:5173';
const E2E = 'http://localhost:5174';
const PREVIEW = 'http://localhost:4173/trumpet-trainer/';
const PORTS = [5173, 5174, 4173];

// Expected values (from validation.md, src/config/constants.ts, src/components/*).
const MINUS = '−';
const PERMISSION_MESSAGE =
  "Microphone access is blocked. Allow the microphone for this site (usually via the icon in the address bar or your browser's site settings), then press Start training again.";
const CONCERT_A4 = 440;

for (const dir of [SHOTS_DIR, OUT_DIR]) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------- results registry ---------------
const SECTIONS = [
  ['Part 1 (prd.md)', 'Scaffold and tooling', [
    ['P1-1', 'Unit tests (`npm test`)'],
    ['P1-2', 'Lint and typecheck'],
    ['P1-3', 'E2E (`npm run test:e2e`)'],
    ['P1-4', 'tsconfig strict'],
  ]],
  ['Part 1 (prd.md)', 'App shell and dependency injection', [
    ['P1-5', 'Dev server renders the app shell'],
    ['P1-6', 'Production preview under /trumpet-trainer/'],
  ]],
  ['Part 1 (prd.md)', 'Constants', [['P1-7', 'Constants match the PRD table']]],
  ['Part 1 (prd.md)', 'Music domain', [['P1-8', 'Music tests incl. 7 spelling worked examples']]],
  ['Part 1 (prd.md)', 'Audio domain', [
    ['P1-9', 'Audio + training tests'],
    ['P1-10', 'Fake-mic fixture WAV'],
    ['P1-11', 'Synth playback in a real browser'],
    ['P1-12', 'Microphone frames + pitch detection in a real browser'],
    ['P1-13', 'Denied microphone maps to permission-denied'],
  ]],
  ['Part 2 (prd2.md)', 'Automated checks', [
    ['P2-1', 'npm test / lint / typecheck'],
    ['P2-2', 'Playwright e2e specs'],
  ]],
  ['Part 2 (prd2.md)', 'Home screen', [
    ['P2-3', 'Home screen initial state'],
    ['P2-4', 'Test microphone toggle and level meter'],
    ['P2-5', 'Threshold slider'],
  ]],
  ['Part 2 (prd2.md)', 'Microphone errors', [
    ['P2-6', 'Blocked microphone shows inline alert'],
    ['P2-7', 'Allowed microphone starts training'],
  ]],
  ['Part 2 (prd2.md)', 'Training flow', [
    ['P2-8', 'Start training: playing → guard → listening'],
    ['P2-9', 'Speaker playback never turns a box green'],
    ['P2-10', 'Correct note turns box green and advances'],
    ['P2-11', 'Wrong note / octave off changes nothing'],
    ['P2-12', 'Repeat melody'],
    ['P2-13', 'Give up'],
    ['P2-14', 'Complete all 5 notes'],
  ]],
  ['Part 2 (prd2.md)', 'Threshold gating', [['P2-15', 'Threshold 0 dB blocks detection']]],
  ['Part 2 (prd2.md)', 'Deterministic mode', [
    ['P2-16', '?melody=71,71,71,71,71 on the e2e-mode server'],
    ['P2-17', '?melody ignored on dev and production preview'],
  ]],
  ['Part 2 (prd2.md)', 'CI/CD', [
    ['P2-18', 'ci.yml review'],
    ['P2-19', 'GitHub Pages deployment'],
  ]],
];

const results = new Map(); // id → { status, detail, images, outputs }
const record = (id, status, detail, { images = [], outputs = [] } = {}) => {
  results.set(id, { status, detail, images, outputs });
  const icon = status === 'PASS' ? 'PASS' : status === 'FAIL' ? 'FAIL' : 'SKIP';
  console.log(`[${icon}] ${id} — ${detail.split('\n')[0].slice(0, 220)}`);
};
const titleOf = (id) => {
  for (const [, , items] of SECTIONS) for (const [i, t] of items) if (i === id) return t;
  return id;
};

// ---------------------------------------------------------------- helpers -------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripAnsi = (s) => s.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, 'g'), '');
const rel = (abs) => path.relative(ASSETS_DIR, abs).split(path.sep).join('/');

function writeOut(name, content) {
  const file = path.resolve(OUT_DIR, name);
  fs.writeFileSync(file, content, 'utf8');
  return rel(file);
}

let shotCounter = 0;
async function shot(page, name) {
  shotCounter += 1;
  const file = path.resolve(SHOTS_DIR, `${String(shotCounter).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return rel(file);
}

/** Runs a command (through the shell, so npm/npx resolve on Windows) and captures its output. */
function runCmd(outName, command, { timeoutMs = 300_000 } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const chunks = [];
    const child = spawn(command, {
      cwd: ROOT,
      shell: true,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      windowsHide: true,
    });
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => chunks.push(d));
    const timer = setTimeout(() => {
      chunks.push(Buffer.from(`\n[validate.mjs] TIMEOUT after ${timeoutMs} ms — killing\n`));
      killTree(child.pid);
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      const text = stripAnsi(Buffer.concat(chunks).toString('utf8'));
      const ms = Date.now() - started;
      const link = writeOut(outName, `$ ${command}\n\n${text}\n\n[exit code: ${code}] [duration: ${ms} ms]\n`);
      resolve({ code, text, link, ms });
    });
  });
}

function killTree(pid) {
  if (!pid) return;
  try {
    if (IS_WIN) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
    else {
      try { process.kill(-pid, 'SIGTERM'); } catch { /* not a group leader */ }
      try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ }
    }
  } catch { /* ignore */ }
}

/** PIDs listening on a TCP port. */
function listenersOn(port) {
  const pids = new Set();
  if (IS_WIN) {
    const r = spawnSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true });
    for (const line of (r.stdout || '').split(/\r?\n/)) {
      const m = line.match(/^\s*TCP\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)\s*$/i);
      if (!m) continue;
      const [, local, foreign, state, pid] = m;
      if (!local.endsWith(`:${port}`)) continue;
      if (/LISTEN/i.test(state) || /:0$/.test(foreign)) if (pid !== '0') pids.add(pid);
    }
  } else {
    const r = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
    for (const p of (r.stdout || '').split(/\s+/)) if (p) pids.add(p);
  }
  return [...pids];
}

async function freePorts(label) {
  const notes = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let busy = false;
    for (const port of PORTS) {
      const pids = listenersOn(port);
      if (pids.length) {
        busy = true;
        notes.push(`${label}: port ${port} still had listener(s) ${pids.join(', ')} — killing`);
        for (const pid of pids) killTree(Number(pid));
      }
    }
    if (!busy) break;
    await sleep(1000);
  }
  const left = PORTS.filter((p) => listenersOn(p).length);
  return { notes, left };
}

async function isUp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

function countLine(text, re) {
  const m = text.match(re);
  return m ? Number(m[1]) : null;
}

/** Parses vitest's "Test Files … / Tests …" summary lines. */
function vitestCounts(text) {
  const filesLine = text.split(/\r?\n/).find((l) => /^\s*Test Files\s/.test(l)) || '';
  const testsLine = text.split(/\r?\n/).find((l) => /^\s*Tests\s/.test(l)) || '';
  return {
    files: countLine(filesLine, /\((\d+)\)/),
    filesFailed: countLine(filesLine, /(\d+) failed/) ?? 0,
    tests: countLine(testsLine, /\((\d+)\)/),
    testsPassed: countLine(testsLine, /(\d+) passed/),
    testsFailed: countLine(testsLine, /(\d+) failed/) ?? 0,
  };
}

/** Lines of real tool output (drops npm's "> script" banner and blank lines). */
function toolLines(text) {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/^\s*>/.test(l) && !/^\$ /.test(l) && !/^\[exit code/.test(l));
}

const approx = (a, b, tol) => Math.abs(a - b) <= tol;
const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);
const writtenHz = (w) => midiToHz(w - 2);

// ---------------------------------------------------------------- browser instrumentation --------
// Injected into every page before any app script runs.
const INSTRUMENT = `(() => {
  window.__streams = []; window.__gumCalls = 0; window.__osc = [];
  window.__statusLog = []; window.__doneLog = []; window.__clicks = [];
  window.__lastStatus = undefined;
  if (window.__denyMic === undefined) window.__denyMic = false;
  const md = navigator.mediaDevices;
  if (md && md.getUserMedia) {
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = async (constraints) => {
      if (window.__denyMic) throw new DOMException('Permission denied', 'NotAllowedError');
      window.__gumCalls += 1;
      const s = await orig(constraints);
      window.__streams.push(s);
      return s;
    };
  }
  const start = OscillatorNode.prototype.start;
  OscillatorNode.prototype.start = function (...args) {
    window.__osc.push({ hz: this.frequency.value, t: performance.now() });
    return start.apply(this, args);
  };
  const mo = new MutationObserver((muts) => {
    const now = performance.now();
    for (const m of muts) {
      if (m.type === 'attributes' && m.attributeName === 'data-state') {
        const el = m.target;
        if (el.getAttribute('data-state') === 'done' && m.oldValue !== 'done') {
          window.__doneLog.push({ id: el.getAttribute('data-testid'), t: now, text: el.textContent });
        }
      }
    }
    const st = document.querySelector('[data-testid="training-status"]');
    const txt = st ? st.textContent : null;
    if (txt !== window.__lastStatus) { window.__lastStatus = txt; window.__statusLog.push({ text: txt, t: now }); }
  });
  mo.observe(document, { subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['data-state'], attributeOldValue: true });
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (b) window.__clicks.push({ label: b.textContent, t: performance.now() });
  }, true);
})();`;

const FAKE_MIC_ARGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  `--use-file-for-fake-audio-capture=${WAV_PATH}`,
  '--autoplay-policy=no-user-gesture-required',
];

let chromium = null;
let browser = null;
const extraBrowsers = [];

async function newPage({ deny = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  if (deny) await ctx.addInitScript('window.__denyMic = true;');
  await ctx.addInitScript(INSTRUMENT);
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`console.error: ${m.text()}`); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  return { ctx, page, consoleErrors };
}

/** Runs one browser check in a fresh context; on exception records FAIL with an error screenshot. */
async function browserCheck(id, fn, pageOpts = {}) {
  let handle = null;
  const images = [];
  try {
    if (!browser) throw new Error('browser not available (environment did not start)');
    handle = await newPage(pageOpts);
    await fn({ ...handle, images });
  } catch (err) {
    if (handle?.page) {
      try { images.push(await shot(handle.page, `${id.toLowerCase()}-error`)); } catch { /* ignore */ }
    }
    record(id, 'FAIL', `Exception: ${String(err?.message || err).split('\n').slice(0, 4).join(' ')}`, { images });
  } finally {
    if (handle?.ctx) await handle.ctx.close().catch(() => undefined);
  }
}

const startBtn = (page) => page.getByRole('button', { name: 'Start training' });
const testMicBtn = (page) => page.getByRole('button', { name: 'Test microphone' });
const repeatBtn = (page) => page.getByRole('button', { name: 'Repeat melody' });
const giveUpBtn = (page) => page.getByRole('button', { name: 'Give up' });
const meter = (page) => page.getByRole('meter', { name: 'Microphone level' });
const slider = (page) => page.getByRole('slider', { name: 'Threshold' });
const thresholdLabel = (page) => page.locator('.mic-meter__threshold-label');
const statusText = (page) =>
  page.evaluate(() => document.querySelector('[data-testid="training-status"]')?.textContent ?? null);

async function waitStatus(page, pattern, timeout = 15_000) {
  await page.waitForFunction(
    (src) => {
      const el = document.querySelector('[data-testid="training-status"]');
      return !!el && new RegExp(src).test(el.textContent || '');
    },
    pattern,
    { timeout, polling: 25 },
  );
}

const boxStates = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="note-box-"]')].map((el) => ({
      id: el.getAttribute('data-testid'),
      state: el.getAttribute('data-state'),
      text: el.textContent,
    })),
  );

const trackStates = (page) =>
  page.evaluate(() => window.__streams.flatMap((s) => s.getTracks().map((t) => t.readyState)));

const logs = (page) =>
  page.evaluate(() => ({
    statusLog: window.__statusLog,
    doneLog: window.__doneLog,
    clicks: window.__clicks,
    osc: window.__osc,
    gumCalls: window.__gumCalls,
  }));

async function setSlider(page, value) {
  await slider(page).evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function waitTracksEnded(page, timeout = 3000) {
  const until = Date.now() + timeout;
  let states = [];
  while (Date.now() < until) {
    states = await trackStates(page);
    if (states.length && states.every((s) => s === 'ended')) return states;
    await sleep(100);
  }
  return states;
}

const fmtStatusLog = (log, t0 = 0) =>
  log.map((e) => `${Math.round(e.t - t0)}ms:${e.text === null ? '(no training screen)' : JSON.stringify(e.text)}`).join(' → ');

// ---------------------------------------------------------------- environment --------------------
let envProc = null;
let envLogStream = null;
let envExited = false;
let cleanedUp = false;

async function startEnvironment() {
  const logFile = path.resolve(OUT_DIR, 'create-environment.txt');
  envLogStream = fs.createWriteStream(logFile, { encoding: 'utf8' });
  envOutputLink = rel(logFile);
  envLogStream.write(`$ ${BASH} ${ENV_SCRIPT}\n\n`);
  envProc = spawn(BASH, [ENV_SCRIPT], {
    cwd: ROOT,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !IS_WIN,
    windowsHide: true,
  });
  envProc.stdout.on('data', (d) => envLogStream.write(stripAnsi(d.toString('utf8'))));
  envProc.stderr.on('data', (d) => envLogStream.write(stripAnsi(d.toString('utf8'))));
  envProc.on('exit', (code) => {
    envExited = true;
    envLogStream?.write(`\n[create-environment.sh exited with code ${code}]\n`);
  });

  const urls = [`${DEV}/`, `${E2E}/`, PREVIEW];
  const deadline = Date.now() + 8 * 60_000;
  while (Date.now() < deadline) {
    if (envExited) throw new Error('create-environment.sh exited before all servers were healthy (see output/create-environment.txt)');
    const ups = await Promise.all(urls.map(isUp));
    if (ups.every(Boolean)) return rel(logFile);
    await sleep(2000);
  }
  throw new Error('Timed out waiting for 5173 / 5174 / 4173 to become healthy');
}

async function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  for (const b of [browser, ...extraBrowsers]) if (b) await b.close().catch(() => undefined);
  if (envProc && !envExited) killTree(envProc.pid);
  await sleep(1000);
  const { notes, left } = USE_RUNNING_ENV ? { notes: [], left: [] } : await freePorts('cleanup');
  for (const n of notes) console.log(n);
  if (left.length) console.log(`WARNING: ports still busy after cleanup: ${left.join(', ')}`);
  else console.log('Cleanup: ports 5173/5174/4173 are free.');
  if (envLogStream) {
    envLogStream.write(`\n[validate.mjs cleanup] ${notes.join('; ') || 'no stray listeners'}; ports busy after cleanup: ${left.join(', ') || 'none'}\n`);
    await new Promise((r) => envLogStream.end(r));
  }
}

process.on('SIGINT', async () => {
  console.log('\nSIGINT — cleaning up...');
  await cleanup();
  writeReport();
  process.exit(130);
});

// ---------------------------------------------------------------- Phase A: commands ---------------
async function phaseA() {
  console.log('== Phase A: command checks (ports free) ==');

  const test = await runCmd('01-npm-test.txt', 'npm test', { timeoutMs: 600_000 });
  const lint = await runCmd('02-lint.txt', 'npm run lint');
  const tc = await runCmd('03-typecheck.txt', 'npm run typecheck');
  const e2e = await runCmd('04-test-e2e.txt', 'npm run test:e2e', { timeoutMs: 600_000 });
  const music = await runCmd('05-vitest-music.txt', 'npx vitest run src/music --reporter=verbose');
  const audio = await runCmd('06-vitest-audio-training.txt', 'npx vitest run src/audio src/training --reporter=verbose');

  // P1-1 / P2-1 — npm test
  const vc = vitestCounts(test.text);
  const testOk = test.code === 0 && vc.testsFailed === 0 && vc.filesFailed === 0 && vc.tests !== null;
  const countsStr = `${vc.files} test files / ${vc.tests} tests (${vc.testsPassed} passed, ${vc.testsFailed} failed), exit ${test.code}`;
  record('P1-1', testOk ? 'PASS' : 'FAIL',
    `${countsStr}. Part 1's expected 13 files / 196 tests are superseded by Part 2's 20 files / 302 tests (Part 2 added tests).`,
    { outputs: [test.link] });

  // P1-2 — lint + typecheck
  const lintProblems = toolLines(lint.text).filter((l) => /error|warning|problem/i.test(l));
  const tcLines = toolLines(tc.text).filter((l) => !/^npm (warn|notice)/i.test(l));
  const lintOk = lint.code === 0 && lintProblems.length === 0;
  const tcOk = tc.code === 0 && tcLines.length === 0;
  const lintDetail = `lint exit ${lint.code}${lintProblems.length ? ` (${lintProblems.length} problem lines)` : ', no problems printed'}; typecheck exit ${tc.code}${tcLines.length ? ` (${tcLines.length} output lines)` : ', no output'}`;
  record('P1-2', lintOk && tcOk ? 'PASS' : 'FAIL', lintDetail, { outputs: [lint.link, tc.link] });

  // P1-3 / P2-2 — e2e
  const pwPassed = countLine(e2e.text, /(\d+) passed/);
  const pwFailed = countLine(e2e.text, /(\d+) failed/) ?? 0;
  const pwFlaky = countLine(e2e.text, /(\d+) flaky/) ?? 0;
  const fixtureLine = /tone-a4-440hz\.wav|generate-test-tones/.test(e2e.text) ? 'tone fixture regenerated' : 'tone fixture step not seen in output';
  record('P1-3', e2e.code === 0 ? 'PASS' : 'FAIL',
    `exit ${e2e.code}; ${fixtureLine}; Playwright: ${pwPassed ?? 0} passed, ${pwFailed} failed, ${pwFlaky} flaky. (Part 1 expected "no specs yet"; Part 2 now ships 3 specs.)`,
    { outputs: [e2e.link] });
  record('P2-2', e2e.code === 0 && pwPassed === 3 && pwFailed === 0 ? 'PASS' : 'FAIL',
    `Expected 3 passed (mic meter, matching melody, non-matching melody); got ${pwPassed ?? 0} passed, ${pwFailed} failed, exit ${e2e.code}.`,
    { outputs: [e2e.link] });

  // P2-1 — reuse
  const countsMatch = vc.files === 20 && vc.tests === 302;
  record('P2-1', testOk && lintOk && tcOk ? 'PASS' : 'FAIL',
    `npm test: ${countsStr}${countsMatch ? ' — matches expected 20 / 302' : ' — NOTE: differs from expected 20 files / 302 tests'}; ${lintDetail}.`,
    { outputs: [test.link, lint.link, tc.link] });

  // P1-8 — music
  {
    const mc = vitestCounts(music.text);
    const lines = music.text.split(/\r?\n/);
    const worked = lines.filter((l) => /PRD worked examples\s*>/.test(l) && /→|->|\]\s*\S+\s*\[/.test(l));
    const workedFailed = worked.filter((l) => /^\s*(×|x|✗|FAIL)/.test(l.trim()) || /\bfailed\b/i.test(l));
    const exact = music.text.includes('["Fa#3","Do#4","Do#4","Si♭3","Do5"]');
    const loose = /\["Fa#3","Do#4","Do#4","Si.{1,3}3","Do5"\]/.test(music.text);
    const suites = ['notes.test.ts', 'spelling.test.ts', 'melody.test.ts'].filter((f) => music.text.includes(f));
    const ok = music.code === 0 && mc.testsFailed === 0 && worked.length === 7 && workedFailed.length === 0 && (exact || loose) && suites.length === 3;
    record('P1-8', ok ? 'PASS' : 'FAIL',
      `exit ${music.code}; ${mc.files} files / ${mc.tests} tests, ${mc.testsFailed} failed; suites seen: ${suites.join(', ')}; worked-example rows: ${worked.length}/7; row [54,61,61,58,72] → Fa#3, Do#4, Do#4, Si♭3, Do5 ${exact ? 'found (exact)' : loose ? 'found (♭ glyph mangled by console encoding)' : 'NOT found'}.`,
      { outputs: [music.link] });
  }

  // P1-9 — audio + training
  {
    const ac = vitestCounts(audio.text);
    const expected = ['level', 'pitchDetector', 'sustainTracker', 'audioContext', 'synth', 'microphone', 'services', 'AudioServicesContext'];
    const missing = expected.filter((n) => !new RegExp(`[\\\\/]${n}\\.test\\.tsx?`).test(audio.text));
    const pitchLines = audio.text.split(/\r?\n/).filter((l) => /detectPitch/.test(l));
    const pitchChecks = {
      E3: pitchLines.some((l) => /concert E3/.test(l)),
      A4: pitchLines.some((l) => /concert A4/.test(l)),
      'B♭4': pitchLines.some((l) => /concert B.{1,3}4/.test(l)),
      sine: pitchLines.some((l) => /detects a sine/.test(l)),
      sawtooth: pitchLines.some((l) => /detects a sawtooth/.test(l)),
      silence: pitchLines.some((l) => /null for silence/.test(l)),
      noise: pitchLines.some((l) => /null for seeded white noise/.test(l)),
      '100 Hz': pitchLines.some((l) => /100 Hz tone/.test(l)),
      '800 Hz': pitchLines.some((l) => /800 Hz tone/.test(l)),
    };
    const missingPitch = Object.entries(pitchChecks).filter(([, v]) => !v).map(([k]) => k);
    const ok = audio.code === 0 && ac.testsFailed === 0 && missing.length === 0 && missingPitch.length === 0;
    record('P1-9', ok ? 'PASS' : 'FAIL',
      `exit ${audio.code}; ${ac.files} files / ${ac.tests} tests, ${ac.testsFailed} failed; suites missing: ${missing.join(', ') || 'none'}; pitch cases (E3/A4/B♭4 sine+sawtooth, null for silence/noise/100 Hz/800 Hz) missing: ${missingPitch.join(', ') || 'none'}.`,
      { outputs: [audio.link] });
  }

  // P1-4 — tsconfig strict
  try {
    const raw = fs.readFileSync(path.resolve(ROOT, 'tsconfig.json'), 'utf8');
    const noComments = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"])\/\/.*$/gm, '$1').replace(/,(\s*[}\]])/g, '$1');
    let strict;
    try { strict = JSON.parse(noComments)?.compilerOptions?.strict; } catch { strict = /"strict"\s*:\s*true/.test(raw) ? true : undefined; }
    record('P1-4', strict === true ? 'PASS' : 'FAIL', `tsconfig.json compilerOptions.strict = ${strict}`);
  } catch (e) {
    record('P1-4', 'FAIL', `Could not read tsconfig.json: ${e.message}`);
  }

  // P1-10 — WAV fixture analysis
  try {
    const buf = fs.readFileSync(WAV_PATH);
    const riff = buf.toString('ascii', 0, 4);
    const wave = buf.toString('ascii', 8, 12);
    const fmt = buf.readUInt16LE(20);
    const channels = buf.readUInt16LE(22);
    const sampleRate = buf.readUInt32LE(24);
    const bits = buf.readUInt16LE(34);
    const dataBytes = buf.readUInt32LE(40);
    const n = dataBytes / 2;
    let crossings = 0;
    let sumSq = 0;
    let prev = buf.readInt16LE(44);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < n; i += 1) {
      const v = buf.readInt16LE(44 + i * 2);
      if (prev < 0 && v >= 0) crossings += 1;
      prev = v;
      sumSq += (v / 32767) ** 2;
      min = Math.min(min, v); max = Math.max(max, v);
    }
    const seconds = n / sampleRate;
    const hz = crossings / seconds;
    const rmsDb = 10 * Math.log10(sumSq / n);
    // Steadiness: zero-crossing rate per 0.5 s window.
    const win = Math.floor(sampleRate / 2);
    const perWin = [];
    for (let w = 0; w + win <= n; w += win) {
      let c = 0; let p = buf.readInt16LE(44 + w * 2);
      for (let i = w + 1; i < w + win; i += 1) { const v = buf.readInt16LE(44 + i * 2); if (p < 0 && v >= 0) c += 1; p = v; }
      perWin.push(c * 2);
    }
    const steady = perWin.every((h) => approx(h, CONCERT_A4, 4));
    const ok = riff === 'RIFF' && wave === 'WAVE' && fmt === 1 && channels === 1 && sampleRate === 48000 && bits === 16 &&
      buf.length === 384044 && approx(seconds, 4, 0.01) && approx(hz, CONCERT_A4, 2) && steady;
    const analysis = [
      `file: ${WAV_PATH}`,
      `size: ${buf.length} bytes (expected 384044 = 44 + 4 s × 48000 × 2)`,
      `header: ${riff}/${wave}, format ${fmt} (PCM), ${channels} channel(s), ${sampleRate} Hz, ${bits}-bit, data ${dataBytes} bytes`,
      `duration: ${seconds.toFixed(3)} s`,
      `estimated frequency (positive zero crossings / s): ${hz.toFixed(2)} Hz`,
      `per-0.5 s window estimates: ${perWin.join(', ')} Hz`,
      `peak: ${min}..${max}, RMS: ${rmsDb.toFixed(2)} dBFS`,
    ].join('\n');
    const link = writeOut('07-wav-analysis.txt', analysis + '\n');
    record('P1-10', ok ? 'PASS' : 'FAIL',
      `${buf.length} bytes (≈${(buf.length / 1024).toFixed(0)} KB), ${sampleRate} Hz / ${channels} ch / ${bits}-bit, ${seconds.toFixed(2)} s, ≈${hz.toFixed(1)} Hz steady across all 0.5 s windows, RMS ${rmsDb.toFixed(1)} dBFS. "Plays a steady tone" verified by signal analysis instead of by ear.`,
      { outputs: [link] });
  } catch (e) {
    record('P1-10', 'FAIL', `WAV analysis failed: ${e.message}`);
  }

  // P2-18 — ci.yml
  try {
    const yml = fs.readFileSync(path.resolve(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    const job = (name) => {
      const m = yml.match(new RegExp(`^  ${name}:\\s*\\n([\\s\\S]*?)(?=^  [A-Za-z0-9_-]+:\\s*$|(?![\\s\\S]))`, 'm'));
      return m ? m[1] : '';
    };
    const onBlock = (yml.match(/^on:\s*\n((?:[ \t]+.*\n?)*)/m) || ['', ''])[1];
    const check = job('check');
    const e2eJob = job('e2e');
    const deploy = job('deploy');
    const checks = {
      'on: push': /^\s+push:/m.test(onBlock),
      'on: pull_request': /^\s+pull_request:/m.test(onBlock),
      'node-version 22 in every setup-node': (yml.match(/node-version:\s*22\b/g) || []).length === (yml.match(/actions\/setup-node@/g) || []).length && /node-version:\s*22\b/.test(yml),
      'check: lint': /npm run lint/.test(check),
      'check: typecheck': /npm run typecheck/.test(check),
      'check: test': /npm (run )?test\b(?!:)/.test(check),
      'check: build': /npm run build/.test(check),
      'e2e: playwright install': /playwright install/.test(e2eJob),
      'e2e: runs test:e2e': /npm run test:e2e/.test(e2eJob),
      'e2e: uploads report': /actions\/upload-artifact@/.test(e2eJob) && /playwright-report/.test(e2eJob),
      'e2e: upload if: failure()': /if:\s*failure\(\)/.test(e2eJob),
      'deploy: needs [check, e2e]': /needs:\s*\[\s*check\s*,\s*e2e\s*\]/.test(deploy),
      'deploy: only on push': /if:.*github\.event_name\s*==\s*'push'/.test(deploy),
      "deploy: branch vars.DEPLOY_BRANCH || 'main'": /if:.*vars\.DEPLOY_BRANCH\s*\|\|\s*'main'/.test(deploy),
      'deploy: upload-pages-artifact path dist': /actions\/upload-pages-artifact@[\s\S]*?path:\s*dist\b/.test(deploy),
      'deploy: deploy-pages': /actions\/deploy-pages@/.test(deploy),
    };
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    const link = writeOut('08-ci-yml-check.txt',
      Object.entries(checks).map(([k, v]) => `${v ? 'OK  ' : 'MISS'} ${k}`).join('\n') +
      `\n\n--- deploy job excerpt ---\n  deploy:\n${deploy}\n\n--- full ci.yml ---\n${yml}`);
    record('P2-18', failed.length === 0 ? 'PASS' : 'FAIL',
      failed.length === 0 ? `All ${Object.keys(checks).length} ci.yml expectations met (triggers, Node 22, check/e2e/deploy jobs, Pages deploy of dist).` : `Missing: ${failed.join('; ')}`,
      { outputs: [link] });
  } catch (e) {
    record('P2-18', 'FAIL', `ci.yml check failed: ${e.message}`);
  }

  // P2-19 — manual
  {
    const remote = spawnSync('git', ['remote', '-v'], { cwd: ROOT, encoding: 'utf8' });
    const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
    const link = writeOut('09-git-remote.txt', `$ git remote -v\n${remote.stdout}${remote.stderr}\n$ git rev-parse --abbrev-ref HEAD\n${branch.stdout}`);
    const origin = (remote.stdout.match(/origin\s+(\S+)\s+\(push\)/) || ['', 'none'])[1];
    record('P2-19', 'SKIP',
      `Manual: needs GitHub repo settings (Pages source "GitHub Actions", main or DEPLOY_BRANCH) and a push. Remote: ${origin}; current branch: ${branch.stdout.trim()}.`,
      { outputs: [link] });
  }
}

// ---------------------------------------------------------------- Phase B: browser ---------------
async function phaseB() {
  console.log('== Phase B: environment + browser checks ==');
  if (USE_RUNNING_ENV) {
    console.log('VALIDATE_USE_RUNNING_ENV=1: using servers that are already running.');
  } else {
    const { notes, left } = await freePorts('before environment');
    for (const n of notes) console.log(n);
    if (left.length) throw new Error(`Ports still busy before starting the environment: ${left.join(', ')}`);
    console.log('Starting create-environment.sh (npm ci + build + 3 servers; may take a few minutes)...');
    await startEnvironment();
  }
  console.log('Environment healthy.');

  ({ chromium } = await import('@playwright/test'));
  browser = await chromium.launch({ args: FAKE_MIC_ARGS });

  // Warm-up: right after the environment's `npm ci`, both dev servers (5173 and e2e-mode 5174)
  // optimize deps into the shared node_modules/.vite on first request, and Run 1 saw 5173 stay
  // blank. Load each dev server until the app renders (max 4 attempts) and record what happened.
  {
    const log = [];
    for (const url of [`${DEV}/`, `${E2E}/`]) {
      for (let attempt = 1; attempt <= 4; attempt++) {
        const page = await browser.newPage();
        const errs = [];
        page.on('pageerror', (e) => errs.push(`pageerror ${e.message}`));
        page.on('response', (r) => { if (r.status() >= 400) errs.push(`${r.status()} ${r.url()}`); });
        await page.goto(url, { waitUntil: 'networkidle' }).catch((e) => errs.push(`goto ${e.message}`));
        const ok = await page.getByRole('heading', { level: 1, name: 'Trumpet Trainer' })
          .waitFor({ timeout: 20_000 }).then(() => true, () => false);
        await page.close();
        log.push(`${url} attempt ${attempt}: ${ok ? 'rendered' : 'NOT rendered'}${errs.length ? ` — ${errs.slice(0, 5).join('; ')}` : ''}`);
        if (ok) break;
        await sleep(2000);
      }
    }
    writeOut('10-dev-warmup.txt', log.join('\n'));
    console.log(log.join('\n'));
  }

  // P1-5 — dev shell
  await browserCheck('P1-5', async ({ page, consoleErrors, images }) => {
    await page.goto(`${DEV}/`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { level: 1, name: 'Trumpet Trainer' }).waitFor({ timeout: 15_000 });
    await sleep(1000);
    const title = await page.title();
    images.push(await shot(page, 'p1-home-dev'));
    const link = writeOut('11-console-dev.txt', consoleErrors.join('\n') || '(no console errors)');
    const ok = title === 'Trumpet Trainer' && consoleErrors.length === 0;
    record('P1-5', ok ? 'PASS' : 'FAIL',
      `title "${title}", heading "Trumpet Trainer" visible, console errors: ${consoleErrors.length}${consoleErrors.length ? ` (${consoleErrors[0]})` : ''}.`,
      { images, outputs: [link] });
  });

  // P1-6 — preview assets
  await browserCheck('P1-6', async ({ page, images }) => {
    const assets = [];
    page.on('response', (res) => {
      const t = res.request().resourceType();
      if (t === 'script' || t === 'stylesheet') {
        assets.push({ url: res.url(), status: res.status(), type: t, contentType: res.headers()['content-type'] || '' });
      }
    });
    await page.goto(PREVIEW, { waitUntil: 'networkidle' });
    const heading = await page
      .getByRole('heading', { level: 1, name: 'Trumpet Trainer' })
      .waitFor({ timeout: 15_000 })
      .then(() => true, () => false);
    images.push(await shot(page, 'p1-home-preview'));
    // A 200 with text/html is Vite's SPA fallback (index.html), not the asset.
    const expectedType = (a) => (a.type === 'script' ? /javascript/ : /css/).test(a.contentType);
    const bad = assets.filter((a) => !new URL(a.url).pathname.startsWith('/trumpet-trainer/assets/') || a.status !== 200 || !expectedType(a));
    const js = assets.filter((a) => a.type === 'script').length;
    const css = assets.filter((a) => a.type === 'stylesheet').length;
    // Diagnostic: is the preview serving the build at "/" instead of "/trumpet-trainer/"?
    const rootProbe = await Promise.all(assets.map(async (a) => {
      const p = new URL(a.url).pathname.replace(/^\/trumpet-trainer\//, '/');
      try {
        const r = await fetch(`http://localhost:4173${p}`);
        return `${r.status} ${r.headers.get('content-type')} http://localhost:4173${p}`;
      } catch (e) { return `error ${e.message} ${p}`; }
    }));
    const link = writeOut('12-preview-assets.txt',
      `Requests made by ${PREVIEW}:\n` +
      (assets.map((a) => `${a.status} ${a.type.padEnd(10)} ${a.contentType.padEnd(28)} ${a.url}`).join('\n') || '(none)') +
      `\n\nDiagnostic — same assets requested without the /trumpet-trainer prefix:\n${rootProbe.join('\n') || '(none)'}\n`);
    record('P1-6', heading && bad.length === 0 && js > 0 ? 'PASS' : 'FAIL',
      `Heading rendered: ${heading}; ${js} JS + ${css} CSS asset(s) requested under /trumpet-trainer/assets/, all 200 with the right content type: ${bad.length === 0 ? 'yes' : `no (${bad.map((b) => `${b.status} ${b.contentType || '-'} ${new URL(b.url).pathname}`).join(', ')})`}.` +
      (bad.length ? ` Root-path probe: ${rootProbe.join('; ')} — if these are 200, \`vite preview\` serves the build at "/" (vite.config.ts sets base "/trumpet-trainer/" only when command === 'build'; preview runs with command 'serve').` : ''),
      { images, outputs: [link] });
  });

  // P1-7 — constants
  await browserCheck('P1-7', async ({ page }) => {
    await page.goto(`${DEV}/`);
    const actual = await page.evaluate(async () => ({ ...(await import('/src/config/constants.ts')) }));
    const prd = fs.readFileSync(path.resolve(FEATURE_DIR, 'prd.md'), 'utf8');
    const section = prd.split(/^### Constants/m)[1]?.split(/^##+ /m)[0] ?? '';
    const rows = [];
    for (const line of section.split(/\r?\n/)) {
      const m = line.match(/^\|\s*(`[^|]+)\|\s*(`[^|]+)\|/);
      if (!m) continue;
      const names = m[1].split('/').map((s) => s.replace(/`/g, '').trim()).filter(Boolean);
      const values = m[2].split('/').map((s) => s.replace(/`/g, '').trim()).filter(Boolean);
      names.forEach((n, i) => rows.push({ name: n, prd: Number(values[i]) }));
    }
    const table = rows.map((r) => ({ ...r, actual: actual[r.name], ok: actual[r.name] === r.prd }));
    const mism = table.filter((r) => !r.ok);
    const named = { WRITTEN_MIN_MIDI: 54, WRITTEN_MAX_MIDI: 72, TRANSPOSITION_SEMITONES: -2, TOLERANCE_CENTS: 25, SUSTAIN_MS: 500, DEFAULT_THRESHOLD_DB: -40, MIC_FFT_SIZE: 2048 };
    const namedBad = Object.entries(named).filter(([k, v]) => actual[k] !== v).map(([k]) => k);
    const extras = Object.keys(actual).filter((k) => !rows.some((r) => r.name === k));
    const md = ['| Constant | PRD | constants.ts | Match |', '|---|---|---|---|',
      ...table.map((r) => `| ${r.name} | ${r.prd} | ${r.actual} | ${r.ok ? 'yes' : 'NO'} |`),
      '', `Extra helper constants (not in the PRD table): ${extras.map((k) => `${k}=${actual[k]}`).join(', ')}`].join('\n');
    const link = writeOut('13-constants-compare.md', md + '\n');
    record('P1-7', rows.length >= 20 && mism.length === 0 && namedBad.length === 0 ? 'PASS' : 'FAIL',
      `${table.length - mism.length}/${table.length} PRD constants match (values read from the live module via the dev server)${mism.length ? `; mismatches: ${mism.map((r) => `${r.name}=${r.actual} (PRD ${r.prd})`).join(', ')}` : ''}; extra helpers: ${extras.length}.`,
      { outputs: [link] });
  });

  // P1-11 + P1-12 — adapters on the same page
  {
    let handle = null;
    try {
      handle = await newPage();
      const { page } = handle;
      await page.goto(`${DEV}/`);
      await page.getByRole('heading', { level: 1, name: 'Trumpet Trainer' }).waitFor({ timeout: 15_000 });
      try {
        const r = await page.evaluate(async () => {
          const { createBrowserAudioServices } = await import('/src/audio/services.ts');
          const { midiToHz, writtenToConcert } = await import('/src/music/notes.ts');
          const s = createBrowserAudioServices();
          s.unlock();
          const before = window.__osc.length;
          const t0 = performance.now();
          const p = s.playMelody([71, 71, 64, 67, 72].map((w) => midiToHz(writtenToConcert(w))), 500);
          await p.done;
          const ms = performance.now() - t0;
          window.__svc = s;
          return { ms, osc: window.__osc.slice(before).map((o) => ({ hz: o.hz })), result: 'done' };
        });
        const expected = [71, 71, 64, 67, 72].map(writtenHz);
        const freqOk = r.osc.length === 5 && r.osc.every((o, i) => approx(o.hz, expected[i], 0.5));
        const link = writeOut('14-synth-playback.json', JSON.stringify({ ...r, expectedHz: expected }, null, 2));
        const ok = r.result === 'done' && r.ms >= 2200 && r.ms <= 3500 && freqOk;
        record('P1-11', ok ? 'PASS' : 'FAIL',
          `p.done resolved after ${Math.round(r.ms)} ms (expected ≈2.5 s, window 2.2–3.5 s), 'done' returned; ${r.osc.length} oscillator attacks at ${r.osc.map((o) => o.hz.toFixed(1)).join(', ')} Hz (expected 440, 440, 293.7, 349.2, 466.2). Brass-like timbre / audibly separate attacks are a human-ear check (5 separate oscillators with per-note envelopes verified).`,
          { outputs: [link] });
      } catch (e) {
        record('P1-11', 'FAIL', `Exception: ${e.message.split('\n')[0]}`);
      }
      try {
        const r = await page.evaluate(async () => {
          const s = window.__svc || (await import('/src/audio/services.ts')).createBrowserAudioServices();
          const { computeLevelDb } = await import('/src/audio/level.ts');
          s.unlock();
          const gumBefore = window.__gumCalls;
          const mic = await s.openMicrophone();
          const log = [];
          const off = mic.subscribe((f) => {
            const d = s.detectPitch(f.samples, mic.sampleRate);
            log.push([computeLevelDb(f.samples), d ? d.hz : null]);
          });
          await new Promise((res) => setTimeout(res, 1500));
          const tracksBefore = window.__streams.at(-1).getTracks().map((t) => t.readyState);
          off();
          mic.release();
          const frames = log.length;
          await new Promise((res) => setTimeout(res, 500));
          return {
            sampleRate: mic.sampleRate,
            gumCalls: window.__gumCalls - gumBefore,
            frames,
            framesAfterRelease: log.length - frames,
            tracksBefore,
            tracksAfter: window.__streams.at(-1).getTracks().map((t) => t.readyState),
            log,
          };
        });
        const levelsOk = r.log.every(([l]) => Number.isFinite(l) && l >= -100 && l <= 0);
        const near = r.log.filter(([, hz]) => hz !== null && approx(hz, CONCERT_A4, 5)).length;
        const outOfRange = r.log.filter(([, hz]) => hz !== null && (hz < 150 || hz > 500)).length;
        const levels = r.log.map(([l]) => l);
        const ok = r.frames > 20 && levelsOk && near / r.frames >= 0.5 && outOfRange === 0 &&
          r.framesAfterRelease === 0 && r.tracksAfter.every((s) => s === 'ended') && r.gumCalls === 1;
        const link = writeOut('15-mic-frames.json', JSON.stringify({
          ...r, log: r.log.slice(0, 60).map(([l, hz]) => `${l.toFixed(1)} ${hz === null ? 'null' : hz.toFixed(1)}`),
        }, null, 2));
        record('P1-12', ok ? 'PASS' : 'FAIL',
          `getUserMedia called once; ${r.frames} frames in 1.5 s at ${r.sampleRate} Hz; levels finite in [−100, 0] dBFS: ${levelsOk} (range ${Math.min(...levels).toFixed(1)}…${Math.max(...levels).toFixed(1)}); ${near}/${r.frames} frames detected 440±5 Hz, ${outOfRange} out-of-range values; after off()+release(): ${r.framesAfterRelease} more frames, tracks ${r.tracksBefore.join(',')} → ${r.tracksAfter.join(',')}. Uses the fake 440 Hz mic (real humming/trumpet and the OS mic indicator remain manual).`,
          { outputs: [link] });
      } catch (e) {
        record('P1-12', 'FAIL', `Exception: ${e.message.split('\n')[0]}`);
      }
    } catch (e) {
      for (const id of ['P1-11', 'P1-12']) if (!results.has(id)) record(id, 'FAIL', `Exception: ${e.message.split('\n')[0]}`);
    } finally {
      if (handle?.ctx) await handle.ctx.close().catch(() => undefined);
    }
  }

  // P1-13 — permission denied
  {
    const snippet = async () => {
      const { createBrowserAudioServices } = await import('/src/audio/services.ts');
      const s = createBrowserAudioServices();
      return await s.openMicrophone().then((m) => { m.release(); return 'opened'; }, (e) => e.kind);
    };
    let realResult = 'not attempted';
    try {
      const b = await chromium.launch({
        args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${WAV_PATH}`, '--deny-permission-prompts'],
      });
      extraBrowsers.push(b);
      const p = await b.newPage();
      await p.goto(`${DEV}/`);
      realResult = await Promise.race([p.evaluate(snippet), sleep(8000).then(() => 'timeout (prompt not answered)')]);
      await b.close();
    } catch (e) {
      realResult = `error: ${e.message.split('\n')[0]}`;
    }
    await browserCheck('P1-13', async ({ page }) => {
      await page.goto(`${DEV}/`);
      const injected = await page.evaluate(snippet);
      const src = fs.readFileSync(path.resolve(ROOT, 'src', 'audio', 'microphone.ts'), 'utf8');
      const maps = /PERMISSION_ERROR_NAMES\s*=\s*new Set\(\[[^\]]*'NotAllowedError'/.test(src);
      const ok = realResult === 'permission-denied' || (injected === 'permission-denied' && maps);
      const link = writeOut('16-mic-denied.txt',
        `Real denial (headless Chromium, --deny-permission-prompts, no fake-ui flag): ${realResult}\n` +
        `Simulated denial (getUserMedia rejects with DOMException NotAllowedError, as the browser does when blocked): ${injected}\n` +
        `microphone.ts maps NotAllowedError → permission-denied: ${maps}\n`);
      record('P1-13', ok ? 'PASS' : 'FAIL',
        realResult === 'permission-denied'
          ? `Real blocked-permission browser returned '${realResult}'.`
          : `Simulated denial (getUserMedia → DOMException NotAllowedError) returned '${injected}'; microphone.ts maps NotAllowedError/SecurityError → permission-denied: ${maps}. Real headless-shell denial returned '${realResult}' (headless shell has no permission UI and reports NotSupportedError), so blocking via real site settings stays a manual check.`,
        { outputs: [link] });
    }, { deny: true });
  }

  // P2-3 + P2-4 + P2-5 — Home screen (shared page, like the human flow)
  {
    let handle = null;
    try {
      handle = await newPage();
      const { page } = handle;
      await page.goto(`${DEV}/`);
      // P2-3
      try {
        await page.getByRole('heading', { level: 1, name: 'Trumpet Trainer' }).waitFor({ timeout: 15_000 });
        const start = startBtn(page);
        const pressed = await testMicBtn(page).getAttribute('aria-pressed');
        const now = await meter(page).getAttribute('aria-valuenow');
        const vmin = await meter(page).getAttribute('aria-valuemin');
        const sv = await slider(page).inputValue();
        const label = (await thresholdLabel(page).textContent())?.trim();
        const img = await shot(page, 'p2-home-initial');
        const ok = (await start.isVisible()) && (await start.isEnabled()) && pressed === 'false' && now === '-60' && vmin === '-60' && sv === '-40' && label === `Threshold: ${MINUS}40 dB`;
        record('P2-3', ok ? 'PASS' : 'FAIL',
          `Heading + "Start training" (enabled) visible; Test microphone aria-pressed="${pressed}"; meter aria-valuenow=${now} (min ${vmin}); slider value ${sv}; label "${label}" (U+2212 minus: ${label?.includes(MINUS)}).`,
          { images: [img] });
      } catch (e) {
        record('P2-3', 'FAIL', `Exception: ${e.message.split('\n')[0]}`, { images: [await shot(page, 'p2-3-error').catch(() => '')].filter(Boolean) });
      }
      // P2-4
      try {
        await testMicBtn(page).click();
        await page.waitForFunction(() => document.querySelector('.mic-meter__toggle')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5000 });
        await page.waitForFunction(() => Number(document.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')) > -40, null, { timeout: 10_000 });
        await sleep(500);
        const level = Number(await meter(page).getAttribute('aria-valuenow'));
        const fill = page.getByTestId('mic-level-fill');
        const fillClass = await fill.getAttribute('class');
        const fillColorOn = await fill.evaluate((el) => getComputedStyle(el).backgroundColor);
        const width = await fill.evaluate((el) => el.style.width);
        const imgOn = await shot(page, 'p2-mic-test-on');
        await testMicBtn(page).click();
        await page.waitForFunction(() => document.querySelector('.mic-meter__toggle')?.getAttribute('aria-pressed') === 'false', null, { timeout: 5000 });
        await page.waitForFunction(() => document.querySelector('[role="meter"]')?.getAttribute('aria-valuenow') === '-60', null, { timeout: 5000 });
        const tracks = await waitTracksEnded(page);
        const fillColorOff = await fill.evaluate((el) => getComputedStyle(el).backgroundColor);
        const imgOff = await shot(page, 'p2-mic-test-off');
        const green = fillClass.includes('mic-meter__fill--ok');
        const ok = level > -40 && green && fillColorOn !== fillColorOff && tracks.length > 0 && tracks.every((s) => s === 'ended');
        record('P2-4', ok ? 'PASS' : 'FAIL',
          `On: aria-pressed=true, meter aria-valuenow=${level} dBFS (fake 440 Hz tone, fill width ${width}), fill class "${fillClass}" (green ${fillColorOn}) above the −40 threshold. Off: aria-pressed=false, aria-valuenow=−60, fill ${fillColorOff}, mic tracks ${tracks.join(',')} (mic released → browser indicator off).`,
          { images: [imgOn, imgOff] });
      } catch (e) {
        record('P2-4', 'FAIL', `Exception: ${e.message.split('\n')[0]}`, { images: [await shot(page, 'p2-4-error').catch(() => '')].filter(Boolean) });
      }
      // P2-5
      try {
        await testMicBtn(page).click();
        await page.waitForFunction(() => Number(document.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')) > -40, null, { timeout: 10_000 });
        await setSlider(page, -20);
        await page.waitForFunction((m) => document.querySelector('.mic-meter__threshold-label')?.textContent === `Threshold: ${m}20 dB`, MINUS, { timeout: 3000 });
        await sleep(400);
        const level20 = Number(await meter(page).getAttribute('aria-valuenow'));
        const fill = page.getByTestId('mic-level-fill');
        const green20 = (await fill.getAttribute('class')).includes('--ok');
        const sv20 = await slider(page).inputValue();
        const img20 = await shot(page, 'p2-threshold-minus20');
        await setSlider(page, 0);
        await page.waitForFunction(() => document.querySelector('.mic-meter__threshold-label')?.textContent === 'Threshold: 0 dB', null, { timeout: 3000 });
        await sleep(400);
        const level0 = Number(await meter(page).getAttribute('aria-valuenow'));
        const green0 = (await fill.getAttribute('class')).includes('--ok');
        const img0 = await shot(page, 'p2-threshold-0');
        await setSlider(page, -20);
        const label = (await thresholdLabel(page).textContent())?.trim();
        await testMicBtn(page).click();
        const exp20 = level20 >= -20;
        const exp0 = level0 >= 0;
        const ok = sv20 === '-20' && label === `Threshold: ${MINUS}20 dB` && green20 === exp20 && green0 === exp0;
        record('P2-5', ok ? 'PASS' : 'FAIL',
          `Slider set to −20 → label "${label}", slider value ${sv20} (marker at ${(((-20 + 60) / 60) * 100).toFixed(0)}% of the bar vs ${(((-40 + 60) / 60) * 100).toFixed(0)}% before — see screenshots). Level ${level20} dBFS ≥ −20 → fill green: ${green20} (expected ${exp20}). At 0 dB threshold, level ${level0} → green: ${green0} (expected ${exp0}).`,
          { images: [img20, img0] });
      } catch (e) {
        record('P2-5', 'FAIL', `Exception: ${e.message.split('\n')[0]}`, { images: [await shot(page, 'p2-5-error').catch(() => '')].filter(Boolean) });
      }
    } catch (e) {
      for (const id of ['P2-3', 'P2-4', 'P2-5']) if (!results.has(id)) record(id, 'FAIL', `Exception: ${e.message.split('\n')[0]}`);
    } finally {
      if (handle?.ctx) await handle.ctx.close().catch(() => undefined);
    }
  }

  // P2-6 + P2-7 — mic errors (same page: blocked, then allowed)
  {
    let handle = null;
    try {
      handle = await newPage({ deny: true });
      const { page } = handle;
      await page.goto(`${DEV}/`);
      try {
        await startBtn(page).click();
        const alert = page.getByRole('alert');
        await alert.waitFor({ timeout: 10_000 });
        await sleep(1000);
        const text = (await alert.textContent())?.trim();
        const enabled = await startBtn(page).isEnabled();
        const onTraining = (await statusText(page)) !== null;
        const l = await logs(page);
        const img = await shot(page, 'p2-mic-blocked');
        const ok = text === PERMISSION_MESSAGE && text.startsWith('Microphone access is blocked. Allow the microphone for this site') && enabled && !onTraining && l.osc.length === 0;
        record('P2-6', ok ? 'PASS' : 'FAIL',
          `Alert: "${text}"; Start training enabled: ${enabled}; Training screen shown: ${onTraining}; oscillators started (melody played): ${l.osc.length}. Denial simulated by getUserMedia rejecting with NotAllowedError (headless Chromium has no site-settings UI).`,
          { images: [img] });
      } catch (e) {
        record('P2-6', 'FAIL', `Exception: ${e.message.split('\n')[0]}`, { images: [await shot(page, 'p2-6-error').catch(() => '')].filter(Boolean) });
      }
      try {
        await page.evaluate(() => { window.__denyMic = false; });
        await startBtn(page).click();
        await waitStatus(page, '^Listen…$', 10_000);
        const alertCount = await page.getByRole('alert').count();
        const img = await shot(page, 'p2-mic-allowed-training');
        record('P2-7', alertCount === 0 ? 'PASS' : 'FAIL',
          `After allowing the microphone, Start training → alert count ${alertCount}, Training screen shown with status "${await statusText(page)}".`,
          { images: [img] });
      } catch (e) {
        record('P2-7', 'FAIL', `Exception: ${e.message.split('\n')[0]}`, { images: [await shot(page, 'p2-7-error').catch(() => '')].filter(Boolean) });
      }
    } catch (e) {
      for (const id of ['P2-6', 'P2-7']) if (!results.has(id)) record(id, 'FAIL', `Exception: ${e.message.split('\n')[0]}`);
    } finally {
      if (handle?.ctx) await handle.ctx.close().catch(() => undefined);
    }
  }

  // P2-8 — start training on the normal dev server (random melody)
  await browserCheck('P2-8', async ({ page, images }) => {
    await page.goto(`${DEV}/`);
    await startBtn(page).click();
    await waitStatus(page, '^Listen…$', 10_000);
    const boxes = await boxStates(page);
    const repDisabled = await repeatBtn(page).isDisabled();
    const giveDisabled = await giveUpBtn(page).isDisabled();
    images.push(await shot(page, 'p2-training-playing'));
    try {
      await waitStatus(page, '^Get ready…$', 6000);
      images.push(await shot(page, 'p2-training-guard'));
    } catch { /* guard is only 250 ms — best effort */ }
    await waitStatus(page, '^Your turn: play note \\d of 5$', 10_000);
    const repEnabled = await repeatBtn(page).isEnabled();
    const giveEnabled = await giveUpBtn(page).isEnabled();
    images.push(await shot(page, 'p2-training-listening'));
    const l = await logs(page);
    const click = l.clicks.find((c) => c.label === 'Start training');
    const t0 = click ? click.t : 0;
    const texts = l.statusLog.map((e) => e.text);
    const iListen = texts.indexOf('Listen…');
    const iGuard = texts.indexOf('Get ready…');
    const iTurn = texts.indexOf('Your turn: play note 1 of 5');
    const toGuard = iGuard >= 0 ? l.statusLog[iGuard].t - t0 : NaN;
    const guardMs = iGuard >= 0 && iTurn >= 0 ? l.statusLog[iTurn].t - l.statusLog[iGuard].t : NaN;
    const melodyOsc = l.osc.slice(-5);
    const boxesOk = boxes.length === 5 && boxes[0].state === 'active' && boxes.slice(1).every((b) => b.state === 'pending') && boxes.every((b) => b.id === `note-box-${boxes.indexOf(b)}`);
    const ok = boxesOk && repDisabled && giveDisabled && iListen >= 0 && iListen < iGuard && iGuard < iTurn &&
      toGuard >= 2200 && toGuard <= 3500 && guardMs >= 150 && guardMs <= 700 && repEnabled && giveEnabled && l.osc.length >= 5;
    await giveUpBtn(page).click().catch(() => undefined);
    record('P2-8', ok ? 'PASS' : 'FAIL',
      `Status sequence ${fmtStatusLog(l.statusLog.filter((e) => e.text !== null), t0)} (t=0 at click). Click → "Get ready…" ${Math.round(toGuard)} ms (≈2.5 s expected), guard ${Math.round(guardMs)} ms (250 expected). Boxes at start: ${boxes.map((b) => b.state).join(', ')}; Repeat/Give up disabled while playing: ${repDisabled}/${giveDisabled}, enabled when listening: ${repEnabled}/${giveEnabled}. Melody oscillators (last 5): ${melodyOsc.map((o) => o.hz.toFixed(1)).join(', ')} Hz. Audibility of the 5 notes is a human-ear check.`);
  });

  // P2-9 — playback does not leak (proxy)
  await browserCheck('P2-9', async ({ page, images }) => {
    await page.goto(`${E2E}/?melody=60,62,64,65,67`);
    await startBtn(page).click();
    await waitStatus(page, '^Your turn: play note 1 of 5$', 15_000);
    await sleep(3000);
    const l = await logs(page);
    const boxes = await boxStates(page);
    images.push(await shot(page, 'p2-no-leak'));
    const ok = l.doneLog.length === 0 && boxes.every((b) => b.state !== 'done') && (await statusText(page)) === 'Your turn: play note 1 of 5';
    await giveUpBtn(page).click().catch(() => undefined);
    record('P2-9', ok ? 'PASS' : 'FAIL',
      `Proxy on 5174 with ?melody=60,62,64,65,67 (none matches the fake 440 Hz mic): through playback, guard and 3 s of listening no box turned done (done transitions: ${l.doneLog.length}; boxes ${boxes.map((b) => b.state).join(', ')}). Real speaker → microphone acoustic leakage needs a human with speakers and a real mic (manual).`,
      { images });
  });

  // P2-10 — correct note (proxy)
  await browserCheck('P2-10', async ({ page, images }) => {
    await page.goto(`${E2E}/?melody=71,60,60,60,60`);
    await startBtn(page).click();
    await page.getByTestId('note-box-0').waitFor({ timeout: 10_000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="note-box-0"]')?.getAttribute('data-state') === 'done', null, { timeout: 15_000 });
    await waitStatus(page, '^Your turn: play note 2 of 5$', 5000);
    const boxes = await boxStates(page);
    const l = await logs(page);
    images.push(await shot(page, 'p2-first-note-done'));
    const listenStart = l.statusLog.find((e) => e.text === 'Your turn: play note 1 of 5');
    const doneAfter = listenStart && l.doneLog[0] ? Math.round(l.doneLog[0].t - listenStart.t) : NaN;
    const ok = boxes[0].state === 'done' && boxes[0].text === 'Si4' && boxes[1].state === 'active' && boxes.slice(2).every((b) => b.state === 'pending');
    await giveUpBtn(page).click().catch(() => undefined);
    record('P2-10', ok ? 'PASS' : 'FAIL',
      `Proxy on 5174 ?melody=71,60,60,60,60 with the fake 440 Hz tone: box 1 turned done showing "${boxes[0].text}" ${doneAfter} ms after listening started (≥500 ms sustain), highlight moved to box 2 (${boxes.map((b) => b.state).join(', ')}), status "Your turn: play note 2 of 5". Playing other notes on a real trumpet (and other spellings like Fa#3 / Si♭3) remains manual.`,
      { images });
  });

  // P2-11 — wrong note / octave off (proxy)
  {
    const parts = [];
    const images = [];
    let allOk = true;
    for (const [label, melody, desc] of [
      ['wrong-note', '60,60,60,60,60', 'wrong note (target written Do4 = 233 Hz concert, mic plays 440 Hz)'],
      ['octave-off', '59,59,59,59,59', 'octave off (target written Si3 = 220 Hz concert, mic plays 440 Hz — one octave above)'],
    ]) {
      let handle = null;
      try {
        handle = await newPage();
        const { page } = handle;
        await page.goto(`${E2E}/?melody=${melody}`);
        await startBtn(page).click();
        await waitStatus(page, '^Your turn: play note 1 of 5$', 15_000);
        await sleep(3000);
        const l = await logs(page);
        const boxes = await boxStates(page);
        const st = await statusText(page);
        images.push(await shot(page, `p2-${label}`));
        const ok = l.doneLog.length === 0 && boxes[0].state === 'active' && st === 'Your turn: play note 1 of 5';
        allOk &&= ok;
        parts.push(`${desc}: after 3 s of listening, done transitions ${l.doneLog.length}, box 1 ${boxes[0].state}, status "${st}" → ${ok ? 'unchanged' : 'CHANGED'}`);
        await giveUpBtn(page).click().catch(() => undefined);
      } catch (e) {
        allOk = false;
        parts.push(`${label}: exception ${e.message.split('\n')[0]}`);
      } finally {
        if (handle?.ctx) await handle.ctx.close().catch(() => undefined);
      }
    }
    record('P2-11', allOk ? 'PASS' : 'FAIL',
      `Proxy on 5174 with the fake 440 Hz tone. ${parts.join('; ')}. Real trumpet wrong-note/octave checks remain manual.`,
      { images });
  }

  // P2-12 — repeat melody
  await browserCheck('P2-12', async ({ page, images }) => {
    await page.goto(`${E2E}/?melody=71,60,60,60,60`);
    await startBtn(page).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="note-box-0"]')?.getAttribute('data-state') === 'done', null, { timeout: 15_000 });
    await waitStatus(page, '^Your turn: play note 2 of 5$', 5000);
    const before = await logs(page);
    const oscBefore = before.osc.length;
    await repeatBtn(page).click();
    await waitStatus(page, '^Listen…$', 3000);
    const repDisabled = await repeatBtn(page).isDisabled();
    const giveDisabled = await giveUpBtn(page).isDisabled();
    const boxesPlaying = await boxStates(page);
    const tracksPlaying = await trackStates(page);
    images.push(await shot(page, 'p2-repeat-playing'));
    await waitStatus(page, '^Your turn: play note 2 of 5$', 10_000);
    const boxesAfter = await boxStates(page);
    const tracksAfter = await trackStates(page);
    const after = await logs(page);
    images.push(await shot(page, 'p2-repeat-listening-again'));
    const replayed = after.osc.length - oscBefore;
    const click = after.clicks.filter((c) => c.label === 'Repeat melody').at(-1);
    const seq = after.statusLog.filter((e) => click && e.t >= click.t);
    const ok = repDisabled && giveDisabled && boxesPlaying[0].state === 'done' && boxesPlaying[0].text === 'Si4' && boxesPlaying[1].state === 'active' &&
      boxesAfter[0].state === 'done' && boxesAfter[1].state === 'active' && replayed >= 5 &&
      tracksPlaying.length > 0 && tracksPlaying.every((s) => s === 'live') && tracksAfter.every((s) => s === 'live') && after.gumCalls === before.gumCalls &&
      (await repeatBtn(page).isEnabled());
    await giveUpBtn(page).click().catch(() => undefined);
    record('P2-12', ok ? 'PASS' : 'FAIL',
      `After box 1 done, Repeat → buttons disabled (${repDisabled}/${giveDisabled}), status ${fmtStatusLog(seq.filter((e) => e.text !== null), click ? click.t : 0)}; ${replayed} oscillators replayed; boxes while replaying ${boxesPlaying.map((b) => b.state).join(', ')} and after ${boxesAfter.map((b) => b.state).join(', ')}; mic tracks ${tracksPlaying.join(',')} during replay and ${tracksAfter.join(',')} after; getUserMedia calls before/after: ${before.gumCalls}/${after.gumCalls} (session kept → mic indicator stays on).`,
      { images });
  });

  // P2-13 — give up
  await browserCheck('P2-13', async ({ page, images }) => {
    await page.goto(`${E2E}/?melody=60,60,60,60,60`);
    await setSlider(page, -20);
    await page.waitForFunction((m) => document.querySelector('.mic-meter__threshold-label')?.textContent === `Threshold: ${m}20 dB`, MINUS, { timeout: 3000 });
    await startBtn(page).click();
    await waitStatus(page, '^Your turn: play note 1 of 5$', 15_000);
    await giveUpBtn(page).click();
    await startBtn(page).waitFor({ timeout: 5000 });
    const l = await logs(page);
    const click = l.clicks.filter((c) => c.label === 'Give up').at(-1);
    const homeAt = l.statusLog.filter((e) => e.text === null && click && e.t >= click.t)[0];
    const elapsed = homeAt && click ? homeAt.t - click.t : NaN;
    const tracks = await waitTracksEnded(page);
    const sv = await slider(page).inputValue();
    const label = (await thresholdLabel(page).textContent())?.trim();
    images.push(await shot(page, 'p2-gave-up-home'));
    const ok = elapsed < 500 && tracks.length > 0 && tracks.every((s) => s === 'ended') && sv === '-20' && label === `Threshold: ${MINUS}20 dB`;
    record('P2-13', ok ? 'PASS' : 'FAIL',
      `Home shown ${Math.round(elapsed)} ms after clicking Give up; mic tracks ${tracks.join(',')} (released → indicator off); threshold kept: slider ${sv}, label "${label}".`,
      { images });
  });

  // P2-14 + P2-16 — complete all 5 on the e2e-mode server
  {
    let handle = null;
    try {
      handle = await newPage();
      const { page } = handle;
      const images14 = [];
      await page.goto(`${E2E}/?melody=71,71,71,71,71`);
      await startBtn(page).click();
      await waitStatus(page, '^Well done!$', 30_000);
      const boxes = await boxStates(page);
      const repDisabled = await repeatBtn(page).isDisabled();
      const giveDisabled = await giveUpBtn(page).isDisabled();
      images14.push(await shot(page, 'p2-complete-well-done'));
      await startBtn(page).waitFor({ timeout: 10_000 });
      const tracks = await waitTracksEnded(page);
      images14.push(await shot(page, 'p2-complete-home-returned'));
      const l = await logs(page);
      const wd = l.statusLog.find((e) => e.text === 'Well done!');
      const home = wd && l.statusLog.find((e) => e.text === null && e.t > wd.t);
      const pause = wd && home ? home.t - wd.t : NaN;
      const allDone = boxes.length === 5 && boxes.every((b) => b.state === 'done' && b.text === 'Si4');
      const ok14 = allDone && repDisabled && giveDisabled && pause >= 1300 && pause <= 2500 && tracks.length > 0 && tracks.every((s) => s === 'ended');
      record('P2-14', ok14 ? 'PASS' : 'FAIL',
        `Proxy on 5174 ?melody=71,71,71,71,71 with the fake 440 Hz tone: boxes ${boxes.map((b) => `${b.state}(${b.text})`).join(', ')}; status "Well done!"; buttons disabled ${repDisabled}/${giveDisabled}; Home returned ${Math.round(pause)} ms later (≈1500 expected); mic tracks ${tracks.join(',')}. Completing a random melody on a real trumpet remains manual.`,
        { images: images14 });

      const order = l.doneLog.map((d) => d.id);
      const inOrder = JSON.stringify(order) === JSON.stringify([0, 1, 2, 3, 4].map((i) => `note-box-${i}`));
      const increasing = l.doneLog.every((d, i) => i === 0 || d.t > l.doneLog[i - 1].t);
      const names = l.doneLog.map((d) => d.text);
      const melodyOsc = l.osc.slice(-5);
      const allA4 = melodyOsc.length === 5 && melodyOsc.every((o) => approx(o.hz, CONCERT_A4, 0.5));
      const gaps = l.doneLog.map((d, i) => (i === 0 ? null : Math.round(d.t - l.doneLog[i - 1].t))).slice(1);
      const ok16 = inOrder && increasing && names.every((n) => n === 'Si4') && allA4 && ok14;
      const link = writeOut('17-deterministic-run.json', JSON.stringify({ statusLog: l.statusLog, doneLog: l.doneLog, osc: l.osc }, null, 2));
      record('P2-16', ok16 ? 'PASS' : 'FAIL',
        `Melody played as five repeated notes (${melodyOsc.map((o) => o.hz.toFixed(1)).join(', ')} Hz = concert A4); boxes turned green in order ${order.join(' → ')} (gaps ${gaps.join(', ')} ms), each showing ${[...new Set(names)].join('/')}; Home returned ${Math.round(pause)} ms after "Well done!". The fake mic replaces the phone tone generator.`,
        { images: images14.slice(), outputs: [link] });
    } catch (e) {
      for (const id of ['P2-14', 'P2-16']) if (!results.has(id)) record(id, 'FAIL', `Exception: ${e.message.split('\n')[0]}`, { images: handle?.page ? [await shot(handle.page, `${id.toLowerCase()}-error`).catch(() => '')].filter(Boolean) : [] });
    } finally {
      if (handle?.ctx) await handle.ctx.close().catch(() => undefined);
    }
  }

  // P2-15 — threshold gating (proxy)
  await browserCheck('P2-15', async ({ page, images }) => {
    await page.goto(`${E2E}/?melody=71,71,71,71,71`);
    await setSlider(page, 0);
    await page.waitForFunction(() => document.querySelector('.mic-meter__threshold-label')?.textContent === 'Threshold: 0 dB', null, { timeout: 3000 });
    await startBtn(page).click();
    await waitStatus(page, '^Your turn: play note 1 of 5$', 15_000);
    await sleep(3000);
    const l = await logs(page);
    const boxes = await boxStates(page);
    images.push(await shot(page, 'p2-threshold-0-gated'));
    const ok = l.doneLog.length === 0 && boxes[0].state === 'active';
    await giveUpBtn(page).click().catch(() => undefined);
    record('P2-15', ok ? 'PASS' : 'FAIL',
      `Proxy on 5174 ?melody=71,71,71,71,71, threshold 0 dB: the matching fake 440 Hz tone (≈−9 dBFS) played for 3 s of listening and no box turned done (done transitions ${l.doneLog.length}; box 1 ${boxes[0].state}). A loud real trumpet remains a manual check.`,
      { images });
  });

  // P2-17 — ?melody ignored outside e2e mode
  {
    const parts = [];
    const images = [];
    let allOk = true;
    for (const [label, url] of [['dev-5173', `${DEV}/?melody=71,71,71,71,71`], ['preview-4173', `${PREVIEW}?melody=71,71,71,71,71`]]) {
      let ok = false;
      let lastDetail = '';
      for (let attempt = 1; attempt <= 3 && !ok; attempt += 1) {
        let handle = null;
        try {
          handle = await newPage();
          const { page } = handle;
          await page.goto(url);
          const rendered = await startBtn(page).waitFor({ timeout: 15_000 }).then(() => true, () => false);
          if (!rendered) {
            images.push(await shot(page, `p2-melody-param-${label}-not-rendered`));
            lastDetail = `${label}: the app did not render ("Start training" not found) — cannot check the param`;
            break;
          }
          await startBtn(page).click();
          await waitStatus(page, '^Your turn: play note \\d of 5$', 15_000);
          const l = await logs(page);
          const melodyOsc = l.osc.slice(-5);
          const allA4 = melodyOsc.every((o) => approx(o.hz, CONCERT_A4, 0.5));
          ok = melodyOsc.length === 5 && !allA4;
          if (attempt === 1 || ok) images.push(await shot(page, `p2-melody-param-ignored-${label}`));
          lastDetail = `${label}: played ${melodyOsc.map((o) => o.hz.toFixed(1)).join(', ')} Hz (${allA4 ? 'all 440 Hz — matches param' : 'random, not the 71×5 param'})${attempt > 1 ? ` [attempt ${attempt}]` : ''}`;
          await giveUpBtn(page).click().catch(() => undefined);
        } catch (e) {
          lastDetail = `${label}: exception ${e.message.split('\n')[0]}`;
        } finally {
          if (handle?.ctx) await handle.ctx.close().catch(() => undefined);
        }
      }
      allOk &&= ok;
      parts.push(lastDetail);
    }
    record('P2-17', allOk ? 'PASS' : 'FAIL',
      `Synth oscillator frequencies recorded via an init script: ${parts.join('; ')}. (?melody=71,71,71,71,71 would be five 440 Hz notes; the chance of a random melody being that is (1/19)^5.)`,
      { images });
  }
}

// ---------------------------------------------------------------- report --------------------------
let envOutputLink = null;
const runStarted = new Date();

function writeReport() {
  for (const [, , items] of SECTIONS) {
    for (const [id] of items) if (!results.has(id)) results.set(id, { status: 'FAIL', detail: 'Not executed (an earlier phase aborted — see console / environment output).', images: [], outputs: [] });
  }
  const all = [...results.values()];
  const pass = all.filter((r) => r.status === 'PASS').length;
  const fail = all.filter((r) => r.status === 'FAIL').length;
  const skip = all.filter((r) => r.status === 'SKIP').length;
  const icon = { PASS: '✅', FAIL: '❌ FAIL', SKIP: '⏭️ SKIP' };
  const lines = [
    '# Validation Report — Run 1',
    '',
    `- **Feature:** create-mvp (Trumpet Trainer MVP) — checklist \`specs/create-mvp/validation.md\``,
    `- **Started:** ${runStarted.toISOString()}  ·  **Finished:** ${new Date().toISOString()}`,
    `- **Host:** ${process.platform} ${process.arch}, Node ${process.version}`,
    `- **Script:** \`specs/create-mvp/validation-run-1/validate.mjs\` (wrapper \`run.sh\`)`,
    envOutputLink ? `- **Environment log:** [create-environment.txt](${envOutputLink})` : '- **Environment log:** not started',
    '',
    `**Summary:** ${pass} passed, ${fail} failed, ${skip} skipped`,
    '',
    '> Items marked "proxy" use Chromium\'s fake microphone (a looping 440 Hz tone = written Si4) and the e2e-mode `?melody=` hook instead of a real trumpet. Real-instrument tuning, speaker→mic leakage, audible timbre and OS mic indicators remain manual checks.',
  ];
  let currentPart = null;
  for (const [part, section, items] of SECTIONS) {
    if (part !== currentPart) {
      lines.push('', `## ${part}`);
      currentPart = part;
    }
    lines.push('', `### ${section}`, '');
    for (const [id] of items) {
      const r = results.get(id);
      lines.push(`- ${icon[r.status]} **${id} ${titleOf(id)}** — ${r.detail.replace(/\n/g, ' ')}`);
      if (r.outputs?.length) lines.push(`  - Output: ${r.outputs.map((o) => `[${path.basename(o)}](${o})`).join(', ')}`);
      for (const img of r.images || []) {
        lines.push('', `  ![${id} ${path.basename(img, '.png')}](${img})`);
      }
      if (r.images?.length) lines.push('');
    }
  }
  fs.writeFileSync(REPORT_PATH, lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n', 'utf8');
  console.log(`\nReport: ${REPORT_PATH}`);
  console.log(`Summary: ${pass} passed, ${fail} failed, ${skip} skipped`);
  return fail;
}

// ---------------------------------------------------------------- main ----------------------------
let fatal = null;
try {
  if (!SKIP_COMMANDS) await phaseA();
  await phaseB();
} catch (e) {
  fatal = e;
  console.error(`FATAL: ${e.stack || e.message}`);
} finally {
  await cleanup();
}
const failures = writeReport();
if (fatal) console.error(`Run aborted early: ${fatal.message}`);
process.exit(failures === 0 && !fatal ? 0 : 1);
