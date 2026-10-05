import test from 'node:test';
import assert from 'node:assert/strict';
import { AIM_QUALITY, BLADE, aimFrame, aimQuality, bladeDirection, offAimDegrees, segmentDistance, sweepBlade } from './blade.mjs';
import { MELEE_CONTACT, swordDamageFor } from './combat.mjs';

const damageAt = (deg) => swordDamageFor(aimQuality(deg));

test('held on the middle is 28-30, an ordinary good blow 25-27, weak side contact 22-24, the fringe 19-21', () => {
  for (const deg of [0, 2, 4, 6]) assert.ok(damageAt(deg) >= 28, `${deg} degrees: ${damageAt(deg)}`);
  for (const deg of [9, 12, 16, 20]) assert.ok(damageAt(deg) >= 25 && damageAt(deg) <= 27, `${deg} degrees: ${damageAt(deg)}`);
  for (const deg of [24, 28, 32, 40]) assert.ok(damageAt(deg) >= 22 && damageAt(deg) <= 24, `${deg} degrees: ${damageAt(deg)}`);
  for (const deg of [50, 60, 70, 90]) assert.ok(damageAt(deg) >= 19 && damageAt(deg) <= 21, `${deg} degrees: ${damageAt(deg)}`);
  // the glancing floor and the clean ceiling stay where they are
  assert.equal(damageAt(75), 19);
  assert.equal(damageAt(0), 30);
  // the top of the scale is earned: 29-30 only right on the middle; a knight's edge at two metres (some 13 degrees
  // off) is an ordinary 26
  for (const deg of [0, 1, 2]) assert.equal(damageAt(deg), 30, `${deg} degrees`);
  for (const deg of [8, 10, 13]) assert.ok(damageAt(deg) <= 27, `${deg} degrees: ${damageAt(deg)}`);
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

// the world stops the blade only where the swing is driven; a knight is never met through it
const aimed = (bodies, solids, strike = 0) => sweepBlade(eye, bladeDirection(strike, -MELEE_CONTACT.window.early, frame), bladeDirection(strike, MELEE_CONTACT.window.late, frame), bodies, solids, { aim: frame.forward });

test('a wall the slash only grazes out at its edge does not stop it: the knight straight ahead is met', () => {
  // (the aim is -z; the forehand comes in from the right, +x) a wall close on the right, 48-70 degrees off the aim
  const wall = { id: 'wall', center: [1.25, 1.5, -0.45], size: [0.4, 3, 0.7], material: 'limestone' };
  assert.equal(sweepAcross([body(0, -2)], [wall]).kind, 'solid', 'the blade does pass through it');
  assert.equal(aimed([body(0, -2)], [wall]).kind, 'body', 'the grazed wall lets the blow through');
  // the same wall is still met by a blade swung straight at it
  const ahead = { ...wall, center: [0.3, 1.5, -1.2] };
  assert.equal(aimed([body(0, -2.2)], [ahead]).kind, 'solid', 'driven straight into the stone, it rings off');
});

test('a knight round a corner is never met, however far out in the slash', () => {
  // a knight off to the right at the slash's edge, a wall between (outside the corridor: it does not stop the blade,
  // but it stands between the eyes and them)
  const wall = { id: 'corner', center: [1.3, 1.5, -0.55], size: [0.3, 3, 0.9], material: 'limestone' };
  const behind = body(2.1, -1.1);
  assert.equal(aimed([behind], [wall]), null, 'nothing met at all: not the knight, and not the grazed wall');
  assert.equal(aimed([behind], []).kind, 'body', 'with the wall gone, the same knight is met');
  // and one straight ahead behind a wall is not met either (the wall takes the blade)
  const front = { id: 'front', center: [0, 1.5, -1.4], size: [3, 3, 0.3] };
  assert.equal(aimed([body(0, -2.2)], [front]).kind, 'solid');
});

test('barrels and posts to the side do not keep ending swings', () => {
  const barrels = [
    { id: 'barrel-right', center: [1.1, 0.42, -0.5], size: [0.64, 0.84, 0.64], material: 'timber', kind: 'prop' },
    { id: 'post-left', center: [-1.2, 1.2, -0.7], size: [0.12, 2.4, 0.12], material: 'timber' },
  ];
  for (const strike of [0, 1]) assert.equal(aimed([body(0.3, -1.9)], barrels, strike).kind, 'body', `strike ${strike}`);
});

test('a blade driven down onto the top of something meets ground there; a face met only glancingly is scraped and passed', async () => {
  const { sweepBlade: sweep, aimFrame: frameOf, bladeDirection: dir } = await import('./blade.mjs');
  const eye = { x: 0, y: 1.6, z: 0 };
  const frame = frameOf(-Math.PI / 2, -0.45);
  const from = dir(2, -0.09, frame);
  const to = dir(2, 0.11, frame);
  // a low lip a step ahead (a knight faces +x)
  const lip = { id: 'lip', center: [1.2, 0.225, 0], size: [0.4, 0.45, 3] };
  assert.equal(sweep(eye, from, to, [], [lip], { aim: frame.forward }).kind, 'solid', 'an ordinary blade rings off it');
  const driven = sweep(eye, from, to, [], [lip], { aim: frame.forward, topsAreGround: true, corner: 0.3 });
  assert.equal(driven.kind, 'ground');
  assert.equal(driven.floor.y, 0.45, 'at the top of it');
  // a tall wall met squarely still stops it
  const wall = { id: 'wall', center: [1.2, 1.5, 0], size: [0.4, 3, 3] };
  assert.equal(sweep(eye, from, to, [], [wall], { aim: frame.forward, topsAreGround: true, corner: 0.3, stopIncidence: 0.45 }).kind, 'solid');
  // a wall met at 65 degrees off its face: an ordinary blade rings off it; a slam glances along it and goes on
  const turned = frameOf(-Math.PI / 2 + 65 * Math.PI / 180, -0.45);
  const side = { id: 'side', center: [1.6, 1.5, 0], size: [1.2, 3, 12] };
  const swing = [dir(2, -0.09, turned), dir(2, 0.11, turned)];
  assert.equal(sweep(eye, ...swing, [], [side], { aim: turned.forward }).kind, 'solid');
  assert.equal(sweep(eye, ...swing, [], [side], { aim: turned.forward, topsAreGround: true, corner: 0.3, stopIncidence: 0.45 }), null);
});
