import test from 'node:test';
import assert from 'node:assert/strict';
import { createFightFlight, mountFightFlight, stepFightFlight } from '../../shared/sim/fightFlight.mjs';
import { requestFightFlightFire, stepFightFlightWeapons, stepFightFlightProjectiles, FLIGHT_REPEATER } from '../../shared/sim/fightFlightWeapons.mjs';
import { flightRepeaterAim, flightMuzzle, flightDirection, solveConvergence, inverseTransform } from '../../shared/src/flightRepeaterAim.mjs';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { applyRoomCommand } from '../../shared/sim/wire.mjs';

function distToRay(origin, dir, point) {
  const v = { x: point.x - origin.x, y: point.y - origin.y, z: point.z - origin.z };
  const dLen = Math.hypot(dir.x, dir.y, dir.z);
  const u = { x: dir.x / dLen, y: dir.y / dLen, z: dir.z / dLen };
  const t = v.x * u.x + v.y * u.y + v.z * u.z;
  const proj = { x: origin.x + u.x * t, y: origin.y + u.y * t, z: origin.z + u.z * t };
  return Math.hypot(point.x - proj.x, point.y - proj.y, point.z - proj.z);
}

test('Repeater traverse corridor expands to +-50 deg and elevation to +-65 deg', () => {
  assert.ok(Math.abs(FLIGHT_REPEATER.maxTraverse - (Math.PI * 50 / 180)) < 1e-6);
  assert.ok(Math.abs(FLIGHT_REPEATER.maxPitch - (Math.PI * 65 / 180)) < 1e-6);
  assert.ok(Math.abs(FLIGHT_REPEATER.minPitch - (-Math.PI * 65 / 180)) < 1e-6);

  const m = createFightFlight({ heading: 0, runPitch: 0 });
  const aimRight = flightRepeaterAim(m, { yaw: Math.PI * 45 / 180, pitch: 0 });
  assert.ok(Math.abs(aimRight.yaw - (Math.PI * 45 / 180)) < 1e-4);

  const aimHigh = flightRepeaterAim(m, { yaw: 0, pitch: Math.PI * 60 / 180 });
  assert.ok(Math.abs(aimHigh.pitch - (Math.PI * 60 / 180)) < 1e-4);
});

test('Crossbow convergence solves muzzle trajectory toward target across 3m, 8m, 20m, 50m with sub-centimeter accuracy', () => {
  const m = createFightFlight({ x: 5, y: 3, z: 10, heading: 0.6, runPitch: 0.1 });
  const eye = { x: m.x, y: m.y + 1.52, z: m.z };

  for (const dist of [3, 8, 20, 50]) {
    // Look ray straight ahead along camera look direction
    const camYaw = 0.6, camPitch = -0.05;
    const fwd = [-Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), -Math.cos(camYaw) * Math.cos(camPitch)];
    const target = { x: eye.x + fwd[0] * dist, y: eye.y + fwd[1] * dist, z: eye.z + fwd[2] * dist };

    const aim = flightRepeaterAim(m, { siegeTarget: target });
    const muz = flightMuzzle(m, aim);
    const dir = flightDirection(m, aim);
    const miss = distToRay(muz, dir, target);

    // Cross-track miss must be under 1 cm (0.01 m)
    assert.ok(miss < 0.01, `Miss at ${dist}m was ${(miss * 1000).toFixed(2)}mm, expected < 10mm`);
  }
});

test('Wire command passes siegeTarget to flight driver and fires directly through target', () => {
  const room = new RoomManager().createSoloRoom('PRACTICE', 0, 'castleward');
  room.world = { solids: [], ramps: [], floors: [{ id: 'floor', center: [0, -.1, 0], size: [100, .2, 100], y: 0 }], spawnPoints: [{ x: 0, y: 0, z: 0 }], abyssY: -30 };
  room.state = 'PLAYING'; room.events = []; room.fightFlightProjectiles = new Map();
  const pilot = room.addPlayer({ id: 'pilot', token: 'pilot', name: 'Pilot' }, 0);
  const m = createFightFlight({ x: 0, y: 0, z: 0, id: 'flight-1' });
  room.fightFlight = m;
  mountFightFlight(room, m, pilot);

  // Enemy standing 8m directly ahead along centerline (x=0, z=-8), NOT offset to left (x=-0.65)
  const enemy = room.addPlayer({ id: 'enemy', token: 'enemy', name: 'Enemy' }, 0);
  enemy.position = { x: 0, y: 0, z: -8 };
  enemy.spawnProtectionUntil = 0; enemy.guarding = false;

  // Send input with converged siegeTarget at center of enemy body (y = 1.0)
  applyRoomCommand(room, pilot, {
    type: 'input',
    yaw: 0,
    pitch: 0,
    siegeTarget: { x: 0, y: 1.0, z: -8 },
  }, 1);

  assert.ok(pilot.input.siegeTarget, 'wire must preserve siegeTarget for flight operator');
  assert.equal(pilot.input.siegeTarget.x, 0);
  assert.equal(pilot.input.siegeTarget.z, -8);

  // Fire bolt
  assert.equal(requestFightFlightFire(room, m, pilot, true, 1), true);
  requestFightFlightFire(room, m, pilot, false, 1.01);

  // Step projectiles: bolt must strike enemy dead center on centerline
  for (let i = 1; i < 15; i++) stepFightFlightProjectiles(room, 1 / 30, 1 + i / 30);
  assert.equal(enemy.health, 96, 'converged bolt must hit target on centerline across 8m');
});

test('Airborne turning rate is increased to 4.2 rad/s for responsive tracking', () => {
  const room = new RoomManager().createSoloRoom('PRACTICE', 0, 'castleward');
  room.world = { solids: [], ramps: [], floors: [{ id: 'floor', center: [0, -.1, 0], size: [100, .2, 100], y: 0 }], spawnPoints: [{ x: 0, y: 0, z: 0 }], abyssY: -30 };
  const pilot = room.addPlayer({ id: 'pilot', token: 'pilot', name: 'Pilot' }, 0);
  const m = createFightFlight({ x: 0, y: 0, z: 0, id: 'flight-1' });
  pilot.position = { x: 0, y: 0, z: 1 };
  room.fightFlight = m;
  assert.equal(mountFightFlight(room, m, pilot), true);
  m.y = 10; m.grounded = false; m.flightCharge = 50; m.rotorAngularVelocity = Math.PI * 15;

  // Want to turn 90 deg (Math.PI / 2 ≈ 1.57 rad)
  pilot.input = { yaw: Math.PI / 2, pitch: 0 };
  const hBefore = m.heading;
  stepFightFlight(room, m, 0.1, 1);
  const turn = m.heading - hBefore;

  // In 0.1s at 4.2 rad/s, turned ~0.42 rad
  assert.ok(turn >= 0.40 && turn <= 0.43, `Turn delta was ${turn.toFixed(3)}, expected ~0.42 rad`);
});

test('Mounted normal sword attack suspends repeater fire; active Chivalry permits concurrency', () => {
  const room = new RoomManager().createSoloRoom('PRACTICE', 0, 'castleward');
  room.world = { solids: [], ramps: [], floors: [{ id: 'floor', center: [0, -.1, 0], size: [100, .2, 100], y: 0 }], spawnPoints: [{ x: 0, y: 0, z: 0 }], abyssY: -30 };
  const pilot = room.addPlayer({ id: 'pilot', token: 'pilot', name: 'Pilot' }, 0);
  const m = createFightFlight({ x: 0, y: 0, z: 0, id: 'flight-1' });
  pilot.position = { x: 0, y: 0, z: 1 };
  room.fightFlight = m;
  mountFightFlight(room, m, pilot);

  // Normal sword swing active
  pilot.attackActive = true;
  requestFightFlightFire(room, m, pilot, true, 1);
  assert.equal(room.fightFlightProjectiles.size, 0, 'no bolt released while ordinary sword is swinging');
  assert.equal(m.ammo, 14, 'ammo unspent');

  // Activate Chivalry
  pilot.ultimate = 'chivalry';
  pilot.ultimateState = { id: 'chivalry', phase: 'active', at: 1, until: 15 };
  requestFightFlightFire(room, m, pilot, true, 1.1);
  assert.equal(room.fightFlightProjectiles.size, 1, 'bolt released under Chivalry');
  assert.equal(m.ammo, 13, 'ammo spent under Chivalry');
});
