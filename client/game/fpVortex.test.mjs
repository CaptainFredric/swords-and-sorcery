import test from 'node:test';
import assert from 'node:assert/strict';
import { FP_VORTEX, vortexBladeInFront, vortexSpinPose, vortexStartupPose } from './fpVortex.mjs';
import { REST_ARM } from './fpSlash.mjs';
import { ULTIMATES, vortexWindup } from '../../shared/src/ultimates.mjs';

// The Blazing Vortex in my own arms: the view never turns with the spin; the sword goes round as one thing, seen
// crossing the view from right to left each time the real blade passes in front, and carried round out of sight.

const DEG = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('the view is never turned by the spin: no yaw, no pitch, only a degree or two of lean', () => {
  for (let deg = -180; deg <= 180; deg += 5) {
    const { look } = vortexSpinPose(deg * DEG);
    assert.equal(look.yaw, 0);
    assert.equal(look.pitch, 0);
    assert.ok(Math.abs(look.roll) <= 2 * DEG, `roll ${(look.roll / DEG).toFixed(2)} degrees at ${deg}`);
  }
  for (let share = 0; share <= 1; share += 0.05) {
    const { look } = vortexStartupPose(share, vortexWindup({ commitAt: 1 }, share * ULTIMATES.vortex.startupSec + 1 - ULTIMATES.vortex.startupSec));
    assert.ok(look.yaw === 0 && look.pitch === 0 && Math.abs(look.roll) <= 2 * DEG);
  }
});

test('in front, the blade is where the real blade is: level, drooping a little, crossing from my right to my left', () => {
  const ahead = vortexSpinPose(0).arm;
  assert.ok(ahead.blade[2] < -0.95, 'straight ahead as the real blade points straight ahead');
  assert.ok(ahead.blade[1] < 0 && ahead.blade[1] > -0.3, 'drooping a little');
  // turned to my right it is on my right; to my left, on my left (the hands go with it)
  const right = vortexSpinPose(-60 * DEG).arm;
  const left = vortexSpinPose(60 * DEG).arm;
  assert.ok(right.blade[0] > 0.5 && right.wrist[0] > ahead.wrist[0]);
  assert.ok(left.blade[0] < -0.5 && left.wrist[0] < ahead.wrist[0]);
  assert.equal(vortexBladeInFront(0), true);
  assert.equal(vortexBladeInFront(Math.PI), false);
  assert.equal(vortexBladeInFront((FP_VORTEX.frontDeg - 1) * DEG), true);
  // both hands on the grip all the way round
  for (let deg = -180; deg <= 180; deg += 15) assert.equal(vortexSpinPose(deg * DEG).offHand.weight, 1);
});

test('round behind, the hands drop below the view and the point drops: never back up through the eyes', () => {
  const behind = vortexSpinPose(Math.PI).arm;
  assert.ok(behind.wrist[1] < FP_VORTEX.low - 0.4, `the hands are low: ${behind.wrist[1].toFixed(2)}`);
  for (let deg = FP_VORTEX.frontDeg + 5; deg <= 360 - FP_VORTEX.frontDeg - 5; deg += 5) {
    const { blade } = vortexSpinPose(deg * DEG).arm;
    assert.ok(blade[1] < 0, `the point is down at ${deg} degrees`);
  }
});

test('the sword goes round as one thing: no jump anywhere in the turn, and the turn joins up with itself', () => {
  let before = vortexSpinPose(-Math.PI).arm;
  for (let deg = -178; deg <= 180; deg += 2) {
    const arm = vortexSpinPose(deg * DEG).arm;
    assert.ok(apart(arm.wrist, before.wrist) < 0.06, `the hand moves ${apart(arm.wrist, before.wrist).toFixed(3)} m in two degrees at ${deg}`);
    assert.ok(dot(arm.blade, before.blade) > 0.985, `the blade turns smoothly at ${deg}`);
    assert.ok(dot(arm.edge, before.edge) > 0.985, `the hand's turn does not jump at ${deg}`);
    before = arm;
  }
  // (a whole turn on is the same pose)
  const a = vortexSpinPose(0.3).arm;
  const b = vortexSpinPose(0.3 + 2 * Math.PI).arm;
  assert.ok(apart(a.wrist, b.wrist) < 1e-9 && dot(a.blade, b.blade) > 1 - 1e-9);
});

test('the startup: from rest, the sword up in both hands (to be lit), then carried into the turn it arrives in at speed', () => {
  const rest = vortexStartupPose(0, 0);
  assert.ok(apart(rest.arm.wrist, REST_ARM.wrist) < 1e-9, 'it begins as the arms rest');
  assert.equal(rest.offHand, null);
  const raised = vortexStartupPose(FP_VORTEX.raiseBy, vortexWindup({ commitAt: 0 }, -ULTIMATES.vortex.startupSec * (1 - FP_VORTEX.raiseBy)));
  assert.ok(raised.arm.blade[1] > 0.85, 'the sword is up');
  assert.equal(raised.offHand.weight, 1, 'and the magic hand has joined the grip');
  // at its end it is the spin's own pose, the blade straight ahead (where the host's blade starts round from)
  const last = vortexStartupPose(1, vortexWindup({ commitAt: 0 }, 0));
  const spin = vortexSpinPose(0);
  assert.ok(apart(last.arm.wrist, spin.arm.wrist) < 1e-6);
  assert.ok(dot(last.arm.blade, spin.arm.blade) > 1 - 1e-6);
  // and no jump on the way there
  let before = vortexStartupPose(0, 0).arm;
  for (let i = 1; i <= 108; i += 1) {
    const share = i / 108;
    const arm = vortexStartupPose(share, vortexWindup({ commitAt: 0 }, -ULTIMATES.vortex.startupSec * (1 - share))).arm;
    assert.ok(apart(arm.wrist, before.wrist) < 0.12, `the hand moves ${apart(arm.wrist, before.wrist).toFixed(3)} m in a frame at ${share.toFixed(2)}`);
    before = arm;
  }
});
