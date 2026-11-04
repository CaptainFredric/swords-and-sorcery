import test from 'node:test';
import assert from 'node:assert/strict';
import { createFightFlight, mountFightFlight, dismountFightFlight, stepFightFlight } from '../../shared/sim/fightFlight.mjs';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';

function createSetup() {
  const manager = new RoomManager();
  const room = manager.createSoloRoom('PRACTICE', 0, 'castleward');
  room.state = 'PLAYING';
  room.world = { floors: [{ y: 0, center: [0, 0, 0], size: [200, 0.2, 200] }], solids: [], ramps: [] };
  const p = room.addPlayer({ id: 'pilot', token: 'pilot', name: 'Pilot' }, 0);
  p.position = { x: 0, y: 0, z: 1 };
  p.ultimate = 'chivalry';
  p.prowess = 100;
  const m = createFightFlight();
  room.fightFlight = m;
  return { room, p, m };
}

test('mounting Fight-and-Flight cleanly resets any stale ground spool, run and heading states', () => {
  const { room, p, m } = createSetup();
  m.runGroundPhase = 'SPINUP';
  m.runGroundReleased = true;
  m.runGroundLaunchReady = true;
  m.runCommitHeading = null;
  m.runTurnSpeed = 1.5;
  m.flightDashHeld = true;
  m.offensiveRun = true;

  assert.equal(mountFightFlight(room, m, p, 1.0), true);
  assert.equal(m.operatorId, p.id);
  assert.equal(m.runGroundPhase, null);
  assert.equal(m.runGroundReleased, false);
  assert.equal(m.runGroundLaunchReady, false);
  assert.equal(m.flightDashHeld, false);
  assert.equal(m.offensiveRun, false);
  assert.equal(m.runTurnSpeed, 0);
  assert.ok(Number.isFinite(m.runCommitHeading));
  assert.ok(Number.isFinite(p.input.yaw));
});

test('stepFightFlight survives null, undefined, or NaN yaw inputs and runCommitHeading without propagating NaN', () => {
  const { room, p, m } = createSetup();
  mountFightFlight(room, m, p, 0);

  // Inject corrupted / undefined inputs
  p.input.yaw = NaN;
  p.input.pitch = undefined;
  m.runCommitHeading = undefined;
  m.runGroundPhase = 'SPINUP';

  // Step simulation multiple frames
  for (let i = 0; i < 30; i++) {
    stepFightFlight(room, m, 1 / 60, i * (1 / 60));
  }

  assert.ok(Number.isFinite(m.heading), 'm.heading must remain finite: ' + m.heading);
  assert.ok(Number.isFinite(m.x), 'm.x must remain finite');
  assert.ok(Number.isFinite(m.y), 'm.y must remain finite');
  assert.ok(Number.isFinite(m.z), 'm.z must remain finite');
  assert.ok(Number.isFinite(m.velocity.x), 'm.velocity.x must remain finite');
  assert.ok(Number.isFinite(m.velocity.y), 'm.velocity.y must remain finite');
  assert.ok(Number.isFinite(m.velocity.z), 'm.velocity.z must remain finite');
});

test('stepFightFlight operator heading tracking works smoothly when inputs are valid', () => {
  const { room, p, m } = createSetup();
  mountFightFlight(room, m, p, 0);

  p.input.yaw = 1.25;
  p.flightInputAt = 0.5;

  for (let i = 0; i < 60; i++) {
    stepFightFlight(room, m, 1 / 60, 0.5 + i * (1 / 60));
  }

  assert.ok(Number.isFinite(m.heading));
  assert.ok(Math.abs(m.heading - 1.25) < 0.1, 'heading turns toward input.yaw');
});
