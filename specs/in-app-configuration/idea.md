# Trumpet Trainer — Idea Document: In-app configuration

> Status: **ready for spec**. All product decisions are settled.

## 1. Summary

Add a **configuration panel** you can open from any screen (Home and Training). It lets the user
change some of the app's tunable values at runtime, which are fixed constants today.

## 2. Motivation

The MVP has a single setting, the microphone threshold slider on the Home screen. Every other
tunable is hard-coded in `src/config/constants.ts`. Players at different levels want to adjust
things like difficulty, timing and tolerance without a rebuild.

## 3. Current tunables (inventory)

Everything that can be tuned today, from `src/config/constants.ts` plus a few hard-coded choices.
"Candidate" is a first estimate of whether it makes sense as a user-facing setting.

### 3.1 Exercise

| Constant | Current value | Meaning | Candidate |
|---|---|---|---|
| `MELODY_LENGTH` | 5 | Notes per exercise | Yes |
| `NOTE_DURATION_MS` | 500 ms | Duration of each played note (tempo) | Yes |
| `LISTEN_GUARD_MS` | 250 ms | Silence after playback before listening starts | Maybe (advanced) |
| `COMPLETE_PAUSE_MS` | 1500 ms | All-green pause before returning Home | Maybe |

### 3.2 Success criteria

| Constant | Current value | Meaning | Candidate |
|---|---|---|---|
| `TOLERANCE_CENTS` | ±25 cents | How in tune a note must be | Yes |
| `SUSTAIN_MS` | 500 ms | How long the note must be held in tune | Yes |

### 3.3 Note range and instrument

| Constant | Current value | Meaning | Candidate |
|---|---|---|---|
| `WRITTEN_MIN_MIDI` | 54 (Fa#3) | Lowest written note in melodies | Yes |
| `WRITTEN_MAX_MIDI` | 72 (Do5) | Highest written note in melodies | Yes |
| `TRANSPOSITION_SEMITONES` | −2 | B♭ instrument: concert = written − 2 | Maybe (other instruments: C, E♭, F…) |

### 3.4 Tuning reference

| Constant | Current value | Meaning | Candidate |
|---|---|---|---|
| `A4_HZ` | 440 Hz | Concert pitch reference | Maybe (e.g. 442 for orchestras) |
| `A4_MIDI`, `SEMITONES_PER_OCTAVE`, `CENTS_PER_OCTAVE` | 69, 12, 1200 | Music-theory constants | No |

### 3.5 Microphone level / threshold

| Constant | Current value | Meaning | Candidate |
|---|---|---|---|
| `DEFAULT_THRESHOLD_DB` | −40 dBFS | Initial threshold (already user-adjustable via the Home slider) | Already a setting: move to / mirror in panel? |
| `METER_MIN_DB` / `METER_MAX_DB` | −60 / 0 dBFS | Meter and slider range | No |
| `THRESHOLD_STEP_DB` | 1 dB | Slider step | No |
| `LEVEL_FLOOR_DB` | −100 dBFS | Level reported for silence | No |

### 3.6 Pitch detection

| Constant | Current value | Meaning | Candidate |
|---|---|---|---|
| `MIN_DETECT_HZ` / `MAX_DETECT_HZ` | 150 / 500 Hz | Accepted detection range (must cover the note range) | No (derive from range?) |
| `MIN_CLARITY` | 0.9 | Minimum pitchy clarity to accept a reading | Maybe (advanced) |
| `MIC_FFT_SIZE` | 2048 | Analyser frame length | No |

### 3.7 Synth (melody playback sound)

| Constant / choice | Current value | Meaning | Candidate |
|---|---|---|---|
| `SYNTH_PEAK_GAIN` | 0.25 | Playback volume | Yes |
| Oscillator type (`synth.ts`) | `sawtooth` | Timbre of the reference sound | Maybe |
| `SYNTH_LOWPASS_HZ` / `SYNTH_LOWPASS_Q` | 2000 Hz / 0.7 | Tone brightness | Maybe (advanced) |
| `SYNTH_ATTACK_MS` / `SYNTH_RELEASE_MS` | 15 / 30 ms | Note envelope | No |
| `SYNTH_START_DELAY_MS`, `SYNTH_STOP_FADE_MS`, `SYNTH_DONE_FALLBACK_MARGIN_MS` | 50 / 20 / 200 ms | Scheduling internals | No |

### 3.8 Other hard-coded behaviour

| Choice | Current value | Meaning | Candidate |
|---|---|---|---|
| Note naming (`notes.ts`) | Latin solfège (Do, Re, Mi…) | Names shown in boxes | Maybe (English letters C, D, E…) |
| Melody generation (`melody.ts`) | Uniform random, repeats allowed | How notes are chosen | Maybe (max interval, no repeats…) |
| `MS_PER_SECOND`, `DB_PER_DECADE` | 1000, 20 | Unit conversions | No |

## 4. Settings in scope

| Setting | Default | Allowed values | Notes |
|---|---|---|---|
| **Note duration** (playback) | **1000 ms** | 250–1500 ms | Replaces `NOTE_DURATION_MS` at runtime. Changeable during an exercise (see 5). |
| **Melody length** | **5 notes** | 3–8 | Replaces `MELODY_LENGTH` at runtime. The Training screen shows one box per note, so the layout must fit 8 boxes (incl. mobile width). |
| **Playback volume** | **0.5** peak gain (shown as 50%) | 0–100% → peak gain 0–1.0 | Replaces `SYNTH_PEAK_GAIN` at runtime. Changeable during an exercise (see 5). |
| **Max interval jump** | **12 semitones** (one octave) | 1–18 semitones (18 = whole range Fa#3–Do5) | Largest allowed distance between two consecutive notes. |
| **Scale / scale group** | **Do major** | See 4.1 | Restricts the melody generator to the notes of a scale. |

The defaults change the current behaviour: playback is slower (1000 ms vs 500 ms), louder (0.5 vs
0.25), jumps are at most an octave (vs 18 semitones) and melodies are in Do major (vs chromatic).

The **microphone threshold stays where it is** (slider on the Home screen) and is not part of the
panel, but it is now **saved to `localStorage`** too (see 5).

### 4.1 Scale selector

**Scale types** (each listed once; Ionian and Aeolian appear only as names in brackets):

| Type | Intervals from the tonic (semitones) | Largest step |
|---|---|---|
| Major (Ionian) | 0 2 4 5 7 9 11 | 2 |
| Natural minor (Aeolian) | 0 2 3 5 7 8 10 | 2 |
| Dorian | 0 2 3 5 7 9 10 | 2 |
| Phrygian | 0 1 3 5 7 8 10 | 2 |
| Lydian | 0 2 4 6 7 9 11 | 2 |
| Mixolydian | 0 2 4 5 7 9 10 | 2 |
| Locrian | 0 1 3 5 6 8 10 | 2 |
| Major pentatonic | 0 2 4 7 9 | 3 |
| Minor pentatonic | 0 3 5 7 10 | 3 |
| Chromatic | all 12 | 1 |

"Largest step" is the biggest distance between two neighbouring notes of the scale (counting the
wrap to the octave). It sets the minimum max interval (see 4.2).

**Tonics and enharmonic spellings:** both spellings are kept. Every type except chromatic is
offered on every tonic whose key signature has at most 7 sharps or flats, which gives **15 tonics
per type**. For major these are Do, Sol, Re, La, Mi, Si, Fa#, Do#, Fa, Si♭, Mi♭, La♭, Re♭, Sol♭,
Do♭. So Fa# major and Sol♭ major, or Do# major and Re♭ major, are separate entries that sound the
same but are spelled differently. Modes and pentatonics follow the same rule using the key
signature of their parent major scale (e.g. Re dorian ↔ Do major, Mi♭ minor ↔ Sol♭ major).

**Options in the selector:**

- **Specific scales:** 9 types × 15 tonics = 135 entries, e.g. "Do major", "Mi minor",
  "Re dorian", "Do major pentatonic".
- **Chromatic:** all 12 pitch classes (the MVP behaviour).
- **Groups:** for each new melody one scale of the group is picked at random, and the whole melody
  uses that scale. Pressing "Repeat melody" replays the same melody, so the scale doesn't change.
  - All majors, All natural minors, All dorian, All phrygian, All lydian, All mixolydian,
    All locrian
  - All major pentatonics, All minor pentatonics (separate groups)
  - **All scales:** every specific scale above (chromatic not included)

**Search:** with ~145 options the selector is a **searchable list**. The user types and the list
narrows to matching options:

- Case-insensitive substring match on the option name.
- `b` and `#` match ♭ and ♯ (typing "sib" finds "Si♭ major").
- **English names match too:** C D E F G A B for Do Re Mi Fa Sol La Si, so "bb major" finds
  "Si♭ major" and "f# dorian" finds "Fa# dorian". Options are still displayed with solfège names.

Rules:

- Scale names are in **written** pitch, like every note name in the app: "Do major" sounds as
  concert Si♭ major.
- Melodies use only notes of the scale that fall inside the instrument range (Fa#3–Do5, written).
  Any scale note can start or end the melody; there is no tonic rule.
- **Spelling follows the key signature** of the chosen scale (e.g. Fa major always shows Si♭,
  Re dorian has no accidentals, Sol♭ major shows Do♭). Chromatic has no key signature and keeps the
  current contextual rule (IDEA §5.3 of the MVP).

### 4.2 Interaction of max interval and scale

Combinations where the max interval is smaller than the scale's largest step are **blocked**,
because they would leave notes with no reachable neighbour (e.g. 1 semitone + pentatonic gives
only repeated notes).

- The **minimum** of the max-interval control depends on the selected scale: its largest step
  (1 chromatic, 2 heptatonic scales, 3 pentatonics). For a group it is the largest step of any
  scale in the group (e.g. All scales → 3).
- When the user selects a scale whose minimum is above the current max interval, the max interval
  is **raised to that minimum automatically** and the control shows the new lower bound.
- Repeated notes stay allowed (interval 0).

## 5. Panel behaviour

- Opens from **any screen** (Home and Training) with a **gear icon in the top-right corner**.
- **On Home:** every setting in the panel can be changed. Changes apply to the next exercise.
- **During an exercise (Training screen):** only **note duration** and **playback volume** are
  shown; the other settings are **hidden**. The exercise is **not restarted** and progress is kept.
  - The panel can be opened **while the melody is playing**.
  - A **volume** change applies **immediately**, also to the melody currently playing.
  - A **note duration** change applies from the next playback (e.g. "Repeat melody").
- A **"Reset to defaults"** button restores the defaults in section 4. On Training it only resets
  the settings shown there (note duration, volume). It **never resets the microphone threshold**.
- Settings are **saved to `localStorage`** and restored on the next visit. The microphone threshold
  is saved too. For a group, the group itself is saved (not the scale last picked from it), so each
  new melody keeps picking a random scale. If storage is missing, blocked or contains invalid data, the app falls back to the
  defaults and keeps working.

## 6. Out of scope

- Moving the microphone threshold into the panel (it is only persisted).
- Tolerance, sustain time, note range, transposition, A4 reference, detection and synth internals:
  stay fixed constants.
- Tonic rules (start or end on the tonic), weighting notes within a scale.
- Other scale types (harmonic/melodic minor, blues, …).
