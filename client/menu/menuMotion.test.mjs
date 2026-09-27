import test from 'node:test';
import assert from 'node:assert/strict';
import { MENU_SHOTS, easeShot, lerpShot, menuShotFor } from './menuShots.mjs';
import { MOMENTS, MOMENT_EVERY, idleMoment, idlePose } from './menuIdle.mjs';

const STAGE = { x: -1.0, z: 5.5 };

test('every menu screen has a shot, and unknown screens fall back to the front door', () => {
  for (const id of ['MAIN_MENU', 'SOLO_MENU', 'PRIVATE_MENU', 'HOW_TO_PLAY', 'LOBBY']) assert.ok(menuShotFor(id).camera);
  assert.equal(menuShotFor('PLAYING'), MENU_SHOTS.main);
  assert.equal(menuShotFor('intro'), MENU_SHOTS.intro);
});

function screenX({ camera, target, fov }) {
  // camera basis: forward toward the target, right = forward x up (three.js convention)
  const fx = target[0] - camera[0];
  const fz = target[2] - camera[2];
  const fl = Math.hypot(fx, fz);
  const dx = STAGE.x - camera[0];
  const dz = STAGE.z - camera[2];
  const depth = (dx * fx + dz * fz) / fl;
  const lateral = (dx * -fz + dz * fx) / fl;
  const halfWide = Math.atan(Math.tan((fov / 2) * Math.PI / 180) * 16 / 9);
  return { x: 0.5 + 0.5 * (lateral / depth) / Math.tan(halfWide), depth };
}

test('every menu shot stands the Spellblade on the right third, clear of the menu banner', () => {
  for (const name of ['main', 'solo', 'private', 'how', 'lobby']) {
    const { x, depth } = screenX(MENU_SHOTS[name]);
    assert.ok(depth > 2, `${name}: the camera is in front of him`);
    assert.ok(x > 0.62 && x < 0.85, `${name}: Spellblade at ${x.toFixed(2)} of the screen width`);
  }
});

test('camera moves ease in and out and land exactly on the shot', () => {
  assert.equal(easeShot(0), 0);
  assert.equal(easeShot(1), 1);
  assert.ok(easeShot(0.1) < 0.1 && easeShot(0.9) > 0.9);
  const mid = lerpShot(MENU_SHOTS.intro, MENU_SHOTS.main, 1);
  assert.deepEqual(mid.camera, [...MENU_SHOTS.main.camera]);
});

test('idle moments come between stretches of breathing, ease in and out, and vary', () => {
  assert.equal(idleMoment(1), null, 'each cycle opens with plain breathing');
  const kinds = new Set();
  for (let t = 0; t < MOMENT_EVERY * 10; t += 0.1) {
    const moment = idleMoment(t);
    if (!moment) continue;
    kinds.add(moment.kind);
    assert.ok(moment.weight >= 0 && moment.weight <= 1);
    assert.ok(moment.elapsed <= MOMENTS[moment.kind]);
  }
  assert.deepEqual([...kinds].sort(), Object.keys(MOMENTS).sort());
  // procedural moments start and end at rest
  const look = idlePose({ kind: 'look', t: 0, weight: 0 });
  assert.ok(look.rotations.every((rotation) => Math.abs(rotation.angle) < 1e-9));
  assert.equal(idlePose({ kind: 'guard', t: 0.5, weight: 1 }).clip, 'Guard');
  assert.equal(idlePose({ kind: 'kindle', t: 0.5, weight: 1 }).clip, 'Cast');
  assert.deepEqual(idlePose(null), { clip: null, rotations: [] });
});

test('the challenge card names the duel, the melee and the arena', async () => {
  const { arenaGateCopy, challengeCopy, countdownSeconds } = await import('./challengeCard.mjs');
  const duel = challengeCopy({ mode: 'BOT_DUEL', localId: 'me', players: [{ id: 'me', name: 'Aldric' }, { id: 'bot', name: 'Rival Spellblade', actorKind: 'bot' }] });
  assert.deepEqual(duel, { kicker: 'A WORTHY CHALLENGER', you: 'Aldric', foe: 'Rival Spellblade', copy: 'Castleward · first to 10' });
  const melee = challengeCopy({ mode: 'FFA', localId: 'me', players: [{ id: 'me', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }] });
  assert.equal(melee.kicker, 'THE MELEE BEGINS');
  assert.equal(melee.foe, '2 RIVALS');
  assert.equal(countdownSeconds(12.2, 10), 3);
  assert.equal(countdownSeconds(10.01, 10.5), 1);
  assert.equal(countdownSeconds(undefined, 1), null);
  assert.equal(arenaGateCopy({ mode: 'PRACTICE' }).sub, 'PRACTICE YARD · UNTIMED');
  assert.equal(arenaGateCopy({ mode: 'FFA' }).title, 'CASTLEWARD');
  const { romanCount } = await import('./challengeCard.mjs');
  assert.deepEqual([3, 2, 1].map(romanCount), ['III', 'II', 'I']);
});
