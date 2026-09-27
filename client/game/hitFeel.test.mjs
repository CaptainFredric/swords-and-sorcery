import test from 'node:test';
import assert from 'node:assert/strict';
import { blowDirection, hitKick, hitstopSeconds, impactPoint } from './hitFeel.mjs';
import { blockRecipe, castRecipe, dashRecipe, killRecipe, parryRecipe, spatialize, swingRecipe, swordHitRecipe } from './sound/soundRecipes.mjs';

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

test('the finisher and the killing blow freeze and kick harder, but only briefly', () => {
  assert.ok(hitstopSeconds({ strike: 2 }) > hitstopSeconds({ strike: 0 }));
  assert.ok(hitstopSeconds({ kill: true }) > hitstopSeconds({ strike: 2 }));
  assert.ok(hitstopSeconds({ kill: true }) <= 0.12, 'short enough not to fall behind the server swing');
  assert.ok(hitKick({ kill: true }) >= hitKick({ strike: 2 }) && hitKick({ strike: 2 }) > hitKick({ strike: 0 }));
});

test('hit sounds layer a crack, a crunch, a body thump and a steel ring; the finisher adds weight', () => {
  const light = swordHitRecipe(seeded(1), { strike: 0 });
  const heavy = swordHitRecipe(seeded(1), { strike: 2 });
  const kill = swordHitRecipe(seeded(1), { kill: true });
  assert.ok(light.layers.some((layer) => layer.type === 'ring'));
  assert.ok(light.layers.some((layer) => layer.type === 'noise' && layer.filter === 'highpass'));
  assert.ok(light.layers.some((layer) => layer.type === 'tone' && layer.slideTo < layer.freq), 'the thump drops in pitch');
  assert.ok(heavy.layers.length > light.layers.length);
  assert.ok(kill.layers.length > heavy.layers.length && kill.reverb > heavy.reverb);
  assert.ok(killRecipe(seeded(5)).reverb >= 0.5, 'the killing blow rings out in the courtyard');
  for (const recipe of [light, heavy, kill, blockRecipe(seeded(2)), parryRecipe(seeded(3)), swingRecipe(seeded(4)), killRecipe(seeded(5)), castRecipe(seeded(6)), dashRecipe(seeded(8))]) {
    for (const layer of recipe.layers) {
      const freqs = layer.type === 'ring' ? layer.partials.map((p) => p.freq) : [layer.freq];
      for (const f of freqs) assert.ok(f > 20 && f < 16000, `audible frequency ${f}`);
    }
  }
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
