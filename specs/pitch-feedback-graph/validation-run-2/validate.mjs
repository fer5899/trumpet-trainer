/* global window, document, AudioContext, AudioNode, AudioDestinationNode, BaseAudioContext, GainNode, MutationObserver, getComputedStyle, requestAnimationFrame -- browser globals used inside page.evaluate / addInitScript callbacks */
// Automated validation of specs/pitch-feedback-graph/validation.md (Run 2: Part 2 = prd2.md + re-run of Part 1).
// Usage (from the repo root, with the three servers of create-environment.sh running):
//   node specs/pitch-feedback-graph/validation-run-2/validate.mjs
//   ONLY=P1-15,P2-9 node ...   runs only those steps (the others are reported as skipped)
// Writes evidence to specs/pitch-feedback-graph/validation-assets/run-2/{screenshots,output}/ and the report to
// specs/pitch-feedback-graph/validation-assets/validation-report-run-2.md. Exit 0 if no step fails, 1 otherwise.
import { chromium, devices } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const ASSETS = join(ROOT, 'specs', 'pitch-feedback-graph', 'validation-assets');
const SHOTS = join(ASSETS, 'run-2', 'screenshots');
const OUT = join(ASSETS, 'run-2', 'output');
const REPORT = join(ASSETS, 'validation-report-run-2.md');
const PREV_REPORT = join(ASSETS, 'validation-report-run-1.md');
const STYLES = join(ROOT, 'src', 'styles.css');
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
// Part 1 (prd.md) steps are numbered 1..26 in the code (ID(15) === 'P1-15'); Part 2 (prd2.md) uses 'P2-n' ids.
const ID = (n) => (typeof n === 'number' ? `P1-${n}` : n);
const stepNo = (id) => Number(id.split('-')[1]);

const P1_SECTIONS = [
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
const P2_SECTIONS = [
  ['Graph layout and empty state', [1, 2, 3]],
  ['Dot, trail and time scale', [4, 5, 6]],
  ['Filling and correct note', [7, 8, 9, 10, 11, 12, 13, 14, 15]],
  ['Wrong notes (red band)', [16, 17, 18, 19, 20, 21]],
  ['Theme, width and motion', [22, 23, 24, 25, 26, 27]],
  ['Random melodies and regressions', [28, 29, 30, 31, 32]],
  ['Phone and accessibility', [33, 34]],
];
const P1_NAMES = {
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
const P2_NAMES = {
  1: 'Graph below the buttons: column width, grey band, centre line, 6 dashed guides, no text',
  2: 'Graph is an <svg> with aria-hidden="true" and data-band-state="idle"',
  3: 'Graph stays empty during "Listen…" and "Get ready…"; nothing jumps',
  4: 'Dot at ~80 % width, up when sharp / down when flat, smooth; trail on the left only',
  5: 'Silence: dot gone at once, trail gone ~1 s later, band keeps its colour',
  6: 'Far out of tune / slide: trail leaves through the edge, graph re-centres on the neighbour',
  7: 'In tune: band fills (muted yellow) to full width in ~0.5 s, state "filling"',
  8: 'Out of tune or silence before 0.5 s: fill disappears at once',
  9: 'Fill complete: green band + card "Si4" at once, dim + blur, box and status already advanced',
  10: 'During the card: no dot, no fill, band stays green',
  11: 'Card disappears after ~0.5 s; band grey; next note fills',
  12: 'During the card: Repeat disabled, Give up enabled',
  13: 'Five notes: card "Si4" each time, "Well done!", Home ~1.5 s after the last card',
  14: 'Give up clicked through the dimmed screen during the card',
  15: 'Card spelled exactly as the box (Fa#3 / Sol♭3 case)',
  16: 'Wrong note: band fills then turns red; no card, nothing changes or is announced',
  17: 'Holding the wrong note: band simply stays red',
  18: 'Silence after red: dot and trail go, band stays red',
  19: 'Repeat melody: band stays red throughout; wrong note red at once again',
  20: 'Right note after red: re-centres, fills, green, card "Do5"; red marks cleared',
  21: 'Octave error (220 Hz): red band, no card',
  22: 'Dark theme colours',
  23: 'Light theme colours',
  24: '320 px width: graph ~288 × 180, no horizontal scroll, card on screen',
  25: 'Reduced motion: dim layer and card appear without animation',
  26: 'Without reduced motion: fade + pop on appear, no exit animation',
  27: 'Gear during the card: Settings dialog opens above the dim layer and works',
  28: 'Random melody (5173): dot follows, fill, green card with the right name, wrong notes red',
  29: 'Random melody: red kept through Repeat; correct note → card, then grey and listening',
  30: 'Random melody: slide to the neighbour wraps without jumping across',
  31: 'Live volume + note duration on Repeat; progress, red marks and graph kept',
  32: 'Production preview shows the graph and the overlay with the same colours and behaviour',
  33: 'Phone (iOS Safari / Android Chrome): dim + blur, card, Give up tap',
  34: 'Screen reader: name announced once, graph silent, wrong notes never announced',
};
const NAMES = {};
for (const [n, name] of Object.entries(P1_NAMES)) NAMES[`P1-${n}`] = name;
for (const [n, name] of Object.entries(P2_NAMES)) NAMES[`P2-${n}`] = name;
const results = {}; // id -> { status: 'pass'|'fail'|'skip', detail, shots: [], outputs: [] }

function record(n, status, detail, extra = {}) {
  const id = ID(n);
  const prev = results[id] ?? { shots: [], outputs: [] };
  results[id] = {
    status,
    detail,
    shots: [...prev.shots, ...(extra.shots ?? [])],
    outputs: [...prev.outputs, ...(extra.outputs ?? [])],
  };
  const icon = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'SKIP';
  console.log(`[${icon}] ${id}. ${NAMES[id]} — ${detail.replace(/\n/g, ' ')}`);
}
function addShot(n, file) {
  const id = ID(n);
  results[id] ??= { status: null, detail: '', shots: [], outputs: [] };
  results[id].shots.push(file);
}
function addOutput(n, file) {
  const id = ID(n);
  results[id] ??= { status: null, detail: '', shots: [], outputs: [] };
  results[id].outputs.push(file);
}
const fileKey = (n) => {
  const id = ID(n);
  return `${id.slice(0, 3)}${String(stepNo(id)).padStart(2, '0')}`;
};
function writeOutput(n, slug, content) {
  const file = `${fileKey(n)}-${slug}.txt`;
  writeFileSync(join(OUT, file), typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  addOutput(n, file);
  return file;
}
async function shot(page, n, slug) {
  const file = `${fileKey(n)}-${slug}.png`;
  try {
    await page.screenshot({ path: join(SHOTS, file) });
    addShot(n, file);
  } catch (e) {
    console.log(`  (screenshot ${file} failed: ${e.message})`);
  }
  return file;
}
const hasStatus = (n) => !!results[ID(n)]?.status;

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
          `Step ${ID(step.n)}: ${NAMES[ID(step.n)]}`,
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
      if (!hasStatus(step.n)) record(step.n, 'fail', `Could not run: ${e.message}`);
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
    /** Exponential frequency glide fromHz → toHz over durMs (tone on), then holds toHz. Returns performance.now(). */
    glide(fromHz, toHz, durMs) {
      const t = ensureTone();
      const now = t.ctx.currentTime;
      t.gain.gain.cancelScheduledValues(now);
      t.osc.frequency.cancelScheduledValues(now);
      t.osc.frequency.setValueAtTime(fromHz, now);
      t.osc.frequency.exponentialRampToValueAtTime(toHz, now + durMs / 1000);
      t.gain.gain.setValueAtTime(t.amp, now);
      t.hz = toHz;
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
    if (!this[TONE] && groups.length) {
      groups[groups.length - 1].oscs.push(node);
      const origStart = node.start.bind(node);
      node.start = (when = 0, ...rest) => {
        node.__startAt ??= when;
        return origStart(when, ...rest);
      };
    }
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
      // Spacing of the scheduled note starts (= note duration), in ms.
      noteSpacingMs: g.oscs
        .map((o) => o.__startAt)
        .filter((x) => typeof x === 'number')
        .map((x, i, a) => (i === 0 ? null : Math.round((x - a[i - 1]) * 1000)))
        .filter((x) => x !== null),
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

  // --- Part 2: pitch graph / reveal overlay helpers ---
  const parsePoints = (str) =>
    (str || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((pair) => pair.split(',').map(Number));
  window.__graph = (withTrails = true) => {
    const g = document.querySelector('[data-testid="pitch-graph"]');
    if (!g) return null;
    const fill = g.querySelector('[data-testid="pitch-graph-fill"]');
    const dot = g.querySelector('[data-testid="pitch-graph-dot"]');
    const trailEls = [...g.querySelectorAll('[data-testid="pitch-graph-trail"]')];
    return {
      state: g.getAttribute('data-band-state'),
      fill: fill ? Number(fill.getAttribute('width')) : 0,
      dot: dot ? { cx: Number(dot.getAttribute('cx')), cy: Number(dot.getAttribute('cy')) } : null,
      trailCount: trailEls.length,
      trails: withTrails ? trailEls.map((p) => parsePoints(p.getAttribute('points'))) : undefined,
    };
  };
  window.__card = () => document.querySelector('[data-testid="note-reveal"]')?.textContent ?? null;
  window.__region = () => document.querySelector('[data-testid="note-reveal-region"]')?.textContent ?? null;
  window.__snap = (withTrails) => {
    const g = window.__graph(withTrails);
    const boxes = [...document.querySelectorAll('[data-testid^="note-box-"]')];
    return {
      graph: !!g,
      state: g?.state ?? null,
      fill: g?.fill ?? 0,
      dot: g?.dot ?? null,
      trailCount: g?.trailCount ?? 0,
      trails: g?.trails,
      card: window.__card(),
      region: window.__region(),
      backdrop: !!document.querySelector('.note-reveal__backdrop'),
      status: window.__status(),
      boxes: boxes.map((b) => b.getAttribute('data-state')).join('/'),
      names: boxes.map((b) => b.textContent).join(' '),
      repeatDisabled: window.__btn('Repeat melody')?.disabled ?? null,
      giveUpDisabled: window.__btn('Give up')?.disabled ?? null,
      home: window.__onHome(),
    };
  };
  /** Records a snapshot at every DOM mutation batch (deduplicated). mark(label) adds a timestamped marker. */
  window.__rec = {
    log: [],
    obs: null,
    last: '',
    trails: false,
    start(withTrails = false) {
      this.stop();
      this.log = [];
      this.last = '';
      this.trails = withTrails;
      const push = () => {
        const s = window.__snap(this.trails);
        const key = JSON.stringify(s);
        if (key === this.last) return;
        this.last = key;
        this.log.push({ t: performance.now(), ...s });
      };
      push();
      this.obs = new MutationObserver(push);
      this.obs.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      return performance.now();
    },
    mark(label) {
      const t = performance.now();
      this.log.push({ t, mark: label });
      return t;
    },
    stop() {
      if (this.obs) this.obs.disconnect();
      this.obs = null;
      return this.log;
    },
  };
  window.__sleep = (msDelay) => new Promise((res) => setTimeout(res, msDelay));
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

async function openApp(browser, url, contextOptions = {}) {
  const context = await browser.newContext({ ...devices['Desktop Chrome'], permissions: ['microphone'], ...contextOptions });
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
async function scenario(browser, steps, url, fn, contextOptions = {}) {
  let app = null;
  try {
    app = await openApp(browser, url, contextOptions);
    await fn(app);
  } catch (e) {
    const msg = String(e?.message ?? e).split('\n')[0];
    const pending = steps.filter((n) => !hasStatus(n));
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
      r.bandState = window.__graph(false)?.state ?? null;
      r.card = window.__card();
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
        `"Your turn: play note 2 of 3"). The checklist's "no visual red mark yet" wording is obsolete since Part 2: ` +
        `this step is judged only on "nothing advances"; the graph band is now "${m20.bandState}" (red expected after Part 2), card ${m20.card === null ? 'not shown' : `"${m20.card}"`}.`,
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
// Part 2 (prd2.md): pitch graph + reveal overlay
// ---------------------------------------------------------------------------------------------------------------
const E2EM = (melody) => `${E2E}/?melody=${melody}`;
const detune = (hz, c) => hz * 2 ** (c / 1200);
const r2 = (x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : x);
const DOT_CX = 256; // 0.8 × 320
const cyForCents = (c) => 100 - 2 * c; // ±50 c = top / bottom edge of the 200-unit viewBox

// --- log analysis (records written by window.__rec) ---
const S = (log) => log.filter((e) => !e.mark);
const markT = (log, label) => log.find((e) => e.mark === label)?.t;
const win = (log, t0, t1 = Infinity) => S(log).filter((e) => e.t >= t0 && e.t < t1);
/** Snapshot in effect at time t (last one recorded at or before t). */
function at(log, t) {
  let r = null;
  for (const e of S(log)) {
    if (e.t <= t) r = e;
    else break;
  }
  return r;
}
/** Snapshots in effect during [t0, t1): the one in effect at t0 plus every later one before t1. */
function span(log, t0, t1 = Infinity) {
  const first = at(log, t0);
  const rest = win(log, t0, t1).filter((e) => e !== first);
  return first ? [first, ...rest] : rest;
}
function cardEpisodes(log) {
  const eps = [];
  let cur = null;
  for (const e of S(log)) {
    if (e.card !== null && !cur) {
      cur = { start: e.t, snap: e, end: null, after: null, snaps: [e] };
      eps.push(cur);
    } else if (e.card !== null && cur) {
      cur.snaps.push(e);
    } else if (e.card === null && cur) {
      cur.end = e.t;
      cur.after = e;
      cur = null;
    }
  }
  return eps;
}
const uniq = (xs) => [...new Set(xs)];
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const stdev = (xs) => {
  const m = mean(xs);
  return xs.length ? Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) : NaN;
};
/** Largest vertical jump between consecutive points of any polyline (viewBox units). */
const maxTrailJump = (trails = []) =>
  Math.max(0, ...trails.flatMap((pts) => pts.slice(1).map((p, i) => Math.abs(p[1] - pts[i][1]))));

// --- colours ---
function parseColor(str) {
  if (!str) return null;
  const s = String(str).trim();
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1);
  }
  m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (m) {
    let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
    return [Number(m[1]), Number(m[2]), Number(m[3]), a];
  }
  return null;
}
const sameColor = (a, b) => {
  const x = parseColor(a);
  const y = parseColor(b);
  return !!x && !!y && x.slice(0, 3).every((v, i) => Math.abs(v - y[i]) <= 1) && Math.abs(x[3] - y[3]) <= 0.01;
};
function luminance(c) {
  const [r, g, b] = parseColor(c).slice(0, 3).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
};
/** Theme tokens from src/styles.css: light = first :root block, dark = the prefers-color-scheme: dark block. */
function readTokens() {
  const css = readFileSync(STYLES, 'utf8');
  const grab = (block) => Object.fromEntries([...block.matchAll(/(--color-(?:graph|reveal)-[a-z-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const lightBlock = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
  const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
  const darkBlock = css.slice(darkStart, css.indexOf('}', css.indexOf(':root {', darkStart)));
  return { light: grab(lightBlock), dark: grab(darkBlock), css };
}

// --- page helpers ---
async function recStart(page, trails = false) {
  return page.evaluate((t) => window.__rec.start(t), trails);
}
async function recStop(page) {
  return page.evaluate(() => window.__rec.stop());
}
async function waitCardVisible(page, timeout = 10_000) {
  await page.getByTestId('note-reveal').waitFor({ state: 'visible', timeout });
}
async function shotGraph(page, n, slug) {
  const file = `${fileKey(n)}-${slug}.png`;
  try {
    await page.getByTestId('pitch-graph').screenshot({ path: join(SHOTS, file) });
    addShot(n, file);
  } catch (e) {
    console.log(`  (screenshot ${file} failed: ${e.message})`);
  }
}
/** Computed colours of every graph / overlay element present right now. */
function readColors(page) {
  return page.evaluate(() => {
    const g = document.querySelector('[data-testid="pitch-graph"]');
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const q = (sel) => document.querySelector(sel);
    const band = q('[data-testid="pitch-graph-band"]');
    const out = {
      bandState: g?.getAttribute('data-band-state') ?? null,
      graphBg: cs(g)?.backgroundColor,
      graphBorder: cs(g)?.borderTopColor,
      band: cs(band)?.fill,
      centre: cs(q('.pitch-graph__centre'))?.stroke,
      guide: cs(q('.pitch-graph__guide'))?.stroke,
      trail: cs(q('[data-testid="pitch-graph-trail"]'))?.stroke ?? null,
      dot: cs(q('[data-testid="pitch-graph-dot"]'))?.fill ?? null,
      fill: cs(q('[data-testid="pitch-graph-fill"]'))?.fill ?? null,
      card: cs(q('[data-testid="note-reveal"]'))?.backgroundColor ?? null,
      cardText: cs(q('[data-testid="note-reveal"]'))?.color ?? null,
      backdrop: cs(q('.note-reveal__backdrop'))?.backgroundColor ?? null,
      pageBg: cs(document.body)?.backgroundColor,
    };
    return out;
  });
}
/** Plays `hz` until the card shows, then silence; waits until listening again (or Well done / Home). */
function playRightNote(page, hz, index) {
  return page.evaluate(
    async ({ hz, index }) => {
      const r = {};
      r.t0 = window.__tone.set(hz);
      r.cardAt = await window.__waitFor(() => window.__card() !== null, 6000, `card for note ${index + 1}`);
      window.__tone.set(null);
      r.card = window.__card();
      r.box = window.__boxText(index);
      r.boxState = window.__box(index);
      r.state = window.__graph(false).state;
      r.status = window.__status();
      r.cardGone = await window.__waitFor(() => window.__card() === null, 3000, 'card gone');
      r.afterState = window.__graph(false)?.state ?? null;
      return r;
    },
    { hz, index },
  );
}

// ---------------------------------------------------------------------------------------------------------------
// P2 1–3: layout, empty state, mic ignored while playing / guard
// ---------------------------------------------------------------------------------------------------------------
async function p2Steps1to3(browser) {
  await scenario(browser, ['P2-1', 'P2-2', 'P2-3'], E2EM('71,71,71,71,71'), async ({ page, errors }) => {
    await startAndWaitListening(page, 5);
    const L = await page.evaluate(() => {
      const g = document.querySelector('[data-testid="pitch-graph"]');
      const rect = (el) => {
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height, bottom: b.bottom };
      };
      const band = g.querySelector('[data-testid="pitch-graph-band"]');
      return {
        tag: g.tagName.toLowerCase(),
        ariaHidden: g.getAttribute('aria-hidden'),
        bandState: g.getAttribute('data-band-state'),
        viewBox: g.getAttribute('viewBox'),
        graph: rect(g),
        actions: rect(document.querySelector('.training__actions')),
        training: rect(document.querySelector('.training')),
        band: {
          x: Number(band.getAttribute('x')),
          y: Number(band.getAttribute('y')),
          width: Number(band.getAttribute('width')),
          height: Number(band.getAttribute('height')),
          fill: getComputedStyle(band).fill,
        },
        guides: [...g.querySelectorAll('.pitch-graph__guide')].map((l) => ({
          y: Number(l.getAttribute('y1')),
          dash: getComputedStyle(l).strokeDasharray,
        })),
        centres: [...g.querySelectorAll('.pitch-graph__centre')].map((l) => ({
          y: Number(l.getAttribute('y1')),
          dash: getComputedStyle(l).strokeDasharray,
        })),
        textEls: g.querySelectorAll('text, foreignObject').length,
        textContent: g.textContent,
        polylines: g.querySelectorAll('polyline').length,
        circles: g.querySelectorAll('circle').length,
        fillRect: !!g.querySelector('[data-testid="pitch-graph-fill"]'),
        outerHTML: g.outerHTML,
      };
    });
    await shot(page, 'P2-1', 'listening-empty-graph');
    await shotGraph(page, 'P2-1', 'graph-only');
    writeOutput('P2-1', 'graph-layout', L);
    const ok1 =
      L.graph.y >= L.actions.bottom - 0.5 &&
      Math.abs(L.graph.w - L.training.w) <= 2 &&
      L.viewBox === '0 0 320 200' &&
      L.band.y === 50 &&
      L.band.height === 100 &&
      L.band.width === 320 &&
      L.guides.length === 6 &&
      L.guides.every((x) => x.dash !== 'none') &&
      L.centres.length === 1 &&
      L.centres[0].dash === 'none' &&
      L.centres[0].y === 100 &&
      L.textEls === 0 &&
      L.textContent.trim() === '' &&
      L.polylines === 0 &&
      L.circles === 0 &&
      !L.fillRect;
    record(
      'P2-1',
      ok1 ? 'pass' : 'fail',
      `Graph top ${r2(L.graph.y)} px vs buttons bottom ${r2(L.actions.bottom)} px (below); width ${r2(L.graph.w)} px vs column ${r2(L.training.w)} px; ` +
        `size ${r2(L.graph.w)} × ${r2(L.graph.h)} px, viewBox "${L.viewBox}". Band y ${L.band.y}..${L.band.y + L.band.height} of 200 (half the height), ` +
        `full width ${L.band.width}, fill ${L.band.fill} (grey). Centre lines: ${L.centres.length} (y ${L.centres[0]?.y}, dasharray ${L.centres[0]?.dash}); ` +
        `guides: ${L.guides.length} at y ${L.guides.map((x) => x.y).join('/')} with dasharray ${uniq(L.guides.map((x) => x.dash)).join(', ')}. ` +
        `Trail polylines ${L.polylines}, dots ${L.circles}, fill ${L.fillRect}, <text> elements ${L.textEls}, text content "${L.textContent.trim()}".`,
    );
    record(
      'P2-2',
      L.tag === 'svg' && L.ariaHidden === 'true' && L.bandState === 'idle' ? 'pass' : 'fail',
      `<${L.tag}> aria-hidden="${L.ariaHidden}" data-band-state="${L.bandState}" (expected svg / "true" / "idle").`,
    );

    // --- 3: 440 Hz sounding from before Start, through "Listen…" and "Get ready…" ---
    await page.getByRole('button', { name: 'Give up' }).click();
    await page.getByRole('button', { name: 'Start training' }).waitFor({ timeout: 5000 });
    await page.evaluate(() => window.__tone.set(440));
    await page.getByRole('button', { name: 'Start training' }).click();
    const listenShot = page
      .evaluate(() => window.__waitFor(() => window.__status() === 'Listen…', 5000, 'Listen…'))
      .then(() => shot(page, 'P2-3', 'listen-with-440-playing'));
    const samples = await page.evaluate(async () => {
      const out = [];
      let listeningAt = null;
      const deadline = performance.now() + 25000;
      while (performance.now() < deadline) {
        const g = document.querySelector('[data-testid="pitch-graph"]');
        const gg = window.__graph(false);
        const status = window.__status();
        out.push({
          t: performance.now(),
          status,
          state: gg?.state ?? null,
          dot: !!gg?.dot,
          trails: gg?.trailCount ?? 0,
          fill: gg?.fill ?? 0,
          top: g ? Math.round(g.getBoundingClientRect().top * 100) / 100 : null,
        });
        if (listeningAt === null && /^Your turn/.test(status ?? '')) listeningAt = performance.now();
        if (listeningAt !== null && (gg?.dot || performance.now() - listeningAt > 400)) break;
        await new Promise((res) => requestAnimationFrame(res));
      }
      window.__tone.set(null);
      return { out, listeningAt };
    });
    await listenShot;
    const pre = samples.out.filter((x) => x.status === 'Listen…' || x.status === 'Get ready…');
    const statuses = uniq(samples.out.map((x) => x.status));
    const tops = samples.out.map((x) => x.top).filter((x) => x !== null);
    const firstDot = samples.out.find((x) => x.dot);
    writeOutput('P2-3', 'graph-during-playback-and-guard', { statuses, samples: samples.out });
    const ok3 =
      statuses.includes('Listen…') &&
      statuses.includes('Get ready…') &&
      pre.length > 0 &&
      pre.every((x) => !x.dot && x.trails === 0 && x.fill === 0 && x.state === 'idle') &&
      Math.max(...tops) - Math.min(...tops) <= 0.5 &&
      !!firstDot &&
      !hasErrors(errors);
    record(
      'P2-3',
      ok3 ? 'pass' : 'fail',
      `440 Hz played from before Start. ${pre.length} frames sampled during "Listen…"/"Get ready…": dots ${pre.filter((x) => x.dot).length}, ` +
        `trails ${pre.filter((x) => x.trails).length}, fills ${pre.filter((x) => x.fill).length}, band states ${uniq(pre.map((x) => x.state)).join('/')}. ` +
        `Graph top across all phases ${Math.min(...tops)}–${Math.max(...tops)} px (nothing jumps). Positive control: the dot appeared ` +
        `${firstDot ? ms(firstDot.t - samples.listeningAt) : 'NEVER'} after "Your turn".` +
        (hasErrors(errors) ? ` ${errorSummary(errors)}` : ''),
    );
  });
}

// ---------------------------------------------------------------------------------------------------------------
// P2 4–6: dot, trail and time scale, wrap to the neighbour
// ---------------------------------------------------------------------------------------------------------------
function analyseGlide(log, t0, t1) {
  const snaps = win(log, t0, t1);
  const dots = snaps.filter((e) => e.dot).map((e) => ({ t: e.t, cy: e.dot.cy }));
  let wrapIdx = -1;
  for (let i = 1; i < dots.length; i += 1) {
    if (dots[i - 1].cy < 50 && dots[i].cy > 150) {
      wrapIdx = i;
      break;
    }
  }
  const wraps = dots.filter((d, i) => i > 0 && Math.abs(d.cy - dots[i - 1].cy) > 100).length;
  const before = wrapIdx > 0 ? dots.slice(0, wrapIdx) : dots;
  const after = wrapIdx > 0 ? dots.slice(wrapIdx) : [];
  const trend = (xs) => (xs.length > 1 ? xs[xs.length - 1].cy - xs[0].cy : 0);
  const maxJump = Math.max(0, ...snaps.map((e) => maxTrailJump(e.trails)));
  const wrapT = wrapIdx > 0 ? dots[wrapIdx].t : null;
  const edgeAfterWrap = wrapT !== null && snaps.some((e) => e.t >= wrapT && (e.trails ?? []).some((pts) => pts.some((p) => p[1] >= 199.5)));
  return {
    dotCount: dots.length,
    wrapIdx,
    wraps,
    wrapFrom: wrapIdx > 0 ? dots[wrapIdx - 1].cy : null,
    wrapTo: wrapIdx > 0 ? dots[wrapIdx].cy : null,
    trendBefore: r2(trend(before)),
    trendAfter: r2(trend(after)),
    maxTrailJump: r2(maxJump),
    edgeAfterWrap,
    ok:
      wrapIdx > 0 &&
      wraps === 1 &&
      trend(before) < -10 &&
      trend(after) < -5 &&
      maxJump <= 100 &&
      edgeAfterWrap,
  };
}

async function p2Steps4to6(browser) {
  await scenario(browser, ['P2-4', 'P2-5', 'P2-6'], E2EM('71,71,71,71,71'), async ({ page, errors }) => {
    await startAndWaitListening(page, 5);
    await recStart(page, true);
    const sharp = detune(440, 15);
    const flat = detune(440, -15);
    const out35 = detune(440, 35);
    const m = await page.evaluate(
      async ({ sharp, flat, out35 }) => {
        const R = window.__rec;
        const r = {};
        R.mark('sharp');
        window.__tone.set(sharp);
        await window.__sleep(400);
        R.mark('gap1');
        window.__tone.set(null);
        await window.__sleep(150);
        R.mark('flat');
        window.__tone.set(flat);
        await window.__sleep(400);
        R.mark('gap2');
        window.__tone.set(null);
        await window.__sleep(150);
        R.mark('long');
        window.__tone.set(out35);
        await window.__sleep(1500);
        r.long = window.__graph(true);
        const dotEl = document.querySelector('[data-testid="pitch-graph-dot"]');
        const gEl = document.querySelector('[data-testid="pitch-graph"]');
        if (dotEl && gEl) {
          const d = dotEl.getBoundingClientRect();
          const g = gEl.getBoundingClientRect();
          r.dotScreenFraction = (d.left + d.width / 2 - g.left) / g.width;
        }
        return r;
      },
      { sharp, flat, out35 },
    );
    await shot(page, 'P2-4', 'dot-and-trail-plus35c');
    await shotGraph(page, 'P2-4', 'graph-dot-and-trail');
    await page.evaluate(async () => {
      window.__rec.mark('silence');
      window.__tone.set(null);
      await window.__sleep(2000);
      window.__rec.mark('silenceEnd');
    });
    await shotGraph(page, 'P2-5', 'graph-after-2s-silence');
    const plus40 = detune(440, 40);
    const glideFrom = detune(440, 30);
    const glideTo = detune(440, 70);
    const m6 = await page.evaluate(
      async ({ plus40, glideFrom, glideTo }) => {
        const r = {};
        window.__rec.mark('plus40');
        window.__tone.set(plus40);
        await window.__sleep(700);
        r.g40 = window.__graph(true);
        window.__rec.mark('plus40End');
        window.__tone.set(null);
        await window.__sleep(1300);
        window.__rec.mark('glide');
        window.__tone.glide(glideFrom, glideTo, 2000);
        await window.__sleep(2200);
        r.afterGlide = window.__graph(true);
        window.__rec.mark('glideEnd');
        return r;
      },
      { plus40, glideFrom, glideTo },
    );
    await shotGraph(page, 'P2-6', 'graph-after-glide-wrapped');
    await page.evaluate(() => window.__tone.set(null));
    const log = await recStop(page);
    writeOutput('P2-4', 'graph-log', { tones: { sharp, flat, out35, plus40, glideFrom, glideTo }, m, m6, log });

    // --- 4 ---
    const T = (l) => markT(log, l);
    const dotsIn = (a, b) => win(log, a, b).filter((e) => e.dot).map((e) => e.dot);
    const sharpDots = dotsIn(T('sharp') + 150, T('gap1'));
    const flatDots = dotsIn(T('flat') + 150, T('gap2'));
    const allDots = S(log).filter((e) => e.dot).map((e) => e.dot);
    const jitter = (ds) => Math.max(0, ...ds.slice(1).map((d, i) => Math.abs(d.cy - ds[i].cy)));
    const sharpCy = mean(sharpDots.map((d) => d.cy));
    const flatCy = mean(flatDots.map((d) => d.cy));
    const maxTrailX = Math.max(0, ...S(log).flatMap((e) => (e.trails ?? []).flat().map((p) => p[0])));
    const longPts = (m.long?.trails ?? []).flat();
    const longMinX = Math.min(...longPts.map((p) => p[0]));
    const ok4 =
      sharpDots.length > 3 &&
      flatDots.length > 3 &&
      within(sharpCy, cyForCents(15) - 6, cyForCents(15) + 6) &&
      within(flatCy, cyForCents(-15) - 6, cyForCents(-15) + 6) &&
      allDots.every((d) => Math.abs(d.cx - DOT_CX) < 0.5) &&
      stdev(sharpDots.map((d) => d.cy)) < 2 &&
      stdev(flatDots.map((d) => d.cy)) < 2 &&
      jitter(sharpDots) < 4 &&
      jitter(flatDots) < 4 &&
      maxTrailX <= DOT_CX + 0.01 &&
      longMinX <= 10;
    record(
      'P2-4',
      ok4 ? 'pass' : 'fail',
      `Dot cx always ${uniq(allDots.map((d) => d.cx)).join('/')} of 320 (80 %; on screen ${r2((m.dotScreenFraction ?? NaN) * 100)} % of the graph width). ` +
        `+15 c: mean cy ${r2(sharpCy)} (expected ≈ ${cyForCents(15)}, above the centre 100 = up); −15 c: mean cy ${r2(flatCy)} (expected ≈ ${cyForCents(-15)}, down). ` +
        `Steady-tone smoothness: cy std dev ${r2(stdev(sharpDots.map((d) => d.cy)))} / ${r2(stdev(flatDots.map((d) => d.cy)))}, largest frame-to-frame step ` +
        `${r2(jitter(sharpDots))} / ${r2(jitter(flatDots))} units (no jitter). Trail: rightmost point ever x ${r2(maxTrailX)} (≤ 256: the 20 % right of the dot stays empty); ` +
        `after 1.5 s of tone the trail starts at x ${r2(longMinX)} (the full last second spans 0..256).`,
    );

    // --- 5 ---
    const tSil = T('silence');
    const afterSil = win(log, tSil, T('silenceEnd'));
    const dotGone = afterSil.find((e) => !e.dot);
    const trailGone = afterSil.find((e) => e.trailCount === 0);
    const statesSil = uniq(span(log, tSil, T('silenceEnd')).map((e) => e.state));
    const rightEdges = afterSil
      .filter((e) => e.trails?.length)
      .map((e) => Math.max(...e.trails.flat().map((p) => p[0])));
    const scrollsLeft = rightEdges.length > 3 && rightEdges[rightEdges.length - 1] < rightEdges[0] - 100;
    const dotGoneMs = dotGone ? dotGone.t - tSil : null;
    const trailGoneMs = trailGone ? trailGone.t - tSil : null;
    const ok5 =
      dotGoneMs !== null &&
      dotGoneMs <= 200 &&
      within(trailGoneMs, 850, 1400) &&
      scrollsLeft &&
      statesSil.length === 1 &&
      statesSil[0] === 'idle';
    record(
      'P2-5',
      ok5 ? 'pass' : 'fail',
      `After silence: dot removed ${dotGoneMs === null ? 'NEVER' : ms(dotGoneMs)} later (at once, ≤ 200 ms incl. audio/analyser latency); ` +
        `trail's right end scrolled left ${r2(rightEdges[0])} → ${r2(rightEdges[rightEdges.length - 1])}; trail gone ${trailGoneMs === null ? 'NEVER' : ms(trailGoneMs)} ` +
        `after the tone stopped (expected ~1 s, accepted 850–1400 ms); band state during the 2 s: ${statesSil.join('/')} (grey).`,
    );

    // --- 6 ---
    const g40 = m6.g40;
    const gl = analyseGlide(log, T('glide'), T('glideEnd'));
    const ok6 = g40?.dot && within(g40.dot.cy, cyForCents(40) - 6, cyForCents(40) + 6) && g40.dot.cy < 50 && gl.ok;
    record(
      'P2-6',
      ok6 ? 'pass' : 'fail',
      `+40 c steady: dot cy ${g40?.dot?.cy} (expected ≈ ${cyForCents(40)}, outside the band 50..150), band ${g40?.state}. ` +
        `Slide 440·2^(30/1200) → 440·2^(70/1200) Hz over 2 s: ${gl.dotCount} dot positions, ${gl.wraps} re-centre (dot cy ${gl.wrapFrom} → ${gl.wrapTo}: ` +
        `top edge to bottom edge); cy trend before ${gl.trendBefore}, after ${gl.trendAfter} (both negative = still moving up); ` +
        `largest vertical step inside any trail polyline ${gl.maxTrailJump} units (≤ 100 = never across the graph); old trail clipped at the bottom edge after the wrap: ${gl.edgeAfterWrap}.` +
        (hasErrors(errors) ? ` ${errorSummary(errors)}` : ''),
    );
  });
}

// ---------------------------------------------------------------------------------------------------------------
// P2 7–13: filling, correct note, reveal card, five notes
// ---------------------------------------------------------------------------------------------------------------
async function p2Steps7to13(browser) {
  const steps = ['P2-7', 'P2-8', 'P2-9', 'P2-10', 'P2-11', 'P2-12', 'P2-13'];
  await scenario(browser, steps, E2EM('71,71,71,71,71'), async ({ page, errors }) => {
    await startAndWaitListening(page, 5);
    await recStart(page, false);
    const d40 = detune(440, 40);
    // --- 8 first: start filling then detune / stop before 0.5 s ---
    await page.evaluate(async (d40) => {
      const R = window.__rec;
      R.mark('s8a');
      window.__tone.set(440);
      await window.__sleep(250);
      R.mark('detune');
      window.__tone.set(d40);
      await window.__sleep(400);
      window.__tone.set(null);
      await window.__sleep(300);
      R.mark('s8b');
      window.__tone.set(440);
      await window.__sleep(250);
      R.mark('stop');
      window.__tone.set(null);
      await window.__sleep(400);
      R.mark('s8end');
    }, d40);

    // --- 7, 9–13: steady 440 Hz through all five notes ---
    const run = page.evaluate(async () => {
      const t = window.__rec.mark('steady');
      window.__tone.set(440);
      await window.__waitFor(() => window.__onHome(), 25000, 'Home');
      window.__rec.mark('home');
      window.__tone.set(null);
      return t;
    });
    await page.waitForFunction(() => (window.__graph(false)?.fill ?? 0) > 110, null, { polling: 'raf', timeout: 10_000 });
    const fillColors = await readColors(page);
    await shot(page, 'P2-7', 'filling');
    await shotGraph(page, 'P2-7', 'graph-filling');
    await waitCardVisible(page);
    const overlay = await page.evaluate(() => {
      const bd = document.querySelector('.note-reveal__backdrop');
      const card = document.querySelector('[data-testid="note-reveal"]');
      const cs = bd ? getComputedStyle(bd) : null;
      const cr = card?.getBoundingClientRect();
      const br = bd?.getBoundingClientRect();
      return {
        card: card?.textContent ?? null,
        backdrop: bd
          ? {
              position: cs.position,
              backdropFilter: cs.backdropFilter,
              webkitBackdropFilter: cs.webkitBackdropFilter,
              background: cs.backgroundColor,
              zIndex: cs.zIndex,
              pointerEvents: cs.pointerEvents,
              rect: { x: br.x, y: br.y, w: br.width, h: br.height },
            }
          : null,
        cardZ: card ? getComputedStyle(card).zIndex : null,
        cardCentre: cr ? { x: cr.x + cr.width / 2, y: cr.y + cr.height / 2, w: cr.width, h: cr.height } : null,
        viewport: { w: window.innerWidth, h: window.innerHeight },
      };
    });
    await shot(page, 'P2-9', 'card-si4-dim-blur');
    await run;
    const log = await recStop(page);
    writeOutput('P2-7', 'graph-log', { fillColors, overlay, log });

    const T = (l) => markT(log, l);
    // --- 8 ---
    const fillThenGone = (a, b, c) => {
      const before = win(log, a, b);
      const filled = before.some((e) => e.fill > 0 && e.state === 'filling');
      const maxFill = Math.max(0, ...before.map((e) => e.fill));
      const gone = win(log, b, c).find((e) => e.fill === 0);
      const refilled = gone ? win(log, gone.t, c).some((e) => e.fill > 0) : true;
      return { filled, maxFill, goneMs: gone ? gone.t - b : null, stateAfter: gone?.state, refilled };
    };
    const v1 = fillThenGone(T('s8a'), T('detune'), T('s8b'));
    const v2 = fillThenGone(T('s8b'), T('stop'), T('s8end'));
    const ok8 = [v1, v2].every((v) => v.filled && v.goneMs !== null && v.goneMs <= 200 && v.stateAfter === 'idle' && !v.refilled) &&
      !S(log).some((e) => e.t < T('steady') && e.card !== null);
    record(
      'P2-8',
      ok8 ? 'pass' : 'fail',
      `Detune +40 c after 250 ms: fill reached ${r2(v1.maxFill)}/320, removed ${v1.goneMs === null ? 'NEVER' : ms(v1.goneMs)} after the detune ` +
        `(band "${v1.stateAfter}"). Stop after 250 ms: fill reached ${r2(v2.maxFill)}/320, removed ${v2.goneMs === null ? 'NEVER' : ms(v2.goneMs)} after the stop ` +
        `(band "${v2.stateAfter}"). No refill and no card afterwards. (At once = ≤ 200 ms, the smoother needs ~50 ms to cross ±25 c.)`,
    );

    // --- 7 ---
    const steady = win(log, T('steady'));
    const eps = cardEpisodes(win(log, T('steady')));
    const firstFill = steady.find((e) => e.fill > 0);
    const firstGreen = steady.find((e) => e.state === 'green');
    const fills = firstFill && firstGreen ? win(log, firstFill.t, firstGreen.t) : [];
    const monotonic = fills.every((e, i) => i === 0 || e.fill >= fills[i - 1].fill);
    const maxFill = Math.max(0, ...fills.map((e) => e.fill));
    const fillMs = firstFill && firstGreen ? firstGreen.t - firstFill.t : null;
    const fillDiffers = !sameColor(fillColors.fill, fillColors.trail) && !sameColor(fillColors.fill, fillColors.band);
    const ok7 =
      fills.length > 5 &&
      fills.every((e) => e.state === 'filling' && e.fill > 0) &&
      monotonic &&
      maxFill >= 280 &&
      within(fillMs, 380, 800) &&
      fillDiffers;
    record(
      'P2-7',
      ok7 ? 'pass' : 'fail',
      `${fills.length} fill updates, all data-band-state "${uniq(fills.map((e) => e.state)).join('/')}", width growing monotonically ` +
        `${r2(fills[0]?.fill)} → ${r2(maxFill)} of 320 in ${fillMs === null ? '?' : ms(fillMs)} (expected ~500 ms, accepted 380–800 ms), then green. ` +
        `Fill colour ${fillColors.fill} vs trail ${fillColors.trail} vs band ${fillColors.band} (fill differs from both: ${fillDiffers}).`,
    );

    // --- 9 ---
    const e1 = eps[0];
    const vpOk =
      overlay.backdrop &&
      overlay.backdrop.position === 'fixed' &&
      Math.abs(overlay.backdrop.rect.w - overlay.viewport.w) <= 1 &&
      Math.abs(overlay.backdrop.rect.h - overlay.viewport.h) <= 1 &&
      /blur\(4px\)/.test(overlay.backdrop.backdropFilter ?? '') &&
      parseColor(overlay.backdrop.background)?.[3] > 0;
    const centred =
      overlay.cardCentre &&
      Math.abs(overlay.cardCentre.x - overlay.viewport.w / 2) <= 2 &&
      Math.abs(overlay.cardCentre.y - overlay.viewport.h / 2) <= 2;
    const greenAt = firstGreen?.t;
    const ok9 =
      !!e1 &&
      e1.snap.card === 'Si4' &&
      e1.snap.state === 'green' &&
      e1.snap.backdrop &&
      e1.snap.boxes.startsWith('done/active') &&
      e1.snap.names.split(' ')[0] === 'Si4' &&
      e1.snap.status === 'Your turn: play note 2 of 5' &&
      Math.abs(e1.start - greenAt) <= 50 &&
      vpOk &&
      centred;
    record(
      'P2-9',
      ok9 ? 'pass' : 'fail',
      `First card "${e1?.snap.card}" appeared ${e1 ? ms(e1.start - greenAt) : '?'} after the band turned green (same commit expected, ≤ 50 ms); in that snapshot: ` +
        `band "${e1?.snap.state}", boxes ${e1?.snap.boxes}, box 1 "${e1?.snap.names.split(' ')[0]}", status "${e1?.snap.status}". ` +
        `Dim layer: position ${overlay.backdrop?.position}, ${r2(overlay.backdrop?.rect.w)} × ${r2(overlay.backdrop?.rect.h)} px over a ${overlay.viewport.w} × ${overlay.viewport.h} viewport, ` +
        `background ${overlay.backdrop?.background}, backdrop-filter ${overlay.backdrop?.backdropFilter}, z-index ${overlay.backdrop?.zIndex} (card ${overlay.cardZ}); ` +
        `card centre (${r2(overlay.cardCentre?.x)}, ${r2(overlay.cardCentre?.y)}), ${r2(overlay.cardCentre?.w)} px wide (centred: ${centred}).`,
    );

    // --- 10 ---
    const during = eps.flatMap((ep) => ep.snaps);
    // The dot of the completing frame stays until the next mic frame (~1 frame). Judge "no dot appears": after
    // the first dot-less snapshot no dot may come back, and the residual must be at most one frame (≤ 50 ms).
    const residuals = eps.map((ep) => {
      const firstNoDot = ep.snaps.find((e) => e.dot === null);
      const reappears = firstNoDot ? ep.snaps.some((e) => e.t > firstNoDot.t && e.dot !== null) : true;
      return { residualMs: firstNoDot ? Math.round(firstNoDot.t - ep.start) : null, reappears };
    });
    const ok10 =
      eps.length > 0 &&
      during.every((e) => e.fill === 0 && e.state === 'green') &&
      residuals.every((x) => x.residualMs !== null && x.residualMs <= 50 && !x.reappears);
    record(
      'P2-10',
      ok10 ? 'pass' : 'fail',
      `440 Hz kept sounding through ${eps.length} cards; ${during.length} snapshots while a card was visible: fills ${during.filter((e) => e.fill > 0).length}, ` +
        `band states ${uniq(during.map((e) => e.state)).join('/')} (expected none / green). Dot: the dot of the completing frame (centred, cy 100) is still drawn ` +
        `when the card mounts and is removed by the next mic frame, ${residuals.map((x) => (x.residualMs === null ? 'NEVER' : `${x.residualMs} ms`)).join('/')} ` +
        `after each card appeared (≤ 50 ms = one frame accepted; not perceptible); no dot reappears during any card: ${residuals.every((x) => !x.reappears)}.`,
    );

    // --- 11 ---
    const durs = eps.map((ep) => (ep.end === null ? null : ep.end - ep.start));
    const resumed = eps.slice(0, 4).map((ep) => {
      const nextGrey = ep.end === null ? null : win(log, ep.end).find((e) => e.state !== 'green');
      const nextFill = ep.end === null ? null : win(log, ep.end).find((e) => e.fill > 0);
      return {
        greyMs: nextGrey ? nextGrey.t - ep.end : null,
        greyState: nextGrey?.state,
        fillMs: nextFill ? nextFill.t - ep.end : null,
      };
    });
    const ok11 =
      durs.length === 5 &&
      durs.every((d) => within(d, 400, 700)) &&
      resumed.every((x) => x.greyMs !== null && x.greyMs <= 100 && ['idle', 'filling'].includes(x.greyState) && x.fillMs !== null && x.fillMs <= 400);
    record(
      'P2-11',
      ok11 ? 'pass' : 'fail',
      `Card durations ${durs.map((d) => (d === null ? '?' : ms(d))).join(', ')} (expected ~500 ms, accepted 400–700 ms). After each of cards 1–4: band left green ` +
        `${resumed.map((x) => (x.greyMs === null ? '?' : ms(x.greyMs))).join('/')} after the card went (state ${uniq(resumed.map((x) => x.greyState)).join('/')}), ` +
        `next note started filling after ${resumed.map((x) => (x.fillMs === null ? '?' : ms(x.fillMs))).join('/')}.`,
    );

    // --- 12 ---
    const ok12 = during.length > 0 && during.every((e) => e.repeatDisabled === true && e.giveUpDisabled === false);
    record(
      'P2-12',
      ok12 ? 'pass' : 'fail',
      `While a card was visible (${during.length} snapshots over ${eps.length} cards): Repeat disabled ${uniq(during.map((e) => e.repeatDisabled)).join('/')}, ` +
        `Give up disabled ${uniq(during.map((e) => e.giveUpDisabled)).join('/')}.`,
    );

    // --- 13 ---
    const last = eps[4];
    const homeT = T('home');
    const homeAfter = last?.end ? homeT - last.end : null;
    const ok13 =
      eps.length === 5 &&
      eps.every((ep) => ep.snap.card === 'Si4') &&
      last.snap.status === 'Well done!' &&
      last.snap.boxes === 'done/done/done/done/done' &&
      within(homeAfter, 1200, 2200) &&
      !hasErrors(errors);
    record(
      'P2-13',
      ok13 ? 'pass' : 'fail',
      `${eps.length} cards: ${eps.map((ep) => `"${ep.snap.card}"`).join(', ')}. At the fifth card: status "${last?.snap.status}", boxes ${last?.snap.boxes}. ` +
        `Home ${homeAfter === null ? '?' : ms(homeAfter)} after the last card went (expected ~1.5 s, accepted 1200–2200 ms).` +
        (hasErrors(errors) ? ` ${errorSummary(errors)}` : ''),
    );
  });
}

// ---------------------------------------------------------------------------------------------------------------
// P2 14: Give up through the overlay (real mouse click at the button's coordinates)
// ---------------------------------------------------------------------------------------------------------------
async function installClickProbe(page) {
  await page.evaluate(() => {
    window.__clicks = [];
    document.addEventListener(
      'click',
      (e) => {
        window.__clicks.push({
          t: performance.now(),
          target: (e.target?.closest?.('button')?.getAttribute('aria-label') || e.target?.textContent || '').trim(),
          cardPresent: !!document.querySelector('[data-testid="note-reveal"]'),
          backdropPresent: !!document.querySelector('.note-reveal__backdrop'),
        });
      },
      true,
    );
  });
}

async function p2Step14(browser) {
  await scenario(browser, ['P2-14'], E2EM('71,60,60,60,60'), async ({ page, errors }) => {
    await startAndWaitListening(page, 5);
    await installClickProbe(page);
    await page.evaluate(() => window.__tone.set(440));
    await waitCardVisible(page);
    const hit = await page.evaluate(() => {
      const b = window.__btn('Give up');
      const r = b.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      return { x, y, hitIsButton: document.elementFromPoint(x, y) === b, card: window.__card() };
    });
    await page.mouse.click(hit.x, hit.y);
    const m = await page.evaluate(async () => {
      window.__tone.set(null);
      const click = window.__clicks[window.__clicks.length - 1];
      const home = await window.__waitFor(() => window.__onHome(), 2000, 'Home');
      await window.__sleep(2500);
      return { click, homeAfterClickMs: home - click.t, stillHome: window.__onHome(), status: window.__status() };
    });
    await shot(page, 'P2-14', 'home-after-give-up-through-overlay');
    writeOutput('P2-14', 'give-up-through-overlay', { hit, ...m, errors });
    const ok =
      hit.hitIsButton &&
      m.click?.cardPresent === true &&
      m.click?.backdropPresent === true &&
      m.click?.target === 'Give up' &&
      m.homeAfterClickMs <= 500 &&
      m.stillHome &&
      !hasErrors(errors);
    record(
      'P2-14',
      ok ? 'pass' : 'fail',
      `Card "${hit.card}" visible; elementFromPoint at Give up's centre is the button: ${hit.hitIsButton}. Real mouse click (page.mouse.click, no force) ` +
        `delivered to "${m.click?.target}" while card present=${m.click?.cardPresent} / dim layer present=${m.click?.backdropPresent}; Home ${ms(m.homeAfterClickMs)} later; ` +
        `still Home 2.5 s later: ${m.stillHome}. ${hasErrors(errors) ? errorSummary(errors) : 'No errors.'}`,
    );
  });
}

// ---------------------------------------------------------------------------------------------------------------
// P2 15: card spelled as the box (Fa#3 written = concert Mi3 164.81 Hz)
// ---------------------------------------------------------------------------------------------------------------
async function p2Step15(browser) {
  await scenario(browser, ['P2-15'], E2EM('54,66,71'), async ({ page }) => {
    await startAndWaitListening(page, 3);
    await recStart(page);
    await page.evaluate(() => window.__tone.set(164.81));
    await waitCardVisible(page);
    await shot(page, 'P2-15', 'card-fa-sharp-3');
    const log = await page.evaluate(async () => {
      window.__tone.set(null);
      await window.__waitFor(() => window.__card() === null, 3000, 'card gone');
      return window.__rec.stop();
    });
    const ep = cardEpisodes(log)[0];
    const box0 = ep?.snap.names.split(' ')[0];
    writeOutput('P2-15', 'card-vs-box', { tone: 164.81, firstCardSnapshot: ep?.snap, log });
    const ok = !!ep && ep.snap.card === box0 && /[#♭]/.test(ep.snap.card) && ep.snap.boxes.startsWith('done');
    record(
      'P2-15',
      ok ? 'pass' : 'fail',
      `164.81 Hz on ?melody=54,66,71: card "${ep?.snap.card}", first box "${box0}" (state ${ep?.snap.boxes.split('/')[0]}) in the same snapshot; ` +
        `identical: ${ep?.snap.card === box0}; accidental spelling: ${/[#♭]/.test(ep?.snap.card ?? '')}.`,
    );
  });
}

// ---------------------------------------------------------------------------------------------------------------
// P2 16–20: wrong notes, red band, Repeat, correct note clears red
// ---------------------------------------------------------------------------------------------------------------
async function p2Steps16to20(browser) {
  const steps = ['P2-16', 'P2-17', 'P2-18', 'P2-19', 'P2-20'];
  await scenario(browser, steps, E2EM('71,72,72'), async ({ page, errors }) => {
    await startAndWaitListening(page, 3);
    await recStart(page, true);
    const tRed = await page.evaluate(async () => {
      window.__tone.set(440);
      await window.__waitFor(() => window.__card() !== null, 5000, 'first card');
      await window.__waitFor(
        () => window.__card() === null && window.__btn('Repeat melody')?.disabled === false,
        3000,
        'listening for note 2',
      );
      window.__rec.mark('listen2');
      const t = await window.__waitFor(() => window.__graph(false).state === 'red', 5000, 'red band');
      window.__rec.mark('red');
      return t;
    });
    await shot(page, 'P2-16', 'red-band-440-for-do5');
    await shotGraph(page, 'P2-16', 'graph-red');
    await page.evaluate(async () => {
      await window.__sleep(2000);
      window.__rec.mark('hold2s');
    });
    await shotGraph(page, 'P2-17', 'graph-red-after-2s-more');
    await page.evaluate(async () => {
      window.__rec.mark('silence');
      window.__tone.set(null);
      await window.__sleep(2000);
    });
    await shotGraph(page, 'P2-18', 'graph-red-after-2s-silence');
    await page.evaluate(() => window.__rec.mark('repeat'));
    await page.getByRole('button', { name: 'Repeat melody' }).click();
    const replayShot = page
      .evaluate(() => window.__waitFor(() => window.__status() === 'Listen…', 5000, 'Listen…'))
      .then(() => shot(page, 'P2-19', 'red-during-listen'));
    await page.evaluate(async () => {
      await window.__waitFor(() => window.__status() === 'Listen…', 5000, 'Listen…');
      await window.__waitFor(
        () => window.__status() === 'Your turn: play note 2 of 3' && window.__btn('Repeat melody')?.disabled === false,
        20000,
        'listening after Repeat',
      );
      window.__rec.mark('listenAgain');
      window.__tone.set(440);
      await window.__sleep(1000);
      window.__rec.mark('replayed');
      window.__tone.set(null);
      await window.__sleep(300);
    });
    await replayShot;
    await shotGraph(page, 'P2-19', 'graph-red-440-again');
    const cardShot = waitCardVisible(page).then(() => shot(page, 'P2-20', 'card-do5'));
    await page.evaluate(async () => {
      window.__rec.mark('right');
      window.__tone.set(466.16);
      await window.__waitFor(() => window.__card() !== null, 5000, 'Do5 card');
      window.__tone.set(null);
      await window.__waitFor(
        () => window.__card() === null && window.__btn('Repeat melody')?.disabled === false,
        3000,
        'listening for note 3',
      );
      window.__rec.mark('afterCard');
      await window.__sleep(200);
      window.__rec.mark('again440');
      window.__tone.set(440);
      await window.__sleep(1500);
      window.__tone.set(null);
      window.__rec.mark('end');
    });
    await cardShot;
    await shotGraph(page, 'P2-20', 'graph-after-440-on-note-3');
    const log = await recStop(page);
    writeOutput('P2-16', 'graph-log', { log });
    const T = (l) => markT(log, l);

    // --- 16 ---
    const w16 = span(log, T('listen2'), T('silence'));
    const firstFill = w16.find((e) => e.state === 'filling' && e.fill > 0);
    const red = w16.filter((e) => e.state === 'red');
    const fillToRed = firstFill ? tRed - firstFill.t : null;
    const ok16 =
      !!firstFill &&
      within(fillToRed, 350, 900) &&
      red.length > 0 &&
      red.every((e) => e.fill === 0) &&
      w16.every((e) => e.card === null && e.region === '') &&
      uniq(w16.map((e) => e.status)).length === 1 &&
      w16[0].status === 'Your turn: play note 2 of 3' &&
      uniq(w16.map((e) => e.boxes)).join() === 'done/active/pending';
    record(
      'P2-16',
      ok16 ? 'pass' : 'fail',
      `Note 2 (Do5) with 440 Hz: band filled (first fill ${r2(firstFill?.fill)}) and turned red ${fillToRed === null ? '?' : ms(fillToRed)} after the fill started ` +
        `(expected ~0.5 s); fill on red: ${uniq(red.map((e) => e.fill)).join('/')}. Until silence: cards ${w16.filter((e) => e.card).length}, ` +
        `status ${uniq(w16.map((e) => `"${e.status}"`)).join('/')}, boxes ${uniq(w16.map((e) => e.boxes)).join(' | ')}, ` +
        `status-region text ${uniq(w16.map((e) => JSON.stringify(e.region))).join('/')} (nothing announced: the status text never changed and the overlay region stayed empty).`,
    );

    // --- 17 ---
    const w17 = span(log, tRed, T('hold2s'));
    const ok17 = w17.length > 0 && w17.every((e) => e.state === 'red' && e.card === null && e.fill === 0);
    record(
      'P2-17',
      ok17 ? 'pass' : 'fail',
      `2 more seconds of 440 Hz: ${w17.length} snapshots, band states ${uniq(w17.map((e) => e.state)).join('/')}, cards ${w17.filter((e) => e.card).length}, ` +
        `boxes ${uniq(w17.map((e) => e.boxes)).join(' | ')}.`,
    );

    // --- 18 ---
    const w18 = span(log, T('silence'), T('repeat'));
    const dotGone = win(log, T('silence'), T('repeat')).find((e) => !e.dot);
    const trailGone = win(log, T('silence'), T('repeat')).find((e) => e.trailCount === 0);
    const end18 = at(log, T('repeat'));
    const ok18 =
      !!dotGone &&
      dotGone.t - T('silence') <= 200 &&
      !!trailGone &&
      within(trailGone.t - T('silence'), 800, 1500) &&
      w18.every((e) => e.state === 'red') &&
      end18?.state === 'red' &&
      end18.dot === null &&
      end18.trailCount === 0;
    record(
      'P2-18',
      ok18 ? 'pass' : 'fail',
      `Silence: dot gone after ${dotGone ? ms(dotGone.t - T('silence')) : 'NEVER'}, trail gone after ${trailGone ? ms(trailGone.t - T('silence')) : 'NEVER'}; ` +
        `band states over the 2 s: ${uniq(w18.map((e) => e.state)).join('/')}; at the end: band "${end18?.state}", dot ${end18?.dot}, trails ${end18?.trailCount}.`,
    );

    // --- 19 ---
    const w19 = span(log, T('repeat'), T('replayed'));
    const statuses = uniq(w19.map((e) => e.status));
    const again = win(log, T('listenAgain'), T('replayed'));
    const ok19 =
      statuses.includes('Listen…') &&
      statuses.includes('Get ready…') &&
      statuses.includes('Your turn: play note 2 of 3') &&
      w19.every((e) => e.state === 'red') &&
      again.some((e) => e.dot) &&
      !again.some((e) => e.state === 'filling' || e.fill > 0) &&
      w19.every((e) => e.boxes.startsWith('done'));
    record(
      'P2-19',
      ok19 ? 'pass' : 'fail',
      `Through ${statuses.map((s) => `"${s}"`).join(' → ')}: band states ${uniq(w19.map((e) => e.state)).join('/')} (${w19.length} snapshots). ` +
        `440 Hz again for 1 s after listening resumed: dot shown ${again.some((e) => e.dot)}, filling ever ${again.some((e) => e.state === 'filling' || e.fill > 0)} ` +
        `(expected red at once, no fill); box 1 stayed done.`,
    );

    // --- 20 ---
    const w20 = win(log, T('right'), T('afterCard'));
    const ep = cardEpisodes(w20)[0];
    const firstNonRed = w20.find((e) => e.state !== 'red');
    const filling20 = w20.find((e) => e.state === 'filling' && e.fill > 0);
    const w20b = win(log, T('again440'), T('end'));
    const fillB = w20b.find((e) => e.state === 'filling' && e.fill > 0);
    const redB = w20b.find((e) => e.state === 'red');
    const ok20 =
      !!firstNonRed &&
      ['idle', 'filling'].includes(firstNonRed.state) &&
      !!filling20 &&
      !!ep &&
      ep.snap.card === 'Do5' &&
      ep.snap.state === 'green' &&
      ep.snap.names.split(' ')[1] === 'Do5' &&
      at(log, T('again440'))?.state === 'idle' &&
      !!fillB &&
      (!redB || redB.t > fillB.t) &&
      !hasErrors(errors);
    record(
      'P2-20',
      ok20 ? 'pass' : 'fail',
      `466.16 Hz: band left red for "${firstNonRed?.state}" (re-centred), filled (${r2(filling20?.fill)}…), card "${ep?.snap.card}" with band "${ep?.snap.state}", ` +
        `box 2 "${ep?.snap.names.split(' ')[1]}". After the card: band "${at(log, T('again440'))?.state}"; 440 Hz on note 3 filled again ` +
        `(${fillB ? `${ms(fillB.t - T('again440'))} after the tone` : 'NEVER'}) before turning red${redB ? ` (${ms(redB.t - T('again440'))})` : ''}: red marks cleared.` +
        (hasErrors(errors) ? ` ${errorSummary(errors)}` : ''),
    );
  });
}

async function p2Step21(browser) {
  await scenario(browser, ['P2-21'], E2EM('71,71,71'), async ({ page }) => {
    await startAndWaitListening(page, 3);
    await recStart(page);
    const tRed = await page.evaluate(async () => {
      window.__rec.mark('tone');
      window.__tone.set(220);
      const t = await window.__waitFor(() => window.__graph(false).state === 'red', 5000, 'red band');
      await window.__sleep(700);
      return t;
    });
    await shot(page, 'P2-21', 'octave-red');
    const log = await page.evaluate(() => {
      window.__tone.set(null);
      return window.__rec.stop();
    });
    writeOutput('P2-21', 'graph-log', { log });
    const w = win(log, markT(log, 'tone'));
    const fill = w.find((e) => e.state === 'filling' && e.fill > 0);
    const ok =
      !!fill &&
      fill.t < tRed &&
      w.every((e) => e.card === null) &&
      w.every((e) => e.boxes === 'active/pending/pending') &&
      at(log, Infinity)?.state === 'red';
    record(
      'P2-21',
      ok ? 'pass' : 'fail',
      `220 Hz on Si4: filled first (${fill ? ms(fill.t - markT(log, 'tone')) : 'never'} after the tone), red ${ms(tRed - markT(log, 'tone'))} after the tone; ` +
        `cards ${w.filter((e) => e.card).length}; boxes ${uniq(w.map((e) => e.boxes)).join(' | ')}; final band "${at(log, Infinity)?.state}".`,
    );
  });
}

// ---------------------------------------------------------------------------------------------------------------
// P2 22–23: themes
// ---------------------------------------------------------------------------------------------------------------
const TOKEN_MAP = [
  ['graphBg', 'dot-trail', '--color-graph-bg'],
  ['graphBorder', 'dot-trail', '--color-graph-border'],
  ['band', 'dot-trail', '--color-graph-band'],
  ['centre', 'dot-trail', '--color-graph-centre'],
  ['guide', 'dot-trail', '--color-graph-guide'],
  ['trail', 'dot-trail', '--color-graph-trail'],
  ['dot', 'dot-trail', '--color-graph-dot'],
  ['fill', 'filling', '--color-graph-fill'],
  ['band', 'card', '--color-graph-green'],
  ['card', 'card', '--color-reveal-card'],
  ['cardText', 'card', '--color-reveal-text'],
  ['backdrop', 'card', '--color-reveal-backdrop'],
  ['band', 'red', '--color-graph-red'],
];
const THEME_MEASURED = {};

async function p2Theme(browser, id, scheme) {
  await scenario(
    browser,
    [id],
    E2EM('71,72,72'),
    async ({ page, errors }) => {
      const tokens = readTokens()[scheme];
      const C = {};
      await startAndWaitListening(page, 3);
      await page.evaluate(async (hz) => {
        window.__tone.set(hz);
        await window.__sleep(700);
      }, detune(440, 35));
      C['dot-trail'] = await readColors(page);
      await shot(page, id, `${scheme}-dot-trail`);
      await page.evaluate(async () => {
        window.__tone.set(null);
        await window.__sleep(150);
        window.__tone.set(440);
      });
      await page.waitForFunction(() => (window.__graph(false)?.fill ?? 0) > 100, null, { polling: 'raf', timeout: 5000 });
      C.filling = await readColors(page);
      await shot(page, id, `${scheme}-filling`);
      await waitCardVisible(page);
      C.card = await readColors(page);
      await shot(page, id, `${scheme}-card`);
      await page.evaluate(() => window.__waitFor(() => window.__graph(false).state === 'red', 6000, 'red band'));
      C.red = await readColors(page);
      await shot(page, id, `${scheme}-red`);
      await page.evaluate(() => window.__tone.set(null));
      THEME_MEASURED[scheme] = C;
      const rows = TOKEN_MAP.map(([prop, phase, token]) => {
        const actual = C[phase]?.[prop] ?? null;
        return { token, element: `${prop} (${phase})`, expected: tokens[token], actual, match: sameColor(actual, tokens[token]) };
      });
      const phaseStates = { 'dot-trail': C['dot-trail'].bandState, filling: C.filling.bandState, card: C.card.bandState, red: C.red.bandState };
      const statesOk =
        phaseStates['dot-trail'] === 'idle' && phaseStates.filling === 'filling' && phaseStates.card === 'green' && phaseStates.red === 'red';
      const cardContrast = contrast(C.card.cardText, C.card.card);
      const dotContrast = contrast(C['dot-trail'].dot, C['dot-trail'].graphBg);
      const trailContrast = contrast(C['dot-trail'].trail, C['dot-trail'].graphBg);
      let differs = '';
      let differOk = true;
      const other = scheme === 'light' ? THEME_MEASURED.dark : null;
      if (other) {
        const diffs = TOKEN_MAP.map(([prop, phase]) => !sameColor(C[phase]?.[prop], other[phase]?.[prop]));
        differOk = diffs.every(Boolean);
        differs = ` ${diffs.filter(Boolean).length}/${diffs.length} measured colours differ from the dark run.`;
      }
      writeOutput(id, `${scheme}-colours`, { scheme, tokens, measured: C, rows, cardContrast, dotContrast, trailContrast });
      const ok = rows.every((r) => r.match) && statesOk && cardContrast >= 4.5 && differOk && !hasErrors(errors);
      record(
        id,
        ok ? 'pass' : 'fail',
        `prefers-color-scheme: ${scheme} (Playwright colorScheme). ${rows.filter((r) => r.match).length}/${rows.length} computed colours equal their ` +
          `${scheme} token: ${rows.map((r) => `${r.element} ${r.actual}${r.match ? '' : ` ≠ ${r.token} ${r.expected}`}`).join('; ')}. ` +
          `Band states captured: ${Object.values(phaseStates).join('/')}. Contrast: card text ${cardContrast}:1, dot ${dotContrast}:1, trail ${trailContrast}:1 on the graph background.${differs} ` +
          `The checklist's colour words (e.g. ${scheme === 'dark' ? '"bright yellow trail, white dot, olive fill"' : '"amber trail, dark dot, pale gold fill"'}) are judged by the tokens and the screenshots.`,
      );
    },
    { colorScheme: scheme },
  );
}

// ---------------------------------------------------------------------------------------------------------------
// P2 24: 320 px viewport
// ---------------------------------------------------------------------------------------------------------------
async function p2Step24(browser) {
  await scenario(
    browser,
    ['P2-24'],
    E2EM('71,71,71,71,71'),
    async ({ page }) => {
      await startAndWaitListening(page, 5);
      const measure = () =>
        page.evaluate(() => {
          const g = document.querySelector('[data-testid="pitch-graph"]').getBoundingClientRect();
          const card = document.querySelector('[data-testid="note-reveal"]')?.getBoundingClientRect() ?? null;
          return {
            viewport: { w: window.innerWidth, h: window.innerHeight },
            graph: { x: g.x, y: g.y, w: g.width, h: g.height },
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            card: card ? { left: card.left, top: card.top, right: card.right, bottom: card.bottom, w: card.width } : null,
          };
        });
      const a = await measure();
      await shot(page, 'P2-24', '320px-listening');
      await page.evaluate(() => window.__tone.set(440));
      await waitCardVisible(page);
      const b = await measure();
      await shot(page, 'P2-24', '320px-card');
      await page.evaluate(() => window.__tone.set(null));
      writeOutput('P2-24', '320px-layout', { listening: a, card: b });
      const cardIn = b.card && b.card.left >= 0 && b.card.top >= 0 && b.card.right <= b.viewport.w && b.card.bottom <= b.viewport.h;
      const ok =
        Math.abs(a.graph.w - 288) <= 4 &&
        Math.abs(a.graph.h - 180) <= 4 &&
        a.scrollWidth <= a.clientWidth &&
        b.scrollWidth <= b.clientWidth &&
        cardIn;
      record(
        'P2-24',
        ok ? 'pass' : 'fail',
        `Viewport ${a.viewport.w} × ${a.viewport.h}: graph ${r2(a.graph.w)} × ${r2(a.graph.h)} px at x ${r2(a.graph.x)} (expected ≈ 288 × 180); ` +
          `scrollWidth/clientWidth ${a.scrollWidth}/${a.clientWidth} (listening), ${b.scrollWidth}/${b.clientWidth} (card) → no horizontal scroll; ` +
          `card ${b.card ? `${r2(b.card.left)}..${r2(b.card.right)} × ${r2(b.card.top)}..${r2(b.card.bottom)}` : 'NOT SHOWN'} (inside the viewport: ${!!cardIn}).`,
      );
    },
    { viewport: { width: 320, height: 640 } },
  );
}

// ---------------------------------------------------------------------------------------------------------------
// P2 25–26: motion
// ---------------------------------------------------------------------------------------------------------------
function captureAnimationsAtAppear(page) {
  return page.evaluate(async () => {
    const r = {};
    window.__tone.set(440);
    await window.__waitFor(
      () => {
        const card = document.querySelector('[data-testid="note-reveal"]');
        const bd = document.querySelector('.note-reveal__backdrop');
        if (!card || !bd) return false;
        const info = (el) => {
          const cs = getComputedStyle(el);
          return {
            animationName: cs.animationName,
            animationDuration: cs.animationDuration,
            transitionDuration: cs.transitionDuration,
            opacity: cs.opacity,
            running: el.getAnimations().map((a) => ({ name: a.animationName ?? null, state: a.playState, duration: a.effect?.getTiming().duration })),
          };
        };
        r.card = info(card);
        r.backdrop = info(bd);
        r.cardEl = card;
        r.bdEl = bd;
        r.appearAt = performance.now();
        return true;
      },
      6000,
      'card',
    );
    await window.__waitFor(() => !r.cardEl.isConnected, 3000, 'card removed');
    r.removedAt = performance.now();
    r.cardConnected = r.cardEl.isConnected;
    r.backdropConnected = r.bdEl.isConnected;
    r.leftovers = document.querySelectorAll('.note-reveal__card, .note-reveal__backdrop').length;
    r.regionChildren = document.querySelector('[data-testid="note-reveal-region"]').children.length;
    window.__tone.set(null);
    delete r.cardEl;
    delete r.bdEl;
    return r;
  });
}

async function p2Step25(browser) {
  await scenario(
    browser,
    ['P2-25'],
    E2EM('71,71,71,71,71'),
    async ({ page }) => {
      await startAndWaitListening(page, 5);
      const shotP = waitCardVisible(page).then(() => shot(page, 'P2-25', 'reduced-motion-card'));
      const m = await captureAnimationsAtAppear(page);
      await shotP;
      writeOutput('P2-25', 'reduced-motion', m);
      const ok =
        m.card.animationName === 'none' &&
        m.backdrop.animationName === 'none' &&
        m.card.running.length === 0 &&
        m.backdrop.running.length === 0 &&
        m.card.opacity === '1' &&
        m.backdrop.opacity === '1';
      record(
        'P2-25',
        ok ? 'pass' : 'fail',
        `prefers-reduced-motion: reduce. At insertion: card animation-name "${m.card.animationName}", ${m.card.running.length} running animations, opacity ${m.card.opacity}; ` +
          `dim layer animation-name "${m.backdrop.animationName}", ${m.backdrop.running.length} running, opacity ${m.backdrop.opacity} (appear instantly).`,
      );
    },
    { reducedMotion: 'reduce' },
  );
}

async function p2Step26(browser) {
  await scenario(
    browser,
    ['P2-26'],
    E2EM('71,71,71,71,71'),
    async ({ page }) => {
      await startAndWaitListening(page, 5);
      const m = await captureAnimationsAtAppear(page);
      await shot(page, 'P2-26', 'after-card-removed');
      writeOutput('P2-26', 'motion', m);
      const ok =
        m.backdrop.animationName === 'note-reveal-fade' &&
        m.card.animationName === 'note-reveal-pop' &&
        m.backdrop.running.length > 0 &&
        m.card.running.length > 0 &&
        parseFloat(m.backdrop.animationDuration) <= 0.3 &&
        parseFloat(m.card.animationDuration) <= 0.3 &&
        m.card.transitionDuration === '0s' &&
        m.backdrop.transitionDuration === '0s' &&
        !m.cardConnected &&
        !m.backdropConnected &&
        m.leftovers === 0 &&
        m.regionChildren === 0;
      record(
        'P2-26',
        ok ? 'pass' : 'fail',
        `No reduced motion. At insertion: dim layer "${m.backdrop.animationName}" ${m.backdrop.animationDuration} (${m.backdrop.running.length} running), ` +
          `card "${m.card.animationName}" ${m.card.animationDuration} (${m.card.running.length} running) — keyframes: fade from opacity 0; pop from opacity 0 + scale(0.9). ` +
          `Exit: both elements removed from the DOM in one commit (${ms(m.removedAt - m.appearAt)} after appearing), ${m.leftovers} leftovers, transition-duration ` +
          `${m.card.transitionDuration}/${m.backdrop.transitionDuration} → no exit animation.`,
      );
    },
    { reducedMotion: 'no-preference' },
  );
}

// ---------------------------------------------------------------------------------------------------------------
// P2 27: gear during the card
// ---------------------------------------------------------------------------------------------------------------
async function p2Step27(browser) {
  await scenario(browser, ['P2-27'], E2EM('71,71,71,71,71'), async ({ page, errors }) => {
    await startAndWaitListening(page, 5);
    await installClickProbe(page);
    await page.evaluate(() => window.__tone.set(440));
    await waitCardVisible(page);
    const hit = await page.evaluate(() => {
      window.__tone.set(null);
      const b = document.querySelector('button[aria-label="Settings"]');
      const r = b.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      return { x, y, hitIsGear: document.elementFromPoint(x, y)?.closest('button') === b, card: window.__card() };
    });
    await page.mouse.click(hit.x, hit.y);
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await dialog.waitFor({ timeout: 3000 });
    const top = await page.evaluate(() => {
      const d = document.querySelector('dialog[open]');
      const r = d.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { open: !!d, topIsDialog: !!el && d.contains(el), card: window.__card(), click: window.__clicks[window.__clicks.length - 1] };
    });
    await shot(page, 'P2-27', 'settings-opened-from-card');
    const volume = dialog.getByRole('slider', { name: 'Playback volume' });
    const duration = dialog.getByRole('slider', { name: 'Note duration' });
    await volume.fill('80');
    await duration.fill('500');
    const vt = { volume: await volume.getAttribute('aria-valuetext'), duration: await duration.getAttribute('aria-valuetext') };
    await dialog.getByRole('button', { name: 'Close' }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 3000 });
    const after = await page.evaluate(async () => {
      const r = { status: window.__status(), boxes: [0, 1].map((i) => window.__box(i)) };
      window.__tone.set(440);
      try {
        await window.__waitFor(() => window.__card() !== null, 5000, 'second card');
        r.secondCard = window.__card();
      } catch (e) {
        r.secondCard = `ERROR ${e.message}`;
      }
      window.__tone.set(null);
      return r;
    });
    writeOutput('P2-27', 'settings-during-card', { hit, top, vt, after, errors });
    const ok =
      hit.hitIsGear &&
      top.click?.cardPresent === true &&
      top.open &&
      top.topIsDialog &&
      vt.volume === '80%' &&
      !!vt.duration &&
      after.status === 'Your turn: play note 2 of 5' &&
      after.secondCard === 'Si4' &&
      !hasErrors(errors);
    record(
      'P2-27',
      ok ? 'pass' : 'fail',
      `Gear clicked with the real mouse while the card "${hit.card}" was shown (card present at the click: ${top.click?.cardPresent}); elementFromPoint at the gear: gear ${hit.hitIsGear}. ` +
        `Settings dialog opened (modal, top layer: element at its centre belongs to the dialog = ${top.topIsDialog}). Sliders worked: volume ${vt.volume}, ` +
        `note duration ${vt.duration}; Close closed it. Training continued: status "${after.status}", next note gave card "${after.secondCard}".` +
        (hasErrors(errors) ? ` ${errorSummary(errors)}` : ''),
    );
  });
}

// ---------------------------------------------------------------------------------------------------------------
// P2 28–31: random melody on 5173
// ---------------------------------------------------------------------------------------------------------------
async function p2Steps28to31(browser) {
  const steps = ['P2-28', 'P2-29', 'P2-30', 'P2-31'];
  await scenario(browser, steps, `${DEV}/`, async ({ page, errors }) => {
    await page.getByRole('button', { name: 'Start training' }).click();
    await page.evaluate(() => window.__waitFor(() => window.__status() === 'Listen…', 5000, 'Listen…'));
    const total = await page.evaluate(() => window.__boxCount());
    await page.evaluate(
      (n) => window.__waitFor(() => window.__status() === `Your turn: play note 1 of ${n}` && window.__btn('Repeat melody')?.disabled === false, 30000, 'listening'),
      total,
    );
    const synth0 = await page.evaluate(() => window.__synthInfo());
    const freqs = synth0[synth0.length - 1].freqs;
    await recStart(page, false);
    const notes = [];
    const listeningFor = (i) =>
      page.evaluate(
        ({ i, n }) =>
          window.__waitFor(
            () => window.__status() === `Your turn: play note ${i + 1} of ${n}` && window.__btn('Repeat melody')?.disabled === false && window.__card() === null,
            30000,
            `listening for note ${i + 1}`,
          ),
        { i, n: total },
      );

    // Note 1 (28): slightly sharp / flat, then in tune.
    const f0 = freqs[0];
    await page.evaluate(
      async ({ s, f }) => {
        const R = window.__rec;
        R.mark('sharp');
        window.__tone.set(s);
        await window.__sleep(350);
        R.mark('gap1');
        window.__tone.set(null);
        await window.__sleep(150);
        R.mark('flat');
        window.__tone.set(f);
        await window.__sleep(350);
        R.mark('gap2');
        window.__tone.set(null);
        await window.__sleep(150);
        R.mark('note0');
      },
      { s: detune(f0, 15), f: detune(f0, -15) },
    );
    notes.push(await playRightNote(page, f0, 0));
    await shot(page, 'P2-28', 'random-first-note-card');

    // Note 2 (29): wrong (semitone below) until red, Repeat, wrong again, then right.
    await listeningFor(1);
    const wrong1 = detune(freqs[1], -100);
    await page.evaluate(async (w) => {
      window.__rec.mark('wrong1');
      window.__tone.set(w);
      await window.__waitFor(() => window.__graph(false).state === 'red', 5000, 'red (note 2)');
      window.__rec.mark('red1');
      window.__tone.set(null);
      await window.__sleep(300);
      window.__rec.mark('repeat1');
    }, wrong1);
    await shot(page, 'P2-29', 'random-wrong-note-red');
    await page.getByRole('button', { name: 'Repeat melody' }).click();
    await page.evaluate(() => window.__waitFor(() => window.__status() === 'Listen…', 5000, 'Listen…'));
    await shot(page, 'P2-29', 'random-red-during-repeat');
    await listeningFor(1);
    await page.evaluate(async (w) => {
      window.__rec.mark('listen1');
      window.__tone.set(w);
      await window.__sleep(700);
      window.__rec.mark('wrongAgainEnd');
      window.__tone.set(null);
      await window.__sleep(200);
      window.__rec.mark('right1');
    }, wrong1);
    notes.push(await playRightNote(page, freqs[1], 1));
    await listeningFor(2);
    await page.evaluate(() => window.__rec.mark('listening2'));
    await shot(page, 'P2-29', 'random-after-card-grey');

    // Note 3 (31 then 30): wrong until red, change settings, Repeat with live volume, glide, then right.
    const wrong2 = detune(freqs[2], -100);
    await page.evaluate(async (w) => {
      window.__rec.mark('wrong2');
      window.__tone.set(w);
      await window.__waitFor(() => window.__graph(false).state === 'red', 5000, 'red (note 3)');
      window.__tone.set(null);
      await window.__sleep(200);
      window.__rec.mark('settings');
    }, wrong2);
    const groupsBefore = (await page.evaluate(() => window.__synthInfo())).length;
    await page.getByRole('button', { name: 'Settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await dialog.waitFor({ timeout: 3000 });
    await dialog.getByRole('slider', { name: 'Note duration' }).fill('500');
    await dialog.getByRole('slider', { name: 'Playback volume' }).fill('80');
    const vt1 = {
      duration: await dialog.getByRole('slider', { name: 'Note duration' }).getAttribute('aria-valuetext'),
      volume: await dialog.getByRole('slider', { name: 'Playback volume' }).getAttribute('aria-valuetext'),
    };
    await shot(page, 'P2-31', 'settings-during-training');
    await dialog.getByRole('button', { name: 'Close' }).click();
    const stateBeforeRepeat = await page.evaluate(() => ({ band: window.__graph(false).state, boxes: [0, 1, 2].map((i) => window.__box(i)) }));
    await page.evaluate(() => window.__rec.mark('repeat2'));
    await page.getByRole('button', { name: 'Repeat melody' }).click();
    await page.evaluate(() => window.__waitFor(() => window.__status() === 'Listen…', 5000, 'Listen…'));
    // Live volume during the replay.
    await page.getByRole('button', { name: 'Settings' }).click();
    await dialog.waitFor({ timeout: 3000 });
    const volT = await page.evaluate(() => performance.now());
    await dialog.getByRole('slider', { name: 'Playback volume' }).fill('30');
    const ramp = await page.evaluate(
      async ({ idx }) => {
        const deadline = performance.now() + 1500;
        while (performance.now() < deadline) {
          const g = window.__synthInfo()[idx];
          const hit = g?.ramps.find((x) => x.value === 0.3);
          if (hit) return { at: hit.at, group: g };
          await new Promise((res) => setTimeout(res, 10));
        }
        return { at: null, group: window.__synthInfo()[idx] };
      },
      { idx: groupsBefore },
    );
    await dialog.getByRole('button', { name: 'Close' }).click();
    await listeningFor(2);
    await page.evaluate(() => window.__rec.mark('listen2'));
    const synthAll = await page.evaluate(() => window.__synthInfo());

    // Glide (30).
    await page.evaluate(() => {
      window.__rec.trails = true;
    });
    await page.evaluate(
      async ({ a, b }) => {
        window.__rec.mark('glide');
        window.__tone.glide(a, b, 2000);
        await window.__sleep(2200);
        window.__rec.mark('glideEnd');
        window.__tone.set(null);
        await window.__sleep(200);
        window.__rec.trails = false;
      },
      { a: detune(freqs[2], 30), b: detune(freqs[2], 70) },
    );
    await shotGraph(page, 'P2-30', 'random-after-glide');
    notes.push(await playRightNote(page, freqs[2], 2));
    for (let i = 3; i < total; i += 1) {
      await listeningFor(i);
      notes.push(await playRightNote(page, freqs[i], i));
    }
    await page.evaluate(() => window.__waitFor(() => window.__onHome(), 6000, 'Home'));
    const log = await recStop(page);
    writeOutput('P2-28', 'random-melody-log', { total, freqs, notes, vt1, stateBeforeRepeat, volT, ramp, synthAll, log });
    const T = (l) => markT(log, l);

    // --- 28 ---
    const sharpDots = win(log, T('sharp') + 120, T('gap1')).filter((e) => e.dot).map((e) => e.dot.cy);
    const flatDots = win(log, T('flat') + 120, T('gap2')).filter((e) => e.dot).map((e) => e.dot.cy);
    const eps = cardEpisodes(log);
    // Fill duration per note: first snapshot of the uninterrupted 'filling' run that ends in the green band
    // (the band turns green a few ms before the card mounts).
    const fillTimes = eps.map((ep) => {
      const before = win(log, ep.start - 1500, ep.start);
      let k = before.length - 1;
      while (k >= 0 && before[k].state === 'green') k -= 1;
      const greenAt = before[k + 1]?.t ?? ep.start;
      let firstFill = null;
      for (; k >= 0 && before[k].state === 'filling' && before[k].fill > 0; k -= 1) firstFill = before[k];
      return firstFill ? Math.round(greenAt - firstFill.t) : null;
    });
    const namesOk = notes.every((n) => n.card === n.box && n.boxState === 'done' && n.state === 'green');
    const wrongRed = [T('red1'), T('settings')].every((x) => typeof x === 'number');
    const wrongCards = win(log, T('wrong1'), T('right1')).filter((e) => e.card).length + win(log, T('wrong2'), T('listen2')).filter((e) => e.card).length;
    const ok28 =
      within(mean(sharpDots), cyForCents(15) - 8, cyForCents(15) + 8) &&
      within(mean(flatDots), cyForCents(-15) - 8, cyForCents(-15) + 8) &&
      stdev(sharpDots) < 2.5 &&
      stdev(flatDots) < 2.5 &&
      notes.length === total &&
      namesOk &&
      fillTimes.every((x) => within(x, 380, 900)) &&
      wrongRed &&
      wrongCards === 0;
    record(
      'P2-28',
      ok28 ? 'pass' : 'fail',
      `Random melody of ${total} notes (concert ${freqs.join(', ')} Hz, written ${notes.map((n) => n.box).join(' ')}). Note 1 at +15 c: mean dot cy ${r2(mean(sharpDots))} ` +
        `(σ ${r2(stdev(sharpDots))}), at −15 c: ${r2(mean(flatDots))} (σ ${r2(stdev(flatDots))}) → up/down, smooth. Fill-to-card times ${fillTimes.map((x) => (x === null ? '?' : `${x} ms`)).join('/')} ` +
        `(~0.5 s). Cards ${notes.map((n) => `"${n.card}"`).join(', ')} equal the box names: ${namesOk}. Wrong notes (a semitone below notes 2 and 3) turned red, ${wrongCards} cards.`,
    );

    // --- 29 ---
    const wRep = span(log, T('repeat1'), T('listen1'));
    const repStatuses = uniq(wRep.map((e) => e.status));
    const again = win(log, T('listen1'), T('wrongAgainEnd'));
    const afterCard2 = at(log, T('listening2'));
    const ok29 =
      repStatuses.includes('Listen…') &&
      repStatuses.includes('Get ready…') &&
      wRep.every((e) => e.state === 'red') &&
      !again.some((e) => e.state === 'filling' || e.fill > 0) &&
      again.some((e) => e.state === 'red' && e.dot) &&
      notes[1].card === notes[1].box &&
      ['idle', 'filling'].includes(afterCard2?.state) &&
      afterCard2?.status === `Your turn: play note 3 of ${total}` &&
      afterCard2?.repeatDisabled === false;
    record(
      'P2-29',
      ok29 ? 'pass' : 'fail',
      `Through Repeat (${repStatuses.map((s) => `"${s}"`).join(' → ')}): band ${uniq(wRep.map((e) => e.state)).join('/')}; the wrong note again: ` +
        `red at once (filling ever: ${again.some((e) => e.state === 'filling' || e.fill > 0)}). Correct note → card "${notes[1].card}" (box "${notes[1].box}"); after it: ` +
        `band "${afterCard2?.state}", status "${afterCard2?.status}", Repeat enabled ${afterCard2?.repeatDisabled === false} (listening resumed).`,
    );

    // --- 30 ---
    const gl = analyseGlide(log, T('glide'), T('glideEnd'));
    record(
      'P2-30',
      gl.ok ? 'pass' : 'fail',
      `Slide on note 3 (${r2(freqs[2])} Hz) from +30 c to +70 c over 2 s: ${gl.wraps} re-centre (dot cy ${gl.wrapFrom} → ${gl.wrapTo}), trend before ${gl.trendBefore} / after ` +
        `${gl.trendAfter} (same direction), largest vertical step in any trail polyline ${gl.maxTrailJump} units (≤ 100: no jump across), old trail clipped at the edge: ${gl.edgeAfterWrap}.`,
    );

    // --- 31 ---
    const firstGroup = synthAll[0];
    const replay = synthAll[groupsBefore];
    const wRep2 = span(log, T('repeat2'), T('listen2'));
    const rampDelay = ramp.at !== null ? ramp.at - volT : null;
    const ok31 =
      vt1.volume === '80%' &&
      !!replay &&
      Math.abs(replay.initialVolume - 0.8) < 0.001 &&
      replay.noteSpacingMs.length > 0 &&
      replay.noteSpacingMs.every((x) => Math.abs(x - 500) <= 5) &&
      firstGroup.noteSpacingMs.every((x) => Math.abs(x - 1000) <= 5) &&
      rampDelay !== null &&
      rampDelay <= 1000 &&
      synthAll.length === groupsBefore + 1 &&
      stateBeforeRepeat.band === 'red' &&
      wRep2.every((e) => e.state === 'red' && e.boxes.startsWith('done/done/')) &&
      notes[2]?.card === notes[2]?.box &&
      !hasErrors(errors);
    record(
      'P2-31',
      ok31 ? 'pass' : 'fail',
      `Settings during listening (note 3 red): note duration ${vt1.duration}, volume ${vt1.volume}. Repeat: playback #${groupsBefore + 1} started at volume ${r2(replay?.initialVolume)} ` +
        `with note spacing ${uniq(replay?.noteSpacingMs ?? []).join('/')} ms (first playback ${uniq(firstGroup.noteSpacingMs).join('/')} ms). Volume → 30 % during that replay: ` +
        `master gain ramp to 0.3 recorded ${rampDelay === null ? 'NEVER' : ms(rampDelay)} after the slider change (includes the Playwright fill round-trip), no restart ` +
        `(${synthAll.length} playbacks in total). During the replay: band ${uniq(wRep2.map((e) => e.state)).join('/')}, boxes ${uniq(wRep2.map((e) => e.boxes)).join(' | ')} ` +
        `(progress and red kept). Graph kept working: glide drawn and note 3 card "${notes[2]?.card}".` +
        (hasErrors(errors) ? ` ${errorSummary(errors)}` : ''),
    );
  });
}

// ---------------------------------------------------------------------------------------------------------------
// P2 32: production preview
// ---------------------------------------------------------------------------------------------------------------
const PREVIEW_CSS = { text: null, url: null };

async function p2Step32(browser) {
  await scenario(browser, ['P2-32'], PREVIEW, async ({ page, errors }) => {
    const tokens = readTokens().light;
    await page.getByRole('button', { name: 'Start training' }).click();
    await page.evaluate(() => window.__waitFor(() => window.__status() === 'Listen…', 5000, 'Listen…'));
    const total = await page.evaluate(() => window.__boxCount());
    await page.evaluate(
      (n) => window.__waitFor(() => window.__status() === `Your turn: play note 1 of ${n}` && window.__btn('Repeat melody')?.disabled === false, 30000, 'listening'),
      total,
    );
    const g0 = await page.evaluate(() => {
      const g = document.querySelector('[data-testid="pitch-graph"]');
      return { ariaHidden: g?.getAttribute('aria-hidden'), state: g?.getAttribute('data-band-state') };
    });
    const idleColors = await readColors(page);
    await shot(page, 'P2-32', 'preview-listening-graph');
    const synth = await page.evaluate(() => window.__synthInfo());
    const freqs = synth[synth.length - 1].freqs;
    await page.evaluate(() => window.__rec.start(false));
    await page.evaluate(async (hz) => {
      window.__tone.set(hz);
    }, freqs[0]);
    await page.waitForFunction(() => (window.__graph(false)?.fill ?? 0) > 100, null, { polling: 'raf', timeout: 5000 });
    const fillColors = await readColors(page);
    await waitCardVisible(page);
    const cardColors = await readColors(page);
    await shot(page, 'P2-32', 'preview-card');
    const notes = [];
    notes.push(
      await page.evaluate(async () => {
        window.__tone.set(null);
        const r = { card: window.__card(), box: window.__boxText(0) };
        await window.__waitFor(() => window.__card() === null, 3000, 'card gone');
        return r;
      }),
    );
    for (let i = 1; i < total; i += 1) {
      await page.evaluate(
        ({ i, n }) =>
          window.__waitFor(
            () => window.__status() === `Your turn: play note ${i + 1} of ${n}` && window.__btn('Repeat melody')?.disabled === false && window.__card() === null,
            10000,
            'listening',
          ),
        { i, n: total },
      );
      notes.push(await playRightNote(page, freqs[i], i));
    }
    await page.evaluate(() => window.__waitFor(() => window.__onHome(), 6000, 'Home'));
    const log = await recStop(page);
    const css = await page.evaluate(async () => {
      const link = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href).find((h) => h.includes('/trumpet-trainer/assets/'));
      const text = link ? await (await fetch(link)).text() : '';
      return { url: link, text };
    });
    PREVIEW_CSS.text = css.text;
    PREVIEW_CSS.url = css.url;
    const eps = cardEpisodes(log);
    const cardsVsBoxes = eps.map((ep, i) => ({ card: ep.snap.card, box: ep.snap.names.split(' ')[i], boxState: ep.snap.boxes.split('/')[i] }));
    const checks = [
      ['graph bg', idleColors.graphBg, tokens['--color-graph-bg']],
      ['band', idleColors.band, tokens['--color-graph-band']],
      ['fill', fillColors.fill, tokens['--color-graph-fill']],
      ['trail', fillColors.trail, tokens['--color-graph-trail']],
      ['green band', cardColors.band, tokens['--color-graph-green']],
      ['card', cardColors.card, tokens['--color-reveal-card']],
      ['card text', cardColors.cardText, tokens['--color-reveal-text']],
      ['dim layer', cardColors.backdrop, tokens['--color-reveal-backdrop']],
    ].map(([name, actual, expected]) => ({ name, actual, expected, match: sameColor(actual, expected) }));
    writeOutput('P2-32', 'preview', { total, freqs, g0, notes, cardsVsBoxes, checks, cssUrl: css.url, log });
    const ok =
      g0.ariaHidden === 'true' &&
      g0.state === 'idle' &&
      checks.every((c) => c.match) &&
      eps.length === total &&
      cardsVsBoxes.every((c) => c.card === c.box) &&
      !hasErrors(errors);
    record(
      'P2-32',
      ok ? 'pass' : 'fail',
      `Preview ${PREVIEW} (light scheme), ${total}-note random melody: graph aria-hidden=${g0.ariaHidden}, band ${g0.state} at listening; ${eps.length} cards ` +
        `(${cardsVsBoxes.map((c) => `"${c.card}"`).join(', ')}; boxes ${cardsVsBoxes.map((c) => `"${c.box}"`).join(', ')}) matching the boxes in the same commit: ${cardsVsBoxes.every((c) => c.card === c.box)}. Colours: ${checks.map((c) => `${c.name} ${c.actual}${c.match ? '' : ` ≠ ${c.expected}`}`).join('; ')}. ` +
        `${hasErrors(errors) ? errorSummary(errors) : 'No errors.'}`,
    );
  });
}

// ---------------------------------------------------------------------------------------------------------------
// P2 33–34: manual (phone, screen reader); automated partial evidence, reported as SKIP
// ---------------------------------------------------------------------------------------------------------------
async function p2Step33(browser) {
  const parts = [];
  const src = readTokens().css;
  const srcHasWebkit = /-webkit-backdrop-filter:\s*blur\(4px\)/.test(src);
  parts.push(`src/styles.css has -webkit-backdrop-filter: blur(4px) next to backdrop-filter: ${srcHasWebkit}.`);
  if (PREVIEW_CSS.text) {
    parts.push(
      `Production CSS ${PREVIEW_CSS.url?.split('/').pop()} contains -webkit-backdrop-filter: ${PREVIEW_CSS.text.includes('-webkit-backdrop-filter')}, backdrop-filter: ` +
        `${/[^-]backdrop-filter/.test(PREVIEW_CSS.text)}.`,
    );
  }
  let app = null;
  try {
    const { defaultBrowserType, ...phone } = devices['Pixel 7'];
    void defaultBrowserType;
    app = await openApp(browser, E2EM('71,60,60,60,60'), { ...phone, permissions: ['microphone'] });
    const { page, errors } = app;
    await startAndWaitListening(page, 5);
    await page.evaluate(() => window.__tone.set(440));
    await waitCardVisible(page);
    const hit = await page.evaluate(() => {
      const b = window.__btn('Give up');
      const r = b.getBoundingClientRect();
      const card = document.querySelector('[data-testid="note-reveal"]').getBoundingClientRect();
      return {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        hitIsButton: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === b,
        cardInside: card.left >= 0 && card.right <= window.innerWidth && card.top >= 0 && card.bottom <= window.innerHeight,
        viewport: [window.innerWidth, window.innerHeight],
      };
    });
    await shot(page, 'P2-33', 'pixel7-emulated-card');
    await page.touchscreen.tap(hit.x, hit.y);
    const homeOk = await page
      .evaluate(() => window.__waitFor(() => window.__onHome(), 1500, 'Home').then(() => true))
      .catch(() => false);
    await page.evaluate(() => window.__tone.set(null));
    parts.push(
      `Chromium phone emulation (Pixel 7, ${hit.viewport.join(' × ')}, touch): card inside the viewport ${hit.cardInside}, Give up hit-test ${hit.hitIsButton}, ` +
        `touchscreen tap during the card → Home ${homeOk}.${hasErrors(errors) ? ` ${errorSummary(errors)}` : ''}`,
    );
    writeOutput('P2-33', 'phone-partial', { srcHasWebkit, previewCss: PREVIEW_CSS.url, hit, homeOk });
  } catch (e) {
    parts.push(`Phone emulation failed: ${String(e.message).split('\n')[0]}`);
  } finally {
    if (app) await app.context.close().catch(() => undefined);
  }
  record(
    'P2-33',
    'skip',
    `Manual: needs a real phone (iOS Safari + Android Chrome over HTTPS). Partial automated evidence: ${parts.join(' ')}`,
  );
}

async function p2Step34(browser) {
  let detail = '';
  let app = null;
  try {
    app = await openApp(browser, E2EM('71,72,72'));
    const { page } = app;
    await startAndWaitListening(page, 3);
    await recStart(page);
    await page.evaluate(() => window.__tone.set(440));
    await waitCardVisible(page);
    const atCard = await page.evaluate(() => ({
      region: window.__region(),
      regionRole: document.querySelector('[data-testid="note-reveal-region"]').getAttribute('role'),
      status: window.__status(),
      statusLive: document.querySelector('[data-testid="training-status"]').getAttribute('aria-live'),
      graphHidden: document.querySelector('[data-testid="pitch-graph"]').getAttribute('aria-hidden'),
      backdropHidden: document.querySelector('.note-reveal__backdrop')?.getAttribute('aria-hidden'),
    }));
    await page.evaluate(() => window.__waitFor(() => window.__graph(false).state === 'red', 6000, 'red'));
    await page.evaluate(() => window.__sleep(500));
    const aria = await page.locator('body').ariaSnapshot();
    const log = await page.evaluate(() => {
      window.__tone.set(null);
      return window.__rec.stop();
    });
    const regionChanges = S(log)
      .map((e) => e.region)
      .filter((x, i, a) => i === 0 || x !== a[i - 1]);
    const statusChanges = S(log)
      .map((e) => e.status)
      .filter((x, i, a) => i === 0 || x !== a[i - 1]);
    const ariaMentionsGraph = /^\s*- (img|graphics|figure|svg)\b/m.test(aria) || /\b(pitch|graph|svg|polyline)\b/i.test(aria);
    writeOutput('P2-34', 'a11y-partial', { atCard, regionChanges, statusChanges, ariaSnapshotDuringRed: aria });
    detail =
      `At the card: role="${atCard.regionRole}" region text "${atCard.region}", status (aria-live="${atCard.statusLive}") already "${atCard.status}"; ` +
      `graph aria-hidden=${atCard.graphHidden}, dim layer aria-hidden=${atCard.backdropHidden}. Region text sequence ${regionChanges.map((x) => JSON.stringify(x)).join(' → ')} ` +
      `(set once per card); status sequence ${statusChanges.map((x) => JSON.stringify(x)).join(' → ')} (the wrong note added no text). ` +
      `Accessibility tree during red mentions the graph: ${ariaMentionsGraph} (see the ariaSnapshot in the output file).`;
  } catch (e) {
    detail = `Partial automation failed: ${String(e.message).split('\n')[0]}`;
  } finally {
    if (app) await app.context.close().catch(() => undefined);
  }
  record('P2-34', 'skip', `Manual: needs a real screen reader (VoiceOver / TalkBack / NVDA). Partial automated evidence: ${detail}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------------------------
function readPreviousStatuses() {
  if (!existsSync(PREV_REPORT)) return null;
  const map = {};
  for (const line of readFileSync(PREV_REPORT, 'utf8').split('\n')) {
    const m = line.match(/^(✅|❌|⏭️) \*\*(\d+)\. /);
    if (m) map[`P1-${m[2]}`] = m[1] === '✅' ? 'pass' : m[1] === '❌' ? 'fail' : 'skip';
  }
  return map;
}

function writeReport(startedAt, chromiumVersion) {
  const all = Object.keys(NAMES);
  const statusOf = (id) => results[id]?.status ?? 'fail';
  const passed = all.filter((id) => statusOf(id) === 'pass').length;
  const skipped = all.filter((id) => statusOf(id) === 'skip').length;
  const failed = all.length - passed - skipped;
  const icon = { pass: '✅', fail: '❌', skip: '⏭️' };
  const word = { pass: 'PASS', fail: 'FAIL', skip: 'SKIP' };
  const fmtTime = (d) => d.toISOString().replace('T', ' ').slice(0, 19);
  const lines = [
    '# Validation Report — Run 2 (Part 2: prd2.md + re-run of Part 1)',
    '',
    `**Run:** ${fmtTime(startedAt)} UTC (finished ${fmtTime(new Date())} UTC)`,
    '**Checklist:** specs/pitch-feedback-graph/validation.md (Human Validation — prd.md, steps 1–26; Human Validation — prd2.md, steps 1–34)',
    `**Browser:** Chromium ${chromiumVersion} (Playwright, headless)`,
    ONLY.length ? `**Partial run:** ONLY=${ONLY.join(',')}` : null,
    '',
    `**Summary:** ${passed} passed, ${failed} failed, ${skipped} skipped (of ${all.length})`,
    '',
    '## Method',
    '',
    '- Part 1 steps 1–14 run the exact Action expressions of the checklist in the page of the dev server (http://localhost:5173/,',
    '  which serves `/src/...` as ES modules) and compare the result with the Expected value (canonical JSON).',
    '- Every app step drives the real app in Chromium. The microphone is **synthetic**: an init script replaces',
    '  `navigator.mediaDevices.getUserMedia` for audio requests with a `MediaStream` from a separate AudioContext',
    '  (sine OscillatorNode → GainNode 0.5 / 0 for silence → MediaStreamAudioDestinationNode, plus an LFO on `detune` for',
    '  vibrato and exponential frequency ramps for slides). The app\'s own AudioContext, analyser, level gate, detector,',
    '  smoother, hold tracker, reducer, graph store and components are unchanged and process that stream as a real mic.',
    '- Part 2 observes the DOM: a MutationObserver records a snapshot at every commit (`data-band-state`, fill width, dot',
    '  `cx`/`cy`, trail polyline points, card text, overlay `role="status"` region text, status, boxes, button states) with',
    '  `performance.now()` timestamps; tone changes are timestamped markers in the same log. Viewbox units: 320 × 200, the',
    '  dot sits at x 256 (80 %), cy = 100 − 2 × cents (±50 c = top / bottom edge), band = y 50..150 (±25 c).',
    '- Colours are read with `getComputedStyle` and compared with the `--color-graph-*` / `--color-reveal-*` tokens parsed',
    '  from `src/styles.css` (light `:root`, dark `@media (prefers-color-scheme: dark)`); themes, reduced motion and the',
    '  320 px viewport are emulated with Playwright context options. Clicks through the overlay use real mouse events at',
    '  the button\'s coordinates (no `force`). The synth is instrumented (master gain, oscillator frequencies and start',
    '  times) to read random melodies, the note duration and live volume ramps.',
    '- **Manual (SKIP):** P2-33 (real iOS Safari / Android Chrome phone) and P2-34 (real screen reader); their details list',
    '  the partial automated evidence. **Out of scope for every item:** a real trumpet (attacks, tone colour, intonation',
    '  drift), a speaker + room microphone with room noise and the threshold slider, and other browsers. A pure sine is an',
    '  easy signal for the detector; real-instrument behaviour remains a human check.',
    '',
  ].filter((l) => l !== null);
  const item = (id) => {
    const r = results[id] ?? { status: 'fail', detail: 'Not run.', shots: [], outputs: [] };
    const st = r.status ?? 'fail';
    lines.push(`${icon[st]} **${stepNo(id)}. ${NAMES[id]}**`, '');
    for (const para of (r.detail || 'Not run.').split('\n')) lines.push(para, '');
    if (r.outputs.length) lines.push(`Output: ${r.outputs.map((f) => `[${f}](run-2/output/${f})`).join(', ')}`, '');
    for (const f of r.shots) lines.push('', `![${f.replace(/\.png$/, '')}](run-2/screenshots/${f})`, '');
  };
  lines.push('## Re-run of original checks (prd.md)', '');
  lines.push(
    'Step 20\'s checklist wording "No visual red mark yet (that is Part 2)" is obsolete since Part 2; it is judged only on "nothing advances".',
    '',
  );
  for (const [section, steps] of P1_SECTIONS) {
    lines.push(`### ${section}`, '');
    for (const n of steps) item(`P1-${n}`);
  }
  lines.push('## New checks (prd2.md)', '');
  for (const [section, steps] of P2_SECTIONS) {
    lines.push(`### ${section}`, '');
    for (const n of steps) item(`P2-${n}`);
  }
  lines.push('## Comparison with previous run', '');
  const prev = readPreviousStatuses();
  if (!prev) {
    lines.push('No previous report (validation-report-run-1.md) found.', '');
  } else {
    lines.push(
      'Run 1 ([validation-report-run-1.md](validation-report-run-1.md)) covered only Part 1 (prd.md); every prd2.md step is new in this run.',
      '',
    );
    const changes = Object.keys(P1_NAMES)
      .map((n) => `P1-${n}`)
      .filter((id) => prev[id] && prev[id] !== statusOf(id));
    if (!changes.length) {
      lines.push(`No status changes: all ${Object.keys(P1_NAMES).length} re-run prd.md steps have the same status as in Run 1.`, '');
    } else {
      lines.push('| Step | Run 1 | Run 2 | Note |', '|---|---|---|---|');
      for (const id of changes) {
        const regression = prev[id] === 'pass' && statusOf(id) === 'fail';
        const note = regression ? '**REGRESSION**' : statusOf(id) === 'skip' ? 'not run this time' : prev[id] === 'fail' ? 'fixed' : '';
        lines.push(`| ${id} ${NAMES[id]} | ${word[prev[id]]} | ${word[statusOf(id)]} | ${note} |`);
      }
      lines.push('');
    }
    const newCounts = ['pass', 'fail', 'skip'].map(
      (s) => `${Object.keys(P2_NAMES).filter((n) => statusOf(`P2-${n}`) === s).length} ${word[s]}`,
    );
    lines.push(`New prd2.md steps: ${newCounts.join(', ')}.`, '');
  }
  writeFileSync(REPORT, `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`);
  return { passed, failed, skipped, total: all.length };
}

// ---------------------------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------------------------
const ONLY = (process.env.ONLY ?? '')
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean)
  .map((s) => (/^\d+$/.test(s) ? `P1-${s}` : s)); // e.g. ONLY=P1-15,P2-9 (a bare number means Part 1)

async function main() {
  const startedAt = new Date();
  prepareDirs();
  const browser = await chromium.launch({ args: LAUNCH_ARGS });
  const want = (...ns) => !ONLY.length || ns.some((n) => ONLY.includes(ID(n)));
  try {
    // Part 1 re-run
    if (want(...PURE_STEPS.map((s) => s.n))) await runPureSteps(browser);
    if (want(15, 16, 17, 18)) await steps15to18(browser);
    if (want(19)) await step19(browser);
    if (want(20, 21)) await steps20and21(browser);
    if (want(22)) await step22(browser);
    if (want(23)) await step23(browser);
    if (want(24)) await step24(browser);
    if (want(25)) await step25(browser);
    if (want(26)) await step26(browser);
    // Part 2
    if (want('P2-1', 'P2-2', 'P2-3')) await p2Steps1to3(browser);
    if (want('P2-4', 'P2-5', 'P2-6')) await p2Steps4to6(browser);
    if (want('P2-7', 'P2-8', 'P2-9', 'P2-10', 'P2-11', 'P2-12', 'P2-13')) await p2Steps7to13(browser);
    if (want('P2-14')) await p2Step14(browser);
    if (want('P2-15')) await p2Step15(browser);
    if (want('P2-16', 'P2-17', 'P2-18', 'P2-19', 'P2-20')) await p2Steps16to20(browser);
    if (want('P2-21')) await p2Step21(browser);
    if (want('P2-22', 'P2-23')) await p2Theme(browser, 'P2-22', 'dark');
    if (want('P2-22', 'P2-23')) await p2Theme(browser, 'P2-23', 'light');
    if (want('P2-24')) await p2Step24(browser);
    if (want('P2-25')) await p2Step25(browser);
    if (want('P2-26')) await p2Step26(browser);
    if (want('P2-27')) await p2Step27(browser);
    if (want('P2-28', 'P2-29', 'P2-30', 'P2-31')) await p2Steps28to31(browser);
    if (want('P2-32', 'P2-33')) await p2Step32(browser);
    if (want('P2-33')) await p2Step33(browser);
    if (want('P2-34')) await p2Step34(browser);
  } finally {
    const version = browser.version();
    await browser.close();
    for (const id of Object.keys(NAMES)) {
      if (!results[id]?.status) {
        if (ONLY.length && !ONLY.includes(id)) record(id, 'skip', `Not selected (ONLY=${ONLY.join(',')}).`);
        else if (!results[id]?.status) record(id, 'fail', 'Not run (no result recorded).');
      }
    }
    const s = writeReport(startedAt, version);
    console.log(`\n**Summary:** ${s.passed} passed, ${s.failed} failed, ${s.skipped} skipped (of ${s.total})`);
    console.log(`Report: ${REPORT}`);
    process.exitCode = s.failed === 0 ? 0 : 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
