# Trumpet Trainer — Idea Document: Pitch feedback graph

> Status: **ready for spec**. All product decisions are settled.

## 1. Summary

Add a **live pitch graph** to the Training screen. It shows how far the played pitch is from the
**closest note** (in cents) while it is being played, **without revealing which note that is**.
The tolerance band around the note fills up while the note is held in tune, then turns **green**
(it was the expected note) or **red** (it was another note). A correct note is revealed in a
large **overlay** for a short moment.

## 2. Motivation

Today the only feedback while playing is binary: the current box turns green once the expected
note is held in tune (±`TOLERANCE_CENTS`) for `SUSTAIN_MS`. A player who is a little sharp or
flat, or who is holding the wrong note, gets no hint at all. The graph shows *how* in tune they
are and *whether* they held some note long enough, so they can correct intonation and learn
that a held note was wrong, while the ear-training part (which note is it?) stays hidden.

## 3. Mockups

Mockups in `mockups/` (layout is indicative, not final):

| File | Shows |
|---|---|
| `1-idle.png` | Graph below the buttons. Grey tolerance band, yellow trail, white leading dot at 80 % width. |
| `2-filling.png` | Pitch inside the band: the band fills with a darker yellow from left to right. |
| `3-right.png` | Fill complete on the expected note: band turns green. |
| `4-wrong.png` | Fill complete on another note: band turns red. |
| `5-overlay.png` | Correct note revealed ("Fa # 3") in a large green card; the screen behind is blurred and darkened, and the first box is already green. |

## 4. The graph

### 4.1 Axes

- **X axis: time.** It scrolls: the newest reading is always at the right side of the trail.
- **Y axis: cents** relative to the **closest semitone** to the detected pitch, from **−50 c
  (bottom) to +50 c (top)**. The centre line is that note exactly in tune.
- **No units, labels, numbers or note names** anywhere on the graph.
- Visual guides as in the mockups: a solid centre line and dashed horizontal guide lines
  (e.g. every 12.5 c or 25 c; exact spacing decided in the spec).

### 4.2 Leading dot and trail

- The **current pitch** is a small **white circle**.
- The circle always sits at **80 % of the graph width** (horizontally fixed) and moves only up and
  down with the pitch.
- It leaves a **yellow trail** to its left showing where the pitch has been during the last
  **`PITCH_TRAIL_MS`** (default **1000 ms**). The trail spans from the left edge (oldest point) to
  the dot (newest), so `PITCH_TRAIL_MS` **sets the time scale of the X axis**: 80 % of the width =
  `PITCH_TRAIL_MS`. The remaining 20 % on the right stays empty.
- `PITCH_TRAIL_MS` is an internal constant in `src/config/constants.ts`, **not** a user setting.
  Changing it must only change the time scale; the dot stays at 80 %.

### 4.3 Switching notes (wrap-around)

- The Y axis always follows the closest semitone. When the pitch goes **below −50 c** it is now
  closer to the semitone below: the graph **re-centres on that note** and the dot appears near
  **+50 c**, still descending. Going above +50 c works the same way upwards.
- **The trail is drawn relative to the note the graph is centred on now.** Every reading keeps
  its real pitch, and the whole trail is redrawn around the current note. Readings that fall
  outside ±50 c of that note are off the graph (clipped at the top or bottom edge), so the line
  leaves through the edge instead of jumping from one edge to the other.
- So when the player goes back to a note they left earlier, the readings from that note that are
  still inside the last `PITCH_TRAIL_MS` **come back into view** at their original time position.
  Example (trail 1000 ms): Fa for 200 ms, then Mi for 500 ms, then back to Fa. After the return
  to Fa the graph shows, from left to right: the earlier 200 ms of Fa, a gap where Mi was (it is
  off the graph, below the bottom edge), and the current Fa reaching the dot. While on Mi, the
  graph showed the reverse: the Fa part above the top edge, off the graph, and only Mi visible.

### 4.4 Tolerance band

- A **faint grey band** centred on the closest note covers **±`TOLERANCE_CENTS`** (the existing
  constant, ±25 c today, i.e. half of the graph height). It changes size automatically if the
  constant changes.
- The band belongs to whichever note the graph is centred on: when the graph wraps to another
  note, the band now represents that note.

## 5. Hold progress and result

### 5.1 Filling

- While the pitch is **inside the band** (and above the microphone threshold), the band **fills
  with yellow from left to right**, in a shade clearly different from the trail (darker / more
  muted, as in `2-filling.png`).
- The fill reaches the full width after **`SUSTAIN_MS`** of continuous in-tune holding (the
  existing constant, 500 ms today), i.e. the fill mirrors the hold progress the app already uses
  to accept a note.
- Leaving the band (or going silent, or wrapping to another note) **resets the fill to empty**,
  just like the current sustain rule resets.

### 5.2 Result when the fill completes

Holding **any** note in tune for `SUSTAIN_MS` now produces a result, not only the expected one:

- **Right note** (the closest note is the expected note of the melody): the band turns **green**.
  The note is accepted exactly as today (box turns green, next note becomes active) and the
  **reveal overlay** is shown (section 6). The band stays green until the overlay is gone.
- **Wrong note** (any other note, including the right name in the wrong octave): the band turns
  **red**. The app remembers that this note is wrong **for the current note of the melody**:
  whenever the graph is centred on that note again, its band is **red** (no grey, no filling)
  until the current melody note is guessed. Several wrong notes can be marked red at the same
  time. Red marks are cleared **only** when the current note is guessed (or the exercise ends);
  "Repeat melody" keeps them.
- Once a band is red, holding that note longer does nothing more: it stays red.
- A red note does not reveal anything other than "this is not the one".

## 6. Reveal overlay

- When a note is guessed, a **large card** with the **note name** (same spelling as in the note
  box, e.g. "Fa#3") appears centred over the Training screen, with a green background
  (`5-overlay.png`).
- Everything behind it is **blurred and darkened**.
- It stays for **`NOTE_REVEAL_MS`** (default **500 ms**, internal constant, not a user setting),
  then disappears by itself.
- The graph behind it keeps the **green band** until the overlay is gone; then the band goes back
  to normal (grey) for the next note.
- While the overlay is shown, **microphone input is ignored**, so the tail of the note just
  played cannot start filling the next note. Listening for the next note starts when the overlay
  disappears.
- The **last note** of the melody shows the overlay too; the existing all-green
  `COMPLETE_PAUSE_MS` pause starts after it.
- Accessibility: the note name is announced (polite live region); with
  `prefers-reduced-motion` the overlay appears without animation.

## 7. When the graph is shown

- Visible on the **Training screen**, below the Repeat melody / Give up buttons (as in the
  mockups), sized to the same width as the note boxes row and usable at phone width.
- The graph is **always shown** on the Training screen (no layout jump), and time always keeps
  scrolling.
- It reacts to the microphone only while **listening** (the same phase in which notes can be
  matched today). The microphone is ignored during melody playback, the guard and the reveal
  overlay.
- With **no valid pitch** (silence, below threshold, low clarity, out of range, or microphone
  ignored) the **dot disappears** and no new trail is added. The existing trail keeps scrolling
  left and **disappears by itself** once it is older than `PITCH_TRAIL_MS`. For example, after
  pressing "Repeat melody" the trail is gone within `PITCH_TRAIL_MS` and the graph stays empty
  until the player plays again.
- The graph is decorative for screen readers (`aria-hidden`); the status line keeps working as
  today.

## 8. Out of scope

- Showing note names, cents numbers or any other units on the graph.
- Making `PITCH_TRAIL_MS`, `NOTE_REVEAL_MS`, `TOLERANCE_CENTS` or `SUSTAIN_MS` user settings.
- The graph on the Home screen (e.g. as part of "Test microphone").
- Any change to how the expected note is matched (tolerance, sustain time, threshold).
- Scoring, statistics or a history of wrong notes.
