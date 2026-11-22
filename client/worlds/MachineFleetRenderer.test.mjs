import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MachineFleetRenderer } from './MachineFleetRenderer.mjs';
import { FightFlightRenderer } from './FightFlightRenderer.mjs';
import { BiByeLlistaRenderer } from './BiByeLlistaRenderer.mjs';
import { SoFisticationRenderer } from './SoFisticationRenderer.mjs';

test('MachineFleetRenderer instantiates the correct renderer class for each machine type without falling back to ram', () => {
  const scene = new THREE.Scene();
  const fleet = new MachineFleetRenderer(scene);

  const snapshot = {
    serverTime: 10,
    machines: [
      { id: 'flight-1', type: 'fight-and-flight', class: 'fight-and-flight', kind: 'flight', x: 0, y: 5, z: 0, position: { x: 0, y: 5, z: 0 } },
      { id: 'ballista-1', type: 'bi-bye-llista', class: 'bi-bye-llista', kind: 'ballista', x: 2, y: 0, z: 2, position: { x: 2, y: 0, z: 2 } },
      { id: 'ram-1', type: 'so-fist-ication', class: 'so-fist-ication', kind: 'ram', x: -2, y: 0, z: -2, position: { x: -2, y: 0, z: -2 } },
    ],
  };

  fleet.update(10, snapshot, 1 / 60);

  const flightEntry = fleet.fleet.get('flight-1');
  const ballistaEntry = fleet.fleet.get('ballista-1');
  const ramEntry = fleet.fleet.get('ram-1');

  assert.ok(flightEntry, 'flight-1 registered');
  assert.equal(flightEntry.kind, 'flight');
  assert.ok(flightEntry.renderer instanceof FightFlightRenderer, 'Fight-and-Flight machine must use FightFlightRenderer, not SoFisticationRenderer');

  assert.ok(ballistaEntry, 'ballista-1 registered');
  assert.equal(ballistaEntry.kind, 'ballista');
  assert.ok(ballistaEntry.renderer instanceof BiByeLlistaRenderer, 'Bi-Bye-llista machine must use BiByeLlistaRenderer');

  assert.ok(ramEntry, 'ram-1 registered');
  assert.equal(ramEntry.kind, 'ram');
  assert.ok(ramEntry.renderer instanceof SoFisticationRenderer, 'SO-FIST-ICATION machine must use SoFisticationRenderer');

  fleet.dispose();
});
