import test from 'node:test';
import assert from 'node:assert/strict';
import { getWorld, WORLD_IDS } from '../worlds/registry.mjs';
import { ARENAS, VOTE_OPTIONS, arenaOrDefault } from './modes.mjs';
import { findSwordWorldHit, resolvePlayerWorld, surfaceHeightAt } from './collision.mjs';
import { MOVEMENT, createMovementState, movePlayer, tryStartDash } from './movement.mjs';
import { navGraph, routeBetween, runClear } from '../sim/botNav.mjs';

const WORLD_ID = 'greener-pastures';
const world = () => getWorld(WORLD_ID);
const route = async () => (await import('../worlds/greenerPastures.mjs')).GREENER_ROUTE;

test('the authored chase gives every event physical distance and a stable named route position', async () => {
  const { chaseWaypoints, waypointById, routeDistances, totalChaseDistance, bridge, finalStand, entrance } = await route();
  assert.deepEqual(chaseWaypoints.map(point => point.id), ['meeting', 'escape', 'fireball', 'bridge-approach', 'bridge-takeoff', 'bridge-landing', 'far-bank', 'counterfire', 'complaint-approach', 'pride', 'final']);
  assert.ok(totalChaseDistance > 900, 'the continuous chase has enough physical breathing room');
  assert.ok(routeDistances['bridge-takeoff'] > 500, 'the prebridge chase gives the moving Fireball dialogue time to finish');
  assert.ok(routeDistances['bridge-takeoff'] - routeDistances.fireball > 250);
  assert.ok(routeDistances.counterfire - routeDistances['far-bank'] > 120);
  assert.ok(routeDistances['complaint-approach'] - routeDistances.counterfire > 140);
  assert.equal(waypointById.final, finalStand);
  assert.equal(waypointById['bridge-takeoff'], bridge.dashStart);
  assert.ok(Math.hypot(finalStand.x - entrance.x, finalStand.z - entrance.z) <= 6.1, 'Rival stands only a few steps from the entrance');
});

test('TATTLE ON YOU is a real destination with an open entrance and a clear final combat lane', async () => {
  const { entrance, finalStand, departure, landmarks } = await route();
  assert.equal(landmarks.destination.label, 'TATTLE ON YOU');
  assert.equal(runClear(world(), finalStand, entrance), true);
  assert.equal(runClear(world(), entrance, { ...entrance, z: entrance.z - 7 }), true);
  assert.equal(runClear(world(), finalStand, departure), true);
  assert.ok(world().solids.some(solid => solid.kind === 'complaint-wing'));
  const sign = world().solids.find(solid => solid.kind === 'complaint-sign');
  assert.ok(sign.size[0] >= 20 && sign.size[1] >= 3);
  const target = [sign.center[0], sign.center[1], sign.center[2]];
  const origin = [landmarks.complaintApproach.x, 1.64, landmarks.complaintApproach.z];
  const direction = target.map((value, i) => value - origin[i]);
  const hit = findSwordWorldHit(origin, direction, Math.hypot(...direction) + 0.1, world().solids);
  assert.equal(hit?.box.id, sign.id, 'the approaching player has an unobstructed sign sightline');
});

function simulate(start, seconds, { dash = false, jump = false, hz = 60, yaw = 0 } = {}) {
  let state = createMovementState(start);
  if (dash) assert.equal(tryStartDash(state, { x: -Math.sin(yaw), z: -Math.cos(yaw) }, 0), true);
  let lowest = start.y;
  for (let i = 0; i < seconds * hz; i += 1) {
    state = movePlayer(state, { forward: 1, right: 0, jump: jump && i === 0, yaw }, 1 / hz, i / hz, world());
    lowest = Math.min(lowest, state.position.y);
  }
  return { state, lowest };
}

test('Greener Pastures is a registered tutorial world and stays outside arena voting', () => {
  assert.equal(WORLD_IDS.GREENER_PASTURES, WORLD_ID);
  assert.equal(world().name, 'Greener Pastures');
  assert.equal(world().tutorialOnly, true);
  assert.equal(ARENAS.includes(WORLD_ID), false);
  assert.equal(VOTE_OPTIONS.world.includes(WORLD_ID), false);
  assert.equal(arenaOrDefault(WORLD_ID), 'castleward');
});

test('the opening gives Rival a clear 135 metre sightline across walkable ground', async () => {
  const { playerSpawn, rivalMeeting } = await route();
  assert.equal(Math.hypot(playerSpawn.x - rivalMeeting.x, playerSpawn.z - rivalMeeting.z), 135);
  assert.equal(runClear(world(), playerSpawn, rivalMeeting), true);
  const origin = [playerSpawn.x, playerSpawn.y + 1.3, playerSpawn.z];
  const direction = [rivalMeeting.x - playerSpawn.x, 0, rivalMeeting.z - playerSpawn.z];
  assert.equal(findSwordWorldHit(origin, direction, 135, world().solids), null);
  const reached = simulate(playerSpawn, 18);
  assert.ok(Math.abs(reached.state.position.z - rivalMeeting.z) < 0.01);
  assert.equal(reached.state.grounded, true);
});

test('spawns and all checkpoint placements stand on ground with body clearance', async () => {
  const { checkpointPositions } = await route();
  for (const spawn of [...world().spawnPoints, ...Object.values(checkpointPositions)]) {
    assert.equal(surfaceHeightAt(spawn.x, spawn.z, spawn.y, world()), spawn.y);
    assert.deepEqual(resolvePlayerWorld(spawn, MOVEMENT.playerRadius, world().solids), spawn);
    for (const solid of world().solids) {
      const [x, y, z] = solid.center;
      const [sx, sy, sz] = solid.size;
      if (spawn.y + 0.1 >= y + sy / 2 || spawn.y + 1.8 <= y - sy / 2) continue;
      const dx = Math.max(0, Math.abs(spawn.x - x) - sx / 2);
      const dz = Math.max(0, Math.abs(spawn.z - z) - sz / 2);
      assert.ok(Math.hypot(dx, dz) >= 0.5, `placement meets ${solid.id}`);
    }
  }
});

test('the broken bridge has a real three metre floor gap with an unobstructed Dash lane', async () => {
  const { bridge } = await route();
  assert.equal(bridge.gapBounds.maxZ - bridge.gapBounds.minZ, 3);
  for (const x of [bridge.centerX - 3, bridge.centerX, bridge.centerX + 3]) {
    for (let z = bridge.gapBounds.minZ + 0.1; z < bridge.gapBounds.maxZ; z += 0.2) {
      assert.equal(surfaceHeightAt(x, z, 0, world()), null, 'the broken span has no supporting floor');
      const position = { x, y: 0, z };
      assert.deepEqual(resolvePlayerWorld(position, MOVEMENT.playerRadius, world().solids), position, 'the gap has no invisible wall');
    }
  }
  assert.equal(runClear(world(), bridge.dashStart, bridge.dashLanding), false, 'ordinary navigation recognises the gap');
});

test('real Dash crosses the broken span at all simulation rates and keeps its real cooldown', async () => {
  const { bridge } = await route();
  for (const hz of [30, 60, 120]) {
    const { state, lowest } = simulate(bridge.dashStart, 0.35, { dash: true, hz });
    assert.ok(state.position.z < bridge.gapBounds.minZ - 0.2, `Dash reaches the far deck at ${hz} Hz`);
    assert.ok(lowest > -0.2, `Dash keeps enough height at ${hz} Hz`);
    assert.equal(state.grounded, true);
    assert.equal(state.dashReadyAt, MOVEMENT.dashCooldown);
    assert.equal(tryStartDash(state, { x: 0, z: -1 }, 4.99), false);
    assert.equal(tryStartDash(state, { x: 0, z: -1 }, 5), true);
  }
});

test('ordinary Jump is an honest alternate bridge crossing while walking falls', async () => {
  const { bridge } = await route();
  const walked = simulate(bridge.dashStart, 0.8);
  assert.ok(walked.lowest < -1, 'walking goes into the ravine');
  assert.equal(walked.state.grounded, false);
  for (const hz of [30, 60, 120]) {
    const jumped = simulate(bridge.dashStart, 0.95, { jump: true, hz });
    assert.equal(jumped.state.grounded, true);
    assert.equal(jumped.state.position.y, 0);
    assert.ok(jumped.state.position.z < bridge.gapBounds.minZ - 1, `Jump reaches the far deck at ${hz} Hz`);
  }
});

test('all navigation nodes connect through the distant intact crossing and reach every spawn', async () => {
  const graph = navGraph(world());
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) {
    for (const { to } of graph.links[queue.shift()]) {
      if (seen.has(to)) continue;
      seen.add(to);
      queue.push(to);
    }
  }
  assert.deepEqual(graph.nodes.filter((_, i) => !seen.has(i)).map((node) => node.id), []);
  for (const spawn of world().spawnPoints) {
    assert.ok(graph.nodes.some((node) => runClear(world(), spawn, node)));
  }
  const { bridge, playerSpawn, finalStand } = await route();
  const detour = routeBetween(world(), bridge.dashStart, bridge.dashLanding);
  assert.ok(detour?.length > 5, 'ordinary bots take the genuine distant crossing');
  assert.ok(detour.some((i) => graph.nodes[i].x < -60));
  assert.ok(routeBetween(world(), playerSpawn, finalStand));
});

test('the chase waypoints are runnable on either side and the final clearing has space to evade', async () => {
  const { chaseWaypoints, finalStand, bridge } = await route();
  for (let i = 1; i < chaseWaypoints.length; i += 1) {
    const from = chaseWaypoints[i - 1];
    const to = chaseWaypoints[i];
    if (from.id === 'bridge-takeoff' && to.id === 'bridge-landing') continue;
    assert.equal(runClear(world(), from, to), true, `${from.id} to ${to.id}`);
  }
  assert.ok(chaseWaypoints.some((point) => point.x === bridge.centerX));
  for (const [dx, dz] of [[-12, 0], [12, 0], [0, -12], [0, 12]]) {
    assert.equal(runClear(world(), finalStand, { ...finalStand, x: finalStand.x + dx, z: finalStand.z + dz }), true);
  }
});

test('ordinary locomotion traverses the full authored chase with a real bridge Dash at every simulation rate', async () => {
  const { chaseWaypoints, bridge, totalChaseDistance, finalStand } = await route();
  for (const hz of [30, 60, 120]) {
    const dt = 1 / hz;
    let state = createMovementState(chaseWaypoints[0]);
    let elapsed = 0;
    let ticks = 0;
    for (const target of chaseWaypoints.slice(1)) {
      if (target.id === 'bridge-landing') {
        assert.equal(tryStartDash(state, { x: 0, z: -1 }, elapsed), true);
        const start = elapsed;
        for (let i = 0; i < Math.ceil(MOVEMENT.dashDuration * hz); i += 1) {
          state = movePlayer(state, { forward: 0, yaw: 0 }, dt, start + i * dt, world());
          elapsed += dt;
          ticks += 1;
        }
        assert.ok(state.position.z < bridge.gapBounds.minZ && state.position.y > -0.2);
        continue;
      }
      for (;;) {
        const distance = Math.hypot(target.x - state.position.x, target.z - state.position.z);
        if (distance < 0.01) break;
        const yaw = Math.atan2(state.position.x - target.x, state.position.z - target.z);
        state = movePlayer(state, { forward: Math.min(1, distance / (MOVEMENT.runSpeed * dt)), yaw }, dt, elapsed, world());
        elapsed += dt;
        ticks += 1;
        assert.ok(state.position.y > -0.2, `${target.id} stays on real ground at ${hz} Hz`);
        assert.ok(ticks < (totalChaseDistance / MOVEMENT.runSpeed + 5) * hz, `authored chase can be completed at ${hz} Hz`);
      }
    }
    assert.ok(Math.hypot(state.position.x - finalStand.x, state.position.z - finalStand.z) < 0.02);
    assert.equal(state.grounded, true);
    assert.ok(elapsed < totalChaseDistance / MOVEMENT.runSpeed + 1);
  }
});
