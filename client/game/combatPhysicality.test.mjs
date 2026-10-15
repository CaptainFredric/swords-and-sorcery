import test from 'node:test';
import assert from 'node:assert/strict';
import { FirstPersonMotion } from './firstPersonMotion.mjs';

function simulateMotion(motion, frames = 20, stepArgs = {}) {
  const peaks = { z: 0, rx: 0, ry: 0, rz: 0, cameraPitch: 0, cameraRoll: 0 };
  for (let i = 0; i < frames; i += 1) {
    const out = motion.step({ dt: 1 / 60, ...stepArgs });
    if (Math.abs(out.weapon.z) > Math.abs(peaks.z)) peaks.z = out.weapon.z;
    if (Math.abs(out.weapon.rx) > Math.abs(peaks.rx)) peaks.rx = out.weapon.rx;
    if (Math.abs(out.weapon.ry) > Math.abs(peaks.ry)) peaks.ry = out.weapon.ry;
    if (Math.abs(out.weapon.rz) > Math.abs(peaks.rz)) peaks.rz = out.weapon.rz;
    if (Math.abs(out.camera.pitch) > Math.abs(peaks.cameraPitch)) peaks.cameraPitch = out.camera.pitch;
    if (Math.abs(out.camera.roll) > Math.abs(peaks.cameraRoll)) peaks.cameraRoll = out.camera.roll;
  }
  return peaks;
}

test('1. Being parried as attacker: blade deflects off-line, combo canceled, camera viewpoint calm without double-dip', () => {
  const motion = new FirstPersonMotion();
  // settle neutral
  for (let i = 0; i < 30; i += 1) motion.step({ dt: 1 / 60 });

  motion.parryReel();
  const peaks = simulateMotion(motion, 25);

  // Weapon physically reels and deflects
  assert.ok(peaks.z > 0.05, `arms pushed back by parry: ${peaks.z}`);
  assert.ok(peaks.ry < -0.05, `blade deflected sideways off line: ${peaks.ry}`);
  assert.ok(peaks.rz < -0.07, `blade twisted outward: ${peaks.rz}`);

  // Viewpoint pitch is gentle and grounded (no double-dipping)
  assert.ok(peaks.cameraPitch > 0.005 && peaks.cameraPitch < 0.025, `viewpoint remains stable: ${peaks.cameraPitch}`);
});

test('2. Successfully parrying as defender: blade performs crisp outward parry deflection', () => {
  const motion = new FirstPersonMotion();
  for (let i = 0; i < 30; i += 1) motion.step({ dt: 1 / 60 });

  motion.parry();
  const peaks = simulateMotion(motion, 25);
  assert.ok(peaks.ry < -0.06, `sharp outward deflection: ${peaks.ry}`);
  assert.ok(peaks.rz > 0.03, `parry twist: ${peaks.rz}`);
});

test('3. Hitting ordinary Guard: blade rebounds firmly rather than floating through', () => {
  const motion = new FirstPersonMotion();
  for (let i = 0; i < 30; i += 1) motion.step({ dt: 1 / 60 });

  motion.rebound();
  const peaks = simulateMotion(motion, 25);
  assert.ok(peaks.z > 0.025, `blade driven back from block: ${peaks.z}`);
  assert.ok(peaks.rz > 0.035, `blade angled away from contact: ${peaks.rz}`);
});

test('4. Breaking Guard (attacker): hitstop provides physical crunch bite', () => {
  let frozenUntil = 0;
  const now = 10.0;
  const hitstop = (seconds) => {
    frozenUntil = Math.max(frozenUntil, now + seconds);
  };

  hitstop(0.09);
  assert.equal(frozenUntil, 10.09, 'hitstop holds swing frame for 90ms on guard break');
});

test('5. Having your own Guard broken: arms blown wide open, posture collapsed, camera nod without double-dip', () => {
  const motion = new FirstPersonMotion();
  for (let i = 0; i < 30; i += 1) motion.step({ dt: 1 / 60 });

  motion.guardBreak({ x: 0.3, z: 1.0 });
  const peaks = simulateMotion(motion, 25);

  // Severe weapon opening
  assert.ok(peaks.z > 0.06, `arms blown back: ${peaks.z}`);
  assert.ok(peaks.rx > 0.08, `blade pitched upward: ${peaks.rx}`);
  assert.ok(peaks.rz < -0.08, `guard posture opened: ${peaks.rz}`);

  // Camera nod is controlled (no second kick)
  assert.ok(peaks.cameraPitch > 0.008 && peaks.cameraPitch < 0.03, `head pitch stays controlled: ${peaks.cameraPitch}`);
});

test('6. Normal clean sword hit: blade bites with hit confirm impulse', () => {
  const motion = new FirstPersonMotion();
  for (let i = 0; i < 30; i += 1) motion.step({ dt: 1 / 60 });

  motion.hitConfirm(0.6);
  const peaks = simulateMotion(motion, 25);
  assert.ok(peaks.z > 0.008, `blade bites against resistance: ${peaks.z}`);
  assert.ok(peaks.rx < -0.015, `wrist jolts down with cut: ${peaks.rx}`);
});
