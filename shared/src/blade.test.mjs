import test from 'node:test';
import assert from 'node:assert/strict';
import { AIM_QUALITY, BLADE, aimFrame, aimQuality, bladeDirection, offAimDegrees, segmentDistance, sweepBlade } from './blade.mjs';
import { MELEE_CONTACT, swordDamageFor } from './combat.mjs';

const damageAt = (deg) => swordDamageFor(aimQuality(deg));

test('dead centre is 29-30, a visibly off-centre blow 25-27, weak side contact 22-24, the fringe 19-21', () => {
  for (const deg of [0, 2, 4]) assert.ok(damageAt(deg) >= 29, `${deg} degrees: ${damageAt(deg)}`);
  for (const deg of [10, 14, 18]) assert.ok(damageAt(deg) >= 25 && damageAt(deg) <= 27, `${deg} degrees: ${damageAt(deg)}`);
  for (const deg of [26, 32, 38]) assert.ok(damageAt(deg) >= 22 && damageAt(deg) <= 24, `${deg} degrees: ${damageAt(deg)}`);
  for (const deg of [55, 65, 75, 90]) assert.ok(damageAt(deg) >= 19 && damageAt(deg) <= 21, `${deg} degrees: ${damageAt(deg)}`);
  // one even curve: never rising, never jumping
  let last = damageAt(0);
  for (let deg = 0.5; deg <= 80; deg += 0.5) {
    const d = damageAt(deg);
    assert.ok(d <= last && last - d <= 1, `even at ${deg}`);
    last = d;
  }
  assert.equal(AIM_QUALITY[AIM_QUALITY.length - 1][0], BLADE.arcHalfDeg, 'the fringe of the curve is the edge of the swing');
});

test('every strike\'s blade passes along the aim at its contact; the forehand comes from the right, the chop from above', () => {
  const frame = aimFrame(0.4, -0.2);
  for (const strike of [0, 1, 2]) {
    const at = bladeDirection(strike, 0, frame);
    assert.ok(Math.abs(at.x - frame.forward.x) + Math.abs(at.y - frame.forward.y) + Math.abs(at.z - frame.forward.z) < 1e-9);
  }
  const side = (d) => d.x * frame.right.x + d.y * frame.right.y + d.z * frame.right.z;
  const up = (d) => d.x * frame.up.x + d.y * frame.up.y + d.z * frame.up.z;
  const early = -MELEE_CONTACT.window.early;
  const late = MELEE_CONTACT.window.late;
  assert.ok(side(bladeDirection(0, early, frame)) > 0.9 && side(bladeDirection(0, late, frame)) < -0.9, 'forehand: right to left');
  assert.ok(up(bladeDirection(0, early, frame)) > 0 && up(bladeDirection(0, late, frame)) < 0, 'high on the right, low on the left');
  assert.ok(side(bladeDirection(1, early, frame)) < -0.9 && side(bladeDirection(1, late, frame)) > 0.9, 'backhand: left to right');
  assert.ok(up(bladeDirection(2, early, frame)) > 0.8 && up(bladeDirection(2, late, frame)) < -0.7, 'the chop: from above to below');
});

const eye = { x: 0, y: 1.35, z: 0 };
const frame = aimFrame(0, 0);
const body = (x, z, id = 'b') => ({ id, base: { x, y: 0, z }, top: 1.75 });
const sweepAcross = (bodies, solids, strike = 0) => sweepBlade(eye, bladeDirection(strike, -MELEE_CONTACT.window.early, frame), bladeDirection(strike, MELEE_CONTACT.window.late, frame), bodies, solids);

test('the blade meets the first thing it passes through: a wall at the corner, never the knight behind it', () => {
  // a wall off to the right, its corner just right of the aim; a knight in front of the aim but beyond the wall's face
  const wall = { id: 'wall', center: [1.3, 1.5, -1.8], size: [2, 3, 0.4], material: 'limestone' };
  const behind = sweepAcross([body(0.45, -2.4)], [wall]);
  assert.equal(behind.kind, 'solid', 'the forehand comes from the right: the wall takes it first');
  assert.equal(behind.solid.id, 'wall');
  // the same knight with no wall: met
  assert.equal(sweepAcross([body(0.45, -2.4)], []).kind, 'body');
  // the wall off to the left instead, and the knight in the open ahead: the forehand meets the knight first
  const left = { id: 'left', center: [-1.6, 1.5, -1.8], size: [2, 3, 0.4] };
  assert.equal(sweepAcross([body(0, -2)], [left]).kind, 'body');
  // anything solid that says so lets the blade through (a curtain of cloth)
  assert.equal(sweepAcross([body(0, -2)], [{ ...wall, center: [0, 1.5, -1.2], blade: false }]).kind, 'body');
});

test('a thin post is met, however fast the blade: the sweep is judged finely enough that nothing slips between', () => {
  const post = { id: 'post', center: [0.9, 1.2, -1.6], size: [0.08, 2.4, 0.08], material: 'timber' };
  const met = sweepAcross([], [post]);
  assert.ok(met && met.kind === 'solid' && met.solid.id === 'post');
  // in one step of the server's sweep (the whole swing between two samples) as much as in many
  const whole = sweepBlade(eye, bladeDirection(0, -0.09, frame), bladeDirection(0, 0.11, frame), [], [post]);
  assert.ok(whole && whole.solid.id === 'post');
});

test('how far off the aim a knight was: their body\'s axis, not their edge', () => {
  const view = { x: 0, y: 1.58, z: 0 };
  assert.ok(offAimDegrees(view, frame.forward, { x: 0, y: 0, z: -2 }, 1.75) < 1e-6, 'aimed at their chest: dead centre');
  const off = offAimDegrees(view, frame.forward, { x: Math.tan(20 * Math.PI / 180) * 2, y: 0, z: -2 }, 1.75);
  assert.ok(Math.abs(off - 20) < 0.5, `20 degrees off: ${off.toFixed(2)}`);
  // aimed over a crouched head: off by as much as the aim passes over it
  assert.ok(offAimDegrees(view, frame.forward, { x: 0, y: 0, z: -1.6 }, 1.15) > 10);
  assert.ok(segmentDistance({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0.5, y: 1, z: 0 }, { x: 0.5, y: 2, z: 0 }).distance === 1);
});
