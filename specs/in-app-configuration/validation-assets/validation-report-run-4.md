# Validation Report — Run 4 (post /t-review #2)

**Date:** 2026-10-09 19:37:17 UTC  
**Branch:** in-app-configuration @ 7ebcc3c  
**Checklist:** [validation.md](../validation.md) — "Human Validation — prd2.md" items 1–51 (item 51 re-runs Part 1 steps 1–12 and 15) and "Appendix B: Re-validation after /t-review #2" items 52–60  
**Previous run:** [validation-report-run-3.md](validation-report-run-3.md)  
**Scripts:** `specs/in-app-configuration/validation-run-4/run.sh` + `validate.mjs` (Playwright Chromium, fake mic = 440 Hz tone = written Si4; fresh dev 5173, e2e-mode dev 5174, preview 4173)

**Summary:** 59 passed, 0 failed, 1 skipped (of 60 items: 1–51 re-run + Appendix B 52–60)

## Re-run of original checks

### Gear button and dialog

- ✅ **1. Gear button top-right above the title, accessible name "Settings"** — Gear at (900, 24) 44×44 px, bottom 68 ≤ title "Trumpet Trainer" top 76; right edge 944 = content column right 944 (viewport 1280, column max 40rem). aria-label "Settings", aria-haspopup "dialog", AX tree: button "Settings". No title attribute (no native hover tooltip); the accessible name comes from aria-label.
  Evidence: [01-gear.json](run-4/api/01-gear.json)

  ![01-home-gear](run-4/screenshots/01-home-gear.png)

  ![02-home-gear-hover](run-4/screenshots/02-home-gear-hover.png)

- ✅ **2. Dialog contents and defaults; no Save; scale list closed** — Modal (:modal true) titled "Settings", backdrop rgba(0, 0, 0, 0.45). Scale "Do major", Melody length "5 notes", Max interval "12 semitones", Note duration "1000 ms", Playback volume "50%". Buttons: Reset to defaults, Close (no Save). Scale combobox aria-expanded="false", 0 listbox in the DOM.
  Evidence: [02-dialog.json](run-4/api/02-dialog.json)

  ![03-dialog-home-defaults](run-4/screenshots/03-dialog-home-defaults.png)

- ✅ **3. Esc closes; focus back on the gear** — Dialog closed on Esc; focus on BUTTON aria-label "Settings", :focus-visible true, outline solid 3px.
  Evidence: [03-esc-focus.json](run-4/api/03-esc-focus.json)

  ![04-esc-focus-on-gear](run-4/screenshots/04-esc-focus-on-gear.png)

- ✅ **4. Close closes; focus back on the gear** — Dialog closed by Close; focus on BUTTON aria-label "Settings" (:focus-visible false — after a mouse click Chromium may not show the ring).

  ![05-close-focus-on-gear](run-4/screenshots/05-close-focus-on-gear.png)

- ✅ **5. Click on the dimmed backdrop keeps the dialog open** — Clicked (5, 5) outside the dialog rect (x 384–896, y 120–680); after 500 ms the dialog is still open.

  ![06-backdrop-click-still-open](run-4/screenshots/06-backdrop-click-still-open.png)

- ✅ **6. Tab cycles inside the dialog** — Initial focus: (dialog). 16 × Tab: Scale → Melody length → Max interval → Note duration → Playback volume → Reset to defaults → Close → (body) → Scale → Melody length → Max interval → Note duration → Playback volume → Reset to defaults → Close → (body). Never on an element behind the dialog. 2 stop(s) on body/dialog itself (Chromium moves focus out to the browser chrome / document between cycles; no page element behind the dialog receives focus).
  Evidence: [06-tab-sequence.json](run-4/api/06-tab-sequence.json)

  ![07-tab-cycle-end](run-4/screenshots/07-tab-cycle-end.png)

- ✅ **7. Start / Test microphone / gear disabled while the mic permission is pending** — Browser permission prompt simulated by an init script delaying getUserMedia by 2 s (the fake-UI flag auto-accepts the real prompt). Right after the click: Start disabled true, Test microphone disabled true, gear disabled true; still disabled 1 s later. Training screen shown → gear disabled false. The real prompt UI itself: manual.
  Evidence: [07-permission-pending.json](run-4/api/07-permission-pending.json)

  ![29-permission-pending-disabled](run-4/screenshots/29-permission-pending-disabled.png)

  ![30-permission-granted-training](run-4/screenshots/30-permission-granted-training.png)

### Sliders (Home mode)

- ✅ **8. Melody length: 3 notes … 8 notes, step 1** — min 3, max 8, step 1. Home → "3 notes", End → "8 notes"; ArrowRight sweep (6 values): 3 notes, 4 notes, 5 notes, 6 notes, 7 notes, 8 notes; aria-valuetext equals the visible text at every step. (Keyboard stepping stands in for dragging: both set the same input value.)
  Evidence: [8-melody-length-sweep.json](run-4/api/8-melody-length-sweep.json)

  ![09-melody-length-max](run-4/screenshots/09-melody-length-max.png)

- ✅ **9. Note duration: 250 ms … 1500 ms, step 50** — min 250, max 1500, step 50. Home → "250 ms", End → "1500 ms"; ArrowRight sweep (26 values): 250 ms, 300 ms, 350 ms, 400 ms, 450 ms, 500 ms, 550 ms, 600 ms, 650 ms, 700 ms, 750 ms, 800 ms, 850 ms, 900 ms, 950 ms, 1000 ms, 1050 ms, 1100 ms, 1150 ms, 1200 ms, 1250 ms, 1300 ms, 1350 ms, 1400 ms, 1450 ms, 1500 ms; aria-valuetext equals the visible text at every step. (Keyboard stepping stands in for dragging: both set the same input value.)
  Evidence: [9-note-duration-sweep.json](run-4/api/9-note-duration-sweep.json)

  ![10-note-duration-max](run-4/screenshots/10-note-duration-max.png)

- ✅ **10. Playback volume: 0% … 100%, step 5** — min 0, max 100, step 5. Home → "0%", End → "100%"; ArrowRight sweep (21 values): 0%, 5%, 10%, 15%, 20%, 25%, 30%, 35%, 40%, 45%, 50%, 55%, 60%, 65%, 70%, 75%, 80%, 85%, 90%, 95%, 100%; aria-valuetext equals the visible text at every step. (Keyboard stepping stands in for dragging: both set the same input value.)
  Evidence: [10-volume-sweep.json](run-4/api/10-volume-sweep.json)

  ![11-volume-max](run-4/screenshots/11-volume-max.png)

- ✅ **11. Max interval with Chromatic: 1 semitone … 18 semitones** — Scale Chromatic: min 1, max 18; fully left "1 semitone" (singular), fully right "18 semitones"; sweep 1 semitone, 2 semitones, 3 semitones, 4 semitones, 5 semitones, 6 semitones, 7 semitones, 8 semitones, 9 semitones, 10 semitones, 11 semitones, 12 semitones, 13 semitones, 14 semitones, 15 semitones, 16 semitones, 17 semitones, 18 semitones. Reset to defaults afterwards.
  Evidence: [11-max-interval-sweep.json](run-4/api/11-max-interval-sweep.json)

  ![12-max-interval-chromatic-min](run-4/screenshots/12-max-interval-chromatic-min.png)

  ![13-max-interval-chromatic-max](run-4/screenshots/13-max-interval-chromatic-max.png)

- ✅ **12. Each slider has a label and aria-valuetext = visible value** — Melody length: role slider by name ✓, aria-valuetext "5 notes" = visible "5 notes", AX name "Melody length"; Max interval: role slider by name ✓, aria-valuetext "12 semitones" = visible "12 semitones", AX name "Max interval"; Note duration: role slider by name ✓, aria-valuetext "1000 ms" = visible "1000 ms", AX name "Note duration"; Playback volume: role slider by name ✓, aria-valuetext "50%" = visible "50%", AX name "Playback volume". Labels checked with Playwright role queries and the Chromium accessibility tree (CDP); aria-valuetext checked on the DOM (what the DevTools Accessibility pane lists under "ARIA attributes"). **Caveat:** Chromium's *computed* AX value/valuetext for these native range inputs is the number, not the aria-valuetext (Melody length → "5", Max interval → "12", Note duration → "1000", Playback volume → "50"); confirm with NVDA / VoiceOver that "5 notes" etc. is announced. Screen-reader speech itself: manual.
  Evidence: [12-slider-a11y.json](run-4/api/12-slider-a11y.json)

  ![08-sliders-a11y-defaults](run-4/screenshots/08-sliders-a11y-defaults.png)

### Scale combobox

- ✅ **13. Click: text selected, list (≈15rem) opens, Do major highlighted and in view** — Value "Do major" selected (0–8); list below the field inside the dialog, 146 options, max-height 240px (15 rem), rendered height 240 px, overflow-y auto, scrollable. First options: Chromatic, All scales, All majors, All natural minors, All dorian, All phrygian, All lydian, All mixolydian, All locrian, All major pentatonics, All minor pentatonics, Do major, Sol major …; highlighted (aria-selected / aria-activedescendant): "Do major" at index 11, in view (list scrollTop 248). Visual highlight: see screenshot.
  Evidence: [13-combobox-open.json](run-4/api/13-combobox-open.json)

  ![14-combobox-open-do-major](run-4/screenshots/14-combobox-open-do-major.png)

- ✅ **14. "bb major" narrows to Si♭ major / Si♭ major pentatonic** — Typed "bb major": options ["Si♭ major","Si♭ major pentatonic"], highlighted "Si♭ major".

  ![15-combobox-bb-major](run-4/screenshots/15-combobox-bb-major.png)

- ✅ **15. Enter selects; list closes; dialog stays open** — After Enter: list closed, field "Si♭ major", dialog open.

  ![16-combobox-enter-si-flat-major](run-4/screenshots/16-combobox-enter-si-flat-major.png)

- ✅ **16. "xyz": one greyed "No matching scales" row; click / Enter do nothing** — "xyz" → single row "No matching scales" (aria-disabled, colour rgb(107, 114, 128) vs text rgb(31, 35, 40), cursor default). Click on it and Enter: list stays open, field stays "xyz", stored scaleId stays major:si-flat.
  Evidence: [16-no-matches.json](run-4/api/16-no-matches.json)

  ![17-combobox-no-matches](run-4/screenshots/17-combobox-no-matches.png)

- ✅ **17. Esc closes only the list and reverts; second Esc closes the dialog** — First Esc: list closed, field "Si♭ major", dialog open. Second Esc: dialog closed.

  ![18-combobox-esc-reverted](run-4/screenshots/18-combobox-esc-reverted.png)

- ✅ **18. "sol" + Tab (or click elsewhere) reverts** — "sol" showed 19 options (Sol major, Sol♭ major, Sol# minor, Sol minor …). Tab → list closed, field "Si♭ major", focus on "Melody length". Again "sol" + click on the dialog title → list closed, field "Si♭ major". Stored scaleId major:si-flat (unchanged).

  ![19-combobox-sol-reverted](run-4/screenshots/19-combobox-sol-reverted.png)

- ✅ **19. ArrowDown / ArrowUp: one at a time, no wrap, scrolls; Enter selects** — Start on "Si♭ major" (index 20); ArrowDown×3 / ArrowUp×3 trail 20 → 21 → 22 → 23 → 22 → 21 → 20. 25× ArrowUp stops at index 0 "Chromatic" (no wrap); 150× ArrowDown stops at 145 "La♭ minor pentatonic" (no wrap; list scrollTop 5608, option in view). ArrowUp → "Mi♭ minor pentatonic", Enter selects "Mi♭ minor pentatonic". (Home/End are not combobox keys here: the field is a text input.)
  Evidence: [19-arrows.json](run-4/api/19-arrows.json)

  ![20-combobox-arrow-last](run-4/screenshots/20-combobox-arrow-last.png)

- ✅ **20. "f# dorian" + Enter; "sib" + mouse click; focus stays in the field** — "f# dorian" + Enter → "Fa# dorian". "sib" listed Si♭ major, Si♭ minor, Si♭ dorian, Si♭ phrygian, Si♭ lydian, Si♭ mixolydian, Si♭ locrian, Si♭ major pentatonic, Si♭ minor pentatonic; mouse click → "Si♭ major pentatonic", focus in the field: true, list closed: true. Stored scaleId major-pentatonic:si-flat.

  ![21-combobox-mouse-click](run-4/screenshots/21-combobox-mouse-click.png)

### Scale and max interval

- ✅ **21. Do major, max 2 → Do major pentatonic: 3 semitones, minimum 3** — Do major: max interval 2 (min 2). Do major pentatonic → "3 semitones", slider min 3; Home keeps 3.

  ![22-max-interval-pentatonic-3](run-4/screenshots/22-max-interval-pentatonic-3.png)

- ✅ **22. Chromatic: stays 3, minimum 1** — Chromatic: value stays "3 semitones", min 1; the slider can go down to "1 semitone".

  ![23-max-interval-chromatic](run-4/screenshots/23-max-interval-chromatic.png)

- ✅ **23. All scales: minimum 3** — All scales: slider min 3, value "3 semitones" (raised from 1 by selectScale).

  ![24-max-interval-all-scales](run-4/screenshots/24-max-interval-all-scales.png)

### Reset to defaults

- ✅ **24. Reset to defaults restores the five defaults; threshold stays −25 dB** — Changed to {"scale":"Fa major","Melody length":"7 notes","Max interval":"9 semitones","Note duration":"500 ms","Playback volume":"80%"} and threshold "Threshold: −25 dB". Reset → {"scale":"Do major","Melody length":"5 notes","Max interval":"12 semitones","Note duration":"1000 ms","Playback volume":"50%"}; threshold label still "Threshold: −25 dB" (stored -25).

  ![25-reset-defaults](run-4/screenshots/25-reset-defaults.png)

### Persistence

- ✅ **25. All six values restored after a reload ("All majors")** — After reload: {"scale":"All majors","Melody length":"7 notes","Max interval":"9 semitones","Note duration":"750 ms","Playback volume":"80%"}; "Threshold: −30 dB" (slider value -30).

  ![26-persistence-after-reload](run-4/screenshots/26-persistence-after-reload.png)

- ✅ **26. localStorage contents** — JSON.parse(localStorage['trumpet-trainer.settings.v1']) = `{"noteDurationMs":750,"melodyLength":7,"volume":0.8,"maxInterval":9,"scaleId":"group:major"}`; localStorage['trumpet-trainer.thresholdDb'] = `"-30"`.
  Evidence: [26-local-storage.json](run-4/api/26-local-storage.json)

- ✅ **27. Invalid stored data → defaults and "Threshold: −40 dB"** — App loaded normally (Start enabled true); dialog {"scale":"Do major","Melody length":"5 notes","Max interval":"12 semitones","Note duration":"1000 ms","Playback volume":"50%"}; "Threshold: −40 dB". localStorage cleared afterwards.

  ![27-invalid-storage-defaults](run-4/screenshots/27-invalid-storage-defaults.png)

- ✅ **28. Blocked storage: works with defaults, changes apply in-visit, gone after reload, no console errors** — Blocked storage emulated by an init script whose window.localStorage getter throws SecurityError (as Chrome does with site data blocked); access → SecurityError, getBrowserStorage() → null. Defaults on load; changes applied during the visit {"scale":"Do major","Melody length":"4 notes","Max interval":"12 semitones","Note duration":"500 ms","Playback volume":"30%"}; exercise ?melody=71,71,71 played 3 boxes at [0.5,0.5] s/note (the in-memory 500 ms) and completed. After reload: {"scale":"Do major","Melody length":"5 notes","Max interval":"12 semitones","Note duration":"1000 ms","Playback volume":"50%"}, "Threshold: −40 dB". Console errors: 0 (0 incl. favicon). Incognito window: not separately automated (fresh context = empty storage).
  Evidence: [28-blocked-storage.json](run-4/api/28-blocked-storage.json)

  ![31-blocked-storage-training](run-4/screenshots/31-blocked-storage-training.png)

  ![32-blocked-storage-after-reload](run-4/screenshots/32-blocked-storage-after-reload.png)

### Melody length, scale and spelling (real exercises)

- ✅ **29. Melody length 3: 3 boxes, "Your turn: play note 1 of 3"** — Melody length 3 (note duration 250 ms to save time): 3 boxes, first listening status "Your turn: play note 1 of 3", played written MIDI [62,65,69]; Give up → Home (listening).

  ![33-length-3-your-turn](run-4/screenshots/33-length-3-your-turn.png)

- ✅ **30. Melody length 8: 8 boxes in one centered row** — 1280 × 800: 8 boxes, 8 on one row (y 126), gaps left 4.0 / right 4.0 px (centered). Give up → Home (listening).

  ![34-length-8-one-row](run-4/screenshots/34-length-8-one-row.png)

- ✅ **31. Fa major: notes in key, Si♭ never "La#"** — 4 real exercises (notes read from the synth's oscillator frequencies): Fa4 Mi4 Sol3 Si♭3 Si♭4 La4 Do4 La3 | Si♭4 Sol4 Sol4 Si♭3 Sol4 Sol3 Sol4 La4 | Do5 Do5 Sol4 Si♭4 Sol4 Si♭3 La3 Re4 | La4 Fa4 Sol4 Sol4 Si♭4 Mi4 Do4 Si♭3 — all in Fa major, 4 Si♭ shown as "Si♭4", no "La#". Module sample of 300: 447 Si♭, 0 La#, 0 out-of-key. Names come from the app's spellExercise (the UI only shows a name once a note is played correctly; the 440 Hz fake mic cannot play Fa major notes).
  Evidence: [31-fa-major.json](run-4/api/31-fa-major.json)

  ![35-fa-major-exercise](run-4/screenshots/35-fa-major-exercise.png)

- ✅ **32. Sol♭ major: written Si (71) shown as "Do♭5"** — After 2 exercise(s) one started with written Si (71); the fake mic (concert A4 = written 71) played it and box 1 turned green showing "Do♭5". Module spellInKey([71], −6) = "Do♭5".
  Evidence: [32-sol-flat-major.json](run-4/api/32-sol-flat-major.json)

  ![36-sol-flat-major-do-flat-5](run-4/screenshots/36-sol-flat-major-do-flat-5.png)

- ✅ **33. All majors: keys vary per exercise; Repeat replays the same notes** — 5 real exercises, candidate major keys from the played notes: [major:fa, major:si-flat] [major:fa, major:si-flat] [major:do-sharp, major:re-flat] [major:mi, major:si, major:fa-sharp, major:sol-flat, major:do-flat] [major:sol, major:re] (different keys across exercises: true). Repeat in exercise 1: first [70,62,67,58,69,72,72,62] vs repeat [70,62,67,58,69,72,72,62] (identical: true). Module: 15 distinct keys in 100 group:major exercises.
  Evidence: [33-all-majors.json](run-4/api/33-all-majors.json)

  ![37-all-majors-after-repeat](run-4/screenshots/37-all-majors-after-repeat.png)

- ✅ **34. Chromatic, max interval 1: steps ≤ 1 semitone** — 3 real exercises: 58,59,60,59,58,58,59,60 | 66,65,65,66,67,66,66,65 | 61,62,61,62,63,62,63,64; steps 1,1,1,1,0,1,1 | 1,0,1,1,1,0,1 | 1,1,1,1,1,1,1 (all ≤ 1). Module: largest step over 200 exercises = 1.
  Evidence: [34-chromatic-interval-1.json](run-4/api/34-chromatic-interval-1.json)

  ![38-chromatic-interval-1](run-4/screenshots/38-chromatic-interval-1.png)

### Volume and note duration during training

- ✅ **35. Training dialog: only Note duration + Playback volume + hint; playback continues** — ?melody=71,60,60,60 at 1500 ms / 50%. Gear opened while "Listen…": sliders ["Note duration","Playback volume"], no Scale field, hint "Other settings can be changed on the home screen.". 0.8 s later status still "Listen…"; the 4-note playback (spacing [1.5,1.5,1.5] s) was not stopped (2 playSequence call(s) incl. StrictMode's cancelled one).
  Evidence: [35-training-dialog.json](run-4/api/35-training-dialog.json)

  ![39-training-dialog](run-4/screenshots/39-training-dialog.png)

- ✅ **36. Volume 100% then 0% applied live to the playing note; no restart** — Master gain: cancelScheduledValues(0.992), setValueAtTime(0.5, 0.992), linearRampToValueAtTime(1, 1.012), cancelScheduledValues(1.4), setValueAtTime(1, 1.4), linearRampToValueAtTime(0, 1.42). Ramp to 1 at +0.92 s and to 0 at +1.33 s into the melody (last note ends +6.00 s), each 20.0 / 20.0 ms; 0 new oscillators, playback not stopped (no restart). Audible smoothness / silence at 0%: manual ear check.
  Evidence: [36-live-volume.json](run-4/api/36-live-volume.json)

  ![40-training-volume-0](run-4/screenshots/40-training-volume-0.png)

- ✅ **37. Note duration 250 ms applies on Repeat at the new volume; progress kept** — Duration set to 250 ms, dialog closed. Box states before Repeat ["done","active","pending","pending"], after ["done","active","pending","pending"] ("Your turn: play note 2 of 4"). Repeat playback: 4 notes, spacing [0.25,0.25,0.25] s, master gain 0 (0% from step 36). "Plays fast" audibly: manual.
  Evidence: [37-repeat.json](run-4/api/37-repeat.json)

  ![41-repeat-progress-kept](run-4/screenshots/41-repeat-progress-kept.png)

- ✅ **38. Listening continues with the dialog open (box turns green behind it)** — ?melody=71,60,60, dialog opened during "Listen…" and left open: box 1 turned done ("Si4") while the dialog was open (true); status "Your turn: play note 2 of 3". Real trumpet: manual.

  ![42-green-behind-dialog](run-4/screenshots/42-green-behind-dialog.png)

- ✅ **39. Training Reset: 1000 ms / 50%; Home-only settings unchanged** — Training dialog before {"scale":null,"Note duration":"1200 ms","Playback volume":"30%"} → Reset → {"scale":null,"Note duration":"1000 ms","Playback volume":"50%"}. Back Home: {"scale":"Sol major","Melody length":"4 notes","Max interval":"7 semitones","Note duration":"1000 ms","Playback volume":"50%"} (scale, length, max interval unchanged).

  ![43-training-reset](run-4/screenshots/43-training-reset.png)

  ![44-home-after-training-reset](run-4/screenshots/44-home-after-training-reset.png)

- ✅ **40. Dialog left open through completion switches to the five Home controls** — During training the open dialog showed ["Note duration","Playback volume"]; after all 3 notes completed and the app returned Home it stayed open with Scale "Sol major" + ["Melody length","Max interval","Note duration","Playback volume"].

  ![45-dialog-open-after-completion](run-4/screenshots/45-dialog-open-after-completion.png)

### Deterministic ?melody= (e2e mode, port 5174)

- ✅ **41. ?melody=71,60,72 → 3 boxes regardless of Melody length** — Melody length 6; ?melody=71,60,72 → 3 boxes, played [71,60,72].

  ![46-melody-3-boxes](run-4/screenshots/46-melody-3-boxes.png)

- ✅ **42. ?melody= with 8 notes → 8 boxes** — ?melody=71×8 → 8 boxes.

  ![47-melody-8-boxes](run-4/screenshots/47-melody-8-boxes.png)

- ✅ **43. 2 and 9 notes are ignored (Melody length setting used)** — Melody length 4. ?melody= with 2 notes → 4 boxes, random melody [55,67,55,67]; ?melody= with 9 notes → 4 boxes, random melody [69,62,59,55].

  ![48-melody-ignored-2](run-4/screenshots/48-melody-ignored-2.png)

  ![49-melody-ignored-9](run-4/screenshots/49-melody-ignored-9.png)

- ✅ **44. Fa major + ?melody=65,70,72 → Fa4 Si♭4 Do5; Chromatic / All scales contextual** — Fa major + ?melody=65,70,72: 3 boxes, played [65,70,72]; spellExercise(getTestExercise(id)) in the e2e page (what the reducer shows): Fa major ["Fa4","Si♭4","Do5"], Chromatic ["Fa4","La#4","Do5"], All scales ["Fa4","La#4","Do5"] (contextual: rising → sharp). The 440 Hz fake mic cannot play 65/70/72, so those names are not observable in boxes; UI cross-check with ?melody=71,71,71 (completed by the fake mic): Sol♭ major box "Do♭5", Chromatic box "Si4".
  Evidence: [44-melody-spelling.json](run-4/api/44-melody-spelling.json)

  ![50-fa-major-melody-65-70-72](run-4/screenshots/50-fa-major-melody-65-70-72.png)

  ![51-melody-71-sol-flat-major](run-4/screenshots/51-melody-71-sol-flat-major.png)

  ![52-melody-71-chromatic](run-4/screenshots/52-melody-71-chromatic.png)

### Layout

- ✅ **45. 375 × 812: 5 + 3 centered, same size, no horizontal scroll** — 375 × 812: rows 5 + 3, all boxes 60.0 px square, row gaps 5.5/5.5, 73.5/73.5 (centered), scrollWidth 375 ≤ 375.
  Evidence: [45-layout-375.json](run-4/api/45-layout-375.json)

  ![53-layout-375](run-4/screenshots/53-layout-375.png)

- ✅ **46. 320 px: 4 + 4, same size, no horizontal scroll** — 320 px: rows 4 + 4, box 60.0 px (375 px: 60.0 px), scrollWidth 320 ≤ 320.

  ![54-layout-320](run-4/screenshots/54-layout-320.png)

- ✅ **47. 375 px: dialog is a bottom sheet with rounded top corners; scrolls when taller** — 375 × 812: dialog x 0, width 375, bottom 812 = viewport height; radii 12px 12px 0px 0px (rounded top only); overflow-y auto. With the scale list open at 812 px: scrollHeight 804 / clientHeight 780 (scrolls); at 375 × 600: 804/568, scrollTop after scrolling 236.
  Evidence: [47-dialog-sheet.json](run-4/api/47-dialog-sheet.json)

  ![55-dialog-sheet-375](run-4/screenshots/55-dialog-sheet-375.png)

  ![56-dialog-sheet-375-list-open](run-4/screenshots/56-dialog-sheet-375-list-open.png)

  ![57-dialog-sheet-375x600-scrolled](run-4/screenshots/57-dialog-sheet-375x600-scrolled.png)

- ⏭️ **48. Real phones (Android Chrome, iOS Safari) and desktop Firefox; monochrome gear** — Manual: real devices (Android Chrome, iOS Safari via HTTPS) and desktop Firefox are not automated. Automated part: the gear text is ["U+2699","U+FE0E"] (U+2699 GEAR + U+FE0E VARIATION SELECTOR-15 = text presentation, so it should render monochrome), inside an aria-hidden="true" span, font-family system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; Chromium rendering in the screenshot.

  ![28-gear-glyph](run-4/screenshots/28-gear-glyph.png)

### Production build

- ✅ **49. Preview: setting restored after reload; ?melody= ignored** — http://localhost:4173/trumpet-trainer/: Melody length 6 + Note duration 600 ms restored after reload ({"scale":"Do major","Melody length":"6 notes","Max interval":"12 semitones","Note duration":"600 ms","Playback volume":"50%"}). ?melody=71,71,71 → 6 boxes, random melody [55,67,67,67,69,64] (ignored in the production build).

  ![58-preview-restored](run-4/screenshots/58-preview-restored.png)

  ![59-preview-melody-ignored](run-4/screenshots/59-preview-melody-ignored.png)

### Regression

- ✅ **50. lint, typecheck, unit tests (1297), script tests (32), build, e2e (10)** — `npm run lint` exit 0, `npm run typecheck` exit 0, `npm test` exit 0, `npm run test:scripts` exit 0, `npm run build` exit 0, `npm run test:e2e` exit 0. Unit tests: 1297 passed, 0 failed (expected 1297); script tests: 32 passed, 0 failed (expected 32); e2e: 10 passed, 0 failed (expected 10). Pass criteria: all six commands exit 0 and the e2e count is 10 (unit / script counts are recorded, a mismatch is noted).
  Evidence: [50-lint.txt](run-4/output/50-lint.txt), [50-typecheck.txt](run-4/output/50-typecheck.txt), [50-unit-tests.txt](run-4/output/50-unit-tests.txt), [50-script-tests.txt](run-4/output/50-script-tests.txt), [50-build.txt](run-4/output/50-build.txt), [50-e2e.txt](run-4/output/50-e2e.txt)

- ✅ **51. Part 1 steps 1–12 and 15 re-run** — 13/13 Part 1 steps pass (1–12 and 15, run in the 5173 dev-server page as in Runs 1–2; steps 13–14 are superseded by items 29–44).
  - ✅ Part 1 step 1. Removed and new constants — Got `[undefined,undefined,undefined,1000,0.5,"major:do"]` ([p1-01-constants.json](run-4/api/p1-01-constants.json))
  - ✅ Part 1 step 2. SCALE_OPTIONS has 146 options — Got `146` ([p1-02-scale-options-length.json](run-4/api/p1-02-scale-options-length.json))
  - ✅ Part 1 step 3. First 11 option names (chromatic + 10 groups) — Got `["Chromatic","All scales","All majors","All natural minors","All dorian","All phrygian","All lydian","All mixolydian","All locrian","All major pentatonics","All minor pentatonics"]` ([p1-03-first-11-names.json](run-4/api/p1-03-first-11-names.json))
  - ✅ Part 1 step 4. Locrian tonic names in key-signature order — Got `"Si Fa# Do# Sol# Re# La# Mi# Si# Mi La Re Sol Do Fa Si♭"` ([p1-04-locrian-tonics.json](run-4/api/p1-04-locrian-tonics.json))
  - ✅ Part 1 step 5. searchScaleOptions (English letters, b/#) — Got `[["Si♭ major","Si♭ major pentatonic"],["Fa# dorian"]]` ([p1-05-search.json](run-4/api/p1-05-search.json))
  - ✅ Part 1 step 6. minMaxInterval for chromatic / major / pentatonic group / all — Got `[1,2,3,3]` ([p1-06-min-max-interval.json](run-4/api/p1-06-min-max-interval.json))
  - ✅ Part 1 step 7. spellInKey (Si#3, Mi#4, Do♭5) — Got `[["Si#3","Mi#4","Do#4"],["Sol♭4","Do♭5","Si♭4"]]` ([p1-07-spell-in-key.json](run-4/api/p1-07-spell-in-key.json))
  - ✅ Part 1 step 8. generateExercise worked example (scripted rng) — Got `[[55,62,72],"major:do"]` ([p1-08-generate-exercise-worked-example.json](run-4/api/p1-08-generate-exercise-worked-example.json))
  - ✅ Part 1 step 9. Random group:major exercises fit their key, steps ≤ 2 — Exact expression: `major:mi-flat Si♭4 La♭4 La♭4 La♭4 Sol4 Fa4 Mi♭4 Mi♭4`, `major:re La3 La3 La3 Si3 Si3 Do#4 Re4 Mi4`, `major:sol Sol3 La3 Si3 Si3 Do4 Do4 Re4 Do4`, `major:fa Do4 Re4 Mi4 Mi4 Mi4 Mi4 Fa4 Mi4`, `major:do-sharp Fa#3 Fa#3 Sol#3 La#3 Si#3 Si#3 Si#3 Si#3`; a second sample of 5 checked note by note (major scale, in key, |step| ≤ 2, names map back to MIDI). ([p1-09-group-major-check.json](run-4/api/p1-09-group-major-check.json))
  - ✅ Part 1 step 10. normalizeSettings field-by-field validation — Got `{"noteDurationMs":750,"melodyLength":5,"volume":0.5,"maxInterval":12,"scaleId":"major:fa"}` ([p1-10-normalize-settings.json](run-4/api/p1-10-normalize-settings.json))
  - ✅ Part 1 step 11. Storage adapter round-trip across a reload — After page.reload(): `[7,-35]` (expected `[7,-35]`). ([p1-11-storage-round-trip.json](run-4/api/p1-11-storage-round-trip.json))
  - ✅ Part 1 step 12. Invalid stored JSON falls back to defaults — Returned `{"noteDurationMs":1000,"melodyLength":5,"volume":0.5,"maxInterval":12,"scaleId":"major:do"}` without throwing; localStorage cleared (length 0). ([p1-12-invalid-json-defaults.json](run-4/api/p1-12-invalid-json-defaults.json))
  - ✅ Part 1 step 15. setVolume mid-melody ramps the master gain — AudioContext "running". linearRampToValueAtTime(1) issued 2.011 s after playSequence, ramp length 20.0 ms; master initial gain 0.2. Audible smoothness: manual. ([p1-15-set-volume-audio-log.json](run-4/api/p1-15-set-volume-audio-log.json))

## Appendix checks

### Appendix B: Re-validation after /t-review #2

Item 57 counts item 50's `npm run test:e2e` as its first run; run.sh runs it twice more right after item 50 (servers stopped, port 5173 freed between runs).

- ✅ **52. Press on the list padding / scrollbar keeps the list open and the input focused; click still selects** — List box 404–861 × 161–401, border-top 2px, padding-top 4px, scrollbar 15px. Held the mouse 300 ms at the top padding (625, 165.0; elementFromPoint = UL = the listbox), released; then pressed the scrollbar at (851.5, 187) and dragged 60 px down (list scrollTop 0 → 1840). Throughout: list visible, activeElement = Scale input, aria-expanded="true", field "Do major", stored settings unchanged (none). Typing " pent" filtered 146 → 1 options (Do major pentatonic); Esc reverted to "Do major". Clicking "Sol major" selected it (field "Sol major", stored major:sol), focus stayed on the input (true), list closed. Reset to defaults + localStorage cleared afterwards.
  Evidence: [52-listbox-mousedown.json](run-4/api/52-listbox-mousedown.json)

  ![61-b52-after-padding-press](run-4/screenshots/61-b52-after-padding-press.png)

  ![62-b52-after-scrollbar-drag](run-4/screenshots/62-b52-after-scrollbar-drag.png)

  ![63-b52-typing-filters](run-4/screenshots/63-b52-typing-filters.png)

  ![64-b52-option-click-selected](run-4/screenshots/64-b52-option-click-selected.png)

- ✅ **53. Opening the dialog focuses the <dialog> (autofocus); Scale stays collapsed, no listbox ever rendered** — Fresh reload, gear opened twice. Immediately (first animation frame with dialog.open) and 600 ms later: document.activeElement.tagName = DIALOG / DIALOG, Scale aria-expanded="false", 0 listbox in the DOM, <dialog autofocus> true. A MutationObserver + focusin log installed before any page script saw 0 listbox insertion(s), 0 aria-expanded="true" change(s) and focus moves ["BUTTON","INPUT","DIALOG"] (no flash). Chromium AX tree focused node: ["dialog \"Settings\""]. Screen-reader announcement (NVDA / VoiceOver) itself: not automated (manual); the AX tree is what they read. **Observation (not a checklist criterion):** Chromium's showModal() still focuses the Scale input first despite `<dialog autofocus>`; el.focus() then moves focus to the dialog in the same task (open #1: focusin on the Scale input 0.6 ms before the dialog took focus; open #2: focusin on the Scale input 0.7 ms before the dialog took focus). React batches the input's open + blur-close, so no listbox renders and aria-expanded never becomes "true", but a screen reader may briefly register the combobox.
  Evidence: [53-dialog-autofocus.json](run-4/api/53-dialog-autofocus.json)

  ![60-b53-dialog-focused](run-4/screenshots/60-b53-dialog-focused.png)

- ✅ **54. "xyz" → "No matching scales", Enter does nothing; "sol" activates Sol major, Enter selects it** — "xyz" → 1 row "No matching scales", no aria-activedescendant; Enter → field "xyz", list open true, stored settings unchanged (as item 16). Cleared (146 options), typed "sol" → 19 options, active index 0 "Sol major" (aria-activedescendant :r5:-option-0); Enter → field "Sol major", list closed, stored scaleId major:sol. Reset + localStorage cleared afterwards.
  Evidence: [54-xyz-sol.json](run-4/api/54-xyz-sol.json)

  ![65-b54-xyz-no-matches](run-4/screenshots/65-b54-xyz-no-matches.png)

  ![66-b54-sol-first-active](run-4/screenshots/66-b54-sol-first-active.png)

  ![67-b54-sol-major-selected](run-4/screenshots/67-b54-sol-major-selected.png)

- ✅ **55. Volume 35% survives a reload; volumeToPercent / percentToVolume / normalizeSettings; no inline PERCENT math** — Playback volume 50% → 3 × ArrowLeft → "35%"; stored volume 0.35; after reload the slider shows "35%" (value 35, aria-valuetext "35%"). Console `[st.volumeToPercent(0.35), st.percentToVolume(35), st.normalizeSettings({ ...st.DEFAULT_SETTINGS, volume: 0.35 }).volume]` → `[35,0.35,0.35]`. Recursive search of src/**/*.tsx for `* PERCENT` / `/ PERCENT`: 1 match(es) (src/components/MicLevelMeter.tsx:26 `const toPercent = (db: number): number => ((clampToMeter(db) - METER_MIN_DB) / METER_SPAN_DB) * PERCENT;`). **Checklist discrepancy:** the expected "grep finds nothing" is not literally met: src/components/MicLevelMeter.tsx:26 is mic-meter dB math, not volume (noted, not failed: no volume ↔ percent conversion is duplicated in components). localStorage cleared afterwards.
  Evidence: [55-volume-percent.json](run-4/api/55-volume-percent.json)

  ![68-b55-volume-35-after-reload](run-4/screenshots/68-b55-volume-35-after-reload.png)

- ✅ **56. Melody length / Max interval move by exactly 1 per key; MELODY_LENGTH_STEP / MAX_INTERVAL_STEP = 1; no INTEGER_STEP** — Melody length → → → ← ← ←: 5 notes → 6 notes → 7 notes → 8 notes → 7 notes → 6 notes → 5 notes (deltas 1, 1, 1, -1, -1, -1); Max interval: 12 semitones → 13 semitones → 14 semitones → 15 semitones → 14 semitones → 13 semitones → 12 semitones (deltas 1, 1, 1, -1, -1, -1); aria-valuetext matched the visible text at every step. `INTEGER_STEP` in src: 0 match(es). constants.ts exports MELODY_LENGTH_STEP = 1, MAX_INTERVAL_STEP = 1 (source regex {"MELODY_LENGTH_STEP":true,"MAX_INTERVAL_STEP":true}).
  Evidence: [56-integer-steps.json](run-4/api/56-integer-steps.json)

  ![69-b56-integer-steps](run-4/screenshots/69-b56-integer-steps.png)

- ✅ **57. settings.spec.ts: 8-box test uses 60×8, storage keys imported; npm run test:e2e passes 10/10 three times** — e2e/settings.spec.ts: 8-box test uses `?melody=60,60,60,60,60,60,60,60` (true), no all-71 8-note melody (true); `import { SETTINGS_STORAGE_KEY, THRESHOLD_STORAGE_KEY } from '../src/config/constants'`; storage-key string literals: 0. `npm run test:e2e` ×3 (run 1 is item 50's run, runs 2 and 3 were run by run.sh right after it with the servers stopped): run 1 exit 0 → 10 passed / 0 failed; run 2 exit 0 → 10 passed / 0 failed; run 3 exit 0 → 10 passed / 0 failed.
  Evidence: [50-e2e.txt](run-4/output/50-e2e.txt), [57-e2e-run-2.txt](run-4/output/57-e2e-run-2.txt), [57-e2e-run-3.txt](run-4/output/57-e2e-run-3.txt), [57-e2e-spec-and-runs.json](run-4/api/57-e2e-spec-and-runs.json)

- ✅ **58. .claude/launch.json is git-ignored (not untracked)** — `git status --short .claude` → (nothing); `git check-ignore -v .claude/launch.json` exit 0 → `.gitignore:6:.claude/launch.json	.claude/launch.json`; tracked: no; file present locally: true.
  Evidence: [58-git-launch-json.txt](run-4/output/58-git-launch-json.txt)

- ✅ **59. implementation-notes.md Known issues: v0.2.0 release of Part 1, Part 2 needs bump.txt + CHANGELOG; test count current** — Known issues (lines 136, 301): L138: "- **Release (what happened):** the plan was to ship Parts 1 and 2 in one PR, but Part 1 was released on its own as" L139: "**v0.2.0** (`cad2846` prepared it, `348d002` is the CI release commit; the bridge defaults above shipped with it)." L140: "Part 2 is released separately and needs its own `bump.txt` and `CHANGELOG.md` entry." L303: "- **Release:** Part 1 is released (v0.2.0). Part 2's `bump.txt` (`minor`) and `CHANGELOG.md` entry still have to be". Latest test count in the notes (L324): "8 of 9 review items fixed (`review.md`); unit tests 1286 → **1297** (28 files), `test:scripts` 32/32, e2e 10/10," → 1297 unit tests, e2e 10; actual (item 50): 1297 unit, 10 e2e.
  Evidence: [59-implementation-notes.json](run-4/api/59-implementation-notes.json)

- ✅ **60. Aggregate: regression commands (1297 / 32 / 10) and items 1–51 all pass; no regression vs Run 3** — Regression counts: 1297 unit (expected 1297), 32 script (expected 32), 10 e2e (expected 10); item 50 PASS. Items 1–51: 50/51 pass (48 SKIP: manual devices, allowed); Part 1 steps 1–12 and 15 via item 51 (PASS). Behaviour regressions vs Run 3: 0. Non-pass items: none.

## Comparison with previous run

Compared item by item with [validation-report-run-3.md](validation-report-run-3.md) (items 1–51 and the Part 1 steps of item 51; Appendix B items 52–60 are new in Run 4). 63 unchanged, 1 changed.

**Fixed since Run 3:** item 6. Tab cycles inside the dialog (the Run 3 failure: focus dropped to `<body>` after Scale).

| Item | Run 3 | Run 4 | Change |
|---|---|---|---|
| item 6. Tab cycles inside the dialog | ❌ FAIL | ✅ PASS | fix |

No regressions (no PASS → FAIL).

## Manual follow-up

The script automates everything it can; these parts still need a human:

- **3 — Focus ring:** the gear visibly shows a focus ring after Esc (script checks `:focus-visible`; see screenshot).
- **7 — Real permission prompt:** reset the mic permission and look at the page while Chrome's prompt is shown (script simulated it with a 2 s delayed getUserMedia).
- **12 — Screen reader:** NVDA / VoiceOver announce each slider's label and value text (script checked the Chromium accessibility tree).
- **36 — Audible:** volume changes are smooth (no clicks) and 0% is silent (script verified the 20 ms master-gain ramps).
- **37 — Audible:** the repeated melody plays fast (≈ 0.25 s per note).
- **38 / 29–34 — Real trumpet:** play the active note in tune (the fake mic only plays written Si4).
- **48 — Devices:** steps 1–2, 13 and 36 on Android Chrome, iOS Safari (HTTPS) and desktop Firefox; the gear renders monochrome.
- **53 — Screen reader:** with NVDA / VoiceOver, opening the gear announces the "Settings" dialog, not an expanded "Scale" combobox (script checked the focused node in the Chromium accessibility tree).
