import test from 'node:test';
import assert from 'node:assert/strict';
import { findSwordWorldHit, surfaceHeightAt } from './collision.mjs';
import { createMovementState, movePlayer } from './movement.mjs';
import { runClear } from '../sim/botNav.mjs';
import {
  BASTION_BREACH,
  BASTION_BREACH_CLOSED,
  BASTION_BREACH_OPEN,
  bastionBreachForObjective,
} from '../worlds/bastionBreach.mjs';

test('Bastion Breach eastern approach has continuous ground from camp to courtyard', () => {
  // This lane is enclosed by the eastern wall. Without its floor tile, moving into it
  // exposes the background through the ground and the authoritative simulation sees an abyss.
  for (const z of [-25, -18, -11]) {
    for (const x of [8.5, 10, 12, 14.5, 15.4]) {
      assert.equal(
        surfaceHeightAt(x, z, 0.2, BASTION_BREACH),
        0,
        `missing east-approach floor at (x=${x}, z=${z})`,
      );
    }
  }
});

test('Bastion Breach ground does not extend beyond the eastern boundary', () => {
  assert.equal(surfaceHeightAt(18, -18, 0.2, BASTION_BREACH), null);
});

test('Honorable Entry Gatehouse blocker is authoritative during Stage 1 and removed during Stage 2', () => {
  const closedWorld = bastionBreachForObjective({ index: 0, progress: 0.5 });
  const openWorld = bastionBreachForObjective({ index: 1, progress: 0 });
  const completedWorld = bastionBreachForObjective({ index: 0, completed: true });

  assert.equal(closedWorld, BASTION_BREACH_CLOSED);
  assert.equal(openWorld, BASTION_BREACH_OPEN);
  assert.equal(completedWorld, BASTION_BREACH_OPEN);

  // Blocker presence
  assert.equal(closedWorld.solids.some((s) => s.id === 'gatehouse-honorable-gate-closed'), true);
  assert.equal(openWorld.solids.some((s) => s.id === 'gatehouse-honorable-gate-closed'), false);

  // Material check: iron gate produces metal clang
  const blocker = closedWorld.solids.find((s) => s.id === 'gatehouse-honorable-gate-closed');
  assert.equal(blocker.material, 'iron');
  assert.equal(Math.abs(blocker.size[0] - 6.8) < 1e-4, true);
  assert.equal(Math.abs(blocker.size[1] - 5.5) < 1e-4, true);
  assert.equal(Math.abs(blocker.size[2] - 0.6) < 1e-4, true);
});

test('Honorable Entry Gatehouse stops players and weapons when closed, and permits free traversal when open', () => {
  const closedWorld = BASTION_BREACH_CLOSED;
  const openWorld = BASTION_BREACH_OPEN;

  // 1. Blade hit / raycast through the doorway at z = 8.8
  const origin = [0, 1.2, 7.5];
  const direction = [0, 0, 1];
  const hitClosed = findSwordWorldHit(origin, direction, 3.0, closedWorld.solids);
  assert(hitClosed !== null, 'Sword strike must hit closed gate');
  assert.equal(hitClosed.box.id, 'gatehouse-honorable-gate-closed');
  assert.equal(hitClosed.box.material, 'iron');

  const hitOpen = findSwordWorldHit(origin, direction, 3.0, openWorld.solids);
  assert.equal(hitOpen, null, 'Sword strike passes cleanly through open gate');

  // 2. Locomotion / player collision across z = 8.8
  const startState = createMovementState({ x: 0, y: 0, z: 8.0 });
  const moveInput = { forward: 1, right: 0, jump: false, crouch: false, yaw: Math.PI, pitch: 0 };

  // Step 1: Moving into closed gate
  let closedState = { ...startState };
  for (let t = 0; t < 20; t++) {
    closedState = movePlayer(closedState, moveInput, 0.05, t * 0.05, closedWorld);
  }
  // Player must be blocked south of the gate (z < 8.5 - MOVEMENT.playerRadius = 8.1)
  assert(closedState.position.z < 8.2, `Player must not pass closed gate; stopped at z=${closedState.position.z}`);

  // Step 2: Moving into open gate
  let openState = { ...startState };
  for (let t = 0; t < 20; t++) {
    openState = movePlayer(openState, moveInput, 0.05, t * 0.05, openWorld);
  }
  // Player moves freely past z = 9.5 into the inner passage
  assert(openState.position.z > 9.5, `Player must traverse freely through open gate; reached z=${openState.position.z}`);
});

test('Stage 1 Phase 0 defenders spawn in Outer Courtyard and ramp with clear access to Objective 1', () => {
  const phase0Defenders = BASTION_BREACH.spawnPoints.filter((s) => s.team === 'DEFENDERS' && s.phase === 0);
  assert.equal(phase0Defenders.length, 5, 'Must have 5 Phase 0 defender spawn points');

  for (const sp of phase0Defenders) {
    // Must be located south of the closed gatehouse (z < 8.5)
    assert(sp.z < 8.5, `Defender spawn at (x=${sp.x}, z=${sp.z}) must be in courtyard, not behind closed gate`);
    // Ground underfoot
    const ground = surfaceHeightAt(sp.x, sp.z, sp.y + 0.2, BASTION_BREACH);
    assert.notEqual(ground, null, `Defender spawn at (x=${sp.x}, z=${sp.z}) must have solid ground`);
    assert(Math.abs(ground - sp.y) < 0.1, `Defender spawn y=${sp.y} must match ground height ${ground}`);

    // Clean navigation path to Objective 1 at (0, 0, -2) without passing through gate
    const canReachOuterGate = runClear(BASTION_BREACH_CLOSED, { x: sp.x, y: sp.y, z: sp.z }, { x: 0, y: 0, z: -2 });
    // All spawns have direct unobstructed line or clear ground path
    assert.equal(surfaceHeightAt(sp.x, sp.z, 0.2, BASTION_BREACH_CLOSED) !== null, true);
  }

  // Phase 1 defenders spawn behind the Sanctum altar
  const phase1Defenders = BASTION_BREACH.spawnPoints.filter((s) => s.team === 'DEFENDERS' && s.phase === 1);
  for (const sp of phase1Defenders) {
    assert(sp.z > 30, `Phase 1 defender spawn at z=${sp.z} must defend High Sanctum altar`);
  }
});

test('Construction opening has authentic low footing and timber hoarding barricade preventing shortcutting', () => {
  const footing = BASTION_BREACH.solids.find((s) => s.id === 'wall-construction-footing');
  const hoarding = BASTION_BREACH.solids.find((s) => s.id === 'wall-construction-hoarding');
  const outerWest = BASTION_BREACH.solids.find((s) => s.id === 'wall-breach-west-outer');
  const innerWest = BASTION_BREACH.solids.find((s) => s.id === 'wall-breach-west-inner');

  assert(footing !== undefined, 'Must have construction footing');
  assert(hoarding !== undefined, 'Must have construction timber hoarding');
  assert(outerWest !== undefined, 'Must have outer west wall');
  assert(innerWest !== undefined, 'Must have inner west wall');

  assert.equal(footing.material, 'stone');
  assert.equal(hoarding.material, 'timber');

  // Footing is foundation course (y = 0 to 0.95), hoarding extends up to y = 3.2 (cannot be jumped)
  assert.deepEqual(footing.center, [-11.5, 0.475, 8.9]);
  assert.deepEqual(hoarding.center, [-11.5, 2.075, 8.9]);

  // Attempting to walk from courtyard at x = -11.5, z = 7.5 north through the opening is blocked by hoarding
  const startState = createMovementState({ x: -11.5, y: 0, z: 7.5 });
  const moveInput = { forward: 1, right: 0, jump: false, crouch: false, yaw: Math.PI, pitch: 0 };
  let state = { ...startState };
  for (let t = 0; t < 20; t++) {
    state = movePlayer(state, moveInput, 0.05, t * 0.05, BASTION_BREACH);
  }
  assert(state.position.z < 8.2, `Construction opening must not permit traversal; stopped at z=${state.position.z}`);
});

test('Bot navigation graph links breach passage only when gatehouse is open', () => {
  const southNode = { x: 0, y: 0, z: 7 };
  const northNode = { x: 0, y: 0, z: 11 };

  // When closed, runClear must report blocked
  const closedClear = runClear(BASTION_BREACH_CLOSED, southNode, northNode);
  assert.equal(closedClear, false, 'Bot nav must be blocked across closed gate');

  // When open, runClear must report open
  const openClear = runClear(BASTION_BREACH_OPEN, southNode, northNode);
  assert.equal(openClear, true, 'Bot nav must connect freely through open gate');
});

