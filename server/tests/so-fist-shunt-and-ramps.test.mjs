import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { stepRoom } from '../../shared/sim/combat.mjs';
import {
  createSoFistication,
  mountSoFistication,
  soFistEntry,
  shuntSoFistication,
  SO_FIST_SHUNT,
  fireSoFistication,
} from '../../shared/sim/soFistication.mjs';
import { createBiByeLlista, mountBiByeLlista } from '../../shared/sim/biByeLlista.mjs';
import { applyRoomCommand } from '../../shared/sim/wire.mjs';

const flatWorld = {
  floors: [{ id: 'floor', center: [0, -0.1, 0], size: [120, 0.2, 120], y: 0 }],
  ramps: [],
  solids: [],
  spawnPoints: [{ x: 0, y: 0, z: 0 }],
  abyssY: -20,
};

const rampWorld = {
  floors: [
    { id: 'low', center: [0, -0.1, 0], size: [40, 0.2, 30], y: 0 },
    { id: 'high', center: [0, 2.4, 24], size: [40, 0.2, 12], y: 2.5 },
  ],
  ramps: [{ id: 'r1', minX: -8, maxX: 8, minZ: 14, maxZ: 18, startY: 0, endY: 2.5, axis: 'z' }],
  solids: [],
  spawnPoints: [{ x: 0, y: 0, z: 0 }],
  abyssY: -20,
};

test('SO-FIST-ICATION Shunt bursts ~2-3m, costs Drive Pressure, cools down independently, and obeys walls/Skill locks', () => {
  const r = new Room('SHUNT-TEST');
  r.world = structuredClone(flatWorld);
  r.state = 'PLAYING';
  const p = r.addPlayer({ id: 'driver', token: 'd', name: 'Driver' }, 0);
  r.setReady('driver', true, 0);
  r.tick(3.1);
  p.spawnProtectionUntil = 0;
  const s = createSoFistication({ id: 'ram-shunt', x: 0, y: 0, z: 0, heading: 0 });
  r.machines = new Map([[s.id, s]]);
  p.position = soFistEntry(s, r.world);
  assert.equal(mountSoFistication(r, s, p, 10), true);

  // 1. Burst distance & immediate pressure cost
  const startPressure = s.pressure;
  assert.deepEqual(applyRoomCommand(r, p, { type: 'ramShunt', direction: 1 }, 10), {});
  assert.equal(s.pressure, startPressure - SO_FIST_SHUNT.pressureCost);
  assert.equal(s.shuntReadyAt, 10 + SO_FIST_SHUNT.cooldown);
  assert.ok(r.events.some(e => e.type === 'soFistShunt' && e.machineId === s.id));
  for (let i = 1; i <= 18; i++) stepRoom(r, 1 / 30, 10 + i / 30, r.world);
  const moved = Math.abs(s.z);
  assert.ok(moved >= 2.0 && moved <= 3.0, `shunt burst distance should be ~2-3m, got ${moved.toFixed(2)}m`);

  // 2. Cooldown enforced
  const rejectedCd = applyRoomCommand(r, p, { type: 'ramShunt', direction: 1 }, 11);
  assert.ok(rejectedCd.rejected);

  // 3. Skill restriction: HELLping Hand braced open forbids Shunt
  s.pressure = 100;
  s.shuntReadyAt = 0;
  s.hellping = { phase: 'open' };
  assert.equal(shuntSoFistication(r, s, 20, 1), false);
  s.hellping = null;

  // 4. Component failure (>= 3 wheels dead) disables Shunt
  s.components.Wheel_FL.health = 0;
  s.components.Wheel_FR.health = 0;
  s.components.Wheel_RL.health = 0;
  assert.equal(shuntSoFistication(r, s, 20, 1), false);
  s.components.Wheel_FL.health = 180;
  s.components.Wheel_FR.health = 180;
  s.components.Wheel_RL.health = 180;

  // 5. Wall blocks Shunt cleanly without tunneling
  r.world.solids = [{ id: 'stop-wall', center: [0, 1.5, s.z - 2.6], size: [8, 3, 0.5], material: 'stone' }];
  const wallZ = s.z - 2.6;
  assert.equal(shuntSoFistication(r, s, 20, 1), true);
  for (let i = 1; i <= 18; i++) stepRoom(r, 1 / 30, 20 + i / 30, r.world);
  assert.ok(s.z > wallZ + 0.5, 'Shunt stops cleanly in front of masonry instead of tunneling');
});

test('Shunt-into-Piston boosts kinetic impact speed and shoves enemy machine cleanly', () => {
  const r = new Room('SHUNT-PISTON');
  r.world = structuredClone(flatWorld);
  r.state = 'PLAYING';
  const pa = r.addPlayer({ id: 'a', token: 'a', name: 'A' }, 0);
  const pb = r.addPlayer({ id: 'b', token: 'b', name: 'B' }, 1);
  r.setReady('a', true, 0);
  r.setReady('b', true, 0);
  r.tick(3.1);
  pa.spawnProtectionUntil = pb.spawnProtectionUntil = 0;
  const s = createSoFistication({ id: 'ram-a', x: 0, y: 0, z: -6.8, heading: Math.PI });
  const bl = createBiByeLlista({ id: 'bl-b', x: 0, y: 0, z: 0, baseYaw: 0 });
  r.machines = new Map([[s.id, s], [bl.id, bl]]);
  pa.position = soFistEntry(s, r.world);
  assert.equal(mountSoFistication(r, s, pa, 10), true);
  assert.equal(mountBiByeLlista(bl, pb, 10), true);
  assert.equal(fireSoFistication(r, s, 10), true);
  assert.equal(shuntSoFistication(r, s, 10.45, 1), true);
  for (let i = 1; i <= 45; i++) stepRoom(r, 1 / 30, 10 + i / 30, r.world);
  assert.ok(bl.z > 1.5, `Shunt lunge + Piston shoves target cleanly (${bl.z.toFixed(2)}m)`);
});

test('SO-FIST-ICATION and Bi-Bye-llista continuously climb, crest, and exhibit steep slope roll-back on High Grounds siege ramps', async () => {
  const { HIGH_GROUNDS } = await import('../../shared/worlds/highGrounds.mjs');
  const r = new Room('RAMPS');
  r.world = HIGH_GROUNDS;
  r.state = 'PLAYING';
  const pa = r.addPlayer({ id: 'a', token: 'a', name: 'A' }, 0);
  const pb = r.addPlayer({ id: 'b', token: 'b', name: 'B' }, 1);
  r.setReady('a', true, 0);
  r.setReady('b', true, 0);
  r.tick(3.1);
  pa.spawnProtectionUntil = pb.spawnProtectionUntil = 0;

  // High Grounds west-ascent: x=-44..-32, z=-98..-65 rising from y=0 to y=12 (12m/33m = 20 deg)
  const ram = createSoFistication({ id: 'ram', x: -35.5, y: 0, z: -102, heading: Math.PI });
  const bl = createBiByeLlista({ id: 'bl', x: -40.5, y: 0, z: -102, baseYaw: Math.PI });
  r.machines = new Map([[ram.id, ram], [bl.id, bl]]);
  pa.position = soFistEntry(ram, r.world);
  pb.position = { x: -40.5, y: 0, z: -104 };
  assert.equal(mountSoFistication(r, ram, pa, 10), true);
  assert.equal(mountBiByeLlista(bl, pb, 10), true);
  pa.input.forward = 1;
  pb.input.forward = 1;

  for (let i = 1; i <= 960; i++) stepRoom(r, 1 / 30, 10 + i / 30, r.world);
  assert.ok(ram.z > -65 && Math.abs(ram.y - 12) < 0.25, `ram climbed and crested High Grounds west-ascent: z=${ram.z.toFixed(2)}, y=${ram.y.toFixed(2)}`);
  assert.ok(bl.z > -65 && Math.abs(bl.y - 12) < 0.25, `ballista climbed and crested High Grounds west-ascent: z=${bl.z.toFixed(2)}, y=${bl.y.toFixed(2)}`);

  // Park unpowered on steep ramp mid-slope and confirm physical rollback downslope
  const slopeRam = createSoFistication({ id: 'ram-slope', x: -36, y: 6, z: -81.5, heading: Math.PI });
  r.machines.set(slopeRam.id, slopeRam);
  slopeRam.chassisPitch = 0.35;
  for (let i = 1; i <= 35; i++) stepRoom(r, 1 / 30, 25 + i / 30, r.world);
  assert.ok(slopeRam.z < -81.6, `unpowered ram rolls gently down slope: z=${slopeRam.z.toFixed(2)}`);
});
