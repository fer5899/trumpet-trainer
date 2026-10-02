# Trumpet Trainer MVP - Product Requirements Document (Part 1 of 2)

> **Source of truth for product behavior:** `specs/create-mvp/IDEA.md` (referred to as "the IDEA", sections as §N).
> **This PRD is split in two files:**
> - `prd.md` (this file): overview, goals, implementation decisions, project scaffold, file layout, constants, music domain, audio domain and adapter contracts.
> - `prd2.md`: training session (state machine + hook), UI components, UI mockups, acceptance criteria for flow/UI, testing decisions, CI/CD, risks, out of scope, future considerations, manual validation checklist.
>
> **Greenfield note:** the repository currently contains only `specs/create-mvp/IDEA.md`. Every file path in this PRD is a **proposed new path** to be created by the implementer; none of them exist yet.

## Overview

A frontend-only web app that plays a 5-note random melody (B♭ trumpet range) and listens through the microphone while the user plays it back on the trumpet, turning each note green as soon as it is played correctly and sustained for 0.5 s. It validates the core loop **listen → play back → immediate feedback** with no accounts, no persistence and a single setting (microphone volume threshold).

## Problem Statement

Beginner and intermediate trumpet players lack a frictionless way to practice playing by ear with instant, objective feedback on pitch. Existing ear trainers rely on clicking answers, not on playing the instrument. Without a minimal working loop we cannot validate whether real-time trumpet pitch feedback in the browser (with speakers, in a normal room) is usable at all.

## Goals

- A user can go from opening the page to hearing a melody in **≤ 2 clicks** (Start training + mic permission prompt).
- A correctly played, sustained note (±25 cents, ≥ 500 ms, above threshold) is marked green within **≤ 600 ms** of the user starting to hold it.
- Melody playback through speakers is **never** registered as a played note (mic not analysed during playback + 250 ms guard).
- The full loop (5 notes) is covered end-to-end by an automated Playwright test using a fake microphone, and all pure logic is covered by Vitest unit tests.
- The app is deployed automatically to GitHub Pages (HTTPS) on every push to the deploy branch.

## Target Users

- Beginner/intermediate B♭ trumpet players — need a quick exercise: hear a short melody, play it back, see which notes were right, with names shown in written (B♭) Latin solfège.
- (Indirectly) the product owner — needs a minimal, deployable app to validate the loop on real devices (desktop Chrome/Firefox, iOS Safari, Android Chrome).

## Feature Map

| # | Feature area | Defined in |
|---|---|---|
| 1 | Project scaffold, tooling, file layout, constants | prd.md |
| 2 | Music domain: notes, transposition, spelling, melody generation | prd.md |
| 3 | Audio domain: pitch detection, level, sustain tracker, synth, microphone, shared AudioContext, `AudioServices` contract | prd.md |
| 4 | Training session: reducer state machine + `useTrainingSession` hook | prd2.md |
| 5 | UI: App, HomeScreen, MicLevelMeter, TrainingScreen, NoteBox, mockups | prd2.md |
| 6 | E2E test hook, testing strategy, CI/CD + GitHub Pages | prd2.md |

## Implementation Decisions

- **Pure core, thin adapters.** All logic that decides anything (transposition, spelling, melody generation, level computation, pitch acceptance, sustain timing, session state transitions) lives in pure, deterministic functions with injected time and randomness. Browser APIs (Web Audio output, `getUserMedia`, animation frames) are wrapped in thin adapters that contain no decisions. This maximises what can be unit-tested with TDD and keeps the untestable surface small enough to be covered by e2e and manual checks.
- **Dependency injection of audio services.** Components never touch Web Audio or the microphone directly; they obtain a single "audio services" object through React context. Tests inject fakes that let them push synthetic microphone frames and control when playback ends; the e2e build uses the real services with Chromium's fake microphone.
- **State machine as a reducer.** The training session has a handful of phases (playing, guard, listening, complete) with strict rules about which events are honoured in which phase. Expressing it as a pure reducer makes illegal transitions (e.g. a match during playback) impossible by construction and testable without React. A hook binds the reducer to timers, playback and microphone.
- **Clock-injected sustain tracker.** The "held for 0.5 s within ±25 cents" rule is evaluated on timestamps carried by each frame instead of wall-clock timers, so it is exact and deterministic in tests regardless of frame rate.
- **Library pitch detection behind our own interface.** The McLeod Pitch Method via the `pitchy` library is accurate for monophonic brass tones; we wrap it so that the rest of the app only sees "frequency + clarity or nothing", and the range (≈150–500 Hz) and clarity filtering are our own rules. Swapping the algorithm later touches one module.
- **Concert pitch internally, written pitch for display.** The melody is stored as written MIDI numbers (what the trumpeter reads); conversion to concert pitch happens only at the audio boundaries (synth playback and detection target). This keeps names and range rules expressed exactly as in the IDEA.
- **Do not listen during playback.** Speakers are the standard setup, so instead of echo cancellation (disabled to keep the raw trumpet signal) the app simply ignores the microphone while the melody plays and for a short guard afterwards to let room reverb decay. The microphone session stays open across "Repeat melody" to avoid re-prompting.
- **Request the microphone before playing.** Asking for permission first means a denied permission is reported on the home screen before the user invests time listening, and the training screen is only ever shown when it can actually work.
- **One shared AudioContext, created/resumed in a click handler.** Required by autoplay policies, notably iOS Safari; a single context is shared by the synth and microphone to avoid resource limits and sample-rate mismatches.
- **Brass-ish synthesized timbre.** A sawtooth through a low-pass filter with a short per-note envelope is close enough to a trumpet for ear training, needs no assets, and the per-note envelope makes repeated notes audible as separate notes without introducing gaps.
- **Threshold in memory, dBFS scale.** RMS in dBFS is a standard, device-independent-enough scale; the −60…0 range covers room noise to loud playing. No persistence, per the IDEA.
- **Deterministic e2e via a build-time-gated test hook.** The e2e build accepts a fixed melody from the URL so that a looping fake-microphone tone can complete the whole exercise; production builds compile the hook out.
- **Static hosting on GitHub Pages.** No backend is needed; Pages provides HTTPS, which `getUserMedia` requires.

## Technical Requirements — Scaffold

### Stack

- Vite 5+, React 18+ (function components + hooks), TypeScript 5+ with `"strict": true`, npm.
- Runtime dependencies: `react`, `react-dom`, `pitchy` (v4, ESM).
- Dev dependencies: `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `@playwright/test`, `eslint` (flat config), `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `@types/react`, `@types/react-dom`, `@types/node`. Prettier is optional (default config) and not enforced in CI.
- No UI framework, no router, no state library. Plain CSS in one stylesheet.

### Proposed file tree (all new)

```
package.json
tsconfig.json                 # strict; includes src, e2e, scripts?, vite.config.ts, playwright.config.ts
vite.config.ts                # React plugin, base, Vitest config
playwright.config.ts
eslint.config.js
index.html                    # <div id="root">, title "Trumpet Trainer"
.env.e2e                      # VITE_E2E=true
.gitignore                    # node_modules, dist, test-results, playwright-report, e2e/fixtures/*.wav
.github/workflows/ci.yml
scripts/generate-test-tones.mjs
e2e/training.spec.ts
e2e/mic-meter.spec.ts
src/main.tsx                  # createRoot, <AudioServicesProvider services={createBrowserAudioServices()}>
src/styles.css
src/config/constants.ts
src/music/notes.ts            (+ notes.test.ts)
src/music/spelling.ts         (+ spelling.test.ts)
src/music/melody.ts           (+ melody.test.ts)
src/audio/pitchDetector.ts    (+ pitchDetector.test.ts)
src/audio/level.ts            (+ level.test.ts)
src/audio/audioContext.ts     # shared AudioContext (thin adapter)
src/audio/synth.ts            # thin adapter
src/audio/microphone.ts       # thin adapter + MicrophoneError
src/audio/services.ts         # AudioServices interface + createBrowserAudioServices()
src/audio/AudioServicesContext.tsx  # AudioServicesProvider + useAudioServices()
src/training/sustainTracker.ts      (+ sustainTracker.test.ts)
src/training/trainingReducer.ts     (+ trainingReducer.test.ts)
src/training/useTrainingSession.ts
src/testing/testMelody.ts           (+ testMelody.test.ts)  # e2e melody hook (prd2.md)
src/components/App.tsx              (+ App.test.tsx)
src/components/HomeScreen.tsx       (+ HomeScreen.test.tsx)
src/components/MicLevelMeter.tsx    (+ MicLevelMeter.test.tsx)
src/components/TrainingScreen.tsx   (+ TrainingScreen.test.tsx)
src/components/NoteBox.tsx          (+ NoteBox.test.tsx)
src/components/micErrorMessage.ts   (+ micErrorMessage.test.ts)
src/test/setup.ts                   # imports '@testing-library/jest-dom/vitest'
src/test/fakeAudioServices.ts       # fakes for RTL tests (prd2.md)
```

### package.json scripts

| Script | Command |
|---|---|
| `dev` | `vite` |
| `dev:e2e` | `vite --mode e2e --port 5173 --strictPort` |
| `build` | `vite build` |
| `preview` | `vite preview` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `generate:tones` | `node scripts/generate-test-tones.mjs` |
| `test:e2e` | `npm run generate:tones && playwright test` |
| `lint` | `eslint .` |
| `typecheck` | `tsc --noEmit` |

### vite.config.ts

- `defineConfig(({ command }) => ({ base: command === 'build' ? '/trumpet-trainer/' : '/', plugins: [react()], test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], include: ['src/**/*.test.{ts,tsx}'], restoreMocks: true } }))`. The `base` assumes the GitHub repo is named `trumpet-trainer` (Pages URL `https://<user>.github.io/trumpet-trainer/`); change it if the repo name differs.
- Vitest must not pick up `e2e/**` (Playwright owns it).

### Constants — `src/config/constants.ts`

All tunables are exported named constants; no magic numbers elsewhere.

| Constant | Value | Meaning |
|---|---|---|
| `WRITTEN_MIN_MIDI` | `54` | Fa#3 written (lowest note) |
| `WRITTEN_MAX_MIDI` | `72` | Do5 written (highest note) |
| `TRANSPOSITION_SEMITONES` | `-2` | concert = written + this |
| `A4_MIDI` / `A4_HZ` | `69` / `440` | tuning reference |
| `MELODY_LENGTH` | `5` | notes per exercise |
| `NOTE_DURATION_MS` | `500` | duration of each played note |
| `LISTEN_GUARD_MS` | `250` | silence guard after playback before listening |
| `COMPLETE_PAUSE_MS` | `1500` | all-green pause before returning home |
| `TOLERANCE_CENTS` | `25` | inclusive: abs(cents) ≤ 25 |
| `SUSTAIN_MS` | `500` | required continuous in-tolerance time |
| `MIN_DETECT_HZ` / `MAX_DETECT_HZ` | `150` / `500` | accepted detection range (inclusive) |
| `MIN_CLARITY` | `0.9` | minimum pitchy clarity |
| `LEVEL_FLOOR_DB` | `-100` | level for silence / empty buffer |
| `METER_MIN_DB` / `METER_MAX_DB` | `-60` / `0` | meter + slider range |
| `DEFAULT_THRESHOLD_DB` | `-40` | initial threshold |
| `THRESHOLD_STEP_DB` | `1` | slider step |
| `MIC_FFT_SIZE` | `2048` | AnalyserNode fftSize (frame length) |
| `SYNTH_PEAK_GAIN` | `0.25` | per-note envelope peak |
| `SYNTH_ATTACK_MS` / `SYNTH_RELEASE_MS` | `15` / `30` | per-note envelope ramps |
| `SYNTH_LOWPASS_HZ` / `SYNTH_LOWPASS_Q` | `2000` / `0.7` | low-pass filter |
| `SYNTH_START_DELAY_MS` | `50` | scheduling lead time |

## Core Features — Part 1

### 2. Music domain (pure, `src/music/*`)

#### Types (exported from `src/music/notes.ts`)

```ts
export type WrittenMidi = number;   // B♭-trumpet written pitch, 54..72
export type ConcertMidi = number;   // sounding pitch = written - 2
export type Melody = readonly WrittenMidi[];
export type Accidental = 'sharp' | 'flat';
```

#### `notes.ts`

- `WRITTEN_RANGE: readonly WrittenMidi[]` — `[54, 55, …, 72]`, exactly 19 entries.
- `isInWrittenRange(m: number): boolean` — integer and 54 ≤ m ≤ 72.
- `writtenToConcert(w: WrittenMidi): ConcertMidi` — `w + TRANSPOSITION_SEMITONES` (54→52, 72→70).
- `midiToHz(m: number): number` — `A4_HZ * 2 ** ((m - A4_MIDI) / 12)`. Examples: 69→440, 52→164.81, 70→466.16.
- `centsFrom(hz: number, targetMidi: number): number` — `1200 * Math.log2(hz / midiToHz(targetMidi))`. Signed; e.g. `centsFrom(220, 69) = -1200` (octave matters).
- `noteName(m: WrittenMidi, accidental: Accidental): string` — pitch class `m % 12` from the table below, octave `Math.floor(m / 12) - 1`. Naturals ignore `accidental`.

| pc | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sharp | Do | Do# | Re | Re# | Mi | Fa | Fa# | Sol | Sol# | La | La# | Si |
| flat | Do | Re♭ | Re | Mi♭ | Mi | Fa | Sol♭ | Sol | La♭ | La | Si♭ | Si |

Characters: `#` is U+0023, `♭` is U+266D. Examples: `noteName(60,'sharp')="Do4"`, `noteName(54,'flat')="Sol♭3"`, `noteName(72,'flat')="Do5"`, `noteName(58,'sharp')="La#3"`.

#### `spelling.ts` — contextual spelling (IDEA §5.3)

`spellMelody(melody: Melody): string[]` returns one display name per note (same length; `[]` for `[]`). Algorithm:

1. For note `i > 0`: if `m[i] > m[i-1]` → `sharp`; if `m[i] < m[i-1]` → `flat`; if equal → reuse the accidental chosen for `i-1`.
2. For note `0`: find the first index `j > 0` with `m[j] !== m[0]`. If `m[j] > m[0]` → `sharp`, else `flat`. If none exists (all notes equal, or single-note melody) → `sharp`. (Clarification of "direction towards the second note": when the second note repeats the first, the repeat rule forces both to share a spelling, so the direction is taken from the first note that differs.)
3. Name = `noteName(m[i], accidental)`; naturals never show an accidental.

Worked examples (must be used as table-driven test cases):

| Written MIDI | Names | Why |
|---|---|---|
| `[54, 61, 61, 58, 72]` | `Fa#3, Do#4, Do#4, Si♭3, Do5` | first goes up; 61 up; repeat keeps; 58 down; 72 natural |
| `[56, 56, 56, 56, 56]` | `Sol#3 ×5` | all same → sharp |
| `[70, 63, 63, 66, 60]` | `Si♭4, Mi♭4, Mi♭4, Fa#4, Do4` | first goes down; down; repeat; up; natural |
| `[61, 61, 58, 58, 58]` | `Re♭4, Re♭4, Si♭3, Si♭3, Si♭3` | first differing note is lower → flat |
| `[60, 61, 60, 59, 58]` | `Do4, Do#4, Do4, Si3, Si♭3` | naturals plain; up → sharp; down → flat |
| `[72, 72, 54, 55, 54]` | `Do5, Do5, Sol♭3, Sol3, Sol♭3` | 54 reached downward both times → flat |
| `[66]` | `Fa#4` | single note → sharp |

#### `melody.ts`

- `export type Rng = () => number;` (returns a value in `[0, 1)`).
- `generateMelody(rng: Rng = Math.random, length: number = MELODY_LENGTH): WrittenMidi[]` — each note independently `WRITTEN_MIN_MIDI + Math.min(18, Math.floor(rng() * 19))`. Repeats allowed. Exactly `length` calls to `rng`.
- Test examples with a stub rng: `0 → 54`, `0.5 → 63`, `0.9999 → 72`, `0.05 → 54`, `0.06 → 55`.

### 3. Audio domain (`src/audio/*`, `src/training/sustainTracker.ts`)

#### `level.ts` (pure)

- `computeLevelDb(samples: Float32Array): number` — RMS = `sqrt(mean(s²))`; result `20 * log10(rms)` clamped to `[LEVEL_FLOOR_DB, 0]`; empty buffer or rms 0 → `LEVEL_FLOOR_DB` (never `-Infinity`/`NaN`).
- Examples: constant 1.0 → 0; constant 0.1 → −20; sine amplitude 1 → ≈ −3.01; zeros → −100.

#### `pitchDetector.ts` (pure wrapper over pitchy)

```ts
export interface PitchResult { hz: number; clarity: number }
export function detectPitch(samples: Float32Array, sampleRate: number): PitchResult | null;
```

- Uses `PitchDetector.forFloat32Array(samples.length)` from `pitchy`, cached per buffer length (module-level `Map<number, PitchDetector<Float32Array>>`), then `findPitch(samples, sampleRate)` → `[hz, clarity]`.
- Returns `null` when `hz` is not finite or ≤ 0, `hz < MIN_DETECT_HZ`, `hz > MAX_DETECT_HZ`, or `clarity < MIN_CLARITY`.
- No level gating here (done by the caller with the threshold).

#### `sustainTracker.ts` (pure, clock-injected)

```ts
export interface PitchFrame { timeMs: number; hz: number | null; levelDb: number }
export interface SustainTrackerOptions { thresholdDb: number; toleranceCents?: number; requiredMs?: number }
export interface SustainTracker {
  push(frame: PitchFrame, targetConcertMidi: ConcertMidi): boolean; // true = matched
  reset(): void;
}
export function createSustainTracker(opts: SustainTrackerOptions): SustainTracker;
```

Rules (defaults `toleranceCents = TOLERANCE_CENTS`, `requiredMs = SUSTAIN_MS`):

1. A frame **qualifies** iff `hz !== null` && `levelDb >= thresholdDb` && `Math.abs(centsFrom(hz, target)) <= toleranceCents`.
2. If `target` differs from the target of the previous push, the run is reset first.
3. Non-qualifying frame → run start cleared, return `false`.
4. Qualifying frame → if no run, `runStartMs = frame.timeMs`; return `frame.timeMs - runStartMs >= requiredMs`.
5. Once matched it keeps returning `true` for further qualifying frames until `reset()` (the hook resets immediately after each match).
6. `reset()` clears the run and the remembered target.

Reference cases (frames every 20 ms, target concert 69 = 440 Hz, threshold −40): 440 Hz at −20 dB from t=0 → false up to t=480, **true at t=500**; one frame at 446.5 Hz (+25.4 c) at t=260 → reset, next run starts t=280, true at t=780; one `hz: null` frame or one frame at −45 dB → same reset; 220 Hz or 880 Hz throughout → never true; 443 Hz (+11.8 c) → true at t=500.

#### `audioContext.ts` (thin adapter)

- `getAudioContext(): AudioContext` — lazily creates a single `AudioContext` (fallback `webkitAudioContext`), returns the same instance afterwards.
- `unlockAudio(): void` — calls `getAudioContext()` and, if `state === 'suspended'`, `void ctx.resume()`. **Must be invoked synchronously inside the click handler** of "Start training" and "Test microphone", before any `await`.

#### `synth.ts` (thin adapter)

```ts
export interface Playback { readonly done: Promise<void>; stop(): void }
export function playSequence(ctx: AudioContext, frequenciesHz: readonly number[], noteDurationMs: number): Playback;
```

- Graph: per note `OscillatorNode('sawtooth', f_i)` → per-note `GainNode` (envelope) → one shared `BiquadFilterNode('lowpass', SYNTH_LOWPASS_HZ, Q SYNTH_LOWPASS_Q)` → master `GainNode` (1) → `ctx.destination`.
- `t0 = ctx.currentTime + SYNTH_START_DELAY_MS/1000`; note i starts at `t_i = t0 + i·d` (d = noteDurationMs/1000), no gaps. Envelope: `0` at `t_i` → linear ramp to `SYNTH_PEAK_GAIN` at `t_i + attack` → hold until `t_i + d − release` → linear ramp to `0` at `t_i + d`. Oscillator `start(t_i)`, `stop(t_i + d)`.
- `done` resolves when the last oscillator fires `ended` (fallback `setTimeout` of total duration + 200 ms, whichever first). Resolves once.
- `stop()`: idempotent; ramps master gain to 0 over 20 ms, stops/disconnects all oscillators, resolves `done`.

#### `microphone.ts` (thin adapter)

```ts
export type MicrophoneErrorKind = 'permission-denied' | 'unsupported' | 'unknown';
export class MicrophoneError extends Error { constructor(readonly kind: MicrophoneErrorKind, options?: { cause?: unknown }) }
export interface MicFrame { timeMs: number; samples: Float32Array }   // samples buffer is reused: do not retain
export interface MicrophoneSession {
  readonly sampleRate: number;
  subscribe(listener: (frame: MicFrame) => void): () => void;      // returns unsubscribe
  release(): void;                                                  // idempotent
}
export function openMicrophone(ctx: AudioContext): Promise<MicrophoneSession>;
```

- No `navigator.mediaDevices?.getUserMedia` → reject `MicrophoneError('unsupported')`.
- `getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })`. `NotAllowedError` / `SecurityError` → `'permission-denied'`; any other failure → `'unknown'`.
- `MediaStreamAudioSourceNode` → `AnalyserNode` (`fftSize = MIC_FFT_SIZE`); the analyser is **not** connected to the destination (no feedback).
- Frame loop via `requestAnimationFrame`: when ≥ 1 listener, `getFloatTimeDomainData(buffer)` and emit `{ timeMs: performance.now(), samples: buffer }`.
- `release()`: cancel animation frame, stop all tracks, disconnect nodes, drop listeners.

#### `services.ts` + `AudioServicesContext.tsx` — the injection seam

```ts
export interface AudioServices {
  unlock(): void;                                                      // sync, call in click handlers
  openMicrophone(): Promise<MicrophoneSession>;                       // rejects with MicrophoneError
  playMelody(frequenciesHz: readonly number[], noteDurationMs: number): Playback;
  detectPitch(samples: Float32Array, sampleRate: number): PitchResult | null;
}
export function createBrowserAudioServices(): AudioServices; // wires unlockAudio, openMicrophone(getAudioContext()), playSequence(getAudioContext(), …), detectPitch
```

- `AudioServicesProvider({ services, children })` and `useAudioServices(): AudioServices` (throws if no provider). `src/main.tsx` provides `createBrowserAudioServices()`; tests provide fakes (see prd2.md).

#### Acceptance Criteria — Part 1

- [ ] `npm run dev`, `build`, `preview`, `test`, `test:e2e`, `lint`, `typecheck` all exist and succeed on a clean checkout after `npm ci`.
- [ ] TypeScript strict mode is on; `npm run typecheck` reports 0 errors; `npm run lint` reports 0 errors.
- [ ] All constants listed above exist in `src/config/constants.ts` with the given values and are the only source of these numbers.
- [ ] `WRITTEN_RANGE` has 19 entries 54..72; `writtenToConcert(54) === 52`, `writtenToConcert(72) === 70`.
- [ ] `midiToHz(69) === 440`; `midiToHz(52)` ≈ 164.81 and `midiToHz(70)` ≈ 466.16 (±0.01).
- [ ] `centsFrom` is signed and returns ±1200 for an octave error.
- [ ] `noteName` uses solfège names, `#`/`♭` characters, octave = `floor(m/12) − 1`.
- [ ] `spellMelody` returns exactly the names in every row of the worked-example table.
- [ ] `generateMelody` returns `MELODY_LENGTH` integers within 54..72, maps rng 0 → 54 and 0.9999 → 72, never exceeds 72.
- [ ] `computeLevelDb` never returns `NaN`/`-Infinity`; zeros → −100.
- [ ] `detectPitch` returns ≈ the true frequency (±5 cents) for synthetic sine and sawtooth at concert E3 (164.81 Hz), A4 (440 Hz) and B♭4 (466.16 Hz), and `null` for silence, white noise, 100 Hz and 800 Hz tones.
- [ ] Sustain tracker satisfies every reference case listed above.
- [ ] Microphone is opened with echo cancellation, noise suppression and AGC disabled and `fftSize ≥ 2048`; permission errors are mapped to the three `MicrophoneErrorKind` values.
- [ ] Only one `AudioContext` instance is ever created per page load.
