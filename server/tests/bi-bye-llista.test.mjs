import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { stepRoom } from '../../shared/sim/combat.mjs';
import {
  BI_BYE_LLISTA_CONFIG,
  BI_BYE_STATES,
  mountBiByeLlista,
  dismountBiByeLlista,
  fireBiByeLlista,
  stepBiByeLlista,
  stepBiByeProjectiles,
} from '../../shared/sim/biByeLlista.mjs';
import { serializeSnapshot, applyRoomCommand } from '../../shared/sim/wire.mjs';
import {
  spawnPracticeDummy,
  resetPracticePlayer,
  setPracticeDummyMode,
  PRACTICE_DUMMY_MODES,
} from '../../shared/sim/practice.mjs';
import { getWorld } from '../../shared/worlds/registry.mjs';

function makePracticeRoom() {
  const manager = new RoomManager();
  const room = manager.createSoloRoom('PRACTICE', 0, 'castleward');
  const human = room.addPlayer({ id: 'human-01', token: 'token-human', name: 'Spellblade' }, 0);
  room.armAutoStart(0);
  human.spawnProtectionUntil = 0;
  return { room, human };
}

test('Scenario 1: Shot I hits, Shot II hits (vulnerability applied and exploited: 18 + 98 = 116 damage)', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;
  assert.ok(ballista, 'ballista exists in Practice mode');

  // Place human at ballista mount station and mount
  human.position = { x: 4.3, y: 0, z: -14.6 };
  assert.ok(mountBiByeLlista(ballista, human));
  ballista.yaw = -Math.PI / 2; // Facing +X
  ballista.pitch = 0;

  // Add dummy directly down the line of fire
  const target = room.addServerActor({ id: 'target-dummy', name: 'Target', actorKind: 'dummy' }, 0);
  target.position = { x: 15.0, y: 0, z: -14.6 };
  target.health = 200; // Sufficient health to record both hits
  target.spawnProtectionUntil = 0;

  let nowSec = 1.0;
  assert.ok(fireBiByeLlista(room, ballista, nowSec));
  assert.equal(ballista.state, BI_BYE_STATES.FIRING);

  // Step forward until Shot I lands
  const dt = 1 / 30;
  while (nowSec < 1.18) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec);
    stepBiByeProjectiles(room, dt, nowSec, room.world);
  }

  // Shot I has landed
  assert.equal(target.health, 182, 'target takes 18 damage from conditioning bolt');
  assert.ok(target.bibyeVulnerable, 'target receives bibyeVulnerable condition');
  assert.equal(target.bibyeVulnerable.multiplier, 1.5);
  assert.ok(target.bibyeVulnerable.until > nowSec);

  // Step forward until Shot II lands (fired at 1.20s, reaches target at ~1.35s)
  while (nowSec < 1.45) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec);
    stepBiByeProjectiles(room, dt, nowSec, room.world);
  }

  // Shot II has landed on vulnerable target: 65 * 1.5 = 97.5 -> 98 damage
  assert.equal(target.health, 84, 'target takes 98 damage from siege bolt (182 - 98 = 84)');
  assert.equal(200 - target.health, 116, 'total combo damage is 116');

  // Check event sequence
  const impactEvents = room.events.filter((e) => e.type === 'bibyeBoltImpact');
  assert.equal(impactEvents.length, 2);
  assert.equal(impactEvents[0].subKind, 'conditioning');
  assert.equal(impactEvents[0].inflictedVulnerability, true);
  assert.equal(impactEvents[1].subKind, 'siege');
  assert.equal(impactEvents[1].exploitedVulnerability, true);
  assert.equal(impactEvents[1].damage, 98);
});

test('Scenario 2: Shot I misses, Shot II hits (no vulnerability bonus: 65 damage)', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  human.position = { x: 4.3, y: 0, z: -14.6 };
  mountBiByeLlista(ballista, human);
  ballista.yaw = -Math.PI / 2;
  ballista.pitch = 0;

  let nowSec = 1.0;
  fireBiByeLlista(room, ballista, nowSec);

  const dt = 1 / 30;
  // Step until Shot I has traveled past x = 15.0
  while (nowSec < 1.25) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec);
    stepBiByeProjectiles(room, dt, nowSec, room.world);
  }

  // Target now steps into line of fire before Shot II arrives
  const target = room.addServerActor({ id: 'target-late', name: 'Late Arrival', actorKind: 'dummy' }, nowSec);
  target.position = { x: 15.0, y: 0, z: -14.6 };
  target.health = 100;
  target.spawnProtectionUntil = 0;
  assert.equal(target.bibyeVulnerable, undefined, 'target has no vulnerability');

  // Step until Shot II lands
  while (nowSec < 1.45) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec);
    stepBiByeProjectiles(room, dt, nowSec, room.world);
  }

  // Shot II deals base 65 damage without multiplier
  assert.equal(target.health, 35, 'target takes exactly base 65 damage (100 - 65 = 35)');
  const siegeImpact = room.events.find((e) => e.type === 'bibyeBoltImpact' && e.subKind === 'siege');
  assert.ok(siegeImpact);
  assert.equal(siegeImpact.exploitedVulnerability, false);
  assert.equal(siegeImpact.damage, 65);
});

test('Scenario 3: Shot I hits, Shot II misses (18 damage, vulnerability remains active for 4.0s)', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  human.position = { x: 4.3, y: 0, z: -14.6 };
  mountBiByeLlista(ballista, human);
  ballista.yaw = -Math.PI / 2;
  ballista.pitch = 0;

  const target = room.addServerActor({ id: 'target-dodger', name: 'Dodger', actorKind: 'dummy' }, 0);
  target.position = { x: 15.0, y: 0, z: -14.6 };
  target.health = 100;
  target.spawnProtectionUntil = 0;

  let nowSec = 1.0;
  fireBiByeLlista(room, ballista, nowSec);

  const dt = 1 / 30;
  // Step until Shot I lands
  while (nowSec < 1.18) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec);
    stepBiByeProjectiles(room, dt, nowSec, room.world);
  }

  assert.equal(target.health, 82, 'target takes 18 damage');
  assert.ok(target.bibyeVulnerable, 'target has vulnerability');
  const vulnExpiry = target.bibyeVulnerable.until;

  // Target dodges out of the line of fire before Shot II arrives
  target.position.z = -18.0;

  // Step past Shot II flight
  while (nowSec < 1.50) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec);
    stepBiByeProjectiles(room, dt, nowSec, room.world);
  }

  assert.equal(target.health, 82, 'health unchanged; Shot II missed completely');
  assert.ok(nowSec < vulnExpiry, 'vulnerability is still active');
  assert.ok(target.bibyeVulnerable);

  // Advance time past 4.0s vulnerability window
  nowSec = vulnExpiry + 0.1;
  const snapshot = serializeSnapshot(room, nowSec);
  const targetSnap = snapshot.players.find((p) => p.id === target.id);
  assert.equal(targetSnap.bibyeVulnerable, null, 'vulnerability status expired in snapshot');
});

test('Scenario 4: Both shots miss (0 damage dealt)', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  human.position = { x: 4.3, y: 0, z: -14.6 };
  mountBiByeLlista(ballista, human);

  // Pitch up to max elevation so bolts fly high over targets
  ballista.yaw = -Math.PI / 2;
  ballista.pitch = 0.35;

  const target = room.addServerActor({ id: 'target-ground', name: 'Ground Target', actorKind: 'dummy' }, 0);
  target.position = { x: 15.0, y: 0, z: -14.6 };
  target.health = 100;
  target.spawnProtectionUntil = 0;

  let nowSec = 1.0;
  fireBiByeLlista(room, ballista, nowSec);

  const dt = 1 / 30;
  while (nowSec < 2.5) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec);
    stepBiByeProjectiles(room, dt, nowSec, room.world);
  }

  assert.equal(target.health, 100, 'target takes 0 damage');
  assert.equal(target.bibyeVulnerable, undefined, 'no status applied');
});

test('Scenario 5: Target moves between shots (Shot II does not home along committed line)', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  human.position = { x: 4.3, y: 0, z: -14.6 };
  mountBiByeLlista(ballista, human);
  ballista.yaw = -Math.PI / 2;
  ballista.pitch = 0;

  const target = room.addServerActor({ id: 'target-mover', name: 'Mover', actorKind: 'dummy' }, 0);
  target.position = { x: 15.0, y: 0, z: -14.6 };
  target.health = 100;
  target.spawnProtectionUntil = 0;

  let nowSec = 1.0;
  fireBiByeLlista(room, ballista, nowSec);

  const dt = 1 / 30;
  // Step until Shot I hits
  while (nowSec < 1.18) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec);
    stepBiByeProjectiles(room, dt, nowSec, room.world);
  }
  assert.equal(target.health, 82);

  // Target dashes north to z = -12.0 before Shot II arrives
  target.position.z = -12.0;

  // Also rotate operator aim to test if ballista re-aims: committed aim must NOT change
  human.yaw = -Math.PI / 4;
  human.pitch = 0.2;

  while (nowSec < 1.45) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec);
    stepBiByeProjectiles(room, dt, nowSec, room.world);
  }

  // Shot II stayed on original line (z = -14.6) and did not track the mover
  assert.equal(target.health, 82, 'target successfully dodged Shot II');
  const impacts = room.events.filter((e) => e.type === 'bibyeBoltImpact' && e.hitKind === 'player');
  assert.equal(impacts.length, 1, 'only Shot I impacted player');
});

test('Scenario 6: Obstacles intercept projectiles (solid wall blocks both bolts)', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  human.position = { x: 4.3, y: 0, z: -14.6 };
  mountBiByeLlista(ballista, human);
  ballista.yaw = -Math.PI / 2;
  ballista.pitch = 0;

  // Add a solid wooden barricade between ballista and target
  const testWorld = {
    ...room.world,
    solids: [
      ...room.world.solids,
      { id: 'practice-test-barricade', center: [11.0, 1.0, -14.6], size: [0.6, 2.5, 3.0], material: 'timber' },
    ],
  };

  const target = room.addServerActor({ id: 'target-shielded', name: 'Shielded Target', actorKind: 'dummy' }, 0);
  target.position = { x: 15.0, y: 0, z: -14.6 };
  target.health = 100;
  target.spawnProtectionUntil = 0;

  let nowSec = 1.0;
  fireBiByeLlista(room, ballista, nowSec);

  const dt = 1 / 30;
  while (nowSec < 1.5) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec);
    stepBiByeProjectiles(room, dt, nowSec, testWorld);
  }

  assert.equal(target.health, 100, 'target behind barricade took 0 damage');
  const wallHits = room.events.filter((e) => e.type === 'bibyeBoltImpact' && e.hitKind === 'solid');
  assert.equal(wallHits.length, 2, 'both bolts were stopped by the solid barricade');
  assert.equal(wallHits[0].solidId, 'practice-test-barricade');
  assert.equal(wallHits[1].solidId, 'practice-test-barricade');
});

test('Scenario 7: Reload completes normally (SPENT -> RELOADING 6.0s -> LOADED)', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  human.position = { x: 4.3, y: 0, z: -14.6 };
  mountBiByeLlista(ballista, human);

  let nowSec = 1.0;
  assert.equal(ballista.state, BI_BYE_STATES.LOADED);

  fireBiByeLlista(room, ballista, nowSec);
  assert.equal(ballista.state, BI_BYE_STATES.FIRING);

  const dt = 1 / 30;
  // Step past Shot II (0.200s)
  while (nowSec < 1.22) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec);
  }
  assert.equal(ballista.state, BI_BYE_STATES.SPENT, 'ballista is in SPENT recovery');

  // Step past spent recovery (0.250s after Shot II -> ~1.46s)
  while (nowSec < 1.50) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec);
  }
  assert.equal(ballista.state, BI_BYE_STATES.RELOADING, 'ballista entered RELOADING');

  // Check reloadProgress midway through 6.0s reload
  while (nowSec < 4.50) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec);
  }
  let snap = serializeSnapshot(room, nowSec);
  assert.ok(snap.bibyeBallista.reloadProgress > 0.4 && snap.bibyeBallista.reloadProgress < 0.6);

  // Step until reload completes (6.0s after reload started at ~1.45s -> ~7.46s)
  while (nowSec < 7.60) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec);
  }
  assert.equal(ballista.state, BI_BYE_STATES.LOADED, 'ballista has fully reloaded to LOADED');
  assert.equal(ballista.committedAim, null, 'committed aim is reset');

  // Ready to fire again
  assert.ok(fireBiByeLlista(room, ballista, nowSec));
  assert.equal(ballista.state, BI_BYE_STATES.FIRING);
});

test('Scenario 8: Reload / operation interrupted (operator dismounts; state preserved)', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  human.position = { x: 4.3, y: 0, z: -14.6 };
  mountBiByeLlista(ballista, human);

  let nowSec = 1.0;
  fireBiByeLlista(room, ballista, nowSec);

  const dt = 1 / 30;
  // Step into RELOADING state
  while (nowSec < 1.6) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec);
  }
  assert.equal(ballista.state, BI_BYE_STATES.RELOADING);
  assert.equal(ballista.operatorId, human.id);

  // Dismount operator midway
  dismountBiByeLlista(ballista, human);
  assert.equal(ballista.operatorId, null);
  assert.equal(human.operatingBallistaId, null);
  assert.equal(ballista.state, BI_BYE_STATES.RELOADING, 'reloading state preserved when operator leaves');

  // Step simulation forward: reload proceeds autonomously
  while (nowSec < 7.7) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec);
  }
  assert.equal(ballista.state, BI_BYE_STATES.LOADED, 'reload completes autonomously without operator');
});

test('Scenario 9: Spellblade leaves and returns to weapon (dismount -> move/cast -> remount -> fire)', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  human.position = { x: 4.3, y: 0, z: -14.6 };
  applyRoomCommand(room, human, { type: 'bibyeOperate' }, 1.0);
  assert.equal(ballista.operatorId, human.id);
  assert.equal(human.operatingBallistaId, ballista.id);

  // While mounted, walking input is locked to station
  stepRoom(room, 1 / 30, 1.05, room.world);
  assert.equal(human.position.x, 4.3);
  assert.equal(human.position.z, -14.6);

  // Jump to dismount
  human.input = { jump: true, forward: true };
  stepRoom(room, 1 / 30, 1.10, room.world);
  assert.equal(human.operatingBallistaId, null, 'dismounted on jump');
  assert.equal(ballista.operatorId, null);

  // Spellblade moves away into the meadow and casts a spell
  human.input = { forward: true };
  human.position = { x: 10.0, y: 0, z: -10.0 };
  stepRoom(room, 1 / 30, 1.20, room.world);
  assert.ok(human.alive);

  // Spellblade returns to ballista emplacement station
  human.position = { x: 4.3, y: 0, z: -14.6 };
  applyRoomCommand(room, human, { type: 'bibyeOperate' }, 2.0);
  assert.equal(ballista.operatorId, human.id);
  assert.equal(human.operatingBallistaId, ballista.id);

  // Fires ballista using primary attack command
  applyRoomCommand(room, human, { type: 'attack', down: true }, 2.1);
  assert.equal(ballista.state, BI_BYE_STATES.FIRING);
});

test('Scenario 10: Practice Yard stability (normal combat unaffected, dummy spawning works)', () => {
  const { room, human } = makePracticeRoom();

  // Test dummy lifecycle alongside ballista
  const dummy = spawnPracticeDummy(room, PRACTICE_DUMMY_MODES.PASSIVE, 1.0);
  assert.ok(dummy);
  assert.equal(dummy.practiceMode, PRACTICE_DUMMY_MODES.PASSIVE);

  // Switch dummy mode
  assert.ok(setPracticeDummyMode(room, PRACTICE_DUMMY_MODES.GUARDING, 1.5));
  assert.equal(dummy.practiceMode, PRACTICE_DUMMY_MODES.GUARDING);

  // Reset player
  human.health = 20;
  assert.ok(resetPracticePlayer(room, human.id, 2.0));
  assert.equal(human.health, 100);

  // Verify snapshot serialization contains ballista state
  const snapshot = serializeSnapshot(room, 2.0);
  assert.ok(snapshot.bibyeBallista);
  assert.equal(snapshot.bibyeBallista.id, 'bibye-practice-01');
  assert.equal(snapshot.bibyeBallista.state, BI_BYE_STATES.LOADED);
  assert.equal(snapshot.bibyeBallista.reloadProgress, 1.0);
  assert.equal(Array.isArray(snapshot.bibyeProjectiles), true);

  // In non-practice room, ballista is null and commands rejected
  const ffaRoom = new Room('FFA01', { mode: 'FFA', worldId: 'castleward' });
  const ffaPlayer = ffaRoom.addPlayer({ id: 'p1', token: 'tok1' }, 0);
  assert.equal(ffaRoom.biByeLlista, null);
  assert.equal(ffaRoom.bibyeProjectiles, null);

  const resOperate = applyRoomCommand(ffaRoom, ffaPlayer, { type: 'bibyeOperate' }, 1.0);
  assert.equal(resOperate.rejected, 'No ballista available');

  const resFire = applyRoomCommand(ffaRoom, ffaPlayer, { type: 'bibyeFire' }, 1.0);
  assert.equal(resFire.rejected, 'No ballista available');
});
