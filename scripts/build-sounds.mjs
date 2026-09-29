#!/usr/bin/env node
/**
 * Build the self-hosted instrument sample sets into public/sounds/<id>/.
 *
 * For each sampled instrument (upright, grand, epiano) this script:
 *   1. downloads the source archive into the gitignored .sound-cache/ (skipped if present),
 *   2. extracts one mezzo-forte velocity layer,
 *   3. selects one sample every 3 semitones over the source's MIDI range,
 *   4. per sample: pitch-shifts to the exact output pitch, trims leading and
 *      trailing silence, peak-normalizes to a fixed target, caps the length and
 *      applies a fade-out,
 *   5. encodes to mono 44.1 kHz MP3 at 128 kbps (MP3 so iOS Safari can play it).
 *
 * Usage: node scripts/build-sounds.mjs [--force]
 * Requires ffmpeg/ffprobe (override with FFMPEG_PATH / FFPROBE_PATH).
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FFMPEG = process.env.FFMPEG_PATH ?? '/opt/homebrew/bin/ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH ?? '/opt/homebrew/bin/ffprobe';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.sound-cache');
const OUT_DIR = path.join(ROOT, 'public', 'sounds');
const WORK = path.join(CACHE, 'work');
const FORCE = process.argv.includes('--force');

const STEP_SEMITONES = 3;
const TARGET_PEAK_DB = -6;
const FADE_SECONDS = 0.6;
const SILENCE_THRESHOLD_DB = -45;
const MP3_KBPS = 128;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_OFFSETS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function noteNameToMidi(name) {
  const match = /^([A-G])([#b]?)(-?\d+)$/.exec(name);
  if (!match) {
    throw new Error(`Unparseable note name: ${name}`);
  }
  const [, letter, accidental, octave] = match;
  const offset = NOTE_OFFSETS[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
  return (Number(octave) + 1) * 12 + offset;
}

function midiToNoteName(midi) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts }).toString();
}

function download(url, destPath) {
  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
    console.log(`  cached: ${path.basename(destPath)}`);
    return;
  }
  console.log(`  download: ${url}`);
  execFileSync('curl', ['-sSL', '--retry', '3', '-o', destPath, url]);
}

/**
 * Probe an audio file for { sampleRate, duration }.
 */
function probe(file) {
  const out = run(FFPROBE, [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=sample_rate',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    file,
  ]).trim().split('\n');
  return { sampleRate: Number(out[0]), duration: Number(out[1]) };
}

/**
 * Return the ffmpeg filter chain that decodes `file`, pitch-shifts it to its
 * final pitch, and strips silence from both ends.
 */
function cleanupChain(file, sampleRate, semitoneShift) {
  const parts = [];
  if (semitoneShift !== 0) {
    const factor = 2 ** (semitoneShift / 12);
    parts.push(`asetrate=${sampleRate}*${factor}`, `aresample=44100`);
  }
  const trim = `silenceremove=start_periods=1:start_threshold=${SILENCE_THRESHOLD_DB}dB`;
  parts.push(trim, 'areverse', trim, 'areverse');
  return ['-i', file, '-af', parts.join(','), '-ac', '1', '-ar', '44100'];
}

/**
 * Normalize one sample and encode it to `<outDir>/<midi>.mp3`.
 * Peak-normalizing every sample to the same target keeps the perceived level
 * consistent between notes and between instruments.
 */
function renderSample(instrument, midi, sourceFile, shiftSemitones) {
  const outDir = path.join(OUT_DIR, instrument.id);
  fs.mkdirSync(outDir, { recursive: true });
  const outMp3 = path.join(outDir, `${midi}.mp3`);
  if (fs.existsSync(outMp3) && !FORCE) {
    return false;
  }

  const { sampleRate } = probe(sourceFile);
  const workDir = path.join(WORK, instrument.id);
  fs.mkdirSync(workDir, { recursive: true });
  const workWav = path.join(workDir, `${midi}.wav`);
  execFileSync(FFMPEG, ['-y', ...cleanupChain(sourceFile, sampleRate, shiftSemitones), workWav], {
    stdio: 'ignore',
  });

  const { duration } = probe(workWav);
  const detect = spawnSync(FFMPEG, ['-i', workWav, '-af', 'volumedetect', '-f', 'null', '-'], {
    encoding: 'utf8',
  }).stderr;
  const match = /max_volume:\s*(-?[\d.]+) dB/.exec(detect);
  if (!match) {
    throw new Error(`volumedetect produced no level for ${sourceFile}`);
  }
  const maxVolumeDb = Number(match[1]);
  const gainDb = (TARGET_PEAK_DB - maxVolumeDb).toFixed(2);

  const capped = Math.min(duration, instrument.maxSeconds);
  const fadeStart = Math.max(0, capped - FADE_SECONDS);
  execFileSync(
    FFMPEG,
    [
      '-y',
      '-i', workWav,
      '-af', `volume=${gainDb}dB,atrim=end=${instrument.maxSeconds},afade=t=out:st=${fadeStart.toFixed(3)}:d=${FADE_SECONDS}`,
      '-c:a', 'libmp3lame',
      '-b:a', `${MP3_KBPS}k`,
      outMp3,
    ],
    { stdio: 'ignore' },
  );
  return true;
}

/**
 * Choose the source sample nearest to each 3-semitone slot (ties go to the
 * lower root) and render every slot.
 */
function buildInstrument(instrument) {
  console.log(`${instrument.id}:`);
  const roots = [...instrument.samples.keys()].sort((a, b) => a - b);
  const slots = [];
  for (let midi = instrument.lowMidi; midi <= instrument.highMidi; midi += STEP_SEMITONES) {
    slots.push(midi);
  }

  let rendered = 0;
  for (const slot of slots) {
    let root = roots[0];
    for (const candidate of roots) {
      if (Math.abs(candidate - slot) < Math.abs(root - slot)) {
        root = candidate;
      }
    }
    if (renderSample(instrument, slot, instrument.samples.get(root), slot - root)) {
      rendered += 1;
    }
  }

  const files = fs.readdirSync(path.join(OUT_DIR, instrument.id)).filter((f) => f.endsWith('.mp3'));
  const bytes = files.reduce((sum, f) => sum + fs.statSync(path.join(OUT_DIR, instrument.id, f)).size, 0);
  console.log(`  ${files.length} mp3 files, ${(bytes / 1024 / 1024).toFixed(2)} MB (${rendered} newly rendered)`);
  return { files: files.length, bytes };
}

/**
 * Upright Piano KW: CC0, samples every 3 semitones from A0 (21) to C8 (108),
 * velocity layers vL (up to MIDI velocity 80) and vH.
 */
function prepareUpright() {
  const dir = path.join(CACHE, 'upright-kw');
  if (!fs.existsSync(path.join(dir, 'LICENSE'))) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('unzip', ['-q', '-o', path.join(CACHE, 'upright-kw.zip'), '-d', dir], { stdio: 'ignore' });
  }
  const samples = new Map();
  for (const file of fs.readdirSync(path.join(dir, 'samples')).filter((f) => f.endsWith('vL.flac'))) {
    const noteName = file.replace('vL.flac', '');
    samples.set(noteNameToMidi(noteName), path.join(dir, 'samples', file));
  }
  return { lowMidi: 21, highMidi: 108, maxSeconds: 8, samples };
}

/**
 * Salamander Grand Piano V3: CC-BY 3.0, samples every 3 semitones from A0 (21)
 * to C8 (108), 16 velocity layers; v9 covers MIDI velocities 65-72 (mf).
 */
function prepareGrand() {
  const dir = path.join(CACHE, 'salamander', 'SalamanderGrandPianoV3_44.1khz16bit', '44.1khz16bit');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(path.join(CACHE, 'salamander'), { recursive: true });
    execFileSync(
      'tar',
      [
        '-xJf', path.join(CACHE, 'salamander-44k16.tar.xz'),
        '-C', path.join(CACHE, 'salamander'),
        '--include', 'SalamanderGrandPianoV3_44.1khz16bit/44.1khz16bit/*v9.wav',
      ],
      { stdio: 'ignore' },
    );
  }
  const samples = new Map();
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('v9.wav'))) {
    samples.set(noteNameToMidi(file.replace('v9.wav', '')), path.join(dir, file));
  }
  return { lowMidi: 21, highMidi: 108, maxSeconds: 8, samples };
}

/**
 * FreePats FM Synthesized Piano #1 (DX7 "E. Piano 1" style): CC0, 12 samples
 * every 6 semitones from F#1 (30) to C7 (96), velocity layers v60/v80/v100.
 * Slots between roots reuse the nearest root pitch-shifted with asetrate.
 */
function prepareEpiano() {
  const base = 'https://raw.githubusercontent.com/freepats/fm-piano1/HEAD/samples';
  const dir = path.join(CACHE, 'fm-piano1');
  fs.mkdirSync(dir, { recursive: true });
  const roots = ['F#1', 'C2', 'F#2', 'C3', 'F#3', 'C4', 'F#4', 'C5', 'F#5', 'C6', 'F#6', 'C7'];
  const samples = new Map();
  for (const root of roots) {
    const file = `${root}v80.flac`;
    download(`${base}/${encodeURIComponent(root)}v80.flac`, path.join(dir, file));
    samples.set(noteNameToMidi(root), path.join(dir, file));
  }
  return { lowMidi: 30, highMidi: 96, maxSeconds: 6, samples };
}

fs.mkdirSync(CACHE, { recursive: true });

console.log('upright (Upright Piano KW, CC0):');
download(
  'https://github.com/freepats/upright-piano-KW/releases/download/v1.0.0/UprightPianoKW-20220221.zip',
  path.join(CACHE, 'upright-kw.zip'),
);
console.log('grand (Salamander Grand Piano V3, CC-BY 3.0):');
download(
  'https://freepats.zenvoid.org/Piano/SalamanderGrandPiano/SalamanderGrandPianoV3+20161209_44khz16bit.tar.xz',
  path.join(CACHE, 'salamander-44k16.tar.xz'),
);

const report = {};
report.upright = buildInstrument({ id: 'upright', ...prepareUpright() });
report.grand = buildInstrument({ id: 'grand', ...prepareGrand() });
report.epiano = buildInstrument({ id: 'epiano', ...prepareEpiano() });

console.log('\nSummary:');
for (const [id, { files, bytes }] of Object.entries(report)) {
  console.log(`  ${id}: ${files} files, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
}
