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
