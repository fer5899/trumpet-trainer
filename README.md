# Trumpet Trainer

A small web app for practising playing by ear on the B♭ trumpet: it plays a short random melody,
then listens through your microphone while you play it back and marks each note as soon as you
play it in tune and hold it for half a second. Note names are shown in written (B♭) pitch using
Latin solfège (Do, Re, Mi…).

## How it works

1. **Home:** optionally press **Test microphone** to see your input level. Drag the threshold
   marker on the level bar so your playing is above it and the room noise is below it (default
   −40 dB; kept only while the page is open).
2. Press **Start training**. The browser asks for microphone access the first time; if it is
   blocked, an inline message explains how to allow it.
3. The app plays 5 random notes (1 s each, written range Fa#3–Do5). It does not listen while
   playing, so speakers are fine.
4. Play the notes back. The highlighted box is the note to play; hold it in tune (±25 cents, right
   octave) for 0.5 s and it turns green with its name. Wrong notes simply do nothing.
5. **Repeat melody** plays it again and keeps your progress; **Give up** returns Home. After the
   5th note the app returns Home on its own.

## Requirements

- Node.js 20+ and npm
- A modern browser (Chrome, Firefox, Safari, Edge) with a microphone

The microphone only works in a **secure context**: `https://…` or `http://localhost`. Opening the
dev server through a LAN IP address (e.g. from a phone) will not get microphone access; use the
deployed HTTPS build or an HTTPS tunnel instead.

## Getting started

```bash
npm ci
npm run dev        # http://localhost:5173
```

## Tests and checks

```bash
npm test                       # unit/component tests (Vitest)
npm run lint
npm run typecheck
npx playwright install chromium   # once, for e2e
npm run test:e2e               # Playwright with a fake microphone (generates a 440 Hz test tone)
```

`test:e2e` starts its own `npm run dev:e2e` server on port 5173 (it reuses one that is already
running outside CI, so stop any plain `npm run dev` first). In that e2e build only, the URL
parameter `?melody=71,71,71,71,71` (5 written MIDI numbers, 54–72) fixes the melody so the tests
are deterministic; production builds ignore it.

## Build

```bash
npm run build      # outputs dist/ with base path /trumpet-trainer/ (GitHub Pages)
npm run preview    # http://localhost:4173/trumpet-trainer/
```

## CI and deployment

`.github/workflows/ci.yml` runs on every push and pull request (Node 22):

- **check:** lint, typecheck, unit/component tests, build
- **e2e:** Playwright (Chromium) with the fake microphone; the HTML report is uploaded on failure
- **deploy:** after both pass, on a push to the deploy branch, builds and publishes `dist/` to
  GitHub Pages

One-time repository setup:

- **Settings → Pages → Source: "GitHub Actions".**
- The deploy branch is `main` by default. To deploy from another branch (the repository's current
  default branch is not `main`), set the repository variable **`DEPLOY_BRANCH`** (Settings →
  Secrets and variables → Actions → Variables) to that branch name, or create/rename `main`.
- The build uses the base path `/trumpet-trainer/`; change `base` in `vite.config.ts` if the
  repository has a different name.
