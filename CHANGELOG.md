# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.3.0] - Released on 2026-10-09 by fer5899

### Added
- Settings button (gear, top right on every screen) that opens a Settings dialog. On phones the dialog is a bottom sheet. Changes apply immediately and are remembered across visits.
- Scale choice: Chromatic, scale groups such as "All majors", or any of 135 specific scales in 15 keys. Pick from a searchable list by solfège or English name, with b and # accepted.
- Melody length setting: 3 to 8 notes (default 5).
- Max interval setting: the largest distance in semitones between consecutive notes.
- Note duration setting: 250 to 1500 ms (default 1000 ms).
- Playback volume setting: 0 to 100% (default 50%).
- "Reset to defaults" in Settings.
- The microphone threshold is remembered across visits. Invalid saved settings fall back to defaults.
- During training, Settings shows only note duration and volume. A volume change applies to the melody that is playing. A note duration change applies from the next "Repeat melody", without restarting the exercise.

### Changed
- The default scale is Do major (it was chromatic), and the default max interval is 12 semitones (it was 18).
- Notes of a specific scale are spelled by that scale's key signature, for example Si♭ in Fa major. Chromatic exercises keep the previous spelling.
- Note boxes wrap onto rows on narrow screens instead of staying in a fixed 5-column grid.

## [0.2.0] - Released on 2026-10-08 by fer5899

### Changed
- Melody notes now play for 1 second each instead of 0.5 s, so the melody is easier to follow.
- The melody plays louder by default.

## [0.1.0] - Released on 2026-10-03 by fer5899

### Added
- B♭ trumpet ear-training web app, published to GitHub Pages.
- Home screen with a "Start training" button and a "Test microphone" level meter. The meter has an adjustable threshold slider that sets the input level counted as playing.
- Training screen that plays a random 5-note melody within the trumpet's written range (F#3–C5) using a brass-like synth tone.
- Live pitch detection through the microphone. Each note box turns green once its note is played in tune (±25 cents) and held for 0.5 s.
- Note names in written pitch using Latin solfège, with sharps or flats chosen to suit the melody.
- "Repeat melody" and "Give up" controls, plus a status line that shows the current training phase.
- Clear error messages when the microphone is denied, missing or busy, or when the browser has no Web Audio support. Only one error is shown at a time.
- The "Test microphone" toggle is disabled while training starts, and it is switched off when training begins.
