import test from 'node:test';
import assert from 'node:assert/strict';
import { createArmorySelection } from './armorySelection.mjs';
import { playArmorySound } from './armorySound.mjs';

function harness() {
  const events = [];
  const pending = new Map();
  let sequence = 0;
  const selection = createArmorySelection({
    play: (id) => { events.push(`play ${id}`); return () => events.push(`stop ${id}`); },
    preview: (id) => events.push(`preview ${id}`),
    restore: () => events.push('restore'),
    schedule: (fn) => { pending.set(++sequence, fn); return sequence; },
    unschedule: (id) => pending.delete(id),
  });
  return { selection, events, pending, equip: (id) => events.push(`equip ${id}`) };
}

test('restoration stays silent; every card press sounds without resetting an active same item gesture', () => {
  const h=harness();
  assert.deepEqual(h.events,[]);
  h.selection.select('fireball','fireball',h.equip);
  h.selection.select('fireball','fireball',h.equip);
  assert.deepEqual(h.events,['play fireball','preview fireball','stop fireball','play fireball']);
  assert.equal(h.pending.size,1);
  [...h.pending.values()][0]();
  h.pending.clear();
  h.selection.select('fireball','fireball',h.equip);
  assert.equal(h.events.filter(e=>e==='preview fireball').length,2);
});
test('rapid different choices replace audio and retire the old gesture timer', () => {
  const h=harness();
  h.selection.select('steel','gale',h.equip);
  h.selection.select('sunder','vortex',h.equip);
  assert.deepEqual(h.events,['equip steel','play steel','preview steel','stop steel','equip sunder','play sunder','preview sunder']);
  assert.equal(h.pending.size,1);
  [...h.pending.values()][0]();
  assert.equal(h.events.at(-1),'restore');
});

test('leaving or muting cancels pending sound and timer; no stale model restoration follows', () => {
  const h = harness();
  h.selection.select('vortex', 'sunder', h.equip);
  h.selection.cancel();
  h.selection.cancel();
  assert.equal(h.pending.size, 0);
  assert.deepEqual(h.events, ['equip vortex', 'play vortex', 'preview vortex', 'stop vortex']);
});

test('sound feedback honors mute, zero effects, zero master and suspended audio without queuing playback', () => {
  for (const levels of [{ muted: true, effects: 1, master: 1 }, { muted: false, effects: 0, master: 1 }, { muted: false, effects: 1, master: 0 }]) {
    assert.equal(playArmorySound({ running: true, levels, get ctx() { throw Error('audio should remain untouched'); } }, 'fireball'), null);
  }
  assert.equal(playArmorySound({ running: false }, 'vortex'), null);
});

test('an ultimate\'s showcase is given its whole length before the model is restored; a spell its short gesture', () => {
  const lengths = [];
  const selection = createArmorySelection({
    play: () => null, preview: () => {}, restore: () => {},
    schedule: (fn, ms) => { lengths.push(ms); return lengths.length; }, unschedule: () => {},
  });
  selection.select('chivalry', 'sunder', () => {});
  selection.select('fireball', 'fireball', () => {});
  assert.ok(lengths[0] > 9000, `Spells & Chivalry ${lengths[0]} ms`);
  assert.equal(lengths[1], 1500);
});
