import test from 'node:test';
import assert from 'node:assert/strict';
import { surfaceHeightAt } from './collision.mjs';
import { BLACKBELL_FOUNDRY, FOUNDRY_GANTRY_Y, FOUNDRY_TRENCH_Y, FOUNDRY_DAIS_Y } from '../worlds/blackbellFoundry.mjs';
import { Room } from '../sim/Room.mjs';
import { GAME_MODES } from './modes.mjs';
import { TEAMS } from './teams.mjs';
import { stepBotControllers } from '../sim/BotController.mjs';
import { stepObjectives } from '../sim/objectives.mjs';


test('Blackbell Foundry conforms to world definition standards', () => {
  assert.equal(BLACKBELL_FOUNDRY.id, 'blackbell-foundry');
  assert.equal(BLACKBELL_FOUNDRY.name, 'Blackbell Foundry');
  assert.equal(BLACKBELL_FOUNDRY.objectives.length, 2);
  assert.equal(BLACKBELL_FOUNDRY.objectives[0].id, 'chain-winch');
  assert.equal(BLACKBELL_FOUNDRY.objectives[1].id, 'blackbell');
  assert(BLACKBELL_FOUNDRY.spawnPoints.length >= 10);
  assert(BLACKBELL_FOUNDRY.solids.length > 10);
  assert(BLACKBELL_FOUNDRY.navigation.nodes.length > 10);
});

test('Blackbell Foundry distinct 3-lane route heights and traversability', () => {
  // Route 1: Central industrial yard is at ground level y = 0
  for (const z of [-20, -10, 0]) {
    for (const x of [-4, 0, 4]) {
      const h = surfaceHeightAt(x, z, 0.2, BLACKBELL_FOUNDRY);
      assert.equal(h, 0, `central yard missing floor at x=${x}, z=${z}`);
    }
  }

  // Route 2: Lower Maintenance Trench is at y = -1.0
  for (const z of [-20, -12, -4]) {
    for (const x of [-13, -11]) {
      const h = surfaceHeightAt(x, z, 0.0, BLACKBELL_FOUNDRY);
      assert.equal(h, FOUNDRY_TRENCH_Y, `trench missing floor at x=${x}, z=${z}`);
    }
  }

  // Route 3: Upper Scaffolding Gantry is at y = 2.8
  for (const z of [-12, -6, -1]) {
    for (const x of [11, 13]) {
      const h = surfaceHeightAt(x, z, 3.0, BLACKBELL_FOUNDRY);
      assert.equal(h, FOUNDRY_GANTRY_Y, `gantry missing floor at x=${x}, z=${z}`);
    }
  }

  // Gantry descent ramp reaches mid-height y = 1.4 at z = 3
  const rampHeight = surfaceHeightAt(12, 3, 2.0, BLACKBELL_FOUNDRY);
  assert.equal(rampHeight, 1.4, 'gantry descent ramp mid-height mismatch');


  // Stage 2: The Great Bell dais is raised at y = 1.0
  const daisHeight = surfaceHeightAt(0, 26, 1.2, BLACKBELL_FOUNDRY);
  assert.equal(daisHeight, FOUNDRY_DAIS_Y, 'great bell dais surface height mismatch');
});

test('Blackbell Foundry spawns all rest upon solid traversable ground', () => {
  for (const sp of BLACKBELL_FOUNDRY.spawnPoints) {
    const h = surfaceHeightAt(sp.x, sp.z, sp.y + 0.5, BLACKBELL_FOUNDRY);
    assert.notEqual(h, null, `spawn at (${sp.x}, ${sp.y}, ${sp.z}) is hovering over abyss`);
    assert(Math.abs(h - sp.y) < 0.25, `spawn elevation ${sp.y} does not match floor height ${h}`);
  }
});

test('Blackbell Foundry tactical bot routing splits attackers across 3 lanes', () => {
  const room = new Room('TEST', { mode: GAME_MODES.BREAKTHROUGH, worldId: 'blackbell-foundry' });
  const activeObj = room.objectiveState.objectives[0];

  // Attacker 0 (Vanguard): Takes Central Yard
  const actor0 = {
    team: TEAMS.ATTACKERS,
    rivalIndex: 0,
    position: { x: 0, y: 0, z: -25 },
  };
  const goal0 = BLACKBELL_FOUNDRY.tactics.getTacticalGoal({
    actor: actor0,
    rivalIndex: 0,
    objectiveState: room.objectiveState,
    activeObj,
    enemies: [],
  });
  assert(goal0 !== null);
  assert.equal(goal0.x, 0);

  // Attacker 1: Takes Lower Trench (West)
  const actor1 = {
    team: TEAMS.ATTACKERS,
    rivalIndex: 1,
    position: { x: -12, y: FOUNDRY_TRENCH_Y, z: -25 },
  };
  const goal1 = BLACKBELL_FOUNDRY.tactics.getTacticalGoal({
    actor: actor1,
    rivalIndex: 1,
    objectiveState: room.objectiveState,
    activeObj,
    enemies: [],
  });
  assert(goal1 !== null);
  assert.equal(goal1.x, -12);
  assert.equal(goal1.y, FOUNDRY_TRENCH_Y);

  // Attacker 2: Takes Upper Gantry (East)
  const actor2 = {
    team: TEAMS.ATTACKERS,
    rivalIndex: 2,
    position: { x: 12.5, y: FOUNDRY_GANTRY_Y, z: -20 },
  };
  const goal2 = BLACKBELL_FOUNDRY.tactics.getTacticalGoal({
    actor: actor2,
    rivalIndex: 2,
    objectiveState: room.objectiveState,
    activeObj,
    enemies: [],
  });
  assert(goal2 !== null);
  assert.equal(goal2.x, 12.5);
  assert.equal(goal2.y, FOUNDRY_GANTRY_Y);
});

test('Blackbell Foundry Breakthrough match initializes and simulates cleanly', () => {
  const room = new Room('TEST', { mode: GAME_MODES.BREAKTHROUGH, worldId: 'blackbell-foundry' });
  assert.equal(room.worldId, 'blackbell-foundry');
  assert.equal(room.world.name, 'Blackbell Foundry');

  // Add 1 human attacker and provision bots
  const human = room.addPlayer({
    id: 'p1',
    token: 'tok1',
    name: 'Vanguard',
    team: TEAMS.ATTACKERS,
  }, 0);
  room.provisionModeActors(0);

  assert.equal(room.players.size, 6);
  assert.equal(room.objectiveState.index, 0);
  assert.equal(room.objectiveState.objectives[0].name, 'The Chain Winch');
  assert.equal(room.objectiveState.objectives[1].name, 'The Great Bell');

  // Verify bot controllers step without error
  assert.doesNotThrow(() => {
    stepBotControllers(room, 1.0);
  });
});

test('Blackbell Foundry authoritative capture respects vertical height bounds and fixes trench exploit', () => {
  const room = new Room('TEST-HEIGHT', { mode: GAME_MODES.BREAKTHROUGH, worldId: 'blackbell-foundry' });
  room.startMatch(0);

  const att = room.addPlayer({
    id: 'att-climber',
    token: 'tok-climber',
    name: 'Climber',
    team: TEAMS.ATTACKERS,
  }, 0);

  // 1. Stage 1 (Chain Winch at x: 0, y: 0, z: -2)
  // A. Player standing on accessible ground inside the yard captures cleanly:
  att.position = { x: 0, y: 0, z: -2 };
  stepObjectives(room, 1.0, 1.0);
  assert(room.objectiveState.progress > 0, 'Player on ground should capture Chain Winch');
  assert.equal(room.objectiveState.attackersCount, 1);

  // B. Player jumping inside the zone (y = 1.2, dy = 1.2 <= 1.8) captures:
  room.objectiveState.progress = 0;
  att.position = { x: 0, y: 1.2, z: -2 };
  stepObjectives(room, 1.0, 2.0);
  assert(room.objectiveState.progress > 0, 'Jumping player within vertical tolerance should capture');
  assert.equal(room.objectiveState.attackersCount, 1);

  // C. Player on overhead gantry (y = 2.8, dy = 2.8 > 1.8) directly above:
  room.objectiveState.progress = 0;
  att.position = { x: 0, y: 2.8, z: -2 };
  stepObjectives(room, 1.0, 3.0);
  assert.equal(room.objectiveState.progress, 0, 'Player on overhead gantry (y=2.8) must NOT capture yard objective (y=0)');
  assert.equal(room.objectiveState.attackersCount, 0, 'Overhead player should not count toward capture zone');

  // D. Player in sunken drainage trench (y = -1.0, dy = -1.0 < -0.6):
  room.objectiveState.progress = 0;
  att.position = { x: 0, y: -1.0, z: -2 };
  stepObjectives(room, 1.0, 4.0);
  assert.equal(room.objectiveState.progress, 0, 'Player in sunken trench (y=-1.0) must NOT capture ground objective (y=0)');
  assert.equal(room.objectiveState.attackersCount, 0, 'Trench player should not count toward capture zone');

  // 2. Stage 2 (The Great Bell on Dais at x: 0, y: 1.0, z: 26)
  room.objectiveState.index = 1;
  room.objectiveState.progress = 0;
  
  // A. Player on the raised dais at y = 1.0 captures:
  att.position = { x: 0, y: 1.0, z: 26 };
  stepObjectives(room, 1.0, 5.0);
  assert(room.objectiveState.progress > 0, 'Player on Great Bell dais should capture');
  assert.equal(room.objectiveState.attackersCount, 1);

  // B. Player on the foundry floor beneath the dais (y = 0.0, dy = -1.0 < -0.6) must NOT capture:
  room.objectiveState.progress = 0;
  att.position = { x: 0, y: 0.0, z: 26 };
  stepObjectives(room, 1.0, 6.0);
  assert.equal(room.objectiveState.progress, 0, 'Player on floor below dais must NOT capture without climbing dais');
  assert.equal(room.objectiveState.attackersCount, 0);

  // C. Player deep beneath dais in a trench (y = -1.0, dy = -2.0) must not capture:
  room.objectiveState.progress = 0;
  att.position = { x: 0, y: -1.0, z: 26 };
  stepObjectives(room, 1.0, 7.0);
  assert.equal(room.objectiveState.progress, 0, 'Player deep beneath dais must NOT capture');
  assert.equal(room.objectiveState.attackersCount, 0);
});
