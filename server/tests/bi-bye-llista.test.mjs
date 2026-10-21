import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { stepRoom, applyDamage } from '../../shared/sim/combat.mjs';
import {
  BI_BYE_LLISTA_CONFIG,
  BI_BYE_STATES,
  BI_BYE_MODES,
  mountBiByeLlista,
  dismountBiByeLlista,
  toggleBiByeDeploy,
  damageBiByeLlista,
  fireBiByeMobile,
  fireBiByeFullVolley,
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
import { callSteel } from '../../shared/src/steel.mjs';

function makePracticeRoom() {
  const manager = new RoomManager();
  const room = manager.createSoloRoom('PRACTICE', 0, 'castleward');
  const human = room.addPlayer({ id: 'human-01', token: 'token-human', name: 'Spellblade' }, 0);
  room.armAutoStart(0);
  human.spawnProtectionUntil = 0;
  return { room, human };
}

test('Scenario 1: Full deployed volley lethality against unprotected 100 HP Spellblade (18 + 85 = 103 dmg)', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;
  assert.ok(ballista, 'ballista exists in Practice mode');

  human.position = { x: 7.8, y: 0, z: -14.6 };
  mountBiByeLlista(ballista, human);

  // Deploy outriggers
  toggleBiByeDeploy(ballista, 0);
  stepBiByeLlista(room, ballista, 1.25, 1.25, room.world);
  assert.equal(ballista.mode, BI_BYE_MODES.DEPLOYED);

  ballista.yaw = -Math.PI / 2; // Facing +X
  ballista.pitch = 0;

  // Add full-health 100 HP dummy directly in line of fire
  const target = room.addServerActor({ id: 'target-hero', name: 'Hero', actorKind: 'dummy' }, 0);
  target.position = { x: 15.0, y: 0, z: -14.6 };
  target.health = 100;
  target.spawnProtectionUntil = 0;

  let nowSec = 2.0;
  assert.ok(fireBiByeLlista(room, ballista, nowSec));
  assert.equal(ballista.state, BI_BYE_STATES.FIRING);

  const dt = 1 / 30;

  // Step until Shot I releases at 2.450s and hits at ~2.62s
  while (nowSec < 2.65) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec, room.world);
    stepBiByeProjectiles(room, dt, nowSec, room.world);
  }

  // Shot I hit: 18 direct damage (100 -> 82), stamina drained, chill applied, NO arbitrary multiplier
  assert.equal(target.health, 82, 'target takes exactly 18 damage from conditioning bolt');
  assert.ok(target.chill, 'target is chilled');
  assert.equal(target.bibyeVulnerable, undefined, 'no arbitrary vulnerability multiplier exists');

  // Step until Shot II releases at 2.650s and hits at ~2.80s
  while (nowSec < 2.85) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec, room.world);
    stepBiByeProjectiles(room, dt, nowSec, room.world);
  }

  // Shot II deals 85 direct damage: 82 - 85 <= 0 -> target defeated!
  assert.equal(target.health, 0, 'target takes 85 direct siege damage and is defeated');
  assert.equal(target.alive, false, 'unprotected 100 HP Spellblade is felled by two direct hits');
});

test('Scenario 2: Frost Conditioning Bolt blast radius, stamina drain, and fading chill', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  human.position = { x: 7.8, y: 0, z: -14.6 };
  mountBiByeLlista(ballista, human);

  // Deploy outriggers
  toggleBiByeDeploy(ballista, 0);
  stepBiByeLlista(room, ballista, 1.25, 1.25, room.world);

  ballista.yaw = -Math.PI / 2;
  ballista.pitch = 0;

  // Place guarding defender within 1.0m of blast impact point
  const defender = room.addServerActor({ id: 'guard-defender', name: 'Defender', actorKind: 'dummy' }, 0);
  defender.position = { x: 15.0, y: 0, z: -14.6 };
  defender.health = 100;
  defender.guardStamina = 50;
  defender.guarding = true;
  defender.spawnProtectionUntil = 0;

  let nowSec = 2.0;
  fireBiByeLlista(room, ballista, nowSec);

  const dt = 1 / 30;
  while (nowSec < 2.65) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec, room.world);
    stepBiByeProjectiles(room, dt, nowSec, room.world);
  }

  // Guard stamina drained by ~22 points (solid sword strike equivalent)
  assert.ok(defender.guardStamina <= 30 && defender.guardStamina >= 25, 'guard stamina drained by blast');
  assert.equal(defender.health, 100, 'raised guard absorbs health damage');
  assert.ok(defender.chill, 'fading chill applied');
  assert.ok(defender.chill.slow >= 0.18 && defender.chill.slow <= 0.22, 'initial edge slow ~0.20 for guarded defender');
  assert.ok(defender.chill.until - defender.chill.startedAt >= 1.9, 'edge thaw duration ~2.0s');
});

test('Scenario 3: Main Physical Siege Bolt direct hit, shove, and stagger', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  human.position = { x: 7.8, y: 0, z: -14.6 };
  mountBiByeLlista(ballista, human);
  toggleBiByeDeploy(ballista, 0);
  stepBiByeLlista(room, ballista, 1.25, 1.25, room.world);

  ballista.yaw = -Math.PI / 2;
  ballista.pitch = 0;

  // Add dummy at x = 15.0 with 200 HP to inspect pure Shot II effect
  const target = room.addServerActor({ id: 'heavy-dummy', name: 'Heavy Dummy', actorKind: 'dummy' }, 0);
  target.position = { x: 15.0, y: 0, z: -14.6 };
  target.health = 200;
  target.spawnProtectionUntil = 0;

  let nowSec = 2.0;
  fireBiByeLlista(room, ballista, nowSec);

  const dt = 1 / 30;
  while (nowSec < 2.85) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec, room.world);
    stepBiByeProjectiles(room, dt, nowSec, room.world);
  }

  // 18 from Shot I + 85 from Shot II = 103 total damage
  assert.equal(target.health, 97, 'takes 103 damage (200 - 103 = 97)');
  assert.ok(target.impulse.x > 5.0, 'heavy physical knockback applied');
  assert.ok(target.stagger.level > 0.4, 'heavy stagger applied');
});

test('Scenario 4: Siege shockwave damages nearby targets but does NOT double-hit direct victim', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  human.position = { x: 7.8, y: 0, z: -14.6 };
  mountBiByeLlista(ballista, human);
  toggleBiByeDeploy(ballista, 0);
  stepBiByeLlista(room, ballista, 1.25, 1.25, room.world);

  ballista.yaw = -Math.PI / 2;
  ballista.pitch = 0;

  // Direct victim at x = 15.0, z = -14.6
  const directVictim = room.addServerActor({ id: 'direct-target', name: 'Direct', actorKind: 'dummy' }, 0);
  directVictim.position = { x: 15.0, y: 0, z: -14.6 };
  directVictim.health = 200;
  directVictim.spawnProtectionUntil = 0;

  // Bystander 2.0m away at x = 15.0, z = -12.6 (within 3.5m shockwave)
  const bystander = room.addServerActor({ id: 'bystander', name: 'Bystander', actorKind: 'dummy' }, 0);
  bystander.position = { x: 15.0, y: 0, z: -12.6 };
  bystander.health = 100;
  bystander.spawnProtectionUntil = 0;

  let nowSec = 2.0;
  fireBiByeLlista(room, ballista, nowSec);

  const dt = 1 / 30;
  while (nowSec < 2.90) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec, room.world);
    stepBiByeProjectiles(room, dt, nowSec, room.world);
  }

  // Bystander took shockwave damage
  assert.ok(bystander.health < 100, 'bystander took shockwave damage');
  assert.ok(bystander.health >= 75, 'shockwave damage attenuated with distance');

  // Direct victim took exactly 18 (Shot I) + 85 (Shot II) = 103 damage, NOT double-hit by shockwave
  assert.equal(directVictim.health, 97, 'direct victim was not double-hit by shockwave');
});

test('Scenario 5: Solid world collision stops physical siege bolt without tunneling', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  human.position = { x: 7.8, y: 0, z: -14.6 };
  mountBiByeLlista(ballista, human);
  toggleBiByeDeploy(ballista, 0);
  stepBiByeLlista(room, ballista, 1.25, 1.25, room.world);

  ballista.yaw = -Math.PI / 2;
  ballista.pitch = 0;

  // Add solid stone wall at x = 12.0
  const worldWithWall = {
    ...room.world,
    solids: [
      ...room.world.solids,
      { id: 'stone-rampart', center: [12.0, 1.0, -14.6], size: [0.8, 4.0, 4.0], material: 'stone' },
    ],
  };

  const targetBehindWall = room.addServerActor({ id: 'behind-wall', name: 'Behind Wall', actorKind: 'dummy' }, 0);
  targetBehindWall.position = { x: 15.0, y: 0, z: -14.6 };
  targetBehindWall.health = 100;
  targetBehindWall.spawnProtectionUntil = 0;

  let nowSec = 2.0;
  fireBiByeLlista(room, ballista, nowSec);

  const dt = 1 / 30;
  while (nowSec < 3.0) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec, worldWithWall);
    stepBiByeProjectiles(room, dt, nowSec, worldWithWall);
  }

  assert.equal(targetBehindWall.health, 100, 'target behind solid wall takes 0 damage');
  const impacts = room.events.filter((e) => e.type === 'bibyeBoltImpact' && e.hitKind === 'solid');
  assert.equal(impacts.length, 2, 'both bolts stopped by solid stone wall');
});

test('Scenario 6: Mobile Mode travel, steering, and independent Shot I firing on move', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  assert.equal(ballista.mode, BI_BYE_MODES.MOBILE, 'starts in mobile mode');

  human.position = { x: 7.8, y: 0, z: -14.6 };
  mountBiByeLlista(ballista, human);

  const startX = ballista.x;
  const startZ = ballista.z;

  // Drive forward in mobile mode
  human.input = { forward: true };
  const dt = 1 / 30;
  for (let i = 0; i < 30; i++) {
    stepBiByeLlista(room, ballista, dt, 1.0 + i * dt, room.world);
  }

  assert.ok(ballista.x > startX, 'carriage moved forward along heading');
  assert.ok(human.position.x > startX - 1.5, 'operator moved with carriage');

  // Fire Shot I while mobile
  let nowSec = 2.0;
  assert.ok(fireBiByeLlista(room, ballista, nowSec), 'Shot I can be fired while moving');
  assert.equal(ballista.mainBoltLoaded, true, 'main bolt was NOT consumed by mobile shot');
  assert.ok(nowSec < ballista.smallBoltReadyAt, 'small bolt has recock cooldown');

  // Full volley is rejected while mobile
  assert.equal(fireBiByeFullVolley(room, ballista, nowSec), false, 'full volley unavailable while mobile');
});

test('Scenario 7: Deployed Mode transition, swivel traverse, and full reload cycle', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  human.position = { x: 7.8, y: 0, z: -14.6 };
  mountBiByeLlista(ballista, human);

  // Toggle deploy
  assert.ok(toggleBiByeDeploy(ballista, 1.0));
  assert.equal(ballista.mode, BI_BYE_MODES.DEPLOYING);

  // Advance past 1.2s deploy transition
  stepBiByeLlista(room, ballista, 1.25, 2.25, room.world);
  assert.equal(ballista.mode, BI_BYE_MODES.DEPLOYED);

  // Carriage cannot move while deployed
  const posX = ballista.x;
  human.input = { forward: true };
  stepBiByeLlista(room, ballista, 0.1, 2.35, room.world);
  assert.equal(ballista.x, posX, 'carriage movement locked while deployed');

  // Swivel upper launcher independently
  human.input = { yaw: -Math.PI / 3, pitch: 0.2 };
  stepBiByeLlista(room, ballista, 0.1, 2.45, room.world);
  assert.ok(Math.abs(ballista.pitch - 0.2) < 1e-4, 'swivel pitch updated');

  // Fire full volley
  let nowSec = 3.0;
  assert.ok(fireBiByeFullVolley(room, ballista, nowSec));
  assert.equal(ballista.state, BI_BYE_STATES.FIRING);

  // Advance past Shot I (0.450s) and Shot II (0.650s)
  while (nowSec < 3.70) {
    nowSec += 1 / 30;
    stepBiByeLlista(room, ballista, 1 / 30, nowSec, room.world);
  }
  assert.equal(ballista.state, BI_BYE_STATES.SPENT);
  assert.equal(ballista.mainBoltLoaded, false);

  // Advance into RELOADING
  while (nowSec < 4.0) {
    nowSec += 1 / 30;
    stepBiByeLlista(room, ballista, 1 / 30, nowSec, room.world);
  }
  assert.equal(ballista.state, BI_BYE_STATES.RELOADING);

  // Advance 6.0s through mechanical reload
  while (nowSec < 10.1) {
    nowSec += 1 / 30;
    stepBiByeLlista(room, ballista, 1 / 30, nowSec, room.world);
  }
  assert.equal(ballista.state, BI_BYE_STATES.LOADED);
  assert.equal(ballista.mainBoltLoaded, true);

  // Retract outriggers to restore mobile mode
  assert.ok(toggleBiByeDeploy(ballista, nowSec));
  assert.equal(ballista.mode, BI_BYE_MODES.RETRACTING);
  stepBiByeLlista(room, ballista, 1.25, nowSec + 1.25, room.world);
  assert.equal(ballista.mode, BI_BYE_MODES.MOBILE);
});

test('Scenario 8: Siege-machine durability, destruction, and safe operator dismount', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  human.position = { x: 7.8, y: 0, z: -14.6 };
  mountBiByeLlista(ballista, human);

  assert.equal(ballista.health, 400);

  // Takes damage from attack
  damageBiByeLlista(room, ballista, 150, 'attacker-01', 'sword', 1.0);
  assert.equal(ballista.health, 250);
  assert.equal(ballista.mode, BI_BYE_MODES.MOBILE);
  assert.equal(ballista.operatorId, human.id);

  // Lethal damage to siege engine
  damageBiByeLlista(room, ballista, 300, 'attacker-01', 'sword', 2.0);
  assert.equal(ballista.health, 0);
  assert.equal(ballista.mode, BI_BYE_MODES.DESTROYED);

  // Operator is safely dismounted and remains alive
  assert.equal(ballista.operatorId, null, 'operator dismounted on vehicle destruction');
  assert.equal(human.operatingBallistaId, null);
  assert.equal(human.alive, true, 'operator is alive');

  // Disabled: cannot move, deploy, or fire
  assert.equal(toggleBiByeDeploy(ballista, 3.0), false, 'cannot deploy destroyed vehicle');
  assert.equal(fireBiByeLlista(room, ballista, 3.0), false, 'cannot fire destroyed vehicle');

  // Practice reset restores ballista
  assert.ok(resetPracticePlayer(room, human.id, 4.0));
  assert.equal(ballista.health, 400, 'practice reset restores ballista HP');
  assert.equal(ballista.mode, BI_BYE_MODES.MOBILE);
});

test('Scenario 9: Sheathe in Steel mitigates ballista volley: Spellblade survives with 33 HP', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  human.position = { x: 7.8, y: 0, z: -14.6 };
  mountBiByeLlista(ballista, human);
  toggleBiByeDeploy(ballista, 0);
  stepBiByeLlista(room, ballista, 1.25, 1.25, room.world);

  ballista.yaw = -Math.PI / 2;
  ballista.pitch = 0;

  // Defender Sheathed in Steel
  const defender = room.addServerActor({ id: 'steeled-knight', name: 'Steeled Knight', actorKind: 'dummy' }, 0);
  defender.position = { x: 15.0, y: 0, z: -14.6 };
  defender.health = 100;
  defender.spawnProtectionUntil = 0;
  defender.steel = callSteel(1.0); // Fully hardened

  let nowSec = 2.0;
  fireBiByeLlista(room, ballista, nowSec);

  const dt = 1 / 30;
  // Step past Shot I (conditioning bolt)
  while (nowSec < 2.65) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec, room.world);
    stepBiByeProjectiles(room, dt, nowSec, room.world);
  }

  // Conditioning bolt mitigated from 18 to min 12: health drops 100 -> 88
  assert.equal(defender.health, 88, 'frost bolt mitigated from 18 to min 12');
  assert.ok(defender.chill, 'cold/chill still applied (physical consequences distinct)');

  // Step past Shot II (siege bolt)
  while (nowSec < 2.85) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec, room.world);
    stepBiByeProjectiles(room, dt, nowSec, room.world);
  }

  // Siege bolt mitigated from 85 to min 55: health drops 88 - 55 = 33!
  assert.equal(defender.health, 33, 'siege bolt mitigated from 85 to min 55 (88 - 55 = 33 HP)');
  assert.equal(defender.alive, true, 'Sheathed in Steel Spellblade survives with 33 HP!');
  assert.ok(defender.impulse.x > 5.0, 'knockback still applied (Steel does not erase momentum)');
});

test('Scenario 10: Snapshot serialization and practice command handling', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  // Mount via command
  human.position = { x: 7.8, y: 0, z: -14.6 };
  applyRoomCommand(room, human, { type: 'bibyeOperate' }, 1.0);
  assert.equal(ballista.operatorId, human.id);

  // Deploy toggle via command
  applyRoomCommand(room, human, { type: 'bibyeToggleDeploy' }, 1.1);
  assert.equal(ballista.mode, BI_BYE_MODES.DEPLOYING);

  // Check snapshot serialization
  const snap = serializeSnapshot(room, 1.2);
  assert.ok(snap.bibyeBallista);
  assert.equal(snap.bibyeBallista.health, 400);
  assert.equal(snap.bibyeBallista.mode, BI_BYE_MODES.DEPLOYING);
  assert.ok(snap.bibyeBallista.deployProgress > 0);
  assert.equal(snap.bibyeBallista.mainBoltLoaded, true);
});

test('Scenario 11: Vehicle Input Protocol & Ackermann Steering Kinematics', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  human.position = { x: 7.8, y: 0, z: -14.6 };
  mountBiByeLlista(ballista, human);

  const initialHeading = ballista.heading;
  const initialX = ballista.x;
  const initialZ = ballista.z;
  const dt = 1 / 30;

  // 1. Motionless steering: input.right = 1, forward = 0
  // Authored kinematics: vehicle ONLY steers while moving!
  human.input = { forward: 0, right: 1 };
  for (let i = 0; i < 30; i++) {
    stepBiByeLlista(room, ballista, dt, 1.0 + i * dt, room.world);
  }
  assert.equal(ballista.heading, initialHeading, 'motionless machine has zero steering angular velocity');
  assert.equal(ballista.x, initialX, 'motionless machine does not translate');

  // 2. Forward driving: input.forward = 1, right = 0
  human.input = { forward: 1, right: 0 };
  for (let i = 0; i < 30; i++) {
    stepBiByeLlista(room, ballista, dt, 2.0 + i * dt, room.world);
  }
  assert.ok(ballista.x > initialX + 2.5, 'forward driving moves along heading (+X)');
  assert.equal(ballista.heading, initialHeading, 'driving straight produces no heading change');

  // 3. Forward driving with right steering: input.forward = 1, right = 1
  const preSteerHeading = ballista.heading;
  human.input = { forward: 1, right: 1 };
  stepBiByeLlista(room, ballista, dt, 3.0, room.world);
  // Turning right in Castleward decreases heading (clockwise)
  assert.ok(ballista.heading < preSteerHeading, 'steering right while moving forward turns clockwise (heading decreases)');

  // Ackermann turning radius validation: R = |v / omega| >= 4.25m
  const speed = BI_BYE_LLISTA_CONFIG.mobility.forwardSpeed; // 3.2 m/s
  const deltaHeading = Math.abs(ballista.heading - preSteerHeading);
  const omega = deltaHeading / dt;
  const turningRadius = speed / omega;
  assert.ok(turningRadius >= 4.24 && turningRadius <= 4.26, `turning radius matches authored R=4.25m: ${turningRadius}`);

  // 4. Reverse driving: input.forward = -1
  const preRevX = ballista.x;
  human.input = { forward: -1, right: 0 };
  for (let i = 0; i < 30; i++) {
    stepBiByeLlista(room, ballista, dt, 4.0 + i * dt, room.world);
  }
  assert.ok(ballista.x < preRevX, 'reverse driving moves opposite heading (-X)');

  // 5. Analog partial deflection: forward = 0.5, right = -0.5
  human.input = { forward: 0.5, right: -0.5 };
  stepBiByeLlista(room, ballista, dt, 5.0, room.world);
  assert.equal(ballista.speed, 0.5 * BI_BYE_LLISTA_CONFIG.mobility.forwardSpeed, 'analog throttle scales speed');
  assert.equal(ballista.steer, -0.5, 'analog steering recorded');

  // 6. Release input and stop
  human.input = { forward: 0, right: 0 };
  stepBiByeLlista(room, ballista, dt, 6.0, room.world);
  assert.equal(ballista.speed, 0, 'releasing input stops carriage');
});

test('Scenario 12: Step-Rate Independent Continuous Swept Collision (30 Hz, 60 Hz, 10 Hz lag spike)', () => {
  for (const framerate of [60, 30, 10]) {
    const { room, human } = makePracticeRoom();
    const ballista = room.biByeLlista;

    human.position = { x: 7.8, y: 0, z: -14.6 };
    mountBiByeLlista(ballista, human);
    toggleBiByeDeploy(ballista, 0);
    stepBiByeLlista(room, ballista, 1.25, 1.25, room.world);

    ballista.yaw = -Math.PI / 2;
    ballista.pitch = 0;

    // Target 1 at x = 13.0, Target 2 at x = 17.0
    const target1 = room.addServerActor({ id: `t1-${framerate}`, name: 'Target 1', actorKind: 'dummy' }, 0);
    target1.position = { x: 13.0, y: 0, z: -14.6 };
    target1.health = 200;
    target1.spawnProtectionUntil = 0;

    const target2 = room.addServerActor({ id: `t2-${framerate}`, name: 'Target 2', actorKind: 'dummy' }, 0);
    target2.position = { x: 17.0, y: 0, z: -14.6 };
    target2.health = 200;
    target2.spawnProtectionUntil = 0;

    let nowSec = 2.0;
    fireBiByeLlista(room, ballista, nowSec);

    const dt = 1 / framerate;
    while (nowSec < 3.2) {
      nowSec += dt;
      stepBiByeLlista(room, ballista, dt, nowSec, room.world);
      stepBiByeProjectiles(room, dt, nowSec, room.world);
    }

    // Both targets must be pierced regardless of framerate (no tunneling!)
    // Target 1: 18 (Shot I direct) + 85 (Shot II 1st pierce) = 103 dmg -> 200 - 103 = 97
    assert.equal(target1.health, 97, `target 1 hit at ${framerate} Hz (no tunneling)`);

    // Target 2: 0 (Shot I detonated on Target 1) + 59 (Shot II 2nd pierce, 85 * 0.70 = 59.5 -> 59) = 59 dmg -> 200 - 59 = 141
    assert.equal(target2.health, 141, `target 2 pierced in spatial order at ${framerate} Hz`);
  }
});

test('Scenario 13: Solid Stone Wall Decisive Termination & Occlusion Behind Wall', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  human.position = { x: 7.8, y: 0, z: -14.6 };
  mountBiByeLlista(ballista, human);
  toggleBiByeDeploy(ballista, 0);
  stepBiByeLlista(room, ballista, 1.25, 1.25, room.world);

  ballista.yaw = -Math.PI / 2;
  ballista.pitch = 0;

  // Target 1 before wall (x = 12.0)
  const targetBefore = room.addServerActor({ id: 'target-before', name: 'Before Wall', actorKind: 'dummy' }, 0);
  targetBefore.position = { x: 12.0, y: 0, z: -14.6 };
  targetBefore.health = 200;
  targetBefore.spawnProtectionUntil = 0;

  // Solid stone wall at x = 14.0
  const worldWithWall = {
    ...room.world,
    solids: [
      ...room.world.solids,
      { id: 'stone-rampart', center: [14.0, 1.0, -14.6], size: [0.8, 4.0, 4.0], material: 'stone' },
    ],
  };

  // Target 2 behind wall (x = 17.0)
  const targetBehind = room.addServerActor({ id: 'target-behind', name: 'Behind Wall', actorKind: 'dummy' }, 0);
  targetBehind.position = { x: 17.0, y: 0, z: -14.6 };
  targetBehind.health = 100;
  targetBehind.spawnProtectionUntil = 0;

  let nowSec = 2.0;
  fireBiByeLlista(room, ballista, nowSec);

  const dt = 1 / 30;
  while (nowSec < 3.2) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec, worldWithWall);
    stepBiByeProjectiles(room, dt, nowSec, worldWithWall);
  }

  // Target before wall took damage
  assert.equal(targetBefore.health, 97, 'target before wall takes direct hits');

  // Target behind wall is completely occluded: 0 direct damage, 0 shockwave damage
  assert.equal(targetBehind.health, 100, 'target behind solid wall receives zero damage');
});

test('Scenario 14: Friendly Fire and Self Damage Exclusions', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  human.position = { x: 7.8, y: 0, z: -14.6 };
  human.team = 'ATTACKERS';
  mountBiByeLlista(ballista, human);
  toggleBiByeDeploy(ballista, 0);
  stepBiByeLlista(room, ballista, 1.25, 1.25, room.world);

  ballista.yaw = -Math.PI / 2;
  ballista.pitch = 0;

  // Add allied teammate right in front of ballista
  const ally = room.addPlayer({ id: 'ally-01', token: 'token-ally', name: 'Ally' }, 0);
  ally.team = 'ATTACKERS';
  ally.position = { x: 12.0, y: 0, z: -14.6 };
  ally.health = 100;
  ally.spawnProtectionUntil = 0;

  let nowSec = 2.0;
  fireBiByeLlista(room, ballista, nowSec);

  const dt = 1 / 30;
  while (nowSec < 3.0) {
    nowSec += dt;
    stepBiByeLlista(room, ballista, dt, nowSec, room.world);
    stepBiByeProjectiles(room, dt, nowSec, room.world);
  }

  assert.equal(ally.health, 100, 'teammate is strictly immune to friendly fire');
  assert.equal(ally.chill, null, 'teammate does not receive chill from friendly fire');
  assert.equal(human.health, 100, 'operator receives no self-damage');
});

test('Scenario 15: Obstacle-Aware Safe Dismounting', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  human.position = { x: 7.8, y: 0, z: -14.6 };
  mountBiByeLlista(ballista, human);

  // Add world solid blocking left side of ballista (facing East -pi/2, left is North z = -12.4)
  const worldWithObstacle = {
    ...room.world,
    solids: [
      ...room.world.solids,
      { id: 'left-barrier', center: [9.0, 1.0, -12.4], size: [2.0, 2.0, 2.0], material: 'stone' },
    ],
  };

  dismountBiByeLlista(ballista, human, true, worldWithObstacle);
  assert.equal(ballista.operatorId, null);
  assert.equal(human.operatingBallistaId, null);

  // Verify human did NOT dismount inside left-barrier
  const distToBarrier = Math.hypot(human.position.x - 9.0, human.position.z - (-12.4));
  assert.ok(distToBarrier > 1.5, 'dismount selected non-obstructed location');
});
