import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { stepRoom, tryCastSpell } from '../../shared/sim/combat.mjs';
import { SPELLS, chillFrom } from '../../shared/src/spells.mjs';
import { MOMENTS } from '../../client/game/sound/voiceMoments.mjs';

// The facts the voice is told by the host, never claimed by a client: a Frostfire's chill taking hold on a foe (who
// threw it, how cold, how long), for "This will help you stop moving."

const openWorld = {
  floors: [{ id: 'floor', center: [0, -0.1, 0], size: [50, 0.2, 50], y: 0 }],
  ramps: [],
  solids: [],
  spawnPoints: [{ x: 0, y: 0, z: 0, yaw: -Math.PI / 2 }, { x: 2, y: 0, z: 0, yaw: Math.PI / 2 }],
  abyssY: -9,
};

function duel(spell, foeAt) {
  const room = new Room('VOICE');
  room.addPlayer({ id: 'a', token: 'ta', name: 'A' }, 0);
  room.addPlayer({ id: 'b', token: 'tb', name: 'B' }, 0);
  room.setReady('a', true, 0);
  room.setReady('b', true, 0);
  room.tick(3.1);
  const a = room.players.get('a');
  const b = room.players.get('b');
  a.spell = spell;
  Object.assign(a.position, { x: 0, y: 0, z: 0 });
  Object.assign(b.position, foeAt);
  a.yaw = -Math.PI / 2; a.input.yaw = a.yaw;
  b.spawnProtectionUntil = 0;
  room.events.length = 0;
  assert.equal(tryCastSpell(room, 'a', { x: 1, y: 0, z: 0 }, 10), true);
  for (let t = 10.31; t < 11.5; t += 0.02) stepRoom(room, 0.02, t, openWorld);
  return { room, b, chilled: room.events.filter((event) => event.type === 'chilled') };
}

test('a Frostfire that catches a foe tells everyone it chilled them, how hard, and whose frost it was', () => {
  const { chilled, b } = duel('frostfire', { x: 1.5, y: 0, z: 0 });
  assert.equal(chilled.length, 1);
  const [event] = chilled;
  assert.deepEqual([event.playerId, event.by, event.spell], ['b', 'a', 'frostfire']);
  assert.ok(event.slow >= MOMENTS.chill.slow, `a full chill (${event.slow.toFixed(2)}) is worth remarking on`);
  assert.equal(event.until, b.chill.until, "the chill he carries now");
  // a Fireball leaves a burn, never a chill
  assert.equal(duel('fireball', { x: 1.5, y: 0, z: 0 }).chilled.length, 0);
});

test('the edge of a Frostfire chills a little: too slight for the line; its heart, and most of the blast, is not', () => {
  const chill = (exposure) => chillFrom(SPELLS.frostfire, exposure, 0).slow;
  assert.ok(chill(0.05) < MOMENTS.chill.slow, 'a graze');
  assert.ok(chill(0.5) >= MOMENTS.chill.slow, 'half the blast');
  assert.ok(chill(1) >= MOMENTS.chill.slow, 'its heart');
});
