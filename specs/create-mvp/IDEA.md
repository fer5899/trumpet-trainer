# Trumpet Trainer — Idea Document (MVP)

## 1. Summary

A simple web app to train your ear and play "by ear" on the trumpet.
The app plays a short melody of 5 random notes and the user has to play it back
on their trumpet. The app listens through the microphone and marks each correct note.

## 2. MVP goal

Validate the core loop **listen → play it back on the trumpet → immediate feedback**
with the smallest possible interface: no accounts, no persistence and no settings.

## 3. Audience

Beginner and intermediate players of the B♭ trumpet.

## 4. User flow

1. **Home screen**: a single **"Start training"** button.
2. **Melody playback**:
   - 5 random notes are generated.
   - They are played back to back, **0.5 s each**.
   - The microphone does **not** listen during playback (so it doesn't pick up the speaker itself).
3. **Listening phase**:
   - **5 grey boxes** are shown, one per note.
   - The **active note** (the one to play next) is highlighted with a border/frame.
   - The microphone analyses the pitch in real time.
   - When the correct note is detected **sustained for ≥ 0.5 s**:
     - the box turns **green**,
     - the **note name** is shown inside it,
     - the active note moves on to the next box.
   - If a wrong note is played **nothing happens**: the app keeps waiting for the correct one.
   - Buttons available during this phase:
     - **"Repeat melody"**: plays the melody again (listening is paused while it plays; progress already made is kept).
     - **"Give up"**: abandons the exercise and returns to the home screen.
4. **End**: once all 5 notes are completed the app returns **directly** to the home screen.

## 5. Musical rules

### 5.1 Instrument and transposition

- Notes are defined in **written notation for B♭ trumpet**.
- The actual (concert) pitch sounds **a whole step (2 semitones) below** the written note.
- Both the played melody and the detection work in **concert pitch**;
  the names shown to the user are the **written** ones.

| | Lowest note | Highest note |
|---|---|---|
| Written (B♭) | F#3 (Fa#3) | C5 (Do5) |
| Actual sound (concert) | E3 (Mi3, ≈164.8 Hz) | B♭4 (Si♭4, ≈466.2 Hz) |
| Written / concert MIDI | 54 / 52 | 72 / 70 |

> Octave convention: C4 = middle C (scientific pitch notation, MIDI 60).

### 5.2 Melody generation

- 5 notes chosen at random, independently, from the **19 chromatic notes**
  of the written range F#3–C5 (semitones included).
- Repeated notes are allowed in the MVP.
- Each note lasts 0.5 s, with no silence between them.

### 5.3 Note names

- Displayed in **Latin (solfège) notation**: Do, Re, Mi, Fa, Sol, La, Si, with an octave number (e.g. *Fa#3*, *Do5*).
- Accidentals: shown with a **sharp** (#) by default. *(See open questions.)*

### 5.4 Success criteria

- Tuning tolerance: **±25 cents** from the target frequency (concert pitch, A4 = 440 Hz).
- The note must stay within the tolerance **continuously for ≥ 0.5 s**.
  If it leaves the tolerance, the timer resets.
- The octave matters: playing the correct note in a different octave does not count.

## 6. Interface (sketch)

```
 Home                         Listening
┌──────────────────────┐     ┌───────────────────────────────────────┐
│                      │     │  [Fa#3] [ Sol4 ] ┏━━━━┓ [    ] [    ] │
│  [Start training]    │     │  green   green   ┃    ┃  grey   grey  │
│                      │     │                  ┗━━━━┛ ← active note │
└──────────────────────┘     │  [Repeat melody]        [Give up]     │
                             └───────────────────────────────────────┘
```

## 7. Technical requirements (proposal)

- **Web, frontend only**, no backend. Works on modern desktop and mobile browsers.
- **Audio output**: Web Audio API (oscillator with a simple envelope, or trumpet samples later on).
- **Input**: `getUserMedia` + `AnalyserNode`; monophonic pitch detection
  (e.g. autocorrelation / YIN / McLeod) in the ≈150–500 Hz range.
- **HTTPS** (or localhost) and microphone permission are required; if permission is denied, show a clear message.
- Audio must start after user interaction (the button), due to autoplay policies.

## 8. Out of scope for the MVP

- User accounts, history, statistics or scoring.
- Difficulty levels, configurable length or tempo.
- Instrument/transposition choice (C, F, E♭...).
- Sheet music / staff.
- Rhythm: only pitch matters, not duration or the time between notes.

## 9. Future ideas

- Show the detected note live, plus a tuner (cents of deviation).
- Mistake/attempt counter and time per exercise.
- Progressive difficulty: range, maximum intervals, keys, melody length.
- Scale-based melodies instead of purely chromatic ones.
- Realistic trumpet sound for the melody.
- Transposition and notation selector (Latin/English).
- Show the melody on a staff once completed.

## 10. Open questions

- **Enharmonics**: always show sharps (Fa#, Do#...) or use flats in some cases (Si♭, Mi♭)?
- **Volume / noise**: minimum volume threshold to ignore ambient noise? (proposal: yes, calibratable later on).
- **Using speakers**: the microphone may pick up the melody; this is mitigated by not listening during playback. Should we recommend headphones?
- **Large leaps**: with fully random notes, intervals of up to 18 semitones can come up. Should we limit the maximum interval between consecutive notes?
