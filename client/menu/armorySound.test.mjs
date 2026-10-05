import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ARMORY_CUE_GAIN, ARMORY_CUE_IDS, ARMORY_CUE_LATE_SEC, createArmoryCues, playArmorySound } from './armorySound.mjs';
import { armoryView } from './armoryView.mjs';

// The Armory's identity cues are rendered assets (tools/audio/armory_cues.py). What can be checked here is that
// every card has one, that each is short and well formed, and some plain acoustic facts about each material. Whether
// Steel reads as steel is for ears in the actual Armory, with the music playing.

const dir = new URL('../assets/armory/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));

// a 16-bit PCM WAV: { rate, channels: [Float64Array...] }
function readWav(id) {
  const bytes = readFileSync(new URL(`${id}.wav`, dir));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 12, rate = 0, count = 0, data = null;
  while (at < bytes.length) {
    const chunk = String.fromCharCode(...bytes.subarray(at, at + 4));
    const size = view.getUint32(at + 4, true);
    if (chunk === 'fmt ') { count = view.getUint16(at + 10, true); rate = view.getUint32(at + 12, true); }
    if (chunk === 'data') data = [at + 8, size];
    at += 8 + size + (size % 2);
  }
  const frames = data[1] / (2 * count);
  const channels = Array.from({ length: count }, () => new Float64Array(frames));
  for (let i = 0; i < frames; i += 1) for (let c = 0; c < count; c += 1) channels[c][i] = view.getInt16(data[0] + (i * count + c) * 2, true) / 32768;
  return { rate, channels };
}
const mono = ({ channels }) => channels[0].map((v, i) => channels.reduce((sum, c) => sum + c[i], 0) / channels.length);
const slice = (x, rate, from, to) => x.subarray(Math.floor(from * rate), Math.floor(to * rate));
const rms = (x) => Math.sqrt(x.reduce((sum, v) => sum + v * v, 0) / Math.max(1, x.length));
const db = (v) => 20 * Math.log10(v + 1e-12);

// power in each band, as a share of the whole (a radix-2 FFT over the stretch, zero-padded, Hann-windowed)
function spectrum(x, rate) {
  let n = 1;
  while (n < x.length) n *= 2;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < x.length; i += 1) re[i] = x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (x.length - 1)));
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len *= 2) {
    const angle = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k += 1) {
        const cr = Math.cos(angle * k), ci = Math.sin(angle * k);
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar; im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar; im[i + k] += ai;
      }
    }
  }
  const power = Array.from({ length: n / 2 }, (_, k) => re[k] ** 2 + im[k] ** 2);
  const total = power.reduce((a, b) => a + b, 0) || 1;
  return {
    share: (lo, hi) => power.reduce((sum, p, k) => sum + ((k * rate) / n >= lo && (k * rate) / n < hi ? p : 0), 0) / total,
    centroid: power.reduce((sum, p, k) => sum + p * ((k * rate) / n), 0) / total,
  };
}
const cue = Object.fromEntries(ARMORY_CUE_IDS.map((id) => [id, readWav(id)]));
const loudest = (sound) => { const x = mono(sound); let best = 0; for (let i = 0; i + 0.2 * sound.rate < x.length; i += 480) best = Math.max(best, rms(x.subarray(i, i + 0.2 * sound.rate))); return db(best); };
const pan = (sound, from, to) => { const [l, r] = sound.channels.map((c) => rms(slice(c, sound.rate, from, to))); return (r - l) / (r + l); };

test('every card in the Armory has its own cue: each spell and each ultimate, Chivalry included', () => {
  const view = armoryView('fireball');
  const cards = [...view.spells, ...view.ultimates].map((card) => card.id);
  for (const id of cards) assert.ok(ARMORY_CUE_IDS.includes(id), `${id} has a cue`);
  assert.equal(new Set(ARMORY_CUE_IDS).size, ARMORY_CUE_IDS.length);
});

test('each cue is a short rendered asset (0.4 to 0.9 s), in AAC with a WAV beside it, all at one loudness and never clipping', () => {
  for (const id of ARMORY_CUE_IDS) {
    const entry = manifest.cues[id];
    assert.ok(entry, `${id} is in the manifest`);
    assert.ok(existsSync(new URL(`${id}.m4a`, dir)) && existsSync(new URL(`${id}.wav`, dir)), `${id}: both files`);
    const sound = cue[id];
    const seconds = sound.channels[0].length / sound.rate;
    assert.ok(seconds >= 0.4 && seconds <= 0.9, `${id}: ${seconds.toFixed(2)} s`);
    assert.equal(entry.channels, sound.channels.length);
    assert.ok(Math.max(...sound.channels.map((c) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0))) < 0.95, `${id} never clips`);
    // (clearly over the menu music; Steel, short and hard, set a little higher so it reads as loud as the rest)
    const level = id === 'steel' ? -13.5 : -16;
    assert.ok(Math.abs(loudest(sound) - level) < 1.5, `${id}: its loudest 200 ms at ${loudest(sound).toFixed(1)} dBFS`);
  }
  assert.ok(ARMORY_CUE_GAIN > 0 && ARMORY_CUE_GAIN <= 4);
});

test('fire, ice and air are different materials: the Fireball warm without bass, Frostfire hard and high, the Gale only air', () => {
  const fire = spectrum(mono(cue.fireball), 48000), frost = spectrum(mono(cue.frostfire), 48000), air = spectrum(mono(cue.gale), 48000);
  assert.ok(fire.share(0, 150) < 0.02, 'no bass under the flame');
  assert.ok(fire.centroid > 1000 && fire.centroid < 3500, `the flame's body: ${fire.centroid.toFixed(0)} Hz`);
  assert.ok(frost.centroid > 1.8 * fire.centroid, `brittle and cold, well above the flame: ${frost.centroid.toFixed(0)} Hz`);
  assert.ok(frost.share(0, 500) < 0.01, 'no warmth in the ice');
  assert.ok(air.share(0, 150) < 0.005, 'no muddy wind bed under the Gale');
  // the Fireball's embers: crackles still landing in its last third
  const tail = spectrum(slice(mono(cue.fireball), 48000, 0.35, 0.55), 48000);
  assert.ok(tail.share(2000, 8000) > 0.4, 'a tail of embers');
  // the Gale's intake, then its rush travelling across the field, falling in pitch as the Gale's own release does
  assert.ok(pan(cue.gale, 0.2, 0.3) < -0.1 && pan(cue.gale, 0.38, 0.5) > 0.1, 'the whoosh goes left to right');
  const early = spectrum(slice(mono(cue.gale), 48000, 0.2, 0.28), 48000).centroid, late = spectrum(slice(mono(cue.gale), 48000, 0.36, 0.46), 48000).centroid;
  assert.ok(late < early, `the rush falls: ${early.toFixed(0)} -> ${late.toFixed(0)} Hz`);
});

test('Steel is two physical contacts of damped plate, not a chime; Sunder is weight first and ring second', () => {
  const x = mono(cue.steel);
  const level = (from, to) => rms(slice(x, 48000, from, to));
  assert.ok(level(0.084, 0.092) > 2 * level(0.07, 0.082), 'the second contact lands a beat after the first');
  const first = spectrum(slice(x, 48000, 0, 0.08), 48000), second = spectrum(slice(x, 48000, 0.09, 0.25), 48000);
  assert.ok(second.centroid < first.centroid, 'the second contact is lower and heavier');
  const whole = spectrum(x, 48000);
  assert.ok(whole.share(500, 6000) > 0.6, 'metal: most of it in the plate\'s own band');
  assert.ok(whole.share(6000, 24000) < 0.05, 'nothing sparkling above it');
  assert.ok(db(level(0.4, 0.5)) < db(level(0.09, 0.15)) - 35, 'damped: rung out by 0.4 s, not a bell');
  const s = mono(cue.sunder);
  // (the blow lands as the Armory's sword comes down: ARMORY_GESTURES.sunder, its slam)
  const hit = 0.42;
  assert.ok(db(rms(slice(s, 48000, 0, hit - 0.02))) < db(rms(slice(s, 48000, hit, hit + 0.06))) - 12, 'only the ground shifting before the blow');
  const impact = spectrum(slice(s, 48000, hit, hit + 0.055), 48000), ring = spectrum(slice(s, 48000, hit + 0.12, hit + 0.37), 48000);
  assert.ok(impact.share(0, 500) > 0.5, 'the blow is weight');
  assert.ok(ring.centroid > impact.centroid, 'the iron rings after it');
  assert.ok(db(rms(slice(s, 48000, hit + 0.12, hit + 0.37))) < db(rms(slice(s, 48000, hit, hit + 0.055))) - 8, 'and the ring is quieter than the blow');
  assert.ok(spectrum(s, 48000).share(0, 150) > 0.05, 'real low weight');
});

test('the Vortex: the fire catching, then the blade round twice across the field; the Fireball and the Vortex related, not alike', () => {
  assert.ok(spectrum(slice(mono(cue.vortex), 48000, 0, 0.12), 48000).centroid < 1500, 'it begins as flame');
  const passes = [pan(cue.vortex, 0.14, 0.2), pan(cue.vortex, 0.24, 0.29), pan(cue.vortex, 0.36, 0.42), pan(cue.vortex, 0.44, 0.49)];
  assert.ok(passes[1] > passes[0] && passes[3] < passes[2], `round and back: ${passes.map((p) => p.toFixed(2))}`);
  assert.equal(cue.fireball.channels.length, 1);
  assert.equal(cue.vortex.channels.length, 2);
});

function fakeSound() {
  const played = [];
  return {
    played,
    running: true,
    levels: { muted: false, effects: 1, master: 1 },
    ctx: { decodeAudioData: async (data) => ({ decoded: data }) },
    playBuffer: (buffer, options) => { const handle = { buffer, options, stopped: false, stop: () => { handle.stopped = true; } }; played.push(handle); return handle; },
  };
}

test('a press plays its cue on the UI bus at once when decoded, and the next press cuts it short', async () => {
  const sound = fakeSound();
  const cues = createArmoryCues({ fetchAudio: async (url) => (url.endsWith('.m4a') ? url : null) });
  await cues.load(sound);
  const stop = playArmorySound(sound, 'steel', { cues });
  assert.equal(sound.played.length, 1);
  assert.equal(sound.played[0].options.bus, 'ui');
  assert.match(sound.played[0].buffer.decoded, /armory\/steel\.m4a$/);
  stop();
  assert.equal(sound.played[0].stopped, true);
  assert.equal(playArmorySound(sound, 'no-such-card', { cues }), null);
});

test('a press made before the cues were decoded is heard when they are, if that is soon; never late and out of place', async () => {
  let clock = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const sound = fakeSound();
  const cues = createArmoryCues({ fetchAudio: async (url) => { await gate; return url; } });
  playArmorySound(sound, 'gale', { cues, now: () => clock });
  clock = (ARMORY_CUE_LATE_SEC - 0.05) * 1000;
  release();
  await cues.load(sound);
  await Promise.resolve();
  assert.equal(sound.played.length, 1, 'ready in time: heard');
  // too late: dropped
  let late;
  const slow = new Promise((resolve) => { late = resolve; });
  const quiet = fakeSound();
  const later = createArmoryCues({ fetchAudio: async (url) => { await slow; return url; } });
  clock = 0;
  playArmorySound(quiet, 'gale', { cues: later, now: () => clock });
  clock = (ARMORY_CUE_LATE_SEC + 0.2) * 1000;
  late();
  await later.load(quiet);
  await Promise.resolve();
  assert.equal(quiet.played.length, 0);
  // and one cancelled before it was ready is never heard
  let open;
  const held = new Promise((resolve) => { open = resolve; });
  const cancelled = fakeSound();
  const bank = createArmoryCues({ fetchAudio: async (url) => { await held; return url; } });
  clock = 0;
  const stop = playArmorySound(cancelled, 'sunder', { cues: bank, now: () => clock });
  stop();
  open();
  await bank.load(cancelled);
  await Promise.resolve();
  assert.equal(cancelled.played.length, 0);
});
