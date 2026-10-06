import test from 'node:test';
import assert from 'node:assert/strict';
import { steelRamRecipe } from './soundRecipes.mjs';

// The Steel dash ram's sound: THUNK -> KLANG -> rattle, built from short material layers. What can be checked here is
// its shape (what is in it, when, and how long it rings); whether it reads as a hardened knight slammed into another is
// for ears.

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const at = (layer) => layer.at ?? 0;
// the KLANG: the struck-steel rings at the contact (the fundamental's partial its loudest)
const bells = (recipe) => recipe.layers.filter((layer) => layer.type === 'ring' && at(layer) < 0.02 && layer.partials[0].freq > 300 && layer.partials[0].freq < 1000 && layer.partials.length >= 6);
const thud = (recipe) => recipe.layers.find((layer) => layer.type === 'tone' && layer.wave === 'sine' && layer.freq < 130 && at(layer) === 0);
const crack = (recipe) => recipe.layers.find((layer) => layer.type === 'noise' && layer.filter === 'highpass' && at(layer) === 0);
const rattle = (recipe) => recipe.layers.filter((layer) => layer.type === 'ring' && at(layer) >= 0.04 && layer.partials.every((p) => p.decay < 0.1));

test('a ram is a crack at the contact, a thud under it, a KLANG over it and a rattle after it', () => {
  const ram = steelRamRecipe(seeded(1), { strength: 1 });
  assert.ok(crack(ram) && crack(ram).decay <= 0.02, 'a very short, hard crack');
  assert.ok(thud(ram) && thud(ram).slideTo < 60, 'a deep thud with the body behind it');
  const [bell] = bells(ram);
  assert.ok(bell, 'the KLANG');
  // audible (40 dB down) in about half the envelope's length: half a second or so, never a church bell
  assert.ok(bell.partials[0].decay / 2 >= 0.4 && bell.partials[0].decay / 2 <= 0.7, `rings ${(bell.partials[0].decay / 2).toFixed(2)} s`);
  assert.ok(rattle(ram).length >= 4, 'the harness rattling after');
  for (const layer of ram.layers) {
    const freqs = layer.type === 'ring' ? layer.partials.map((p) => p.freq) : [layer.freq];
    for (const f of freqs) assert.ok(f > 20 && f < 16000, `audible ${f}`);
  }
});

test('worn plate rams with less ring and less weight; full plate the most', () => {
  const full = steelRamRecipe(seeded(2), { strength: 1 });
  const worn = steelRamRecipe(seeded(2), { strength: 0.2 });
  assert.ok(bells(worn)[0].partials[0].decay < bells(full)[0].partials[0].decay * 0.6, 'shorter ring');
  assert.ok(bells(worn)[0].partials[0].gain < bells(full)[0].partials[0].gain * 0.6, 'quieter ring');
  assert.ok(thud(worn).gain < thud(full).gain, 'lighter');
});

test('a guard: a broad flat clash, the thud cut short; broken, it caves in', () => {
  const body = steelRamRecipe(seeded(3), { strength: 1 });
  const guard = steelRamRecipe(seeded(3), { strength: 1, kind: 'guard' });
  assert.ok(thud(guard).decay < thud(body).decay && thud(guard).gain < thud(body).gain, 'braced: less of the body');
  assert.ok(guard.layers.some((l) => l.type === 'noise' && l.filter === 'bandpass' && l.freq < 1000 && l.q < 1), 'the broad clash');
  assert.ok(bells(guard).length >= 1, 'the KLANG is kept');
  const broken = steelRamRecipe(seeded(3), { strength: 1, kind: 'guard', broken: true });
  assert.ok(broken.layers.filter((l) => at(l) > 0.02 && at(l) < 0.05).length >= 3, 'the cave-in a beat after');
});

test('steel on steel: denser and more metallic, not merely louder: a second crack and two resonances beating', () => {
  const body = steelRamRecipe(seeded(4), { strength: 1 });
  const steel = steelRamRecipe(seeded(4), { strength: 1, kind: 'steel' });
  const [a, b] = bells(steel);
  assert.ok(a && b, 'two resonances');
  const beat = Math.abs(b.partials[0].freq - a.partials[0].freq);
  assert.ok(beat > 5 && beat < 40, `beating at ${beat.toFixed(1)} Hz`);
  assert.ok(steel.layers.filter((l) => l.type === 'noise' && l.filter === 'highpass').length >= 2, 'a double crack');
  // (loudness: the two rings together no stronger than the one, give or take)
  const sum = (recipe) => bells(recipe).reduce((total, layer) => total + layer.partials[0].gain, 0);
  assert.ok(sum(steel) < sum(body) * 1.8, 'denser, not twice as loud');
});

test('heard by the rammer: harder and drier; by the one rammed: more body and more rattle', () => {
  const near = steelRamRecipe(seeded(5), { strength: 1 });
  const rammer = steelRamRecipe(seeded(5), { strength: 1, heard: 'rammer' });
  const victim = steelRamRecipe(seeded(5), { strength: 1, heard: 'victim' });
  assert.ok(crack(rammer).gain > crack(near).gain && rammer.reverb < near.reverb);
  assert.ok(thud(victim).gain > thud(near).gain && rattle(victim).length > rattle(near).length);
});
