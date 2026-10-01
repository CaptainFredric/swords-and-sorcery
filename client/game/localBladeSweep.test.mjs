import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalBladeSweep } from './localBladeSweep.mjs';
import { MELEE_CONTACT, SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';

// My own blade against the world, judged in my own view at its own moment (not a round trip later).

const me = { position: { x: 0, y: 0, z: 0 }, crouched: false };
const facingX = -Math.PI / 2;    // looking along +x (my right is +z)
const wall = { id: 'wall', center: [1.6, 1.5, 0], size: [0.4, 3, 4], material: 'limestone' };
const chain = { startedAt: 10, committed: 1, landed: 0 };

// the frames of a swing, sixty a second, from its press to well past its contact; what rang, and when
function swing(options, { until = 10.8, sweep = new LocalBladeSweep() } = {}) {
  const rang = [];
  for (let now = 10; now <= until; now += 1 / 60) {
    const struck = sweep.step(now, { chain, body: me, yaw: facingX, pitch: 0, ...options });
    if (struck) rang.push({ at: now, ...struck });
  }
  return rang;
}

test('a blade driven into a wall rings off it at its contact, once, in my own view', () => {
  const rang = swing({ solids: [wall] });
  assert.equal(rang.length, 1, 'once');
  assert.equal(rang[0].solid.id, 'wall');
  const contact = chain.startedAt + SWORD_STRIKE_TIMES[0];
  assert.ok(rang[0].at >= contact - MELEE_CONTACT.window.early && rang[0].at <= contact + MELEE_CONTACT.worldFollow + 2 / 60,
    `as the blade comes through (${(rang[0].at - contact).toFixed(3)} s from its contact), not afterwards`);
  assert.deepEqual(swing({ solids: [] }), [], 'nothing there, nothing rings');
});

test('what the blade only swings past afterwards does not ring; a knight met first takes the blow instead', () => {
  // low on my left (the forehand ends there): the follow-through, not the blow
  const barrel = { id: 'barrel', center: [1.5, 0.5, -0.9], size: [0.7, 1, 0.7], material: 'wood' };
  assert.deepEqual(swing({ solids: [barrel] }), []);
  // a knight between me and the wall: the blade meets them, and the wall behind never rings
  const far = { id: 'far', center: [2.6, 1.5, 0], size: [0.4, 3, 6], material: 'limestone' };
  assert.deepEqual(swing({ solids: [far], bodies: [{ id: 'foe', x: 1.5, y: 0, z: 0 }] }), []);
});

test('each strike is judged once; a Sundering slam is left to the server', () => {
  const sweep = new LocalBladeSweep();
  const first = swing({ solids: [wall] }, { sweep });
  assert.equal(first.length, 1);
  assert.deepEqual(swing({ solids: [wall] }, { sweep }), [], 'the same strike again: already judged');
  assert.deepEqual(swing({ solids: [wall], slam: true }), []);
  assert.equal(new LocalBladeSweep().step(10.4, { chain: null, body: me }), null);
});
