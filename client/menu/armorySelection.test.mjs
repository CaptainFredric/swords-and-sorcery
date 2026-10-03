import test from 'node:test';
import assert from 'node:assert/strict';
import { createArmorySelection } from './armorySelection.mjs';
import { ARMORY_CUES, playArmorySound } from './armorySound.mjs';

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

test('restoration and same equipped choice are silent; a changed deliberate choice equips once then previews once', () => {
  const h = harness();
  assert.deepEqual(h.events, []);
  assert.equal(h.selection.select('fireball', 'fireball', h.equip), false);
  assert.deepEqual(h.events, []);
  assert.equal(h.selection.select('frostfire', 'fireball', h.equip), true);
  assert.deepEqual(h.events, ['equip frostfire', 'play frostfire', 'preview frostfire']);
  assert.equal(h.pending.size, 1);
});

test('rapid choices stop the previous sound and retire its restore timer before previewing the new identity', () => {
  const h = harness();
  h.selection.select('steel', 'gale', h.equip);
  h.selection.select('sunder', 'vortex', h.equip);
  assert.deepEqual(h.events, ['equip steel', 'play steel', 'preview steel', 'stop steel', 'equip sunder', 'play sunder', 'preview sunder']);
  assert.equal(h.pending.size, 1);
  [...h.pending.values()][0]();
  assert.equal(h.pending.size, 0);
  assert.deepEqual(h.events.slice(-2), ['stop sunder', 'restore']);
});

test('leaving or muting cancels pending sound and timer; no stale model restoration follows', () => {
  const h = harness();
  h.selection.select('vortex', 'sunder', h.equip);
  h.selection.cancel();
  h.selection.cancel();
  assert.equal(h.pending.size, 0);
  assert.deepEqual(h.events, ['equip vortex', 'play vortex', 'preview vortex', 'stop vortex']);
});

test('every identity has a short distinctive cue; steel contains exactly two metallic tones', () => {
  assert.deepEqual(Object.keys(ARMORY_CUES), ['fireball', 'frostfire', 'gale', 'steel', 'sunder', 'vortex']);
  assert.equal(ARMORY_CUES.steel.tones.length, 2);
  assert.equal(ARMORY_CUES.vortex.rotation, true);
  for (const cue of Object.values(ARMORY_CUES)) assert.ok(cue.duration <= .5);
});

test('sound feedback honors mute, zero effects, zero master and suspended audio without queuing playback', () => {
  for (const levels of [{ muted: true, effects: 1, master: 1 }, { muted: false, effects: 0, master: 1 }, { muted: false, effects: 1, master: 0 }]) {
    assert.equal(playArmorySound({ running: true, levels, get ctx() { throw Error('audio should remain untouched'); } }, 'fireball'), null);
  }
  assert.equal(playArmorySound({ running: false }, 'vortex'), null);
});
