import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOTH_CHAINS, createClothState, isTeleport, landCloth, resetCloth, stepCloth } from './spellbladeCloth.mjs';

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

test('running forward trails the back banner behind (a little, at a steady pace) and keeps the front tabard off the legs', () => {
  const state = run(createClothState(), 2.5, () => ({ forward: 6, right: 0 }));
  assert.ok(state.chains.back.swing > 0.12 && state.chains.back.swing < 0.3, `back banner should trail a little, got ${state.chains.back.swing}`);
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

function runBody(state, seconds, bodyAt, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) stepCloth(state, dt, { forward: 0, right: 0 }, bodyAt(t));
  return state;
}

test('a leaning body leaves the cape hanging toward the ground instead of leaning with it', () => {
  const forward = runBody(createClothState(), 2, () => ({ tilt: { forward: 0.25, right: 0 } }));
  assert.ok(forward.chains.front.swing < -0.1, `leaning forward, the front tabard hangs forward, got ${forward.chains.front.swing}`);
  assert.ok(Math.abs(forward.chains.back.swing - CLOTH_CHAINS.back.swingLimits[0]) < 1e-6, 'the cape settles against the back');
  const back = runBody(createClothState(), 2, () => ({ tilt: { forward: -0.25, right: 0 } }));
  assert.ok(back.chains.back.swing > 0.1, 'leaning back lets it fall away behind');
  assert.ok(back.chains.front.swing <= CLOTH_CHAINS.front.swingLimits[1] + 1e-9, 'but the front tabard never goes into the legs');
  const right = runBody(createClothState(), 2, () => ({ tilt: { forward: 0, right: 0.2 } }));
  assert.ok(right.chains.back.side > 0.1, 'leaning right: it hangs right of where the body carries it');
});

test('tipping and turning leave the cape trailing the motion, then it settles once the body stops', () => {
  const tipping = runBody(createClothState(), 0.25, (t) => ({ tilt: { forward: t * 0.6, right: 0 }, tiltRate: { forward: 0.6, right: 0 } }));
  const still = runBody(createClothState(), 0.25, () => ({ tilt: { forward: 0.15, right: 0 } }));
  assert.ok(tipping.chains.back.swing > still.chains.back.swing, 'tipping forward, the cape lags behind');
  const spinning = runBody(createClothState(), 0.6, () => ({ turn: 3 }));
  assert.ok(spinning.chains.back.side > 0.1, `turning right swings the cape out behind the turn, got ${spinning.chains.back.side}`);
  assert.ok(spinning.chains.front.side < 0, 'the front tabard the other way');
  assert.ok(spinning.chains.back.swing > 0, 'and a spin flares the cape out');
  runBody(spinning, 3, () => ({ turn: 0 }));
  assert.ok(Math.abs(spinning.chains.back.side) < 0.01 && Math.abs(spinning.chains.back.swing) < 0.01);
  for (const [name, chain] of Object.entries(runBody(createClothState(), 1, () => ({ turn: 40, tilt: { forward: 3, right: -3 } })).chains)) {
    assert.ok(Math.abs(chain.side) <= CLOTH_CHAINS[name].sideLimit + 1e-9, `${name} side stays in limits`);
    assert.ok(chain.swing >= CLOTH_CHAINS[name].swingLimits[0] - 1e-9 && chain.swing <= CLOTH_CHAINS[name].swingLimits[1] + 1e-9);
  }
});

// the range each chain moved through over a stretch of steps, as the eye sees it: in the world, with the body's own
// lean added back (a cloth that hangs still while the body sways is moving against the body, not in the world)
function sweep(state, seconds, velocityAt, bodyAt, dt = 1 / 60) {
  const seen = { back: { swing: [], side: [] }, front: { swing: [], side: [] } };
  for (let t = 0; t < seconds; t += dt) {
    const body = bodyAt(t);
    stepCloth(state, dt, velocityAt(t), body);
    for (const name of ['back', 'front']) {
      seen[name].swing.push(state.chains[name].swing + (body.tilt?.forward ?? 0));
      seen[name].side.push(state.chains[name].side - (body.tilt?.right ?? 0));
    }
  }
  const range = (values) => Math.max(...values) - Math.min(...values);
  return { back: { swing: range(seen.back.swing), side: range(seen.back.side) }, front: { swing: range(seen.front.swing), side: range(seen.front.side) } };
}

test('standing, a breath does not stir it; running steadily, the stride does not set it flapping', () => {
  // idle breathing: the body rises and leans a hair, slowly
  const idle = createClothState();
  sweep(idle, 1, () => ({ forward: 0, right: 0 }), () => ({}));
  const breathing = sweep(idle, 4, () => ({ forward: 0, right: 0 }), (t) => ({ tilt: { forward: 0.03 * Math.sin(t * 1.6), right: 0.015 * Math.sin(t * 0.8) } }));
  assert.ok(breathing.back.swing < 0.06 && breathing.back.side < 0.06, `standing still (within a degree or two): ${JSON.stringify(breathing.back)}`);
  // a steady run: the torso rocks and dips with every step (the travel itself is the body's own, steady but for a
  // remote knight's snapshot steps). Flapping is the cloth moving against the body, so that is what is measured here
  const running = createClothState();
  for (let t = 0; t < 2; t += 1 / 60) stepCloth(running, 1 / 60, { forward: 6.5, right: 0 }, { tilt: { forward: 0.08, right: 0 } });
  const seen = { back: { swing: [], side: [] }, front: { swing: [], side: [] } };
  for (let t = 0; t < 3; t += 1 / 60) {
    const jitter = Math.floor(t * 20) % 2 ? 0.15 : -0.15;
    stepCloth(running, 1 / 60, { forward: 6.5 + jitter, right: jitter / 3 }, {
      tilt: { forward: 0.08 + 0.06 * Math.sin(t * 18.2), right: 0.07 * Math.sin(t * 9.1) },
    });
    for (const name of ['back', 'front']) {
      seen[name].swing.push(running.chains[name].swing);
      seen[name].side.push(running.chains[name].side);
    }
  }
  const range = (values) => Math.max(...values) - Math.min(...values);
  for (const name of ['back', 'front']) {
    const moved = { swing: range(seen[name].swing), side: range(seen[name].side) };
    assert.ok(moved.swing < 0.08 && moved.side < 0.08, `${name} at a steady run: ${JSON.stringify(moved)}`);
  }
});

test('speeding up, it swings back past its trail, then settles; a turn leaves it swinging out, then it settles', () => {
  const state = createClothState();
  sweep(state, 1, () => ({ forward: 0, right: 0 }), () => ({}));
  // from a standstill to a sprint in a third of a second
  let peak = 0;
  for (let t = 0; t < 0.6; t += 1 / 60) {
    stepCloth(state, 1 / 60, { forward: Math.min(1, t / 0.33) * 10, right: 0 }, {});
    peak = Math.max(peak, state.chains.back.swing);
  }
  const settled = sweep(state, 3, () => ({ forward: 10, right: 0 }), () => ({}));
  const trail = state.chains.back.swing;
  assert.ok(peak > trail + 0.12, `it visibly swings back as he sets off (peak ${peak.toFixed(2)}, trail ${trail.toFixed(2)})`);
  assert.ok(settled.back.swing < peak, 'then settles');
  let last = null;
  for (let t = 0; t < 1; t += 1 / 60) {
    stepCloth(state, 1 / 60, { forward: 10, right: 0 }, {});
    if (t > 0.8) last = last === null ? state.chains.back.swing : last;
  }
  assert.ok(Math.abs(state.chains.back.swing - last) < 0.01, 'and holds still at a steady sprint');
});

test('a landing flips both ends out (the back backward, the front forward), then they fall back and settle', () => {
  const state = run(createClothState(), 1, () => ({ forward: 0, right: 0 }));
  landCloth(state, 1);
  run(state, 0.1, () => ({ forward: 0, right: 0 }));
  assert.ok(state.chains.back.swing > 0.05, `the back flips backward: ${state.chains.back.swing.toFixed(3)}`);
  assert.ok(state.chains.front.swing < -0.05, `the front flips forward: ${state.chains.front.swing.toFixed(3)}`);
  run(state, 2.5, () => ({ forward: 0, right: 0 }));
  assert.ok(Math.abs(state.chains.back.swing) < 0.01 && Math.abs(state.chains.front.swing) < 0.01, 'and hangs still again');
  // a light landing, a lighter flip
  const flip = (strength) => {
    const cloth = run(createClothState(), 1, () => ({ forward: 0, right: 0 }));
    landCloth(cloth, strength);
    return run(cloth, 0.1, () => ({ forward: 0, right: 0 })).chains.back.swing;
  };
  assert.ok(flip(0.3) > 0 && flip(0.3) < flip(1) * 0.6, 'lighter from a lighter landing');
});
