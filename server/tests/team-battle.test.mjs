import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { stepRoom, beginAttack } from '../../shared/sim/combat.mjs';
import { stepBotControllers } from '../../shared/sim/BotController.mjs';
import { GAME_MODES } from '../../shared/src/modes.mjs';
import { WORLD_IDS } from '../../shared/worlds/registry.mjs';
import { TEAMS, areAllies, areEnemies } from '../../shared/src/teams.mjs';
import { serializeSnapshot } from '../../shared/sim/wire.mjs';

function createTeamRoom(nowSec = 0) {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(nowSec, true, WORLD_IDS.BASTION_BREACH);
  return room;
}

test('1 human + 2 bots vs 3 bots team provisioning and team slot assignment', () => {
  const room = createTeamRoom(0);
  const human = room.addPlayer({ id: 'human-1', token: 'token-1', name: 'Commander' }, 0);
  assert.equal(human.team, TEAMS.ATTACKERS, 'first player assigned to Attackers');

  room.provisionModeActors(0);
  assert.equal(room.players.size, 6, 'total 6 players in 3v3 breakthrough');

  const attackers = [...room.players.values()].filter((p) => p.team === TEAMS.ATTACKERS);
  const defenders = [...room.players.values()].filter((p) => p.team === TEAMS.DEFENDERS);
  assert.equal(attackers.length, 3, '3 Attackers');
  assert.equal(defenders.length, 3, '3 Defenders');

  const humanAttackers = attackers.filter((p) => p.actorKind === 'human');
  const botAttackers = attackers.filter((p) => p.actorKind === 'bot');
  assert.equal(humanAttackers.length, 1, '1 human attacker');
  assert.equal(botAttackers.length, 2, '2 bot attackers');
  assert.equal(defenders.every((p) => p.actorKind === 'bot'), true, 'all 3 defenders are bots');
});

test('bot slot replacement: 2nd human joins active roster and replaces a bot slot without room overflow', () => {
  const room = createTeamRoom(0);
  room.addPlayer({ id: 'human-1', token: 'token-1', name: 'Attacker Leader' }, 0);
  room.provisionModeActors(0);
  assert.equal(room.players.size, 6);

  // A second human joins: should occupy a defender bot slot
  const human2 = room.addPlayer({ id: 'human-2', token: 'token-2', name: 'Defender Leader' }, 0);
  assert.equal(room.players.size, 6, 'roster size remains capped at 6');
  assert.equal(human2.team, TEAMS.DEFENDERS, '2nd human assigned to balance Defenders');

  const defenders = [...room.players.values()].filter((p) => p.team === TEAMS.DEFENDERS);
  const humanDefenders = defenders.filter((p) => p.actorKind === 'human');
  const botDefenders = defenders.filter((p) => p.actorKind === 'bot');
  assert.equal(humanDefenders.length, 1);
  assert.equal(botDefenders.length, 2);
});

test('objective capture mechanics: uncontested capture, contested halt, and phase progression', () => {
  const room = createTeamRoom(0);
  const attacker = room.addPlayer({ id: 'att-1', token: 't1', name: 'Attacker' }, 0);
  const defender = room.addPlayer({ id: 'def-1', token: 't2', name: 'Defender' }, 0);
  room.startMatch(0);

  const obj0 = room.objectiveState.objectives[0];
  assert.equal(room.objectiveState.index, 0);
  assert.equal(obj0.id, 'outer-gate');

  // Place attacker inside objective radius and defender outside
  attacker.position = { x: obj0.position.x, y: obj0.position.y, z: obj0.position.z };
  defender.position = { x: 0, y: 0, z: 30 }; // far outside

  // Step simulation for 5 seconds
  for (let i = 0; i < 150; i++) {
    stepRoom(room, 1 / 30, (i + 1) / 30);
  }

  assert.ok(room.objectiveState.progress > 0.25, `Progress should advance uncontested: ${room.objectiveState.progress}`);
  const capturedProgress = room.objectiveState.progress;

  // Now bring defender into the objective zone: should become contested and halt progress
  defender.position = { x: obj0.position.x + 1, y: obj0.position.y, z: obj0.position.z + 1 };
  for (let i = 0; i < 60; i++) {
    stepRoom(room, 1 / 30, 5 + (i + 1) / 30);
  }

  assert.equal(room.objectiveState.contested, true, 'zone is contested');
  assert.ok(Math.abs(room.objectiveState.progress - capturedProgress) < 0.02, 'progress halted while contested');

  // Remove defender: attacker finishes capture of Objective 0
  defender.position = { x: 0, y: 0, z: 30 };
  for (let i = 0; i < 350; i++) {
    stepRoom(room, 1 / 30, 7 + (i + 1) / 30);
  }

  // Objective should advance to Phase 1 (High Sanctum)
  assert.equal(room.objectiveState.index, 1, 'advanced to phase 1');
  const obj1 = room.objectiveState.objectives[1];
  assert.equal(obj1.id, 'high-sanctum');
  assert.equal(room.objectiveState.phase, 1);

  // Attacker spawns should now select forward spawn points (phase 1)
  const spawnCandidate = room.initialSpawnFor(attacker, 0);
  assert.equal(spawnCandidate.phase, 1, 'attacker receives forward spawn in Phase 1');
});

test('defender victory on match timeout', () => {
  const room = createTeamRoom(0);
  room.addPlayer({ id: 'att-1', token: 't1', name: 'Attacker' }, 0);
  room.addPlayer({ id: 'def-1', token: 't2', name: 'Defender' }, 0);
  room.startMatch(0);

  // Time reaches policy.matchSeconds (300s) without attackers capturing all objectives
  stepRoom(room, 1 / 30, 301);
  assert.equal(room.state, 'FINISHED', 'match finished on timer expiration');
  assert.equal(room.winnerTeam, TEAMS.DEFENDERS, 'defenders win when match timer runs out');
});

test('attacker victory on capturing final objective', () => {
  const room = createTeamRoom(0);
  const attacker = room.addPlayer({ id: 'att-1', token: 't1', name: 'Attacker' }, 0);
  room.startMatch(0);

  // Instantly progress to final objective
  room.objectiveState.index = 1;
  room.objectiveState.phase = 1;
  const finalObj = room.objectiveState.objectives[1];
  attacker.position = { x: finalObj.position.x, y: finalObj.position.y, z: finalObj.position.z };

  // Step until final capture completes
  for (let i = 0; i < 700; i++) {
    stepRoom(room, 1 / 30, (i + 1) / 30);
    if (room.state === 'FINISHED') break;
  }

  assert.equal(room.state, 'FINISHED', 'match finished on final capture');
  assert.equal(room.winnerTeam, TEAMS.ATTACKERS, 'attackers win on full capture');
});

test('friendly fire off: sword sweep does not damage or stagger allies', () => {
  const room = createTeamRoom(0);
  const att1 = room.addPlayer({ id: 'att-1', token: 't1', name: 'Attacker 1', team: TEAMS.ATTACKERS }, 0);
  const att2 = room.addPlayer({ id: 'att-2', token: 't2', name: 'Attacker 2', team: TEAMS.ATTACKERS }, 0);
  const def1 = room.addPlayer({ id: 'def-1', token: 't3', name: 'Defender 1', team: TEAMS.DEFENDERS }, 0);
  room.startMatch(0);

  att1.spawnProtectionUntil = 0;
  att2.spawnProtectionUntil = 0;
  def1.spawnProtectionUntil = 0;

  assert.equal(areAllies(room, att1, att2), true);
  assert.equal(areEnemies(room, att1, def1), true);

  // Place att1 facing +x where att2 (ally) is placed at x=2
  att1.position = { x: 0, y: 0, z: 0 };
  att1.yaw = -Math.PI / 2;
  att1.input.yaw = att1.yaw;
  att2.position = { x: 2, y: 0, z: 0 };
  att2.yaw = Math.PI / 2;
  att2.health = 100;
  att2.guardStamina = 100;

  // Swing at ally (step at 10.40, when strike lands)
  beginAttack(room, 'att-1', 10.0);
  stepRoom(room, 0.01, 10.40);

  assert.equal(att2.health, 100, 'ally took no damage from sword sweep');
  assert.equal(att2.guardStamina, 100, 'ally stamina not drained');

  // Reset attack state and place enemy in front of att1
  att1.attackActive = false;
  att1.attackHeld = false;
  att1.attackRestartAt = -Infinity;
  att1.history = [];
  def1.position = { x: 2, y: 0, z: 0 };
  def1.yaw = Math.PI / 2;
  def1.input.yaw = def1.yaw;
  def1.health = 100;
  def1.history = [];

  beginAttack(room, 'att-1', 11.0);
  stepRoom(room, 0.01, 11.40);

  assert.ok(def1.health < 100, `enemy should take damage: ${def1.health}`);
});

test('bot AI targets enemies exclusively in team mode and supports allies', () => {
  const room = createTeamRoom(0);
  const botAlly = room.addServerActor({ id: 'bot-att-1', actorKind: 'bot', team: TEAMS.ATTACKERS }, 0);
  const humanAttacker = room.addPlayer({ id: 'human-att', token: 't2', name: 'Human Attacker', team: TEAMS.ATTACKERS }, 0);
  const botEnemy = room.addServerActor({ id: 'bot-def-1', actorKind: 'bot', team: TEAMS.DEFENDERS }, 0);
  room.startMatch(0);

  assert.equal(botAlly.team, TEAMS.ATTACKERS);
  assert.equal(humanAttacker.team, TEAMS.ATTACKERS);
  assert.equal(botEnemy.team, TEAMS.DEFENDERS);

  // Position ally close to human and enemy a bit further
  botAlly.position = { x: 0, y: 0, z: -2 };
  humanAttacker.position = { x: 1, y: 0, z: -2 };
  botEnemy.position = { x: 0, y: 0, z: 2 };

  stepBotControllers(room, 10.0, room.world);

  assert.ok(botAlly.ai, 'bot AI initialized');
  assert.equal(botAlly.ai.targetId, botEnemy.id, 'bot chooses enemy over adjacent ally');
});

test('wire serialization includes team and objective state in snapshot', () => {
  const room = createTeamRoom(0);
  const att = room.addPlayer({ id: 'att-1', token: 't1', name: 'Attacker' }, 0);
  room.startMatch(0);

  const snapshot = serializeSnapshot(room, 0);
  assert.equal(snapshot.mode, GAME_MODES.BREAKTHROUGH);
  assert.ok(snapshot.objective, 'objective state serialized');
  assert.equal(snapshot.objective.name, 'The Outer Gate');
  assert.equal(snapshot.objective.index, 0);

  const p = snapshot.players.find((pl) => pl.id === att.id);
  assert.equal(p.team, TEAMS.ATTACKERS, 'player team serialized');
});

test('friendly fire off: projectiles pass through allies and only hit enemies', async () => {
  const { stepRoom } = await import('../../shared/sim/combat.mjs');
  const room = createTeamRoom(0);
  const att1 = room.addPlayer({ id: 'att-1', token: 't1', name: 'Caster', team: TEAMS.ATTACKERS }, 0);
  const att2 = room.addPlayer({ id: 'att-2', token: 't2', name: 'Ally in front', team: TEAMS.ATTACKERS }, 0);
  const def1 = room.addPlayer({ id: 'def-1', token: 't3', name: 'Target Enemy', team: TEAMS.DEFENDERS }, 0);
  room.startMatch(0);

  att1.spawnProtectionUntil = 0;
  att2.spawnProtectionUntil = 0;
  def1.spawnProtectionUntil = 0;

  // att1 at z=0, ally att2 at z=-2 (directly in flight line), enemy def1 at z=-6
  att1.position = { x: 0, y: 0, z: 0 };
  att2.position = { x: 0, y: 0, z: -2 };
  def1.position = { x: 0, y: 0, z: -6 };

  // Directly insert a fireball projectile from att1 heading toward -z
  room.projectiles.set('test-fireball', {
    id: 'test-fireball',
    ownerId: att1.id,
    spell: 'fireball',
    position: { x: 0, y: 1.2, z: -0.5 },
    velocity: { x: 0, y: 0, z: -25 },
    bornAt: 10.0,
  });
  assert.equal(room.projectiles.size, 1);

  // Step projectile simulation past ally toward enemy
  for (let i = 0; i < 20; i++) {
    stepRoom(room, 1 / 30, 10.0 + (i + 1) / 30);
  }

  assert.equal(att2.health, 100, 'ally in projectile trajectory remains unharmed');
  assert.ok(def1.health < 100, `enemy behind ally took projectile blast damage: ${def1.health}`);
});

test('bot disengages from distant chase when objective is under threat', () => {
  const room = createTeamRoom(0);
  const defBot = room.addServerActor({ id: 'def-bot', actorKind: 'bot', team: TEAMS.DEFENDERS }, 0);
  const fleeingAttacker = room.addPlayer({ id: 'fleeing-att', token: 't2', name: 'Fleeing', team: TEAMS.ATTACKERS }, 0);
  const capturingAttacker = room.addPlayer({ id: 'capping-att', token: 't3', name: 'Capper', team: TEAMS.ATTACKERS }, 0);
  room.startMatch(0);

  const obj = room.objectiveState.objectives[0];

  // Distant attacker is far away in the western flank
  fleeingAttacker.position = { x: -14, y: 0, z: -25 };
  // Capturing attacker is right on the objective
  capturingAttacker.position = { x: obj.position.x, y: obj.position.y, z: obj.position.z };

  // Place defender bot halfway toward the fleeing enemy
  defBot.position = { x: -12, y: 0, z: -18 };
  defBot.ai = { targetId: fleeingAttacker.id, nextThinkAt: 0, path: null };

  // Simulate objective progress being threatened by capturing attacker
  room.objectiveState.attackersCount = 1;
  room.objectiveState.progress = 0.35;

  stepBotControllers(room, 10.0, room.world);

  // Bot should prioritize defending the objective or retargeting the immediate threat at the objective
  assert.notEqual(defBot.ai.targetId, fleeingAttacker.id, 'bot disengaged from distant fleeing attacker');
});
