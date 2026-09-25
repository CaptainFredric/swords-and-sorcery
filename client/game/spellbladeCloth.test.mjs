import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOTH_CHAINS, createClothState, isTeleport, resetCloth, stepCloth } from './spellbladeCloth.mjs';

function run(state, seconds, velocityAt, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) stepCloth(state, dt, velocityAt(t));
  return state;
}

test('cloth stays on the animated pose when the character stands still', () => {
  const state = run(createClothState(), 2, () => ({ forward: 0, right: 0 }));
  for (const chain of Object.values(state.chains)) {
    assert.equal(chain.swing, 0);
    assert.equal(chain.side, 0);
  }
});

test('running forward trails the back banner behind and keeps the front tabard off the legs', () => {
  const state = run(createClothState(), 1.5, () => ({ forward: 6, right: 0 }));
  assert.ok(state.chains.back.swing > 0.3, `back banner should trail, got ${state.chains.back.swing}`);
  assert.ok(state.chains.back.swing <= CLOTH_CHAINS.back.swingLimits[1]);
  assert.ok(state.chains.front.swing <= CLOTH_CHAINS.front.swingLimits[1] + 1e-9);
});

test('a sudden stop swings the cloth forward, then it settles back', () => {
  const state = run(createClothState(), 1.5, () => ({ forward: 6, right: 0 }));
  run(state, 0.12, () => ({ forward: 0, right: 0 }));
  assert.ok(state.chains.front.swing < -0.05, `front tabard should swing forward, got ${state.chains.front.swing}`);
  run(state, 3, () => ({ forward: 0, right: 0 }));
  assert.ok(Math.abs(state.chains.front.swing) < 0.01);
  assert.ok(Math.abs(state.chains.back.swing) < 0.01);
});

test('strafing swings the cloth sideways within limits', () => {
  const state = run(createClothState(), 0.2, (t) => ({ forward: 0, right: t < 0.05 ? 0 : 6 }));
  assert.ok(state.chains.back.side < 0, 'accelerating right should leave the tip behind on the left');
  for (const [name, chain] of Object.entries(state.chains)) {
    assert.ok(Math.abs(chain.side) <= CLOTH_CHAINS[name].sideLimit + 1e-9);
  }
});

test('invalid time steps and velocities are ignored', () => {
  const state = createClothState();
  stepCloth(state, 0, { forward: 5, right: 0 });
  stepCloth(state, Number.NaN, { forward: 5, right: 0 });
  stepCloth(state, 1 / 60, { forward: Number.NaN, right: 0 });
  assert.equal(state.primed, false);
});

test('teleports are detected and reset clears motion', () => {
  assert.equal(isTeleport({ x: 0, y: 0, z: 0 }, { x: 0.2, y: 0, z: 0.1 }), false);
  assert.equal(isTeleport({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }), true);
  const state = run(createClothState(), 1, () => ({ forward: 6, right: 0 }));
  resetCloth(state);
  assert.equal(state.chains.back.swing, 0);
  assert.equal(state.primed, false);
});
