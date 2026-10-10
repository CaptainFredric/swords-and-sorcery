import test from 'node:test';
import assert from 'node:assert/strict';
import { appendRemoteSample } from './remoteSnapshots.mjs';
import { resolveSpellbladeAnimationPlan } from './spellbladeAnimationPlan.mjs';
import { deathRest } from './spellbladeMotion.mjs';
import { blendSeconds } from './spellbladeBlend.mjs';

const sample = (alive, x = 0, y = 0) => ({ alive, position: { x, y, z: 0 } });
test('remote resurrection discards corpse interpolation history and uses the actual spawn position', () => {
  let history = [];
  for (let tick = 0; tick < 5; tick++) history = appendRemoteSample(history, sample(false), 10 + tick / 30, 1000 + tick * 33);
  const alive = sample(true, 12, 3);
  history = appendRemoteSample(history, alive, 13, 4000);
  assert.equal(history.length, 1);
  assert.equal(history[0].player, alive);
  assert.equal(history[0].serverTime, 13);
});
test('death starts on its own state, ordinary dead positions preserve abyss descent, and history stays bounded', () => {
  let history = appendRemoteSample([], sample(true), 10, 1000);
  const dead = sample(false, 4, -10);
  history = appendRemoteSample(history, dead, 11, 2000);
  assert.equal(history.length, 1);
  for (let tick = 0; tick < 9; tick++) history = appendRemoteSample(history, sample(false, 4, -11 - tick), 11 + tick / 30, 2000 + tick * 33);
  assert.equal(history.length, 5);
  assert.equal(history.at(-1).player.position.y, -19);
});
test('Death remains a nonlooping settled pose throughout the dead interval, then returns directly to living', () => {
  for (const age of [1.8, 2.2, 2.8, 3.5]) {
    const plan = resolveSpellbladeAnimationPlan({state:'dead',player:{respawnAt:13},serverNow:10+age});
    assert.equal(plan.clip,'Death'); assert.equal(plan.loop,false);
    assert.ok(Math.abs(plan.time - age) < 1e-9); assert.equal(deathRest(plan.time),1);
  }
  assert.equal(blendSeconds('Death','Idle'),0);
  assert.equal(resolveSpellbladeAnimationPlan({state:'idle',player:{alive:true},serverNow:13}).clip,'Idle');
});
