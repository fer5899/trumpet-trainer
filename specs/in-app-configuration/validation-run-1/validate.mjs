#!/usr/bin/env node
/* global window, document, AudioParam, AudioNode, AudioScheduledSourceNode, BaseAudioContext, AudioDestinationNode -- browser globals used inside the addInitScript callback */
// Trumpet Trainer — in-app configuration (Part 1, prd.md) — automated validation, Run 1.
// Automates specs/in-app-configuration/validation.md items 1–16.
//
// Modes (run.sh calls them in this order):
//   --browser  Items 1–15 against the e2e-mode dev server at http://localhost:5173/ (must be running).
//              Writes run-1/output/browser-results.json plus screenshots and api/*.json evidence.
//   --report   Reads browser-results.json and run-1/output/regression-status.json (written by run.sh
//              after lint / typecheck / npm test / test:e2e), builds item 16 and writes
//              validation-assets/validation-report-run-1.md. Exit 0 if every item passed, else 1.
//   (none)     --browser followed by --report (item 16 is SKIP if run.sh's regression status is absent).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------- paths / constants ---------------
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..');
const FEATURE_DIR = path.resolve(ROOT, 'specs', 'in-app-configuration');
const ASSETS_DIR = path.resolve(FEATURE_DIR, 'validation-assets');
const RUN_DIR = path.resolve(ASSETS_DIR, 'run-1');
const SHOTS_DIR = path.resolve(RUN_DIR, 'screenshots');
const API_DIR = path.resolve(RUN_DIR, 'api');
const OUT_DIR = path.resolve(RUN_DIR, 'output');
const BROWSER_RESULTS = path.resolve(OUT_DIR, 'browser-results.json');
const REGRESSION_STATUS = path.resolve(OUT_DIR, 'regression-status.json');
const REPORT_PATH = path.resolve(ASSETS_DIR, 'validation-report-run-1.md');
const WAV_PATH = path.resolve(ROOT, 'e2e', 'fixtures', 'tone-a4-440hz.wav');

const BASE = 'http://localhost:5173';
const EXPECTED_UNIT_TESTS = 1027;
const EXPECTED_E2E_TESTS = 3;
// src/config/constants.ts
const DEFAULT_NOTE_DURATION_S = 1.0;
const DEFAULT_VOLUME = 0.5;
const SYNTH_ENVELOPE_PEAK_GAIN = 1;
const SYNTH_VOLUME_RAMP_S = 0.02;
const NOTE_SPACING_TOLERANCE_S = 0.02;
const RAMP_TOLERANCE_S = 0.008;
const GAIN_EPSILON = 1e-6;

const SECTIONS = [
  ['Constants', [[1, 'Removed and new constants']]],
  ['Scale catalog', [
    [2, 'SCALE_OPTIONS has 146 options'],
    [3, 'First 11 option names (chromatic + 10 groups)'],
    [4, 'Locrian tonic names in key-signature order'],
    [5, 'searchScaleOptions (English letters, b/#)'],
    [6, 'minMaxInterval for chromatic / major / pentatonic group / all'],
  ]],
  ['Spelling in key', [[7, 'spellInKey (Si#3, Mi#4, Do♭5)']]],
  ['Exercise generator', [
    [8, 'generateExercise worked example (scripted rng)'],
    [9, 'Random group:major exercises fit their key, steps ≤ 2'],
  ]],
  ['Settings model and storage', [
    [10, 'normalizeSettings field-by-field validation'],
    [11, 'Storage adapter round-trip across a reload'],
    [12, 'Invalid stored JSON falls back to defaults'],
  ]],
  ['Synth volume and playback (app still works)', [
    [13, 'Start training plays a 5-note melody, 1 s per note, master 0.5'],
    [14, '?melody=71,71,71,71,71 completes with the fake mic'],
    [15, 'setVolume mid-melody ramps the master gain'],
  ]],
  ['Regression', [[16, 'lint, typecheck, unit tests, e2e']]],
];
const titleOf = (n) => SECTIONS.flatMap(([, items]) => items).find(([id]) => id === n)?.[1] ?? `Item ${n}`;

// ---------------------------------------------------------------- helpers -------------------------
const results = {}; // id → { status, detail, images: [rel], links: [[name, rel]] }
const record = (id, status, detail, { images = [], links = [] } = {}) => {
  results[id] = { status, detail, images, links };
  console.log(`[${status}] ${id}. ${titleOf(id)} — ${detail.split('\n')[0].slice(0, 200)}`);
};
const rel = (abs) => path.relative(ASSETS_DIR, abs).split(path.sep).join('/');
const stripAnsi = (s) => s.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, 'g'), '');
const approx = (a, b, tol) => typeof a === 'number' && Math.abs(a - b) <= tol;
const fmt = (v) => JSON.stringify(v, (_k, x) => (x === undefined ? '__undefined__' : x)).replaceAll('"__undefined__"', 'undefined');

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return deepEqual(ka, kb) && ka.every((k) => deepEqual(a[k], b[k]));
}

function writeJson(dir, name, data) {
  const file = path.resolve(dir, name);
  fs.writeFileSync(file, JSON.stringify(data, (_k, x) => (x === undefined ? 'undefined' : x), 2), 'utf8');
  return rel(file);
}

let shotCounter = 0;
async function shot(page, name) {
  shotCounter += 1;
  const file = path.resolve(SHOTS_DIR, `${String(shotCounter).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return rel(file);
}

/** Runs `body` (statements ending in `return …`) as an async IIFE in the page. */
const run = (page, body) => page.evaluate(`(async () => { ${body} })()`);

// ---------------------------------------------------------------- audio instrumentation -----------
/**
 * Installed before any page script. Logs Web Audio scheduling into window.__audioLog with node ids,
 * the owning gain node of every gain AudioParam, the connection graph and ctx.currentTime.
 */
function installAudioLog() {
  const log = [];
  window.__audioLog = log;
  const ids = new WeakMap();
  const paramOwner = new WeakMap();
  let nextId = 1;
  const idOf = (obj) => {
    if (!obj) return null;
    if (!ids.has(obj)) ids.set(obj, nextId++);
    return ids.get(obj);
  };
  const ctxTime = (node) => {
    try {
      return node?.context?.currentTime ?? null;
    } catch {
      return null;
    }
  };
  const now = () => performance.now();

  const wrapFactory = (name, type, paramName) => {
    const orig = BaseAudioContext.prototype[name];
    if (!orig) return;
    BaseAudioContext.prototype[name] = function (...args) {
      const node = orig.apply(this, args);
      const id = idOf(node);
      if (paramName) paramOwner.set(node[paramName], node);
      log.push({ t: 'create', type, node: id, ctx: this.currentTime, wall: now() });
      return node;
    };
  };
  wrapFactory('createGain', 'gain', 'gain');
  wrapFactory('createOscillator', 'oscillator', null);
  wrapFactory('createBiquadFilter', 'filter', null);

  const origConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    const destId = dest instanceof AudioDestinationNode ? 'destination' : dest instanceof AudioNode ? idOf(dest) : 'param';
    log.push({ t: 'connect', node: idOf(this), dest: destId, wall: now() });
    return origConnect.call(this, dest, ...rest);
  };

  for (const method of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues']) {
    const orig = AudioParam.prototype[method];
    AudioParam.prototype[method] = function (...args) {
      const owner = paramOwner.get(this);
      if (owner) log.push({ t: 'param', owner: idOf(owner), method, args, ctx: ctxTime(owner), wall: now() });
      return orig.apply(this, args);
    };
  }
  const valueDesc = Object.getOwnPropertyDescriptor(AudioParam.prototype, 'value');
  if (valueDesc?.set) {
    Object.defineProperty(AudioParam.prototype, 'value', {
      ...valueDesc,
      set(v) {
        const owner = paramOwner.get(this);
        if (owner) log.push({ t: 'param', owner: idOf(owner), method: 'value=', args: [v], ctx: ctxTime(owner), wall: now() });
        valueDesc.set.call(this, v);
      },
    });
  }

  for (const method of ['start', 'stop']) {
    const orig = AudioScheduledSourceNode.prototype[method];
    AudioScheduledSourceNode.prototype[method] = function (...args) {
      log.push({ t: method, node: idOf(this), when: args[0] ?? 0, freq: this.frequency?.value ?? null, ctx: ctxTime(this), wall: now() });
      return orig.apply(this, args);
    };
  }
}

/** Groups the log into playSequence calls: one master gain (connected to the destination) each. */
function analyzeSequences(log) {
  const edges = new Map();
  for (const e of log.filter((x) => x.t === 'connect')) {
    if (!edges.has(e.node)) edges.set(e.node, []);
    edges.get(e.node).push(e.dest);
  }
  const masters = new Set(log.filter((x) => x.t === 'connect' && x.dest === 'destination').map((x) => x.node));
  const findMaster = (start) => {
    const seen = new Set();
    const queue = [start];
    while (queue.length) {
      const n = queue.shift();
      if (masters.has(n)) return n;
      if (seen.has(n)) continue;
      seen.add(n);
      queue.push(...(edges.get(n) ?? []).filter((d) => typeof d === 'number'));
    }
    return null;
  };
  const sequences = new Map();
  const seqOf = (m) => {
    if (!sequences.has(m)) sequences.set(m, { master: m, starts: [], stops: [], masterEvents: [], envelopes: new Map() });
    return sequences.get(m);
  };
  for (const e of log) {
    if (e.t === 'start' || e.t === 'stop') {
      const m = findMaster(e.node);
      if (m == null) continue;
      const seq = seqOf(m);
      (e.t === 'start' ? seq.starts : seq.stops).push(e);
      if (e.t === 'start') {
        const env = (edges.get(e.node) ?? []).find((d) => typeof d === 'number');
        if (env != null) seq.envelopes.set(env, []);
      }
    }
  }
  for (const e of log.filter((x) => x.t === 'param')) {
    if (masters.has(e.owner)) seqOf(e.owner).masterEvents.push(e);
  }
  for (const seq of sequences.values()) {
    for (const e of log.filter((x) => x.t === 'param' && seq.envelopes.has(x.owner))) seq.envelopes.get(e.owner).push(e);
  }
  return [...sequences.values()].filter((s) => s.starts.length > 0);
}

const summarizeSequence = (seq) => ({
  master: seq.master,
  startTimes: seq.starts.map((s) => +s.when.toFixed(4)),
  frequenciesHz: seq.starts.map((s) => +(s.freq ?? 0).toFixed(2)),
  stopTimes: seq.stops.map((s) => +s.when.toFixed(4)),
  masterEvents: seq.masterEvents.map((e) => ({ method: e.method, args: e.args, ctx: e.ctx })),
  envelopeEvents: [...seq.envelopes.entries()].map(([id, evs]) => ({ envelope: id, events: evs.map((e) => [e.method, ...e.args]) })),
});

// ---------------------------------------------------------------- browser phase -------------------
async function browserPhase() {
  for (const dir of [SHOTS_DIR, API_DIR]) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browserIds = SECTIONS.flatMap(([, items]) => items.map(([id]) => id)).filter((id) => id <= 15);
  const failAll = (why) => {
    for (const id of browserIds) if (!results[id]) record(id, 'FAIL', why);
  };

  // Preconditions: the e2e-mode dev server and the WAV fixture.
  try {
    const res = await fetch(`${BASE}/`);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    failAll(`Dev server not reachable at ${BASE}/ (${err.message}). Start it with \`npm run dev:e2e\`.`);
    return;
  }
  let e2eMode = null;
  try {
    const src = await (await fetch(`${BASE}/src/testing/testMelody.ts`)).text();
    e2eMode = /"VITE_E2E"\s*:\s*"true"/.test(src);
  } catch {
    e2eMode = null;
  }
  if (!fs.existsSync(WAV_PATH)) {
    failAll(`Fake-mic fixture missing: ${WAV_PATH} (run \`npm run generate:tones\`).`);
    return;
  }

  const { chromium } = await import('@playwright/test');
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${WAV_PATH}`,
        '--autoplay-policy=no-user-gesture-required',
      ],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.grantPermissions(['microphone'], { origin: BASE });
    await context.addInitScript(installAudioLog);
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
    });

    await page.goto(`${BASE}/`);
    await page.getByRole('button', { name: 'Start training' }).waitFor({ timeout: 15_000 });
    await run(page, 'localStorage.clear(); return true;');

    await domainItems(page);
    await item13(page);
    await item14(page, e2eMode);
    await item15(page);

    if (consoleErrors.length) writeJson(API_DIR, '99-console-errors.json', consoleErrors);
  } catch (err) {
    failAll(`Browser phase aborted: ${err.stack ?? err}`);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

/** Items 1–12: the exact validation.md expressions, deep-compared with the expected values. */
async function domainItems(page) {
  const checks = [
    [1, '01-constants.json',
      "const c = await import('/src/config/constants.ts'); return [c.MELODY_LENGTH, c.NOTE_DURATION_MS, c.SYNTH_PEAK_GAIN, c.DEFAULT_NOTE_DURATION_MS, c.DEFAULT_VOLUME, c.DEFAULT_SCALE_ID];",
      [undefined, undefined, undefined, 1000, 0.5, 'major:do']],
    [2, '02-scale-options-length.json',
      "const s = await import('/src/music/scales.ts'); return s.SCALE_OPTIONS.length;",
      146],
    [3, '03-first-11-names.json',
      "const s = await import('/src/music/scales.ts'); return s.SCALE_OPTIONS.slice(0, 11).map(o => o.name);",
      ['Chromatic', 'All scales', 'All majors', 'All natural minors', 'All dorian', 'All phrygian', 'All lydian',
        'All mixolydian', 'All locrian', 'All major pentatonics', 'All minor pentatonics']],
    [4, '04-locrian-tonics.json',
      "const s = await import('/src/music/scales.ts'); return s.SPECIFIC_SCALES.filter(x => x.type === 'locrian').map(x => x.tonicName).join(' ');",
      'Si Fa# Do# Sol# Re# La# Mi# Si# Mi La Re Sol Do Fa Si♭'],
    [5, '05-search.json',
      "const s = await import('/src/music/scales.ts'); return [s.searchScaleOptions('bb major').map(o => o.name), s.searchScaleOptions('F# Dorian').map(o => o.name)];",
      [['Si♭ major', 'Si♭ major pentatonic'], ['Fa# dorian']]],
    [6, '06-min-max-interval.json',
      "const s = await import('/src/music/scales.ts'); return ['chromatic', 'major:do', 'group:major-pentatonic', 'group:all'].map(s.minMaxInterval);",
      [1, 2, 3, 3]],
    [7, '07-spell-in-key.json',
      "const sp = await import('/src/music/spelling.ts'); return [sp.spellInKey([60, 65, 61], 7), sp.spellInKey([66, 71, 70], -6)];",
      [['Si#3', 'Mi#4', 'Do#4'], ['Sol♭4', 'Do♭5', 'Si♭4']]],
    [8, '08-generate-exercise-worked-example.json',
      "const m = await import('/src/music/melody.ts'); const r = [0, 0.5, 0.99]; let i = 0; const ex = m.generateExercise(() => r[i++], { length: 3, maxInterval: 12, scaleId: 'major:do' }); return [ex.notes, ex.scale.id];",
      [[55, 62, 72], 'major:do']],
    [10, '10-normalize-settings.json',
      "const st = await import('/src/config/settings.ts'); return st.normalizeSettings({ noteDurationMs: 750, volume: 2, scaleId: 'major:fa' });",
      { noteDurationMs: 750, melodyLength: 5, volume: 0.5, maxInterval: 12, scaleId: 'major:fa' }],
  ];
  for (const [id, file, body, expected] of checks) {
    try {
      const actual = await run(page, body);
      const ok = deepEqual(actual, expected);
      const link = writeJson(API_DIR, file, { item: id, expression: body, expected, actual, match: ok });
      record(id, ok ? 'PASS' : 'FAIL', `${ok ? 'Got' : 'Expected ' + fmt(expected) + ', got'} \`${fmt(actual)}\``, { links: [[file, link]] });
    } catch (err) {
      record(id, 'FAIL', `Expression threw: ${err.message}`);
    }
  }

  // 9 — exact expression + a programmatic check of every exercise.
  try {
    const exact = await run(page,
      "const m = await import('/src/music/melody.ts'); const sp = await import('/src/music/spelling.ts'); return Array.from({ length: 5 }, () => m.generateExercise(Math.random, { length: 8, maxInterval: 2, scaleId: 'group:major' })).map(e => e.scale.id + ' ' + sp.spellExercise(e).join(' '));");
    const checked = await run(page, `
      const m = await import('/src/music/melody.ts');
      const sp = await import('/src/music/spelling.ts');
      const s = await import('/src/music/scales.ts');
      const out = [];
      for (let k = 0; k < 5; k += 1) {
        const e = m.generateExercise(Math.random, { length: 8, maxInterval: 2, scaleId: 'group:major' });
        const names = sp.spellExercise(e);
        const problems = [];
        if (e.scale === 'chromatic' || !e.scale.id.startsWith('major:')) problems.push('scale is not a major scale');
        if (e.notes.length !== 8 || names.length !== 8) problems.push('length != 8');
        const alters = e.scale === 'chromatic' ? [] : s.keySignatureAlters(e.scale.keySignature);
        e.notes.forEach((n, j) => {
          if (j > 0 && Math.abs(n - e.notes[j - 1]) > 2) problems.push('step > 2 at ' + j);
          if (e.scale !== 'chromatic' && !e.scale.pitchClasses.includes(n % 12)) problems.push('pitch class out of scale: ' + n);
          const mm = /^(Do|Re|Mi|Fa|Sol|La|Si)(#|♭)?(-?\\d+)$/.exec(names[j]);
          if (!mm) { problems.push('unparsable name ' + names[j]); return; }
          const letter = s.NOTE_LETTERS.indexOf(mm[1]);
          const alter = mm[2] === '#' ? 1 : mm[2] === '♭' ? -1 : 0;
          if (alters[letter] !== alter) problems.push('accidental of ' + names[j] + ' does not match key signature');
          if (s.LETTER_PITCH_CLASSES[letter] + alter + 12 * (Number(mm[3]) + 1) !== n) problems.push(names[j] + ' != MIDI ' + n);
        });
        out.push({ line: (e.scale === 'chromatic' ? 'chromatic' : e.scale.id) + ' ' + names.join(' '), notes: e.notes,
          keySignature: e.scale === 'chromatic' ? null : e.scale.keySignature, problems });
      }
      return out;`);
    const shapeOk = Array.isArray(exact) && exact.length === 5 &&
      exact.every((l) => /^major:\S+( \S+){8}$/.test(l));
    const problems = checked.flatMap((c, i) => c.problems.map((p) => `#${i + 1}: ${p}`));
    const ok = shapeOk && problems.length === 0;
    const linesFile = path.resolve(API_DIR, '09-group-major-melodies.txt');
    fs.writeFileSync(linesFile, ['# exact validation.md expression', ...exact, '', '# programmatically checked sample',
      ...checked.map((c) => `${c.line}   [notes ${c.notes.join(',')}; key signature ${c.keySignature}]`)].join('\n') + '\n', 'utf8');
    const link = writeJson(API_DIR, '09-group-major-check.json', { exact, checked });
    record(9, ok ? 'PASS' : 'FAIL',
      `${ok ? '' : `shapeOk=${shapeOk}; problems: ${problems.join('; ') || 'none'}. `}Exact expression: ${exact.map((l) => `\`${l}\``).join(', ')}. ` +
      `A second sample of 5 checked note by note: scale is major, 8 notes, pitch classes in the scale, |step| ≤ 2, ` +
      `every accidental matches keySignatureAlters and every name maps back to its MIDI number.`,
      { links: [['09-group-major-melodies.txt', rel(linesFile)], ['09-group-major-check.json', link]] });
  } catch (err) {
    record(9, 'FAIL', `Expression threw: ${err.message}`);
  }

  // 11 — save, reload, load in the reloaded page.
  try {
    await run(page,
      "const st = await import('/src/config/settings.ts'); const ss = await import('/src/config/settingsStorage.ts'); const ls = ss.getBrowserStorage(); ss.saveSettings(ls, { ...st.DEFAULT_SETTINGS, melodyLength: 7 }); ss.saveThreshold(ls, -35); return true;");
    await page.reload();
    await page.getByRole('button', { name: 'Start training' }).waitFor({ timeout: 15_000 });
    const raw = await run(page,
      "return [localStorage.getItem('trumpet-trainer.settings.v1'), localStorage.getItem('trumpet-trainer.thresholdDb')];");
    const actual = await run(page,
      "const ss2 = await import('/src/config/settingsStorage.ts'); return [ss2.loadSettings(localStorage).melodyLength, ss2.loadThreshold(localStorage)];");
    const ok = deepEqual(actual, [7, -35]);
    const link = writeJson(API_DIR, '11-storage-round-trip.json', { expected: [7, -35], actual, rawStoredAfterReload: raw });
    record(11, ok ? 'PASS' : 'FAIL', `After page.reload(): \`${fmt(actual)}\` (expected \`[7,-35]\`). Raw stored: \`${raw[0]}\`, \`${raw[1]}\`.`,
      { links: [['11-storage-round-trip.json', link]] });
  } catch (err) {
    record(11, 'FAIL', `Threw: ${err.message}`);
  }

  // 12 — invalid JSON → defaults, then localStorage.clear().
  try {
    const actual = await run(page,
      "localStorage.setItem('trumpet-trainer.settings.v1', '{not json'); const ss2 = await import('/src/config/settingsStorage.ts'); return ss2.loadSettings(localStorage);");
    const remaining = await run(page, 'localStorage.clear(); return localStorage.length;');
    const expected = { noteDurationMs: 1000, melodyLength: 5, volume: 0.5, maxInterval: 12, scaleId: 'major:do' };
    const ok = deepEqual(actual, expected) && remaining === 0;
    const link = writeJson(API_DIR, '12-invalid-json-defaults.json', { expected, actual, localStorageLengthAfterClear: remaining });
    record(12, ok ? 'PASS' : 'FAIL', `Returned \`${fmt(actual)}\` without throwing; localStorage cleared (length ${remaining}).`,
      { links: [['12-invalid-json-defaults.json', link]] });
  } catch (err) {
    record(12, 'FAIL', `Threw (must not): ${err.message}`);
    await run(page, 'localStorage.clear(); return true;').catch(() => undefined);
  }
}

const clearAudioLog = (page) => run(page, 'window.__audioLog.length = 0; return true;');
const readAudioLog = (page) => run(page, 'return JSON.parse(JSON.stringify(window.__audioLog));');

/** Item 13: Start training plays 5 notes 1 s apart at master gain 0.5 with envelope peak 1. */
async function item13(page) {
  const images = [];
  const links = [];
  try {
    await page.goto(`${BASE}/`);
    const start = page.getByRole('button', { name: 'Start training' });
    await start.waitFor({ timeout: 15_000 });
    images.push(await shot(page, 'home'));
    await clearAudioLog(page);
    await start.click();
    const status = page.getByTestId('training-status');
    await status.waitFor({ timeout: 10_000 });
    await page.waitForTimeout(1500);
    const statusPlaying = (await status.textContent())?.trim();
    const boxCount = await page.locator('[data-testid^="note-box-"]').count();
    images.push(await shot(page, 'chromatic-playing'));
    await page.waitForFunction(() => document.querySelector('[data-testid="training-status"]')?.textContent?.startsWith('Your turn'), null, { timeout: 15_000 });
    images.push(await shot(page, 'chromatic-listening'));
    const log = await readAudioLog(page);
    await page.getByRole('button', { name: 'Give up' }).click();
    await start.waitFor({ timeout: 10_000 });

    const sequences = analyzeSequences(log);
    links.push(['13-start-training-audio-log.json', writeJson(API_DIR, '13-start-training-audio-log.json',
      { sequences: sequences.map(summarizeSequence), rawLog: log })]);
    const seq = sequences.filter((s) => s.starts.length === 5).at(-1);
    const problems = [];
    if (statusPlaying !== 'Listen…') problems.push(`status while playing was "${statusPlaying}"`);
    if (boxCount !== 5) problems.push(`${boxCount} note boxes`);
    let summary = '';
    if (!seq) {
      problems.push(`no playSequence with 5 oscillator starts (sequences: ${sequences.map((s) => s.starts.length).join(', ') || 'none'})`);
    } else {
      const starts = seq.starts.map((s) => s.when);
      const spacing = starts.slice(1).map((t, i) => t - starts[i]);
      const durations = seq.starts.map((s, i) => (seq.stops[i]?.when ?? NaN) - s.when);
      if (!spacing.every((d) => approx(d, DEFAULT_NOTE_DURATION_S, NOTE_SPACING_TOLERANCE_S))) problems.push(`note spacing ${spacing.map((d) => d.toFixed(3))}`);
      if (!durations.every((d) => approx(d, DEFAULT_NOTE_DURATION_S, NOTE_SPACING_TOLERANCE_S))) problems.push(`note durations ${durations.map((d) => d.toFixed(3))}`);
      const initial = seq.masterEvents.find((e) => e.method === 'value=');
      if (!initial || !approx(initial.args[0], DEFAULT_VOLUME, GAIN_EPSILON)) problems.push(`master initial gain ${initial?.args[0]}`);
      const peaks = [...seq.envelopes.values()].map((evs) => Math.max(...evs.filter((e) => e.method !== 'cancelScheduledValues').map((e) => e.args[0])));
      if (peaks.length !== 5 || !peaks.every((p) => approx(p, SYNTH_ENVELOPE_PEAK_GAIN, GAIN_EPSILON))) problems.push(`envelope peaks ${peaks}`);
      summary = `Oscillator starts at ${starts.map((t) => t.toFixed(3)).join(', ')} s (spacing ${spacing.map((d) => d.toFixed(3)).join(', ')} s), ` +
        `note durations ${durations.map((d) => d.toFixed(3)).join(', ')} s, frequencies ${seq.starts.map((s) => s.freq?.toFixed(1)).join(', ')} Hz, ` +
        `master gain initial ${initial?.args[0]}, envelope peaks ${peaks.join(', ')}; ${sequences.length} playSequence call(s) logged ` +
        `(StrictMode may start and stop one extra), the last 5-note one is analysed.`;
    }
    record(13, problems.length ? 'FAIL' : 'PASS',
      `${problems.length ? `Problems: ${problems.join('; ')}. ` : ''}Status "${statusPlaying}", ${boxCount} note boxes. ${summary} ` +
      'Loudness vs v0.1.0 / no clicks or distortion: manual ear check.', { images, links });
  } catch (err) {
    record(13, 'FAIL', `Threw: ${err.message}`, { images, links });
  }
}

/** Item 14: ?melody=71×5 with the 440 Hz fake mic turns all boxes green (Si4) and returns Home. */
async function item14(page, e2eMode) {
  const images = [];
  try {
    await page.goto(`${BASE}/?melody=71,71,71,71,71`);
    const start = page.getByRole('button', { name: 'Start training' });
    await start.waitFor({ timeout: 15_000 });
    await start.click();
    await page.getByTestId('note-box-0').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(1500);
    images.push(await shot(page, 'si4-playing'));
    await page.waitForFunction(() => document.querySelector('[data-testid="training-status"]')?.textContent?.startsWith('Your turn'), null, { timeout: 15_000 });
    images.push(await shot(page, 'si4-listening'));
    await page.waitForFunction(() => document.querySelector('[data-testid="note-box-1"]')?.getAttribute('data-state') === 'done', null, { timeout: 15_000, polling: 50 });
    images.push(await shot(page, 'si4-progress'));
    let allDone = false;
    let names = [];
    try {
      names = await page.waitForFunction(() => {
        const boxes = [0, 1, 2, 3, 4].map((i) => document.querySelector(`[data-testid="note-box-${i}"]`));
        return boxes.every((b) => b?.getAttribute('data-state') === 'done') ? boxes.map((b) => b.textContent) : false;
      }, null, { timeout: 30_000, polling: 50 }).then((h) => h.jsonValue());
      allDone = true;
      images.push(await shot(page, 'si4-complete'));
    } catch {
      allDone = false;
    }
    const statusComplete = allDone ? await page.getByTestId('training-status').textContent().catch(() => null) : null;
    await start.waitFor({ timeout: 10_000 });
    images.push(await shot(page, 'si4-back-home'));
    const ok = allDone && names.length === 5 && names.every((n) => n === 'Si4');
    record(14, ok ? 'PASS' : 'FAIL',
      `${allDone ? `All 5 boxes data-state="done" with names ${names.join(', ')}; status "${statusComplete}"` : 'Not all 5 boxes reached data-state="done" within 30 s'}; ` +
      `then back on Home. Server e2e mode (VITE_E2E): ${e2eMode === null ? 'unknown' : e2eMode}. Real trumpet: manual.`, { images });
  } catch (err) {
    record(14, 'FAIL', `Threw: ${err.message}${e2eMode === false ? ' (the server on 5173 is NOT in e2e mode, ?melody= is ignored)' : ''}`, { images });
  }
}

/** Item 15: the exact expression; setVolume(1) at ~2 s ramps the master gain from 0.2 to 1 over 20 ms. */
async function item15(page) {
  const links = [];
  try {
    await page.goto(`${BASE}/`);
    await page.getByRole('button', { name: 'Start training' }).waitFor({ timeout: 15_000 });
    await page.mouse.click(10, 10);
    await clearAudioLog(page);
    const expression =
      "const sy = await import('/src/audio/synth.ts'); const { getAudioContext } = await import('/src/audio/audioContext.ts'); const p = sy.playSequence(getAudioContext(), [440, 494, 523, 587, 659], { noteDurationMs: 1000, volume: 0.2 }); setTimeout(() => p.setVolume(1), 2000)";
    await run(page, `${expression}; window.__validationPlayback = p; return true;`);
    const ctxState = await run(page, "const { getAudioContext } = await import('/src/audio/audioContext.ts'); return getAudioContext().state;");
    await page.waitForTimeout(2600);
    const log = await readAudioLog(page);
    const sequences = analyzeSequences(log);
    const seq = sequences.at(-1);
    const problems = [];
    let detail = '';
    if (!seq) {
      problems.push('no playSequence logged');
    } else {
      const initial = seq.masterEvents.find((e) => e.method === 'value=');
      if (!initial || !approx(initial.args[0], 0.2, GAIN_EPSILON)) problems.push(`master initial gain ${initial?.args[0]}`);
      const ramp = seq.masterEvents.find((e) => (e.method === 'linearRampToValueAtTime' || e.method === 'setTargetAtTime') && approx(e.args[0], 1, GAIN_EPSILON));
      const t0 = seq.starts[0]?.ctx;
      if (!ramp) {
        problems.push('no ramp to 1 on the master gain');
      } else {
        const rampLen = ramp.method === 'linearRampToValueAtTime' ? ramp.args[1] - ramp.ctx : ramp.args[2];
        const at = ramp.ctx - t0;
        const pin = seq.masterEvents.find((e) => e.method === 'setValueAtTime' && e.ctx === ramp.ctx);
        const cancel = seq.masterEvents.find((e) => e.method === 'cancelScheduledValues' && e.ctx === ramp.ctx);
        if (!approx(rampLen, SYNTH_VOLUME_RAMP_S, RAMP_TOLERANCE_S)) problems.push(`ramp length ${rampLen}`);
        if (!(at > 1.8 && at < 2.6)) problems.push(`ramp issued ${at.toFixed(3)} s after playback start`);
        if (!pin) problems.push('no setValueAtTime pinning the current value before the ramp');
        detail = `${ramp.method}(1) issued ${at.toFixed(3)} s after playSequence (ctx ${ramp.ctx.toFixed(3)} s), ramp length ` +
          `${(rampLen * 1000).toFixed(1)} ms (expected ${SYNTH_VOLUME_RAMP_S * 1000} ms), preceded by ` +
          `${cancel ? 'cancelScheduledValues + ' : ''}setValueAtTime(${pin?.args[0]?.toFixed?.(3)}); master initial gain ${initial?.args[0]}; ` +
          `note starts ${seq.starts.map((s) => s.when.toFixed(3)).join(', ')} s.`;
      }
    }
    if (ctxState !== 'running') problems.push(`AudioContext state "${ctxState}"`);
    links.push(['15-set-volume-audio-log.json', writeJson(API_DIR, '15-set-volume-audio-log.json',
      { expression, ctxState, sequences: sequences.map(summarizeSequence), rawLog: log })]);
    await page.waitForTimeout(3000); // let the melody finish before closing the browser
    record(15, problems.length ? 'FAIL' : 'PASS',
      `${problems.length ? `Problems: ${problems.join('; ')}. ` : ''}AudioContext "${ctxState}". ${detail} Audible smoothness (no click): manual.`, { links });
  } catch (err) {
    record(15, 'FAIL', `Threw: ${err.message}`, { links });
  }
}

// ---------------------------------------------------------------- report phase --------------------
function readText(file) {
  try {
    return stripAnsi(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function regressionItem() {
  if (!fs.existsSync(REGRESSION_STATUS)) {
    record(16, 'SKIP', 'No regression status (run `bash specs/in-app-configuration/validation-run-1/run.sh` to run lint, typecheck, npm test and test:e2e).');
    return;
  }
  const status = JSON.parse(fs.readFileSync(REGRESSION_STATUS, 'utf8'));
  const commands = [['lint', 'npm run lint', '16-lint.txt'], ['typecheck', 'npm run typecheck', '16-typecheck.txt'],
    ['test', 'npm test', '16-unit-tests.txt'], ['e2e', 'npm run test:e2e', '16-e2e.txt']];
  const links = [];
  const parts = [];
  const notes = [];
  let ok = true;
  for (const [key, label, file] of commands) {
    const code = status[key];
    const abs = path.resolve(OUT_DIR, file);
    if (fs.existsSync(abs)) links.push([file, rel(abs)]);
    if (code !== 0) ok = false;
    parts.push(`\`${label}\` exit ${code ?? 'n/a'}`);
  }
  const unit = readText(path.resolve(OUT_DIR, '16-unit-tests.txt')) ?? '';
  const unitPassed = Number(/Tests\s+(?:\d+\s+failed\s+\|\s+)?(\d+)\s+passed/.exec(unit)?.[1] ?? NaN);
  const unitFailed = Number(/Tests\s+(\d+)\s+failed/.exec(unit)?.[1] ?? 0);
  const unitFiles = /Test Files\s+([^\n]+)/.exec(unit)?.[1]?.trim();
  const e2e = readText(path.resolve(OUT_DIR, '16-e2e.txt')) ?? '';
  const e2ePassed = Number(/(\d+)\s+passed/.exec(e2e)?.[1] ?? NaN);
  const e2eFailed = Number(/(\d+)\s+failed/.exec(e2e)?.[1] ?? 0);
  if (unitFailed > 0 || e2eFailed > 0) ok = false;
  if (unitPassed !== EXPECTED_UNIT_TESTS) notes.push(`unit test count ${unitPassed} differs from the expected ${EXPECTED_UNIT_TESTS}`);
  if (e2ePassed !== EXPECTED_E2E_TESTS) notes.push(`e2e count ${e2ePassed} differs from the expected ${EXPECTED_E2E_TESTS}`);
  if (status.port5173FreeBeforeE2e === false) notes.push('port 5173 was still in use before test:e2e (Playwright reused that server)');
  if (status.note) notes.push(status.note);
  record(16, ok ? 'PASS' : 'FAIL',
    `${parts.join(', ')}. Unit tests: ${unitPassed} passed, ${unitFailed} failed (files: ${unitFiles ?? 'n/a'}). ` +
    `E2E: ${e2ePassed} passed, ${e2eFailed} failed.${notes.length ? ` Note: ${notes.join('; ')}.` : ''}`, { links });
}

function gitInfo() {
  const g = (args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' }).stdout?.trim() || '?';
  return `${g(['rev-parse', '--abbrev-ref', 'HEAD'])} @ ${g(['rev-parse', '--short', 'HEAD'])}`;
}

function writeReport() {
  const all = SECTIONS.flatMap(([, items]) => items.map(([id]) => id));
  for (const id of all) if (!results[id]) results[id] = { status: 'SKIP', detail: 'Not run (browser phase results missing).', images: [], links: [] };
  const count = (s) => all.filter((id) => results[id].status === s).length;
  const icon = { PASS: '✅', FAIL: '❌', SKIP: '⏭️' };
  const lines = [
    '# Validation Report — Run 1',
    '',
    `**Date:** ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC  `,
    `**Branch:** ${gitInfo()}  `,
    '**Checklist:** [validation.md](../validation.md) (in-app configuration, Part 1 / prd.md)  ',
    '**Scripts:** `specs/in-app-configuration/validation-run-1/run.sh` + `validate.mjs` (Playwright Chromium, fake mic = 440 Hz tone, dev server in e2e mode)',
    '',
    `**Summary:** ${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped`,
    '',
  ];
  for (const [section, items] of SECTIONS) {
    lines.push(`## ${section}`, '');
    for (const [id, title] of items) {
      const r = results[id];
      lines.push(`- ${icon[r.status]} **${id}. ${title}** — ${r.detail}`);
      if (r.links.length) lines.push(`  Evidence: ${r.links.map(([name, href]) => `[${name}](${href})`).join(', ')}`);
      for (const img of r.images) lines.push('', `  ![${path.basename(img, '.png')}](${img})`);
      lines.push('');
    }
  }
  lines.push(
    '## Manual follow-up',
    '',
    'These need a human with speakers (and, for the last one, a trumpet); the script only verifies the scheduling behind them:',
    '',
    '- **13 — Loudness:** the melody is noticeably louder than the v0.1.0 MVP (master 0.5 × envelope peak 1 vs 1 × 0.25).',
    '- **13 — No clicks or distortion** at note starts/ends with the higher envelope peak.',
    '- **15 — Smooth volume jump:** from ~2 s the volume rises mid-melody without an audible click (20 ms master ramp).',
    '- **14 — Real trumpet:** playing written Si4 (concert A4) in tune and holding it turns each box green, as in the MVP.',
    '',
  );
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
  console.log(`\nReport: ${REPORT_PATH}`);
  console.log(`**Summary:** ${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped`);
  return count('FAIL') === 0 && count('SKIP') === 0;
}

// ---------------------------------------------------------------- main ----------------------------
const args = process.argv.slice(2);
const doBrowser = args.includes('--browser') || !args.includes('--report');
const doReport = args.includes('--report') || !args.includes('--browser');

fs.mkdirSync(OUT_DIR, { recursive: true });
if (doBrowser) {
  await browserPhase();
  fs.writeFileSync(BROWSER_RESULTS, JSON.stringify(results, null, 2), 'utf8');
}
if (doReport) {
  if (!doBrowser && fs.existsSync(BROWSER_RESULTS)) Object.assign(results, JSON.parse(fs.readFileSync(BROWSER_RESULTS, 'utf8')));
  regressionItem();
  process.exit(writeReport() ? 0 : 1);
}
process.exit(0);
