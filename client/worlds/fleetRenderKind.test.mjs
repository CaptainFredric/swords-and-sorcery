import test from 'node:test';
import assert from 'node:assert/strict';
import { fleetRenderKind } from './fleetRenderKind.mjs';
import { Room } from '../../shared/sim/Room.mjs';
import { TEAMS } from '../../shared/src/teams.mjs';
import { GAME_MODES } from '../../shared/src/modes.mjs';
import { createSiegeBladesState, provisionSiegeBladesFleet } from '../../shared/sim/siegeBladesMode.mjs';
import { getFleetMachines } from '../../shared/sim/fleetGeometry.mjs';
import { serializeMachine } from '../../shared/sim/wire.mjs';

test('each Siege Blades machine, as the server sends it, is drawn by its own renderer (no ram drawn in the air)', () => {
  const room = new Room('fleet-kinds', { mode: GAME_MODES.SIEGE_BLADES, worldId: 'high-grounds', teamSize: 3,
    siegeBladesSettings: { format: 'ENDLESS', teamSize: 3, botDifficulty: 'knight' } });
  room.state = 'PLAYING';
  room.siegeBlades = createSiegeBladesState(room, { format: 'ENDLESS', teamSize: 3, botDifficulty: 'knight', clashStarts: false });
  const classes = ['so-fist-ication', 'bi-bye-llista', 'fight-and-flight'];
  let k = 0;
  for (const team of [TEAMS.ATTACKERS, TEAMS.DEFENDERS]) for (let i = 0; i < 3; i += 1) {
    const p = room.addPlayer({ id: `bot-${team}-${i}`, token: `t${k}`, team }, 0);
    p.actorKind = 'bot'; p.preferredSiegeMachine = classes[(k += 1) % 3];
  }
  provisionSiegeBladesFleet(room, 0);
  const expected = { ram: 'ram', ballista: 'ballista', flight: 'flight' };
  const seen = new Set();
  for (const machine of getFleetMachines(room)) {
    const wire = serializeMachine(machine, 0);
    assert.equal(fleetRenderKind(wire), expected[wire.kind], `${wire.id} (${wire.type ?? wire.class}) drawn as its own kind`);
    seen.add(wire.kind);
  }
  assert.deepEqual([...seen].sort(), ['ballista', 'flight', 'ram']);
  // every spelling a machine's class arrives in
  for (const [value, kind] of [['flight', 'flight'], ['fight-and-flight', 'flight'], ['ballista', 'ballista'], ['bi-bye-llista', 'ballista'], ['ram', 'ram'], ['so-fist-ication', 'ram']]) {
    assert.equal(fleetRenderKind({ type: value }), kind);
    assert.equal(fleetRenderKind({ kind: value }), kind);
  }
  assert.equal(fleetRenderKind({ kind: 'flight', type: 'fight-and-flight' }), 'flight');
});
