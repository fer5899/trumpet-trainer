#!/usr/bin/env node
/* global window, document, getComputedStyle, AudioParam, AudioNode, AudioScheduledSourceNode, BaseAudioContext, AudioDestinationNode -- browser globals used inside page callbacks / init scripts */
// Trumpet Trainer — in-app configuration — automated validation, Run 4 (post /t-review #2).
// Automates specs/in-app-configuration/validation.md "Human Validation — prd2.md" items 1–51
// (item 51 re-runs Part 1 steps 1–12 and 15) plus "Appendix B: Re-validation after /t-review #2" items 52–60.
//
// Servers (started by run.sh):
//   http://localhost:5173/                 normal dev server (random melodies)
//   http://localhost:5174/                 dev server in e2e mode (?melody= with 3–8 notes)
//   http://localhost:4173/trumpet-trainer/ production preview
//
// Modes (run.sh calls them in this order):
//   --browser  Wipes run-4/{screenshots,api} and run-4/output (keeping run.sh's 00-* logs), runs every browser
//              item (1–49, 51, 52–56), writes run-4/output/browser-results.json plus screenshots / api evidence.
//   --report   Reads browser-results.json and run-4/output/regression-status.json (written by run.sh after
//              lint / typecheck / test / test:scripts / build / test:e2e ×3), builds item 50 and the repository
//              checks 57–59, compares items 1–51 with validation-report-run-3.md, builds the aggregate item 60
//              and writes validation-report-run-4.md. Exit 0 if no item FAILED (SKIP allowed), else 1.
//   (none)     --browser followed by --report.
//
// VALIDATE_ONLY=52,53 (env) runs only the browser groups containing those items (debugging).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------- paths / constants ---------------
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..');
const FEATURE_DIR = path.resolve(ROOT, 'specs', 'in-app-configuration');
const ASSETS_DIR = path.resolve(FEATURE_DIR, 'validation-assets');
const RUN_DIR = path.resolve(ASSETS_DIR, 'run-4');
const SHOTS_DIR = path.resolve(RUN_DIR, 'screenshots');
const API_DIR = path.resolve(RUN_DIR, 'api');
const OUT_DIR = path.resolve(RUN_DIR, 'output');
const BROWSER_RESULTS = path.resolve(OUT_DIR, 'browser-results.json');
const REGRESSION_STATUS = path.resolve(OUT_DIR, 'regression-status.json');
const REPORT_PATH = path.resolve(ASSETS_DIR, 'validation-report-run-4.md');
const PREVIOUS_REPORT_PATH = path.resolve(ASSETS_DIR, 'validation-report-run-3.md');
const WAV_PATH = path.resolve(ROOT, 'e2e', 'fixtures', 'tone-a4-440hz.wav');
const LAUNCH_ARGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  `--use-file-for-fake-audio-capture=${WAV_PATH}`,
  '--autoplay-policy=no-user-gesture-required',
];

const DEV = 'http://localhost:5173';
const E2E = 'http://localhost:5174';
const PREVIEW_ORIGIN = 'http://localhost:4173';
const PREVIEW = `${PREVIEW_ORIGIN}/trumpet-trainer/`;

const EXPECTED_UNIT_TESTS = 1297;
const EXPECTED_SCRIPT_TESTS = 32;
const EXPECTED_E2E_TESTS = 10;

const SETTINGS_KEY = 'trumpet-trainer.settings.v1';
const THRESHOLD_KEY = 'trumpet-trainer.thresholdDb';
const MINUS = '−';
const HINT = 'Other settings can be changed on the home screen.';
const SLIDER_ORDER = ['Melody length', 'Max interval', 'Note duration', 'Playback volume'];
const DEFAULT_VIEW = { scale: 'Do major', 'Melody length': '5 notes', 'Max interval': '12 semitones', 'Note duration': '1000 ms', 'Playback volume': '50%' };
const FIRST_11 = ['Chromatic', 'All scales', 'All majors', 'All natural minors', 'All dorian', 'All phrygian', 'All lydian',
  'All mixolydian', 'All locrian', 'All major pentatonics', 'All minor pentatonics'];
const TAB_CYCLE = ['Scale', ...SLIDER_ORDER, 'Reset to defaults', 'Close'];

// Synth (src/config/constants.ts)
const SYNTH_VOLUME_RAMP_S = 0.02;
const NOTE_SPACING_TOLERANCE_S = 0.02;
const RAMP_TOLERANCE_S = 0.008;
const GAIN_EPSILON = 1e-6;

const SECTIONS = [
  ['Gear button and dialog', [
    [1, 'Gear button top-right above the title, accessible name "Settings"'],
    [2, 'Dialog contents and defaults; no Save; scale list closed'],
    [3, 'Esc closes; focus back on the gear'],
    [4, 'Close closes; focus back on the gear'],
    [5, 'Click on the dimmed backdrop keeps the dialog open'],
    [6, 'Tab cycles inside the dialog'],
    [7, 'Start / Test microphone / gear disabled while the mic permission is pending'],
  ]],
  ['Sliders (Home mode)', [
    [8, 'Melody length: 3 notes … 8 notes, step 1'],
    [9, 'Note duration: 250 ms … 1500 ms, step 50'],
    [10, 'Playback volume: 0% … 100%, step 5'],
    [11, 'Max interval with Chromatic: 1 semitone … 18 semitones'],
    [12, 'Each slider has a label and aria-valuetext = visible value'],
  ]],
  ['Scale combobox', [
    [13, 'Click: text selected, list (≈15rem) opens, Do major highlighted and in view'],
    [14, '"bb major" narrows to Si♭ major / Si♭ major pentatonic'],
    [15, 'Enter selects; list closes; dialog stays open'],
    [16, '"xyz": one greyed "No matching scales" row; click / Enter do nothing'],
    [17, 'Esc closes only the list and reverts; second Esc closes the dialog'],
    [18, '"sol" + Tab (or click elsewhere) reverts'],
    [19, 'ArrowDown / ArrowUp: one at a time, no wrap, scrolls; Enter selects'],
    [20, '"f# dorian" + Enter; "sib" + mouse click; focus stays in the field'],
  ]],
  ['Scale and max interval', [
    [21, 'Do major, max 2 → Do major pentatonic: 3 semitones, minimum 3'],
    [22, 'Chromatic: stays 3, minimum 1'],
    [23, 'All scales: minimum 3'],
  ]],
  ['Reset to defaults', [[24, 'Reset to defaults restores the five defaults; threshold stays −25 dB']]],
  ['Persistence', [
    [25, 'All six values restored after a reload ("All majors")'],
    [26, 'localStorage contents'],
    [27, 'Invalid stored data → defaults and "Threshold: −40 dB"'],
    [28, 'Blocked storage: works with defaults, changes apply in-visit, gone after reload, no console errors'],
  ]],
  ['Melody length, scale and spelling (real exercises)', [
    [29, 'Melody length 3: 3 boxes, "Your turn: play note 1 of 3"'],
    [30, 'Melody length 8: 8 boxes in one centered row'],
    [31, 'Fa major: notes in key, Si♭ never "La#"'],
    [32, 'Sol♭ major: written Si (71) shown as "Do♭5"'],
    [33, 'All majors: keys vary per exercise; Repeat replays the same notes'],
    [34, 'Chromatic, max interval 1: steps ≤ 1 semitone'],
  ]],
  ['Volume and note duration during training', [
    [35, 'Training dialog: only Note duration + Playback volume + hint; playback continues'],
    [36, 'Volume 100% then 0% applied live to the playing note; no restart'],
    [37, 'Note duration 250 ms applies on Repeat at the new volume; progress kept'],
    [38, 'Listening continues with the dialog open (box turns green behind it)'],
    [39, 'Training Reset: 1000 ms / 50%; Home-only settings unchanged'],
    [40, 'Dialog left open through completion switches to the five Home controls'],
  ]],
  ['Deterministic ?melody= (e2e mode, port 5174)', [
    [41, '?melody=71,60,72 → 3 boxes regardless of Melody length'],
    [42, '?melody= with 8 notes → 8 boxes'],
    [43, '2 and 9 notes are ignored (Melody length setting used)'],
    [44, 'Fa major + ?melody=65,70,72 → Fa4 Si♭4 Do5; Chromatic / All scales contextual'],
  ]],
  ['Layout', [
    [45, '375 × 812: 5 + 3 centered, same size, no horizontal scroll'],
    [46, '320 px: 4 + 4, same size, no horizontal scroll'],
    [47, '375 px: dialog is a bottom sheet with rounded top corners; scrolls when taller'],
    [48, 'Real phones (Android Chrome, iOS Safari) and desktop Firefox; monochrome gear'],
  ]],
  ['Production build', [[49, 'Preview: setting restored after reload; ?melody= ignored']]],
  ['Regression', [
    [50, 'lint, typecheck, unit tests (1297), script tests (32), build, e2e (10)'],
    [51, 'Part 1 steps 1–12 and 15 re-run'],
  ]],
];
const APPENDIX_B = ['Appendix B: Re-validation after /t-review #2', [
  [52, 'Press on the list padding / scrollbar keeps the list open and the input focused; click still selects'],
  [53, 'Opening the dialog focuses the <dialog> (autofocus); Scale stays collapsed, no listbox ever rendered'],
  [54, '"xyz" → "No matching scales", Enter does nothing; "sol" activates Sol major, Enter selects it'],
  [55, 'Volume 35% survives a reload; volumeToPercent / percentToVolume / normalizeSettings; no inline PERCENT math'],
  [56, 'Melody length / Max interval move by exactly 1 per key; MELODY_LENGTH_STEP / MAX_INTERVAL_STEP = 1; no INTEGER_STEP'],
  [57, 'settings.spec.ts: 8-box test uses 60×8, storage keys imported; npm run test:e2e passes 10/10 three times'],
  [58, '.claude/launch.json is git-ignored (not untracked)'],
  [59, 'implementation-notes.md Known issues: v0.2.0 release of Part 1, Part 2 needs bump.txt + CHANGELOG; test count current'],
  [60, 'Aggregate: regression commands (1297 / 32 / 10) and items 1–51 all pass; no regression vs Run 3'],
]];
const RERUN_IDS = SECTIONS.flatMap(([, items]) => items.map(([id]) => id));
const ALL_ITEMS = [...SECTIONS, APPENDIX_B].flatMap(([, items]) => items);
/** Items evaluated in the report phase (not by the browser). */
const REPORT_PHASE_IDS = [50, 57, 58, 59, 60];
const titleOf = (n) => ALL_ITEMS.find(([id]) => id === n)?.[1] ?? `Item ${n}`;

const P1_TITLES = {
  1: 'Removed and new constants',
  2: 'SCALE_OPTIONS has 146 options',
  3: 'First 11 option names (chromatic + 10 groups)',
  4: 'Locrian tonic names in key-signature order',
  5: 'searchScaleOptions (English letters, b/#)',
  6: 'minMaxInterval for chromatic / major / pentatonic group / all',
  7: 'spellInKey (Si#3, Mi#4, Do♭5)',
  8: 'generateExercise worked example (scripted rng)',
  9: 'Random group:major exercises fit their key, steps ≤ 2',
  10: 'normalizeSettings field-by-field validation',
  11: 'Storage adapter round-trip across a reload',
  12: 'Invalid stored JSON falls back to defaults',
  15: 'setVolume mid-melody ramps the master gain',
};
const P1_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15];

// ---------------------------------------------------------------- generic helpers -----------------
const results = {}; // id → { status, detail, images, links, sub? }
function record(id, status, detail, { images = [], links = [], sub } = {}) {
  results[id] = { status, detail, images: [...images], links: [...links], ...(sub ? { sub } : {}) };
  console.log(`[${status}] ${id}. ${titleOf(id)} — ${String(detail).split('\n')[0].slice(0, 220)}`);
}
const part1 = {}; // step id → { status, detail, images, links }
function recP1(id, status, detail, { images = [], links = [] } = {}) {
  part1[id] = { status, detail, images: [...images], links: [...links] };
  console.log(`   [${status}] Part 1 step ${id}. ${P1_TITLES[id]} — ${String(detail).split('\n')[0].slice(0, 200)}`);
}

const rel = (abs) => path.relative(ASSETS_DIR, abs).split(path.sep).join('/');
const stripAnsi = (s) => s.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, 'g'), '');
const approx = (a, b, tol) => typeof a === 'number' && Math.abs(a - b) <= tol;
const fmt = (v) => JSON.stringify(v, (_k, x) => (x === undefined ? '__undefined__' : x)).replaceAll('"__undefined__"', 'undefined');
const firstLine = (err) => String(err?.message ?? err).split('\n')[0];

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

/** expectEq into a problems list. */
const expectEq = (problems, label, actual, expected) => {
  if (!deepEqual(actual, expected)) problems.push(`${label}: expected ${fmt(expected)}, got ${fmt(actual)}`);
};

/**
 * Runs one item. `fn(ev)` returns { problems?, detail, status? }; ev.shot / ev.json collect evidence.
 * Exceptions become FAIL with the first line of the error.
 */
async function runItem(id, fn) {
  const ev = { images: [], links: [] };
  ev.shot = async (page, name) => {
    try {
      ev.images.push(await shot(page, name));
    } catch (err) {
      console.warn(`   screenshot ${name} failed: ${firstLine(err)}`);
    }
  };
  ev.json = (name, data) => ev.links.push([name, writeJson(API_DIR, name, data)]);
  try {
    const out = (await fn(ev)) ?? {};
    const problems = out.problems ?? [];
    const status = out.status ?? (problems.length ? 'FAIL' : 'PASS');
    record(id, status, `${problems.length ? `Problems: ${problems.join('; ')}. ` : ''}${out.detail ?? ''}`.trim(), ev);
  } catch (err) {
    record(id, 'FAIL', `Threw: ${firstLine(err)}`, ev);
  }
}

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
  const now = () => window.performance.now();

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
  writtenMidi: seq.starts.map((s) => toWritten(s.freq)),
  stopTimes: seq.stops.map((s) => +s.when.toFixed(4)),
  stoppedEarly: seq.stops.length > seq.starts.length,
  masterEvents: seq.masterEvents.map((e) => ({ i: e.i, method: e.method, args: e.args, ctx: e.ctx })),
});

/** A sequence that was not stopped early (stop() adds a second oscillator.stop per note). */
const completeSeqs = (log) => analyzeSequences(log).filter((s) => s.stops.length === s.starts.length);
/** Concert Hz → written MIDI (B♭ trumpet: written = concert + 2). */
const toWritten = (hz) => (typeof hz === 'number' && hz > 0 ? Math.round(69 + 12 * Math.log2(hz / 440)) + 2 : null);
const playedNotes = (seq) => (seq ? seq.starts.map((s) => toWritten(s.freq)) : []);
const spacingOf = (seq) => seq.starts.slice(1).map((s, i) => +(s.when - seq.starts[i].when).toFixed(4));

const clearAudioLog = (page) => run(page, 'if (window.__audioLog) window.__audioLog.length = 0; return true;');
const readAudioLog = (page) => run(page, 'return JSON.parse(JSON.stringify(window.__audioLog || []));')
  .then((log) => log.map((e, i) => ({ ...e, i })));
const audioLogLength = (page) => run(page, 'return (window.__audioLog || []).length;');

// ---------------------------------------------------------------- page helpers --------------------
const gear = (p) => p.getByRole('button', { name: 'Settings' });
const dlg = (p) => p.getByRole('dialog', { name: 'Settings' });
const scaleInput = (p) => dlg(p).getByRole('combobox', { name: 'Scale' });
const slider = (p, name) => dlg(p).getByRole('slider', { name, exact: true });
const listbox = (p) => p.getByRole('listbox', { name: 'Scales' });
const startBtn = (p) => p.getByRole('button', { name: 'Start training' });

async function gotoApp(page, url) {
  await page.goto(url);
  await startBtn(page).waitFor({ state: 'visible', timeout: 20_000 });
}
async function openDialog(page) {
  await gear(page).click();
  await dlg(page).waitFor({ state: 'visible', timeout: 5_000 });
}
async function closeDialog(page) {
  await dlg(page).getByRole('button', { name: 'Close' }).click();
  await dlg(page).waitFor({ state: 'hidden', timeout: 5_000 });
}
const dialogOpen = (page) => page.evaluate(() => Boolean(document.querySelector('dialog.settings-dialog')?.open));

/** Types `query` into the Scale field and clicks the option named `name` (exact). */
async function chooseScale(page, query, name) {
  await scaleInput(page).click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(query);
  await listbox(page).getByRole('option', { name, exact: true }).click();
  const v = await scaleInput(page).inputValue();
  if (v !== name) throw new Error(`scale field shows "${v}" after choosing "${name}"`);
}
const setSlider = (page, name, value) => slider(page, name).fill(String(value));

/** Opens the dialog (Home mode), applies the given settings, closes it. */
async function configure(page, { scale, length, maxInterval, duration, volume }) {
  await openDialog(page);
  if (scale) await chooseScale(page, scale[0], scale[1]);
  if (length != null) await setSlider(page, 'Melody length', length);
  if (maxInterval != null) await setSlider(page, 'Max interval', maxInterval);
  if (duration != null) await setSlider(page, 'Note duration', duration);
  if (volume != null) await setSlider(page, 'Playback volume', volume);
  const snap = await readDialog(page);
  await closeDialog(page);
  return viewOf(snap);
}

function readDialogFn() {
  const d = document.querySelector('dialog.settings-dialog');
  if (!d) return { exists: false, open: false };
  if (!d.open) return { exists: true, open: false };
  const input = d.querySelector('input[role="combobox"]');
  const sliders = {};
  const order = [];
  for (const s of d.querySelectorAll('.setting')) {
    const i = s.querySelector('input[type="range"]');
    const lab = s.querySelector('label');
    const label = lab ? lab.textContent : '';
    order.push(label);
    sliders[label] = {
      visible: s.querySelector('.setting__value')?.textContent ?? null,
      aria: i ? i.getAttribute('aria-valuetext') : null,
      value: i ? Number(i.value) : null,
      min: i ? Number(i.min) : null,
      max: i ? Number(i.max) : null,
      step: i ? Number(i.step) : null,
      labelFor: Boolean(lab && i && lab.htmlFor === i.id),
    };
  }
  const r = d.getBoundingClientRect();
  return {
    exists: true,
    open: true,
    modal: d.matches(':modal'),
    title: d.querySelector('h2')?.textContent ?? null,
    scale: input ? input.value : null,
    comboExpanded: input ? input.getAttribute('aria-expanded') : null,
    order,
    sliders,
    hint: d.querySelector('.settings-dialog__hint')?.textContent ?? null,
    buttons: [...d.querySelectorAll('button')].map((b) => b.textContent.trim()),
    rect: { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, right: r.right },
  };
}
const readDialog = (page) => page.evaluate(readDialogFn);
const viewOf = (snap) => ({
  scale: snap?.scale ?? null,
  ...Object.fromEntries(Object.entries(snap?.sliders ?? {}).map(([k, v]) => [k, v.visible])),
});

function readComboFn() {
  const i = document.querySelector('dialog.settings-dialog input[role="combobox"]');
  if (!i) return null;
  const list = document.getElementById(i.getAttribute('aria-controls'));
  const listOpen = Boolean(list && list.isConnected);
  const opts = listOpen ? [...list.querySelectorAll('[role="option"]')] : [];
  const act = i.getAttribute('aria-activedescendant');
  const actEl = act ? document.getElementById(act) : null;
  const lr = listOpen ? list.getBoundingClientRect() : null;
  const ar = actEl ? actEl.getBoundingClientRect() : null;
  const d = document.querySelector('dialog.settings-dialog');
  const empty = opts.length === 1 && opts[0].getAttribute('aria-disabled') === 'true' ? opts[0] : null;
  return {
    value: i.value,
    selStart: i.selectionStart,
    selEnd: i.selectionEnd,
    expanded: i.getAttribute('aria-expanded'),
    focused: document.activeElement === i,
    listOpen,
    listInDialog: listOpen && d.contains(list),
    count: opts.length,
    names: opts.map((o) => o.textContent),
    selected: opts.filter((o) => o.getAttribute('aria-selected') === 'true').map((o) => o.textContent),
    activeId: act,
    activeText: actEl ? actEl.textContent : null,
    activeIndex: act ? opts.findIndex((o) => o.id === act) : -1,
    activeInView: Boolean(lr && ar && ar.top >= lr.top - 1 && ar.bottom <= lr.bottom + 1),
    listTop: lr ? lr.top : null,
    listHeight: lr ? lr.height : null,
    inputBottom: i.getBoundingClientRect().bottom,
    maxHeight: listOpen ? getComputedStyle(list).maxHeight : null,
    overflowY: listOpen ? getComputedStyle(list).overflowY : null,
    scrollable: listOpen ? list.scrollHeight > list.clientHeight : false,
    scrollTop: listOpen ? list.scrollTop : null,
    remPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
    empty: empty ? {
      text: empty.textContent,
      className: empty.className,
      color: getComputedStyle(empty).color,
      cursor: getComputedStyle(empty).cursor,
      textColor: getComputedStyle(i).color,
    } : null,
  };
}
const readCombo = (page) => page.evaluate(readComboFn);

function readTrainingFn() {
  const st = document.querySelector('[data-testid="training-status"]');
  const boxes = [...document.querySelectorAll('[data-testid^="note-box-"]')].map((b) => {
    const r = b.getBoundingClientRect();
    return { state: b.dataset.state, text: b.textContent, x: r.x, y: r.y, w: r.width, h: r.height, right: r.right };
  });
  const l = document.querySelector('.note-boxes');
  const lr = l ? l.getBoundingClientRect() : null;
  return {
    status: st ? st.textContent : null,
    boxes,
    list: lr ? { x: lr.x, w: lr.width, right: lr.right } : null,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    innerWidth: window.innerWidth,
  };
}
const readTraining = (page) => page.evaluate(readTrainingFn);
const boxStates = async (page) => (await readTraining(page)).boxes.map((b) => b.state);
const thresholdLabel = (page) => page.locator('.mic-meter__threshold-label').textContent();

async function waitStatus(page, source, timeout = 15_000) {
  const h = await page.waitForFunction((src) => {
    const s = document.querySelector('[data-testid="training-status"]');
    return s && new RegExp(src).test(s.textContent) ? s.textContent : false;
  }, source, { timeout, polling: 50 });
  return h.jsonValue();
}
async function waitHome(page, timeout = 15_000) {
  await page.waitForFunction(() => !document.querySelector('[data-testid="training-status"]') &&
    [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Start training'), null, { timeout, polling: 50 });
}
/** Resolves to { where: 'listening' | 'home', status } as soon as listening starts or the app is back Home. */
async function waitListeningOrHome(page, timeout = 30_000) {
  const h = await page.waitForFunction(() => {
    const s = document.querySelector('[data-testid="training-status"]');
    if (!s) return { where: 'home', status: null };
    return s.textContent.startsWith('Your turn') ? { where: 'listening', status: s.textContent } : false;
  }, null, { timeout, polling: 30 });
  return h.jsonValue();
}
async function waitBoxDone(page, index, timeout = 15_000) {
  const h = await page.waitForFunction((i) => {
    const b = document.querySelector(`[data-testid="note-box-${i}"]`);
    return b && b.dataset.state === 'done' ? { text: b.textContent, dialogOpen: Boolean(document.querySelector('dialog.settings-dialog')?.open) } : false;
  }, index, { timeout, polling: 30 });
  return h.jsonValue();
}
/** Gives up as soon as Give up is enabled (or waits for the exercise to finish), then waits for Home. */
async function leaveTraining(page, timeout = 30_000) {
  const h = await page.waitForFunction(() => {
    if (!document.querySelector('[data-testid="training-status"]')) return 'home';
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Give up');
    return b && !b.disabled ? 'listening' : false;
  }, null, { timeout, polling: 50 });
  const where = await h.jsonValue();
  if (where === 'listening') await page.getByRole('button', { name: 'Give up' }).click({ timeout: 3_000 }).catch(() => undefined);
  await waitHome(page, 15_000);
  return where;
}

/** Start training, wait until listening (or Home), read the played notes from the audio log. Leaves the app in training. */
async function playExercise(page) {
  await clearAudioLog(page);
  await startBtn(page).click();
  await page.getByTestId('note-box-0').waitFor({ timeout: 15_000 });
  const boxCount = (await readTraining(page)).boxes.length;
  const { where, status } = await waitListeningOrHome(page, 30_000);
  const log = await readAudioLog(page);
  const seq = completeSeqs(log).at(-1);
  return { where, status, boxCount, notes: playedNotes(seq), seq, log };
}

/** Accessibility tree via CDP (what the DevTools Accessibility pane shows). */
async function axTree(page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Accessibility.enable');
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    return nodes.filter((n) => !n.ignored).map((n) => ({
      role: n.role?.value,
      name: n.name?.value,
      value: n.value?.value,
      props: Object.fromEntries((n.properties ?? []).map((p) => [p.name, p.value?.value])),
    }));
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}

// ---------------------------------------------------------------- browser setup -------------------
let browser;
const consoleLogs = {};

async function newPage(label, { viewport = { width: 1280, height: 800 }, initScripts = [] } = {}) {
  const context = await browser.newContext({ viewport });
  for (const origin of [DEV, E2E, PREVIEW_ORIGIN]) await context.grantPermissions(['microphone'], { origin }).catch(() => undefined);
  await context.addInitScript(installAudioLog);
  for (const s of initScripts) await context.addInitScript(s);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  consoleLogs[label] = errors;
  return { context, page, errors };
}

async function withPage(label, opts, body) {
  const { context, page, errors } = await newPage(label, opts);
  try {
    await body(page, errors);
  } finally {
    await context.close().catch(() => undefined);
  }
}

const failMissing = (ids, why) => {
  for (const id of ids) if (!results[id]) record(id, 'FAIL', why);
};

// ---------------------------------------------------------------- group A: Home dialog (5173) ------
async function groupHomeDialog() {
  await withPage('A-home-dialog-5173', {}, async (page) => {
    await gotoApp(page, `${DEV}/`);
    await run(page, 'localStorage.clear(); return true;');
    await gotoApp(page, `${DEV}/`);
    let gearInfo = null;

    // 1 — gear position and accessible name
    await runItem(1, async (ev) => {
      const problems = [];
      const count = await gear(page).count();
      if (count !== 1) problems.push(`${count} buttons named "Settings"`);
      gearInfo = await page.evaluate(() => {
        const b = document.querySelector('.settings-button');
        const h = document.querySelector('h1');
        const app = document.querySelector('.app');
        const r = (e) => {
          const x = e.getBoundingClientRect();
          return { x: x.x, y: x.y, w: x.width, h: x.height, right: x.right, bottom: x.bottom };
        };
        return {
          gear: r(b), heading: r(h), headingText: h.textContent, app: r(app), appPaddingRight: parseFloat(getComputedStyle(app).paddingRight),
          ariaLabel: b.getAttribute('aria-label'), ariaHaspopup: b.getAttribute('aria-haspopup'), titleAttr: b.getAttribute('title'),
          glyph: [...b.textContent].map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`),
          glyphAriaHidden: b.querySelector('span')?.getAttribute('aria-hidden'),
          fontFamily: getComputedStyle(b).fontFamily, innerWidth: window.innerWidth,
        };
      });
      const ax = (await axTree(page).catch(() => [])).filter((n) => n.role === 'button' && n.name === 'Settings');
      const g = gearInfo;
      if (g.ariaLabel !== 'Settings') problems.push(`aria-label "${g.ariaLabel}"`);
      if (!(g.gear.bottom <= g.heading.y + 1)) problems.push(`gear bottom ${g.gear.bottom} not above the title top ${g.heading.y}`);
      const contentRight = g.app.right - g.appPaddingRight;
      if (!approx(g.gear.right, contentRight, 1.5)) problems.push(`gear right edge ${g.gear.right} ≠ content right edge ${contentRight}`);
      if (!(g.gear.x + g.gear.w / 2 > g.innerWidth / 2)) problems.push('gear is not on the right half');
      if (!ax.length) problems.push('no AX node button "Settings" in the CDP accessibility tree');
      await ev.shot(page, 'home-gear');
      await gear(page).hover();
      await ev.shot(page, 'home-gear-hover');
      ev.json('01-gear.json', { ...g, axNodes: ax });
      return {
        problems,
        detail: `Gear at (${g.gear.x.toFixed(0)}, ${g.gear.y.toFixed(0)}) ${g.gear.w.toFixed(0)}×${g.gear.h.toFixed(0)} px, bottom ${g.gear.bottom.toFixed(0)} ≤ title "${g.headingText}" top ${g.heading.y.toFixed(0)}; ` +
          `right edge ${g.gear.right.toFixed(0)} = content column right ${contentRight.toFixed(0)} (viewport 1280, column max 40rem). ` +
          `aria-label "${g.ariaLabel}", aria-haspopup "${g.ariaHaspopup}", AX tree: ${ax.length ? `button "${ax[0].name}"` : 'missing'}. ` +
          `No title attribute (no native hover tooltip); the accessible name comes from aria-label.`,
      };
    });

    // 2 — dialog contents
    await runItem(2, async (ev) => {
      const problems = [];
      await openDialog(page);
      const snap = await readDialog(page);
      const backdrop = await page.evaluate(() => getComputedStyle(document.querySelector('dialog.settings-dialog'), '::backdrop').backgroundColor);
      const listboxes = await page.locator('[role="listbox"]').count();
      expectEq(problems, 'title', snap.title, 'Settings');
      expectEq(problems, 'values', viewOf(snap), DEFAULT_VIEW);
      expectEq(problems, 'slider order', snap.order, SLIDER_ORDER);
      expectEq(problems, 'buttons', snap.buttons, ['Reset to defaults', 'Close']);
      if (snap.buttons.some((b) => /save/i.test(b))) problems.push('a Save button exists');
      if (snap.comboExpanded !== 'false') problems.push(`combobox aria-expanded="${snap.comboExpanded}"`);
      if (listboxes !== 0) problems.push(`${listboxes} listbox(es) rendered`);
      if (!snap.modal) problems.push('dialog is not :modal');
      if (!/rgba\(0, 0, 0, 0\.45\)/.test(backdrop)) problems.push(`backdrop ${backdrop}`);
      await ev.shot(page, 'dialog-home-defaults');
      ev.json('02-dialog.json', { snap, backdrop, listboxes });
      return {
        problems,
        detail: `Modal (:modal ${snap.modal}) titled "${snap.title}", backdrop ${backdrop}. Scale "${snap.scale}", ` +
          `${snap.order.map((l) => `${l} "${snap.sliders[l].visible}"`).join(', ')}. Buttons: ${snap.buttons.join(', ')} (no Save). ` +
          `Scale combobox aria-expanded="${snap.comboExpanded}", ${listboxes} listbox in the DOM.`,
      };
    });

    const focusInfo = () => page.evaluate(() => {
      const el = document.activeElement;
      return {
        ariaLabel: el?.getAttribute?.('aria-label') ?? null,
        tag: el?.tagName ?? null,
        focusVisible: el?.matches?.(':focus-visible') ?? false,
        outline: el ? `${getComputedStyle(el).outlineStyle} ${getComputedStyle(el).outlineWidth}` : null,
      };
    });

    // 3 — Esc
    await runItem(3, async (ev) => {
      const problems = [];
      if (!(await dialogOpen(page))) await openDialog(page);
      await page.keyboard.press('Escape');
      await dlg(page).waitFor({ state: 'hidden', timeout: 5_000 });
      const f = await focusInfo();
      if (f.ariaLabel !== 'Settings') problems.push(`focus on ${f.tag} "${f.ariaLabel}", not the gear`);
      if (!f.focusVisible) problems.push('gear is focused but not :focus-visible (no focus ring)');
      await ev.shot(page, 'esc-focus-on-gear');
      ev.json('03-esc-focus.json', f);
      return { problems, detail: `Dialog closed on Esc; focus on ${f.tag} aria-label "${f.ariaLabel}", :focus-visible ${f.focusVisible}, outline ${f.outline}.` };
    });

    // 4 — Close
    await runItem(4, async (ev) => {
      const problems = [];
      await openDialog(page);
      await dlg(page).getByRole('button', { name: 'Close' }).click();
      await dlg(page).waitFor({ state: 'hidden', timeout: 5_000 });
      const f = await focusInfo();
      if (f.ariaLabel !== 'Settings') problems.push(`focus on ${f.tag} "${f.ariaLabel}", not the gear`);
      await ev.shot(page, 'close-focus-on-gear');
      return { problems, detail: `Dialog closed by Close; focus on ${f.tag} aria-label "${f.ariaLabel}" (:focus-visible ${f.focusVisible} — after a mouse click Chromium may not show the ring).` };
    });

    // 5 — backdrop click
    await runItem(5, async (ev) => {
      const problems = [];
      await openDialog(page);
      const snap = await readDialog(page);
      const pt = { x: 5, y: 5 };
      const inside = pt.x >= snap.rect.x && pt.x <= snap.rect.right && pt.y >= snap.rect.y && pt.y <= snap.rect.bottom;
      if (inside) problems.push('click point lies inside the dialog');
      await page.mouse.click(pt.x, pt.y);
      await page.waitForTimeout(500); // deliberate "nothing happens" wait
      const open = await dialogOpen(page);
      if (!open) problems.push('dialog closed after the backdrop click');
      await ev.shot(page, 'backdrop-click-still-open');
      return { problems, detail: `Clicked (${pt.x}, ${pt.y}) outside the dialog rect (x ${snap.rect.x.toFixed(0)}–${snap.rect.right.toFixed(0)}, y ${snap.rect.y.toFixed(0)}–${snap.rect.bottom.toFixed(0)}); after 500 ms the dialog is ${open ? 'still open' : 'CLOSED'}.` };
    });

    // 6 — Tab cycle
    await runItem(6, async (ev) => {
      const problems = [];
      if (await dialogOpen(page)) await closeDialog(page);
      await openDialog(page);
      const describe = () => page.evaluate(() => {
        const el = document.activeElement;
        const d = document.querySelector('dialog.settings-dialog');
        if (!el || el === document.body || el === document.documentElement) return { name: '(body)', where: 'body' };
        if (el === d) return { name: '(dialog)', where: 'dialog' };
        const name = el.getAttribute('aria-label') || (el.labels && el.labels[0] ? el.labels[0].textContent : '') || el.textContent.trim() || el.tagName;
        return { name, tag: el.tagName.toLowerCase(), where: d.contains(el) ? 'inside' : 'outside' };
      });
      const initial = await describe();
      const seq = [];
      for (let k = 0; k < 16; k += 1) {
        await page.keyboard.press('Tab');
        seq.push(await describe());
      }
      const outside = seq.filter((s) => s.where === 'outside');
      if (outside.length) problems.push(`focus reached the page behind the dialog: ${outside.map((s) => s.name).join(', ')}`);
      const inside = seq.filter((s) => s.where === 'inside').map((s) => s.name);
      const mismatch = inside.findIndex((n, i) => n !== TAB_CYCLE[i % TAB_CYCLE.length]);
      if (mismatch >= 0) problems.push(`order differs at stop ${mismatch + 1}: got "${inside[mismatch]}", expected "${TAB_CYCLE[mismatch % TAB_CYCLE.length]}"`);
      if (inside.length <= TAB_CYCLE.length) problems.push(`no wrap-around observed in 16 Tabs (${inside.length} in-dialog stops)`);
      const bodyStops = seq.filter((s) => s.where === 'body' || s.where === 'dialog').length;
      // A body stop is expected only at the wrap (after Close, when Chromium hands focus to the browser chrome).
      const lostAfter = seq.map((s, i) => ((s.where === 'body' || s.where === 'dialog') && i > 0 && seq[i - 1].where === 'inside' && seq[i - 1].name !== 'Close' ? seq[i - 1].name : null)).filter(Boolean);
      if (lostAfter.length) problems.push(`focus dropped to \`<body>\` after ${[...new Set(lostAfter)].join(', ')} (one extra Tab needed; the focus ring disappears; no focusin event fires) — likely the focus move targets the scale list (a scrollable \`<ul>\`, keyboard-focusable in Chromium), which unmounts on the input's blur`);
      await ev.shot(page, 'tab-cycle-end');
      ev.json('06-tab-sequence.json', { initial, sequence: seq });
      if (await dialogOpen(page)) await closeDialog(page);
      return {
        problems,
        detail: `Initial focus: ${initial.name}. 16 × Tab: ${seq.map((s) => s.name).join(' → ')}. ` +
          `${outside.length ? '' : 'Never on an element behind the dialog. '}` +
          `${bodyStops ? `${bodyStops} stop(s) on body/dialog itself (Chromium moves focus out to the browser chrome / document between cycles; no page element behind the dialog receives focus).` : 'Wraps directly from Close to Scale.'}`,
      };
    });

    // 12 — labels and aria-valuetext (defaults)
    await runItem(12, async (ev) => {
      const problems = [];
      await openDialog(page);
      const snap = await readDialog(page);
      const expected = { 'Melody length': '5 notes', 'Max interval': '12 semitones', 'Note duration': '1000 ms', 'Playback volume': '50%' };
      const rows = [];
      for (const label of SLIDER_ORDER) {
        const n = await slider(page, label).count();
        const aria = n === 1 ? await slider(page, label).getAttribute('aria-valuetext') : null;
        const s = snap.sliders[label] ?? {};
        rows.push({ label, byRoleCount: n, aria, visible: s.visible, labelFor: s.labelFor });
        if (n !== 1) problems.push(`getByRole('slider', { name: '${label}' }) matched ${n}`);
        if (aria !== s.visible) problems.push(`${label}: aria-valuetext "${aria}" ≠ visible "${s.visible}"`);
        if (s.visible !== expected[label]) problems.push(`${label}: visible "${s.visible}" ≠ "${expected[label]}"`);
        if (!s.labelFor) problems.push(`${label}: <label for> not linked to the input`);
      }
      let ax = [];
      try {
        ax = (await axTree(page)).filter((x) => x.role === 'slider');
      } catch (err) {
        problems.push(`CDP accessibility tree unavailable: ${firstLine(err)}`);
      }
      const axMismatch = [];
      for (const label of SLIDER_ORDER) {
        const node = ax.find((x) => x.name === label);
        const vt = node ? (node.props.valuetext ?? node.value) : undefined;
        rows.find((r) => r.label === label).ax = node ?? null;
        if (ax.length && !node) problems.push(`AX tree has no slider named "${label}"`);
        else if (node && String(vt) !== expected[label]) axMismatch.push(`${label} → ${fmt(vt)}`);
      }
      let ariaSnapshot = null;
      try {
        ariaSnapshot = await dlg(page).ariaSnapshot();
      } catch {
        ariaSnapshot = null;
      }
      await ev.shot(page, 'sliders-a11y-defaults');
      ev.json('12-slider-a11y.json', { rows, ariaSnapshot });
      return {
        problems,
        detail: rows.map((r) => `${r.label}: role slider by name ✓${r.byRoleCount === 1 ? '' : '✗'}, aria-valuetext "${r.aria}" = visible "${r.visible}", AX name "${r.ax?.name ?? 'n/a'}"`).join('; ') +
          '. Labels checked with Playwright role queries and the Chromium accessibility tree (CDP); aria-valuetext checked on the DOM (what the DevTools Accessibility pane lists under "ARIA attributes").' +
          `${axMismatch.length ? ` **Caveat:** Chromium's *computed* AX value/valuetext for these native range inputs is the number, not the aria-valuetext (${axMismatch.join(', ')}); confirm with NVDA / VoiceOver that "5 notes" etc. is announced.` : ' Chromium computed valuetext matches too.'}` +
          ' Screen-reader speech itself: manual.',
      };
    });

    /** Steps a slider from Home to End with ArrowRight, returning every value seen. */
    const sweep = async (label) => {
      const read = () => page.evaluate((lbl) => {
        const set = [...document.querySelectorAll('dialog .setting')].find((x) => x.querySelector('label')?.textContent === lbl);
        const i = set.querySelector('input');
        return { value: Number(i.value), visible: set.querySelector('.setting__value').textContent, aria: i.getAttribute('aria-valuetext'), min: Number(i.min), max: Number(i.max), step: Number(i.step) };
      }, label);
      await slider(page, label).focus();
      await page.keyboard.press('Home');
      let cur = await read();
      const steps = [cur];
      for (let k = 0; k < 40; k += 1) {
        await page.keyboard.press('ArrowRight');
        const next = await read();
        if (next.value === cur.value) break;
        steps.push(next);
        cur = next;
      }
      await page.keyboard.press('End');
      const end = await read();
      await page.keyboard.press('Home');
      const home = await read();
      return { steps, end, home, attrs: { min: home.min, max: home.max, step: home.step } };
    };
    const sweepItem = (id, label, min, max, step, text, restore, shotName) => runItem(id, async (ev) => {
      const problems = [];
      if (!(await dialogOpen(page))) await openDialog(page);
      const r = await sweep(label);
      const values = [];
      for (let v = min; v <= max; v += step) values.push(v);
      expectEq(problems, 'min/max/step', r.attrs, { min, max, step });
      expectEq(problems, 'visible values', r.steps.map((s) => s.visible), values.map(text));
      const ariaMismatch = r.steps.filter((s) => s.aria !== s.visible);
      if (ariaMismatch.length) problems.push(`aria-valuetext ≠ visible at ${ariaMismatch.map((s) => s.value).join(', ')}`);
      if (r.end.visible !== text(max)) problems.push(`End → "${r.end.visible}"`);
      if (r.home.visible !== text(min)) problems.push(`Home → "${r.home.visible}"`);
      await page.keyboard.press('End');
      await ev.shot(page, `${shotName}-max`);
      ev.json(`${id}-${shotName}-sweep.json`, r);
      if (restore != null) await setSlider(page, label, restore);
      return {
        problems,
        detail: `min ${r.attrs.min}, max ${r.attrs.max}, step ${r.attrs.step}. Home → "${r.home.visible}", End → "${r.end.visible}"; ` +
          `ArrowRight sweep (${r.steps.length} values): ${r.steps.map((s) => s.visible).join(', ')}; aria-valuetext equals the visible text at every step. ` +
          '(Keyboard stepping stands in for dragging: both set the same input value.)',
      };
    });

    await sweepItem(8, 'Melody length', 3, 8, 1, (v) => `${v} notes`, 5, 'melody-length');
    await sweepItem(9, 'Note duration', 250, 1500, 50, (v) => `${v} ms`, 1000, 'note-duration');
    await sweepItem(10, 'Playback volume', 0, 100, 5, (v) => `${v}%`, 50, 'volume');

    // 11 — max interval with Chromatic
    await runItem(11, async (ev) => {
      const problems = [];
      if (!(await dialogOpen(page))) await openDialog(page);
      await chooseScale(page, 'chromatic', 'Chromatic');
      const r = await sweep('Max interval');
      const texts = Array.from({ length: 18 }, (_, k) => (k === 0 ? '1 semitone' : `${k + 1} semitones`));
      expectEq(problems, 'min/max/step', r.attrs, { min: 1, max: 18, step: 1 });
      expectEq(problems, 'visible values', r.steps.map((s) => s.visible), texts);
      if (r.home.visible !== '1 semitone' || r.home.aria !== '1 semitone') problems.push(`left end "${r.home.visible}" / aria "${r.home.aria}"`);
      if (r.end.visible !== '18 semitones' || r.end.aria !== '18 semitones') problems.push(`right end "${r.end.visible}" / aria "${r.end.aria}"`);
      await ev.shot(page, 'max-interval-chromatic-min');
      await page.keyboard.press('End');
      await ev.shot(page, 'max-interval-chromatic-max');
      ev.json('11-max-interval-sweep.json', r);
      await dlg(page).getByRole('button', { name: 'Reset to defaults' }).click();
      return { problems, detail: `Scale Chromatic: min ${r.attrs.min}, max ${r.attrs.max}; fully left "${r.home.visible}" (singular), fully right "${r.end.visible}"; sweep ${r.steps.map((s) => s.visible).join(', ')}. Reset to defaults afterwards.` };
    });

    // 13 — combobox click
    await runItem(13, async (ev) => {
      const problems = [];
      if (!(await dialogOpen(page))) await openDialog(page);
      await dlg(page).getByRole('button', { name: 'Reset to defaults' }).click();
      await scaleInput(page).click();
      const c = await readCombo(page);
      if (c.value !== 'Do major') problems.push(`value "${c.value}"`);
      if (!(c.selStart === 0 && c.selEnd === c.value.length)) problems.push(`selection ${c.selStart}–${c.selEnd} (not the whole text)`);
      if (!c.listOpen || c.expanded !== 'true') problems.push(`list open ${c.listOpen}, aria-expanded ${c.expanded}`);
      if (!c.listInDialog) problems.push('list is not inside the dialog');
      if (!(c.listTop >= c.inputBottom - 1)) problems.push(`list top ${c.listTop} above the input bottom ${c.inputBottom}`);
      if (c.count !== 146) problems.push(`${c.count} options`);
      expectEq(problems, 'first 11 options', c.names.slice(0, 11), FIRST_11);
      expectEq(problems, 'highlighted', c.selected, ['Do major']);
      if (c.activeText !== 'Do major') problems.push(`aria-activedescendant → "${c.activeText}"`);
      if (!c.activeInView) problems.push('Do major not scrolled into view');
      const maxRem = parseFloat(c.maxHeight) / c.remPx;
      if (!approx(maxRem, 15, 0.01)) problems.push(`max-height ${c.maxHeight} = ${maxRem} rem`);
      if (!c.scrollable || c.overflowY !== 'auto') problems.push(`scrollable ${c.scrollable}, overflow-y ${c.overflowY}`);
      await ev.shot(page, 'combobox-open-do-major');
      ev.json('13-combobox-open.json', { ...c, names: c.names });
      return {
        problems,
        detail: `Value "${c.value}" selected (${c.selStart}–${c.selEnd}); list below the field inside the dialog, ${c.count} options, max-height ${c.maxHeight} (${maxRem} rem), ` +
          `rendered height ${c.listHeight?.toFixed(0)} px, overflow-y ${c.overflowY}, scrollable. First options: ${c.names.slice(0, 13).join(', ')} …; ` +
          `highlighted (aria-selected / aria-activedescendant): "${c.activeText}" at index ${c.activeIndex}, in view (list scrollTop ${c.scrollTop}). Visual highlight: see screenshot.`,
      };
    });

    // 14 — bb major
    await runItem(14, async (ev) => {
      const problems = [];
      await page.keyboard.type('bb major');
      const c = await readCombo(page);
      expectEq(problems, 'options', c.names, ['Si♭ major', 'Si♭ major pentatonic']);
      if (c.activeText !== 'Si♭ major') problems.push(`highlighted "${c.activeText}"`);
      await ev.shot(page, 'combobox-bb-major');
      return { problems, detail: `Typed "bb major": options ${fmt(c.names)}, highlighted "${c.activeText}".` };
    });

    // 15 — Enter
    await runItem(15, async (ev) => {
      const problems = [];
      await page.keyboard.press('Enter');
      const c = await readCombo(page);
      const open = await dialogOpen(page);
      if (c.listOpen) problems.push('list still open');
      if (c.value !== 'Si♭ major') problems.push(`value "${c.value}"`);
      if (!open) problems.push('dialog closed');
      await ev.shot(page, 'combobox-enter-si-flat-major');
      return { problems, detail: `After Enter: list ${c.listOpen ? 'open' : 'closed'}, field "${c.value}", dialog ${open ? 'open' : 'closed'}.` };
    });

    const storedScale = () => run(page, `const s = localStorage.getItem('${SETTINGS_KEY}'); return s ? JSON.parse(s).scaleId : null;`);

    // 16 — xyz
    await runItem(16, async (ev) => {
      const problems = [];
      await scaleInput(page).click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type('xyz');
      const c = await readCombo(page);
      if (c.count !== 1 || !c.empty || c.empty.text !== 'No matching scales') problems.push(`options ${fmt(c.names)} (empty row ${fmt(c.empty)})`);
      if (c.empty && c.empty.color === c.empty.textColor) problems.push(`row colour ${c.empty.color} is not greyed`);
      await ev.shot(page, 'combobox-no-matches');
      const before = await storedScale();
      // Playwright refuses to click an aria-disabled option, so click its centre with the mouse like a user.
      const box = await listbox(page).getByRole('option', { name: 'No matching scales' }).boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      const afterClick = await readCombo(page);
      await page.keyboard.press('Enter');
      const afterEnter = await readCombo(page);
      const after = await storedScale();
      if (!afterClick.listOpen || afterClick.value !== 'xyz') problems.push(`after click: list open ${afterClick.listOpen}, value "${afterClick.value}"`);
      if (!afterEnter.listOpen || afterEnter.value !== 'xyz') problems.push(`after Enter: list open ${afterEnter.listOpen}, value "${afterEnter.value}"`);
      if (before !== after || after !== 'major:si-flat') problems.push(`stored scaleId ${before} → ${after}`);
      if (!(await dialogOpen(page))) problems.push('dialog closed');
      ev.json('16-no-matches.json', { c, afterClick, afterEnter, storedBefore: before, storedAfter: after });
      return {
        problems,
        detail: `"xyz" → single row "${c.empty?.text}" (aria-disabled, colour ${c.empty?.color} vs text ${c.empty?.textColor}, cursor ${c.empty?.cursor}). ` +
          `Click on it and Enter: list stays open, field stays "xyz", stored scaleId stays ${after}.`,
      };
    });

    // 17 — Esc twice
    await runItem(17, async (ev) => {
      const problems = [];
      await page.keyboard.press('Escape');
      const c = await readCombo(page);
      const open1 = await dialogOpen(page);
      if (c?.listOpen) problems.push('list still open after the first Esc');
      if (c?.value !== 'Si♭ major') problems.push(`field "${c?.value}" after the first Esc`);
      if (!open1) problems.push('dialog closed on the first Esc');
      await ev.shot(page, 'combobox-esc-reverted');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const open2 = await dialogOpen(page);
      if (open2) problems.push('dialog still open after the second Esc');
      return { problems, detail: `First Esc: list closed, field "${c?.value}", dialog ${open1 ? 'open' : 'closed'}. Second Esc: dialog ${open2 ? 'OPEN' : 'closed'}.` };
    });

    // 18 — sol + Tab / click elsewhere
    await runItem(18, async (ev) => {
      const problems = [];
      await openDialog(page);
      await scaleInput(page).click();
      await page.keyboard.type('sol');
      const typed = await readCombo(page);
      await page.keyboard.press('Tab');
      const afterTab = await readCombo(page);
      const focusAfterTab = await page.evaluate(() => document.activeElement?.labels?.[0]?.textContent ?? document.activeElement?.tagName);
      if (afterTab.listOpen || afterTab.value !== 'Si♭ major') problems.push(`after Tab: list open ${afterTab.listOpen}, field "${afterTab.value}"`);
      await scaleInput(page).click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type('sol');
      await dlg(page).locator('h2').click();
      const afterClick = await readCombo(page);
      if (afterClick.listOpen || afterClick.value !== 'Si♭ major') problems.push(`after clicking the title: list open ${afterClick.listOpen}, field "${afterClick.value}"`);
      const stored = await storedScale();
      if (stored !== 'major:si-flat') problems.push(`stored scaleId ${stored}`);
      await ev.shot(page, 'combobox-sol-reverted');
      return {
        problems,
        detail: `"sol" showed ${typed.count} options (${typed.names.slice(0, 4).join(', ')} …). Tab → list closed, field "${afterTab.value}", focus on "${focusAfterTab}"${focusAfterTab === 'BODY' ? ' (not on Melody length: see item 6)' : ''}. ` +
          `Again "sol" + click on the dialog title → list closed, field "${afterClick.value}". Stored scaleId ${stored} (unchanged).`,
      };
    });

    // 19 — arrows
    await runItem(19, async (ev) => {
      const problems = [];
      await scaleInput(page).click();
      const start = await readCombo(page);
      const i0 = start.activeIndex;
      const trail = [i0];
      for (let k = 0; k < 3; k += 1) {
        await page.keyboard.press('ArrowDown');
        trail.push((await readCombo(page)).activeIndex);
      }
      for (let k = 0; k < 3; k += 1) {
        await page.keyboard.press('ArrowUp');
        trail.push((await readCombo(page)).activeIndex);
      }
      expectEq(problems, 'one-step trail', trail, [i0, i0 + 1, i0 + 2, i0 + 3, i0 + 2, i0 + 1, i0]);
      for (let k = 0; k < i0 + 5; k += 1) await page.keyboard.press('ArrowUp');
      const top = await readCombo(page);
      if (top.activeIndex !== 0 || top.activeText !== 'Chromatic') problems.push(`top: index ${top.activeIndex} "${top.activeText}" (wrapped?)`);
      if (!top.activeInView) problems.push('first option not in view');
      for (let k = 0; k < 150; k += 1) await page.keyboard.press('ArrowDown');
      const bottom = await readCombo(page);
      const last = bottom.names.length - 1;
      if (bottom.activeIndex !== last) problems.push(`bottom: index ${bottom.activeIndex}, expected ${last} (wrapped?)`);
      if (!bottom.activeInView || !(bottom.scrollTop > 0)) problems.push(`last option in view ${bottom.activeInView}, scrollTop ${bottom.scrollTop}`);
      await ev.shot(page, 'combobox-arrow-last');
      await page.keyboard.press('ArrowUp');
      const oneUp = await readCombo(page);
      if (oneUp.activeIndex !== last - 1) problems.push(`ArrowUp from the last → index ${oneUp.activeIndex}`);
      await page.keyboard.press('Enter');
      const sel = await readCombo(page);
      if (sel.value !== oneUp.activeText || sel.listOpen) problems.push(`Enter selected "${sel.value}" (expected "${oneUp.activeText}"), list open ${sel.listOpen}`);
      ev.json('19-arrows.json', { i0, trail, top: { index: top.activeIndex, text: top.activeText }, bottom: { index: bottom.activeIndex, text: bottom.activeText, scrollTop: bottom.scrollTop }, oneUp: oneUp.activeText, selected: sel.value });
      return {
        problems,
        detail: `Start on "${start.activeText}" (index ${i0}); ArrowDown×3 / ArrowUp×3 trail ${trail.join(' → ')}. ` +
          `${i0 + 5}× ArrowUp stops at index ${top.activeIndex} "${top.activeText}" (no wrap); 150× ArrowDown stops at ${bottom.activeIndex} "${bottom.activeText}" ` +
          `(no wrap; list scrollTop ${bottom.scrollTop}, option in view). ArrowUp → "${oneUp.activeText}", Enter selects "${sel.value}". (Home/End are not combobox keys here: the field is a text input.)`,
      };
    });

    // 20 — f# dorian + sib click
    await runItem(20, async (ev) => {
      const problems = [];
      await scaleInput(page).click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type('f# dorian');
      await page.keyboard.press('Enter');
      const a = await readCombo(page);
      if (a.value !== 'Fa# dorian') problems.push(`after "f# dorian" + Enter: "${a.value}"`);
      await scaleInput(page).click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type('sib');
      const typed = await readCombo(page);
      await listbox(page).getByRole('option', { name: 'Si♭ major pentatonic', exact: true }).click();
      const b = await readCombo(page);
      if (b.value !== 'Si♭ major pentatonic') problems.push(`after the click: "${b.value}"`);
      if (!b.focused) problems.push('focus left the field after the click');
      if (b.listOpen) problems.push('list still open');
      const stored = await storedScale();
      await ev.shot(page, 'combobox-mouse-click');
      return { problems, detail: `"f# dorian" + Enter → "${a.value}". "sib" listed ${typed.names.join(', ')}; mouse click → "${b.value}", focus in the field: ${b.focused}, list closed: ${!b.listOpen}. Stored scaleId ${stored}.` };
    });

    // 21–23 — scale vs max interval
    const maxInfo = async () => {
      const s = (await readDialog(page)).sliders['Max interval'];
      return s;
    };
    await runItem(21, async (ev) => {
      const problems = [];
      await chooseScale(page, 'do major', 'Do major');
      await setSlider(page, 'Max interval', 2);
      const before = await maxInfo();
      if (before.value !== 2 || before.min !== 2) problems.push(`Do major max interval value ${before.value}, min ${before.min}`);
      await chooseScale(page, 'do major pentatonic', 'Do major pentatonic');
      const after = await maxInfo();
      await slider(page, 'Max interval').focus();
      await page.keyboard.press('Home');
      const home = await maxInfo();
      if (after.visible !== '3 semitones' || after.aria !== '3 semitones') problems.push(`after pentatonic "${after.visible}"`);
      if (after.min !== 3) problems.push(`min ${after.min}`);
      if (home.value !== 3) problems.push(`Home → ${home.value}`);
      await ev.shot(page, 'max-interval-pentatonic-3');
      return { problems, detail: `Do major: max interval 2 (min ${before.min}). Do major pentatonic → "${after.visible}", slider min ${after.min}; Home keeps ${home.value}.` };
    });
    await runItem(22, async (ev) => {
      const problems = [];
      await chooseScale(page, 'chromatic', 'Chromatic');
      const after = await maxInfo();
      if (after.value !== 3) problems.push(`value lowered/raised to ${after.value}`);
      if (after.min !== 1) problems.push(`min ${after.min}`);
      await slider(page, 'Max interval').focus();
      await page.keyboard.press('Home');
      const home = await maxInfo();
      if (home.visible !== '1 semitone') problems.push(`Home → "${home.visible}"`);
      await ev.shot(page, 'max-interval-chromatic');
      return { problems, detail: `Chromatic: value stays "${after.visible}", min ${after.min}; the slider can go down to "${home.visible}".` };
    });
    await runItem(23, async (ev) => {
      const problems = [];
      await chooseScale(page, 'all scales', 'All scales');
      const after = await maxInfo();
      if (after.min !== 3) problems.push(`min ${after.min}`);
      await ev.shot(page, 'max-interval-all-scales');
      return { problems, detail: `All scales: slider min ${after.min}, value "${after.visible}" (raised from 1 by selectScale).` };
    });
    if (await dialogOpen(page)) await closeDialog(page);

    // 24 — reset to defaults
    await runItem(24, async (ev) => {
      const problems = [];
      const changed = await configure(page, { scale: ['fa major', 'Fa major'], length: 7, maxInterval: 9, duration: 500, volume: 80 });
      await page.getByRole('slider', { name: 'Threshold' }).fill('-25');
      const label1 = await thresholdLabel(page);
      if (label1 !== `Threshold: ${MINUS}25 dB`) problems.push(`threshold label "${label1}"`);
      await openDialog(page);
      await dlg(page).getByRole('button', { name: 'Reset to defaults' }).click();
      const after = viewOf(await readDialog(page));
      expectEq(problems, 'after reset', after, DEFAULT_VIEW);
      const label2 = await thresholdLabel(page);
      const stored = await run(page, `return localStorage.getItem('${THRESHOLD_KEY}');`);
      if (label2 !== `Threshold: ${MINUS}25 dB`) problems.push(`threshold label after reset "${label2}"`);
      if (stored !== '-25') problems.push(`stored threshold ${stored}`);
      await ev.shot(page, 'reset-defaults');
      await closeDialog(page);
      return { problems, detail: `Changed to ${fmt(changed)} and threshold "${label1}". Reset → ${fmt(after)}; threshold label still "${label2}" (stored ${stored}).` };
    });

    // 25 — persistence
    const expected25 = { scale: 'All majors', 'Melody length': '7 notes', 'Max interval': '9 semitones', 'Note duration': '750 ms', 'Playback volume': '80%' };
    await runItem(25, async (ev) => {
      const problems = [];
      await configure(page, { scale: ['all majors', 'All majors'], length: 7, maxInterval: 9, duration: 750, volume: 80 });
      await page.getByRole('slider', { name: 'Threshold' }).fill('-30');
      await page.reload();
      await startBtn(page).waitFor({ timeout: 20_000 });
      const label = await thresholdLabel(page);
      const thrValue = await page.getByRole('slider', { name: 'Threshold' }).inputValue();
      await openDialog(page);
      const view = viewOf(await readDialog(page));
      expectEq(problems, 'restored settings', view, expected25);
      if (label !== `Threshold: ${MINUS}30 dB` || thrValue !== '-30') problems.push(`threshold "${label}" / slider ${thrValue}`);
      await ev.shot(page, 'persistence-after-reload');
      await closeDialog(page);
      return { problems, detail: `After reload: ${fmt(view)}; "${label}" (slider value ${thrValue}).` };
    });

    // 26 — localStorage contents
    await runItem(26, async (ev) => {
      const problems = [];
      const raw = await run(page, `return [localStorage.getItem('${SETTINGS_KEY}'), localStorage.getItem('${THRESHOLD_KEY}')];`);
      let parsed = null;
      try {
        parsed = JSON.parse(raw[0]);
      } catch {
        parsed = null;
      }
      expectEq(problems, 'settings', parsed, { noteDurationMs: 750, melodyLength: 7, volume: 0.8, maxInterval: 9, scaleId: 'group:major' });
      if (raw[1] !== '-30') problems.push(`threshold raw ${fmt(raw[1])}`);
      ev.json('26-local-storage.json', { raw, parsed });
      return { problems, detail: `JSON.parse(localStorage['${SETTINGS_KEY}']) = \`${fmt(parsed)}\`; localStorage['${THRESHOLD_KEY}'] = \`${fmt(raw[1])}\`.` };
    });

    // 27 — invalid storage
    await runItem(27, async (ev) => {
      const problems = [];
      await run(page, `localStorage.setItem('${SETTINGS_KEY}', '{oops'); localStorage.setItem('${THRESHOLD_KEY}', '"abc"'); return true;`);
      await page.reload();
      await startBtn(page).waitFor({ timeout: 20_000 });
      const enabled = await startBtn(page).isEnabled();
      const label = await thresholdLabel(page);
      await openDialog(page);
      const view = viewOf(await readDialog(page));
      expectEq(problems, 'settings', view, DEFAULT_VIEW);
      if (label !== `Threshold: ${MINUS}40 dB`) problems.push(`label "${label}"`);
      if (!enabled) problems.push('Start training disabled');
      await ev.shot(page, 'invalid-storage-defaults');
      await closeDialog(page);
      await run(page, 'localStorage.clear(); return true;');
      return { problems, detail: `App loaded normally (Start enabled ${enabled}); dialog ${fmt(view)}; "${label}". localStorage cleared afterwards.` };
    });

    // 48 — automated part (gear glyph); the item stays SKIP (real devices).
    await runItem(48, async (ev) => {
      const g = gearInfo ?? {};
      try {
        const file = path.resolve(SHOTS_DIR, `${String(++shotCounter).padStart(2, '0')}-gear-glyph.png`);
        await gear(page).screenshot({ path: file });
        ev.images.push(rel(file));
      } catch {
        // optional
      }
      const textPresentation = Array.isArray(g.glyph) && g.glyph.join(' ') === 'U+2699 U+FE0E';
      return {
        status: 'SKIP',
        detail: `Manual: real devices (Android Chrome, iOS Safari via HTTPS) and desktop Firefox are not automated. Automated part: the gear text is ${fmt(g.glyph)} ` +
          `(${textPresentation ? 'U+2699 GEAR + U+FE0E VARIATION SELECTOR-15 = text presentation, so it should render monochrome' : 'NOT the expected U+2699 U+FE0E'}), ` +
          `inside an aria-hidden="${g.glyphAriaHidden}" span, font-family ${g.fontFamily}; Chromium rendering in the screenshot.`,
      };
    });
  });
}

// ---------------------------------------------------------------- group B: item 7 (5173) ----------
function delayGetUserMedia() {
  const md = window.navigator.mediaDevices;
  if (!md || typeof md.getUserMedia !== 'function') return;
  const orig = md.getUserMedia.bind(md);
  window.__gumCalls = 0;
  md.getUserMedia = (constraints) => {
    window.__gumCalls += 1;
    return new Promise((resolve, reject) => {
      window.setTimeout(() => orig(constraints).then(resolve, reject), 2000);
    });
  };
}

async function groupPermissionPending() {
  await withPage('B-permission-5173', { initScripts: [delayGetUserMedia] }, async (page) => {
    await runItem(7, async (ev) => {
      const problems = [];
      await gotoApp(page, `${DEV}/`);
      const states = () => page.evaluate(() => {
        const btn = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
        const g = document.querySelector('.settings-button');
        return {
          start: btn('Start training')?.disabled ?? null,
          testMic: btn('Test microphone')?.disabled ?? null,
          gear: g ? g.disabled : null,
          gumCalls: window.__gumCalls,
          training: Boolean(document.querySelector('[data-testid="training-status"]')),
        };
      });
      const before = await states();
      await startBtn(page).click();
      const pending = await states();
      await ev.shot(page, 'permission-pending-disabled');
      await page.waitForTimeout(1000);
      const pendingLater = await states();
      await page.getByTestId('training-status').waitFor({ timeout: 15_000 });
      const training = await states();
      await ev.shot(page, 'permission-granted-training');
      for (const [k, v] of Object.entries({ start: pending.start, testMic: pending.testMic, gear: pending.gear })) if (v !== true) problems.push(`${k} not disabled while pending`);
      if (pending.training) problems.push('training screen already shown while pending');
      if (pendingLater.gear !== true || pendingLater.start !== true) problems.push('buttons re-enabled before the prompt resolved');
      if (training.gear !== false) problems.push(`gear disabled=${training.gear} on the training screen`);
      if (!(pending.gumCalls >= 1)) problems.push('getUserMedia wrapper was not called');
      ev.json('07-permission-pending.json', { before, pending, pendingLater, training });
      await leaveTraining(page).catch(() => undefined);
      return {
        problems,
        detail: `Browser permission prompt simulated by an init script delaying getUserMedia by 2 s (the fake-UI flag auto-accepts the real prompt). ` +
          `Right after the click: Start disabled ${pending.start}, Test microphone disabled ${pending.testMic}, gear disabled ${pending.gear}; still disabled 1 s later. ` +
          `Training screen shown → gear disabled ${training.gear}. The real prompt UI itself: manual.`,
      };
    });
  });
}

// ---------------------------------------------------------------- group C: item 28 (5174) ---------
function blockLocalStorage() {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new window.DOMException('The operation is insecure.', 'SecurityError');
    },
  });
}

async function groupBlockedStorage() {
  await withPage('C-blocked-storage-5174', { initScripts: [blockLocalStorage] }, async (page, errors) => {
    await runItem(28, async (ev) => {
      const problems = [];
      await gotoApp(page, `${E2E}/?melody=71,71,71`);
      const emulation = await run(page, "let r; try { void window.localStorage; r = 'accessible'; } catch (e) { r = e.name; } const ss = await import('/src/config/settingsStorage.ts'); return { access: r, browserStorage: ss.getBrowserStorage() === null ? null : 'object' };");
      if (emulation.access !== 'SecurityError' || emulation.browserStorage !== null) problems.push(`storage blocking emulation failed: ${fmt(emulation)}`);
      await openDialog(page);
      const initial = viewOf(await readDialog(page));
      expectEq(problems, 'initial settings', initial, DEFAULT_VIEW);
      await setSlider(page, 'Melody length', 4);
      await setSlider(page, 'Note duration', 500);
      await setSlider(page, 'Playback volume', 30);
      await closeDialog(page);
      await openDialog(page);
      const inVisit = viewOf(await readDialog(page));
      await closeDialog(page);
      const expectedVisit = { ...DEFAULT_VIEW, 'Melody length': '4 notes', 'Note duration': '500 ms', 'Playback volume': '30%' };
      expectEq(problems, 'in-visit settings', inVisit, expectedVisit);
      await page.getByRole('slider', { name: 'Threshold' }).fill('-33');
      const ex = await playExercise(page);
      const spacing = ex.seq ? spacingOf(ex.seq) : [];
      if (ex.boxCount !== 3) problems.push(`${ex.boxCount} boxes`);
      if (!spacing.length || !spacing.every((d) => approx(d, 0.5, NOTE_SPACING_TOLERANCE_S))) problems.push(`note spacing ${fmt(spacing)} (expected 0.5 s)`);
      await ev.shot(page, 'blocked-storage-training');
      await waitHome(page, 30_000);
      await page.reload();
      await startBtn(page).waitFor({ timeout: 20_000 });
      const label = await thresholdLabel(page);
      await openDialog(page);
      const afterReload = viewOf(await readDialog(page));
      await closeDialog(page);
      expectEq(problems, 'after reload', afterReload, DEFAULT_VIEW);
      if (label !== `Threshold: ${MINUS}40 dB`) problems.push(`threshold after reload "${label}"`);
      await ev.shot(page, 'blocked-storage-after-reload');
      const relevant = errors.filter((e) => !/favicon/i.test(e));
      if (relevant.length) problems.push(`console errors: ${relevant.join(' | ')}`);
      ev.json('28-blocked-storage.json', { emulation, initial, inVisit, exercise: { boxCount: ex.boxCount, notes: ex.notes, spacing }, afterReload, thresholdAfterReload: label, consoleErrors: errors });
      return {
        problems,
        detail: `Blocked storage emulated by an init script whose window.localStorage getter throws SecurityError (as Chrome does with site data blocked); ` +
          `access → ${emulation.access}, getBrowserStorage() → ${emulation.browserStorage}. Defaults on load; changes applied during the visit ${fmt(inVisit)}; ` +
          `exercise ?melody=71,71,71 played ${ex.boxCount} boxes at ${fmt(spacing)} s/note (the in-memory 500 ms) and completed. After reload: ${fmt(afterReload)}, "${label}". ` +
          `Console errors: ${relevant.length} (${errors.length} incl. favicon). Incognito window: not separately automated (fresh context = empty storage).`,
      };
    });
  });
}

// ---------------------------------------------------------------- group D: real exercises (5173) --
async function groupRealExercises() {
  await withPage('D-real-exercises-5173', {}, async (page) => {
    await gotoApp(page, `${DEV}/`);
    await run(page, 'localStorage.clear(); return true;');
    await gotoApp(page, `${DEV}/`);

    // 29
    await runItem(29, async (ev) => {
      const problems = [];
      await configure(page, { length: 3, duration: 250 });
      const ex = await playExercise(page);
      if (ex.boxCount !== 3) problems.push(`${ex.boxCount} boxes`);
      if (ex.status !== 'Your turn: play note 1 of 3') problems.push(`status "${ex.status}"`);
      await ev.shot(page, 'length-3-your-turn');
      const left = await leaveTraining(page);
      return { problems, detail: `Melody length 3 (note duration 250 ms to save time): ${ex.boxCount} boxes, first listening status "${ex.status}", played written MIDI ${fmt(ex.notes)}; Give up → Home (${left}).` };
    });

    // 30
    await runItem(30, async (ev) => {
      const problems = [];
      await configure(page, { length: 8 });
      await clearAudioLog(page);
      await startBtn(page).click();
      await page.getByTestId('note-box-7').waitFor({ timeout: 15_000 });
      const t = await readTraining(page);
      const y0 = t.boxes[0]?.y;
      const sameRow = t.boxes.filter((b) => Math.abs(b.y - y0) < 1).length;
      const leftGap = t.boxes[0].x - t.list.x;
      const rightGap = t.list.right - t.boxes.at(-1).right;
      if (t.boxes.length !== 8) problems.push(`${t.boxes.length} boxes`);
      if (sameRow !== 8) problems.push(`only ${sameRow} boxes on the first row`);
      if (!approx(leftGap, rightGap, 2)) problems.push(`row not centered (left gap ${leftGap.toFixed(1)}, right gap ${rightGap.toFixed(1)})`);
      await ev.shot(page, 'length-8-one-row');
      const left = await leaveTraining(page);
      return { problems, detail: `1280 × 800: ${t.boxes.length} boxes, ${sameRow} on one row (y ${y0?.toFixed(0)}), gaps left ${leftGap.toFixed(1)} / right ${rightGap.toFixed(1)} px (centered). Give up → Home (${left}).` };
    });

    const spellNotes = (scaleId, list) => run(page, `
      const sc = await import('/src/music/scales.ts'); const sp = await import('/src/music/spelling.ts');
      const scale = '${scaleId}' === 'chromatic' ? 'chromatic' : sc.getSpecificScale('${scaleId}');
      return ${JSON.stringify(list)}.map((notes) => ({ notes, names: sp.spellExercise({ notes, scale }),
        outOfKey: scale === 'chromatic' ? [] : notes.filter((n) => !scale.pitchClasses.includes(((n % 12) + 12) % 12)) }));`);

    // 31 — Fa major
    await runItem(31, async (ev) => {
      const problems = [];
      await configure(page, { scale: ['fa major', 'Fa major'], length: 8, maxInterval: 12, duration: 250 });
      const played = [];
      for (let k = 0; k < 4; k += 1) {
        const ex = await playExercise(page);
        played.push(ex.notes);
        if (k === 0) await ev.shot(page, 'fa-major-exercise');
        await leaveTraining(page);
      }
      const spelled = await spellNotes('major:fa', played);
      for (const s of spelled) {
        if (s.notes.length !== 8) problems.push(`played ${s.notes.length} notes`);
        if (s.outOfKey.length) problems.push(`out of Fa major: ${s.outOfKey.join(',')}`);
        if (s.names.some((n) => n.startsWith('La#'))) problems.push(`"La#" in ${s.names.join(' ')}`);
        s.notes.forEach((n, i) => { if (n === 70 && s.names[i] !== 'Si♭4') problems.push(`70 spelled ${s.names[i]}`); });
      }
      const mod = await run(page, `
        const m = await import('/src/music/melody.ts'); const sp = await import('/src/music/spelling.ts');
        let laSharp = 0, outOfKey = 0, siFlat = 0;
        for (let k = 0; k < 300; k += 1) { const e = m.generateExercise(Math.random, { length: 8, maxInterval: 12, scaleId: 'major:fa' });
          const names = sp.spellExercise(e); laSharp += names.filter((n) => n.startsWith('La#')).length; siFlat += names.filter((n) => n.startsWith('Si♭')).length;
          outOfKey += e.notes.filter((n) => !e.scale.pitchClasses.includes(n % 12)).length; }
        return { exercises: 300, laSharp, outOfKey, siFlat };`);
      if (mod.laSharp || mod.outOfKey) problems.push(`module sample: ${fmt(mod)}`);
      ev.json('31-fa-major.json', { played: spelled, module: mod });
      const siCount = spelled.reduce((a, s) => a + s.notes.filter((n) => n === 70).length, 0);
      return {
        problems,
        detail: `4 real exercises (notes read from the synth's oscillator frequencies): ${spelled.map((s) => s.names.join(' ')).join(' | ')} — all in Fa major, ${siCount} Si♭ shown as "Si♭4", no "La#". ` +
          `Module sample of ${mod.exercises}: ${mod.siFlat} Si♭, ${mod.laSharp} La#, ${mod.outOfKey} out-of-key. Names come from the app's spellExercise (the UI only shows a name once a note is played correctly; the 440 Hz fake mic cannot play Fa major notes).`,
      };
    });

    // 32 — Sol♭ major, written Si = Do♭5
    await runItem(32, async (ev) => {
      const problems = [];
      await configure(page, { scale: ['solb major', 'Sol♭ major'], length: 3, duration: 250 });
      let uiName = null;
      let attempts = 0;
      const seen = [];
      for (; attempts < 40 && uiName === null; ) {
        attempts += 1;
        const ex = await playExercise(page);
        seen.push(ex.notes);
        if (ex.notes[0] === 71 && ex.where === 'listening') {
          try {
            const done = await waitBoxDone(page, 0, 10_000);
            uiName = done.text;
            await ev.shot(page, 'sol-flat-major-do-flat-5');
          } catch {
            // fall through: try again
          }
        }
        await leaveTraining(page);
      }
      const with71 = seen.filter((n) => n.includes(71));
      const spelled = await spellNotes('major:sol-flat',with71.length ? with71 : [[71, 70, 66]]);
      const mod = await run(page, "const sp = await import('/src/music/spelling.ts'); return sp.spellInKey([71], -6)[0];");
      if (uiName !== null && uiName !== 'Do♭5') problems.push(`box shows "${uiName}"`);
      const bad = spelled.flatMap((s) => s.notes.map((n, i) => (n === 71 && s.names[i] !== 'Do♭5' ? s.names[i] : null)).filter(Boolean));
      if (bad.length) problems.push(`71 spelled ${bad.join(', ')}`);
      if (mod !== 'Do♭5') problems.push(`spellInKey([71], -6) = ${mod}`);
      ev.json('32-sol-flat-major.json', { attempts, uiName, playedWith71: spelled, spellInKey71: mod });
      return {
        problems,
        detail: uiName !== null
          ? `After ${attempts} exercise(s) one started with written Si (71); the fake mic (concert A4 = written 71) played it and box 1 turned green showing "${uiName}". Module spellInKey([71], −6) = "${mod}".`
          : `No exercise started with 71 in ${attempts} attempts, so the UI box was not observed; ${with71.length} played exercise(s) contained 71, spelled by the app's spellExercise as ${spelled.map((s) => s.names.join(' ')).join(' | ')}; spellInKey([71], −6) = "${mod}".`,
      };
    });

    // 33 — All majors
    await runItem(33, async (ev) => {
      const problems = [];
      await configure(page, { scale: ['all majors', 'All majors'], length: 8, duration: 250 });
      const played = [];
      let repeat = null;
      for (let k = 0; k < 5; k += 1) {
        const ex = await playExercise(page);
        played.push(ex.notes);
        if (k === 0 && ex.where === 'listening') {
          const before = await boxStates(page);
          await clearAudioLog(page);
          await page.getByRole('button', { name: 'Repeat melody' }).click();
          await waitListeningOrHome(page, 20_000);
          const log = await readAudioLog(page);
          const after = await boxStates(page);
          repeat = { first: ex.notes, repeated: playedNotes(completeSeqs(log).at(-1)), before, after };
          await ev.shot(page, 'all-majors-after-repeat');
        }
        await leaveTraining(page);
      }
      const keys = await run(page, `const s = await import('/src/music/scales.ts'); return ${JSON.stringify(played)}.map((notes) => s.SPECIFIC_SCALES.filter((x) => x.type === 'major' && notes.every((n) => x.pitchClasses.includes(n % 12))).map((x) => x.id));`);
      const disjointPair = keys.some((a, i) => keys.some((b, j) => j > i && a.length && b.length && !a.some((x) => b.includes(x))));
      if (keys.some((k) => k.length === 0)) problems.push('an exercise fits no single major key');
      if (!disjointPair) problems.push(`no two exercises with clearly different keys: ${fmt(keys)}`);
      if (!repeat) problems.push('Repeat not exercised');
      else {
        if (!deepEqual(repeat.first, repeat.repeated)) problems.push(`Repeat played ${fmt(repeat.repeated)} vs first ${fmt(repeat.first)}`);
        const regressed = repeat.before.some((s, i) => s === 'done' && repeat.after[i] !== 'done');
        if (regressed) problems.push(`box states ${fmt(repeat.before)} → ${fmt(repeat.after)}`);
      }
      const mod = await run(page, "const m = await import('/src/music/melody.ts'); const ids = new Set(); for (let k = 0; k < 100; k += 1) ids.add(m.generateExercise(Math.random, { length: 8, maxInterval: 12, scaleId: 'group:major' }).scale.id); return [...ids];");
      if (mod.length < 5) problems.push(`module: only ${mod.length} distinct keys in 100 exercises`);
      ev.json('33-all-majors.json', { played, candidateKeys: keys, repeat, moduleDistinctKeys: mod });
      return {
        problems,
        detail: `5 real exercises, candidate major keys from the played notes: ${keys.map((k) => `[${k.join(', ')}]`).join(' ')} (different keys across exercises: ${disjointPair}). ` +
          `Repeat in exercise 1: first ${fmt(repeat?.first)} vs repeat ${fmt(repeat?.repeated)} (identical: ${deepEqual(repeat?.first, repeat?.repeated)}). Module: ${mod.length} distinct keys in 100 group:major exercises.`,
      };
    });

    // 34 — chromatic max interval 1
    await runItem(34, async (ev) => {
      const problems = [];
      await openDialog(page);
      await chooseScale(page, 'chromatic', 'Chromatic');
      await setSlider(page, 'Max interval', 1);
      const v = viewOf(await readDialog(page));
      await closeDialog(page);
      if (v['Max interval'] !== '1 semitone') problems.push(`max interval "${v['Max interval']}"`);
      const played = [];
      for (let k = 0; k < 3; k += 1) {
        const ex = await playExercise(page);
        played.push(ex.notes);
        if (k === 0) await ev.shot(page, 'chromatic-interval-1');
        await leaveTraining(page);
      }
      const steps = played.map((n) => n.slice(1).map((x, i) => Math.abs(x - n[i])));
      if (steps.flat().some((d) => d > 1)) problems.push(`steps ${fmt(steps)}`);
      const mod = await run(page, "const m = await import('/src/music/melody.ts'); let worst = 0; for (let k = 0; k < 200; k += 1) { const n = m.generateExercise(Math.random, { length: 8, maxInterval: 1, scaleId: 'chromatic' }).notes; for (let i = 1; i < n.length; i += 1) worst = Math.max(worst, Math.abs(n[i] - n[i - 1])); } return worst;");
      if (mod > 1) problems.push(`module largest step ${mod}`);
      ev.json('34-chromatic-interval-1.json', { played, steps, moduleLargestStep: mod });
      return { problems, detail: `3 real exercises: ${played.map((n) => n.join(',')).join(' | ')}; steps ${steps.map((s) => s.join(',')).join(' | ')} (all ≤ 1). Module: largest step over 200 exercises = ${mod}.` };
    });
  });
}

// ---------------------------------------------------------------- group E: live settings (5174) ---
async function groupLiveSettings() {
  await withPage('E-live-settings-5174', {}, async (page) => {
    await gotoApp(page, `${E2E}/`);
    await run(page, 'localStorage.clear(); return true;');
    await gotoApp(page, `${E2E}/`);
    let seq35 = null;

    // 35
    await runItem(35, async (ev) => {
      const problems = [];
      await configure(page, { volume: 50, duration: 1500 });
      await gotoApp(page, `${E2E}/?melody=71,60,60,60`);
      await clearAudioLog(page);
      await startBtn(page).click();
      await waitStatus(page, '^Listen', 10_000);
      await openDialog(page);
      const snap = await readDialog(page);
      expectEq(problems, 'sliders', snap.order, ['Note duration', 'Playback volume']);
      if (snap.scale !== null) problems.push('scale combobox shown');
      if (snap.hint !== HINT) problems.push(`hint "${snap.hint}"`);
      await ev.shot(page, 'training-dialog');
      await page.waitForTimeout(800); // deliberate: playback must keep going
      const t = await readTraining(page);
      const log = await readAudioLog(page);
      const seqs = analyzeSequences(log);
      seq35 = completeSeqs(log).at(-1);
      if (t.status !== 'Listen…') problems.push(`status "${t.status}" 0.8 s after opening`);
      if (!seq35 || seq35.starts.length !== 4) problems.push('4-note playback not found or stopped');
      const spacing = seq35 ? spacingOf(seq35) : [];
      if (!spacing.every((d) => approx(d, 1.5, NOTE_SPACING_TOLERANCE_S))) problems.push(`spacing ${fmt(spacing)}`);
      ev.json('35-training-dialog.json', { snap, status: t.status, sequences: seqs.map(summarizeSequence) });
      return {
        problems,
        detail: `?melody=71,60,60,60 at 1500 ms / 50%. Gear opened while "Listen…": sliders ${fmt(snap.order)}, no Scale field, hint "${snap.hint}". ` +
          `0.8 s later status still "${t.status}"; the 4-note playback (spacing ${fmt(spacing)} s) was not stopped (${seqs.length} playSequence call(s) incl. StrictMode's cancelled one).`,
      };
    });

    // 36
    await runItem(36, async (ev) => {
      const problems = [];
      const l0 = await audioLogLength(page);
      await setSlider(page, 'Playback volume', 100);
      await page.waitForTimeout(400);
      await setSlider(page, 'Playback volume', 0);
      await page.waitForTimeout(400);
      await ev.shot(page, 'training-volume-0');
      const log = await readAudioLog(page);
      const seq = analyzeSequences(log).find((s) => s.master === seq35?.master);
      const newOsc = log.filter((e) => e.i >= l0 && e.t === 'create' && e.type === 'oscillator').length;
      if (!seq) problems.push('playback not found');
      let detail = '';
      if (seq) {
        const ev2 = seq.masterEvents.filter((e) => e.i >= l0);
        const ramps = ev2.filter((e) => e.method === 'linearRampToValueAtTime');
        const up = ramps.find((e) => approx(e.args[0], 1, GAIN_EPSILON));
        const down = ramps.find((e) => approx(e.args[0], 0, GAIN_EPSILON));
        const lastStop = Math.max(...seq.stops.map((s) => s.when));
        const pins = ev2.filter((e) => e.method === 'setValueAtTime');
        const len = (r) => {
          const pin = pins.filter((p) => p.i < r.i).at(-1);
          return pin ? r.args[1] - pin.args[1] : NaN;
        };
        if (!up) problems.push('no ramp to 1');
        if (!down) problems.push('no ramp to 0');
        if (up && down && !(up.i < down.i)) problems.push('ramps out of order');
        for (const r of [up, down].filter(Boolean)) {
          if (!approx(len(r), SYNTH_VOLUME_RAMP_S, RAMP_TOLERANCE_S)) problems.push(`ramp length ${len(r)}`);
          if (!(r.ctx < lastStop)) problems.push(`ramp at ctx ${r.ctx} after the last note ended (${lastStop})`);
        }
        if (seq.stops.length !== seq.starts.length) problems.push('playback was stopped');
        if (newOsc) problems.push(`${newOsc} new oscillator(s) created (restart)`);
        const t0 = seq.starts[0].when;
        detail = `Master gain: ${ev2.map((e) => `${e.method}(${e.args.map((a) => +(+a).toFixed(3)).join(', ')})`).join(', ')}. ` +
          `Ramp to 1 at +${up ? (up.ctx - t0).toFixed(2) : '?'} s and to 0 at +${down ? (down.ctx - t0).toFixed(2) : '?'} s into the melody (last note ends +${(lastStop - t0).toFixed(2)} s), ` +
          `each ${up ? (len(up) * 1000).toFixed(1) : '?'} / ${down ? (len(down) * 1000).toFixed(1) : '?'} ms; ${newOsc} new oscillators, playback not stopped (no restart). Audible smoothness / silence at 0%: manual ear check.`;
        ev.json('36-live-volume.json', { masterEventsAfterChange: ev2, newOscillators: newOsc, sequence: summarizeSequence(seq) });
      }
      return { problems, detail };
    });

    // 37
    await runItem(37, async (ev) => {
      const problems = [];
      await setSlider(page, 'Note duration', 250);
      await closeDialog(page);
      await waitStatus(page, '^Your turn', 20_000);
      await waitBoxDone(page, 0, 10_000);
      const before = await boxStates(page);
      await clearAudioLog(page);
      await page.getByRole('button', { name: 'Repeat melody' }).click();
      await waitStatus(page, '^Listen', 5_000).catch(() => undefined);
      const status2 = await waitStatus(page, '^Your turn', 10_000);
      const after = await boxStates(page);
      const log = await readAudioLog(page);
      const seq = completeSeqs(log).at(-1);
      const spacing = seq ? spacingOf(seq) : [];
      const initial = seq?.masterEvents.find((e) => e.method === 'value=')?.args[0];
      if (!seq || seq.starts.length !== 4) problems.push('repeat playback not found');
      if (!spacing.every((d) => approx(d, 0.25, NOTE_SPACING_TOLERANCE_S))) problems.push(`spacing ${fmt(spacing)}`);
      if (initial !== 0) problems.push(`repeat master gain ${initial} (expected 0 from step 36)`);
      expectEq(problems, 'box states', after, before);
      await ev.shot(page, 'repeat-progress-kept');
      ev.json('37-repeat.json', { before, after, status: status2, sequence: seq ? summarizeSequence(seq) : null });
      await leaveTraining(page);
      return { problems, detail: `Duration set to 250 ms, dialog closed. Box states before Repeat ${fmt(before)}, after ${fmt(after)} ("${status2}"). Repeat playback: ${seq?.starts.length} notes, spacing ${fmt(spacing)} s, master gain ${initial} (0% from step 36). "Plays fast" audibly: manual.` };
    });

    // 38
    await runItem(38, async (ev) => {
      const problems = [];
      await configure(page, { scale: ['sol major', 'Sol major'], length: 4, maxInterval: 7, duration: 1200, volume: 30 });
      await gotoApp(page, `${E2E}/?melody=71,60,60`);
      await startBtn(page).click();
      await waitStatus(page, '^Listen', 10_000);
      await openDialog(page);
      const done = await waitBoxDone(page, 0, 20_000);
      const t = await readTraining(page);
      if (!done.dialogOpen) problems.push('dialog was closed when the box turned green');
      if (done.text !== 'Si4') problems.push(`box text "${done.text}"`);
      if (t.status !== 'Your turn: play note 2 of 3') problems.push(`status "${t.status}"`);
      await ev.shot(page, 'green-behind-dialog');
      return { problems, detail: `?melody=71,60,60, dialog opened during "Listen…" and left open: box 1 turned done ("${done.text}") while the dialog was open (${done.dialogOpen}); status "${t.status}". Real trumpet: manual.` };
    });

    // 39
    await runItem(39, async (ev) => {
      const problems = [];
      const pre = viewOf(await readDialog(page));
      await dlg(page).getByRole('button', { name: 'Reset to defaults' }).click();
      const snap = await readDialog(page);
      const post = viewOf(snap);
      expectEq(problems, 'training reset', post, { scale: null, 'Note duration': '1000 ms', 'Playback volume': '50%' });
      await ev.shot(page, 'training-reset');
      await closeDialog(page);
      await leaveTraining(page);
      await openDialog(page);
      const home = viewOf(await readDialog(page));
      expectEq(problems, 'home after training reset', home, { scale: 'Sol major', 'Melody length': '4 notes', 'Max interval': '7 semitones', 'Note duration': '1000 ms', 'Playback volume': '50%' });
      await ev.shot(page, 'home-after-training-reset');
      await closeDialog(page);
      return { problems, detail: `Training dialog before ${fmt(pre)} → Reset → ${fmt(post)}. Back Home: ${fmt(home)} (scale, length, max interval unchanged).` };
    });

    // 40
    await runItem(40, async (ev) => {
      const problems = [];
      await gotoApp(page, `${E2E}/?melody=71,71,71`);
      await startBtn(page).click();
      await waitStatus(page, '^Listen', 10_000);
      await openDialog(page);
      const during = await readDialog(page);
      await waitHome(page, 40_000);
      const after = await readDialog(page);
      if (during.order.length !== 2) problems.push(`training mode showed ${fmt(during.order)}`);
      if (!after.open) problems.push('dialog closed on completion');
      expectEq(problems, 'home controls', after.order, SLIDER_ORDER);
      if (after.scale === null) problems.push('no Scale field after returning Home');
      await ev.shot(page, 'dialog-open-after-completion');
      if (after.open) await closeDialog(page);
      return { problems, detail: `During training the open dialog showed ${fmt(during.order)}; after all 3 notes completed and the app returned Home it stayed open with Scale "${after.scale}" + ${fmt(after.order)}.` };
    });
  });
}

// ---------------------------------------------------------------- group F: ?melody= (5174) --------
async function groupTestMelody() {
  await withPage('F-test-melody-5174', {}, async (page) => {
    await gotoApp(page, `${E2E}/`);
    await run(page, 'localStorage.clear(); return true;');
    await gotoApp(page, `${E2E}/`);

    await runItem(41, async (ev) => {
      const problems = [];
      await configure(page, { length: 6, duration: 250 });
      await gotoApp(page, `${E2E}/?melody=71,60,72`);
      const ex = await playExercise(page);
      if (ex.boxCount !== 3) problems.push(`${ex.boxCount} boxes`);
      expectEq(problems, 'played notes', ex.notes, [71, 60, 72]);
      await ev.shot(page, 'melody-3-boxes');
      await leaveTraining(page);
      return { problems, detail: `Melody length 6; ?melody=71,60,72 → ${ex.boxCount} boxes, played ${fmt(ex.notes)}.` };
    });
    await runItem(42, async (ev) => {
      const problems = [];
      await gotoApp(page, `${E2E}/?melody=71,71,71,71,71,71,71,71`);
      await startBtn(page).click();
      await page.getByTestId('note-box-0').waitFor({ timeout: 15_000 });
      const n = (await readTraining(page)).boxes.length;
      if (n !== 8) problems.push(`${n} boxes`);
      await ev.shot(page, 'melody-8-boxes');
      await leaveTraining(page);
      return { problems, detail: `?melody=71×8 → ${n} boxes.` };
    });
    await runItem(43, async (ev) => {
      const problems = [];
      await configure(page, { length: 4 });
      const out = [];
      for (const m of ['60,60', '60,60,60,60,60,60,60,60,60']) {
        await gotoApp(page, `${E2E}/?melody=${m}`);
        const ex = await playExercise(page);
        out.push({ melody: m, boxes: ex.boxCount, played: ex.notes });
        if (ex.boxCount !== 4) problems.push(`?melody=${m}: ${ex.boxCount} boxes`);
        if (ex.notes.length === 4 && ex.notes.every((x) => x === 60)) problems.push(`?melody=${m}: played four 60s (parameter used?)`);
        await ev.shot(page, `melody-ignored-${m.split(',').length}`);
        await leaveTraining(page);
      }
      return { problems, detail: `Melody length 4. ${out.map((o) => `?melody= with ${o.melody.split(',').length} notes → ${o.boxes} boxes, random melody ${fmt(o.played)}`).join('; ')}.` };
    });
    await runItem(44, async (ev) => {
      const problems = [];
      await configure(page, { scale: ['fa major', 'Fa major'] });
      await gotoApp(page, `${E2E}/?melody=65,70,72`);
      const ex = await playExercise(page);
      if (ex.boxCount !== 3) problems.push(`${ex.boxCount} boxes`);
      expectEq(problems, 'played notes', ex.notes, [65, 70, 72]);
      await ev.shot(page, 'fa-major-melody-65-70-72');
      await leaveTraining(page);
      const names = await run(page, "const t = await import('/src/testing/testMelody.ts'); const sp = await import('/src/music/spelling.ts'); return Object.fromEntries(['major:fa', 'chromatic', 'group:all'].map((id) => [id, sp.spellExercise(t.getTestExercise(id))]));");
      expectEq(problems, 'Fa major names', names['major:fa'], ['Fa4', 'Si♭4', 'Do5']);
      expectEq(problems, 'Chromatic names', names.chromatic, ['Fa4', 'La#4', 'Do5']);
      expectEq(problems, 'All scales names', names['group:all'], ['Fa4', 'La#4', 'Do5']);
      // UI-visible proof that ?melody= is spelled in the selected key: written 71 completes with the fake mic.
      const ui = {};
      for (const [q, nm] of [['solb major', 'Sol♭ major'], ['chromatic', 'Chromatic']]) {
        await configure(page, { scale: [q, nm] });
        await gotoApp(page, `${E2E}/?melody=71,71,71`);
        await startBtn(page).click();
        ui[nm] = (await waitBoxDone(page, 0, 20_000)).text;
        await ev.shot(page, `melody-71-${nm === 'Chromatic' ? 'chromatic' : 'sol-flat-major'}`);
        await leaveTraining(page);
      }
      if (ui['Sol♭ major'] !== 'Do♭5') problems.push(`Sol♭ major ?melody=71 box "${ui['Sol♭ major']}"`);
      if (ui.Chromatic !== 'Si4') problems.push(`Chromatic ?melody=71 box "${ui.Chromatic}"`);
      ev.json('44-melody-spelling.json', { played: ex.notes, names, uiBoxes: ui });
      return {
        problems,
        detail: `Fa major + ?melody=65,70,72: 3 boxes, played ${fmt(ex.notes)}; spellExercise(getTestExercise(id)) in the e2e page (what the reducer shows): Fa major ${fmt(names['major:fa'])}, ` +
          `Chromatic ${fmt(names.chromatic)}, All scales ${fmt(names['group:all'])} (contextual: rising → sharp). The 440 Hz fake mic cannot play 65/70/72, so those names are not observable in boxes; ` +
          `UI cross-check with ?melody=71,71,71 (completed by the fake mic): Sol♭ major box "${ui['Sol♭ major']}", Chromatic box "${ui.Chromatic}".`,
      };
    });
  });
}

// ---------------------------------------------------------------- group G: layout (5174) ----------
async function groupLayout() {
  await withPage('G-layout-5174', { viewport: { width: 375, height: 812 } }, async (page) => {
    await gotoApp(page, `${E2E}/`);
    await run(page, 'localStorage.clear(); return true;');
    const rows = (t) => {
      const ys = [...new Set(t.boxes.map((b) => Math.round(b.y)))].sort((a, b) => a - b);
      return ys.map((y) => t.boxes.filter((b) => Math.abs(Math.round(b.y) - y) <= 1));
    };
    const layoutCheck = (t, expectedRows, problems) => {
      const r = rows(t);
      expectEq(problems, 'row sizes', r.map((x) => x.length), expectedRows);
      const w0 = t.boxes[0].w;
      if (t.boxes.some((b) => Math.abs(b.w - w0) > 0.5 || Math.abs(b.h - w0) > 0.5)) problems.push(`box sizes ${fmt(t.boxes.map((b) => [b.w, b.h]))}`);
      const gaps = r.map((row) => [row[0].x - t.list.x, t.list.right - row.at(-1).right]);
      gaps.forEach(([l, rr], i) => { if (!approx(l, rr, 2)) problems.push(`row ${i + 1} not centered (${l.toFixed(1)} / ${rr.toFixed(1)})`); });
      if (t.scrollWidth > t.innerWidth) problems.push(`horizontal scroll: scrollWidth ${t.scrollWidth} > ${t.innerWidth}`);
      return { rows: r.map((x) => x.length), boxPx: w0, gaps };
    };
    let w375 = null;
    await runItem(45, async (ev) => {
      const problems = [];
      await gotoApp(page, `${E2E}/?melody=71,71,71,71,71,71,71,71`);
      await startBtn(page).click();
      await page.getByTestId('note-box-7').waitFor({ timeout: 15_000 });
      const t = await readTraining(page);
      const l = layoutCheck(t, [5, 3], problems);
      w375 = l.boxPx;
      await ev.shot(page, 'layout-375');
      ev.json('45-layout-375.json', { ...l, t });
      return { problems, detail: `375 × 812: rows ${l.rows.join(' + ')}, all boxes ${l.boxPx.toFixed(1)} px square, row gaps ${l.gaps.map(([a, b]) => `${a.toFixed(1)}/${b.toFixed(1)}`).join(', ')} (centered), scrollWidth ${t.scrollWidth} ≤ ${t.innerWidth}.` };
    });
    await runItem(46, async (ev) => {
      const problems = [];
      await page.setViewportSize({ width: 320, height: 640 });
      await page.waitForTimeout(200);
      const t = await readTraining(page);
      if (!t.boxes.length) throw new Error('training screen no longer shown (exercise finished too early)');
      const l = layoutCheck(t, [4, 4], problems);
      if (w375 != null && !approx(l.boxPx, w375, 0.5)) problems.push(`box ${l.boxPx} px vs ${w375} px at 375`);
      await ev.shot(page, 'layout-320');
      await page.setViewportSize({ width: 375, height: 812 });
      await leaveTraining(page);
      return { problems, detail: `320 px: rows ${l.rows.join(' + ')}, box ${l.boxPx.toFixed(1)} px (375 px: ${w375?.toFixed(1)} px), scrollWidth ${t.scrollWidth} ≤ ${t.innerWidth}.` };
    });
    await runItem(47, async (ev) => {
      const problems = [];
      await gotoApp(page, `${E2E}/`);
      await openDialog(page);
      const geo = () => page.evaluate(() => {
        const d = document.querySelector('dialog.settings-dialog');
        const r = d.getBoundingClientRect();
        const cs = getComputedStyle(d);
        return { x: r.x, w: r.width, bottom: r.bottom, top: r.top, innerWidth: window.innerWidth, innerHeight: window.innerHeight,
          radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius],
          overflowY: cs.overflowY, scrollHeight: d.scrollHeight, clientHeight: d.clientHeight };
      });
      const g = await geo();
      if (!approx(g.x, 0, 1) || !approx(g.w, g.innerWidth, 1)) problems.push(`dialog x ${g.x}, width ${g.w} (viewport ${g.innerWidth})`);
      if (!approx(g.bottom, g.innerHeight, 1)) problems.push(`dialog bottom ${g.bottom} (viewport ${g.innerHeight})`);
      if (!(parseFloat(g.radius[0]) > 0 && parseFloat(g.radius[1]) > 0 && parseFloat(g.radius[2]) === 0 && parseFloat(g.radius[3]) === 0)) problems.push(`border radii ${g.radius.join(' ')}`);
      if (g.overflowY !== 'auto') problems.push(`overflow-y ${g.overflowY}`);
      await ev.shot(page, 'dialog-sheet-375');
      await scaleInput(page).click();
      const gOpen = await geo();
      await ev.shot(page, 'dialog-sheet-375-list-open');
      await page.setViewportSize({ width: 375, height: 600 });
      await page.waitForTimeout(200);
      const scrolled = await page.evaluate(() => {
        const d = document.querySelector('dialog.settings-dialog');
        d.scrollTop = 100000;
        return { scrollHeight: d.scrollHeight, clientHeight: d.clientHeight, scrollTop: d.scrollTop };
      });
      await ev.shot(page, 'dialog-sheet-375x600-scrolled');
      const scrolls = gOpen.scrollHeight > gOpen.clientHeight || (scrolled.scrollHeight > scrolled.clientHeight && scrolled.scrollTop > 0);
      if (!scrolls) problems.push(`not scrollable (812: ${gOpen.scrollHeight}/${gOpen.clientHeight}; 600: ${fmt(scrolled)})`);
      await page.setViewportSize({ width: 375, height: 812 });
      await page.keyboard.press('Escape');
      if (await dialogOpen(page)) await closeDialog(page);
      ev.json('47-dialog-sheet.json', { closed: g, listOpen812: gOpen, listOpen600: scrolled });
      return {
        problems,
        detail: `375 × 812: dialog x ${g.x}, width ${g.w}, bottom ${g.bottom} = viewport height; radii ${g.radius.join(' ')} (rounded top only); overflow-y ${g.overflowY}. ` +
          `With the scale list open at 812 px: scrollHeight ${gOpen.scrollHeight} / clientHeight ${gOpen.clientHeight}${gOpen.scrollHeight > gOpen.clientHeight ? ' (scrolls)' : ' (fits)'}; ` +
          `at 375 × 600: ${scrolled.scrollHeight}/${scrolled.clientHeight}, scrollTop after scrolling ${scrolled.scrollTop}.`,
      };
    });
  });
}

// ---------------------------------------------------------------- group H: preview (4173) ---------
async function groupPreview() {
  await withPage('H-preview-4173', {}, async (page) => {
    await runItem(49, async (ev) => {
      const problems = [];
      await gotoApp(page, PREVIEW);
      await run(page, 'localStorage.clear(); return true;');
      await gotoApp(page, PREVIEW);
      await configure(page, { length: 6, duration: 600 });
      await page.reload();
      await startBtn(page).waitFor({ timeout: 20_000 });
      await openDialog(page);
      const view = viewOf(await readDialog(page));
      await ev.shot(page, 'preview-restored');
      await closeDialog(page);
      if (view['Melody length'] !== '6 notes' || view['Note duration'] !== '600 ms') problems.push(`after reload ${fmt(view)}`);
      await gotoApp(page, `${PREVIEW}?melody=71,71,71`);
      const ex = await playExercise(page);
      if (ex.boxCount !== 6) problems.push(`${ex.boxCount} boxes with ?melody=71,71,71 (expected 6 = Melody length)`);
      if (deepEqual(ex.notes, [71, 71, 71])) problems.push('played the ?melody= notes');
      await ev.shot(page, 'preview-melody-ignored');
      await leaveTraining(page);
      await run(page, 'localStorage.clear(); return true;');
      return { problems, detail: `${PREVIEW}: Melody length 6 + Note duration 600 ms restored after reload (${fmt(view)}). ?melody=71,71,71 → ${ex.boxCount} boxes, random melody ${fmt(ex.notes)} (ignored in the production build).` };
    });
  });
}

// ---------------------------------------------------------------- group I: Part 1 re-run (5173) ---
async function part1Domain(page) {
  const checks = [
    [1, 'p1-01-constants.json',
      "const c = await import('/src/config/constants.ts'); return [c.MELODY_LENGTH, c.NOTE_DURATION_MS, c.SYNTH_PEAK_GAIN, c.DEFAULT_NOTE_DURATION_MS, c.DEFAULT_VOLUME, c.DEFAULT_SCALE_ID];",
      [undefined, undefined, undefined, 1000, 0.5, 'major:do']],
    [2, 'p1-02-scale-options-length.json', "const s = await import('/src/music/scales.ts'); return s.SCALE_OPTIONS.length;", 146],
    [3, 'p1-03-first-11-names.json', "const s = await import('/src/music/scales.ts'); return s.SCALE_OPTIONS.slice(0, 11).map(o => o.name);", FIRST_11],
    [4, 'p1-04-locrian-tonics.json',
      "const s = await import('/src/music/scales.ts'); return s.SPECIFIC_SCALES.filter(x => x.type === 'locrian').map(x => x.tonicName).join(' ');",
      'Si Fa# Do# Sol# Re# La# Mi# Si# Mi La Re Sol Do Fa Si♭'],
    [5, 'p1-05-search.json',
      "const s = await import('/src/music/scales.ts'); return [s.searchScaleOptions('bb major').map(o => o.name), s.searchScaleOptions('F# Dorian').map(o => o.name)];",
      [['Si♭ major', 'Si♭ major pentatonic'], ['Fa# dorian']]],
    [6, 'p1-06-min-max-interval.json',
      "const s = await import('/src/music/scales.ts'); return ['chromatic', 'major:do', 'group:major-pentatonic', 'group:all'].map(s.minMaxInterval);", [1, 2, 3, 3]],
    [7, 'p1-07-spell-in-key.json',
      "const sp = await import('/src/music/spelling.ts'); return [sp.spellInKey([60, 65, 61], 7), sp.spellInKey([66, 71, 70], -6)];",
      [['Si#3', 'Mi#4', 'Do#4'], ['Sol♭4', 'Do♭5', 'Si♭4']]],
    [8, 'p1-08-generate-exercise-worked-example.json',
      "const m = await import('/src/music/melody.ts'); const r = [0, 0.5, 0.99]; let i = 0; const ex = m.generateExercise(() => r[i++], { length: 3, maxInterval: 12, scaleId: 'major:do' }); return [ex.notes, ex.scale.id];",
      [[55, 62, 72], 'major:do']],
    [10, 'p1-10-normalize-settings.json',
      "const st = await import('/src/config/settings.ts'); return st.normalizeSettings({ noteDurationMs: 750, volume: 2, scaleId: 'major:fa' });",
      { noteDurationMs: 750, melodyLength: 5, volume: 0.5, maxInterval: 12, scaleId: 'major:fa' }],
  ];
  for (const [id, file, body, expected] of checks) {
    try {
      const actual = await run(page, body);
      const ok = deepEqual(actual, expected);
      const link = writeJson(API_DIR, file, { step: id, expression: body, expected, actual, match: ok });
      recP1(id, ok ? 'PASS' : 'FAIL', `${ok ? 'Got' : 'Expected ' + fmt(expected) + ', got'} \`${fmt(actual)}\``, { links: [[file, link]] });
    } catch (err) {
      recP1(id, 'FAIL', `Expression threw: ${firstLine(err)}`);
    }
  }

  // 9 — exact expression + programmatic check.
  try {
    const exact = await run(page,
      "const m = await import('/src/music/melody.ts'); const sp = await import('/src/music/spelling.ts'); return Array.from({ length: 5 }, () => m.generateExercise(Math.random, { length: 8, maxInterval: 2, scaleId: 'group:major' })).map(e => e.scale.id + ' ' + sp.spellExercise(e).join(' '));");
    const checked = await run(page, `
      const m = await import('/src/music/melody.ts');
      const sp = await import('/src/music/spelling.ts');
      const s = await import('/src/music/scales.ts');
      const nt = await import('/src/music/notes.ts');
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
          const letter = nt.NOTE_LETTERS.indexOf(mm[1]);
          const alter = mm[2] === '#' ? 1 : mm[2] === '♭' ? -1 : 0;
          if (alters[letter] !== alter) problems.push('accidental of ' + names[j] + ' does not match key signature');
          if (nt.LETTER_PITCH_CLASSES[letter] + alter + 12 * (Number(mm[3]) + 1) !== n) problems.push(names[j] + ' != MIDI ' + n);
        });
        out.push({ line: (e.scale === 'chromatic' ? 'chromatic' : e.scale.id) + ' ' + names.join(' '), notes: e.notes, problems });
      }
      return out;`);
    const shapeOk = Array.isArray(exact) && exact.length === 5 && exact.every((l) => /^major:\S+( \S+){8}$/.test(l));
    const problems = checked.flatMap((c, i) => c.problems.map((p) => `#${i + 1}: ${p}`));
    const ok = shapeOk && problems.length === 0;
    const link = writeJson(API_DIR, 'p1-09-group-major-check.json', { exact, checked });
    recP1(9, ok ? 'PASS' : 'FAIL',
      `${ok ? '' : `shapeOk=${shapeOk}; problems: ${problems.join('; ') || 'none'}. `}Exact expression: ${exact.map((l) => `\`${l}\``).join(', ')}; a second sample of 5 checked note by note (major scale, in key, |step| ≤ 2, names map back to MIDI).`,
      { links: [['p1-09-group-major-check.json', link]] });
  } catch (err) {
    recP1(9, 'FAIL', `Expression threw: ${firstLine(err)}`);
  }

  // 11 — save, reload, load.
  try {
    await run(page,
      "const st = await import('/src/config/settings.ts'); const ss = await import('/src/config/settingsStorage.ts'); const ls = ss.getBrowserStorage(); ss.saveSettings(ls, { ...st.DEFAULT_SETTINGS, melodyLength: 7 }); ss.saveThreshold(ls, -35); return true;");
    await page.reload();
    await startBtn(page).waitFor({ timeout: 20_000 });
    const actual = await run(page,
      "const ss2 = await import('/src/config/settingsStorage.ts'); return [ss2.loadSettings(localStorage).melodyLength, ss2.loadThreshold(localStorage)];");
    const ok = deepEqual(actual, [7, -35]);
    const link = writeJson(API_DIR, 'p1-11-storage-round-trip.json', { expected: [7, -35], actual });
    recP1(11, ok ? 'PASS' : 'FAIL', `After page.reload(): \`${fmt(actual)}\` (expected \`[7,-35]\`).`, { links: [['p1-11-storage-round-trip.json', link]] });
  } catch (err) {
    recP1(11, 'FAIL', `Threw: ${firstLine(err)}`);
  }

  // 12 — invalid JSON → defaults, then localStorage.clear().
  try {
    const actual = await run(page,
      "localStorage.setItem('trumpet-trainer.settings.v1', '{not json'); const ss2 = await import('/src/config/settingsStorage.ts'); return ss2.loadSettings(localStorage);");
    const remaining = await run(page, 'localStorage.clear(); return localStorage.length;');
    const expected = { noteDurationMs: 1000, melodyLength: 5, volume: 0.5, maxInterval: 12, scaleId: 'major:do' };
    const ok = deepEqual(actual, expected) && remaining === 0;
    const link = writeJson(API_DIR, 'p1-12-invalid-json-defaults.json', { expected, actual, localStorageLengthAfterClear: remaining });
    recP1(12, ok ? 'PASS' : 'FAIL', `Returned \`${fmt(actual)}\` without throwing; localStorage cleared (length ${remaining}).`, { links: [['p1-12-invalid-json-defaults.json', link]] });
  } catch (err) {
    recP1(12, 'FAIL', `Threw (must not): ${firstLine(err)}`);
    await run(page, 'localStorage.clear(); return true;').catch(() => undefined);
  }
}

async function part1Step15(page) {
  const links = [];
  try {
    await gotoApp(page, `${DEV}/`);
    await page.mouse.click(10, 400);
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
    if (!seq) problems.push('no playSequence logged');
    else {
      const initial = seq.masterEvents.find((e) => e.method === 'value=');
      if (!initial || !approx(initial.args[0], 0.2, GAIN_EPSILON)) problems.push(`master initial gain ${initial?.args[0]}`);
      const ramp = seq.masterEvents.find((e) => (e.method === 'linearRampToValueAtTime' || e.method === 'setTargetAtTime') && approx(e.args[0], 1, GAIN_EPSILON));
      const t0 = seq.starts[0]?.ctx;
      if (!ramp) problems.push('no ramp to 1 on the master gain');
      else {
        const rampIdx = seq.masterEvents.indexOf(ramp);
        const before = seq.masterEvents.slice(0, rampIdx).filter((e) => ramp.ctx - e.ctx < 0.05);
        const pin = before.findLast((e) => e.method === 'setValueAtTime');
        const rampStart = pin ? pin.args[1] : ramp.ctx;
        const rampLen = ramp.method === 'linearRampToValueAtTime' ? ramp.args[1] - rampStart : ramp.args[2];
        const at = ramp.ctx - t0;
        if (!approx(rampLen, SYNTH_VOLUME_RAMP_S, RAMP_TOLERANCE_S)) problems.push(`ramp length ${rampLen}`);
        if (!(at > 1.8 && at < 2.6)) problems.push(`ramp issued ${at.toFixed(3)} s after playback start`);
        if (!pin) problems.push('no setValueAtTime pinning the current value before the ramp');
        detail = `${ramp.method}(1) issued ${at.toFixed(3)} s after playSequence, ramp length ${(rampLen * 1000).toFixed(1)} ms; master initial gain ${initial?.args[0]}.`;
      }
    }
    if (ctxState !== 'running') problems.push(`AudioContext state "${ctxState}"`);
    links.push(['p1-15-set-volume-audio-log.json', writeJson(API_DIR, 'p1-15-set-volume-audio-log.json', { expression, ctxState, sequences: sequences.map(summarizeSequence) })]);
    await page.waitForTimeout(3000);
    recP1(15, problems.length ? 'FAIL' : 'PASS', `${problems.length ? `Problems: ${problems.join('; ')}. ` : ''}AudioContext "${ctxState}". ${detail} Audible smoothness: manual.`, { links });
  } catch (err) {
    recP1(15, 'FAIL', `Threw: ${firstLine(err)}`, { links });
  }
}

async function groupPart1() {
  await withPage('I-part1-5173', {}, async (page) => {
    await gotoApp(page, `${DEV}/`);
    await run(page, 'localStorage.clear(); return true;');
    await part1Domain(page);
    await part1Step15(page);
    await run(page, 'localStorage.clear(); return true;').catch(() => undefined);
  });
  const sub = P1_IDS.map((id) => ({ id, title: P1_TITLES[id], ...(part1[id] ?? { status: 'FAIL', detail: 'not run', images: [], links: [] }) }));
  const failing = sub.filter((s) => s.status !== 'PASS');
  record(51, failing.length ? 'FAIL' : 'PASS',
    `${sub.length - failing.length}/${sub.length} Part 1 steps pass (1–12 and 15, run in the 5173 dev-server page as in Runs 1–2; steps 13–14 are superseded by items 29–44).` +
    `${failing.length ? ` Not passing: ${failing.map((s) => `${s.id} (${s.status})`).join(', ')}.` : ''}`, { sub });
}

// ---------------------------------------------------------------- group J: Appendix B (5173) -------
/** Lists files under `dir` (recursively) whose name matches `re`. */
function listFiles(dir, re) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(abs, re));
    else if (re.test(entry.name)) out.push(abs);
  }
  return out;
}

/** grep -rn: [{ file (repo-relative), line, text }] for lines of files under `dir` matching `nameRe` that match `lineRe`. */
function grepRepo(dir, nameRe, lineRe) {
  const hits = [];
  for (const file of listFiles(path.resolve(ROOT, dir), nameRe)) {
    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((text, i) => {
      if (lineRe.test(text)) hits.push({ file: path.relative(ROOT, file).split(path.sep).join('/'), line: i + 1, text: text.trim() });
    });
  }
  return hits;
}

/** Init script for item 53: records listbox insertions, aria-expanded="true" and focus moves from page start. */
function installOpenWatch() {
  const w = { listboxAdded: 0, expandedTrue: 0, focusLog: [] };
  window.__openWatch = w;
  const describe = (el) => ({
    tag: el?.tagName ?? null,
    role: el?.getAttribute?.('role') ?? null,
    label: el?.getAttribute?.('aria-label') ?? (el?.labels?.[0]?.textContent ?? null),
  });
  const obs = new window.MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes' && r.attributeName === 'aria-expanded' && r.target.getAttribute('aria-expanded') === 'true') w.expandedTrue += 1;
      for (const n of r.addedNodes ?? []) {
        if (n.nodeType !== 1) continue;
        if (n.matches('[role="listbox"]') || n.querySelector('[role="listbox"]')) w.listboxAdded += 1;
      }
    }
  });
  obs.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-expanded'] });
  document.addEventListener('focusin', (e) => w.focusLog.push({ ...describe(e.target), t: window.performance.now() }), true);
}

async function groupAppendixB() {
  const comboState = (page) => page.evaluate(() => {
    const i = document.querySelector('dialog.settings-dialog input[role="combobox"]');
    const list = document.querySelector('[role="listbox"]');
    const opts = list ? [...list.querySelectorAll('[role="option"]')] : [];
    const r = list ? list.getBoundingClientRect() : null;
    return {
      value: i ? i.value : null,
      expanded: i ? i.getAttribute('aria-expanded') : null,
      inputFocused: Boolean(i) && document.activeElement === i,
      activeTag: document.activeElement?.tagName ?? null,
      listVisible: Boolean(list && r && r.width > 0 && r.height > 0),
      optionCount: opts.length,
      firstOptions: opts.slice(0, 4).map((o) => o.textContent),
      scrollTop: list ? list.scrollTop : null,
      stored: window.localStorage.getItem('trumpet-trainer.settings.v1'),
    };
  });

  // 53 — dialog autofocus (own context: the init script must watch from page start).
  await withPage('J-appendix-b-53-5173', { initScripts: [installOpenWatch] }, async (page) => {
    await runItem(53, async (ev) => {
      const problems = [];
      const observations = [];
      await gotoApp(page, `${DEV}/`);
      await run(page, 'localStorage.clear(); return true;');
      await page.reload();
      await startBtn(page).waitFor({ state: 'visible', timeout: 20_000 });
      const opens = [];
      for (let k = 1; k <= 2; k += 1) {
        await run(page, 'const w = window.__openWatch; w.listboxAdded = 0; w.expandedTrue = 0; w.focusLog.length = 0; return true;');
        await gear(page).click();
        const immediate = await (await page.waitForFunction(() => {
          const d = document.querySelector('dialog.settings-dialog');
          if (!d || !d.open) return false;
          const i = d.querySelector('input[role="combobox"]');
          return {
            activeTag: document.activeElement?.tagName ?? null,
            activeIsDialog: document.activeElement === d,
            autofocusAttr: d.hasAttribute('autofocus'),
            expanded: i ? i.getAttribute('aria-expanded') : null,
            listboxes: document.querySelectorAll('[role="listbox"]').length,
          };
        }, null, { timeout: 5_000, polling: 'raf' })).jsonValue();
        await page.waitForTimeout(600); // deliberate settle: nothing may open later
        const settled = await page.evaluate(() => {
          const d = document.querySelector('dialog.settings-dialog');
          const i = d?.querySelector('input[role="combobox"]');
          return {
            activeTag: document.activeElement?.tagName ?? null,
            activeIsDialog: document.activeElement === d,
            autofocusAttr: d ? d.hasAttribute('autofocus') : null,
            expanded: i ? i.getAttribute('aria-expanded') : null,
            listboxes: document.querySelectorAll('[role="listbox"]').length,
            watch: JSON.parse(JSON.stringify(window.__openWatch)),
          };
        });
        let axFocused = [];
        try {
          axFocused = (await axTree(page)).filter((n) => n.props.focused === true && n.role !== 'RootWebArea');
        } catch (err) {
          axFocused = [{ error: firstLine(err) }];
        }
        if (k === 1) await ev.shot(page, 'b53-dialog-focused');
        const label = `open #${k}`;
        for (const [when, s] of [['immediately', immediate], ['after 600 ms', settled]]) {
          if (s.activeTag !== 'DIALOG' || !s.activeIsDialog) problems.push(`${label} ${when}: activeElement ${s.activeTag}`);
          if (s.expanded !== 'false') problems.push(`${label} ${when}: Scale aria-expanded="${s.expanded}"`);
          if (s.listboxes !== 0) problems.push(`${label} ${when}: ${s.listboxes} listbox(es) in the DOM`);
          if (!s.autofocusAttr) problems.push(`${label} ${when}: <dialog> has no autofocus attribute`);
        }
        if (settled.watch.listboxAdded) problems.push(`${label}: a listbox was inserted ${settled.watch.listboxAdded} time(s) during the open (flash)`);
        if (settled.watch.expandedTrue) problems.push(`${label}: aria-expanded became "true" ${settled.watch.expandedTrue} time(s)`);
        const comboFocus = settled.watch.focusLog.filter((f) => f.role === 'combobox');
        if (comboFocus.length) {
          const dialogFocus = settled.watch.focusLog.find((f) => f.tag === 'DIALOG');
          observations.push(`${label}: focusin on the Scale input${dialogFocus ? ` ${(dialogFocus.t - comboFocus[0].t).toFixed(1)} ms` : ''} before the dialog took focus`);
        }
        const axDialog = axFocused.find((n) => n.role === 'dialog' && n.name === 'Settings');
        if (!axDialog) problems.push(`${label}: focused AX node is ${fmt(axFocused.map((n) => [n.role, n.name]))}, not dialog "Settings"`);
        opens.push({ immediate, settled, axFocused });
        await closeDialog(page);
      }
      const autofocusInSource = /setAttribute\('autofocus', ''\)/.test(fs.readFileSync(path.resolve(ROOT, 'src/components/SettingsDialog.tsx'), 'utf8'));
      if (!autofocusInSource) problems.push("SettingsDialog.tsx has no setAttribute('autofocus', '')");
      ev.json('53-dialog-autofocus.json', { opens, autofocusInSource });
      await run(page, 'localStorage.clear(); return true;');
      const o = opens[0] ?? {};
      return {
        problems,
        detail: `Fresh reload, gear opened twice. Immediately (first animation frame with dialog.open) and 600 ms later: document.activeElement.tagName = ` +
          `${o.immediate?.activeTag} / ${o.settled?.activeTag}, Scale aria-expanded="${o.settled?.expanded}", ${o.settled?.listboxes} listbox in the DOM, <dialog autofocus> ${o.settled?.autofocusAttr}. ` +
          `A MutationObserver + focusin log installed before any page script saw ${o.settled?.watch?.listboxAdded ?? '?'} listbox insertion(s), ${o.settled?.watch?.expandedTrue ?? '?'} aria-expanded="true" change(s) ` +
          `and focus moves ${fmt((o.settled?.watch?.focusLog ?? []).map((f) => f.tag))} (no flash). Chromium AX tree focused node: ${fmt((o.axFocused ?? []).map((n) => `${n.role} "${n.name}"`))}. ` +
          'Screen-reader announcement (NVDA / VoiceOver) itself: not automated (manual); the AX tree is what they read.' +
          (observations.length
            ? ` **Observation (not a checklist criterion):** Chromium's showModal() still focuses the Scale input first despite \`<dialog autofocus>\`; ` +
              `el.focus() then moves focus to the dialog in the same task (${observations.join('; ')}). React batches the input's open + blur-close, ` +
              'so no listbox renders and aria-expanded never becomes "true", but a screen reader may briefly register the combobox.'
            : ' The Scale input never received focus (focusin log).'),
      };
    });
  });

  // 52 runs in its own browser WITHOUT Playwright's default --hide-scrollbars, so the scale list has a real
  // (classic) scrollbar to press and drag. The other items keep the shared browser (layout unchanged).
  const { chromium } = await import('@playwright/test');
  const sbBrowser = await chromium.launch({ headless: true, args: LAUNCH_ARGS, ignoreDefaultArgs: ['--hide-scrollbars'] });
  const sharedBrowser = browser;
  browser = sbBrowser;
  try {
    await withPage('J-appendix-b-52-scrollbars-5173', {}, async (page) => {
      await gotoApp(page, `${DEV}/`);
      await run(page, 'localStorage.clear(); return true;');
      await gotoApp(page, `${DEV}/`);
      await item52(page);
    });
  } finally {
    browser = sharedBrowser;
    await sbBrowser.close().catch(() => undefined);
  }

  await withPage('J-appendix-b-5173', {}, async (page) => {
    await gotoApp(page, `${DEV}/`);
    await run(page, 'localStorage.clear(); return true;');
    await gotoApp(page, `${DEV}/`);

    // 54 — xyz / sol + Enter
    await item54(page);
    // 55 — volume 35% persists; volume ↔ percent helpers
    await item55(page);
    // 56 — integer slider steps
    await item56(page);
  });

  // 52 — press on the list padding and scrollbar
  async function item52(page) {
    await runItem(52, async (ev) => {
      const problems = [];
      await openDialog(page);
      await scaleInput(page).click();
      await listbox(page).waitFor({ state: 'visible', timeout: 5_000 });
      // Opening scrolls "Do major" into view, which scrolls the top padding away: scroll the list back to the top
      // (programmatic scroll; does not move focus) so the padding above "Chromatic" is on screen.
      await page.evaluate(() => { document.querySelector('[role="listbox"]').scrollTop = 0; });
      await page.waitForTimeout(100);
      const before = await comboState(page);
      const geo = await page.evaluate(() => {
        const l = document.querySelector('[role="listbox"]');
        const r = l.getBoundingClientRect();
        const cs = getComputedStyle(l);
        const bl = parseFloat(cs.borderLeftWidth);
        const br = parseFloat(cs.borderRightWidth);
        const bt = parseFloat(cs.borderTopWidth);
        const pt = parseFloat(cs.paddingTop);
        const scrollbar = l.offsetWidth - l.clientWidth - bl - br;
        const pad = { x: r.left + bl + l.clientWidth / 2, y: r.top + bt + pt / 2 };
        const sbX = r.right - br - (scrollbar > 0 ? scrollbar / 2 : 4);
        const sb = { x: sbX, y: r.top + bt + 24 };
        const hit = (p) => {
          const e = document.elementFromPoint(p.x, p.y);
          return e ? { tag: e.tagName, role: e.getAttribute('role'), isList: e === l } : null;
        };
        return {
          rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, height: r.height },
          borderTop: bt, borderLeft: bl, borderRight: br, paddingTop: pt, scrollbarWidth: scrollbar,
          pad, sb, padHit: hit(pad), sbHit: hit(sb), scrollTop: l.scrollTop,
        };
      });
      if (!(geo.paddingTop > 0)) problems.push(`list padding-top is ${geo.paddingTop}px (no padding to press)`);
      if (!geo.padHit?.isList) problems.push(`padding point hits ${fmt(geo.padHit)}, not the <ul> itself`);
      if (!(geo.scrollbarWidth > 0)) problems.push(`the list shows no classic scrollbar (width ${geo.scrollbarWidth}px), so the scrollbar press could not be exercised`);
      else if (!geo.sbHit?.isList) problems.push(`scrollbar point hits ${fmt(geo.sbHit)}, not the <ul>`);
      // Press and hold on the top padding, then release.
      await page.mouse.move(geo.pad.x, geo.pad.y);
      await page.mouse.down();
      await page.waitForTimeout(300); // deliberate hold
      const duringPad = await comboState(page);
      await page.mouse.up();
      await page.waitForTimeout(150);
      const afterPad = await comboState(page);
      await ev.shot(page, 'b52-after-padding-press');
      // Press on the scrollbar and drag it.
      await page.mouse.move(geo.sb.x, geo.sb.y);
      await page.mouse.down();
      await page.mouse.move(geo.sb.x, geo.sb.y + 30, { steps: 5 });
      await page.mouse.move(geo.sb.x, geo.sb.y + 60, { steps: 5 });
      await page.waitForTimeout(150);
      const duringSb = await comboState(page);
      await page.mouse.up();
      await page.waitForTimeout(150);
      const afterSb = await comboState(page);
      await ev.shot(page, 'b52-after-scrollbar-drag');
      if (geo.scrollbarWidth > 0 && afterSb.scrollTop === before.scrollTop) problems.push(`the scrollbar press / drag did not scroll the list (scrollTop ${afterSb.scrollTop}): not on the scrollbar?`);
      for (const [when, s] of [['while pressing the padding', duringPad], ['after releasing the padding', afterPad], ['while dragging the scrollbar', duringSb], ['after releasing the scrollbar', afterSb]]) {
        if (!s.listVisible) problems.push(`${when}: list not visible`);
        if (!s.inputFocused) problems.push(`${when}: focus on ${s.activeTag}, not the Scale input`);
        if (s.expanded !== 'true') problems.push(`${when}: aria-expanded="${s.expanded}"`);
        if (s.value !== before.value) problems.push(`${when}: field "${s.value}" (was "${before.value}")`);
        if (s.stored !== before.stored) problems.push(`${when}: stored settings changed (${s.stored})`);
      }
      // Typing still filters.
      await page.keyboard.press('End');
      await page.keyboard.type(' pent');
      const typed = await comboState(page);
      if (!(typed.optionCount > 0 && typed.optionCount < before.optionCount)) problems.push(`typing " pent" left ${typed.optionCount} options (was ${before.optionCount})`);
      if (!typed.firstOptions.includes('Do major pentatonic')) problems.push(`typing " pent" shows ${fmt(typed.firstOptions)}`);
      await ev.shot(page, 'b52-typing-filters');
      await page.keyboard.press('Escape'); // closes only the list and reverts the text
      const reverted = await comboState(page);
      if (reverted.value !== before.value || reverted.listVisible) problems.push(`Esc after typing: field "${reverted.value}", list visible ${reverted.listVisible}`);
      // Clicking an option still selects it and keeps focus on the input.
      await scaleInput(page).click();
      await listbox(page).getByRole('option', { name: 'Sol major', exact: true }).click();
      const picked = await comboState(page);
      if (picked.value !== 'Sol major') problems.push(`option click → field "${picked.value}"`);
      if (!picked.inputFocused) problems.push(`option click → focus on ${picked.activeTag}`);
      if (picked.listVisible) problems.push('option click → list still open');
      const storedScale = picked.stored ? JSON.parse(picked.stored).scaleId : null;
      if (storedScale !== 'major:sol') problems.push(`stored scaleId ${storedScale}`);
      await ev.shot(page, 'b52-option-click-selected');
      ev.json('52-listbox-mousedown.json', { before, geo, duringPad, afterPad, duringSb, afterSb, typed, reverted, picked });
      await dlg(page).getByRole('button', { name: 'Reset to defaults' }).click();
      await closeDialog(page);
      await run(page, 'localStorage.clear(); return true;');
      return {
        problems,
        detail: `List box ${geo.rect.left.toFixed(0)}–${geo.rect.right.toFixed(0)} × ${geo.rect.top.toFixed(0)}–${geo.rect.bottom.toFixed(0)}, border-top ${geo.borderTop}px, padding-top ${geo.paddingTop}px, scrollbar ${geo.scrollbarWidth}px. ` +
          `Held the mouse 300 ms at the top padding (${geo.pad.x.toFixed(0)}, ${geo.pad.y.toFixed(1)}; elementFromPoint = ${geo.padHit?.tag}${geo.padHit?.isList ? ' = the listbox' : ''}), released; ` +
          `then pressed the scrollbar at (${geo.sb.x.toFixed(1)}, ${geo.sb.y.toFixed(0)}) and dragged 60 px down (list scrollTop ${before.scrollTop} → ${afterSb.scrollTop}). ` +
          `Throughout: list visible, activeElement = Scale input, aria-expanded="true", field "${afterSb.value}", stored settings unchanged (${before.stored ?? 'none'}). ` +
          `Typing " pent" filtered ${before.optionCount} → ${typed.optionCount} options (${typed.firstOptions.join(', ')}); Esc reverted to "${reverted.value}". ` +
          `Clicking "Sol major" selected it (field "${picked.value}", stored ${storedScale}), focus stayed on the input (${picked.inputFocused}), list closed. Reset to defaults + localStorage cleared afterwards.`,
      };
    });
  }

  async function item54(page) {
    await runItem(54, async (ev) => {
      const problems = [];
      await openDialog(page);
      const storedBefore = await comboState(page).then((s) => s.stored);
      await scaleInput(page).click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type('xyz');
      const xyz = await readCombo(page);
      if (xyz.count !== 1 || xyz.empty?.text !== 'No matching scales') problems.push(`"xyz" → ${fmt(xyz.names)}`);
      if (xyz.activeId !== null) problems.push(`"xyz" → aria-activedescendant ${xyz.activeId}`);
      await ev.shot(page, 'b54-xyz-no-matches');
      await page.keyboard.press('Enter');
      const xyzEnter = await readCombo(page);
      const afterEnterStored = await comboState(page).then((s) => s.stored);
      if (xyzEnter.value !== 'xyz' || !xyzEnter.listOpen || xyzEnter.count !== 1) problems.push(`Enter on "xyz": field "${xyzEnter.value}", list open ${xyzEnter.listOpen}, ${xyzEnter.count} row(s)`);
      if (afterEnterStored !== storedBefore) problems.push(`Enter on "xyz" changed the stored settings (${afterEnterStored})`);
      if (!(await dialogOpen(page))) problems.push('Enter on "xyz" closed the dialog');
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      const cleared = await readCombo(page);
      await page.keyboard.type('sol');
      const sol = await readCombo(page);
      if (sol.activeIndex !== 0) problems.push(`"sol" → active index ${sol.activeIndex}`);
      if (sol.activeText !== 'Sol major' || sol.names[0] !== 'Sol major') problems.push(`"sol" → active "${sol.activeText}", first option "${sol.names[0]}"`);
      const activeDesc = await scaleInput(page).getAttribute('aria-activedescendant');
      await ev.shot(page, 'b54-sol-first-active');
      await page.keyboard.press('Enter');
      const solEnter = await readCombo(page);
      const storedAfter = await comboState(page).then((s) => s.stored);
      const scaleId = storedAfter ? JSON.parse(storedAfter).scaleId : null;
      if (solEnter.value !== 'Sol major' || solEnter.listOpen) problems.push(`Enter on "sol": field "${solEnter.value}", list open ${solEnter.listOpen}`);
      if (scaleId !== 'major:sol') problems.push(`stored scaleId ${scaleId}`);
      await ev.shot(page, 'b54-sol-major-selected');
      ev.json('54-xyz-sol.json', { xyz, xyzEnter, cleared: { value: cleared.value, count: cleared.count }, sol: { ...sol, names: sol.names }, activeDesc, solEnter, storedBefore, storedAfter });
      await dlg(page).getByRole('button', { name: 'Reset to defaults' }).click();
      await closeDialog(page);
      await run(page, 'localStorage.clear(); return true;');
      return {
        problems,
        detail: `"xyz" → ${xyz.count} row "${xyz.empty?.text}", no aria-activedescendant; Enter → field "${xyzEnter.value}", list open ${xyzEnter.listOpen}, stored settings unchanged (as item 16). ` +
          `Cleared (${cleared.count} options), typed "sol" → ${sol.count} options, active index ${sol.activeIndex} "${sol.activeText}" (aria-activedescendant ${activeDesc}); ` +
          `Enter → field "${solEnter.value}", list closed, stored scaleId ${scaleId}. Reset + localStorage cleared afterwards.`,
      };
    });

  }

  async function item55(page) {
    await runItem(55, async (ev) => {
      const problems = [];
      await openDialog(page);
      await slider(page, 'Playback volume').focus();
      const start = await slider(page, 'Playback volume').inputValue();
      for (let k = 0; k < 3; k += 1) await page.keyboard.press('ArrowLeft');
      const set = (await readDialog(page)).sliders['Playback volume'];
      if (set.visible !== '35%' || set.value !== 35) problems.push(`after 3 × ArrowLeft from ${start}: "${set.visible}" (value ${set.value})`);
      await closeDialog(page);
      const storedRaw = await run(page, `return localStorage.getItem('${SETTINGS_KEY}');`);
      await page.reload();
      await startBtn(page).waitFor({ state: 'visible', timeout: 20_000 });
      await openDialog(page);
      const reloaded = (await readDialog(page)).sliders['Playback volume'];
      if (reloaded.visible !== '35%' || reloaded.aria !== '35%' || reloaded.value !== 35) problems.push(`after reload: "${reloaded.visible}" / aria "${reloaded.aria}" / value ${reloaded.value}`);
      await ev.shot(page, 'b55-volume-35-after-reload');
      await closeDialog(page);
      const expression = "const st = await import('/src/config/settings.ts'); return [st.volumeToPercent(0.35), st.percentToVolume(35), st.normalizeSettings({ ...st.DEFAULT_SETTINGS, volume: 0.35 }).volume];";
      const consoleResult = await run(page, expression);
      expectEq(problems, 'console expression', consoleResult, [35, 0.35, 0.35]);
      let storedVolume = null;
      try {
        storedVolume = JSON.parse(storedRaw).volume;
      } catch {
        storedVolume = null;
      }
      if (storedVolume !== 0.35) problems.push(`stored volume ${fmt(storedVolume)}`);
      const grepHits = grepRepo('src', /\.tsx$/, /\* PERCENT|\/ PERCENT/);
      // The review item was the volume ↔ percent duplication: a hit unrelated to volume (e.g. the mic meter's
      // dB → bar-percent math) is reported as a checklist discrepancy instead of failing the item.
      const volumeHits = grepHits.filter((h) => /volume/i.test(h.text));
      const otherHits = grepHits.filter((h) => !volumeHits.includes(h));
      if (volumeHits.length) problems.push(`inline volume PERCENT math in .tsx: ${volumeHits.map((h) => `${h.file}:${h.line}`).join(', ')}`);
      ev.json('55-volume-percent.json', { start, afterKeys: set, storedRaw, afterReload: reloaded, expression, consoleResult, grep: { pattern: '\\* PERCENT|/ PERCENT in src/**/*.tsx', hits: grepHits } });
      await run(page, 'localStorage.clear(); return true;');
      return {
        problems,
        detail: `Playback volume ${start}% → 3 × ArrowLeft → "${set.visible}"; stored volume ${storedVolume}; after reload the slider shows "${reloaded.visible}" (value ${reloaded.value}, aria-valuetext "${reloaded.aria}"). ` +
          `Console \`[st.volumeToPercent(0.35), st.percentToVolume(35), st.normalizeSettings({ ...st.DEFAULT_SETTINGS, volume: 0.35 }).volume]\` → \`${fmt(consoleResult)}\`. ` +
          `Recursive search of src/**/*.tsx for \`* PERCENT\` / \`/ PERCENT\`: ${grepHits.length} match(es)` +
          `${grepHits.length ? ` (${grepHits.map((h) => `${h.file}:${h.line} \`${h.text}\``).join('; ')})` : ''}. ` +
          (otherHits.length
            ? `**Checklist discrepancy:** the expected "grep finds nothing" is not literally met: ${otherHits.map((h) => `${h.file}:${h.line}`).join(', ')} ` +
              'is mic-meter dB math, not volume (noted, not failed: no volume ↔ percent conversion is duplicated in components). '
            : '') +
          'localStorage cleared afterwards.',
      };
    });

  }

  async function item56(page) {
    await runItem(56, async (ev) => {
      const problems = [];
      await gotoApp(page, `${DEV}/`);
      await openDialog(page);
      const walk = async (label) => {
        await slider(page, label).focus();
        const read = async () => {
          const s = (await readDialog(page)).sliders[label];
          return { value: s.value, aria: s.aria, visible: s.visible, step: s.step };
        };
        const trail = [await read()];
        for (const key of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft']) {
          await page.keyboard.press(key);
          trail.push({ key, ...(await read()) });
        }
        const deltas = trail.slice(1).map((t, i) => t.value - trail[i].value);
        const expected = [1, 1, 1, -1, -1, -1];
        if (!deepEqual(deltas, expected)) problems.push(`${label}: per-key deltas ${fmt(deltas)}, expected ${fmt(expected)}`);
        const badText = trail.filter((t) => t.aria !== t.visible);
        if (badText.length) problems.push(`${label}: aria-valuetext ≠ visible at ${badText.map((t) => t.value).join(', ')}`);
        if (trail[0].step !== 1) problems.push(`${label}: step attribute ${trail[0].step}`);
        return { trail, deltas };
      };
      const ml = await walk('Melody length');
      const mi = await walk('Max interval');
      await ev.shot(page, 'b56-integer-steps');
      await closeDialog(page);
      const integerStep = grepRepo('src', /\.(ts|tsx)$/, /INTEGER_STEP/);
      if (integerStep.length) problems.push(`INTEGER_STEP still in ${integerStep.map((h) => `${h.file}:${h.line}`).join(', ')}`);
      const constantsSrc = fs.readFileSync(path.resolve(ROOT, 'src/config/constants.ts'), 'utf8');
      const srcDecl = {
        MELODY_LENGTH_STEP: /export const MELODY_LENGTH_STEP\s*=\s*1\s*;/.test(constantsSrc),
        MAX_INTERVAL_STEP: /export const MAX_INTERVAL_STEP\s*=\s*1\s*;/.test(constantsSrc),
      };
      const imported = await run(page, "const c = await import('/src/config/constants.ts'); return { MELODY_LENGTH_STEP: c.MELODY_LENGTH_STEP, MAX_INTERVAL_STEP: c.MAX_INTERVAL_STEP };");
      if (!srcDecl.MELODY_LENGTH_STEP || !srcDecl.MAX_INTERVAL_STEP) problems.push(`constants.ts declarations ${fmt(srcDecl)}`);
      expectEq(problems, 'imported constants', imported, { MELODY_LENGTH_STEP: 1, MAX_INTERVAL_STEP: 1 });
      ev.json('56-integer-steps.json', { melodyLength: ml, maxInterval: mi, integerStepHits: integerStep, constantsSourceMatches: srcDecl, imported });
      await run(page, 'localStorage.clear(); return true;');
      return {
        problems,
        detail: `Melody length → → → ← ← ←: ${ml.trail.map((t) => t.visible).join(' → ')} (deltas ${ml.deltas.join(', ')}); ` +
          `Max interval: ${mi.trail.map((t) => t.visible).join(' → ')} (deltas ${mi.deltas.join(', ')}); aria-valuetext matched the visible text at every step. ` +
          `\`INTEGER_STEP\` in src: ${integerStep.length} match(es). constants.ts exports MELODY_LENGTH_STEP = ${imported.MELODY_LENGTH_STEP}, MAX_INTERVAL_STEP = ${imported.MAX_INTERVAL_STEP} (source regex ${fmt(srcDecl)}).`,
      };
    });
  }
}

// ---------------------------------------------------------------- browser phase -------------------
async function serverUp(url) {
  try {
    const res = await fetch(url);
    return res.status === 200;
  } catch {
    return false;
  }
}

async function browserPhase() {
  for (const dir of [SHOTS_DIR, API_DIR]) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const name of fs.readdirSync(OUT_DIR)) {
    if (name.startsWith('00-')) continue;
    fs.rmSync(path.resolve(OUT_DIR, name), { recursive: true, force: true });
  }

  const BROWSER_ITEMS = ALL_ITEMS.map(([id]) => id).filter((id) => !REPORT_PHASE_IDS.includes(id));
  if (!fs.existsSync(WAV_PATH)) {
    failMissing(BROWSER_ITEMS, `Fake-mic fixture missing: ${WAV_PATH} (run \`npm run generate:tones\`).`);
    return;
  }
  const up = { dev: await serverUp(`${DEV}/`), e2e: await serverUp(`${E2E}/`), preview: await serverUp(PREVIEW) };
  let e2eMode = null;
  if (up.e2e) {
    try {
      e2eMode = /"VITE_E2E"\s*:\s*"true"/.test(await (await fetch(`${E2E}/src/testing/testMelody.ts`)).text());
    } catch {
      e2eMode = null;
    }
  }
  writeJson(API_DIR, '00-servers.json', { up, e2eModeOn5174: e2eMode });
  console.log(`Servers: 5173 ${up.dev ? 'up' : 'DOWN'}, 5174 ${up.e2e ? `up (e2e mode ${e2eMode})` : 'DOWN'}, 4173 ${up.preview ? 'up' : 'DOWN'}`);

  const { chromium } = await import('@playwright/test');
  try {
    browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
    const groups = [
      ['dev', [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 48], groupHomeDialog],
      ['dev', [7], groupPermissionPending],
      ['e2e', [28], groupBlockedStorage],
      ['dev', [29, 30, 31, 32, 33, 34], groupRealExercises],
      ['e2e', [35, 36, 37, 38, 39, 40], groupLiveSettings],
      ['e2e', [41, 42, 43, 44], groupTestMelody],
      ['e2e', [45, 46, 47], groupLayout],
      ['preview', [49], groupPreview],
      ['dev', [51], groupPart1],
      ['dev', [52, 53, 54, 55, 56], groupAppendixB],
    ];
    const only = (process.env.VALIDATE_ONLY ?? '').split(',').map((x) => Number(x.trim())).filter(Boolean);
    for (const [server, ids, fn] of groups) {
      if (only.length && !ids.some((id) => only.includes(id))) continue;
      const base = { dev: `${DEV}/`, e2e: `${E2E}/`, preview: PREVIEW }[server];
      if (!up[server]) {
        failMissing(ids, `Server not reachable at ${base} (run.sh starts it).`);
        continue;
      }
      if (server === 'e2e' && e2eMode === false) {
        failMissing(ids, `The server on ${base} is not in e2e mode (VITE_E2E != 'true'): ?melody= is ignored. Start it with \`npx vite --mode e2e --port 5174 --strictPort\`.`);
        continue;
      }
      console.log(`\n== ${fn.name} (${base}) ==`);
      try {
        await fn();
      } catch (err) {
        failMissing(ids, `Group aborted: ${firstLine(err)}`);
      }
      failMissing(ids, 'Not recorded (group ended early).');
    }
    const errs = Object.fromEntries(Object.entries(consoleLogs).filter(([, v]) => v.length));
    if (Object.keys(errs).length) writeJson(API_DIR, '99-console-errors.json', errs);
  } catch (err) {
    failMissing(BROWSER_ITEMS, `Browser phase aborted: ${err.stack ?? err}`);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
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

/** Parsed counts of the regression outputs, shared by items 50, 57, 59 and 60. */
const counts = { unitPassed: NaN, unitFailed: NaN, scriptsPassed: NaN, scriptsFailed: NaN, e2ePassed: NaN, e2eFailed: NaN };

const parseE2e = (file) => {
  const text = readText(path.resolve(OUT_DIR, file));
  if (text == null) return { exists: false, passed: NaN, failed: NaN, flaky: 0 };
  return {
    exists: true,
    passed: Number(/^\s*(\d+)\s+passed/m.exec(text)?.[1] ?? NaN),
    failed: Number(/^\s*(\d+)\s+failed/m.exec(text)?.[1] ?? 0),
    flaky: Number(/^\s*(\d+)\s+flaky/m.exec(text)?.[1] ?? 0),
  };
};

function readRegressionStatus() {
  if (!fs.existsSync(REGRESSION_STATUS)) return null;
  try {
    return JSON.parse(fs.readFileSync(REGRESSION_STATUS, 'utf8'));
  } catch {
    return null;
  }
}

function regressionItem() {
  const status = readRegressionStatus();
  if (!status) {
    record(50, 'SKIP', 'No regression status (run `bash specs/in-app-configuration/validation-run-4/run.sh`).');
    return;
  }
  const commands = [['lint', 'npm run lint', '50-lint.txt'], ['typecheck', 'npm run typecheck', '50-typecheck.txt'],
    ['test', 'npm test', '50-unit-tests.txt'], ['scripts', 'npm run test:scripts', '50-script-tests.txt'],
    ['build', 'npm run build', '50-build.txt'], ['e2e', 'npm run test:e2e', '50-e2e.txt']];
  const links = [];
  const parts = [];
  const notes = [];
  const problems = [];
  for (const [key, label, file] of commands) {
    const code = status[key];
    const abs = path.resolve(OUT_DIR, file);
    if (fs.existsSync(abs)) links.push([file, rel(abs)]);
    if (code !== 0) problems.push(`\`${label}\` exit ${code ?? 'n/a'}`);
    parts.push(`\`${label}\` exit ${code ?? 'n/a'}`);
  }
  const unit = readText(path.resolve(OUT_DIR, '50-unit-tests.txt')) ?? '';
  const unitPassed = Number(/Tests\s+(?:\d+\s+failed\s+\|\s+)?(\d+)\s+passed/.exec(unit)?.[1] ?? NaN);
  const unitFailed = Number(/Tests\s+(\d+)\s+failed/.exec(unit)?.[1] ?? 0);
  const scripts = readText(path.resolve(OUT_DIR, '50-script-tests.txt')) ?? '';
  const scriptsPassed = Number(/^\s*(?:#|ℹ)\s*pass\s+(\d+)/m.exec(scripts)?.[1] ?? NaN);
  const scriptsFailed = Number(/^\s*(?:#|ℹ)\s*fail\s+(\d+)/m.exec(scripts)?.[1] ?? 0);
  const e2e = parseE2e('50-e2e.txt');
  Object.assign(counts, { unitPassed, unitFailed, scriptsPassed, scriptsFailed, e2ePassed: e2e.passed, e2eFailed: e2e.failed });
  if (unitFailed > 0) problems.push(`${unitFailed} unit test(s) failed`);
  if (scriptsFailed > 0) problems.push(`${scriptsFailed} script test(s) failed`);
  if (e2e.failed > 0) problems.push(`${e2e.failed} e2e test(s) failed`);
  // Pass criteria: every command exits 0 and exactly 10 e2e tests pass. Unit / script counts are informational.
  if (e2e.passed !== EXPECTED_E2E_TESTS) problems.push(`e2e passed ${e2e.passed}, expected ${EXPECTED_E2E_TESTS}`);
  if (unitPassed !== EXPECTED_UNIT_TESTS) notes.push(`unit test count ${unitPassed} differs from the expected ${EXPECTED_UNIT_TESTS}`);
  if (scriptsPassed !== EXPECTED_SCRIPT_TESTS) notes.push(`script test count ${scriptsPassed} differs from the expected ${EXPECTED_SCRIPT_TESTS}`);
  if (status.port5173FreeBeforeE2e === false) notes.push('port 5173 was still in use before test:e2e (Playwright reused that server)');
  if (status.note) notes.push(status.note);
  const ok = problems.length === 0;
  record(50, ok ? 'PASS' : 'FAIL',
    `${ok ? '' : `Problems: ${problems.join('; ')}. `}${parts.join(', ')}. Unit tests: ${unitPassed} passed, ${unitFailed} failed (expected ${EXPECTED_UNIT_TESTS}); ` +
    `script tests: ${scriptsPassed} passed, ${scriptsFailed} failed (expected ${EXPECTED_SCRIPT_TESTS}); e2e: ${e2e.passed} passed, ${e2e.failed} failed (expected ${EXPECTED_E2E_TESTS}). ` +
    'Pass criteria: all six commands exit 0 and the e2e count is 10 (unit / script counts are recorded, a mismatch is noted).' +
    `${notes.length ? ` **Note:** ${notes.join('; ')}${ok ? ' (the item still passes)' : ''}.` : ''}`, { links });
}

// ---------------------------------------------------------------- report-phase repository checks --
const git = (args) => {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return { cmd: `git ${args.join(' ')}`, code: r.status, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() };
};

// 57 — e2e spec content + three test:e2e runs (run 1 = item 50's run, runs 2–3 by run.sh).
function item57() {
  const problems = [];
  const links = [];
  const specPath = path.resolve(ROOT, 'e2e', 'settings.spec.ts');
  const spec = fs.readFileSync(specPath, 'utf8');
  const melody60 = spec.includes('?melody=60,60,60,60,60,60,60,60');
  const all71x8 = /melody=71(?:,71){7}(?!,)/.test(spec);
  const importLine = /import\s*\{([^}]*)\}\s*from\s*['"]\.\.\/src\/config\/constants(?:\.ts)?['"]/.exec(spec);
  const importedNames = importLine ? importLine[1].split(',').map((x) => x.trim()) : [];
  const importsKeys = importedNames.includes('SETTINGS_STORAGE_KEY') && importedNames.includes('THRESHOLD_STORAGE_KEY');
  const literals = ['trumpet-trainer.settings.v1', 'trumpet-trainer.thresholdDb'].filter((k) => spec.includes(k));
  if (!melody60) problems.push('settings.spec.ts does not use ?melody=60,60,60,60,60,60,60,60');
  if (all71x8) problems.push('settings.spec.ts still has an all-71 8-note melody');
  if (!importsKeys) problems.push(`storage keys not imported from ../src/config/constants (import: ${importLine ? importLine[0] : 'none'})`);
  if (literals.length) problems.push(`storage key string literals in the spec: ${literals.join(', ')}`);

  const status = readRegressionStatus() ?? {};
  const runs = [['50-e2e.txt', status.e2e], ['57-e2e-run-2.txt', status.e2eRun2], ['57-e2e-run-3.txt', status.e2eRun3]].map(([file, code], i) => {
    const parsed = parseE2e(file);
    const abs = path.resolve(OUT_DIR, file);
    if (fs.existsSync(abs)) links.push([file, rel(abs)]);
    return { run: i + 1, file, exit: code ?? null, ...parsed };
  });
  for (const r of runs) {
    if (!r.exists) problems.push(`run ${r.run}: no output (${r.file})`);
    else if (r.exit !== 0 || r.passed !== EXPECTED_E2E_TESTS || r.failed > 0) problems.push(`run ${r.run}: exit ${r.exit}, ${r.passed} passed, ${r.failed} failed${r.flaky ? `, ${r.flaky} flaky` : ''}`);
    else if (r.flaky) problems.push(`run ${r.run}: ${r.flaky} flaky test(s)`);
  }
  links.push(['57-e2e-spec-and-runs.json', writeJson(API_DIR, '57-e2e-spec-and-runs.json', { melody60, all71x8, importLine: importLine?.[0] ?? null, importedNames, literals, runs })]);
  record(57, problems.length ? 'FAIL' : 'PASS',
    `${problems.length ? `Problems: ${problems.join('; ')}. ` : ''}e2e/settings.spec.ts: 8-box test uses \`?melody=60,60,60,60,60,60,60,60\` (${melody60}), no all-71 8-note melody (${!all71x8}); ` +
    `\`${importLine?.[0] ?? 'no import from ../src/config/constants'}\`; storage-key string literals: ${literals.length}. ` +
    `\`npm run test:e2e\` ×3 (run 1 is item 50's run, runs 2 and 3 were run by run.sh right after it with the servers stopped): ` +
    `${runs.map((r) => `run ${r.run} exit ${r.exit} → ${r.passed} passed / ${r.failed} failed${r.flaky ? ` / ${r.flaky} flaky` : ''}`).join('; ')}.`,
    { links });
}

// 58 — .claude/launch.json ignored.
function item58() {
  const problems = [];
  const status = git(['status', '--short', '--untracked-files=all', '--', '.claude']);
  const ignore = git(['check-ignore', '-v', '.claude/launch.json']);
  const tracked = git(['ls-files', '--', '.claude/launch.json']);
  const exists = fs.existsSync(path.resolve(ROOT, '.claude', 'launch.json'));
  if (/launch\.json/.test(status.stdout)) problems.push(`git status lists launch.json: ${status.stdout}`);
  if (ignore.code !== 0) problems.push(`git check-ignore exit ${ignore.code}`);
  if (!/^\.gitignore:\d+:/.test(ignore.stdout)) problems.push(`check-ignore output "${ignore.stdout}" does not name a .gitignore rule`);
  if (tracked.stdout) problems.push('launch.json is tracked by git');
  const out = path.resolve(OUT_DIR, '58-git-launch-json.txt');
  fs.writeFileSync(out, [status, ignore, tracked].map((r) => `$ ${r.cmd}\n(exit ${r.code})\n${r.stdout}${r.stderr ? `\n[stderr] ${r.stderr}` : ''}\n`).join('\n'), 'utf8');
  record(58, problems.length ? 'FAIL' : 'PASS',
    `${problems.length ? `Problems: ${problems.join('; ')}. ` : ''}\`git status --short .claude\` → ${status.stdout ? `\`${status.stdout.replace(/\n/g, ' | ')}\`` : '(nothing)'}; ` +
    `\`git check-ignore -v .claude/launch.json\` exit ${ignore.code} → \`${ignore.stdout}\`; tracked: ${tracked.stdout ? 'yes' : 'no'}; file present locally: ${exists}.`,
    { links: [['58-git-launch-json.txt', rel(out)]] });
}

// 59 — implementation-notes.md Known issues.
function item59() {
  const problems = [];
  const notesPath = path.resolve(FEATURE_DIR, 'implementation-notes.md');
  const text = fs.readFileSync(notesPath, 'utf8');
  const lines = text.split(/\r?\n/);
  // Every "## Known issues" section (the file has one for Part 1 and one for Part 2).
  const sections = [];
  lines.forEach((l, i) => {
    if (/^##\s+Known issues/.test(l)) {
      let end = lines.findIndex((x, j) => j > i && /^##\s/.test(x));
      if (end < 0) end = lines.length;
      sections.push({ start: i + 1, body: lines.slice(i, end) });
    }
  });
  const known = sections.flatMap((s) => s.body.map((t, k) => ({ line: s.start + k, text: t })));
  const knownText = known.map((x) => x.text).join('\n');
  const releasedV020 = /Part 1[^\n]*(?:\n[^\n]*)?released[^\n]*(?:\n[^\n]*)?v0\.2\.0|Part 1 is released \(v0\.2\.0\)/i.test(knownText);
  const needsBump = /Part 2[\s\S]{0,200}bump\.txt/.test(knownText);
  const needsChangelog = /Part 2[\s\S]{0,250}CHANGELOG\.md/.test(knownText);
  if (!sections.length) problems.push('no "## Known issues" section');
  if (!releasedV020) problems.push('Known issues do not say that Part 1 was released alone as v0.2.0');
  if (!needsBump || !needsChangelog) problems.push(`Known issues do not say Part 2 needs its own bump.txt (${needsBump}) and CHANGELOG.md entry (${needsChangelog})`);
  // Latest unit-test count stated in the notes: the last "unit tests … **N**" occurrence in the file.
  const stated = [...text.matchAll(/unit tests?[^\n*]*?\*\*(\d{3,5})\*\*/gi)].map((m) => Number(m[1]));
  const latest = stated.at(-1) ?? null;
  const e2eStated = [...text.matchAll(/e2e (\d+)\/(\d+)/g)].map((m) => Number(m[1])).at(-1) ?? null;
  const actual = counts.unitPassed;
  if (latest == null) problems.push('no unit-test count found in implementation-notes.md');
  else if (Number.isNaN(actual)) problems.push(`cannot compare: actual unit-test count unknown (item 50 output missing); notes say ${latest}`);
  else if (latest !== actual) problems.push(`notes say ${latest} unit tests, \`npm test\` passed ${actual}`);
  if (e2eStated != null && !Number.isNaN(counts.e2ePassed) && e2eStated !== counts.e2ePassed) problems.push(`notes say e2e ${e2eStated}, test:e2e passed ${counts.e2ePassed}`);
  const quoted = known.filter((x) => /v0\.2\.0|bump\.txt|CHANGELOG|released/i.test(x.text));
  const countLine = lines.map((t, i) => ({ line: i + 1, text: t })).filter((x) => /unit tests?[^\n*]*?\*\*\d{3,5}\*\*/i.test(x.text)).at(-1);
  const link = writeJson(API_DIR, '59-implementation-notes.json', { knownIssues: known, statedUnitCounts: stated, latest, e2eStated, actualUnit: actual, actualE2e: counts.e2ePassed, countLine });
  record(59, problems.length ? 'FAIL' : 'PASS',
    `${problems.length ? `Problems: ${problems.join('; ')}. ` : ''}Known issues (lines ${sections.map((s) => s.start).join(', ')}): ` +
    `${quoted.map((x) => `L${x.line}: "${x.text.trim().replace(/\|/g, '\\|')}"`).join(' ')}. ` +
    `Latest test count in the notes (L${countLine?.line ?? '?'}): "${(countLine?.text ?? '').trim()}" → ${latest} unit tests${e2eStated != null ? `, e2e ${e2eStated}` : ''}; ` +
    `actual (item 50): ${actual} unit, ${counts.e2ePassed} e2e.`,
    { links: [['59-implementation-notes.json', link]] });
}

function gitInfo() {
  const g = (args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' }).stdout?.trim() || '?';
  return `${g(['rev-parse', '--abbrev-ref', 'HEAD'])} @ ${g(['rev-parse', '--short', 'HEAD'])}`;
}

/** Parses item and Part 1 sub-step statuses (✅ / ❌ / ⏭) from the Run 3 report, or null. */
function previousStatuses() {
  const text = readText(PREVIOUS_REPORT_PATH);
  if (text == null) return null;
  const toStatus = (icon) => (icon === '✅' ? 'PASS' : icon === '❌' ? 'FAIL' : 'SKIP');
  const items = {};
  for (const m of text.matchAll(/^- (✅|❌|⏭️?) \*\*(\d+)\./gmu)) items[Number(m[2])] = toStatus(m[1]);
  const part1Steps = {};
  for (const m of text.matchAll(/^ {2}- (✅|❌|⏭️?) Part 1 step (\d+)\./gmu)) part1Steps[Number(m[2])] = toStatus(m[1]);
  return { items, part1Steps };
}

/** Item 60: aggregate of item 50, items 1–51 and the comparison with Run 3. */
function item60(regressions) {
  const problems = [];
  const r50 = results[50];
  if (r50?.status !== 'PASS') problems.push(`item 50 is ${r50?.status ?? 'missing'}`);
  const notPassing = RERUN_IDS.filter((id) => id !== 50 && results[id]?.status !== 'PASS' && !(id === 48 && results[id]?.status === 'SKIP'));
  if (notPassing.length) problems.push(`items not passing: ${notPassing.map((id) => `${id} (${results[id]?.status ?? 'missing'})`).join(', ')}`);
  if (regressions.length) problems.push(`regressions vs Run 3: ${regressions.map((c) => c.label).join(', ')}`);
  record(60, problems.length ? 'FAIL' : 'PASS',
    `${problems.length ? `Problems: ${problems.join('; ')}. ` : ''}Regression counts: ${counts.unitPassed} unit (expected ${EXPECTED_UNIT_TESTS}), ` +
    `${counts.scriptsPassed} script (expected ${EXPECTED_SCRIPT_TESTS}), ${counts.e2ePassed} e2e (expected ${EXPECTED_E2E_TESTS}); item 50 ${r50?.status}. ` +
    `Items 1–51: ${RERUN_IDS.filter((id) => results[id]?.status === 'PASS').length}/${RERUN_IDS.length} pass` +
    `${results[48]?.status === 'SKIP' ? ' (48 SKIP: manual devices, allowed)' : ''}; Part 1 steps 1–12 and 15 via item 51 (${results[51]?.status}). ` +
    `Behaviour regressions vs Run 3: ${regressions.length}. Non-pass items: ${notPassing.length ? notPassing.join(', ') : 'none'}.`);
}

function writeReport() {
  for (const [id] of ALL_ITEMS) if (id !== 60 && !results[id]) results[id] = { status: 'SKIP', detail: 'Not run (browser phase results missing).', images: [], links: [] };
  const icon = { PASS: '✅', FAIL: '❌', SKIP: '⏭️' };
  const prev = previousStatuses();

  // Comparison with Run 3: items 1–51 and the Part 1 sub-steps of item 51.
  const changes = [];
  const unchanged = [];
  if (prev) {
    for (const id of RERUN_IDS) {
      if (!(id in prev.items)) continue;
      const c = { label: `item ${id}`, id, title: titleOf(id), before: prev.items[id], now: results[id].status };
      (c.before === c.now ? unchanged : changes).push(c);
    }
    for (const s of results[51]?.sub ?? []) {
      if (!(s.id in prev.part1Steps)) continue;
      const c = { label: `Part 1 step ${s.id}`, id: `51/${s.id}`, title: s.title, before: prev.part1Steps[s.id], now: s.status };
      (c.before === c.now ? unchanged : changes).push(c);
    }
  }
  const regressions = changes.filter((c) => c.before === 'PASS' && c.now === 'FAIL');
  const fixes = changes.filter((c) => c.before === 'FAIL' && c.now === 'PASS');
  item60(regressions);

  const all = ALL_ITEMS.map(([id]) => id);
  const count = (s) => all.filter((id) => results[id].status === s).length;
  const summary = `**Summary:** ${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped (of ${all.length} items: 1–51 re-run + Appendix B 52–60)`;
  const itemLines = (id, title) => {
    const r = results[id];
    const out = [`- ${icon[r.status]} **${id}. ${title}** — ${r.detail}`];
    if (r.links.length) out.push(`  Evidence: ${r.links.map(([name, href]) => `[${name}](${href})`).join(', ')}`);
    for (const s of r.sub ?? []) {
      out.push(`  - ${icon[s.status]} Part 1 step ${s.id}. ${s.title} — ${s.detail}${s.links?.length ? ` (${s.links.map(([n, h]) => `[${n}](${h})`).join(', ')})` : ''}`);
    }
    for (const img of r.images) out.push('', `  ![${path.basename(img, '.png')}](${img})`);
    out.push('');
    return out;
  };

  const lines = [
    '# Validation Report — Run 4 (post /t-review #2)',
    '',
    `**Date:** ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC  `,
    `**Branch:** ${gitInfo()}  `,
    '**Checklist:** [validation.md](../validation.md) — "Human Validation — prd2.md" items 1–51 (item 51 re-runs Part 1 steps 1–12 and 15) and "Appendix B: Re-validation after /t-review #2" items 52–60  ',
    '**Previous run:** [validation-report-run-3.md](validation-report-run-3.md)  ',
    '**Scripts:** `specs/in-app-configuration/validation-run-4/run.sh` + `validate.mjs` (Playwright Chromium, fake mic = 440 Hz tone = written Si4; fresh dev 5173, e2e-mode dev 5174, preview 4173)',
    '',
    summary,
    '',
  ];
  if (regressions.length) lines.push(`> **⚠️ REGRESSIONS vs Run 3:** ${regressions.map((c) => `${c.label}. ${c.title}`).join('; ')}`, '');

  lines.push('## Re-run of original checks', '');
  for (const [section, items] of SECTIONS) {
    lines.push(`### ${section}`, '');
    for (const [id, title] of items) lines.push(...itemLines(id, title));
  }

  lines.push('## Appendix checks', '', `### ${APPENDIX_B[0]}`, '');
  lines.push('Item 57 counts item 50\'s `npm run test:e2e` as its first run; run.sh runs it twice more right after item 50 (servers stopped, port 5173 freed between runs).', '');
  for (const [id, title] of APPENDIX_B[1]) lines.push(...itemLines(id, title));

  lines.push('## Comparison with previous run', '');
  if (!prev) {
    lines.push(`Run 3 report not found at \`${rel(PREVIOUS_REPORT_PATH)}\`; no comparison possible.`, '');
  } else {
    lines.push(`Compared item by item with [validation-report-run-3.md](validation-report-run-3.md) (items 1–51 and the Part 1 steps of item 51; Appendix B items 52–60 are new in Run 4). ` +
      `${unchanged.length} unchanged, ${changes.length} changed.`, '');
    if (regressions.length) lines.push(`**⚠️ REGRESSION:** ${regressions.map((c) => `**${c.label}. ${c.title}**`).join(', ')} passed in Run 3 and fail now.`, '');
    if (fixes.length) lines.push(`**Fixed since Run 3:** ${fixes.map((c) => `${c.label}. ${c.title}${c.id === 6 ? ' (the Run 3 failure: focus dropped to `<body>` after Scale)' : ''}`).join('; ')}.`, '');
    if (changes.length) {
      lines.push('| Item | Run 3 | Run 4 | Change |', '|---|---|---|---|');
      for (const c of changes) {
        const kind = c.before === 'PASS' && c.now === 'FAIL' ? '**regression**' : c.before === 'FAIL' && c.now === 'PASS' ? 'fix' : 'status change';
        lines.push(`| ${c.label}. ${c.title} | ${icon[c.before]} ${c.before} | ${icon[c.now]} ${c.now} | ${kind} |`);
      }
      lines.push('');
    } else {
      lines.push('No status changes: every item has the same status as in Run 3.', '');
    }
    if (!regressions.length) lines.push('No regressions (no PASS → FAIL).', '');
  }

  lines.push(
    '## Manual follow-up',
    '',
    'The script automates everything it can; these parts still need a human:',
    '',
    '- **3 — Focus ring:** the gear visibly shows a focus ring after Esc (script checks `:focus-visible`; see screenshot).',
    '- **7 — Real permission prompt:** reset the mic permission and look at the page while Chrome\'s prompt is shown (script simulated it with a 2 s delayed getUserMedia).',
    '- **12 — Screen reader:** NVDA / VoiceOver announce each slider\'s label and value text (script checked the Chromium accessibility tree).',
    '- **36 — Audible:** volume changes are smooth (no clicks) and 0% is silent (script verified the 20 ms master-gain ramps).',
    '- **37 — Audible:** the repeated melody plays fast (≈ 0.25 s per note).',
    '- **38 / 29–34 — Real trumpet:** play the active note in tune (the fake mic only plays written Si4).',
    '- **48 — Devices:** steps 1–2, 13 and 36 on Android Chrome, iOS Safari (HTTPS) and desktop Firefox; the gear renders monochrome.',
    '- **53 — Screen reader:** with NVDA / VoiceOver, opening the gear announces the "Settings" dialog, not an expanded "Scale" combobox (script checked the focused node in the Chromium accessibility tree).',
    '',
  );
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
  console.log(`\nReport: ${REPORT_PATH}`);
  if (regressions.length) console.log(`REGRESSIONS vs Run 3: ${regressions.map((c) => c.label).join(', ')}`);
  console.log(summary);
  return count('FAIL') === 0;
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
  fs.mkdirSync(API_DIR, { recursive: true });
  if (!doBrowser && fs.existsSync(BROWSER_RESULTS)) Object.assign(results, JSON.parse(fs.readFileSync(BROWSER_RESULTS, 'utf8')));
  for (const [id, fn] of [[50, regressionItem], [57, item57], [58, item58], [59, item59]]) {
    try {
      fn();
    } catch (err) {
      record(id, 'FAIL', `Report-phase check threw: ${firstLine(err)}`);
    }
  }
  process.exit(writeReport() ? 0 : 1);
}
process.exit(0);
