/* global window, document, AudioContext, AudioNode, AudioDestinationNode, BaseAudioContext, GainNode, MutationObserver -- browser globals used inside page.evaluate / addInitScript callbacks */
// Automated validation of specs/pitch-feedback-graph/validation.md (Run 1).
// Usage (from the repo root, with the three servers of create-environment.sh running):
//   node specs/pitch-feedback-graph/validation-run-1/validate.mjs
// Writes evidence to specs/pitch-feedback-graph/validation-assets/run-1/{screenshots,output}/ and the report to
// specs/pitch-feedback-graph/validation-assets/validation-report-run-1.md. Exit 0 if every step passes, 1 otherwise.
import { chromium, devices } from '@playwright/test';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const ASSETS = join(ROOT, 'specs', 'pitch-feedback-graph', 'validation-assets');
const SHOTS = join(ASSETS, 'run-1', 'screenshots');
const OUT = join(ASSETS, 'run-1', 'output');
const REPORT = join(ASSETS, 'validation-report-run-1.md');
const PRESERVE = new Set(['00-create-environment.txt']);

const DEV = 'http://localhost:5173';
const E2E = 'http://localhost:5174';
const PREVIEW = 'http://localhost:4173/trumpet-trainer/';

// ---------------------------------------------------------------------------------------------------------------
// Evidence directories (idempotent: keep 00-create-environment.txt)
// ---------------------------------------------------------------------------------------------------------------
function prepareDirs() {
  for (const dir of [SHOTS, OUT]) {
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir)) {
      if (dir === OUT && PRESERVE.has(f)) continue;
      rmSync(join(dir, f), { recursive: true, force: true });
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------------------------------------------
const SECTIONS = [
  ['Constants', [1, 2]],
  ['Note helpers', [3, 4]],
  ['Pitch smoother', [5, 6, 7]],
  ['Hold tracker', [8, 9, 10]],
  ['Pitch graph model and view', [11, 12, 13, 14]],
  ['Correct note: reveal pause (app, e2e mode)', [15, 16, 17, 18, 19]],
  ['Wrong note (app, e2e mode)', [20, 21, 22, 23]],
  ['Smoothing (app)', [24, 25]],
  ['Regressions', [26]],
];
const NAMES = {
  1: 'New constants',
  2: 'Existing constants unchanged',
  3: 'hzToMidi',
  4: 'nearestMidi (ties up) and centsOffset',
  5: 'Smoother: first reading unchanged, then EMA',
  6: 'Smoother: a gap resets it',
  7: 'Smoother: frame-rate independent',
  8: 'Hold tracker: progress and a single completion at 500 ms',
  9: 'Hold tracker: a wrong note never fills or completes',
  10: 'Hold tracker: any note completes (octave included)',
  11: 'Graph band half-height and guide levels',
  12: 'Graph Fa/Mi/Fa trail (idea §4.3)',
  13: 'Graph centre and red persist through silence',
  14: 'Graph band-state precedence',
  15: 'Correct note: box green after ~0.5 s, status advances at once',
  16: 'Reveal pause: Repeat disabled, Give up enabled, then Repeat back',
  17: 'Continuous tone: boxes ~1 s apart, not every 0.5 s',
  18: 'Last note: "Well done!" at once, Home ~2 s later',
  19: 'Give up during the reveal pause',
  20: 'Wrong note (440 Hz for Do5) does not advance',
  21: 'Right note (466.16 Hz) accepted as Do5',
  22: 'Octave error (220 Hz for Si4) does not advance',
  23: 'Repeat while stuck keeps progress; fresh 0.5 s hold',
  24: 'Vibrato / unsteady tone still accepted',
  25: 'A gap in the middle restarts the hold',
  26: 'Regressions: live volume, full random exercise, production preview',
};
const results = {}; // n -> { status: 'pass'|'fail'|'skip', detail, shots: [], outputs: [] }

function record(n, status, detail, extra = {}) {
  const prev = results[n] ?? { shots: [], outputs: [] };
  results[n] = {
    status,
    detail,
    shots: [...prev.shots, ...(extra.shots ?? [])],
    outputs: [...prev.outputs, ...(extra.outputs ?? [])],
  };
  const icon = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'SKIP';
  console.log(`[${icon}] ${n}. ${NAMES[n]} — ${detail.replace(/\n/g, ' ')}`);
}
function addShot(n, file) {
  results[n] ??= { status: null, detail: '', shots: [], outputs: [] };
  results[n].shots.push(file);
}
function addOutput(n, file) {
  results[n] ??= { status: null, detail: '', shots: [], outputs: [] };
  results[n].outputs.push(file);
}
const pad = (n) => String(n).padStart(2, '0');
function writeOutput(n, slug, content) {
  const file = `${pad(n)}-${slug}.txt`;
  writeFileSync(join(OUT, file), typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  addOutput(n, file);
  return file;
}
async function shot(page, n, slug) {
  const file = `${pad(n)}-${slug}.png`;
  try {
    await page.screenshot({ path: join(SHOTS, file) });
    addShot(n, file);
  } catch (e) {
    console.log(`  (screenshot ${file} failed: ${e.message})`);
  }
  return file;
}

// Canonical JSON (sorted keys) for deep comparison.
function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v === undefined ? null : v);
}
const fmt = (v) => JSON.stringify(v);
const ms = (x) => `${Math.round(x)} ms`;

// ---------------------------------------------------------------------------------------------------------------
// Steps 1–14: pure modules, run in the page on the dev server (Vite serves /src/... as ES modules)
// ---------------------------------------------------------------------------------------------------------------
const PURE_STEPS = [
  {
    n: 1,
    slug: 'constants-new',
    stmts: "const c = await import('/src/config/constants.ts');",
    expr: '[c.CENTS_PER_SEMITONE, c.NOTE_REVEAL_MS, c.PITCH_SMOOTHING_MS, c.PITCH_TRAIL_MS, c.PITCH_GRAPH_RANGE_CENTS, c.PITCH_GRAPH_DOT_X, c.PITCH_GRAPH_GUIDE_CENTS, c.PITCH_GRAPH_VIEWBOX_WIDTH, c.PITCH_GRAPH_VIEWBOX_HEIGHT, c.PITCH_GRAPH_DOT_RADIUS]',
    expected: [100, 500, 50, 1000, 50, 0.8, 12.5, 320, 200, 6],
  },
  {
    n: 2,
    slug: 'constants-unchanged',
    stmts: '',
    expr: '[c.TOLERANCE_CENTS, c.SUSTAIN_MS, c.DEFAULT_THRESHOLD_DB]',
    expected: [25, 500, -40],
  },
  {
    n: 3,
    slug: 'hz-to-midi',
    stmts: "const n = await import('/src/music/notes.ts');",
    expr: '[n.hzToMidi(440), n.hzToMidi(220), n.hzToMidi(443).toFixed(4), n.hzToMidi(446.5).toFixed(4)]',
    expected: [69, 57, '69.1176', '69.2539'],
  },
  {
    n: 4,
    slug: 'nearest-midi-cents-offset',
    stmts: '',
    expr: '[[69.5, 68.5, 68.49, 69.49].map(n.nearestMidi), [69.5, 68.5, 69.25, 69.49].map((m) => Math.round(n.centsOffset(m)))]',
    expected: [
      [70, 69, 68, 69],
      [-50, -50, 25, 49],
    ],
  },
  {
    n: 5,
    slug: 'smoother-ema',
    stmts: "const ps = await import('/src/audio/pitchSmoother.ts'); const s = ps.createPitchSmoother();",
    expr: '[s.push(0, 69), s.push(20, 70).toFixed(4)]',
    expected: [69, '69.3297'],
  },
  {
    n: 6,
    slug: 'smoother-gap-reset',
    stmts: '',
    expr: '[s.push(40, null), s.push(60, 70)]',
    expected: [null, 70],
  },
  {
    n: 7,
    slug: 'smoother-frame-rate',
    stmts:
      'const run = (step) => { const x = ps.createPitchSmoother(); let v = x.push(0, 69); for (let t = step; t <= 100; t += step) v = x.push(t, 70); return v.toFixed(4); };',
    expr: '[run(10), run(20)]',
    expected: ['69.8647', '69.8647'],
  },
  {
    n: 8,
    slug: 'hold-tracker-progress',
    stmts:
      "const h = await import('/src/training/holdTracker.ts'); const tr = h.createHoldTracker(); const out = []; for (let t = 0; t <= 520; t += 20) { const r = tr.push({ timeMs: t, midi: 69 }, []); if (r.completed !== null || t === 240) out.push([t, r.progress, r.completed]); }",
    expr: 'out',
    expected: [
      [240, 0.48, null],
      [500, 1, 69],
    ],
  },
  {
    n: 9,
    slug: 'hold-tracker-wrong-note',
    stmts:
      'const w = h.createHoldTracker(); let done = null; for (let t = 0; t <= 2000; t += 20) done ??= w.push({ timeMs: t, midi: 69 }, [69]).completed;',
    expr: '[done, w.push({ timeMs: 2020, midi: 69 }, [69]).progress]',
    expected: [null, 0],
  },
  {
    n: 10,
    slug: 'hold-tracker-octave',
    stmts:
      'const o = h.createHoldTracker(); let first = null; for (let t = 0; t <= 600; t += 20) { const r = o.push({ timeMs: t, midi: 57 }, []); if (r.completed !== null && first === null) first = [t, r.completed]; }',
    expr: 'first',
    expected: [500, 57],
  },
  {
    n: 11,
    slug: 'graph-band-guides',
    stmts: "const g = await import('/src/training/pitchGraph.ts');",
    expr: '[g.PITCH_GRAPH_BAND_HALF_HEIGHT, g.PITCH_GRAPH_GUIDE_LEVELS]',
    expected: [0.5, [-0.75, -0.5, -0.25, 0.25, 0.5, 0.75]],
  },
  {
    n: 12,
    slug: 'graph-fa-mi-fa',
    stmts:
      "const feed = (until) => { let m = g.EMPTY_PITCH_GRAPH_MODEL; for (let t = 0; t <= until; t += 20) m = g.advancePitchGraph(m, { timeMs: t, midi: t < 200 || t >= 700 ? 65 : 64 }); return m; }; const show = (m) => { const v = g.computePitchGraphView(m, { progress: 0, wrongNotes: [], revealing: false }); return [m.centre, v.segments.map((s) => s.map((p) => p.x.toFixed(3) + ',' + p.y.toFixed(2)).filter((_, i, a) => i === 0 || i === a.length - 1)), v.dot]; };",
    expr: '[show(feed(900)), show(feed(600))]',
    // At now 600 the checklist specifies only the centre and the segment (the dot is not part of the expectation).
    expected: [
      [
        65,
        [
          ['0.080,0.00', '0.232,-1.00'],
          ['0.632,-1.00', '0.800,0.00'],
        ],
        { x: 0.8, y: 0 },
      ],
      [64, [['0.472,1.00', '0.800,0.00']]],
    ],
    compare: (actual, expected) =>
      Array.isArray(actual) &&
      canon(actual[0]) === canon(expected[0]) &&
      Array.isArray(actual[1]) &&
      canon(actual[1].slice(0, 2)) === canon(expected[1]),
  },
  {
    n: 13,
    slug: 'graph-silence-persistence',
    stmts:
      'let q = g.EMPTY_PITCH_GRAPH_MODEL; for (let t = 0; t <= 200; t += 20) q = g.advancePitchGraph(q, { timeMs: t, midi: 70 }); for (let t = 220; t <= 2220; t += 20) q = g.advancePitchGraph(q, { timeMs: t, midi: null });',
    expr: '[q.centre, g.computePitchGraphView(q, { progress: 0, wrongNotes: [70], revealing: false })]',
    expected: [70, { segments: [], dot: null, bandState: 'red', fill: 0 }],
  },
  {
    n: 14,
    slug: 'graph-band-state',
    stmts: 'const p = g.advancePitchGraph(g.EMPTY_PITCH_GRAPH_MODEL, { timeMs: 0, midi: 69 });',
    expr: "['revealing', 'red', 'filling', 'idle'].map((k) => { const v = g.computePitchGraphView(p, { progress: k === 'filling' || k === 'red' ? 0.4 : 0, wrongNotes: k === 'red' ? [69] : [], revealing: k === 'revealing' }); return v.bandState + ' ' + v.fill; })",
    expected: ['green 0', 'red 0', 'filling 0.4', 'idle 0'],
  },
];

function buildPureScript() {
  const body = PURE_STEPS.map(
    ({ n, stmts, expr }) =>
      `__cur = ${n}; ${stmts}\n try { __r[${n}] = { value: (${expr}) }; } catch (e) { __r[${n}] = { error: String((e && e.stack) || e) }; }`,
  ).join('\n');
  return `(async () => { const __r = {}; let __cur = 0; try {\n${body}\n} catch (e) { __r[__cur] = { error: String((e && e.stack) || e) }; } return JSON.parse(JSON.stringify(__r)); })()`;
}

async function runPureSteps(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = collectErrors(page);
  try {
    await page.goto(`${DEV}/`);
    await page.getByRole('button', { name: 'Start training' }).waitFor({ timeout: 20_000 });
    const raw = await page.evaluate(buildPureScript());
    for (const step of PURE_STEPS) {
      const r = raw[step.n];
      const compare = step.compare ?? ((a, e) => canon(a) === canon(e));
      let status;
      let detail;
      if (!r) {
        status = 'fail';
        detail = 'Not run (an earlier statement in the sequence threw).';
      } else if ('error' in r) {
        status = 'fail';
        detail = `Threw: ${r.error.split('\n')[0]}`;
      } else {
        const ok = compare(r.value, step.expected);
        status = ok ? 'pass' : 'fail';
        detail = ok
          ? `Actual \`${fmt(r.value)}\` matches the expected value.`
          : `Actual \`${fmt(r.value)}\`, expected \`${fmt(step.expected)}\`.`;
      }
      writeOutput(
        step.n,
        step.slug,
        [
          `Step ${step.n}: ${NAMES[step.n]}`,
          `Page: ${DEV}/`,
          '',
          'Action (statements):',
          step.stmts || '(none)',
          '',
          'Action (expression):',
          step.expr,
          '',
          `Expected: ${fmt(step.expected)}`,
          `Actual:   ${r && 'value' in r ? fmt(r.value) : r ? `ERROR ${r.error}` : 'not run'}`,
          '',
          `Result: ${status.toUpperCase()}`,
        ].join('\n'),
      );
      record(step.n, status, detail);
    }
    if (errors.page.length) console.log(`  page errors on the pure-module page: ${errors.page.join(' | ')}`);
  } catch (e) {
    for (const step of PURE_STEPS) {
      if (!results[step.n]?.status) record(step.n, 'fail', `Could not run: ${e.message}`);
    }
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Fake microphone + synth instrumentation (init script, runs in the page before the app)
// ---------------------------------------------------------------------------------------------------------------
function initScript() {
  const TONE = Symbol.for('validation.toneContext');
  let tone = null;
  const ensureTone = () => {
    if (tone) return tone;
    const ctx = new AudioContext();
    ctx[TONE] = true;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 440;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    // Vibrato: LFO → depth (cents) → osc.detune.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0;
    lfo.connect(lfoDepth);
    lfoDepth.connect(osc.detune);
    osc.connect(gain);
    osc.start();
    lfo.start();
    tone = { ctx, osc, gain, lfo, lfoDepth, amp: 0.5, hz: null };
    return tone;
  };

  const gumCalls = [];
  window.__gumCalls = gumCalls;
  const md = navigator.mediaDevices;
  if (md && typeof md.getUserMedia === 'function') {
    const original = md.getUserMedia.bind(md);
    md.getUserMedia = async (constraints) => {
      if (!constraints || !constraints.audio) return original(constraints);
      const t = ensureTone();
      if (t.ctx.state !== 'running') await t.ctx.resume();
      gumCalls.push({ at: performance.now(), constraints: JSON.parse(JSON.stringify(constraints)) });
      // A fresh destination per call: the app stops the tracks on release.
      const dest = t.ctx.createMediaStreamDestination();
      t.gain.connect(dest);
      return dest.stream;
    };
  }

  window.__tone = {
    /** hz = number → steady sine at that frequency; null → silence (gain 0). Returns performance.now(). */
    set(hz) {
      const t = ensureTone();
      const now = t.ctx.currentTime;
      t.gain.gain.cancelScheduledValues(now);
      t.osc.frequency.cancelScheduledValues(now);
      if (hz === null) {
        t.gain.gain.setValueAtTime(0, now);
      } else {
        t.osc.frequency.setValueAtTime(hz, now);
        t.gain.gain.setValueAtTime(t.amp, now);
      }
      t.hz = hz;
      return performance.now();
    },
    vibrato(depthCents, rateHz) {
      const t = ensureTone();
      const now = t.ctx.currentTime;
      t.lfo.frequency.setValueAtTime(rateHz, now);
      t.lfoDepth.gain.setValueAtTime(depthCents, now);
    },
    /** segments: [[hz | null, durationMs], ...] scheduled on the audio clock; ends in silence. */
    pattern(segments) {
      const t = ensureTone();
      const start = t.ctx.currentTime;
      t.gain.gain.cancelScheduledValues(start);
      t.osc.frequency.cancelScheduledValues(start);
      let at = start;
      for (const [hz, dur] of segments) {
        if (hz === null) t.gain.gain.setValueAtTime(0, at);
        else {
          t.osc.frequency.setValueAtTime(hz, at);
          t.gain.gain.setValueAtTime(t.amp, at);
        }
        at += dur / 1000;
      }
      t.gain.gain.setValueAtTime(0, at);
      return performance.now();
    },
    state() {
      return tone ? { ctxState: tone.ctx.state, sampleRate: tone.ctx.sampleRate, hz: tone.hz } : null;
    },
  };

  // Synth instrumentation on the app's context: each playSequence creates a master GainNode connected to the
  // destination, then one oscillator per note. Record those groups, their frequencies and master-gain ramps.
  const groups = [];
  window.__synthGroups = groups;
  const origCreateOsc = BaseAudioContext.prototype.createOscillator;
  BaseAudioContext.prototype.createOscillator = function (...args) {
    const node = origCreateOsc.apply(this, args);
    if (!this[TONE] && groups.length) groups[groups.length - 1].oscs.push(node);
    return node;
  };
  const origConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    if (!this.context[TONE] && dest instanceof AudioDestinationNode && this instanceof GainNode) {
      const group = { at: performance.now(), master: this, initialVolume: this.gain.value, oscs: [], ramps: [] };
      const param = this.gain;
      const origRamp = param.linearRampToValueAtTime.bind(param);
      param.linearRampToValueAtTime = (value, endTime) => {
        group.ramps.push({ value, at: performance.now() });
        return origRamp(value, endTime);
      };
      groups.push(group);
    }
    return origConnect.call(this, dest, ...rest);
  };
  window.__synthInfo = () =>
    groups.map((g) => ({
      at: g.at,
      initialVolume: g.initialVolume,
      freqs: g.oscs.map((o) => Math.round(o.frequency.value * 100) / 100),
      ramps: g.ramps.map((r) => ({ value: Math.round(r.value * 1000) / 1000, at: r.at })),
    }));

  // DOM helpers.
  window.__box = (i) => document.querySelector(`[data-testid="note-box-${i}"]`)?.getAttribute('data-state') ?? null;
  window.__boxText = (i) => document.querySelector(`[data-testid="note-box-${i}"]`)?.textContent ?? null;
  window.__boxCount = () => document.querySelectorAll('[data-testid^="note-box-"]').length;
  window.__status = () => document.querySelector('[data-testid="training-status"]')?.textContent ?? null;
  window.__btn = (name) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === name) ?? null;
  window.__onHome = () => !!window.__btn('Start training') && !document.querySelector('[data-testid="training-status"]');
  /** Resolves with performance.now() at the first DOM mutation / 10 ms tick where pred() is true. */
  window.__waitFor = (pred, timeoutMs = 10000, label = 'condition') =>
    new Promise((resolve, reject) => {
      const check = () => {
        try {
          return !!pred();
        } catch {
          return false;
        }
      };
      if (check()) return resolve(performance.now());
      let finished = false;
      const finish = (value, error) => {
        if (finished) return;
        finished = true;
        obs.disconnect();
        clearInterval(iv);
        clearTimeout(to);
        if (error) reject(error);
        else resolve(value);
      };
      const obs = new MutationObserver(() => {
        if (check()) finish(performance.now());
      });
      obs.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      const iv = setInterval(() => {
        if (check()) finish(performance.now());
      }, 10);
      const to = setTimeout(() => finish(null, new Error(`timeout after ${timeoutMs} ms waiting for ${label}`)), timeoutMs);
    });
}

const LAUNCH_ARGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
];

function collectErrors(page) {
  const errors = { page: [], console: [], http: [] };
  page.on('pageerror', (e) => errors.page.push(String(e.message ?? e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.console.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.http.push(`${r.status()} ${r.url()}`);
  });
  page.on('requestfailed', (r) => {
    if (!r.url().endsWith('/favicon.ico')) errors.http.push(`FAILED ${r.url()} (${r.failure()?.errorText})`);
  });
  return errors;
}
const errorSummary = (errors) =>
  [
    errors.page.length ? `page errors: ${errors.page.join(' | ')}` : null,
    errors.console.length ? `console errors: ${errors.console.join(' | ')}` : null,
    errors.http.length ? `HTTP errors: ${errors.http.join(' | ')}` : null,
  ]
    .filter(Boolean)
    .join('; ');
const hasErrors = (e) => e.page.length + e.console.length + e.http.length > 0;

async function openApp(browser, url) {
  const context = await browser.newContext({ ...devices['Desktop Chrome'], permissions: ['microphone'] });
  await context.addInitScript(initScript);
  const page = await context.newPage();
  const errors = collectErrors(page);
  await page.goto(url);
  await page.getByRole('button', { name: 'Start training' }).waitFor({ timeout: 20_000 });
  return { context, page, errors };
}

/** Clicks Start training and waits for "Your turn: play note 1 of N" (playback + guard). */
async function startAndWaitListening(page, total) {
  await page.getByRole('button', { name: 'Start training' }).click();
  await page.evaluate(
    (n) => window.__waitFor(() => window.__status() === `Your turn: play note 1 of ${n}`, 25_000, `"Your turn: play note 1 of ${n}"`),
    total,
  );
}

/**
 * Runs a scenario covering several steps. Steps the scenario did not record when it throws are marked FAIL
 * with the error and a failure screenshot.
 */
async function scenario(browser, steps, url, fn) {
  let app = null;
  try {
    app = await openApp(browser, url);
    await fn(app);
  } catch (e) {
    const msg = String(e?.message ?? e).split('\n')[0];
    const pending = steps.filter((n) => !results[n]?.status);
    for (const n of pending) {
      if (app) await shot(app.page, n, 'failure');
      record(n, 'fail', `Scenario error: ${msg}${app && hasErrors(app.errors) ? ` (${errorSummary(app.errors)})` : ''}`);
    }
  } finally {
    if (app) await app.context.close().catch(() => undefined);
  }
}

const within = (x, lo, hi) => typeof x === 'number' && x >= lo && x <= hi;

// ---------------------------------------------------------------------------------------------------------------
// Steps 15–19: correct note, reveal pause
// ---------------------------------------------------------------------------------------------------------------
async function steps15to18(browser) {
  await scenario(browser, [15, 16, 17, 18], `${E2E}/?melody=71,71,71`, async ({ page, errors }) => {
    // --- 15 + 16 ---
    await startAndWaitListening(page, 3);
    await shot(page, 15, 'listening-note-1');
    const m15 = await page.evaluate(async () => {
      const r = {};
      r.toneStart = window.__tone.set(440);
      r.done = await window.__waitFor(
        () => {
          if (window.__box(0) !== 'done') return false;
          // Snapshot synchronously in the same commit the box turned green.
          r.statusAtGreen = window.__status();
          r.box0Text = window.__boxText(0);
          r.box1State = window.__box(1);
          r.repeatDisabledAtGreen = window.__btn('Repeat melody')?.disabled ?? null;
          r.giveUpDisabledAtGreen = window.__btn('Give up')?.disabled ?? null;
          window.__tone.set(null); // stop playing so the next note stays pending
          return true;
        },
        5000,
        'box 0 done',
      );
      window.__t15done = r.done;
      r.acceptMs = r.done - r.toneStart;
      r.tone = window.__tone.state();
      r.gumCalls = window.__gumCalls;
      return r;
    });
    await shot(page, 15, 'first-note-green');
    const m16 = await page.evaluate(async () => {
      const r = {};
      // Shortly into the reveal window: Repeat still disabled, Give up enabled.
      await new Promise((res) => setTimeout(res, 200));
      r.at200 = { repeatDisabled: window.__btn('Repeat melody')?.disabled, giveUpDisabled: window.__btn('Give up')?.disabled };
      r.repeatEnabled = await window.__waitFor(() => window.__btn('Repeat melody')?.disabled === false, 3000, 'Repeat enabled');
      r.repeatBackMs = r.repeatEnabled - window.__t15done;
      r.statusAfter = window.__status();
      r.box1State = window.__box(1);
      return r;
    });
    await shot(page, 16, 'repeat-enabled-after-reveal');
    writeOutput(15, 'reveal-timing', { melody: '71,71,71', toneHz: 440, ...m15 });
    writeOutput(16, 'reveal-buttons', m16);

    const ok15 =
      within(m15.acceptMs, 400, 1200) &&
      m15.statusAtGreen === 'Your turn: play note 2 of 3' &&
      m15.box0Text === 'Si4' &&
      !errors.page.length;
    record(
      15,
      ok15 ? 'pass' : 'fail',
      `Box 1 turned green ("${m15.box0Text}") ${ms(m15.acceptMs)} after the 440 Hz tone started (expected ~500 ms, accepted 400–1200 ms). ` +
        `Status in the same DOM commit: "${m15.statusAtGreen}" (expected "Your turn: play note 2 of 3").` +
        (errors.page.length ? ` ${errorSummary(errors)}` : ''),
    );
    const ok16 =
      m15.repeatDisabledAtGreen === true &&
      m15.giveUpDisabledAtGreen === false &&
      m16.at200.repeatDisabled === true &&
      m16.at200.giveUpDisabled === false &&
      within(m16.repeatBackMs, 350, 1000);
    record(
      16,
      ok16 ? 'pass' : 'fail',
      `At green: Repeat disabled=${m15.repeatDisabledAtGreen}, Give up disabled=${m15.giveUpDisabledAtGreen}; ` +
        `200 ms later: Repeat disabled=${m16.at200.repeatDisabled}, Give up disabled=${m16.at200.giveUpDisabled}; ` +
        `Repeat enabled again ${ms(m16.repeatBackMs)} after the green (expected ~500 ms, accepted 350–1000 ms).`,
    );

    // --- 17 + 18: Give up → Start training, continuous 440 Hz through all three notes ---
    await page.getByRole('button', { name: 'Give up' }).click();
    await page.getByRole('button', { name: 'Start training' }).waitFor({ timeout: 5000 });
    await startAndWaitListening(page, 3);
    const m17 = await page.evaluate(async () => {
      const r = { times: [] };
      r.toneStart = window.__tone.set(440);
      await window.__waitFor(
        () => {
          for (let i = 0; i < 3; i += 1) {
            if (r.times[i] === undefined && window.__box(i) === 'done') r.times[i] = performance.now();
          }
          if (r.times[2] === undefined) return false;
          window.__tone.set(null); // "stop playing"
          r.statusAtLast = window.__status();
          r.onHomeAtLast = window.__onHome();
          return true;
        },
        10000,
        'all three boxes done',
      );
      r.lastDone = r.times[2];
      r.home = await window.__waitFor(() => window.__onHome(), 6000, 'Home screen');
      r.homeAfterMs = r.home - r.lastDone;
      r.firstAcceptMs = r.times[0] - r.toneStart;
      r.intervals = [r.times[1] - r.times[0], r.times[2] - r.times[1]];
      r.names = [0, 1, 2].map((i) => window.__boxText(i));
      return r;
    });
    writeOutput(17, 'continuous-tone-timing', { melody: '71,71,71', toneHz: 440, ...m17 });
    await shot(page, 18, 'back-home');
    const ok17 = m17.intervals.every((x) => within(x, 850, 1500));
    record(
      17,
      ok17 ? 'pass' : 'fail',
      `Continuous 440 Hz: box 1 after ${ms(m17.firstAcceptMs)}, then intervals ${m17.intervals.map(ms).join(' and ')} ` +
        `(expected ~1 s = 0.5 s hold + 0.5 s reveal; accepted 850–1500 ms, i.e. clearly not every 0.5 s).`,
    );
    const ok18 = m17.statusAtLast === 'Well done!' && within(m17.homeAfterMs, 1700, 3000) && !errors.page.length;
    record(
      18,
      ok18 ? 'pass' : 'fail',
      `Status in the commit where box 3 turned green: "${m17.statusAtLast}" (expected "Well done!"); ` +
        `Home ${ms(m17.homeAfterMs)} after the last green (expected ~2000 ms, accepted 1700–3000 ms).` +
        (errors.page.length ? ` ${errorSummary(errors)}` : ''),
      { shots: [] },
    );
  });
}

async function step19(browser) {
  await scenario(browser, [19], `${E2E}/?melody=71,71,71`, async ({ page, errors }) => {
    await startAndWaitListening(page, 3);
    const m = await page.evaluate(async () => {
      const r = {};
      r.toneStart = window.__tone.set(440);
      let clicked;
      const clickDone = new Promise((res) => (clicked = res));
      r.green = await window.__waitFor(
        () => {
          if (window.__box(0) !== 'done') return false;
          window.__tone.set(null);
          setTimeout(() => {
            r.repeatDisabledAtClick = window.__btn('Repeat melody')?.disabled;
            r.clickAt = performance.now();
            window.__btn('Give up').click();
            clicked();
          }, 150);
          return true;
        },
        5000,
        'box 0 done',
      );
      await clickDone;
      r.home = await window.__waitFor(() => window.__onHome(), 2000, 'Home screen');
      r.clickAfterGreenMs = r.clickAt - r.green;
      r.homeAfterClickMs = r.home - r.clickAt;
      return r;
    });
    await page.waitForTimeout(3000);
    const after = await page.evaluate(() => ({ onHome: window.__onHome(), status: window.__status() }));
    await shot(page, 19, 'home-after-give-up-in-reveal');
    writeOutput(19, 'give-up-during-reveal', { ...m, after3s: after, errors });
    const ok =
      m.repeatDisabledAtClick === true &&
      m.homeAfterClickMs <= 300 &&
      after.onHome === true &&
      !hasErrors(errors);
    record(
      19,
      ok ? 'pass' : 'fail',
      `Clicked Give up ${ms(m.clickAfterGreenMs)} after the green (inside the reveal: Repeat disabled=${m.repeatDisabledAtClick}); ` +
        `Home after ${ms(m.homeAfterClickMs)} (expected at once, ≤ 300 ms); still Home 3 s later: ${after.onHome}; ` +
        (hasErrors(errors) ? errorSummary(errors) : 'no page/console errors.'),
    );
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Steps 20–23: wrong notes
// ---------------------------------------------------------------------------------------------------------------
/** Plays 440 Hz until box 0 is done, then silence; waits until listening for note 2 again (Repeat enabled). */
async function matchFirstWith440(page) {
  return page.evaluate(async () => {
    const t0 = window.__tone.set(440);
    const green = await window.__waitFor(() => window.__box(0) === 'done', 5000, 'box 0 done');
    await window.__waitFor(() => window.__btn('Repeat melody')?.disabled === false, 3000, 'listening for note 2');
    return { acceptMs: green - t0 };
  });
}

async function steps20and21(browser) {
  await scenario(browser, [20, 21], `${E2E}/?melody=71,72,72`, async ({ page, errors }) => {
    await startAndWaitListening(page, 3);
    const first = await matchFirstWith440(page); // tone keeps playing 440 Hz
    const m20 = await page.evaluate(async () => {
      const r = { statusStart: window.__status() };
      r.toneHz = window.__tone.state()?.hz;
      await new Promise((res) => setTimeout(res, 2000));
      r.statusAfter2s = window.__status();
      r.boxes = [0, 1, 2].map((i) => window.__box(i));
      r.box1Text = window.__boxText(1);
      return r;
    });
    await shot(page, 20, 'wrong-note-stuck');
    writeOutput(20, 'wrong-note-440-for-do5', { melody: '71,72,72', firstNoteAcceptMs: first.acceptMs, ...m20 });
    const ok20 =
      m20.toneHz === 440 &&
      m20.boxes[1] === 'active' &&
      m20.boxes[2] === 'pending' &&
      m20.statusAfter2s === 'Your turn: play note 2 of 3';
    record(
      20,
      ok20 ? 'pass' : 'fail',
      `After 2 s of 440 Hz on note 2 (Do5): boxes ${m20.boxes.join('/')}, status "${m20.statusAfter2s}" (expected box 2 still active, ` +
        `"Your turn: play note 2 of 3"). Red marks are Part 2 and not checked.`,
    );

    const m21 = await page.evaluate(async () => {
      const r = {};
      r.toneStart = window.__tone.set(466.16);
      r.done = await window.__waitFor(() => window.__box(1) === 'done', 4000, 'box 1 done');
      r.acceptMs = r.done - r.toneStart;
      r.box1Text = window.__boxText(1);
      r.status = window.__status();
      window.__tone.set(null);
      return r;
    });
    await shot(page, 21, 'second-note-do5-green');
    writeOutput(21, 'right-note-466', m21);
    const ok21 = within(m21.acceptMs, 400, 1500) && m21.box1Text === 'Do5' && !errors.page.length;
    record(
      21,
      ok21 ? 'pass' : 'fail',
      `466.16 Hz: box 2 green ("${m21.box1Text}") after ${ms(m21.acceptMs)} (expected ~500 ms, accepted 400–1500 ms); status "${m21.status}".` +
        (errors.page.length ? ` ${errorSummary(errors)}` : ''),
    );
  });
}

async function step22(browser) {
  await scenario(browser, [22], `${E2E}/?melody=71,71,71`, async ({ page }) => {
    await startAndWaitListening(page, 3);
    const m = await page.evaluate(async () => {
      const r = {};
      window.__tone.set(220);
      await new Promise((res) => setTimeout(res, 2000));
      r.boxes = [0, 1, 2].map((i) => window.__box(i));
      r.status = window.__status();
      return r;
    });
    await shot(page, 22, 'octave-stuck');
    // Positive control: the same session accepts the right octave, so the "nothing advances" is meaningful.
    const control = await page.evaluate(async () => {
      const t0 = window.__tone.set(440);
      try {
        const t = await window.__waitFor(() => window.__box(0) === 'done', 4000, 'box 0 done');
        return { acceptedMs: t - t0 };
      } catch (e) {
        return { error: String(e.message) };
      } finally {
        window.__tone.set(null);
      }
    });
    writeOutput(22, 'octave-error-220', { melody: '71,71,71', toneHz: 220, ...m, control440: control });
    const ok = m.boxes[0] === 'active' && !m.boxes.includes('done') && m.status === 'Your turn: play note 1 of 3';
    record(
      22,
      ok ? 'pass' : 'fail',
      `After 2 s of 220 Hz: boxes ${m.boxes.join('/')}, status "${m.status}" (expected nothing advances). ` +
        `Control: 440 Hz then accepted after ${control.acceptedMs !== undefined ? ms(control.acceptedMs) : control.error}.`,
    );
  });
}

async function step23(browser) {
  await scenario(browser, [23], `${E2E}/?melody=71,72,72`, async ({ page, errors }) => {
    await startAndWaitListening(page, 3);
    await matchFirstWith440(page); // 440 keeps playing: stuck on a wrong note
    await page.waitForTimeout(1500);
    const stuck = await page.evaluate(() => ({ boxes: [0, 1, 2].map((i) => window.__box(i)), status: window.__status() }));
    await shot(page, 23, 'stuck-before-repeat');
    const groupsBefore = await page.evaluate(() => window.__synthInfo().length);
    await page.getByRole('button', { name: 'Repeat melody' }).click();
    const m = await page.evaluate(async () => {
      const r = {};
      r.clickAt = performance.now();
      // Play the right tone from the start of the replay: frames are ignored while playing / guard, so the hold must
      // start fresh when listening resumes.
      window.__tone.set(466.16);
      r.playing = await window.__waitFor(() => window.__status() === 'Listen…', 3000, '"Listen…"');
      r.boxesDuringPlayback = [0, 1, 2].map((i) => window.__box(i));
      r.listening = await window.__waitFor(
        () => window.__status() === 'Your turn: play note 2 of 3' && window.__btn('Repeat melody')?.disabled === false,
        15000,
        'listening again',
      );
      r.box0AtListening = window.__box(0);
      r.done = await window.__waitFor(() => window.__box(1) === 'done', 4000, 'box 1 done');
      r.acceptAfterListeningMs = r.done - r.listening;
      r.box1Text = window.__boxText(1);
      window.__tone.set(null);
      r.synth = window.__synthInfo();
      return r;
    });
    await shot(page, 23, 'accepted-after-repeat');
    const replay = m.synth[groupsBefore];
    writeOutput(23, 'repeat-keeps-progress', { stuckBeforeRepeat: stuck, ...m });
    const ok =
      stuck.boxes[1] === 'active' &&
      m.boxesDuringPlayback[0] === 'done' &&
      m.box0AtListening === 'done' &&
      replay !== undefined &&
      canon(replay.freqs) === canon([440, 466.16, 466.16]) &&
      within(m.acceptAfterListeningMs, 400, 1200) &&
      m.box1Text === 'Do5' &&
      !errors.page.length;
    record(
      23,
      ok ? 'pass' : 'fail',
      `Stuck before Repeat: boxes ${stuck.boxes.join('/')}. Repeat replayed ${replay ? `[${replay.freqs.join(', ')}] Hz` : 'nothing'} ` +
        `(expected [440, 466.16, 466.16]); box 1 during replay: ${m.boxesDuringPlayback[0]}, at listening: ${m.box0AtListening}. ` +
        `With 466.16 Hz sounding throughout the replay, box 2 turned green ${ms(m.acceptAfterListeningMs)} after listening resumed ` +
        `(fresh hold expected ~500 ms, accepted 400–1200 ms) as "${m.box1Text}".` +
        (errors.page.length ? ` ${errorSummary(errors)}` : ''),
    );
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Steps 24–25: smoothing
// ---------------------------------------------------------------------------------------------------------------
const VIBRATO_CENTS = 12;
const VIBRATO_HZ = 5;

async function step24(browser) {
  await scenario(browser, [24], `${E2E}/?melody=71,71,71`, async ({ page, errors }) => {
    await startAndWaitListening(page, 3);
    const m = await page.evaluate(
      async ({ depth, rate }) => {
        window.__tone.vibrato(depth, rate);
        const t0 = window.__tone.set(440);
        const t = await window.__waitFor(() => window.__box(0) === 'done', 4000, 'box 0 done');
        window.__tone.set(null);
        return { acceptMs: t - t0, box0Text: window.__boxText(0) };
      },
      { depth: VIBRATO_CENTS, rate: VIBRATO_HZ },
    );
    await shot(page, 24, 'vibrato-accepted');
    writeOutput(24, 'vibrato', { toneHz: 440, vibratoCents: VIBRATO_CENTS, vibratoHz: VIBRATO_HZ, ...m });
    const ok = within(m.acceptMs, 400, 1200) && !errors.page.length;
    record(
      24,
      ok ? 'pass' : 'fail',
      `440 Hz with ±${VIBRATO_CENTS} c vibrato at ${VIBRATO_HZ} Hz: accepted after ${ms(m.acceptMs)} (expected ~500 ms, accepted 400–1200 ms).`,
    );
  });
}

async function step25(browser) {
  await scenario(browser, [25], `${E2E}/?melody=71,71,71`, async ({ page, errors }) => {
    await startAndWaitListening(page, 3);
    const m = await page.evaluate(async () => {
      const r = {};
      window.__tone.pattern([
        [440, 300],
        [null, 150],
        [440, 300],
      ]);
      await new Promise((res) => setTimeout(res, 1500)); // pattern (750 ms) + silence
      r.boxesAfterPattern = [0, 1, 2].map((i) => window.__box(i));
      r.statusAfterPattern = window.__status();
      const t0 = window.__tone.set(440);
      const t = await window.__waitFor(() => window.__box(0) === 'done', 4000, 'box 0 done');
      window.__tone.set(null);
      r.continuousAcceptMs = t - t0;
      return r;
    });
    await shot(page, 25, 'accepted-after-continuous-tone');
    writeOutput(25, 'gap-restarts-hold', { pattern: '440 Hz 300 ms / silence 150 ms / 440 Hz 300 ms, then silence', ...m });
    const ok =
      m.boxesAfterPattern[0] === 'active' &&
      !m.boxesAfterPattern.includes('done') &&
      within(m.continuousAcceptMs, 400, 1200) &&
      !errors.page.length;
    record(
      25,
      ok ? 'pass' : 'fail',
      `After 300 ms tone / 150 ms silence / 300 ms tone: boxes ${m.boxesAfterPattern.join('/')} (expected no acceptance); ` +
        `then a continuous tone was accepted after ${ms(m.continuousAcceptMs)} (expected ~500 ms, accepted 400–1200 ms).`,
    );
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Step 26: regressions (5173 random melody with live volume + full play-through; 4173 production preview)
// ---------------------------------------------------------------------------------------------------------------
async function step26(browser) {
  const parts = [];
  let allOk = true;

  // Part A: random melody on the normal dev server.
  let app = null;
  try {
    app = await openApp(browser, `${DEV}/`);
    const { page, errors } = app;
    await page.getByRole('button', { name: 'Start training' }).click();
    await page.evaluate(() => window.__waitFor(() => window.__status() === 'Listen…', 5000, '"Listen…"'));
    const total = await page.evaluate(() => window.__boxCount());
    // Open Settings while the melody plays and raise the volume.
    await page.getByRole('button', { name: 'Settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await dialog.waitFor({ timeout: 5000 });
    const volume = dialog.getByRole('slider', { name: 'Playback volume' });
    const before = {
      valuetext: await volume.getAttribute('aria-valuetext'),
      status: await page.evaluate(() => window.__status()),
      synth: await page.evaluate(() => window.__synthInfo()),
    };
    await volume.fill('80');
    const afterChange = await page.evaluate(async () => {
      const deadline = performance.now() + 1000;
      while (performance.now() < deadline) {
        const groups = window.__synthInfo();
        const last = groups[groups.length - 1];
        if (last && last.ramps.some((x) => x.value === 0.8)) break;
        await new Promise((res) => setTimeout(res, 20));
      }
      return {
        status: window.__status(),
        boxes: [...document.querySelectorAll('[data-testid^="note-box-"]')].map((b) => b.getAttribute('data-state')),
        synth: window.__synthInfo(),
      };
    });
    const valuetextAfter = await volume.getAttribute('aria-valuetext');
    const sliders = await dialog.getByRole('slider').count();
    await shot(page, 26, 'settings-during-training');
    await dialog.getByRole('button', { name: 'Close' }).click();
    const lastGroup = afterChange.synth[afterChange.synth.length - 1];
    const volumeRamp = lastGroup?.ramps.find((x) => x.value === 0.8);
    const volumeOk =
      before.status === 'Listen…' &&
      before.valuetext === '50%' &&
      valuetextAfter === '80%' &&
      sliders === 2 &&
      afterChange.synth.length === before.synth.length && // no restart
      lastGroup?.initialVolume === 0.5 &&
      volumeRamp !== undefined;
    allOk &&= volumeOk;
    parts.push(
      `Live volume (5173, during "Listen…"): slider ${before.valuetext} → ${valuetextAfter}; the running playback's master gain ramped to ` +
        `${volumeRamp ? volumeRamp.value : 'NOTHING'} (initial ${lastGroup?.initialVolume}); playbacks before/after ${before.synth.length}/${afterChange.synth.length} ` +
        `(no restart); training dialog shows ${sliders} sliders. ${volumeOk ? 'OK' : 'NOT OK'}.`,
    );

    // Play the random melody back: the concert frequencies are read from the synth instrumentation.
    await page.evaluate(
      (n) => window.__waitFor(() => window.__status() === `Your turn: play note 1 of ${n}`, 20000, 'listening'),
      total,
    );
    const play = await page.evaluate(async () => {
      const groups = window.__synthInfo();
      const freqs = groups[groups.length - 1].freqs;
      const r = { freqs, accepts: [], names: [] };
      for (let i = 0; i < freqs.length; i += 1) {
        const t0 = window.__tone.set(freqs[i]);
        const t = await window.__waitFor(() => window.__box(i) === 'done', 4000, `box ${i} done`);
        r.accepts.push(Math.round(t - t0));
        r.names.push(window.__boxText(i));
        if (i === freqs.length - 1) {
          r.statusAtLast = window.__status();
          r.lastDone = t;
        }
      }
      window.__tone.set(null);
      r.home = await window.__waitFor(() => window.__onHome(), 6000, 'Home');
      r.homeAfterMs = Math.round(r.home - r.lastDone);
      return r;
    });
    await shot(page, 26, 'dev-random-exercise-complete-home');
    const playOk =
      play.freqs.length === total &&
      play.accepts.every((x, i) => (i === 0 ? within(x, 400, 1200) : within(x, 400, 1600))) &&
      play.statusAtLast === 'Well done!' &&
      within(play.homeAfterMs, 1700, 3000) &&
      !hasErrors(errors);
    allOk &&= playOk;
    parts.push(
      `Full random exercise (${total} notes, concert ${play.freqs.join(', ')} Hz, written ${play.names.join(' ')}): each note accepted after ` +
        `${play.accepts.join('/')} ms (later notes include up to the 500 ms reveal pause); "${play.statusAtLast}", Home ${play.homeAfterMs} ms after the last green. ` +
        `${hasErrors(errors) ? errorSummary(errors) : 'No errors.'} ${playOk ? 'OK' : 'NOT OK'}.`,
    );
    writeOutput(26, 'dev-volume-and-play-through', { before, valuetextAfter, sliders, afterChange, play, errors });
  } catch (e) {
    allOk = false;
    if (app) await shot(app.page, 26, 'dev-failure');
    parts.push(`Dev server part failed: ${String(e.message).split('\n')[0]}`);
  } finally {
    if (app) await app.context.close().catch(() => undefined);
  }

  // Part B: production preview.
  app = null;
  try {
    app = await openApp(browser, PREVIEW);
    const { page, errors } = app;
    await shot(page, 26, 'preview-home');
    await page.getByRole('button', { name: 'Start training' }).click();
    const m = await page.evaluate(async () => {
      const r = {};
      r.listen = await window.__waitFor(() => window.__status() === 'Listen…', 5000, '"Listen…"');
      r.boxes = window.__boxCount();
      r.listening = await window.__waitFor(
        () => /^Your turn: play note 1 of \d+$/.test(window.__status() ?? ''),
        20000,
        'listening',
      );
      r.status = window.__status();
      r.synth = window.__synthInfo();
      return r;
    });
    await shot(page, 26, 'preview-listening');
    await page.getByRole('button', { name: 'Give up' }).click();
    await page.getByRole('button', { name: 'Start training' }).waitFor({ timeout: 5000 });
    const assets = await page.evaluate(() =>
      performance.getEntriesByType('resource').map((e) => e.name).filter((u) => u.includes('/trumpet-trainer/assets/')),
    );
    const played = m.synth[0];
    const ok =
      !hasErrors(errors) &&
      assets.some((u) => u.endsWith('.js')) &&
      assets.some((u) => u.endsWith('.css')) &&
      played !== undefined &&
      played.freqs.length === m.boxes;
    allOk &&= ok;
    parts.push(
      `Preview (${PREVIEW}): assets ${assets.map((u) => u.split('/').pop()).join(', ')} loaded, ` +
        `${hasErrors(errors) ? errorSummary(errors) : 'no 4xx/5xx or errors'}; Start played ${played ? played.freqs.length : 0} notes ` +
        `and reached "${m.status}". ${ok ? 'OK' : 'NOT OK'}.`,
    );
    writeOutput(26, 'preview', { assets, ...m, errors });
  } catch (e) {
    allOk = false;
    if (app) await shot(app.page, 26, 'preview-failure');
    parts.push(`Preview part failed: ${String(e.message).split('\n')[0]}`);
  } finally {
    if (app) await app.context.close().catch(() => undefined);
  }

  record(26, allOk ? 'pass' : 'fail', parts.join('\n'));
}

// ---------------------------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------------------------
function writeReport(startedAt, chromiumVersion) {
  const all = Object.keys(NAMES).map(Number);
  const count = (s) => all.filter((n) => results[n]?.status === s).length;
  const passed = count('pass');
  const failed = all.filter((n) => results[n]?.status !== 'pass' && results[n]?.status !== 'skip').length;
  const skipped = count('skip');
  const icon = { pass: '✅', fail: '❌', skip: '⏭️' };
  const lines = [
    '# Validation Report — Run 1',
    '',
    `**Run:** ${startedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC (finished ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC)`,
    `**Checklist:** specs/pitch-feedback-graph/validation.md (prd.md, Part 1)`,
    `**Browser:** Chromium ${chromiumVersion} (Playwright, headless)`,
    '',
    `**Summary:** ${passed} passed, ${failed} failed, ${skipped} skipped (of ${all.length})`,
    '',
    '## Method',
    '',
    '- Steps 1–14 run the exact Action expressions of the checklist in the page of the dev server (http://localhost:5173/,',
    '  which serves `/src/...` as ES modules) and compare the result with the Expected value (canonical JSON). Step 12 compares',
    '  only what the checklist specifies (at now 600 the dot is not part of the expectation).',
    '- Steps 15–26 drive the real app in Chromium. The microphone is **synthetic**: an init script replaces',
    '  `navigator.mediaDevices.getUserMedia` for audio requests with a `MediaStream` from a separate AudioContext',
    '  (sine OscillatorNode → GainNode 0.5 / 0 for silence → MediaStreamAudioDestinationNode, plus an LFO on `detune` for',
    '  vibrato). Frequency, silence, vibrato and on/off patterns change during a session. The app\'s own AudioContext, analyser,',
    '  level gate, detector, smoother, hold tracker and reducer are unchanged and process that stream as they would a real mic.',
    '- Timings are measured in the page (`performance.now()`, MutationObserver + 10 ms polling) from the moment the tone',
    '  changes to the DOM commit; tolerances are noted per step. The synth is instrumented (master gain and oscillators are',
    '  recorded) to read the random melody\'s frequencies and to observe live volume ramps.',
    '- **Not covered here (manual check):** a real trumpet (attacks, tone colour, intonation drift), a speaker + room',
    '  microphone with room noise and the threshold slider, and other browsers/devices. A pure sine is an easy signal for',
    '  the detector; real-instrument behaviour remains a human check.',
    '',
  ];
  for (const [section, steps] of SECTIONS) {
    lines.push(`## ${section}`, '');
    for (const n of steps) {
      const r = results[n] ?? { status: 'fail', detail: 'Not run.', shots: [], outputs: [] };
      const status = r.status ?? 'fail';
      lines.push(`${icon[status]} **${n}. ${NAMES[n]}**`, '');
      for (const para of (r.detail || '').split('\n')) lines.push(`${para}`, '');
      if (r.outputs.length) {
        lines.push(`Output: ${r.outputs.map((f) => `[${f}](run-1/output/${f})`).join(', ')}`, '');
      }
      for (const f of r.shots) {
        lines.push('', `![${f.replace(/\.png$/, '')}](run-1/screenshots/${f})`, '');
      }
    }
  }
  writeFileSync(REPORT, `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`);
  return { passed, failed, skipped, total: all.length };
}

// ---------------------------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------------------------
const ONLY = (process.env.ONLY ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map(Number); // e.g. ONLY=15,22 for a quick partial run (report still written)

async function main() {
  const startedAt = new Date();
  prepareDirs();
  const browser = await chromium.launch({ args: LAUNCH_ARGS });
  const want = (...ns) => !ONLY.length || ns.some((n) => ONLY.includes(n));
  try {
    if (want(...PURE_STEPS.map((s) => s.n))) await runPureSteps(browser);
    if (want(15, 16, 17, 18)) await steps15to18(browser);
    if (want(19)) await step19(browser);
    if (want(20, 21)) await steps20and21(browser);
    if (want(22)) await step22(browser);
    if (want(23)) await step23(browser);
    if (want(24)) await step24(browser);
    if (want(25)) await step25(browser);
    if (want(26)) await step26(browser);
  } finally {
    const version = browser.version();
    await browser.close();
    if (ONLY.length) {
      for (const n of Object.keys(NAMES).map(Number)) {
        if (!results[n]) record(n, 'skip', `Not selected (ONLY=${ONLY.join(',')}).`);
      }
    }
    const s = writeReport(startedAt, version);
    console.log(`\n**Summary:** ${s.passed} passed, ${s.failed} failed, ${s.skipped} skipped (of ${s.total})`);
    console.log(`Report: ${REPORT}`);
    process.exitCode = s.failed === 0 && s.skipped === 0 ? 0 : 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
