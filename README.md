# Modal Muscle Memory Trainer (MVP)

Local-first React + TypeScript web app for adaptive, phrase-based keyboard practice.

## MVP Features

- Web MIDI input (note on/off + sustain parsing)
- Phrase generation for three lanes:
  - `ionian`
  - `aeolian`
  - `ionian_aeolian_mixture`
- Voicing families:
  - `shell_137`
  - `closed_7th`
  - `inversion_1`
- Rhythmic cells:
  - `block_whole`
  - `quarters`
  - `charleston`
- Synchronized practice views:
  - notation strip (VexFlow)
  - keyboard visualization
  - circle-of-fifths + mode ring
- Zero-keyboard practice flow:
  - phrase timing starts on first played chord
  - phrases auto-advance continuously after completion
  - no start/submit transport buttons during practice
  - topbar controls only: Home, metronome toggle, tempo field, reference playback
- Chord-event evaluator (lenient + standard behavior)
- Node mastery + transition-edge mastery tracking
- Adaptive focus sampling (`weak_transition`, `weak_node`, `due_review`, `new_item`)
- Unlock logic based on last-20-attempt fluency thresholds
- Local persistence for settings, unlocks, mastery, attempts, and session history

## Stack

- React + TypeScript + Vite
- `tonal` for theory primitives
- native Web MIDI API
- Tone.js for metronome/count-in/reference playback
- VexFlow for notation
- Vitest for automated tests

## Run

```bash
cd modal-muscle-memory-trainer
npm install
npm run dev
```

Open `http://localhost:5173`.

## Test + Build

```bash
npm run test:run
npm run lint
npm run build
```

## Supabase Cloud Save

Set these env vars to enable passwordless email auth and remote progress sync:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

`VITE_SUPABASE_ANON_KEY` is still accepted as a fallback, but the app now prefers the publishable key name to match the current Supabase dashboard.

Apply [supabase/schema.sql](/Users/nlincke/Desktop/noahlincke_web/pianokeybr/modal-muscle-memory-trainer/supabase/schema.sql) in the Supabase SQL editor.

Without those vars, the app stays fully local and continues using browser storage only.

## Deployment

- `npm run build:mmm` builds the app for hosting at subpath `/mmm/`.
- `npm run build:deploy:mmm` runs the `/mmm/` build and writes SPA rewrite rules to `dist/.htaccess`.
- `npm run start:passenger` starts the included `app.cjs` server for Passenger-based Node hosting.

## Module Layout

```text
src/
  components/
    HomeScreen.tsx
    PracticeLayout.tsx
    NotationStrip.tsx
    PianoView.tsx
    CircleOfFifths.tsx
    FeedbackPanel.tsx
    ProgressScreen.tsx
  content/
    rhythmCells.ts
    packs/
      ionianStarter.ts
      aeolianStarter.ts
      mixedStarter.ts
      index.ts
  lib/
    midi/
      midiAccess.ts
      midiParser.ts
      chordCapture.ts
    theory/
      chordToken.ts
      progressionTemplates.ts
      voiceLeading.ts
      rhythmCells.ts
      roman.ts
      noteUtils.ts
    engine/
      phraseGenerator.ts
      evaluator.ts
      mastery.ts
      unlocks.ts
      scheduler.ts
    audio/
      metronome.ts
      previewPlayback.ts
    storage/
      progressStore.ts
  types/
    music.ts
    progress.ts
```

## Content Pack Extensibility + Data Safety

Content is isolated in `src/content/packs/*` and user state keys are token-id based (`lane:tonic:roman:voicing:inversion:v1`).

To add a new pack without disturbing user data:

1. Add a new pack module under `src/content/packs/`.
2. Register it in `src/content/packs/index.ts`.
3. Keep token-id stability for existing content.
4. If you need a new token identity rule, append a new version suffix in IDs rather than mutating existing IDs.

`progressStore.ts` merges persisted data with defaults and retains existing mastery maps/session history during schema-compatible updates.
