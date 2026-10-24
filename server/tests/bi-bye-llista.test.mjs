import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { stepRoom, applyDamage } from '../../shared/sim/combat.mjs';
import {
  createBiByeLlista,
  BI_BYE_LLISTA_CONFIG,
  BI_BYE_STATES,
  BI_BYE_MODES,
  mountBiByeLlista,
  dismountBiByeLlista,
  toggleBiByeDeploy,
  damageBiByeLlista,
  fireBiByeMobile,
  fireBiByeFullVolley as requestFullVolley,
  fireBiByeLlista as requestFire,
  biByeCoupledAim,
  getBiByeMuzzlePosition,
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

// Combat scenarios begin with the upper already aimed and ready to latch.
// Real turning and latch timing have separate mechanism tests.
function fireBiByeFullVolley(room,b,t) {
  if(b.mode!=='DEPLOYED'||b.state!=='LOADED'||!b.mainBoltLoaded||t<b.smallBoltReadyAt)return requestFullVolley(room,b,t);
  b.mainYaw=b.yaw;b.mainPitch=b.pitch;b.weaponFocus='MAIN';
  const target=biByeCoupledAim(b);b.upperYaw=target.yaw;b.upperPitch=target.pitch;
  const accepted=requestFullVolley(room,b,t-.6);
  if(accepted){stepBiByeLlista(room,b,.001,t-.6);stepBiByeLlista(room,b,.001,t);}
  return accepted;
}
function fireBiByeLlista(room,b,t){return b.mode==='DEPLOYED'?fireBiByeFullVolley(room,b,t):requestFire(room,b,t);}

function makePracticeRoom() {
  const manager = new RoomManager();
  const room = manager.createSoloRoom('PRACTICE', 0, 'castleward');
  // These combat fixtures explicitly construct the legacy emplacement.
  room.biByeLlista=createBiByeLlista();
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
  ballista.pitch = -0.08; // Aimed at dummy center of mass

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
  ballista.pitch = -0.13; // Aimed downward across range targets

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
  ballista.pitch = -0.13; // Aimed downward across range targets

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
  ballista.pitch = -0.13; // Aimed downward across range targets

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
  ballista.pitch = -0.13; // Aimed downward across range targets

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
  assert.ok(ballista.mobileShotPendingAt > nowSec, 'small bolt is pending release; recock begins at discharge');

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

  // Recovery timeline verification:
  // Firing began at t=3.0. Argon's recoil impulse and recovery requires 2.200s.
  // The machine MUST remain strictly in SPENT (recovering) throughout [3.65s, 5.20s).
  // It must NOT prematurely transition to RELOADING around 0.9s (t=3.9s).
  while (nowSec < 5.15) {
    nowSec += 1 / 30;
    stepBiByeLlista(room, ballista, 1 / 30, nowSec, room.world);
    assert.equal(ballista.state, BI_BYE_STATES.SPENT, `state must be SPENT during recoil recovery at t=${nowSec.toFixed(2)}s`);
  }

  // At t >= 5.20s (nowSec >= 3.0 + 2.200s), recovery completes and RELOADING begins
  while (nowSec < 5.30) {
    nowSec += 1 / 30;
    stepBiByeLlista(room, ballista, 1 / 30, nowSec, room.world);
  }
  assert.equal(ballista.state, BI_BYE_STATES.RELOADING, 'reloading begins only after 2.20s recovery finishes');
  assert.ok(nowSec - ballista.firedAt >= 2.200, 'elapsed recovery time must be at least 2.200s');

  // Advance 6.0s through mechanical reload
  while (nowSec < 11.4) {
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

  assert.equal(ballista.health, 650);

  // Takes damage from attack
  damageBiByeLlista(room, ballista, 150, 'attacker-01', 'sword', 1.0);
  assert.equal(ballista.health, 500);
  assert.equal(ballista.mode, BI_BYE_MODES.MOBILE);
  assert.equal(ballista.operatorId, human.id);

  // Lethal damage to siege engine
  damageBiByeLlista(room, ballista, 500, 'attacker-01', 'sword', 2.0);
  assert.equal(ballista.health, 0);
  assert.equal(ballista.mode, BI_BYE_MODES.DESTROYED);

  // Operator is safely dismounted and remains alive
  assert.equal(ballista.operatorId, null, 'operator dismounted on vehicle destruction');
  assert.equal(human.operatingBallistaId, null);
  assert.equal(human.alive, true, 'operator is alive');

  // Disabled: cannot move, deploy, or fire
  assert.equal(toggleBiByeDeploy(ballista, 3.0), false, 'cannot deploy destroyed vehicle');
  assert.equal(fireBiByeLlista(room, ballista, 3.0), false, 'cannot fire destroyed vehicle');

  assert.ok(resetPracticePlayer(room, human.id, 4.0));
  assert.equal(ballista.health,0,'Reset Self preserves the wreck');
  assert.deepEqual(applyRoomCommand(room,human,{type:'practiceRebuildBiBye'},4),{});
  assert.equal(room.biByeLlista.health,650);
  assert.equal(room.biByeLlista.mode,BI_BYE_MODES.MOBILE);
});

test('Scenario 9: Sheathe in Steel mitigates ballista volley: Spellblade survives with 33 HP', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  human.position = { x: 7.8, y: 0, z: -14.6 };
  mountBiByeLlista(ballista, human);
  toggleBiByeDeploy(ballista, 0);
  stepBiByeLlista(room, ballista, 1.25, 1.25, room.world);

  ballista.yaw = -Math.PI / 2;
  ballista.pitch = -0.13; // Aimed downward across range targets

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
  assert.equal(snap.bibyeBallista.health, 650);
  assert.equal(snap.bibyeBallista.mode, BI_BYE_MODES.DEPLOYING);
  assert.ok(snap.bibyeBallista.deployProgress > 0);
  assert.equal(snap.bibyeBallista.mainBoltLoaded, true);

  // Destruction via authoritative damage
  damageBiByeLlista(room, ballista, 650, human.id, 'sword', 1.3);
  assert.equal(ballista.mode, BI_BYE_MODES.DESTROYED);
  assert.equal(ballista.health, 0);
  assert.equal(ballista.operatorId, null);
  assert.equal(human.operatingBallistaId, null);
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
    ballista.pitch = -0.13; // Aimed downward across range targets

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
  ballista.pitch = -0.13; // Aimed downward across range targets

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
  ballista.pitch = -0.13; // Aimed downward across range targets

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

test('Scenario 15: Obstacle-Aware Safe Dismounting & Physical/Visual Clearance', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  human.position = { x: 7.8, y: 0, z: -14.6 };
  human.pitch = 0.35; // Aiming upward
  mountBiByeLlista(ballista, human);

  // Default clean safe dismount: places operator behind carriage with clear distance
  dismountBiByeLlista(ballista, human, true, room.world);
  assert.equal(ballista.operatorId, null);
  assert.equal(human.operatingBallistaId, null);
  assert.equal(human.pitch, 0, 'operator pitch reset to level horizon on dismount');

  const distToCenter = Math.hypot(human.position.x - ballista.x, human.position.z - ballista.z);
  assert.ok(distToCenter >= 2.8, `dismount must have physical clearance from ballista center (actual: ${distToCenter.toFixed(2)}m)`);

  // Verify placement behind carriage along heading vector (-pi/2 -> fwd is +X)
  const fwdX = -Math.sin(ballista.heading);
  const fwdZ = -Math.cos(ballista.heading);
  const dotForward = (human.position.x - ballista.x) * fwdX + (human.position.z - ballista.z) * fwdZ;
  assert.ok(dotForward <= -2.5, `dismount must place operator behind the chassis (actual: ${dotForward.toFixed(2)}m)`);

  // Now test with rear path obstructed: add obstacle behind the carriage (x = 6.0, z = -14.6)
  mountBiByeLlista(ballista, human);
  const worldWithRearObstacle = {
    ...room.world,
    solids: [
      ...room.world.solids,
      { id: 'rear-barrier', center: [6.0, 1.0, -14.6], size: [2.0, 2.0, 2.0], material: 'stone' },
    ],
  };

  dismountBiByeLlista(ballista, human, true, worldWithRearObstacle);
  const distToRearBarrier = Math.hypot(human.position.x - 6.0, human.position.z - (-14.6));
  assert.ok(distToRearBarrier > 1.2, 'dismount selected alternative candidate avoiding rear barrier');
  const distWithObstacle = Math.hypot(human.position.x - ballista.x, human.position.z - ballista.z);
  assert.ok(distWithObstacle >= 2.8, 'alternative dismount still maintains physical clearance from ballista');
});

test('Scenario 16: Serialized snapshot schema conforms to BiByeLlistaRenderer contract', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;
  assert.ok(ballista, 'ballista exists in Practice mode');

  human.position = { x: ballista.x, y: ballista.y, z: ballista.z };
  mountBiByeLlista(ballista, human);
  ballista.heading = -Math.PI / 2; // East
  ballista.yaw = -Math.PI / 2 + 0.25; // Swiveled launcher
  ballista.pitch = 0.12;

  const nowSec = 1.5;
  const snapshot = serializeSnapshot(room, nowSec);
  const bl = snapshot.bibyeBallista;

  assert.ok(bl, 'serialized snapshot includes bibyeBallista payload');
  assert.equal(bl.id, ballista.id);

  // Dual schema compatibility: both position object and top-level coordinates
  assert.ok(bl.position && typeof bl.position.x === 'number', 'bl.position.x exists as number');
  assert.ok(typeof bl.position.y === 'number', 'bl.position.y exists as number');
  assert.ok(typeof bl.position.z === 'number', 'bl.position.z exists as number');
  assert.equal(bl.x, bl.position.x);
  assert.equal(bl.y, bl.position.y);
  assert.equal(bl.z, bl.position.z);

  // Separation of carriage heading and launcher aim
  assert.equal(bl.heading, -Math.PI / 2, 'carriage heading preserved');
  assert.equal(bl.yaw, -Math.PI / 2 + 0.25, 'launcher yaw swiveled relative to heading');
  assert.equal(bl.pitch, 0.12, 'launcher pitch preserved');

  // State machine fields
  assert.equal(bl.mode, BI_BYE_MODES.MOBILE);
  assert.equal(bl.state, BI_BYE_STATES.LOADED);
  assert.equal(bl.operatorId, human.id);
  assert.equal(bl.smallBoltReady, true);
  assert.equal(bl.mainBoltLoaded, true);

  // Validate renderer extraction logic never throws
  const extractPos = {
    x: bl.position?.x ?? bl.x,
    y: bl.position?.y ?? bl.y,
    z: bl.position?.z ?? bl.z,
  };
  assert.equal(extractPos.x, ballista.x);
  assert.equal(extractPos.y, ballista.y);
  assert.equal(extractPos.z, ballista.z);
});

test('Scenario 17: Operating player disconnect or removal cleans up operator station immediately', () => {
  const { room, human } = makePracticeRoom();
  const ballista = room.biByeLlista;

  human.position = { x: ballista.x, y: ballista.y, z: ballista.z };
  mountBiByeLlista(ballista, human);
  assert.equal(ballista.operatorId, human.id);
  assert.equal(human.operatingBallistaId, ballista.id);

  // Disconnect operating player
  room.disconnectPlayer(human.id, 2.0);
  assert.equal(ballista.operatorId, null, 'ballista operatorId cleared upon disconnect');
  assert.equal(human.operatingBallistaId, null, 'player operating reference cleared');

  // Re-mount another actor
  const human2 = room.addPlayer({ id: 'human-02', token: 'token-human2', name: 'SecondKnight' }, 2.5);
  human2.position = { x: ballista.x, y: ballista.y, z: ballista.z };
  mountBiByeLlista(ballista, human2);
  assert.equal(ballista.operatorId, human2.id);

  // Remove player completely
  room.removePlayer(human2.id, 3.0);
  assert.equal(ballista.operatorId, null, 'ballista operatorId cleared upon player removal');
});

test('Scenario 18: Unmounted player movement and separation respects ballista chassis solid', () => {
  const { room } = makePracticeRoom();
  const ballista = room.biByeLlista;

  // Add an unmounted runner walking directly into the center of the ballista
  const runner = room.addPlayer({ id: 'runner-01', token: 'token-runner', name: 'Runner' }, 0);
  runner.position = { x: ballista.x - 4.0, y: ballista.y, z: ballista.z };
  runner.spawnProtectionUntil = 0;

  // Step simulation with runner walking eastward (+X) into ballista
  runner.input = { forward: 1, right: 0, yaw: -Math.PI / 2, pitch: 0 };
  const dt = 1 / 30;
  for (let t = 0; t < 60; t++) {
    stepRoom(room, dt, t * dt);
  }

  // Runner must be blocked by carriage bounds and not penetrate into chassis center
  const distToCenter = Math.hypot(runner.position.x - ballista.x, runner.position.z - ballista.z);
  assert.ok(distToCenter >= 1.2, `unmounted player was stopped by ballista solid (dist: ${distToCenter.toFixed(2)}m)`);
});

test('Scenario 19: Exact 3D muzzle positions under articulation and parent-child kinematics', () => {
  const ballista = {
    id: 'ballista-test',
    x: 0,
    y: 0,
    z: 0,
    heading: 0, // facing -Z
    yaw: 0,
    pitch: 0,
    mode: BI_BYE_MODES.DEPLOYED,
  };

  // 1. Neutral Aim (Heading 0, Yaw 0, Pitch 0)
  // small_bolt_muzzle in neutral: [0, 2.945, 0.920] relative to root facing local +Z -> Castleward [0, 2.945, -0.920]
  const smallNeutral = getBiByeMuzzlePosition(ballista, 'conditioning');
  assert.ok(Math.abs(smallNeutral.x - 0) < 1e-4);
  assert.ok(Math.abs(smallNeutral.y - 2.945) < 1e-4);
  assert.ok(Math.abs(smallNeutral.z - (-0.920)) < 1e-4);

  // main_bolt_muzzle in neutral: [0, 1.835, 1.520] relative to root facing local +Z -> Castleward [0, 1.835, -1.520]
  const mainNeutral = getBiByeMuzzlePosition(ballista, 'siege');
  assert.ok(Math.abs(mainNeutral.x - 0) < 1e-4);
  assert.ok(Math.abs(mainNeutral.y - 1.835) < 1e-4);
  assert.ok(Math.abs(mainNeutral.z - (-1.520)) < 1e-4);

  // 2. Heading East (-PI/2)
  ballista.heading = -Math.PI / 2;
  ballista.yaw = -Math.PI / 2;
  const smallEast = getBiByeMuzzlePosition(ballista, 'conditioning');
  assert.ok(Math.abs(smallEast.x - 0.920) < 1e-4);
  assert.ok(Math.abs(smallEast.y - 2.945) < 1e-4);
  assert.ok(Math.abs(smallEast.z - 0) < 1e-4);

  const mainEast = getBiByeMuzzlePosition(ballista, 'siege');
  assert.ok(Math.abs(mainEast.x - 1.520) < 1e-4);
  assert.ok(Math.abs(mainEast.y - 1.835) < 1e-4);
  assert.ok(Math.abs(mainEast.z - 0) < 1e-4);

  // 3. Deployed Mode: Pitch UP +15 deg (0.2618 rad) with Elevation Cradle parent-child articulation
  ballista.heading = 0;
  ballista.yaw = 0.2; // slight traverse
  ballista.pitch = 0.2618;
  const smallPitchUp = getBiByeMuzzlePosition(ballista, 'conditioning');
  const mainPitchUp = getBiByeMuzzlePosition(ballista, 'siege');
  // Legacy selected aim points both launchers; explicit independent world aim is tested in bi-bye-v41.
  assert.ok(smallPitchUp.y > 2.945, 'small muzzle raised with upper elevation');
  assert.ok(mainPitchUp.y > 1.835, 'main muzzle raised with upper elevation');

  // 4. Mobile Mode: Independent Upper Turret Aim
  ballista.mode = BI_BYE_MODES.MOBILE;
  ballista.yaw = 0.4363; // +25 deg traverse
  ballista.pitch = 0.2094; // +12 deg pitch
  const smallMobile = getBiByeMuzzlePosition(ballista, 'conditioning');
  assert.ok(smallMobile.y > 2.945, 'mobile upper turret elevated independently');
  assert.ok(smallMobile.x < 0, 'mobile upper turret yawed into direction');
});
