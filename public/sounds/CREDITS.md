# Sound credits

Self-hosted instrument samples for modal-muscle-memory. Every asset lives in
this directory as `sounds/<instrument>/<midi>.mp3` — one mono 44.1 kHz MP3
(128 kbps) every 3 semitones, named by MIDI note number. No runtime CDN
fetches; everything is served from this app.

Regenerate with `npm run build:sounds` (see `scripts/build-sounds.mjs`).
Processed per sample: trimmed leading/trailing silence, peak-normalized to
-6 dBFS, length-capped with a 0.6 s fade-out, downmixed to mono, encoded to
MP3. No other changes were made to the recordings.

## upright — Upright Piano KW

- Instrument: Upright Piano KW (Kawai upright recorded in a living room)
- Author: recorded by Gonzalo and Roberto (zenvoid.org) for the FreePats project
- Source: https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html#UprightKW
  (archive: https://github.com/freepats/upright-piano-KW, UprightPianoKW-20220221.zip)
- License: CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/)
- Files used: `samples/*vL.flac` — mezzo-forte velocity layer, MIDI 21-108 sampled every 3 semitones
- Changes: trimming/normalization/fade/mono/MP3 as described above; no pitch shifting needed.

## grand — Salamander Grand Piano V3

- Instrument: Salamander Grand Piano V3 (Yamaha C5, AKG c414 AB pair)
- Author: Alexander Holm
- Source: https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html
  (archive: SalamanderGrandPianoV3+20161209_44khz16bit.tar.xz)
- License: CC-BY 3.0 (https://creativecommons.org/licenses/by/3.0/)
- Files used: `44.1khz16bit/*v9.wav` — velocity layer 9 (MIDI velocities 65-72, mf), MIDI 21-108 sampled every 3 semitones
- Changes: trimming/normalization/fade/mono/MP3 as described above; release samples (hammer noise, string resonance) not included.

## epiano — FM Synthesized Piano #1

- Instrument: FM Synthesized Piano #1 — imitation of the Yamaha DX7 "E. Piano 1" patch (the classic Rhodes-style tine electric piano sound of the 1980s), recorded from the Hexter software synthesizer
- Author: Roberto (zenvoid.org) for the FreePats project
- Source: https://freepats.zenvoid.org/ElectricPiano/synthesized-piano.html
  (archive: https://github.com/freepats/fm-piano1)
- License: CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/)
- Files used: `samples/*v80.flac` — mezzo-forte velocity layer, source sampled every 6 semitones from F#1 (30) to C7 (96)
- Changes: trimming/normalization/fade/mono/MP3 as described above, plus resampling with ffmpeg `asetrate` to fill every 3-semitone slot between the source roots (max ±3 semitones).

## synth

No samples: this instrument is a Tone.js PolySynth generated at runtime and
works fully offline.
