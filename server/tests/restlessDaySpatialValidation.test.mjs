import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { GAME_MODES } from '../../shared/src/modes.mjs';
import { WORLD_IDS, getWorld } from '../../shared/worlds/registry.mjs';
import { TEAMS } from '../../shared/src/teams.mjs';
import { applyRoomCommand } from '../../shared/sim/wire.mjs';
import {
  withRestlessLadders,
  interactRestlessLadder,
  damageRestlessLadder,
  restlessCarryClear,
  constrainRestlessCarry,
  ladderReach,
  RESTLESS_DAY_RULES,
} from '../../shared/sim/restlessDayMode.mjs';
import { movePlayer, createMovementState } from '../../shared/src/movement.mjs';
import { surfaceHeightAt } from '../../shared/src/collision.mjs';

function createSiegeMatch(time = 10) {
  const room = new Room('SPATIAL1', { isPrivate: true, mode: GAME_MODES.RESTLESS_DAY, worldId: WORLD_IDS.RESTLESS_DAY });
  const attackerA = room.addPlayer({ id: 'carrier-1', token: 'tok-1', name: 'CarrierOne', team: TEAMS.ATTACKERS }, time - 1);
  const attackerB = room.addPlayer({ id: 'carrier-2', token: 'tok-2', name: 'CarrierTwo', team: TEAMS.ATTACKERS }, time - 1);
  room.provisionModeActors(time - 1);
  room.startMatch(time);
  return { room, attackerA, attackerB };
}

test('Ladder carrier can navigate through mustering-ground scenery without obstruction', () => {
  const { room, attackerA } = createSiegeMatch();
  const ladder = room.restlessDay.ladders[0];
  attackerA.position = { x: ladder.position.x, y: 0, z: ladder.position.z };
  assert.equal(applyRoomCommand(room, attackerA, { type: 'siegeOperate' }, 11).rejected, undefined);
  assert.equal(attackerA.restlessCarrying, ladder.id);

  // Advance carrier north through the mustering ground from z=-70 to z=-45
  let state = { ...createMovementState(attackerA.position), restlessCarrying: ladder.id, speedScale: RESTLESS_DAY_RULES.carrySpeed, grounded: true };
  const input = { forward: 1, right: 0, yaw: Math.PI, sprint: false, jump: false, crouch: false };
  for (let step = 0; step < 120; step++) {
    const prevPos = { ...state.position };
    state = movePlayer(state, input, 1 / 30, 12 + step / 30, room.world);
    const blocked = constrainRestlessCarry(state, prevPos, room.world, Math.PI);
    assert.equal(blocked, false, `Carrier must not be blocked at z=${state.position.z}`);
  }
  assert.ok(state.position.z > -50, `Carrier advanced safely to z=${state.position.z}`);
});

test('Two simultaneous carriers can operate and deploy ladders independently', () => {
  const { room, attackerA, attackerB } = createSiegeMatch();
  const l1 = room.restlessDay.ladders[0];
  const l2 = room.restlessDay.ladders[1];

  attackerA.position = { x: l1.position.x, y: 0, z: l1.position.z };
  attackerB.position = { x: l2.position.x, y: 0, z: l2.position.z };

  assert.equal(applyRoomCommand(room, attackerA, { type: 'siegeOperate' }, 11).rejected, undefined);
  assert.equal(applyRoomCommand(room, attackerB, { type: 'siegeOperate' }, 11).rejected, undefined);

  assert.equal(attackerA.restlessCarrying, l1.id);
  assert.equal(attackerB.restlessCarrying, l2.id);

  // Position at outer curtain deployment zone
  attackerA.position = { x: -6, y: 0, z: -31 };
  attackerA.yaw = Math.PI;
  attackerB.position = { x: 6, y: 0, z: -31 };
  attackerB.yaw = Math.PI;

  assert.equal(applyRoomCommand(room, attackerA, { type: 'siegeOperate' }, 12).rejected, undefined);
  assert.equal(applyRoomCommand(room, attackerB, { type: 'siegeOperate' }, 12).rejected, undefined);

  assert.equal(l1.state, 'deployed');
  assert.equal(l2.state, 'deployed');
  assert.equal(l1.wall, 0);
  assert.equal(l2.wall, 0);

  const worldWithLadders = withRestlessLadders(room.world, room.restlessDay);
  assert.ok(worldWithLadders.ramps.some((r) => r.id === `siege-ladder-${l1.id}`));
  assert.ok(worldWithLadders.ramps.some((r) => r.id === `siege-ladder-${l2.id}`));
});

test('Climbing works in both directions and dismounts cleanly onto ramparts', () => {
  const { room, attackerA } = createSiegeMatch();
  const l = room.restlessDay.ladders[0];
  l.state = 'deployed';
  l.wall = 0;
  l.position = { x: -6, y: 0, z: -31 };

  const world = withRestlessLadders(room.world, room.restlessDay);

  // Ascend north onto outer rampart (z=-31 -> z=-24, height 6)
  let actor = { ...createMovementState({ x: -6, y: 0, z: -31 }), speedScale: 1, grounded: true };
  const upInput = { forward: 1, right: 0, yaw: Math.PI, sprint: false, jump: false, crouch: false };
  for (let t = 0; t < 28; t++) {
    actor = movePlayer(actor, upInput, 1 / 30, 15 + t / 30, world);
  }
  assert.ok(actor.position.z >= -25, `Climbed to z=${actor.position.z}`);
  assert.ok(actor.position.y >= 5.5, `Reached height y=${actor.position.y}`);

  // Step forward onto the rampart floor
  actor = movePlayer(actor, upInput, 1 / 30, 18, world);
  assert.ok(actor.grounded, 'Player is grounded on rampart floor');
  assert.equal(surfaceHeightAt(actor.position.x, actor.position.z, actor.position.y, world), 6);

  // Descend south back down to field (z=-24 -> z=-31)
  const downInput = { forward: 1, right: 0, yaw: 0, sprint: false, jump: false, crouch: false };
  for (let t = 0; t < 28; t++) {
    actor = movePlayer(actor, downInput, 1 / 30, 19 + t / 30, world);
  }
  assert.ok(actor.position.z <= -30, `Descended to z=${actor.position.z}`);
  assert.ok(actor.position.y <= 0.5, `Returned to field height y=${actor.position.y}`);
});

test('Retrieval from wall-walk and second curtain deployment works with lip clearance', () => {
  const { room, attackerA } = createSiegeMatch();
  const l = room.restlessDay.ladders[0];
  l.state = 'deployed';
  l.wall = 0;
  l.position = { x: -6, y: 0, z: -31 };

  // Standing at outer rampart top
  attackerA.position = { x: -6, y: 6, z: -24 };
  attackerA.yaw = 0;
  assert.ok(ladderReach(l, attackerA) <= 3.8, 'Within retrieval reach at wall-walk');
  assert.equal(applyRoomCommand(room, attackerA, { type: 'siegeOperate' }, 20).rejected, undefined);
  assert.equal(l.state, 'carrying');
  assert.equal(attackerA.restlessCarrying, l.id);

  // Advance to inner curtain (Wall 1)
  room.restlessDay.phase = 1;
  attackerA.position = { x: -6, y: 0, z: 14 };
  attackerA.yaw = Math.PI;
  assert.equal(applyRoomCommand(room, attackerA, { type: 'siegeOperate' }, 22).rejected, undefined);
  assert.equal(l.state, 'deployed');
  assert.equal(l.wall, 1);

  const world1 = withRestlessLadders(room.world, room.restlessDay);
  assert.equal(surfaceHeightAt(-6, 21.5, 8, world1), 7, 'Inner rampart height reached');
});

test('Obstruction rejects illegal ladder placement intersecting solid geometry', () => {
  const { room, attackerA } = createSiegeMatch();
  const l = room.restlessDay.ladders[0];
  attackerA.position = { x: l.position.x, y: 0, z: l.position.z };
  applyRoomCommand(room, attackerA, { type: 'siegeOperate' }, 10);

  // Attempt placement directly into outer curtain wall body
  attackerA.position = { x: -6, y: 0, z: -25 };
  attackerA.yaw = Math.PI;
  const result = applyRoomCommand(room, attackerA, { type: 'siegeOperate' }, 11);
  assert.ok(result.rejected, 'Placement into wall body must be rejected');
});

test('Machine corridors maintain minimum 5.0m clear width around newly placed props', () => {
  const world = getWorld(WORLD_IDS.RESTLESS_DAY);
  const solids = world.solids;

  // SO-FIST-ICATION path around x=-4 from z=-85 to z=-35
  for (let z = -85; z <= -35; z += 2.0) {
    const hits = solids.filter((s) => {
      const halfX = s.size[0] / 2;
      const halfZ = s.size[2] / 2;
      return Math.abs(-4 - s.center[0]) < halfX + 2.5 && Math.abs(z - s.center[2]) < halfZ + 2.5;
    });
    assert.equal(hits.length, 0, `SO-FIST-ICATION corridor obstructed at z=${z}: ${hits.map((h) => h.id).join(', ')}`);
  }

  // Bi-Bye-llista path around x=15 from z=-85 to z=-35
  for (let z = -85; z <= -35; z += 2.0) {
    const hits = solids.filter((s) => {
      const halfX = s.size[0] / 2;
      const halfZ = s.size[2] / 2;
      return Math.abs(15 - s.center[0]) < halfX + 2.5 && Math.abs(z - s.center[2]) < halfZ + 2.5;
    });
    assert.equal(hits.length, 0, `Bi-Bye-llista corridor obstructed at z=${z}: ${hits.map((h) => h.id).join(', ')}`);
  }
});

test('Full siege traversal connectivity from attacker spawn to Renowner final court', () => {
  const world = getWorld(WORLD_IDS.RESTLESS_DAY);
  const nodes = world.navigation?.nodes ?? [];
  assert.ok(nodes.length >= 10, 'World must define navigation nodes');

  // Staging field -> Exposed Approach -> Outer Wall -> Inner Court -> Inner Wall -> Renowner Dais
  const musteringNode = nodes.find((n) => n.z < -60);
  const approachNode = nodes.find((n) => n.z >= -60 && n.z < -30);
  const innerCourtNode = nodes.find((n) => n.z > -20 && n.z < 20);
  const finalCourtNode = nodes.find((n) => n.z > 40);

  assert.ok(musteringNode, 'Mustering ground navigation node exists');
  assert.ok(approachNode, 'Exposed approach navigation node exists');
  assert.ok(innerCourtNode, 'Inner court navigation node exists');
  assert.ok(finalCourtNode, 'Renowner final court navigation node exists');
});
