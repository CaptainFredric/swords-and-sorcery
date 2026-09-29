import test from 'node:test';
import assert from 'node:assert/strict';
import { blowDirection, hitKick, hitstopSeconds, impactPoint } from './hitFeel.mjs';
import {
  blockRecipe, castRecipe, dashRecipe, guardBreakRecipe, killRecipe, parryRecipe, spatialize, swingRecipe, swordHitRecipe, unsheatheRecipe,
} from './sound/soundRecipes.mjs';

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

test('a blow lands on the chest, on the side facing the attacker', () => {
  const point = impactPoint({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 2 });
  assert.equal(point.y, 1.2);
  assert.ok(point.z > 0.3 && point.z < 0.33);
  assert.deepEqual(blowDirection({ x: 0, z: 0 }, { x: 0, z: 2 }), { x: 0, z: -1 });
  assert.deepEqual(impactPoint({ x: 1, y: 0, z: 1 }, null), { x: 1, y: 1.2, z: 1 });
});

test('the heavy third strike and the killing blow freeze and kick harder, but only briefly', () => {
  assert.ok(hitstopSeconds({ strike: 2 }) > hitstopSeconds({ strike: 0 }));
  assert.ok(hitstopSeconds({ kill: true }) > hitstopSeconds({ strike: 2 }));
  assert.ok(hitstopSeconds({ kill: true }) <= 0.12, 'short enough not to fall behind the server swing');
  assert.ok(hitKick({ kill: true }) >= hitKick({ strike: 2 }) && hitKick({ strike: 2 }) > hitKick({ strike: 0 }));
});

test('hit sounds layer a crack, a crunch, a body thump and a steel ring; the heavy third strike adds weight', () => {
  const light = swordHitRecipe(seeded(1), { strike: 0 });
  const heavy = swordHitRecipe(seeded(1), { strike: 2 });
  const kill = swordHitRecipe(seeded(1), { kill: true });
  assert.ok(light.layers.some((layer) => layer.type === 'ring'));
  assert.ok(light.layers.some((layer) => layer.type === 'noise' && layer.filter === 'highpass'));
  assert.ok(light.layers.some((layer) => layer.type === 'tone' && layer.slideTo < layer.freq), 'the thump drops in pitch');
  assert.ok(heavy.layers.length > light.layers.length);
  assert.ok(kill.layers.length > heavy.layers.length && kill.reverb > heavy.reverb);
  assert.ok(killRecipe(seeded(5)).reverb >= 0.5, 'the killing blow rings out in the courtyard');
  for (const recipe of [light, heavy, kill, blockRecipe(seeded(2)), guardBreakRecipe(seeded(2)), parryRecipe(seeded(3)), swingRecipe(seeded(4)), killRecipe(seeded(5)), castRecipe(seeded(6)), dashRecipe(seeded(8))]) {
    for (const layer of recipe.layers) {
      const freqs = layer.type === 'ring' ? layer.partials.map((p) => p.freq) : [layer.freq];
      for (const f of freqs) assert.ok(f > 20 && f < 16000, `audible frequency ${f}`);
    }
  }
});

test('a blow on a guard rings, scrapes and lands with weight; a guard breaking is its own PER-CUNK', () => {
  const block = blockRecipe(seeded(9));
  assert.ok(block.layers.some((layer) => layer.type === 'noise' && layer.filter === 'bandpass' && layer.sweepTo < layer.freq), 'the edges scrape');
  assert.ok(block.layers.some((layer) => layer.type === 'tone' && layer.freq < 200 && layer.slideTo < layer.freq), 'the braced arm takes the weight');
  const crunch = guardBreakRecipe(seeded(9));
  assert.ok(crunch.layers.some((layer) => !layer.at && layer.type === 'noise' && layer.filter === 'highpass'), 'PER: the blow lands at once');
  const late = crunch.layers.filter((layer) => (layer.at ?? 0) > 0);
  const give = Math.min(...late.map((layer) => layer.at));
  assert.ok(give >= 0.02 && give <= 0.05, 'CUNK: the guard caves a beat later');
  assert.ok(late.some((layer) => layer.type === 'tone' && layer.freq < 120 && layer.slideTo < layer.freq), 'a thud that drops');
  assert.ok(late.some((layer) => layer.type === 'noise' && layer.sweepTo < layer.freq), 'a crunch that caves in');
  assert.ok(late.filter((layer) => layer.type === 'ring' && layer.at > give + 0.05).length >= 3, 'then mail and buckles rattle');
  assert.ok(crunch.reverb > block.reverb, 'and it rings out further than a blow on a guard');
});

test('no two hits sound identical', () => {
  const rand = seeded(7);
  const a = swordHitRecipe(rand, { strike: 1 });
  const b = swordHitRecipe(rand, { strike: 1 });
  const ringA = a.layers.find((layer) => layer.type === 'ring').partials[0].freq;
  const ringB = b.layers.find((layer) => layer.type === 'ring').partials[0].freq;
  assert.notEqual(ringA, ringB);
});

test('sounds are panned toward their side and quieter far away', () => {
  // facing -z (yaw 0), a hit off to the right (+x) pans right
  const right = spatialize({ x: 0, z: 0 }, 0, { x: 5, z: 0 });
  const left = spatialize({ x: 0, z: 0 }, 0, { x: -5, z: 0 });
  assert.ok(right.pan > 0.5 && left.pan < -0.5);
  const near = spatialize({ x: 0, z: 0 }, 0, { x: 0, z: -2 });
  const far = spatialize({ x: 0, z: 0 }, 0, { x: 0, z: -30 });
  assert.ok(near.gain > far.gain && far.gain >= 0.12);
});

test('drawing the sword: steel hisses along the scabbard, rising, then the blade clears it and sings', () => {
  const draw = unsheatheRecipe(() => 0.5);
  const hiss = draw.layers.find((layer) => layer.type === 'noise' && layer.sweepTo);
  assert.ok(hiss.sweepTo > hiss.freq, 'the hiss climbs as the blade speeds up');
  const song = draw.layers.find((layer) => layer.type === 'ring');
  assert.ok(song.at >= hiss.attack, 'the ring comes as the point clears, not before');
  assert.ok(song.partials[0].decay > 1, 'and hangs in the air');
});
