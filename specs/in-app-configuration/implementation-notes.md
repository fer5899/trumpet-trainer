# in-app-configuration In-app Configuration

# Implementation notes

---

# prd.md implementation

## Requirements

Implements `specs/in-app-configuration/prd.md` (Part 1 of 2): constants, music domain (scale catalog, spelling in key,
exercise generator), settings model + storage adapter, synth volume / `AudioServices.playMelody` options / fake services.
Part 2 (`prd2.md`: hook, UI, App wiring, e2e) is **not** implemented yet.

| PRD requirement | Status |
|---|---|
| Remove `MELODY_LENGTH`, `NOTE_DURATION_MS`, `SYNTH_PEAK_GAIN`; add all new constants; `MicLevelMeter` uses shared `PERCENT` | Implemented |
| `SCALE_OPTIONS`: 146 unique ids (1 chromatic, 10 groups, 135 scales) in documented order | Implemented |
| Tonic names per type × key signature match the tonic table; `keySignature` = column | Implemented |
| `pitchClasses` = tonic + intervals mod 12 (spot checks incl. Fa♭ lydian, Si# locrian) | Implemented |
| `largestStep` / `minMaxInterval` (1 / 2 / 3 / 3) | Implemented |
| `resolveScaleMembers` (groups, scale, chromatic, throws on unknown); `isScaleOptionId` | Implemented |
| `searchScaleOptions`: every search-table row, case/♭/♯/solfège/English | Implemented |
| `spellInKey` every table row incl. Si#3, Mi#4, Do♭5 and out-of-key fallbacks; `spellExercise` | Implemented |
| `generateExercise`: range/scale/interval/length property over all ids × lengths 3–8 × max intervals | Implemented |
| rng call contract (group +1 call first; scale/chromatic exactly `length`); worked example; 0.999… safe | Implemented |
| `DEFAULT_SETTINGS`, `selectScale`, `resetSettings`, `normalizeSettings` table, `parseThreshold` | Implemented |
| Storage adapter round-trip; null / throwing storage / invalid JSON → defaults, never throws | Implemented |
| `src/test/fakeStorage.ts` (`createFakeStorage`, `createThrowingStorage`) | Implemented |
| `playSequence` master gain = volume, envelope peak 1, `setVolume` ramp 20 ms, no-op after stop/end | Implemented |
| `playMelody(freqs, options)` forwarding; fake `PlayCall.volume` / `volumeChanges` | Implemented |

Nothing flagged or skipped.

## Initial considerations

- Removing `generateMelody`, `MELODY_LENGTH`, `NOTE_DURATION_MS` and changing `playMelody`'s signature breaks Part 2's
  consumers (hook, App, `?melody=` hook). To keep the tree green between PRDs, consumers got a **minimal temporary
  bridge** instead of Part 2's API (see Implementation details → Bridging). Part 2 replaces it.
- The bridge generates chromatic melodies with `maxInterval` 18, which reproduces the MVP distribution and spelling
  exactly, rather than switching to the new default (Do major) before the UI to change it exists.

## Design

```
constants.ts ──► scales.ts (catalog, search, minMaxInterval, keySignatureAlters)
                    │
                    ├─► spelling.ts  spellInKey / spellExercise (spellMelody unchanged)
                    ├─► melody.ts    generateExercise(rng, {length, maxInterval, scaleId}) → Exercise {notes, scale}
                    └─► settings.ts  Settings value object: selectScale / resetSettings / normalizeSettings / parseThreshold
                                        ▲
settingsStorage.ts (ADAPTER, Storage injected, never throws) ── load/save settings + threshold

synth.ts playSequence(ctx, freqs, {noteDurationMs, volume}) → Playback {done, stop, setVolume}
services.ts AudioServices.playMelody(freqs, options) → playSequence
```

All decisions (catalog derivation, rng consumption, validation) are pure and table/property-tested; the storage and synth
modules stay thin adapters.

## Implementation details

- `src/config/constants.ts`: removed the three constants; added exercise-setting defaults/limits, `PERCENT`, storage keys,
  `SYNTH_ENVELOPE_PEAK_GAIN`, `SYNTH_VOLUME_RAMP_MS`.
- `src/music/scales.ts` (new): 9 type descriptors × key-signature order `0, +1..+7, −1..−7`. Tonic letter
  `= (4k mod 7 + parentDegree − 1) mod 7`, alteration from `keySignatureAlters(k)`. Ids/slugs/names generated from the
  same data, so nothing is typed per scale. Search normalizes (lowercase, ♭→b, ♯→#, trim, collapse spaces) and matches the
  name or an English alias (leading solfège syllable → C..B). Extra export `alterSign(alter)` (beyond the PRD list) reused
  by spelling.
- `src/music/spelling.ts`: `spellInKey` maps pitch class → `{letter, alter}` from the key signature, letter-based octave
  `floor((midi − alter)/12) − 1` (so 60 in Do# major = Si#3); out-of-key notes fall back to `noteName` with sharp/flat by
  key-signature sign. `spellExercise` dispatches on `'chromatic'`.
- `src/music/melody.ts`: `generateMelody` removed; `Exercise`, `ExerciseOptions`, `scaleCandidates`, `pickIndex`,
  `generateExercise` implement the PRD algorithm and rng-call contract verbatim.
- `src/config/settings.ts` (new): pure model. `DEFAULT_SETTINGS` is frozen. `normalizeSettings` validates field by field
  (arrays → defaults), then applies `selectScale` to raise `maxInterval` to the scale minimum. Volume is range-checked
  only (the PRD does not require the 5 % step on load).
- `src/config/settingsStorage.ts` (new, ADAPTER): `getBrowserStorage` + load/save for settings and threshold; every access
  in `try/catch`; storage injected.
- `src/test/fakeStorage.ts` (new): Map-backed `Storage` and an always-throwing `SecurityError` storage.
- `src/audio/synth.ts`: `PlaybackOptions`; master gain starts at `volume`; envelopes peak at `SYNTH_ENVELOPE_PEAK_GAIN`;
  `setVolume` cancels scheduled values, pins the current value and ramps over `SYNTH_VOLUME_RAMP_MS`; no-op once finished
  (natural end, fallback timer or `stop()`).
- `src/audio/services.ts`: `playMelody(freqs, options)` forwards to `playSequence`.
- `src/test/fakeAudioServices.ts`: `PlayCall` gains `noteDurationMs`, `volume`, `volumeChanges`; fake playback
  `setVolume` records into `volumeChanges`.
- `src/components/MicLevelMeter.tsx`: imports `PERCENT`.
- `src/test/sessionDriver.ts`: `TIMER_DRIFT_MARGIN_MS = 100` (outside the PRD) replaces the 1 ms "not yet" / "now"
  boundary margins in `App.test.tsx` and `useTrainingSession.test.tsx`: under `vi.useFakeTimers({ shouldAdvanceTime:
  true })` the fake clock also moves with real time, so 1 ms margins were flaky.

### Bridging (temporary, replaced by prd2.md)

- `src/components/App.tsx`: melody = `getTestMelody() ?? generateExercise(Math.random, { length: DEFAULT_MELODY_LENGTH,
  maxInterval: MAX_INTERVAL_LIMIT, scaleId: CHROMATIC_ID }).notes`.
- `src/training/useTrainingSession.ts`: `playMelody(freqs, { noteDurationMs: DEFAULT_NOTE_DURATION_MS, volume:
  DEFAULT_VOLUME })`.
- `src/testing/testMelody.ts`, `src/test/appTestUtils.tsx`: `MELODY_LENGTH` → `DEFAULT_MELODY_LENGTH` (`?melody=` still
  requires exactly 5 notes).
- `src/training/trainingReducer.ts`: doc comment only.
- Tests: `App.test.tsx` spies on `generateExercise` (+1 test asserting the bridge arguments); play-call expectations in
  `App.test.tsx` / `useTrainingSession.test.tsx` include the new options.
- e2e: unchanged; ~5 s playback at 1000 ms/note fits the existing timeouts (verified, 3 passed).

## Tests

Unit tests: 320 → **1027** (24 files), all passing. `npm run test:scripts` 32/32, `npm run test:e2e` 3/3.

| File | Tests | Covers |
|---|---|---|
| `src/music/scales.test.ts` (new) | 266 | option order/count/uniqueness, full tonic table, key signatures, pitch classes for all 135, largestStep/minMaxInterval, members, search table + normalization |
| `src/music/melody.test.ts` (rewritten) | 315 | worked example, rng call counts, group pick, 0.999… bounds, seeded property over all 146 ids × lengths × intervals |
| `src/config/settings.test.ts` (new) | 65 | defaults, selectScale, reset scopes, every normalize row + range edges, parseThreshold |
| `src/config/settingsStorage.test.ts` (new) | 23 | round-trip, null/throwing/invalid JSON/missing key, quota errors, getBrowserStorage, fake storage helpers |
| `src/config/constants.test.ts` | 49 | new constants, removed constants absent |
| `src/music/spelling.test.ts` | 32 | all spellInKey rows, sweep over 135 scales, spellExercise dispatch |
| `src/audio/synth.test.ts` | 21 (was 12) | master gain = volume, envelope peak, setVolume ramp, no-op after stop/end/fallback |
| `src/test/fakeAudioServices.test.ts` | 7 (was 5) | volume / volumeChanges recording |
| `src/audio/services.test.ts` | 7 | options forwarding |
| `src/components/App.test.tsx` | 25 (was 24) | bridge arguments |

The generator property test was mutation-checked (breaking the interval filter fails 147 tests).

## Documentation updates

- `CLAUDE.md`: status (Part 1 done, Part 2 pending, bridge described); architecture list adds `scales.ts`, `settings.ts`,
  `settingsStorage.ts` (ADAPTER), `fakeStorage.ts`, and updates `constants.ts`, `spelling.ts`, `melody.ts`, `synth.ts`,
  `fakeAudioServices.ts`; conventions for scales/spelling, rng contract, storage injection, volume on master gain.
- `README.md`: notes are now 1 s each (was 0.5 s).

## Performance

The catalog (146 options) is built once at module load. The property test asserts once per option instead of per note
(5.7 s → ~0.15 s).

## Known issues

- **Release decision:** Parts 1 and 2 ship in the same PR. No `bump.txt` is added until Part 2 is done, so CI's
  `release` job cannot publish Part 1 alone (review warning `useTrainingSession.ts:77-81`).
- Until prd2.md lands, the app plays MVP-style chromatic melodies but with the new defaults already active: notes last
  1000 ms (was 500 ms) and playback is 2× louder (peak 1 × master 0.5 vs 0.25 × 1). Settings are not yet persisted or
  editable; `settingsStorage` is not wired into the app.

## Tech debt reduction (after /t-review #1)

All 11 review items fixed (`review.md`); unit tests 1027 → **1196**, lint and typecheck clean.

- `settings.test.ts`: defaults are consistent with the catalog (`isScaleOptionId(DEFAULT_SETTINGS.scaleId)`,
  `maxInterval >= minMaxInterval(scaleId)`).
- `scales.ts`: new `getSpecificScale(id)` (Map-backed, `undefined` for groups/chromatic/unknown/prototype keys);
  `src/test/scales.ts` `requireSpecificScale` replaces the `scaleById` copies in `melody`/`scales`/`spelling` tests.
- `scales.ts`: `minMaxInterval` precomputed in a Map at module load (still throws on unknown ids).
- `scales.ts`: `buildScale` returns an internal entry (scale, option, English name built from the letter index);
  `SPECIFIC_SCALES`, `SCALE_OPTIONS` and the search index derive from it — no more `startsWith` name parsing.
- `notes.ts`: now owns `Alter`, `NOTE_LETTERS`, `LETTER_PITCH_CLASSES`, `SHARP_SIGN`, `FLAT_SIGN`, `alterSign`;
  `PITCH_CLASS_NAMES` derived from them (values unchanged); `scales.ts` and `spelling.ts` import from `notes.ts`.
- `settings.ts`: `normalizeSettings` rejects off-step `volume` (must be a whole percent multiple of
  `VOLUME_STEP_PERCENT`; 0.333 → default); `parseThreshold` rejects off-step dB (−35.5 → default). PRD §3.1 updated.
- `scales.ts`: `searchScaleOptions` ranks matches (name prefix → word prefix → substring, catalog order within a tier),
  e.g. "b major" lists Si major first, "do" lists Do-tonic options before dorian. PRD §2.1 updated; every PRD search
  table row still passes.
- `spelling.test.ts`: the 135-scale sweep uses `scaleCandidates(scale)` instead of hard-coded 19 / 54 / 12.
