import test from 'node:test';
import assert from 'node:assert/strict';
import { MENU_SHOTS, easeShot, lerpShot, menuShotFor, shotSettled } from './menuShots.mjs';
import { MOMENTS, MOMENT_EVERY, REACTIONS, idleMoment, idlePose, reactionMoment } from './menuIdle.mjs';

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

test('a choice on the front door gets a brief reaction: in quickly, held, eased out, then back to idle', () => {
  const salute = { kind: 'salute', startedAt: 10 };
  assert.equal(reactionMoment(salute, 9.9), null, 'not before the click');
  assert.ok(reactionMoment(salute, 10.2).weight > 0.5, 'up almost at once');
  assert.ok(Math.abs(reactionMoment(salute, 10 + REACTIONS.salute / 2).weight - 1) < 1e-9, 'held');
  assert.ok(reactionMoment(salute, 10 + REACTIONS.salute - 0.05).weight < 0.1, 'eased back down');
  assert.equal(reactionMoment(salute, 10 + REACTIONS.salute + 0.01), null);
  assert.equal(reactionMoment(null, 10), null);
  assert.equal(reactionMoment({ kind: 'nonsense', startedAt: 0 }, 1), null);
  // each reaction moves the sword arm; the rally raises it high, the salute brings it across the chest
  for (const kind of ['salute', 'rally']) {
    const pose = idlePose(reactionMoment({ kind, startedAt: 0 }, REACTIONS[kind] / 2));
    assert.ok(pose.rotations.some((turn) => turn.bone === 'upper_arm.R' && Math.abs(turn.angle) > 1), kind);
  }
  assert.ok(idlePose(reactionMoment({ kind: 'present', startedAt: 0 }, 1)).rotations.length > 0, 'presenting reuses the idle moment');
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

test('the round waits for the camera to come down to the front door: never begun from the establishing shot', () => {
  // as the menu opens: holding the establishing shot (no move under way), the camera has not arrived anywhere
  assert.equal(shotSettled({ to: MENU_SHOTS.intro, duration: 0, elapsed: 0 }), false);
  // gliding down to the front door: not yet; there: yes
  assert.equal(shotSettled({ to: MENU_SHOTS.main, duration: 2.8, elapsed: 1.2 }), false);
  assert.equal(shotSettled({ to: MENU_SHOTS.main, duration: 2.8, elapsed: 2.8 }), true);
  assert.equal(shotSettled({ to: MENU_SHOTS.solo, duration: 0, elapsed: 0 }), true);
});
