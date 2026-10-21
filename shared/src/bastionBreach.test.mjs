import test from 'node:test';
import assert from 'node:assert/strict';
import { findSwordWorldHit, surfaceHeightAt } from './collision.mjs';
import { createMovementState, movePlayer } from './movement.mjs';
import { routeBetween, runClear } from '../sim/botNav.mjs';
import { TEAMS } from './teams.mjs';
import {
  BASTION_BREACH,
  BASTION_BREACH_CLOSED,
  BASTION_BREACH_OPEN,
  BASTION_GATE_BLOCKER,
  BASTION_GATE_OPEN_DURATION_SEC,
  BASTION_BREACH_TACTICS,
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

  // Material check: iron gate produces metal clang, matching Argon authored arch dimensions (3.392m x 3.940m x 0.550m)
  const blocker = closedWorld.solids.find((s) => s.id === 'gatehouse-honorable-gate-closed');
  assert.equal(blocker.material, 'iron');
  assert.equal(Math.abs(blocker.size[0] - 3.392) < 1e-3, true);
  assert.equal(Math.abs(blocker.size[1] - 3.940) < 1e-3, true);
  assert.equal(Math.abs(blocker.size[2] - 0.550) < 1e-3, true);
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
    // Must be outside Objective 1 capture radius (6.0m from [0, 0, -2])
    const distToObj1 = Math.hypot(sp.x - 0, sp.z - (-2));
    assert(distToObj1 > 6.0, `Defender spawn at (${sp.x}, ${sp.z}) distance ${distToObj1.toFixed(2)}m must be outside 6m capture radius`);
    // Ground underfoot
    const ground = surfaceHeightAt(sp.x, sp.z, sp.y + 0.2, BASTION_BREACH);
    assert.notEqual(ground, null, `Defender spawn at (x=${sp.x}, z=${sp.z}) must have solid ground`);
    assert(Math.abs(ground - sp.y) < 0.1, `Defender spawn y=${sp.y} must match ground height ${ground}`);

    // Clean navigation path and valid route to Objective 1 at (0, 0, -2) without passing through gate
    const clear = runClear(BASTION_BREACH_CLOSED, { x: sp.x, y: sp.y, z: sp.z }, { x: 0, y: 0, z: -2 });
    const route = routeBetween(BASTION_BREACH_CLOSED, { x: sp.x, y: sp.y, z: sp.z }, { x: 0, y: 0, z: -2 });
    const canReachOuterGate = clear || (route !== null && route.length > 0);
    assert.equal(canReachOuterGate, true, `Defender spawn at (${sp.x}, ${sp.y}, ${sp.z}) must route to Objective 1`);
  }

  // Phase 1 defenders spawn behind the Sanctum altar
  const phase1Defenders = BASTION_BREACH.spawnPoints.filter((s) => s.team === 'DEFENDERS' && s.phase === 1);
  for (const sp of phase1Defenders) {
    assert(sp.z > 30, `Phase 1 defender spawn at z=${sp.z} must defend High Sanctum altar`);
  }
});

test('Gate transition collision remains blocked during 1.2s opening ceremony and lifts deterministically at expiry', () => {
  const capturedAt = 100.0;
  const stage2Obj = { index: 1, completed: false, lastCapturedAt: capturedAt };

  // 1. Exact moment of capture (t = 100.0): gate is closed
  const worldAtCapture = bastionBreachForObjective(stage2Obj, capturedAt);
  assert.equal(worldAtCapture, BASTION_BREACH_CLOSED);
  assert.equal(worldAtCapture.solids.some((s) => s.id === 'gatehouse-honorable-gate-closed'), true);

  // 2. Mid-ceremony (t = 100.6s, half-open visually): collision remains solidly closed
  const worldMidTransition = bastionBreachForObjective(stage2Obj, capturedAt + 0.6);
  assert.equal(worldMidTransition, BASTION_BREACH_CLOSED);
  assert.equal(worldMidTransition.solids.some((s) => s.id === 'gatehouse-honorable-gate-closed'), true);

  // Weapon strike at mid-transition hits closed gate
  const swordHit = findSwordWorldHit([0, 1.2, 7.5], [0, 0, 1], 3.0, worldMidTransition.solids);
  assert.ok(swordHit, 'Sword attack must hit gate during opening ceremony');
  assert.equal(swordHit.box.id, 'gatehouse-honorable-gate-closed');

  // Player locomotion at mid-transition is blocked
  const startState = createMovementState({ x: 0, y: 0, z: 8.0 });
  const moveInput = { forward: 1, right: 0, jump: false, crouch: false, yaw: Math.PI, pitch: 0 };
  let midState = { ...startState };
  for (let t = 0; t < 20; t++) {
    midState = movePlayer(midState, moveInput, 0.05, (capturedAt + 0.6) + t * 0.05, worldMidTransition);
  }
  assert(midState.position.z < 8.2, `Player must be stopped at z=${midState.position.z} during opening ceremony`);

  // 3. Just before expiry (t = 101.19s): still closed
  const worldBeforeExpiry = bastionBreachForObjective(stage2Obj, capturedAt + 1.19);
  assert.equal(worldBeforeExpiry, BASTION_BREACH_CLOSED);

  // 4. Exact expiry (t = 101.20s): opening complete, collision lifts deterministically
  const worldAtExpiry = bastionBreachForObjective(stage2Obj, capturedAt + BASTION_GATE_OPEN_DURATION_SEC);
  assert.equal(worldAtExpiry, BASTION_BREACH_OPEN);
  assert.equal(worldAtExpiry.solids.some((s) => s.id === 'gatehouse-honorable-gate-closed'), false);

  // 5. Well after expiry (t = 105.0s): stays open
  const worldAfter = bastionBreachForObjective(stage2Obj, capturedAt + 5.0);
  assert.equal(worldAfter, BASTION_BREACH_OPEN);

  // Locomotion through open gate after ceremony completes
  let postState = { ...startState };
  for (let t = 0; t < 20; t++) {
    postState = movePlayer(postState, moveInput, 0.05, (capturedAt + 1.5) + t * 0.05, worldAfter);
  }
  assert(postState.position.z > 9.5, `Player must traverse into Sanctum at z=${postState.position.z}`);
});

test('Bot navigation and tactics respect gate transition timing', () => {
  const southNode = { x: 0, y: 0, z: 7 };
  const northNode = { x: 0, y: 0, z: 11 };
  const courtyard = { x: 0, y: 0, z: 4 };
  const sanctum = { x: 0, y: 0.3, z: 25 };

  // 1. Navigation graph links through gatehouse only when open
  assert.equal(runClear(BASTION_BREACH_CLOSED, southNode, northNode), false);
  assert.equal(runClear(BASTION_BREACH_OPEN, southNode, northNode), true);

  // Route between courtyard and sanctum is blocked when closed, available when open
  const routeClosed = routeBetween(BASTION_BREACH_CLOSED, courtyard, sanctum);
  assert.equal(routeClosed, null, 'No route through closed gatehouse');

  const routeOpen = routeBetween(BASTION_BREACH_OPEN, courtyard, sanctum);
  assert.ok(routeOpen !== null && routeOpen.length > 0, 'Route available through open gatehouse');

  // 2. Bot tactics during opening ceremony:
  const capturedAt = 200.0;
  const stage2Obj = { index: 1, completed: false, lastCapturedAt: capturedAt, attackersCount: 1, defendersCount: 0 };
  const activeObj = { x: 0, y: 0.3, z: 25, radius: 5.5 };

  // Attacker at z = 4.0 during transition (nowSec = 200.5) holds outside the gate at z = 5.5
  const attGoalOpening = BASTION_BREACH_TACTICS.getTacticalGoal({
    actor: { team: TEAMS.ATTACKERS, position: { x: 0, y: 0, z: 4.0 } },
    rivalIndex: 0,
    objectiveState: stage2Obj,
    activeObj,
    enemies: [],
    nowSec: capturedAt + 0.5,
  });
  assert.deepEqual(attGoalOpening, { x: 0, y: 0, z: 5.5 }, 'Attacker bot holds at threshold during ceremony');

  // Attacker at z = 4.0 after ceremony (nowSec = 201.5) pushes forward toward High Sanctum
  const attGoalOpen = BASTION_BREACH_TACTICS.getTacticalGoal({
    actor: { team: TEAMS.ATTACKERS, position: { x: 0, y: 0, z: 4.0 } },
    rivalIndex: 0,
    objectiveState: stage2Obj,
    activeObj,
    enemies: [],
    nowSec: capturedAt + 1.5,
  });
  assert.deepEqual(attGoalOpen, { x: 0, y: 0.3, z: 25.0 }, 'Attacker bot charges Sanctum once gate is open');
});

test('Late join and reconnect state reconstruction during and after transition', () => {
  const capturedAt = 50.0;

  // Snapshot arriving mid-transition at t = 50.6s
  const midSnapshot = {
    objective: { index: 1, lastCapturedAt: capturedAt },
    serverTime: 50.6,
  };
  const midWorld = bastionBreachForObjective(midSnapshot.objective, midSnapshot.serverTime);
  assert.equal(midWorld, BASTION_BREACH_CLOSED, 'Late join mid-ceremony must reconstruct closed collision');

  // Snapshot arriving post-transition at t = 53.0s
  const postSnapshot = {
    objective: { index: 1, lastCapturedAt: capturedAt },
    serverTime: 53.0,
  };
  const postWorld = bastionBreachForObjective(postSnapshot.objective, postSnapshot.serverTime);
  assert.equal(postWorld, BASTION_BREACH_OPEN, 'Late join post-ceremony must reconstruct open collision');

  // Deterministic visual progress math verification
  const elapsedMid = midSnapshot.serverTime - capturedAt;
  const progressMid = Math.min(1.0, Math.max(0.0, elapsedMid / BASTION_GATE_OPEN_DURATION_SEC));
  assert.ok(Math.abs(progressMid - 0.5) < 1e-4, 'Mid-transition progress is approximately 50%');

  const elapsedPost = postSnapshot.serverTime - capturedAt;
  const progressPost = Math.min(1.0, Math.max(0.0, elapsedPost / BASTION_GATE_OPEN_DURATION_SEC));
  assert.equal(progressPost, 1.0, 'Post-transition progress is 100%');
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

  // 1. Attempting to walk from courtyard at x = -11.5, z = 7.5 north through the opening is blocked by hoarding
  const startState = createMovementState({ x: -11.5, y: 0, z: 7.5 });
  const moveInput = { forward: 1, right: 0, jump: false, crouch: false, yaw: Math.PI, pitch: 0 };
  let state = { ...startState };
  for (let t = 0; t < 20; t++) {
    state = movePlayer(state, moveInput, 0.05, t * 0.05, BASTION_BREACH);
  }
  assert(state.position.z < 8.2, `Construction opening must not permit walking traversal; stopped at z=${state.position.z}`);

  // 2. Attempting to jump over the 3.2m timber hoarding from the low footing is also blocked
  const jumpInput = { forward: 1, right: 0, jump: true, crouch: false, yaw: Math.PI, pitch: 0 };
  let jumpState = { ...startState };
  for (let t = 0; t < 30; t++) {
    jumpState = movePlayer(jumpState, jumpInput, 0.05, t * 0.05, BASTION_BREACH);
  }
  assert(jumpState.position.z < 8.2, `Hoarding must block jump bypass; stopped at z=${jumpState.position.z}`);

  // 3. Navigation path through construction opening is not clear
  const navThroughHoarding = runClear(BASTION_BREACH, { x: -11.5, y: 0, z: 6.0 }, { x: -11.5, y: 0, z: 12.0 });
  assert.equal(navThroughHoarding, false, 'Bot nav must not route through hoarding');
});

