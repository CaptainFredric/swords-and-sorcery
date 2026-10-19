import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { stepRoom } from '../../shared/sim/combat.mjs';
import { stepBotControllers } from '../../shared/sim/BotController.mjs';
import { serializeSnapshot } from '../../shared/sim/wire.mjs';
import { GAME_MODES } from '../../shared/src/modes.mjs';
import { WORLD_IDS } from '../../shared/worlds/registry.mjs';
import { TEAMS } from '../../shared/src/teams.mjs';
import { breakthroughHudView, matchInfoText } from '../../client/ui/HUD.mjs';

test('Breakthrough overtime: enters overtime when match clock expires with active capture pressure', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH);
  const att = room.addPlayer({ id: 'att-1', token: 't1', name: 'Attacker 1', team: TEAMS.ATTACKERS }, 0);
  const def = room.addPlayer({ id: 'def-1', token: 't2', name: 'Defender 1', team: TEAMS.DEFENDERS }, 0);
  room.startMatch(0);

  // Position attacker inside Outer Gate objective ring
  att.position = { x: 0, y: 0, z: -2 };
  def.position = { x: 0, y: 0, z: 14 }; // Defender outside ring

  // Step room right up to expiration (299.9s)
  stepRoom(room, 0.1, 299.9);
  assert.equal(room.state, 'PLAYING');
  assert.equal(room.overtime, false);

  // Clock expires at 300.0s while attacker is in the zone
  stepRoom(room, 0.1, 300.0);
  assert.equal(room.state, 'PLAYING');
  assert.equal(room.overtime, true, 'entered overtime because attacker is on point at clock expiry');
  assert.equal(room.objectiveState.overtime, true);
  assert.equal(room.events.some((e) => e.type === 'overtimeStarted'), true);

  // HUD view in overtime reflects overtime clock and state
  const snap = serializeSnapshot(room, 300.0);
  assert.equal(snap.overtime, true);
  assert.equal(snap.objective.overtime, true);

  const hudAtt = breakthroughHudView(att, snap, 300.0);
  assert.equal(hudAtt.clock, 'OVERTIME');
  assert.equal(hudAtt.stateKey, 'overtime');
  assert.match(hudAtt.stateLabel, /OVERTIME/);

  const infoText = matchInfoText(snap, 300.0);
  assert.match(infoText, /OVERTIME/);
});

test('Breakthrough overtime: bounded grace period ends match if defenders clear attackers for 3 continuous seconds', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH);
  const att = room.addPlayer({ id: 'att-1', token: 't1', name: 'Attacker 1', team: TEAMS.ATTACKERS }, 0);
  const def = room.addPlayer({ id: 'def-1', token: 't2', name: 'Defender 1', team: TEAMS.DEFENDERS }, 0);
  room.startMatch(0);

  att.position = { x: 0, y: 0, z: -2 };
  def.position = { x: 0, y: 0, z: 14 };

  // Trigger overtime at 300.0s
  stepRoom(room, 0.1, 300.0);
  assert.equal(room.overtime, true);

  // Attacker is driven off the point at 301.0s
  att.position = { x: 0, y: 0, z: -15 };
  stepRoom(room, 0.1, 301.0);
  assert.equal(room.objectiveState.attackersCount, 0);
  assert.equal(room.overtime, true);

  // 2.0 seconds later (303.0s), still within 3.0s grace window
  stepRoom(room, 0.1, 303.0);
  assert.equal(room.state, 'PLAYING', 'still playing within 3s grace window');

  // 3.1 seconds after clear (304.1s), overtime grace expires and defenders win
  stepRoom(room, 0.1, 304.1);
  assert.equal(room.state, 'FINISHED');
  assert.equal(room.winnerTeam, TEAMS.DEFENDERS);
  assert.equal(room.finishReason, 'defense');
});

test('Breakthrough overtime: attacker re-entry resets clear timer and keeps overtime alive', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH);
  const att = room.addPlayer({ id: 'att-1', token: 't1', name: 'Attacker 1', team: TEAMS.ATTACKERS }, 0);
  const def = room.addPlayer({ id: 'def-1', token: 't2', name: 'Defender 1', team: TEAMS.DEFENDERS }, 0);
  room.startMatch(0);

  att.position = { x: 0, y: 0, z: -2 };
  def.position = { x: 0, y: 0, z: 14 };

  stepRoom(room, 0.1, 300.0);
  assert.equal(room.overtime, true);

  // Driven off at 301.0s
  att.position = { x: 0, y: 0, z: -15 };
  stepRoom(room, 0.1, 301.0);

  // Re-enters at 302.5s (before 3.0s grace expires)
  att.position = { x: 0, y: 0, z: -2 };
  stepRoom(room, 0.1, 302.5);
  assert.equal(room.objectiveState.attackersCount, 1);
  assert.equal(room.overtimeClearedAt, null, 'grace timer reset upon re-entry');

  // Clock reaches 305.0s (past the old deadline), but match is still alive
  stepRoom(room, 0.1, 305.0);
  assert.equal(room.state, 'PLAYING', 'overtime remains active with attacker contesting');
  assert.equal(room.overtime, true);
});

test('Breakthrough two-stage assault: Outer Gate capture awards stage bonus time and advances to High Sanctum', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH);
  const att = room.addPlayer({ id: 'att-1', token: 't1', name: 'Attacker 1', team: TEAMS.ATTACKERS }, 0);
  room.addPlayer({ id: 'def-1', token: 't2', name: 'Defender 1', team: TEAMS.DEFENDERS }, 0);
  room.startMatch(0);

  att.position = { x: 0, y: 0, z: -2 }; // inside Outer Gate
  room.events.length = 0;

  // Simulate capture completion at t=200s (with 100s remaining on 300s clock)
  room.objectiveState.progress = 0.99;
  stepRoom(room, 0.2, 200.0);

  assert.equal(room.objectiveState.index, 1, 'advanced to Stage 2');
  assert.equal(room.objectiveState.objectives[1].id, 'high-sanctum');

  const advanceEv = room.events.find((e) => e.type === 'objectiveAdvanced');
  assert.ok(advanceEv);
  assert.equal(advanceEv.nextObjectiveId, 'high-sanctum');
  assert.equal(advanceEv.stageBonusSec, 150);

  // Total match time was extended so remaining time is at least 150 seconds
  const remainingTime = (room.matchStartedAt + room.policy.matchSeconds) - 200.0;
  assert.ok(remainingTime >= 150, `remaining time ${remainingTime}s should be at least 150s`);
});

test('Breakthrough two-stage assault: Outer Gate capture in overtime clears overtime and grants Stage 2 bonus time', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH);
  const att = room.addPlayer({ id: 'att-1', token: 't1', name: 'Attacker 1', team: TEAMS.ATTACKERS }, 0);
  room.addPlayer({ id: 'def-1', token: 't2', name: 'Defender 1', team: TEAMS.DEFENDERS }, 0);
  room.startMatch(0);

  att.position = { x: 0, y: 0, z: -2 };
  stepRoom(room, 0.1, 300.0);
  assert.equal(room.overtime, true, 'in overtime');

  // Complete capture during overtime at t=310.0s
  room.objectiveState.progress = 0.99;
  stepRoom(room, 0.2, 310.0);

  assert.equal(room.objectiveState.index, 1, 'advanced to High Sanctum');
  assert.equal(room.overtime, false, 'overtime cleared upon successful stage capture');
  assert.equal(room.objectiveState.overtime, false);

  const remaining = (room.matchStartedAt + room.policy.matchSeconds) - 310.0;
  assert.ok(remaining >= 150, `bonus stage time granted: ${remaining}s`);
  assert.equal(room.state, 'PLAYING');
});

test('Tactical bot lanes: Attacker bots distribute across West Flank, Center, and East lanes on opening approach', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH);
  room.addPlayer({ id: 'human-host', token: 't1', name: 'Commander', team: TEAMS.ATTACKERS }, 0);
  room.provisionModeActors(0);
  room.startMatch(0);

  const attackers = [...room.players.values()].filter((p) => p.team === TEAMS.ATTACKERS && p.actorKind === 'bot');
  assert.ok(attackers.length >= 2, 'at least 2 attacker bots provisioned');

  // Verify attacker bots have distinct rival indices (e.g. 1 and 2)
  const flanker = attackers.find((p) => p.rivalIndex === 1);
  const skirmisher = attackers.find((p) => p.rivalIndex === 2);
  assert.ok(flanker, 'has flanker bot (rivalIndex 1)');
  assert.ok(skirmisher, 'has skirmisher bot (rivalIndex 2)');

  // Step bot decision while in staging approach (z < -4)
  stepBotControllers(room, 1.0, room.world);

  // Flanker routes west toward flank alley (x < -8)
  assert.ok(flanker.input.yaw !== undefined);
  // Bots shouldn't all have identical yaw angles
  assert.notEqual(flanker.input.yaw, skirmisher.input.yaw, 'flanker and skirmisher take different headings');
});

test('Defender retreat: Defender bots in outer courtyard fall back to High Sanctum upon Outer Gate breach', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH);
  const defBot = room.addServerActor({ id: 'bot-def-1', actorKind: 'bot', team: TEAMS.DEFENDERS, rivalIndex: 0 }, 0);
  room.addPlayer({ id: 'att-1', token: 't1', name: 'Attacker', team: TEAMS.ATTACKERS }, 0);
  room.startMatch(0);

  // Outer Gate breached: transition to Phase 1 (High Sanctum)
  room.objectiveState.index = 1;
  room.objectiveState.phase = 1;

  // Defender is still at old gate (z = 4)
  defBot.position = { x: 0, y: 0, z: 4 };

  stepBotControllers(room, 10.0, room.world);

  // Defender aims northward toward the High Sanctum (z = 25, facing +Z is Math.PI)
  const dy = defBot.input.yaw;
  assert.ok(Math.abs(Math.abs(dy) - Math.PI) < 0.6, `retreating defender should aim toward Sanctum, got yaw=${dy}`);
  assert.ok(defBot.input.forward > 0.8, 'retreating defender moves forward toward Sanctum');
});

test('Blackbell Foundry Breakthrough: Chain Winch capture advances to The Great Bell with time bonus', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BLACKBELL_FOUNDRY);
  const att = room.addPlayer({ id: 'att-1', token: 't1', name: 'Attacker 1', team: TEAMS.ATTACKERS }, 0);
  const def = room.addPlayer({ id: 'def-1', token: 't2', name: 'Defender 1', team: TEAMS.DEFENDERS }, 0);
  room.startMatch(0);

  assert.equal(room.objectiveState.index, 0);
  assert.equal(room.objectiveState.objectives[0].name, 'The Chain Winch');
  assert.equal(room.objectiveState.objectives[1].name, 'The Great Bell');

  // Attacker captures Chain Winch
  att.position = { x: 0, y: 0, z: -2 };
  def.position = { x: 0, y: 0, z: 20 };
  room.objectiveState.progress = 0.99;
  stepRoom(room, 0.2, 20.0);

  assert.equal(room.objectiveState.index, 1, 'advanced to Stage 2: The Great Bell');
  const advanceEv = room.events.find((e) => e.type === 'objectiveAdvanced');
  assert.ok(advanceEv);
  assert.equal(advanceEv.nextObjectiveId, 'blackbell');
  assert.equal(advanceEv.stageBonusSec, 150);

  const snap = serializeSnapshot(room, 20.0);
  assert.equal(snap.objective.name, 'The Great Bell');
  assert.equal(snap.objective.index, 1);
  const hud = breakthroughHudView(att, snap, 20.0);
  assert.equal(hud.phaseLabel, 'OBJECTIVE 2 OF 2');
});

test('Bastion Breach Breakthrough: authoritative capture respects vertical bounds', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH);
  const att = room.addPlayer({ id: 'att-1', token: 't1', name: 'Attacker 1', team: TEAMS.ATTACKERS }, 0);
  const def = room.addPlayer({ id: 'def-1', token: 't2', name: 'Defender 1', team: TEAMS.DEFENDERS }, 0);
  room.startMatch(0);

  // 1. Stage 1 (The Outer Gate at x: 0, y: 0, z: -2)
  // Ground player captures
  att.position = { x: 0, y: 0, z: -2 };
  def.position = { x: 0, y: 0, z: 20 };
  stepRoom(room, 1.0, 1.0);
  assert(room.objectiveState.progress > 0, 'Ground player captures Outer Gate');

  // Jumping player within vertical tolerance (y = 1.25) captures
  room.objectiveState.progress = 0;
  att.position = { x: 0, y: 1.25, z: -2 };
  stepRoom(room, 1.0, 2.0);
  assert(room.objectiveState.progress > 0, 'Jumping player captures Outer Gate');

  // Player on elevated East Gallery ramparts (y = 2.5, dy = 2.5 > 1.8) does NOT capture
  room.objectiveState.progress = 0;
  att.position = { x: 0, y: 2.5, z: -2 };
  stepRoom(room, 1.0, 3.0);
  assert.equal(room.objectiveState.progress, 0, 'Player on high gallery must NOT capture ground objective');
  assert.equal(room.objectiveState.attackersCount, 0);

  // 2. Stage 2 (The High Sanctum at x: 0, y: 0.3, z: 25, radius: 5.5)
  room.objectiveState.index = 1;
  room.objectiveState.phase = 1;
  room.objectiveState.progress = 0;
  def.position = { x: 0, y: 0, z: 35 }; // Defender outside 5.5m radius (dist = 10m)

  // Player on the raised dais at y = 0.3 captures
  att.position = { x: 0, y: 0.3, z: 25 };
  stepRoom(room, 1.0, 4.0);
  assert(room.objectiveState.progress > 0, 'Player on Sanctum dais captures High Sanctum');

  // Player jumping on dais (y = 1.5, dy = 1.2 <= 1.8) captures
  room.objectiveState.progress = 0;
  att.position = { x: 0, y: 1.5, z: 25 };
  stepRoom(room, 1.0, 5.0);
  assert(room.objectiveState.progress > 0, 'Jumping player on dais captures');

  // Player far below in abyss (y = -3.0) does NOT capture
  room.objectiveState.progress = 0;
  att.position = { x: 0, y: -3.0, z: 25 };
  stepRoom(room, 1.0, 6.0);
  assert.equal(room.objectiveState.progress, 0, 'Player far below dais must not capture');
});

test('Bastion Breach Breakthrough: server-authoritative gate blocker blocks during Stage 1 and opens on Stage 2 transition', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH);
  const att = room.addPlayer({ id: 'att-1', token: 't1', name: 'Attacker 1', team: TEAMS.ATTACKERS }, 0);
  const def = room.addPlayer({ id: 'def-1', token: 't2', name: 'Defender 1', team: TEAMS.DEFENDERS }, 0);
  room.startMatch(0);

  // Initial state: Stage 1 active, room.world has blocker
  assert.equal(room.objectiveState.index, 0);
  assert.equal(room.world.solids.some((s) => s.id === 'gatehouse-honorable-gate-closed'), true);

  // Defenders spawned in Outer Courtyard, not behind closed gate
  assert(def.position.z < 8.5, `Defender initial spawn at z=${def.position.z} must be in courtyard south of gate`);

  // Attacker tries to walk through gate at z = 8.0 towards +z (yaw: Math.PI)
  att.position = { x: 0, y: 0, z: 8.0 };
  att.input = { forward: 1, right: 0, jump: false, crouch: false, yaw: Math.PI, pitch: 0 };
  for (let t = 0; t < 10; t++) {
    stepRoom(room, 0.05, 1.0 + t * 0.05);
  }
  // Stopped at closed gate
  assert(att.position.z < 8.2, `Attacker must be blocked at closed gate; stopped at z=${att.position.z}`);

  // Now capture Objective 1 (The Outer Gate)
  att.position = { x: 0, y: 0, z: -2 };
  att.input = { forward: 0, right: 0, jump: false, crouch: false, yaw: 0, pitch: 0 };
  def.position = { x: 0, y: 0, z: 30 }; // Defender far away
  def.input = { forward: 0, right: 0, jump: false, crouch: false, yaw: 0, pitch: 0 };
  // Complete the 15s capture
  for (let t = 0; t < 16; t++) {
    stepRoom(room, 1.0, 2.0 + t);
  }

  // Objective advanced to Stage 2 (The High Sanctum, index 1)
  assert.equal(room.objectiveState.index, 1);
  const capturedAt = room.objectiveState.lastCapturedAt;
  assert.ok(Number.isFinite(capturedAt));

  // 1. Mid-ceremony check: 0.5s after capture, gate is still opening (~1.2s ceremony)
  // Collision blocker MUST remain active so players/weapons cannot penetrate visibly closing/opening door
  stepRoom(room, 0.5, capturedAt + 0.5);
  assert.equal(
    room.world.solids.some((s) => s.id === 'gatehouse-honorable-gate-closed'),
    true,
    'Blocker must remain active during 1.2s opening ceremony'
  );

  // Attacker cannot push through during opening ceremony
  att.position = { x: 0, y: 0, z: 8.0 };
  att.input = { forward: 1, right: 0, jump: false, crouch: false, yaw: Math.PI, pitch: 0 };
  for (let t = 0; t < 5; t++) {
    stepRoom(room, 0.05, capturedAt + 0.5 + t * 0.05);
  }
  assert(att.position.z < 8.2, `Attacker must be stopped by opening gate; at z=${att.position.z}`);

  // 2. Opening ceremony complete: after 1.2s, gate is fully open and blocker is authoritatively removed
  stepRoom(room, 0.5, capturedAt + 1.3);
  assert.equal(
    room.world.solids.some((s) => s.id === 'gatehouse-honorable-gate-closed'),
    false,
    'Blocker must be removed once 1.2s opening duration elapses'
  );

  // Now attacker moves smoothly through open gatehouse into High Sanctum
  att.position = { x: 0, y: 0, z: 8.0 };
  att.input = { forward: 1, right: 0, jump: false, crouch: false, yaw: Math.PI, pitch: 0 };
  for (let t = 0; t < 10; t++) {
    stepRoom(room, 0.05, capturedAt + 1.4 + t * 0.05);
  }
  assert(att.position.z > 9.5, `Attacker must traverse open gate into Sanctum; reached z=${att.position.z}`);
});




