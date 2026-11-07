import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { GAME_MODES } from '../../shared/src/modes.mjs';
import { getWorld } from '../../shared/worlds/registry.mjs';
import { movePlayer, createMovementState } from '../../shared/src/movement.mjs';
import { edgeConstrainActor, edgeAlive } from '../../shared/sim/edgeOfVictory.mjs';
import { edgeInside } from '../../shared/src/edgeBoundary.mjs';
import { stepRoom } from '../../shared/sim/combat.mjs';

function createRuinedKeepMatch(mode = GAME_MODES.EDGE_OF_VICTORY) {
  const room = new Room('EDGE_SPATIAL', { mode, worldId: 'ruined-keep', isPrivate: true });
  room.addPlayer({ id: 'hero', token: 'tok-hero', name: 'Hero' }, 0);
  room.provisionModeActors(0);
  room.startMatch(0);
  return room;
}

test('1.6m breach gap enables sprinting, backpedaling, and crouching traversal', () => {
  const world = getWorld('ruined-keep');

  // 1. Sprinting north through the breach (z=-9 -> z=-4 at x=0)
  let actor = { ...createMovementState({ x: 0, y: 0, z: -9 }), grounded: true };
  const northInput = { forward: 1, right: 0, yaw: Math.PI, sprint: true, jump: false, crouch: false };
  for (let t = 0; t < 25; t++) {
    actor = movePlayer(actor, northInput, 1 / 30, t / 30, world);
  }
  assert.ok(actor.position.z >= -4.5, `Sprinted north through breach to z=${actor.position.z}`);
  assert.ok(Math.abs(actor.position.x) < 0.05, `Maintained center lane x=${actor.position.x}`);

  // 2. Backpedaling south back through the breach (z=-4 -> z=-9)
  const southInput = { forward: -1, right: 0, yaw: Math.PI, sprint: false, jump: false, crouch: false };
  for (let t = 0; t < 35; t++) {
    actor = movePlayer(actor, southInput, 1 / 30, 1 + t / 30, world);
  }
  assert.ok(actor.position.z <= -8.0, `Backpedaled south through breach to z=${actor.position.z}`);

  // 3. Crouching forward through the breach
  actor = { ...createMovementState({ x: 0, y: 0, z: -8 }), grounded: true };
  const crouchInput = { forward: 1, right: 0, yaw: Math.PI, sprint: false, jump: false, crouch: true };
  for (let t = 0; t < 30; t++) {
    actor = movePlayer(actor, crouchInput, 1 / 30, 2 + t / 30, world);
  }
  assert.ok(actor.crouched, 'Actor is in crouching stance');
  assert.ok(actor.position.z >= -5.0, `Crouched through breach to z=${actor.position.z}`);
});

test('Dual-lane clearance allows two combatants to pass through breach simultaneously', () => {
  const world = getWorld('ruined-keep');

  // Combatant A at x=-0.35 moving north, Combatant B at x=0.35 moving south
  let actorA = { ...createMovementState({ x: -0.35, y: 0, z: -8.5 }), grounded: true };
  let actorB = { ...createMovementState({ x: 0.35, y: 0, z: -4.5 }), grounded: true };

  const inputA = { forward: 1, right: 0, yaw: Math.PI, sprint: false, jump: false, crouch: false };
  const inputB = { forward: 1, right: 0, yaw: 0, sprint: false, jump: false, crouch: false };

  for (let t = 0; t < 25; t++) {
    actorA = movePlayer(actorA, inputA, 1 / 30, t / 30, world);
    actorB = movePlayer(actorB, inputB, 1 / 30, t / 30, world);
  }

  assert.ok(actorA.position.z >= -5.0, `Actor A crossed north to z=${actorA.position.z}`);
  assert.ok(actorB.position.z <= -8.0, `Actor B crossed south to z=${actorB.position.z}`);
  assert.ok(Math.abs(actorA.position.x - (-0.35)) < 0.1, 'Actor A maintained west lane');
  assert.ok(Math.abs(actorB.position.x - 0.35) < 0.1, 'Actor B maintained east lane');
});

test('Gale knockback shove propels target smoothly across breach without solid snagging', () => {
  const world = getWorld('ruined-keep');

  // Target at z=-7.5 struck with strong north knockback impulse
  let target = { ...createMovementState({ x: 0.15, y: 0, z: -7.5 }), grounded: true };
  target.impulse = { x: 0, z: 18.0 }; // northward launch over ramp

  const neutralInput = { forward: 0, right: 0, yaw: 0, sprint: false, jump: false, crouch: false };
  for (let t = 0; t < 20; t++) {
    target = movePlayer(target, neutralInput, 1 / 30, t / 30, world);
  }

  assert.ok(target.position.z >= -5.0, `Shoved across breach to z=${target.position.z}`);
  assert.ok(target.grounded, 'Landed stably on courtyard floor');
});

test('Stage 4 final circle at 6.5m radius constrains arena and supports active bot combat', () => {
  const room = createRuinedKeepMatch(GAME_MODES.EDGE_OF_VICTORY);
  assert.equal(room.mode, GAME_MODES.EDGE_OF_VICTORY);

  // Set boundary to final Stage 4 (radius 6.5m around center {x: 0, z: -1})
  room.edgeOfVictory.radius = 6.5;
  room.edgeOfVictory.phase = 'STAGE_4';
  const center = room.edgeOfVictory.center;

  // Position all combatants inside final circle around center
  let index = 0;
  for (const player of room.players.values()) {
    const angle = (index * Math.PI) / 2;
    player.position = {
      x: center.x + Math.cos(angle) * 3.5,
      y: 0,
      z: center.z + Math.sin(angle) * 3.5,
    };
    player.alive = true;
    index++;
  }

  for (const player of room.players.values()) {
    assert.ok(player.alive, `Player ${player.id} is alive in stage 4`);
    edgeConstrainActor(room, player, player.position, 10);
    assert.ok(edgeInside(player.position, center, 6.5, 0.45), `Player ${player.id} within 6.5m boundary`);
  }

  // Step simulation 15 frames of combat inside final circle
  for (let step = 0; step < 15; step++) {
    stepRoom(room, 1 / 30, 10 + step / 30);
  }
  assert.ok(edgeAlive(room).length >= 1, 'Combat continues in final circle');
});

test('Ruined Keep non-regression: FFA, Duel, and Practice initialize cleanly', () => {
  // 1. FFA Mode
  const ffaRoom = new Room('FFA_TEST', { mode: GAME_MODES.FREE_FOR_ALL, worldId: 'ruined-keep', isPrivate: true });
  ffaRoom.addPlayer({ id: 'p1', token: 't1', name: 'P1' }, 0);
  ffaRoom.addPlayer({ id: 'p2', token: 't2', name: 'P2' }, 0);
  ffaRoom.startMatch(0);
  assert.equal(ffaRoom.players.size, 2);
  assert.equal(ffaRoom.state, 'PLAYING');

  // 2. Duel Mode
  const duelRoom = new Room('DUEL_TEST', { mode: GAME_MODES.DUEL, worldId: 'ruined-keep', isPrivate: true });
  duelRoom.addPlayer({ id: 'd1', token: 'dt1', name: 'D1' }, 0);
  duelRoom.addPlayer({ id: 'd2', token: 'dt2', name: 'D2' }, 0);
  duelRoom.startMatch(0);
  assert.equal(duelRoom.players.size, 2);
  assert.equal(duelRoom.state, 'PLAYING');

  // 3. Practice Mode
  const practiceRoom = new Room('PRAC_TEST', { mode: GAME_MODES.PRACTICE, worldId: 'ruined-keep', isPrivate: true });
  practiceRoom.addPlayer({ id: 'solo', token: 'st1', name: 'Solo' }, 0);
  practiceRoom.startMatch(0);
  assert.equal(practiceRoom.players.size, 1);
  assert.equal(practiceRoom.state, 'PLAYING');
});
