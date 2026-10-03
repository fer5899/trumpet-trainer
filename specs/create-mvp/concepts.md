# Trumpet Trainer — Concepts Explained

A study guide to the ideas the PRDs (`prd.md`, `prd2.md`) are built on. Each section explains one
concept in general, then shows exactly where and why it appears in this application.

The numbers match the concept list from the conversation: 10, 11, 12, 13, 15, 16, 18, 19, 20, 28,
29, 30, 31, 33, 34, 39, 44, 48, 49, 51, 54, 55, 61, 62, 63.

Reading order: the sections are grouped so each one builds on the previous ones.

| Group | Sections |
|---|---|
| Pitch and tuning math | 10 → 11 → 12 → 13 |
| Listening: from microphone to "you played La4" | 15 → 16 → 18 → 19 → 20 |
| The browser's audio machinery | 28 → 29 → 30 → 31 → 33 → 34 |
| How the code is organised | 44 → 39 → 48 → 49 → 51 |
| Testing | 54 → 55 |
| Shipping | 63 → 61 → 62 |

---

## 10. Equal temperament and MIDI note numbers

### The concept

**Equal temperament** is the tuning system used by almost all Western instruments today. The
octave (a doubling of frequency) is divided into **12 equal steps called semitones**. "Equal" means
equal *ratios*, not equal Hz: each semitone multiplies the frequency by the same number,

```
2^(1/12) ≈ 1.05946   (12 of them multiplied together = 2, one octave)
```

Starting from a reference note you can compute every other note's frequency. The worldwide standard
reference is **A4 = 440 Hz** (the A above middle C).

**MIDI note numbers** are a convention from the MIDI protocol (1983) that gives every semitone an
integer: `60` is middle C (C4), `61` is C#4, `69` is A4, and so on. Going up one semitone adds 1;
going up one octave adds 12. That turns music questions into simple arithmetic:

| Question | MIDI arithmetic |
|---|---|
| Is this note higher than that one? | `a > b` |
| Transpose down a whole step | `m - 2` |
| Which note name (C, C#, D…)? | `m % 12` (the **pitch class**, 0 = C … 11 = B) |
| Which octave? | `floor(m / 12) - 1` |
| What frequency? | `440 · 2^((m − 69) / 12)` |

The last formula reads: "how many semitones away from A4 am I, and multiply 440 by 1.05946 that
many times." For example, MIDI 52 is 17 semitones below A4: `440 · 2^(−17/12) ≈ 164.81 Hz`.

### In this application

- The whole music domain (`src/music/notes.ts`) is expressed in MIDI numbers. The PRD defines two
  type aliases for them, `WrittenMidi` and `ConcertMidi`, which are both just numbers but document
  which pitch system a value is in (see the written vs concert distinction in the IDEA §5.1).
- The written range of the exercise is **MIDI 54 to 72** (Fa#3 to Do5). Because MIDI numbers
  are consecutive semitones, "all 19 chromatic notes in the range" is literally the list
  `[54, 55, …, 72]` (`WRITTEN_RANGE`).
- **Transposition** for the B♭ trumpet is `concert = written − 2` (`TRANSPOSITION_SEMITONES = −2`).
  A written 54 sounds as concert 52 (Mi3, 164.81 Hz); a written 72 sounds as concert 70 (Si♭4,
  466.16 Hz).
- `midiToHz(m)` is exactly the formula above, using the constants `A4_MIDI = 69` and `A4_HZ = 440`.
  It is used at the two audio boundaries: to tell the synth which frequencies to play and to know
  which frequency the microphone should be hearing.
- `noteName(m, accidental)` uses `m % 12` to look up the solfège name in the sharp or flat table,
  and `floor(m / 12) − 1` for the octave (so 60 → "Do4", 54 → "Fa#3"/"Sol♭3").
- `generateMelody` picks random integers in 54..72. Because notes are just integers, the random
  generator only needs to pick a number, and everything else (names, frequencies) is derived.

---

## 11. Logarithmic pitch perception

### The concept

Our ears do not hear pitch in Hz linearly; they hear **ratios**. Two notes an octave apart always
have a 2:1 frequency ratio, and every octave *sounds* like the same size of jump, but in Hz the
octaves get wider and wider as you go up:

| Octave jump | Hz difference |
|---|---|
| 110 → 220 Hz (A2 → A3) | 110 Hz |
| 220 → 440 Hz (A3 → A4) | 220 Hz |
| 440 → 880 Hz (A4 → A5) | 440 Hz |

That kind of scale, where equal *multiplication* feels like equal *distance*, is called
**logarithmic**. To turn a ratio into a "distance" you take a logarithm: `log2(f2 / f1)` tells you
how many octaves apart two frequencies are (1 = one octave, 0.5 = half an octave, −1 = an octave
down). Multiplying it by 12 gives semitones; multiplying it by 1200 gives cents (section 12).

Consequence: **a fixed tolerance in Hz is meaningless.** The width of one semitone in Hz depends on
where you are:

| Note (concert) | Frequency | One semitone up is … Hz away |
|---|---|---|
| Mi3 (lowest app note) | 164.81 Hz | ≈ 9.8 Hz |
| La4 | 440.00 Hz | ≈ 26.2 Hz |
| Si♭4 (highest app note) | 466.16 Hz | ≈ 27.7 Hz |

A tolerance of "±5 Hz" would be very loose for the low notes (half a semitone) and fairly tight
for the high ones.

### In this application

- Every pitch comparison in the app is done on a logarithmic scale: `centsFrom` uses `Math.log2`,
  and `midiToHz` uses `2 ** (…/12)`. No code compares Hz values directly against a Hz tolerance.
- The tolerance is therefore expressed as `TOLERANCE_CENTS = 25`, which is equally strict at the
  bottom and top of the trumpet's range.
- The accepted detection range `MIN_DETECT_HZ = 150` to `MAX_DETECT_HZ = 500` spans about 1.7
  octaves (`log2(500/150) ≈ 1.74`). It leaves roughly a semitone and a half of margin below the
  lowest note (164.8 Hz) and a little over one semitone above the highest (466.2 Hz), so slightly
  out-of-tune notes at the extremes are still measured instead of being thrown away.

---

## 12. Cents

### The concept

A **cent** is 1/100 of an equal-tempered semitone, so an octave is 1200 cents. The distance in cents
between a measured frequency `f` and a reference frequency `fref` is

```
cents = 1200 · log2(f / fref)
```

- `0` means exactly in tune.
- Positive means **sharp** (too high), negative means **flat** (too low).
- `±100` is a full semitone off, which means you are playing the neighbouring note.
- `±1200` is a full octave off.

Some intuition for the numbers: trained musicians can hear differences of roughly 5–10 cents
between two notes; a beginner's sustained note typically wobbles by 10–20 cents; ±50 cents is the
point halfway to the next note, where the note becomes ambiguous.

### In this application

- `centsFrom(hz, targetMidi)` in `notes.ts` implements the formula, with `fref = midiToHz(targetMidi)`.
  It is **signed** and does not wrap octaves, so `centsFrom(220, 69) = −1200`. That is how
  "the octave matters" (IDEA §5.4) is enforced: the right note in the wrong octave is ±1200 cents
  away and can never be within ±25.
- The success rule is `Math.abs(cents) <= TOLERANCE_CENTS` with `TOLERANCE_CENTS = 25`
  (inclusive). ±25 cents is a quarter of a semitone: strict enough that the neighbouring note
  (±100 c) can never match, loose enough that a beginner's slightly sharp or flat note still counts.
- What ±25 cents means in Hz:
  - around La4 (440 Hz): ±6.4 Hz,
  - around Mi3 (164.81 Hz): ±2.4 Hz.
  This is why the detector must be accurate to a few cents (the PRD requires ±5 cents on synthetic
  signals); a sloppy detector would eat most of the tolerance by itself.
- The sustain tracker's reference cases in `prd.md` are written in cents: 446.5 Hz against a 440 Hz
  target is +25.4 c (just outside, so the 0.5 s timer resets), while 443 Hz is +11.8 c (inside, so it
  matches at t = 500 ms).
- Future idea (IDEA §9): a live tuner would display this cents value directly.

---

## 13. Timbre and harmonics

### The concept

A musical tone is not a single frequency. Any periodic sound (a sound that repeats its waveform
`f` times per second) is the sum of:

- the **fundamental**, at `f` (this is what we perceive as the pitch), and
- **harmonics** (overtones) at exact multiples: `2f`, `3f`, `4f`, …

For a trumpet playing concert La4, the sound contains energy at 440, 880, 1320, 1760 Hz and so on.
The **relative strengths** of those harmonics are what make a trumpet sound like a trumpet and a
flute like a flute. That "colour" of the sound is called **timbre**.

Two practical consequences:

1. **Timbre lets a synthesizer imitate an instrument.** Simple waveforms have characteristic
   harmonic recipes:
   - a **sine** wave has only the fundamental (pure, "flute-like", dull),
   - a **sawtooth** wave has *every* harmonic, with strength falling as 1/n (bright, buzzy, close
     to brass and bowed strings),
   - a **square** wave has only odd harmonics (hollow, "clarinet-like").
2. **Harmonics confuse pitch detectors.** Brass instruments often have a 2nd or 3rd harmonic that is
   *louder* than the fundamental. A naive detector that picks "the loudest frequency" will report
   the note an octave (or an octave and a fifth) too high. This classic mistake is called an
   **octave error**.

### In this application

- **Synth (playback):** `synth.ts` uses a **sawtooth** oscillator per note, passed through a
  **low-pass filter** at `SYNTH_LOWPASS_HZ = 2000` Hz. The sawtooth gives the brassy richness; the
  filter removes the harshest upper harmonics so it sounds less like a buzzer and more like a
  (rather plain) brass instrument. The PRD reasons this is "close enough to a trumpet for ear
  training" and needs no audio sample files. A realistic trumpet sound is a future idea (IDEA §9).
- **Detection (listening):** because a real trumpet signal is rich in harmonics, the PRD chooses
  the McLeod Pitch Method (section 19), which finds the *repetition period* of the waveform instead
  of the loudest frequency. That makes it robust against octave errors. The unit tests check
  `detectPitch` on **both sine and sawtooth** signals at 164.81, 440 and 466.16 Hz, precisely
  because a sawtooth is a harmonic-rich signal that would trick a naive detector.
- **Octave errors would break the rules.** The tracker treats the octave as significant (±1200
  cents), so a detector that reported 880 Hz for a 440 Hz note would never mark it green. Detector
  quality therefore directly determines whether the "octave matters" rule is fair.

---

## 15. Time domain vs frequency domain (and the frame size)

### The concept

A digital audio signal is a list of **samples**: numbers between −1 and +1 measured at regular
intervals. The **sample rate** is how many samples per second: typically 44 100 or 48 000. A list
of samples plotted against time is the **time-domain** view: it shows the waveform itself.

The **frequency-domain** view answers a different question: *which frequencies are present, and how
strong is each one?* The **Fourier transform** converts from one view to the other; the **FFT**
(Fast Fourier Transform) is the efficient algorithm for doing it on a block of samples. An FFT of N
samples produces N/2 frequency "bins", each `sampleRate / N` Hz wide.

Because a signal is a never-ending stream, analysis works on a **frame** (also called a window or
buffer): the most recent N samples.

### Answering your question: what unit is the frame size in?

**The frame size is measured in samples.** `MIC_FFT_SIZE = 2048` means "every analysis looks at the
last 2048 samples". To convert it to time, divide by the sample rate:

| Sample rate | Frame duration of 2048 samples |
|---|---|
| 48 000 Hz (typical on phones and modern PCs) | 2048 / 48 000 ≈ **42.7 ms** |
| 44 100 Hz | 2048 / 44 100 ≈ 46.4 ms |

The constant is called "FFT size" because that is the name of the Web Audio property it sets
(`AnalyserNode.fftSize`, section 33). The analyser *could* compute an FFT of that size, but **this
app never uses the FFT output**. It reads the raw time-domain samples
(`getFloatTimeDomainData`) and gives them to the pitch detector. In this app, `fftSize` simply
means "how many recent samples I get in each frame".

### Why the frame size matters for low notes

A time-domain pitch detector needs to see the waveform repeat several times within one frame to
measure its period reliably. The lowest note the app expects is concert Mi3 at 164.81 Hz:

```
period of Mi3 = 1 / 164.81 Hz ≈ 6.07 ms
periods per frame at 48 kHz = 42.7 ms / 6.07 ms ≈ 7 periods
```

Seven periods are comfortable. With a 1024-sample frame you would get about 3.5 periods, which is
workable but noisier; with 512 it would be under 2, and detection of the lowest notes would become
unreliable. That is the risk recorded in `prd2.md` ("Low notes … fftSize must stay ≥ 2048").

The trade-off in the other direction: a longer frame reacts more slowly, because each measurement
averages over the last 43 ms. For a "hold the note for 500 ms" rule, that delay is irrelevant.

### Why not use the frequency domain?

With an FFT of 2048 samples at 48 kHz each bin is `48 000 / 2048 ≈ 23.4 Hz` wide. Around Mi3 a
whole semitone is only 9.8 Hz, and the ±25-cent tolerance is ±2.4 Hz, so a plain FFT is far too coarse
to judge tuning. On top of that, the loudest bin may be a harmonic (section 13). The time-domain
method (section 19) measures the period with sub-sample precision and gets a few cents of accuracy
from the same 2048 samples.

### Frames overlap

The app takes a frame on every screen refresh (section 34): about every 16.7 ms at 60 Hz. Each frame
is the *last* 42.7 ms of audio, so consecutive frames **overlap** by roughly 60 %. That is fine and
even helpful: the tracker receives a fresh, smoothly changing measurement about 60 times a second.

---

## 16. Loudness: RMS and decibels (dBFS)

### The concept

**RMS (root mean square)** measures how much energy a block of samples carries:

```
RMS = sqrt( mean( sample² ) )
```

Squaring makes negative and positive swings count equally; the mean averages over the frame; the
square root brings it back to the samples' scale. Silence gives 0; a full-scale sine wave
(amplitude 1) gives `1/√2 ≈ 0.707`.

**Decibels** express a ratio on a logarithmic scale (our ears perceive loudness roughly
logarithmically too). For amplitudes:

```
dB = 20 · log10( value / reference )
```

**dBFS** ("decibels relative to full scale") uses the largest possible digital value (1.0) as the
reference. So:

- **0 dBFS** is the maximum; every real level is **negative**.
- every −20 dB is ×0.1 in amplitude (−20 dB = 0.1, −40 dB = 0.01, −60 dB = 0.001),
- −6 dB is roughly half the amplitude.

| Signal | RMS | dBFS |
|---|---|---|
| constant 1.0 | 1.0 | 0 |
| sine, amplitude 1 | 0.707 | ≈ −3.01 |
| sine, amplitude 0.5 (the e2e test tone) | 0.354 | ≈ −9.0 |
| constant 0.1 | 0.1 | −20 |
| silence | 0 | `log10(0) = −∞` (!) |

dBFS is **not** calibrated sound pressure (the dB SPL you would read on a sound meter): the same
trumpet note can read −15 dBFS on one laptop and −30 dBFS on a phone, depending on the microphone
and its gain. That is why the threshold is a user setting, not a fixed number.

### In this application

- `computeLevelDb(samples)` in `src/audio/level.ts` computes RMS → dBFS for each microphone frame.
  Because `log10(0)` is `−∞`, it **clamps** the result to `[LEVEL_FLOOR_DB, 0] = [−100, 0]`; empty
  or silent buffers return −100 (never `NaN` or `−Infinity`, which would break comparisons and the
  meter's arithmetic).
- **The volume threshold** (IDEA §5.5) is in dBFS: `DEFAULT_THRESHOLD_DB = −40`, adjustable with
  the slider from `METER_MIN_DB = −60` to `METER_MAX_DB = 0` in 1 dB steps. −60 dBFS is roughly a
  quiet room; 0 dBFS is a signal so loud it clips. The PRD calls dBFS "device-independent-enough":
  the scale itself is standard, and the user adjusts the threshold on their own device with the
  live meter.
- The threshold has two jobs:
  1. in the **sustain tracker**, a frame below threshold does **not qualify** and resets the 0.5 s
     timer,
  2. in the **training hook**, the pitch detector is **not even called** below threshold, which
     saves CPU and avoids measuring the pitch of background noise.
- The **mic level meter** (Home screen) draws the same `computeLevelDb` value as a horizontal bar
  from −60 to 0, coloured "ok" when the level is at or above the threshold, so the user can find
  a threshold above the room noise and below their playing.
- The microphone is opened with **automatic gain control off** (section 31), so the level reflects
  how loud the user actually plays instead of being normalised by the browser.
- Test helper: `emitTone({ levelDb })` in the fake services fills a frame with the constant
  `10^(levelDb/20)`. The RMS of a constant `c` is `c`, so `computeLevelDb` returns exactly the
  requested `levelDb`. That gives tests a direct way to say "play at −20 dB".

---

## 18. Monophonic pitch detection

### The concept

**Pitch detection** (also called f0 estimation, "fundamental frequency estimation") means looking
at a frame of audio and answering "what note is sounding?" as a frequency in Hz, or "no clear note".

**Monophonic** means one note at a time: a voice, a flute, a trumpet. **Polyphonic** detection
(chords, a piano, a band) is a much harder research problem. Since a trumpet can only play one note
at a time, the app only needs the monophonic version, which is mature and accurate.

Things that make it harder than it sounds:

- **harmonics** that can be stronger than the fundamental (section 13), causing octave errors,
- **noise**: breath, room, fans, talking,
- **attacks and transients**: the first few tens of milliseconds of a note are noisy and unstable,
- **reverberation** and other sounds in the room (including the app's own speaker),
- **vibrato and drift**: the pitch of a held note moves slightly.

A good detector therefore returns both an estimate and a measure of confidence, and the caller
decides what to trust (section 20).

### In this application

- `detectPitch(samples, sampleRate)` in `src/audio/pitchDetector.ts` returns either
  `{ hz, clarity }` or `null` ("no usable pitch"). The rest of the app only sees that simple
  answer; the algorithm behind it is hidden (see section 44 on adapters).
- It applies the app's own acceptance rules on top of the library: `null` when the frequency is
  not a positive finite number, outside `150–500 Hz`, or when clarity is below `0.9`.
- **Level gating is deliberately not inside `detectPitch`.** The caller (the training hook) checks
  the threshold first and only calls the detector for loud-enough frames. That keeps `detectPitch`
  a single-purpose pure function.
- The output feeds the **sustain tracker**, which applies the musical rules (right note, ±25 cents,
  held 500 ms). In other words, the detector answers "what is sounding?" and the tracker answers
  "is that what we wanted, for long enough?".
- Requirements from the PRD: ±5 cents accuracy on synthetic sine and sawtooth at the bottom,
  middle and top of the range; `null` for silence, white noise, and tones outside the range (100 Hz,
  800 Hz).
- The listening phase is designed around the detector's weaknesses: the app does not listen during
  playback or for 250 ms afterwards (speaker and reverb), and requires 500 ms of continuous
  agreement, so noisy attacks and brief glitches never cause a false green.

---

## 19. Autocorrelation and the McLeod Pitch Method (MPM)

### The concept

**Autocorrelation** answers: *if I slide the signal against a copy of itself, at which shift does it
line up best?* A periodic signal lines up perfectly with itself when shifted by exactly one period.

```
signal:          /\/\/\/\/\/\/\
shifted by 1 period:   /\/\/\/\/\/\/\     ← peaks align: high correlation
shifted by ½ period:    \/\/\/\/\/\/\/    ← peaks meet troughs: negative correlation
```

You try every shift ("lag") `τ` from small to large and compute how similar the two copies are. The
first strong peak in that similarity curve is at `τ = one period`, measured in samples, so

```
frequency = sampleRate / τ
```

For example, at 48 kHz a 440 Hz tone repeats every 48 000 / 440 ≈ 109.09 samples.

Plain autocorrelation has problems: it also peaks at 2τ, 3τ… (which can produce octave-*down*
errors), its values are not on a fixed scale, and it only gives integer lags (109 samples gives
440.37 Hz instead of 440: an error of ~1.5 cents here, much more for higher notes).

The **McLeod Pitch Method** (Philip McLeod and Geoff Wyvill, *"A Smarter Way to Find Pitch"*,
2005) is a refinement designed for musical instruments:

1. It uses a **normalised square difference function (NSDF)**, an autocorrelation scaled so the
   result is always between −1 and +1, where +1 means "a perfect copy at this lag". Normalising makes
   peaks comparable regardless of how loud the signal is.
2. **Peak picking:** it finds the peaks of the NSDF, then chooses the **first** peak that is close to
   the highest one (above a fraction of it), rather than simply the highest. That avoids both
   octave-up errors (picking a harmonic) and octave-down errors (picking 2τ).
3. **Parabolic interpolation:** it fits a parabola through the chosen peak and its neighbours to
   find the lag *between* samples (e.g. 109.09 instead of 109), giving accuracy of a few cents.
4. The height of the chosen peak (0…1) is reported as **clarity** (section 20).

MPM works well with only about two periods of signal, has low latency, and is a standard choice for
tuners and instrument trainers. Alternatives include YIN (another time-domain method), FFT-based
methods (coarse, section 15), and zero-crossing counting (very fragile).

### In this application

- The app uses the open-source library **`pitchy` v4**, an implementation of MPM. The decision in
  `prd.md` ("Library pitch detection behind our own interface") explains why: MPM is accurate for
  monophonic brass tones, and wrapping it means the rest of the app only sees
  "frequency + clarity or nothing".
- `detectPitch` creates a `PitchDetector` for the buffer length (2048) and **caches it** per length,
  because building one allocates internal working buffers and doing that 60 times a second would
  waste memory and CPU.
- The ±5-cent accuracy requirement in the PRD is only achievable thanks to the interpolation step
  (an integer-lag answer could be several cents off at higher notes).
- Because the algorithm is behind `AudioServices.detectPitch`, swapping it for YIN or a machine
  learning model later would touch a single module.

---

## 20. Clarity / confidence

### The concept

A pitch detector always produces *some* number, even for noise. **Clarity** (in MPM terms, the
height of the NSDF peak) tells you **how periodic the frame is**, i.e. how much it looks like a
clean, repeating note:

| Clarity | What the frame probably contains |
|---|---|
| ≈ 1.0 | a steady, clean tone (a held trumpet note, a sine) |
| 0.8 – 0.9 | a tone with noise, a note's attack, a wobbly or breathy tone |
| < 0.5 | noise, breath, clicks, chaotic room sound: the "frequency" is meaningless |

Using it means choosing a **confidence threshold**: too low and noise produces random frequencies
that could accidentally match; too high and real (imperfect) notes are rejected.

### In this application

- `MIN_CLARITY = 0.9`. `detectPitch` returns `null` when pitchy's clarity is below that, so the
  rest of the app never sees low-confidence frequencies.
- The PRD's tests verify that **seeded white noise** returns `null`, which is the clarity filter at
  work.
- A `null` frame counts as "not qualifying" in the sustain tracker, which **resets** the 500 ms
  timer. A note must therefore be clean (clarity ≥ 0.9) *continuously* for half a second.
- Clarity and the volume threshold complement each other. Clarity rejects noise even when it is
  loud. The threshold rejects quiet sounds even when they are periodic, such as a distant voice or
  the tail of the speaker's own note. Speech, for example, is often quite periodic (vowels have
  pitch), so the volume threshold and the required exact note/octave are what protect against
  talking (manual checklist in `prd2.md`).
- The fake services in tests return `clarity: 1` for any emitted tone, so component tests exercise
  the musical rules without depending on detector confidence.

---

## 28. Web Audio API and the audio graph

### The concept

The **Web Audio API** is the browser's built-in system for generating, processing and analysing
sound in real time. Its central idea is the **audio graph**: you create **nodes**, each doing one
job, and **connect** them like cables between music gear:

- **source nodes** produce sound: `OscillatorNode` (a synthesizer waveform),
  `MediaStreamAudioSourceNode` (a live microphone), `AudioBufferSourceNode` (a sample/file),
- **processing nodes** transform it: `GainNode` (volume), `BiquadFilterNode` (filters),
  delays, compressors…,
- **analysis nodes** observe it: `AnalyserNode` (section 33),
- **the destination** (`ctx.destination`) is the speakers/headphones.

The actual audio processing does not run in your JavaScript; it runs on a separate high-priority
**audio rendering thread** inside the browser, sample by sample, without glitches even if your page
is busy. JavaScript only builds the graph and **schedules** changes in advance. Parameters such as
gain or frequency are `AudioParam`s, which can be automated on the audio clock
("ramp the gain from 0 to 0.25 between t = 1.000 s and t = 1.015 s").

### In this application

The app builds **two separate graphs** in the same `AudioContext`:

**1. The synth graph (playing the melody)**, `synth.ts`:

```
Oscillator(saw, f1) → Gain(envelope 1) ─┐
Oscillator(saw, f2) → Gain(envelope 2) ─┤
Oscillator(saw, f3) → Gain(envelope 3) ─┼→ BiquadFilter(lowpass 2 kHz) → Gain(master) → destination (speakers)
Oscillator(saw, f4) → Gain(envelope 4) ─┤
Oscillator(saw, f5) → Gain(envelope 5) ─┘
```

- One oscillator per note, all created up front and **scheduled** to start at `t0 + i · 0.5 s` and
  stop half a second later. That gives sample-accurate timing with no gaps, something `setTimeout`
  could never achieve.
- Each note has its own **envelope** (gain automated 0 → 0.25 in 15 ms, hold, → 0 in 30 ms) so
  repeated notes are heard as separate attacks and there are no clicks.
- The **master gain** exists so `stop()` can fade *everything* to silence in 20 ms (stopping abruptly
  would click).

**2. The microphone graph (listening)**, `microphone.ts`:

```
Microphone → MediaStreamAudioSourceNode → AnalyserNode  ✕ (not connected to the speakers)
```

The graph ends at the analyser on purpose (section 33).

Components never build graphs themselves; they call `services.playMelody(...)` and
`services.openMicrophone()` (section 44).

---

## 29. AudioContext

### The concept

An **`AudioContext`** is the Web Audio "engine". Every node belongs to one context, and nodes from
different contexts cannot be connected. The context owns:

- the **audio clock**, `ctx.currentTime`, in seconds, driven by the sound hardware. This is the
  timeline on which notes are scheduled, and it is far more precise than JavaScript timers,
- the **sample rate** (`ctx.sampleRate`, e.g. 48 000),
- the **destination** (the output device),
- a **state**: `'suspended'` (clock stopped, silent), `'running'`, or `'closed'`.

Creating a context is expensive: it opens the audio device and starts a real-time thread. Browsers
limit how many can exist (historically about 6 in Chrome), and different contexts may run at
different sample rates. The recommended practice is **one context per page**, shared by everything.

Older Safari versions only had a prefixed `webkitAudioContext`.

### In this application

- `audioContext.ts` exposes `getAudioContext()`, which creates the context **lazily** (only the
  first time it is needed) and then always returns the **same instance**. One of the acceptance
  criteria is "only one `AudioContext` instance is ever created per page load".
- That single context is shared by the synth (output) and the microphone (input). This avoids the
  resource limit, and it means the microphone's `sampleRate` (which the pitch detector needs to turn
  a lag in samples into Hz) is the same one the whole app uses.
- The synth uses `ctx.currentTime` to schedule notes: `t0 = currentTime + 50 ms`
  (`SYNTH_START_DELAY_MS`). The 50 ms lead time gives the audio thread time to receive the schedule
  before the first note must sound, so the first attack isn't cut off.
- A context may be created in the `'suspended'` state by autoplay rules; `unlockAudio()` resumes it
  (section 30).
- It falls back to `webkitAudioContext` for old Safari.

---

## 30. Autoplay policies and user gestures

### The concept

To stop websites from blasting sound at visitors, browsers have **autoplay policies**: a page
may not start making sound until the user has **interacted** with it (a click, tap or key press).
Technically:

- An `AudioContext` created without a user interaction starts in the `'suspended'` state; calling
  `ctx.resume()` only works when it happens *during* a user gesture.
- The browser tracks this as **user activation**. Chrome grants "transient activation" for a short
  time after a click. **iOS Safari** is the strictest: the `resume()` (or creating the context)
  must happen **synchronously inside the event handler**, in the same call stack as the click.

The trap is asynchronous code. In

```js
button.onclick = async () => {
  await somethingSlow();   // the click's call stack ends here
  ctx.resume();            // too late for iOS Safari: no longer "inside" the gesture
};
```

the code after `await` runs later in a new task, and Safari no longer counts it as part of the
click. The result is a silent app with no error.

### In this application

- `AudioServices.unlock()` (wired to `unlockAudio()`) creates the context if needed and calls
  `resume()` if it is suspended. The PRD requires it to be called **synchronously, first thing**, in
  the click handlers of **"Start training"** and **"Test microphone"**, before any `await`.
- This matters because the Start handler *does* await: it waits for `openMicrophone()`, which may
  show the permission prompt and take seconds. By unlocking first, the context is already running
  when the melody is played after the await.
- An acceptance criterion checks this ("`unlock()` is called synchronously in the Start and
  Test-microphone click handlers"), and `prd2.md` lists iOS Safari silent playback as a risk.
- In e2e tests, Playwright launches Chromium with `--autoplay-policy=no-user-gesture-required` so
  automated clicks never hit autoplay restrictions; the real gesture rule is verified by the manual
  checklist on iOS Safari.

---

## 31. getUserMedia and microphone permissions

### The concept

`navigator.mediaDevices.getUserMedia(constraints)` is the browser API for accessing the
microphone (and camera). It returns a `Promise<MediaStream>`:

1. The browser asks the user for permission (the familiar "Allow this site to use your
   microphone?" prompt). The answer is usually remembered **per site (origin)**.
2. If allowed, it resolves with a `MediaStream` containing one audio **track**. While any track is
   live, the browser shows a "microphone in use" indicator.
3. If something fails, it rejects with a named error:

| Error name | Typical cause |
|---|---|
| `NotAllowedError` | the user (or a policy) denied permission, or dismissed the prompt |
| `SecurityError` | not allowed in this context (e.g. disabled by policy) |
| `NotFoundError` | no microphone is connected |
| `NotReadableError` | the device is in use by another app or failed at the hardware level |
| (no API at all) | very old browser, or the page is **not a secure context** (plain `http://` on a LAN IP): `navigator.mediaDevices` is then `undefined` |

The **constraints** object asks for capabilities. For audio, browsers by default enable
**echo cancellation**, **noise suppression** and **automatic gain control (AGC)**, which are
tuned for video calls and speech.

Releasing the microphone means calling `track.stop()` on every track; only then does the "in use"
indicator turn off.

### In this application

- `openMicrophone` in `microphone.ts` maps every failure to one of three kinds, and
  `micErrorMessage` turns each into user-facing text:
  - no `getUserMedia` → **`'unsupported'`** ("This browser can't access the microphone…"),
  - `NotAllowedError` / `SecurityError` → **`'permission-denied'`** ("Microphone access is
    blocked…"),
  - anything else → **`'unknown'`** ("Check that one is connected and not used by another app…").
- **Raw audio:** the app requests
  `{ echoCancellation: false, noiseSuppression: false, autoGainControl: false }`. The speech
  processing would damage a trumpet signal: noise suppression may treat a sustained tone as noise
  and remove it, AGC would change the level the threshold compares against, and echo cancellation
  distorts the signal. The app avoids hearing its own speaker by **not listening during playback**
  instead (IDEA §4, PRD decision "Do not listen during playback").
- **Ask before playing:** the Start handler opens the microphone *before* generating or playing a
  melody. If permission is denied, the error appears on the Home screen, the user hasn't wasted time
  listening, and the training screen only ever appears when it can actually work.
- **Session lifecycle:** one microphone session per exercise, opened by Start, kept open across
  "Repeat melody" (so the user is never re-prompted), and released on Give up, on completion, or
  when the screen unmounts. The "Test microphone" toggle opens its own session, which is released
  when the toggle is turned off or when Start is pressed. The manual checklist verifies that the
  browser's microphone indicator turns off after returning Home.
- **HTTPS:** `getUserMedia` only exists in a secure context; GitHub Pages provides HTTPS and
  `localhost` counts as secure during development (section 61).

---

## 33. AnalyserNode

### The concept

An **`AnalyserNode`** is a pass-through "tap" in the audio graph. Audio flows through it unchanged,
and at any moment JavaScript can ask it for a **snapshot**:

- `getFloatTimeDomainData(array)`: the latest `fftSize` raw samples (values −1…+1),
- `getFloatFrequencyData(array)`: an FFT magnitude spectrum of those samples, in dB.

Important properties:

- It is **polled, not pushed.** It doesn't give you every sample; it gives you "the most recent
  window" whenever you ask. Ask too rarely and you miss audio between snapshots; ask often and
  snapshots overlap (section 15).
- `fftSize` sets the window length in samples (a power of two between 32 and 32768).
- Browsers keep an analyser processing even if its output goes nowhere, so a graph can end at an
  analyser.

### In this application

- `microphone.ts` builds `MediaStreamAudioSourceNode → AnalyserNode` with `fftSize = 2048`
  (`MIC_FFT_SIZE`) and reads `getFloatTimeDomainData` on every animation frame (section 34). The
  frequency-data method is never used: the pitch detector works in the time domain.
- **The analyser is never connected to `ctx.destination`.** If the microphone were routed to the
  speakers, the user would hear their own trumpet delayed, and the speakers would feed back into
  the microphone, potentially producing the classic howl. Ending the graph at the analyser means the
  app only *observes* the microphone.
- **Buffer reuse:** the adapter allocates *one* `Float32Array` of 2048 samples and refills it on
  every frame, rather than creating a new array 60 times a second (which would pressure the garbage
  collector and could cause stutters). The PRD documents the consequence on `MicFrame.samples`:
  "buffer is reused: do not retain". Listeners must use the samples immediately and never store
  the array, because its contents change on the next frame.

---

## 34. requestAnimationFrame as the analysis loop

### The concept

`requestAnimationFrame(callback)` (rAF) asks the browser to call `callback` **just before the next
screen repaint**, usually 60 times per second (every ~16.7 ms), or 120 on high-refresh displays. To
keep a loop going, the callback requests the next frame itself. `cancelAnimationFrame(id)` stops it.

Characteristics compared to `setInterval`:

- synchronised with the display, so anything visual (like a level meter) updates smoothly,
- **paused or heavily throttled when the tab is hidden**, which saves battery,
- the interval is **not exact**: it varies with refresh rate and load.

### In this application

- `microphone.ts` runs a rAF loop **only while at least one listener is subscribed**. Each tick
  reads the analyser and emits `{ timeMs: performance.now(), samples }` to the listeners: the level
  meter on Home, or the training hook during the listening phase. With no listeners (playback,
  guard), the loop stops, which is one reason frames during playback can never cause a match.
- **Why each frame carries a timestamp:** because the frame rate is irregular (60 Hz on one
  device, 120 Hz on another, slower under load), the sustain tracker does not count frames. It
  computes `frame.timeMs − runStartMs >= 500`. This "clock-injected" design (PRD decision) makes
  the 500 ms rule exact regardless of frame rate, and lets tests feed frames every 20 ms with
  hand-written timestamps.
- `performance.now()` is a high-resolution, monotonic clock (it never jumps backwards like
  `Date.now()` can), which suits measuring durations.
- Consequence of rAF: if the user switches to another tab, analysis stops. That is acceptable for an
  app you look at while playing.
- Alternative not chosen: an **AudioWorklet** (custom code running on the audio thread) would see
  every sample, but it is considerably more complex. A rAF poll at ~60 Hz with 43 ms windows is far
  more than enough for a 500 ms hold rule.

---

## 44. Functional core, imperative shell ("pure core, thin adapters")

### The concept

A **pure function** depends only on its arguments and has no side effects: same inputs, same
output, every time. It doesn't read the clock, use randomness, touch the network, the DOM or
devices. Pure functions are trivial to test, because you call them and compare the result.

**Functional core, imperative shell** (a name popularised by Gary Bernhardt) is an architecture
that splits a program into:

- a **core** of pure functions that make **all decisions**, and
- a **shell**, a thin layer that does **I/O** (devices, timers, the browser, the screen) and
  passes data in and out of the core, deciding nothing itself.

Two techniques make this possible:

- **Inject time and randomness.** Instead of calling `Date.now()` or `Math.random()` inside the
  logic, pass the timestamp or the random-number generator in as an argument. Tests pass fixed
  values, and production passes the real ones.
- **Adapters** (ports and adapters / hexagonal architecture): wrap each external API behind a
  small interface the app owns, so the app depends on "something that can play a melody", not on
  Web Audio itself.

The payoff: the code that is *hard* to test (browser APIs) is small and simple, and the code that is
*easy* to test contains all the logic.

### In this application

The PRD's first implementation decision is exactly this split:

| Pure core (decides, unit-tested) | Thin adapters / shell (I/O, no decisions) |
|---|---|
| `notes.ts`: range, transposition, Hz, cents, names | `audioContext.ts`: create/resume the one context |
| `spelling.ts`: sharps vs flats | `synth.ts`: build the oscillator graph, schedule notes |
| `melody.ts`: `generateMelody(rng)` (randomness injected) | `microphone.ts`: getUserMedia, analyser, rAF loop |
| `level.ts`: RMS → dBFS | `services.ts`: bundles adapters into `AudioServices` |
| `pitchDetector.ts`: pitchy + range/clarity rules | React components: render + forward clicks |
| `sustainTracker.ts`: 500 ms rule (time injected via `timeMs`) | `useTrainingSession`: wires timers/mic/playback to the reducer |
| `trainingReducer.ts`: the session state machine | |
| `testMelody.ts`, `micErrorMessage.ts` | |

Follow one microphone frame through the layers:

```
[shell] microphone adapter: rAF tick → analyser snapshot → { timeMs, samples }
[core]  computeLevelDb(samples) → −22 dB
[core]  −22 ≥ threshold −40 → detectPitch(samples, 48000) → { hz: 441.2, clarity: 0.97 }
[core]  tracker.push({ timeMs, hz, levelDb }, target 69) → false … false … true (500 ms later)
[shell] hook: dispatch({ type: 'noteMatched' })
[core]  trainingReducer → matchedCount + 1
[shell] React re-renders: box turns green with "Si4"
```

Every step that *decides* something ("is it loud enough? is it in tune? held long enough? what's
the next state?") is a pure function tested with plain inputs. The adapters, which are only
covered by e2e and manual tests, contain no `if`s about music.

**Dependency injection** completes the picture: components get the adapters through
`useAudioServices()` (React context). `main.tsx` provides the real browser implementation; tests
provide `createFakeAudioServices()` (section 55). Swapping the synth for real trumpet samples, or
pitchy for another algorithm, means replacing one adapter behind the same interface.

---

## 39. The reducer pattern

### The concept

A **reducer** is a pure function

```
(currentState, action) → nextState
```

where an **action** is a plain object describing *something that happened* ("playback ended",
"a note was matched"), not a command like "set phase to listening". All state changes go through
that one function, so the rules about *how* the state may change are in one place and can be
tested by calling the function.

A reducer is a natural way to write a **finite state machine**: the state has a `phase`, and for
each phase the reducer accepts some actions and **ignores** the rest. Illegal transitions become
impossible by construction instead of being guarded by `if`s scattered across the UI.

In React, `useReducer(reducer, initialArg, init)` holds the state and gives you a `dispatch(action)`
function. React re-renders only if the reducer returns a **new** object. Returning the **same
object reference** means "nothing changed" and skips the render.

**Selectors** are pure functions that derive view data from the state (instead of storing derived
data, which could get out of sync).

### In this application

`src/training/trainingReducer.ts` is the brain of the training screen:

```
State:   { phase, melody, names, matchedCount }
Phases:  playing → guard → listening → complete
```

| From | Action | To |
|---|---|---|
| `playing` | `playbackEnded` | `guard` |
| `guard` | `guardElapsed` | `listening` |
| `listening` | `noteMatched` | `listening` with `matchedCount + 1`, or `complete` after the 5th |
| `listening` | `repeatRequested` | `playing` (progress kept) |
| *anything else* | *anything* | **same object** (ignored) |

What this buys:

- **"Frames during playback never match" is guaranteed structurally.** A `noteMatched` arriving in
  `playing` or `guard` is simply ignored, even if some bug dispatched it.
- `matchedCount` does double duty: the number of green boxes *and* the index of the active note.
  That single number makes "keep progress on Repeat" trivial (`repeatRequested` just doesn't
  touch it).
- `names` is computed once with `spellMelody(melody)` when the state is created, because the
  spelling depends on the whole melody, not on progress.
- **Selectors:** `selectNoteBoxes(state)` derives each box's `pending/active/done` state and name;
  `selectCanAct(state)` is `phase === 'listening'` (enables the buttons). Nothing derived is stored.
- **Side effects are not in the reducer.** Playing audio, starting timers and subscribing to the
  mic happen in the hook (section 48), which *reacts* to phase changes and dispatches actions back.
- "Give up" is intentionally **not** an action: it doesn't change the session's state, it leaves
  the screen entirely.
- Tests (`trainingReducer.test.ts`) check every transition and every ignored pair without React,
  without audio, and without timers.

---

## 48. React hooks and effects

### The concept

A React **function component** is a function that React calls to get the UI; it is called again
(re-rendered) whenever its state or props change. **Hooks** are functions that let a component keep
things between those calls:

- `useState` / `useReducer` hold state that survives re-renders and trigger a re-render when it
  changes,
- `useRef` holds a mutable value that survives re-renders *without* triggering one,
- `useMemo` / `useCallback` cache a computed value / function between renders,
- `useContext` reads a value provided higher up in the tree (how `useAudioServices()` works),
- `useEffect` **synchronises the component with something outside React**: timers, audio,
  subscriptions, devices.

`useEffect(setup, deps)`:

1. runs `setup` **after** React has updated the screen,
2. re-runs it whenever a value in `deps` changes,
3. `setup` may return a **cleanup** function; React calls it before running the effect again and
   when the component unmounts.

The mental model: "while these dependencies have these values, this external thing should be
set up; when they change, tear it down and set it up again." Every effect that starts something
(timer, subscription, sound) must undo it in its cleanup, otherwise things leak or run twice.

A **custom hook** (a function whose name starts with `use` and calls other hooks) packages such
logic so components stay simple.

### In this application

`useTrainingSession` is a custom hook that connects the pure reducer and tracker to the outside
world. Its effects are **keyed on the phase**: each one only does something while the reducer is
in its phase, and its cleanup runs when the phase changes.

| Effect | Runs when | Does | Cleanup |
|---|---|---|---|
| 1. play | phase becomes `playing` (start, and after each Repeat) | reset tracker, `playMelody(...)`, when `done` → dispatch `playbackEnded` | mark cancelled (and stop playback if still running, i.e. on unmount) |
| 2. guard | phase becomes `guard` | `setTimeout(250 ms)` → `guardElapsed` | `clearTimeout` |
| 3. listen | phase is `listening` (re-run whenever `matchedCount` changes) | `mic.subscribe(...)`: level → pitch → tracker → `noteMatched` | unsubscribe |
| 4. complete | phase becomes `complete` | `setTimeout(1500 ms)` → release mic, return Home | `clearTimeout` |
| 5. unmount | mount / unmount | — | release the mic (deferred, section 49) |

Points worth noticing:

- **Cleanups enforce the rules.** Because effect 3's cleanup unsubscribes as soon as the phase
  leaves `listening`, the microphone frames simply stop reaching the tracker during Repeat's
  playback and guard.
- **Stale async results.** `playback.done` is a promise that may resolve after the effect was
  cleaned up (e.g. the user gave up). The effect keeps a `cancelled` flag and ignores the result
  in that case. This pattern is needed whenever an effect awaits something.
- **The 'listening' effect re-subscribes per note** (its deps include `matchedCount`), so each note
  gets a fresh target and a fresh "matched once" guard.
- `useRef` holds things that must not cause renders: the current `stopPlayback` function, the
  latest `onExit` callback, an "already exited" flag.
- Other effects in the app: `MicLevelMeter` opens a mic session while `active` is true and releases
  it in cleanup; if the open resolves *after* the user already toggled it off, it releases the new
  session immediately, which is the same stale-async problem as above.

---

## 49. React StrictMode double-mounting

### The concept

`<StrictMode>` is a development-only wrapper that makes React deliberately stress your components
to expose bugs. The relevant behaviour (React 18): **in development, every component is mounted,
immediately unmounted, and mounted again.** All effects run, all their cleanups run, then all
effects run a second time. State is kept between the two mounts. In production builds this does not
happen.

Why: in real apps components *do* get unmounted and remounted (navigation, conditional rendering,
future React features that preserve state off-screen). If an effect's cleanup does not exactly undo
its setup, the double mount exposes it immediately: two subscriptions, a timer that fires twice, a
resource closed and never reopened.

The rule it enforces: **setup → cleanup → setup must behave the same as a single setup.**

### In this application

`main.tsx` wraps the app in `<StrictMode>`, so during `npm run dev` the training screen is mounted,
unmounted and remounted right away. Two places needed care:

1. **The microphone session.** The mic is opened by `App` (on Start) and passed *into* the
   training screen. A naive "on unmount, release the mic" cleanup would release it during
   StrictMode's simulated unmount, and the remounted screen would be left with a dead microphone,
   with nobody to reopen it. The fix in `useTrainingSession`:

   ```
   cleanup: mounted = false; queueMicrotask(() => { if (!mounted) mic.release(); })
   setup:   mounted = true
   ```

   The release is **deferred by a microtask** (a callback that runs right after the current
   synchronous work). StrictMode's unmount and remount happen synchronously, so by the time the
   microtask runs the component is mounted again and the release is skipped. On a real unmount
   nothing remounts, and the mic is released.

2. **Playback.** The first mount starts the melody; the simulated unmount's cleanup stops it
   ("only if it is still running"); the remount starts it again. The user hears it once. Without
   the stop, two overlapping melodies would play in development.

`CLAUDE.md` records this as a convention ("Effects must survive React StrictMode"), because these
bugs only show up in development and are confusing to diagnose.

---

## 51. Build-time feature flags

### The concept

A **feature flag** switches behaviour on or off. **Runtime** flags are read while the app runs
(a config server, a cookie). **Build-time** flags are fixed when the app is compiled: the build tool
replaces the flag with a literal value, so the switched-off code is in the shipped bundle only as
unreachable code, and a minifier can remove it entirely (**dead-code elimination**).

Vite's mechanism: variables in `.env` files whose names start with `VITE_` are exposed to the code
as `import.meta.env.VITE_…`. At build time Vite **replaces** each reference with the literal string.
Which `.env` file is loaded depends on the **mode**: `vite --mode e2e` loads `.env.e2e`.

### In this application

- The e2e test needs a **known melody**: the fake microphone plays a constant 440 Hz tone, so the
  test can only complete an exercise whose 5 notes are all concert La4 (written Si4, MIDI 71).
  A random melody would make the test impossible.
- `src/testing/testMelody.ts`:
  - `parseTestMelody(search)`, a pure function that reads `?melody=71,71,71,71,71` and returns
    the melody only if it has exactly 5 integers within the written range, otherwise `null`,
  - `getTestMelody()`, which returns that **only if** `import.meta.env.VITE_E2E === 'true'`.
- `.env.e2e` contains `VITE_E2E=true`, and `npm run dev:e2e` runs `vite --mode e2e`. That is the
  only place the flag is on; Playwright starts exactly that server.
- In `npm run build` (production) the variable is not defined, the condition becomes
  `undefined === 'true'`, which is always false, so the URL parameter **has no effect** on the
  deployed site and the minifier can drop the parsing branch.
- `App` uses it as `melody = getTestMelody() ?? generateMelody()`. That is the only seam between test
  hooks and product code.
- Why build-time and not a runtime check (e.g. "if the URL says test")? Because then any user could
  turn on test behaviour in production. The flag guarantees the hook exists only in the binary
  used for testing.

---

## 54. Table-driven tests

### The concept

A **table-driven test** describes test cases as **data**, a list of rows
`{ input, expected }`, and runs the same assertion over each row (`it.each` / `test.each` in Vitest,
or a simple loop). Compare:

```ts
// one test per case
it('spells the first example', () => { expect(spellMelody([54,61,61,58,72])).toEqual([...]) });
it('spells the second example', () => { ... });

// table-driven
it.each([
  { melody: [54, 61, 61, 58, 72], names: ['Fa#3', 'Do#4', 'Do#4', 'Si♭3', 'Do5'] },
  { melody: [56, 56, 56, 56, 56], names: ['Sol#3', 'Sol#3', 'Sol#3', 'Sol#3', 'Sol#3'] },
  // …
])('spells $melody', ({ melody, names }) => {
  expect(spellMelody(melody)).toEqual(names);
});
```

Benefits: adding a case is one line; the full set of cases is visible at a glance, so gaps and
duplicates stand out; and the table can be copied from (and checked against) the specification.

They suit pure functions best: no setup, just inputs and outputs.

### In this application

The PRD writes many requirements directly as tables, and asks for them to become test tables:

- **Spelling:** `prd.md` has a "worked examples" table and says it "must be used as table-driven
  test cases". Each row also has a "why" column, so each row documents which IDEA §5.3 rule it
  exercises (first note looks ahead, repeat keeps spelling, naturals have no accidental, …).
- **`noteName`:** all 12 pitch classes × 2 accidentals, which is the sharp/flat name table in `prd.md`.
- **`generateMelody`:** stub-rng values → expected notes (`0 → 54`, `0.5 → 63`, `0.9999 → 72`, …),
  including the boundary values that catch off-by-one errors.
- **`computeLevelDb`:** constant 1.0 → 0 dB, constant 0.1 → −20 dB, sine → −3.01 dB, zeros → −100.
- **Sustain tracker:** the reference cases (exact 500 ms boundary, +25.4 c drift, `null` frame,
  below threshold, wrong octave, …).
- **`trainingReducer`:** every (phase, action) pair: four that transition, all others must return
  the same reference.
- **`parseTestMelody`, `micErrorMessage`:** valid/invalid inputs, one message per error kind.

Because the PRD tables and the test tables are the same data, a reviewer can check the tests
against the spec row by row.

---

## 55. Test doubles: fakes, stubs and spies

### The concept

A **test double** is anything that stands in for a real dependency during a test (like a stunt
double in a film). Gerard Meszaros' standard vocabulary:

| Kind | What it does | Example |
|---|---|---|
| **Dummy** | Passed around but never used | an unused callback |
| **Stub** | Returns canned answers | `rng = () => 0.5` |
| **Spy** | Records how it was called, so the test can assert on it afterwards | `vi.fn()`: "was `playMelody` called with these 5 frequencies?" |
| **Mock** | Pre-programmed with expectations; fails if called differently | (strict mocks, rarely needed here) |
| **Fake** | A simplified **working implementation** | an in-memory microphone you can push frames into |

Why use them: the real thing may be **unavailable** (jsdom, the fake browser used for component
tests, has no Web Audio or microphone), **non-deterministic** (randomness, real time, real sound),
**slow**, or **hard to control** ("make the permission be denied", "end the playback now").

The risk: a double can behave differently from the real thing, so tests pass while the real app
fails. That is why some tests still have to use the real dependencies.

### In this application

- **Stubs:** a stub `rng` for `generateMelody`; stubbed `navigator.mediaDevices` and
  `requestAnimationFrame` in adapter tests.
- **Spies:** `vi.fn()` everywhere: `unlock`, `openMicrophone`, `playMelody`, `detectPitch` in the
  fake services, so tests assert "unlock was called synchronously", "playMelody was called once with
  the 5 concert frequencies and 500 ms", "it was never called after a permission error".
- **Fakes:**
  - `src/test/fakeAudioServices.ts`, `createFakeAudioServices()`: a full `AudioServices`
    implementation for component tests, with **controls** a real browser can't offer:
    `failNextMicrophone(kind)`, `sessions` (each with `released`, `listenerCount`, `emit`),
    `emitTone({ hz, levelDb, timeMs })`, `playCalls`, `finishPlayback()`.
  - `src/test/fakeWebAudio.ts`: recording fakes of Web Audio nodes, so adapter tests can check the
    graph was wired as specified without producing sound.
  - **Chromium's fake microphone** in e2e: launch flags replace the real device with a WAV file
    (looping 440 Hz). It is a fake at the browser level, which lets the *real* adapters run.
- **Fake timers** (`vi.useFakeTimers`) are a fake of the clock, so tests can say "advance 250 ms"
  instead of waiting.
- **The injection seam is what makes it possible:** because components only reach audio through
  `useAudioServices()`, a test just renders the app inside
  `<AudioServicesProvider services={fake.services}>`.
- **Covering the risk:** the real adapters are not unit-tested against real Web Audio; they are
  covered by the e2e tests (real Chromium audio stack, fake mic) and by the manual checklist on
  real devices with a real trumpet. Each layer catches what the doubles could hide.

---

## 63. Build vs dev server vs preview

### The concept

A modern frontend has three ways to run:

1. **Dev server** (`vite`): serves your *source* files on demand. When the browser requests a
   `.tsx` file, Vite transforms it to JavaScript on the fly (quickly, using esbuild) and serves it as
   a native ES module. Edits are pushed to the browser instantly (**HMR**, hot module replacement),
   often without losing state. It is fast to start, unoptimised, and only for development.
2. **Build** (`vite build`): produces the **production bundle** in `dist/`: all modules are
   combined (bundled with Rollup), unused code is removed (tree shaking), code is minified, and
   filenames get a content **hash** (`index-l9Jvc4TA.js`) so browsers can cache them forever and a
   new deploy gets new names. `dist/` is just static files.
3. **Preview** (`vite preview`): a tiny local static server that serves `dist/` *as is*, to check
   that the production build works before deploying it.

Note that Vite **does not type-check**. It strips TypeScript types without checking them. That is
why there is a separate `tsc --noEmit` (`npm run typecheck`) step.

### In this application

| Command | Mode | Used for |
|---|---|---|
| `npm run dev` | dev server, base `/`, http://localhost:5173 | daily development (StrictMode double-mount active) |
| `npm run dev:e2e` | dev server in **mode `e2e`** (loads `.env.e2e`, `VITE_E2E=true`), port 5173 strict | what Playwright runs against, so the `?melody=` hook works (section 51) |
| `npm run build` | production bundle in `dist/`, base `/trumpet-trainer/` | what CI deploys to GitHub Pages |
| `npm run preview` | serves `dist/` locally | checking the production build |
| `npm run typecheck` / `lint` / `test` | — | checks that the build itself does not do |

- The e2e tests run against the **dev server**, not the build, because the test hook only exists
  where `VITE_E2E=true`. The production build is checked by CI's `build` step and by manual
  validation on the deployed site.
- `--strictPort` makes `dev:e2e` fail instead of silently moving to 5174 if 5173 is busy, because
  Playwright waits for exactly `http://localhost:5173` (that's why CLAUDE.md says to stop other
  servers first).

> **⚠ Observed issue while writing this guide:** `vite.config.ts` sets
> `base: command === 'build' ? '/trumpet-trainer/' : '/'`. `vite preview` runs with
> `command === 'serve'`, so preview serves at `/` with base `/`, while the built `index.html`
> requests `/trumpet-trainer/assets/index-….js`. That request gets the HTML fallback page
> (`Content-Type: text/html`) instead of the script, so `npm run preview` shows a blank page.
> (`CLAUDE.md` describes preview at `http://localhost:4173/trumpet-trainer/`.) It does not affect
> the deployed site, only local preview.

---

## 61. Static site hosting (GitHub Pages) and base paths

### The concept

A **static site** is a set of files (HTML, JS, CSS, images) that a web server sends exactly as
stored, with no server-side code, database or per-user logic. Anything dynamic happens in the
visitor's browser. Static hosting is cheap (often free), fast (easy to cache on CDNs) and has
almost nothing to secure or maintain.

**GitHub Pages** hosts static sites straight from a GitHub repository, with free HTTPS. A
*project* site is published under a sub-path named after the repository:

```
https://<user>.github.io/<repo-name>/
```

That sub-path creates the **base path** problem. A bundle that refers to its files with absolute
paths like `/assets/index.js` would make the browser request
`https://<user>.github.io/assets/index.js`, which is outside the project, so it gets a 404 and a blank
page. The bundler must prefix every URL with the base path: `/trumpet-trainer/assets/index.js`.

### In this application

- The app needs **no backend**: melody generation, playback, detection and state all run in the
  browser, and the only setting (threshold) lives in memory. A static host is all that's needed.
- **HTTPS is a hard requirement**, not a nicety: `getUserMedia` only works in a secure context
  (section 31). GitHub Pages provides HTTPS automatically; `localhost` is treated as secure in
  development, but opening the dev server from a phone via a LAN IP (`http://192.168.x.x`) is not, so
  the microphone is unavailable there (risk in `prd2.md`).
- `vite.config.ts` sets `base: '/trumpet-trainer/'` for builds, matching the repository name. If the
  repository were renamed, this value would have to change (the config has a comment saying so).
- The app is a single page with no router, so there is no "deep link returns 404" problem that
  single-page apps with URL routes often have on GitHub Pages.
- The deployed URL is also where the **manual validation checklist** is run on real devices
  (desktop Chrome/Firefox, iOS Safari, Android Chrome).

---

## 62. CI/CD pipelines

### The concept

- **CI (Continuous Integration):** every push automatically runs the project's checks (lint, type
  check, tests, build) on a clean machine, so a broken change is caught within minutes, before it
  is merged, and nobody can forget to run the tests.
- **CD (Continuous Delivery/Deployment):** when the checks pass on a chosen branch, the result is
  automatically deployed. No manual "upload the files" step.

**GitHub Actions** runs pipelines defined as YAML **workflows** in `.github/workflows/`:

- **triggers** (`on: push`, `pull_request`) decide when it runs,
- **jobs** run on fresh virtual machines (**runners**), in parallel by default; `needs:` creates
  dependencies between them,
- each job is a list of **steps**: shell commands or reusable **actions**
  (`actions/checkout`, `actions/setup-node`, …),
- `if:` conditions skip jobs; **permissions** grant the job's token specific rights;
  **environments** and **concurrency groups** control deployments; **artifacts** are files saved
  from a run for later inspection.

### In this application

`.github/workflows/ci.yml` defines three jobs:

```
            push / pull_request (any branch)
                    │
        ┌───────────┴───────────┐
     check                     e2e
  lint, typecheck,      install Chromium,
  unit tests, build     npm run test:e2e
        └───────────┬───────────┘
                 deploy
     (only on push to the deploy branch,
      only if BOTH previous jobs passed)
   build → upload dist/ → deploy to Pages
```

- **`check`**: `npm run lint`, `typecheck`, `test` (Vitest), `build`. This is fast feedback on
  every push and pull request.
- **`e2e`**: installs Chromium for Playwright and runs the end-to-end tests with the fake
  microphone. On failure it uploads `playwright-report/` as an **artifact** so you can download the
  report and traces to see what went wrong. Risks of e2e flakiness on CI machines are mitigated with
  `retries: 2` (only on CI), one worker, long timeouts and a seamlessly looping tone.
- **`deploy`**: `needs: [check, e2e]`, so a failing test means **nothing is deployed**. It only runs on
  a `push` to the deploy branch: `vars.DEPLOY_BRANCH`, a repository variable, or `main` by default.
  The repo's current default branch is `claude/pensive-fermi-pxuyo0`, so either a `main` branch
  must exist or `DEPLOY_BRANCH` must be set.
  - `permissions: pages: write, id-token: write`: the official Pages actions authenticate by
    requesting a short-lived **OIDC token** from GitHub instead of using a stored secret.
  - `environment: github-pages`: deployments show up in the repo's Environments page with the
    live URL.
  - `concurrency: { group: pages, cancel-in-progress: false }`: two quick pushes deploy one after
    the other instead of colliding, and a running deploy is never cancelled halfway.
  - steps: `configure-pages` → `upload-pages-artifact` (the `dist/` folder) → `deploy-pages`.
- **One-time manual setting:** in the repository settings, Pages' source must be set to
  "GitHub Actions" (not "deploy from a branch").
- `npm ci` (not `npm install`) is used everywhere: it installs exactly what `package-lock.json`
  says and fails if the lock file is out of sync, so CI runs the same dependency versions you
  tested locally. `setup-node` with npm caching makes repeated installs faster.
- This pipeline is how the PRD's goal "deployed automatically to GitHub Pages on every push to the
  deploy branch" and "the full loop is covered end-to-end by an automated test" are enforced
  together: deployment is gated on that test.
