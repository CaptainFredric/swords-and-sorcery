import test from 'node:test';
import assert from 'node:assert/strict';
import { SPELLS } from './spells.mjs';
import { galeAt, galeOnBody, galeRecoil, galeShove } from './gale.mjs';
import { MOVEMENT, createMovementState, launchBody, movePlayer } from './movement.mjs';

const gale = SPELLS.gale;
const origin = { x: 0, y: 1.35, z: 0 };
const ahead = { x: 0, y: 0, z: -1 };
const at = (distance, angleDeg = 0) => {
  const a = angleDeg * Math.PI / 180;
  return { x: Math.sin(a) * distance, y: 1.35, z: -Math.cos(a) * distance };
};

test('the gust: its pressure reaches wider and further than its heart, and both fade evenly, with nothing behind', () => {
  const heart = galeAt(gale, origin, ahead, at(2));
  assert.ok(heart.pressure > 0.5 && heart.exposure > 0.3, 'close in front: shoved hard and stung');
  // past the heart's reach, and wider than its angle: still shoved, not stung
  const beyond = galeAt(gale, origin, ahead, at(gale.cone.reach + 1));
  assert.ok(beyond.pressure > 0 && beyond.exposure === 0);
  const wide = galeAt(gale, origin, ahead, at(2.5, gale.cone.halfAngleDeg + 6));
  assert.ok(wide.pressure > 0 && wide.exposure === 0);
  assert.equal(galeAt(gale, origin, ahead, at(3, 180)).pressure, 0, 'nothing behind');
  // no steps anywhere: small moves change it only a little, and it only ever falls moving out
  let last = Infinity;
  for (let d = 0.2; d < gale.cone.pressureReach + 0.5; d += 0.05) {
    const p = galeAt(gale, origin, ahead, at(d)).pressure;
    assert.ok(p <= last + 1e-12, `falls with distance (${d.toFixed(2)})`);
    if (Number.isFinite(last)) assert.ok(last - p < 0.05, `evenly (${d.toFixed(2)})`);
    last = p;
  }
  last = Infinity;
  for (let a = 0; a < gale.cone.pressureHalfAngleDeg + 3; a += 0.5) {
    const p = galeAt(gale, origin, ahead, at(3, a)).pressure;
    assert.ok(p <= last + 1e-12 && (Number.isFinite(last) ? last - p < 0.05 : true), `and with angle (${a})`);
    last = p;
  }
});

test('the shove runs with the gust, lifting a little, far harder close to the hand; a pull is the same field reversed', () => {
  const shoveAt = (d) => galeShove(gale, origin, ahead, at(d), galeAt(gale, origin, ahead, at(d)).pressure);
  const near = shoveAt(1);
  const far = shoveAt(8);
  assert.ok(near.z < 0 && near.y > 0, 'away along the gust, and up');
  assert.ok(Math.hypot(near.x, near.z) > Math.hypot(far.x, far.z) * 2, 'much harder close in');
  const pull = galeShove(gale, origin, ahead, at(1.5), 0.8, -1);
  const push = galeShove(gale, origin, ahead, at(1.5), 0.8, 1);
  assert.ok(Math.abs(pull.z + push.z) < 1e-9 && pull.z > 0, 'toward the caster');
});

const flat = { floors: [{ id: 'floor', center: [0, -0.15, 0], size: [60, 0.3, 60], y: 0 }], ramps: [], solids: [] };

test('driven into the ground, the gust throws its caster back off it: the way depends on the aim; into open air, nothing', () => {
  const down = galeRecoil(gale, origin, { x: 0, y: -1, z: 0 }, flat);
  assert.ok(down && down.y > 0 && Math.abs(down.x) + Math.abs(down.z) < 1e-9, 'straight down: straight up');
  const n = Math.SQRT1_2;
  const downBehind = galeRecoil(gale, origin, { x: 0, y: -n, z: n }, flat);
  assert.ok(downBehind.z < 0 && downBehind.y > 0, 'down and behind: forward and up');
  const downAhead = galeRecoil(gale, origin, { x: 0, y: -n, z: -n }, flat);
  assert.ok(downAhead.z > 0 && downAhead.y > 0, 'down and ahead: back and up');
  const downLeft = galeRecoil(gale, origin, { x: -n, y: -n, z: 0 }, flat);
  assert.ok(downLeft.x > 0 && downLeft.y > 0, 'down to the left: right and up');
  assert.equal(galeRecoil(gale, origin, { x: 0, y: 0.6, z: -0.8 }, flat), null, 'into the sky: nothing to push off');
  // full strength close to the ground; weaker from high above it, and nothing beyond its reach
  const crouched = galeRecoil(gale, { x: 0, y: 0.85, z: 0 }, { x: 0, y: -1, z: 0 }, flat);
  assert.ok(crouched.y >= down.y - 1e-9);
  const high = galeRecoil(gale, { x: 0, y: gale.recoil.reach - 0.6, z: 0 }, { x: 0, y: -1, z: 0 }, flat);
  assert.ok(high.y > 0 && high.y < down.y * 0.5, 'far above the ground, a little');
  assert.equal(galeRecoil(gale, { x: 0, y: gale.recoil.reach + 0.5, z: 0 }, { x: 0, y: -1, z: 0 }, flat), null);
});

// a knight standing on open ground, left to fly after a Gale into the ground (no keys held)
function flight(direction, { rising = 0 } = {}) {
  let state = createMovementState({ x: 0, y: 0, z: 0 });
  state.velocity.y = rising;
  if (rising) state.grounded = false;
  const recoil = galeRecoil(gale, { x: 0, y: 1.35, z: 0 }, direction, flat);
  launchBody(state, recoil, recoil.maxUp);
  const risingAt = state.velocity.y;
  let apex = 0;
  let t = 0;
  do {
    state = movePlayer(state, { forward: 0, right: 0, yaw: 0 }, 1 / 60, t, flat);
    apex = Math.max(apex, state.position.y);
    t += 1 / 60;
  } while (!state.grounded && t < 4);
  return { apex, risingAt, travel: Math.hypot(state.position.x, state.position.z), z: state.position.z };
}

test('a Gale into the ground is real movement: straight down lifts far higher than a jump; down and back carries forward', () => {
  const jump = (MOVEMENT.jumpImpulse ** 2) / (2 * MOVEMENT.gravity);
  const up = flight({ x: 0, y: -1, z: 0 });
  assert.ok(up.apex > jump * 1.8, `straight down: ${up.apex.toFixed(2)} m up (a jump: ${jump.toFixed(2)} m)`);
  assert.ok(up.travel < 0.05, 'and straight back down');
  const n = Math.SQRT1_2;
  const vault = flight({ x: 0, y: -n, z: n });
  assert.ok(vault.z < -3 && vault.apex > 0.8, `down and back: forward ${(-vault.z).toFixed(2)} m, ${vault.apex.toFixed(2)} m up`);
  // capped sanely: already rising (a jump), a launch leaves no more than its cap
  const jumped = flight({ x: 0, y: -1, z: 0 }, { rising: MOVEMENT.jumpImpulse });
  assert.ok(jumped.risingAt <= gale.recoil.maxUp + 1e-9 && jumped.risingAt >= MOVEMENT.jumpImpulse);
  // and a fall under way is caught, not merely slowed
  const falling = flight({ x: 0, y: -1, z: 0 }, { rising: -6 });
  assert.ok(falling.risingAt > MOVEMENT.jumpImpulse, `falling, thrown back up at ${falling.risingAt.toFixed(2)} m/s`);
});

test('the gust is broad and reaches well out: a knight far out in its pressure is still visibly shoved, and not hurt', () => {
  const body = (d, deg = 0) => galeOnBody(gale, origin, ahead, { x: Math.sin(deg * Math.PI / 180) * d, y: 0, z: -Math.cos(deg * Math.PI / 180) * d });
  for (const [d, deg] of [[8, 0], [9, 10], [7, 25]]) {
    const caught = body(d, deg);
    const shove = galeShove(gale, origin, ahead, caught.point, caught.pressure);
    assert.ok(Math.hypot(shove.x, shove.z) > 2.5, `at ${d} m, ${deg} degrees off: shoved at ${Math.hypot(shove.x, shove.z).toFixed(1)} m/s`);
    assert.equal(caught.exposure, 0, 'no sting out here');
  }
  // the heart's middle is full strength across, not just along its line
  assert.ok(Math.abs(body(3, 8).pressure - body(3, 0).pressure) < 0.02);
});

test('a gust that only grazes a wall hardly throws its caster; one driven square into it throws them back', () => {
  // a wall half a metre to the right, running the way the caster faces
  const walled = { floors: [], ramps: [], solids: [{ id: 'wall', center: [0.65, 1.5, -3], size: [0.3, 3, 8] }] };
  const eye = { x: 0, y: 1.35, z: 0 };
  const square = galeRecoil(gale, eye, { x: 1, y: 0, z: 0 }, walled);
  const along = Math.sin(0.2);
  const graze = galeRecoil(gale, eye, { x: along, y: 0, z: -Math.cos(0.2) }, walled);
  assert.ok(square.x < -gale.recoil.push * 0.7, 'straight into it: back off it, hard');
  assert.ok(graze, 'the graze still meets the wall');
  assert.ok(Math.hypot(graze.x, graze.z) < Math.hypot(square.x, square.z) * 0.3, 'a glancing gust: a nudge');
});
