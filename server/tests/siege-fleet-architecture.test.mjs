import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { createFightFlight } from '../../shared/sim/fightFlight.mjs';
import { createBiByeLlista } from '../../shared/sim/biByeLlista.mjs';
import { createSoFistication } from '../../shared/sim/soFistication.mjs';
import { getFleetMachines, getFleetSolids, raycastFleet, blastFleet } from '../../shared/sim/fleetGeometry.mjs';
import { serializeSnapshot } from '../../shared/sim/wire.mjs';

test('Fleet architecture supports 6 simultaneous machines of arbitrary classes', () => {
  const room = new Room('fleet-room', { worldId: 'high-grounds' });
  const ram1 = createSoFistication({ id: 'ram-1', position: { x: -20, y: 0, z: 0 } });
  const ram2 = createSoFistication({ id: 'ram-2', position: { x: 20, y: 0, z: 0 } });
  const bal1 = createBiByeLlista({ id: 'bal-1', position: { x: -10, y: 0, z: 0 } });
  const bal2 = createBiByeLlista({ id: 'bal-2', position: { x: 10, y: 0, z: 0 } });
  const flt1 = createFightFlight({ id: 'flt-1', x: 0, y: 15, z: -20 });
  const flt2 = createFightFlight({ id: 'flt-2', x: 0, y: 15, z: 20 });

  room.addMachine(ram1);
  room.addMachine(ram2);
  room.addMachine(bal1);
  room.addMachine(bal2);
  room.addMachine(flt1);
  room.addMachine(flt2);

  assert.equal(room.getMachines().length, 6);
  assert.equal(getFleetMachines(room).length, 6);
  assert.equal(room.getMachine('ram-1'), ram1);
  assert.equal(room.getMachine('ram-2'), ram2);
  assert.equal(room.getMachine('bal-1'), bal1);
  assert.equal(room.getMachine('bal-2'), bal2);
  assert.equal(room.getMachine('flt-1'), flt1);
  assert.equal(room.getMachine('flt-2'), flt2);

  // Snapshot contains serialized machines list
  const snapshot = serializeSnapshot(room, 0);
  assert.ok(Array.isArray(snapshot.machines));
  assert.equal(snapshot.machines.length, 6);
  assert.ok(snapshot.machines.some(m => m.id === 'ram-1'));
  assert.ok(snapshot.machines.some(m => m.id === 'flt-2'));
});

test('Fleet geometry raycasting and hit volumes support mirror match detection', () => {
  const room = new Room('fleet-raycast', { worldId: 'high-grounds' });
  const flt1 = createFightFlight({ id: 'flt-1', x: 0, y: 10, z: -10 });
  const flt2 = createFightFlight({ id: 'flt-2', x: 0, y: 10, z: 10 });
  room.addMachine(flt1);
  room.addMachine(flt2);

  // Cast ray from flt1 towards flt2 (origin at (0, 11, -5) to (0, 11, 15) through flt2 at z=10, y=10-12)
  const hit = raycastFleet(room, { x: 0, y: 11, z: -5 }, { x: 0, y: 11, z: 15 }, { excludeMachineId: 'flt-1' });
  assert.ok(hit, 'Raycast should hit opposing flight');
  assert.equal(hit.targetMachine.id, 'flt-2');
  assert.ok(hit.t > 0);
});

test('Fleet blast damage hits all machines in blast radius', () => {
  const room = new Room('fleet-blast', { worldId: 'high-grounds' });
  const flt1 = createFightFlight({ id: 'flt-1', x: -2, y: 0, z: 0 });
  const flt2 = createFightFlight({ id: 'flt-2', x: 2, y: 0, z: 0 });
  const fltFar = createFightFlight({ id: 'flt-far', x: 50, y: 0, z: 0 });
  room.addMachine(flt1);
  room.addMachine(flt2);
  room.addMachine(fltFar);

  const initialHp1 = flt1.health;
  const initialHp2 = flt2.health;
  const initialHpFar = fltFar.health;

  blastFleet(room, { point: { x: 0, y: 0, z: 0 }, radius: 10, damage: 50 }, 'attacker-1', { kind: 'testBlast' }, 0);

  assert.ok(flt1.health < initialHp1, 'flt1 should take blast damage');
  assert.ok(flt2.health < initialHp2, 'flt2 should take blast damage');
  assert.equal(fltFar.health, initialHpFar, 'fltFar outside blast radius should not take damage');
});

test('Fleet atomic reset dismounts operators and increments round generation', () => {
  const room = new Room('fleet-reset', { worldId: 'high-grounds' });
  const p1 = room.addPlayer({ id: 'pilot-1', token: 'tok-1', name: 'Pilot 1' }, 0);
  const p2 = room.addPlayer({ id: 'pilot-2', token: 'tok-2', name: 'Pilot 2' }, 0);
  const ram = createSoFistication({ id: 'ram-1', position: { x: 0, y: 0, z: 0 } });
  const flt = createFightFlight({ id: 'flt-1', x: 0, y: 10, z: 0 });
  room.addMachine(ram);
  room.addMachine(flt);

  ram.operatorId = p1.id;
  p1.operatingRamId = ram.id;
  flt.operatorId = p2.id;
  p2.operatingFightFlightId = flt.id;

  assert.equal(room.getMachineForPlayer(p1.id), ram);
  assert.equal(room.getMachineForPlayer(p2.id), flt);

  const prevGen = room.roundGeneration;
  room.resetFleet(1.0);

  assert.equal(room.roundGeneration, prevGen + 1);
  assert.equal(p1.operatingRamId, null);
  assert.equal(p2.operatingFightFlightId, null);
  assert.equal(room.getMachines().length, 0);
});
