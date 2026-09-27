import test from 'node:test';
import assert from 'node:assert/strict';
import { FP_MOTION, FirstPersonMotion, Spring } from './firstPersonMotion.mjs';
import { MOVEMENT, SPRINT } from '../../shared/src/movement.mjs';

function run(motion, frames, frame) {
  let out = null;
  for (let i = 0; i < frames; i += 1) out = motion.step({ dt: 1 / 60, ...frame(i) });
  return out;
}

function peak(motion, frames, frame, pick) {
  let best = 0;
  for (let i = 0; i < frames; i += 1) {
    const value = pick(motion.step({ dt: 1 / 60, ...frame(i) }));
    if (Math.abs(value) > Math.abs(best)) best = value;
  }
  return best;
}

test('a spring returns to rest after an impulse, at any frame rate', () => {
  for (const dt of [1 / 144, 1 / 30, 0.1]) {
    const spring = new Spring(200, 24);
    spring.impulse(2);
    let max = 0;
    for (let t = 0; t < 1.2; t += dt) max = Math.max(max, Math.abs(spring.step(dt)));
    assert.ok(max > 0.02 && max < 0.2, `peak ${max} at dt ${dt}`);
    assert.ok(Math.abs(spring.value) < 1e-3, `settles at dt ${dt}`);
  }
});

test('standing still, the view does not bob and the field of view rests at base', () => {
  const motion = new FirstPersonMotion();
  const out = run(motion, 120, () => ({ speed: 0 }));
  assert.ok(Math.abs(out.camera.y) < 1e-6);
  assert.ok(Math.abs(out.fov - FP_MOTION.baseFov) < 0.01);
  assert.ok(out.weapon.y < 0, 'neutral hands sit lower than the authored pose');
});

test('the stride follows distance: one footfall per step length', () => {
  const motion = new FirstPersonMotion();
  run(motion, 60, () => ({ speed: MOVEMENT.runSpeed }));
  // 1 s at 7.5 m/s, less the moment it takes the moving weight to rise
  assert.ok(Math.abs(motion.stride - MOVEMENT.runSpeed / FP_MOTION.runStep) < 0.05, `stride ${motion.stride}`);
});

test('sprinting widens the view gradually and bobs harder than running, but the camera stays calm', () => {
  const runMotion = new FirstPersonMotion();
  const runDip = peak(runMotion, 120, () => ({ speed: MOVEMENT.runSpeed }), (out) => out.camera.y);
  const sprintMotion = new FirstPersonMotion();
  const early = sprintMotion.step({ dt: 1 / 60, speed: SPRINT.speed });
  assert.ok(early.fov < FP_MOTION.baseFov + 1, 'the field of view eases in');
  const sprintDip = peak(sprintMotion, 120, () => ({ speed: SPRINT.speed }), (out) => out.camera.y);
  assert.ok(Math.abs(sprintDip) > Math.abs(runDip));
  assert.ok(Math.abs(sprintDip) < 0.02, `camera dip ${sprintDip} stays small`);
  const settled = run(sprintMotion, 60, () => ({ speed: SPRINT.speed }));
  assert.ok(Math.abs(settled.fov - (FP_MOTION.baseFov + FP_MOTION.sprintFov)) < 0.3);
});

test('building a sprint drags the arms back; running it off swings them forward', () => {
  const motion = new FirstPersonMotion();
  run(motion, 30, () => ({ speed: MOVEMENT.runSpeed }));
  const building = peak(motion, 20, (i) => ({ speed: MOVEMENT.runSpeed + (SPRINT.speed - MOVEMENT.runSpeed) * Math.min(1, i / 20) }), (out) => motion.lag.z.value);
  assert.ok(building > 0.005, `arms dragged back ${building}`);
  run(motion, 60, () => ({ speed: SPRINT.speed }));
  const slowing = peak(motion, 20, (i) => ({ speed: SPRINT.speed - (SPRINT.speed - MOVEMENT.runSpeed) * Math.min(1, i / 12) }), () => motion.lag.z.value);
  assert.ok(slowing < -0.005, `arms swing forward ${slowing}`);
});

test('turning makes the arms trail and bank, and they settle when the turn stops', () => {
  const motion = new FirstPersonMotion();
  let yaw = 0;
  const turning = run(motion, 20, () => { yaw -= 0.05; return { yaw }; });
  assert.ok(turning.weapon.ry < -0.02, `trails the turn ${turning.weapon.ry}`);
  const still = run(motion, 90, () => ({ yaw }));
  assert.ok(Math.abs(still.weapon.ry) < 0.002);
});

test('landing, damage, blocks and parries kick briefly and recover', () => {
  const motion = new FirstPersonMotion();
  run(motion, 10, () => ({}));
  motion.land(9);
  const landDip = peak(motion, 20, () => ({}), (out) => out.camera.y);
  assert.ok(landDip < -0.03 && landDip > -0.09, `landing dip ${landDip}`);
  motion.land(1);   // a step down: nothing
  motion.damage({ x: 1, z: 0 }, 34);
  const roll = peak(motion, 20, () => ({}), (out) => out.camera.roll);
  assert.ok(Math.abs(roll) > 0.02 && Math.abs(roll) < 0.08, `damage roll ${roll}`);
  motion.block();
  const recoil = peak(motion, 20, () => ({}), (out) => out.weapon.z);
  assert.ok(recoil > 0.03, 'the blade is driven back toward the viewer');
  motion.parry();
  const deflect = peak(motion, 20, () => ({}), (out) => out.weapon.ry);
  assert.ok(deflect < -0.06);
  const rest = run(motion, 90, () => ({}));
  assert.ok(Math.abs(rest.camera.y) < 1e-3 && Math.abs(rest.camera.roll) < 1e-3 && Math.abs(rest.weapon.z) < 1e-3);
});

test('actions take the arms: the relaxed neutral offset and the sprint pump fade out while attacking', () => {
  const motion = new FirstPersonMotion();
  run(motion, 60, () => ({ speed: SPRINT.speed }));
  const attacking = run(motion, 30, () => ({ speed: SPRINT.speed, state: 'attack' }));
  assert.ok(attacking.neutral < 0.02);
  assert.ok(Math.abs(attacking.pump) < 0.02);
});
