# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

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
