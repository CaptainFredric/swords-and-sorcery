import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { stepBotControllers } from '../../shared/sim/BotController.mjs';
import { stepRoom } from '../../shared/sim/combat.mjs';
import { WORLD_IDS } from '../../shared/worlds/registry.mjs';
import { TEAMS } from '../../shared/src/teams.mjs';
import { projectToScreen } from '../../client/ui/screenProjection.mjs';

test('Attacker bot inside capture ring anchors position and does not chase distant bait outside ring', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH);
  const attBot = room.addServerActor({ id: 'bot-att-1', actorKind: 'bot', team: TEAMS.ATTACKERS }, 0);
  const defOutside = room.addPlayer({ id: 'def-out', token: 't1', name: 'DefenderBait', team: TEAMS.DEFENDERS }, 0);
  room.startMatch(0);

  // Objective 0 (The Outer Gate) is at (0, 0, -2) with radius 6.0
  attBot.position = { x: 0, y: 0, z: -2 }; // inside objective
  defOutside.position = { x: 0, y: 0, z: 8 }; // 10m away, outside the 6.0m capture radius

  room.objectiveState.attackersCount = 1;
  room.objectiveState.defendersCount = 0;
  room.objectiveState.capturing = true;
  room.objectiveState.progress = 0.35;

  stepBotControllers(room, 10.0, room.world);

  assert.equal(attBot.ai.targetId, null, 'capturing attacker bot must not target distant enemy outside ring');
  assert.equal(attBot.input.forward, 0, 'capturing attacker bot stays anchored inside capture circle');
});

test('Attacker bot inside capture ring engages enemy who steps inside the ring', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH);
  const attBot = room.addServerActor({ id: 'bot-att-1', actorKind: 'bot', team: TEAMS.ATTACKERS }, 0);
  const defInRing = room.addPlayer({ id: 'def-in', token: 't1', name: 'DefenderContester', team: TEAMS.DEFENDERS }, 0);
  room.startMatch(0);

  attBot.position = { x: 0, y: 0, z: -2 };
  defInRing.position = { x: 1, y: 0, z: -1 }; // inside the 6.0m ring

  room.objectiveState.attackersCount = 1;
  room.objectiveState.defendersCount = 1;
  room.objectiveState.contested = true;
  room.objectiveState.progress = 0.35;

  stepBotControllers(room, 10.0, room.world);

  assert.equal(attBot.ai.targetId, defInRing.id, 'attacker bot in ring engages enemy contesting the ring');
});

test('Attacker bot at edge of capture ring halts forward motion rather than walking out of ring', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH);
  const attBot = room.addServerActor({ id: 'bot-att-1', actorKind: 'bot', team: TEAMS.ATTACKERS }, 0);
  const defNearEdge = room.addPlayer({ id: 'def-edge', token: 't1', name: 'DefenderEdge', team: TEAMS.DEFENDERS }, 0);
  room.startMatch(0);

  // Objective radius is 6.0 at (0, 0, -2) -> ring extends to z = +4
  attBot.position = { x: 0, y: 0, z: 3.5 }; // near outer rim (myDist = 5.5 < 6.0)
  defNearEdge.position = { x: 0, y: 0, z: 4.8 }; // just outside outer rim (targetDist = 6.8 > 6.0)

  room.objectiveState.attackersCount = 1;
  room.objectiveState.defendersCount = 0;
  room.objectiveState.capturing = true;

  stepBotControllers(room, 10.0, room.world);

  assert.equal(attBot.ai.targetId, defNearEdge.id, 'targets foe in melee reach');
  assert.ok(attBot.input.forward <= 0, 'attacker bot does not surge forward out of the capture zone');
  assert.equal(attBot.input.sprint, false, 'attacker bot does not sprint out of the capture zone');
});

test('Defender bot outside ring ignores distant non-objective fights to rush into ring when attackers capture', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BLACKBELL_FOUNDRY);
  const defBot = room.addServerActor({ id: 'bot-def-1', actorKind: 'bot', team: TEAMS.DEFENDERS }, 0);
  const attInRing = room.addPlayer({ id: 'att-cap', token: 't1', name: 'Capper', team: TEAMS.ATTACKERS }, 0);
  const attBait = room.addPlayer({ id: 'att-bait', token: 't2', name: 'Bait', team: TEAMS.ATTACKERS }, 0);
  room.startMatch(0);

  // Blackbell Foundry Obj 0 (Chain Winch) at (0, 0, -2), radius 6.0
  attInRing.position = { x: 0, y: 0, z: -2 };
  defBot.position = { x: 0, y: 0, z: 12 };
  attBait.position = { x: 12, y: 0, z: 12 }; // side bait near defender

  room.objectiveState.attackersCount = 1;
  room.objectiveState.defendersCount = 0;
  room.objectiveState.capturing = true;
  room.objectiveState.progress = 0.5;

  stepBotControllers(room, 10.0, room.world);

  assert.notEqual(defBot.ai.targetId, attBait.id, 'defender ignores side bait away from objective');
  assert.equal(defBot.ai.targetId, attInRing.id, 'defender targets attacker capturing inside the ring');
  assert.ok(defBot.input.forward > 0.5, 'defender rushes toward objective');
});

test('Breakthrough objective screen projection accurately clamps and computes angle for HUD waypoint', () => {
  const objPos = { x: 0, y: 0, z: -2 };
  // Camera placed at staging camp (z = -30) looking toward positive Z (where objective is at z = -2)
  const camera = {
    position: { x: 0, y: 1.7, z: -30 },
    yaw: Math.PI, // looking forward toward +Z
    pitch: 0,
    fov: 78,
    aspect: 16 / 9,
  };

  const projectedInFront = projectToScreen(objPos, camera);
  assert.ok(projectedInFront, 'projection succeeds');
  assert.ok(projectedInFront.x >= 0.4 && projectedInFront.x <= 0.6, 'centered horizontally');
  assert.ok(projectedInFront.y >= 0.4 && projectedInFront.y <= 0.7, 'in central vertical viewport');
  assert.equal(projectedInFront.clamped, false, 'objective in front of camera is not clamped');

  // Camera looking completely away (0 radians, facing -Z away from objective)
  const cameraLookingAway = {
    position: { x: 0, y: 1.7, z: -30 },
    yaw: 0, // facing south away from objective
    pitch: 0,
    fov: 78,
    aspect: 16 / 9,
  };
  const projectedBehind = projectToScreen(objPos, cameraLookingAway);
  assert.ok(projectedBehind, 'behind projection succeeds');
  assert.equal(projectedBehind.clamped, true, 'objective behind camera is clamped to edge');
  assert.ok(Number.isFinite(projectedBehind.angle), 'rotation angle computed for clamped edge indicator');
});
