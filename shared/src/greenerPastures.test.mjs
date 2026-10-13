import test from 'node:test';
import assert from 'node:assert/strict';
import { getWorld, WORLD_IDS } from '../worlds/registry.mjs';
import { ARENAS, VOTE_OPTIONS, arenaOrDefault } from './modes.mjs';
import { findSwordWorldHit, resolvePlayerWorld, surfaceHeightAt } from './collision.mjs';
import { MOVEMENT, createMovementState, movePlayer, tryStartDash } from './movement.mjs';
import { navGraph, routeBetween, runClear } from '../sim/botNav.mjs';
import { millLaneStep } from '../worlds/greenerParkour.mjs';

const WORLD_ID = 'greener-pastures';
const world = () => getWorld(WORLD_ID);
const route = async () => (await import('../worlds/greenerPastures.mjs')).GREENER_ROUTE;

test('the authored chase gives every event physical distance and a stable named route position', async () => {
  const { chaseWaypoints, waypointById, routeDistances, totalChaseDistance, bridge, finalStand, entrance } = await route();
  assert.deepEqual(chaseWaypoints.map(point => point.id), ['meeting', 'escape', 'cart-gap', 'wall-gap-west', 'wall-gap-east', 'byre-lane', 'jump-approach', 'jump-takeoff', 'jump-landing', 'jump-exit', 'orchard-gap', 'fireball', 'tattle-reveal', 'sheepfold', 'dead-end-approach', 'dead-end-takeoff', 'dead-end-landing', 'dead-end-exit', 'mill-lane-entry', 'mill-lane-exit', 'bridge-approach', 'bridge-takeoff', 'bridge-landing', 'far-bank', 'counterfire', 'complaint-approach', 'pride', 'final']);
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
  assert.ok(sign.size[0] >= 12 && sign.size[1] >= 1.5);
  const target = [sign.center[0], sign.center[1], sign.center[2]];
  const origin = [landmarks.complaintApproach.x, 1.64, landmarks.complaintApproach.z];
  const direction = target.map((value, i) => value - origin[i]);
  const hit = findSwordWorldHit(origin, direction, Math.hypot(...direction) + 0.1, world().solids);
  assert.equal(hit?.box.id, sign.id, 'the approaching player has an unobstructed sign sightline');
});

function simulate(start, seconds, { dash = false, jump = false, sprint = false, dashWhileFalling = false, sprintBlend = sprint ? 1 : 0, hz = 60, yaw = 0 } = {}) {
  let state = createMovementState(start);
  state.sprinting = sprint;
  state.sprintBlend = sprintBlend;
  let didDash = dash;
  if (dash) assert.equal(tryStartDash(state, { x: -Math.sin(yaw), z: -Math.cos(yaw) }, 0), true);
  let lowest = start.y;
  for (let i = 0; i < seconds * hz; i += 1) {
    if (dashWhileFalling && !didDash && !state.grounded && state.velocity.y < 0) {
      assert.equal(tryStartDash(state, { x: -Math.sin(yaw), z: -Math.cos(yaw) }, i / hz), true);
      didDash = true;
    }
    state = movePlayer(state, { forward: 1, right: 0, jump: jump && i === 0, yaw }, 1 / hz, i / hz, world());
    lowest = Math.min(lowest, state.position.y);
  }
  return { state, lowest, didDash };
}

test('Greener Pastures is a registered tutorial world and stays outside arena voting', () => {
  assert.equal(WORLD_IDS.GREENER_PASTURES, WORLD_ID);
  assert.equal(world().name, 'Greener Pastures');
  assert.equal(world().tutorialOnly, true);
  assert.equal(ARENAS.includes(WORLD_ID), false);
  assert.equal(VOTE_OPTIONS.world.includes(WORLD_ID), false);
  assert.equal(arenaOrDefault(WORLD_ID), 'castleward');
});

test('the opening keeps Rival in sight 225 metres off, but the way to him is a slalom of over 430 metres', async () => {
  const { playerSpawn, rivalMeeting, openingPath } = await route();
  assert.equal(Math.hypot(playerSpawn.x - rivalMeeting.x, playerSpawn.z - rivalMeeting.z), 225);
  // seen the whole way, over the low walls and rail fences...
  const origin = [playerSpawn.x, playerSpawn.y + 1.3, playerSpawn.z];
  const direction = [rivalMeeting.x - playerSpawn.x, 0, rivalMeeting.z - playerSpawn.z];
  assert.equal(findSwordWorldHit(origin, direction, 225, world().solids), null);
  // ...but not reached straight: three staggered field boundaries each leave one gateway, east, west, east
  assert.equal(runClear(world(), playerSpawn, rivalMeeting), false);
  assert.deepEqual(openingPath.map(point => point.id), ['opening', 'opening-gate-a', 'opening-gate-b', 'opening-gate-c', 'meeting']);
  for (let i = 1; i < openingPath.length; i += 1) assert.equal(runClear(world(), openingPath[i - 1], openingPath[i]), true, openingPath[i].id);
  // the shortest legal way hugs each gateway's inner post: two full Sprints, each walked off to full stamina, cover
  // about 365 metres (after the walk before Sprint is taught) and still leave well over 50 metres to go
  const posts = world().solids.filter(solid => solid.kind === 'gatepost');
  const inner = openingPath.slice(1, -1).map(gate => {
    const post = posts.filter(solid => solid.center[2] === gate.z).sort((a, b) => Math.abs(a.center[0]) - Math.abs(b.center[0]))[0];
    return { x: post.center[0] + Math.sign(post.center[0]) * (post.size[0] / 2 + 0.45), z: gate.z };
  });
  const way = [playerSpawn, ...inner, rivalMeeting];
  const shortest = way.slice(1).reduce((sum, point, i) => sum + Math.hypot(point.x - way[i].x, point.z - way[i].z), 0);
  // (a lower bound: the carts, troughs and hay about the lanes only lengthen it)
  assert.ok(shortest > 430, `shortest legal way ${shortest.toFixed(1)} m`);
  // and a straight run toward him is stopped by the first boundary, on the ground
  const stopped = simulate(playerSpawn, 225 / MOVEMENT.runSpeed);
  assert.ok(stopped.state.position.z > 160);
  assert.equal(stopped.state.grounded, true);
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

test('the ordinary Jump lesson is a physical stile before the Fireball lane', async () => {
  const { jump, waypointById, checkpointPositions, routeDistances } = await route();
  assert.equal(waypointById['jump-takeoff'], jump.takeoff);
  assert.equal(waypointById['jump-landing'], jump.landing);
  assert.equal(waypointById['jump-exit'], jump.waitPoint);
  assert.equal(checkpointPositions.jump, waypointById['jump-approach']);
  assert.ok(routeDistances['jump-exit'] < routeDistances.fireball);
  assert.equal(runClear(world(), jump.takeoff, jump.landing), false);
  const obstacle = world().solids.find(solid => solid.id === 'orchard-stile');
  assert.deepEqual(jump.obstacleBounds, {
    minX: obstacle.center[0] - obstacle.size[0] / 2,
    maxX: obstacle.center[0] + obstacle.size[0] / 2,
    minZ: obstacle.center[2] - obstacle.size[2] / 2,
    maxZ: obstacle.center[2] + obstacle.size[2] / 2,
    minY: 0, maxY: obstacle.size[1],
  });
  for (const hz of [30, 60, 120]) {
    const walked = simulate(jump.takeoff, 1.4, { hz });
    assert.ok(walked.state.position.z > jump.obstacleBounds.maxZ, `the stile stops running at ${hz} Hz`);
    const jumped = simulate(jump.takeoff, 1.4, { jump: true, hz });
    assert.equal(jumped.state.grounded, true);
    assert.equal(jumped.state.position.y, 0);
    assert.ok(jumped.state.position.z < jump.landing.z, `ordinary Jump lands past the stile at ${hz} Hz`);
  }
});

test('the broken bridge has a serious floor gap and a raised takeoff reached by an ordinary ramp', async () => {
  const { bridge, waypointById } = await route();
  assert.equal(bridge.gapBounds.maxZ - bridge.gapBounds.minZ, 12.5);
  assert.equal(bridge.dashStart.y, 2);
  assert.equal(bridge.dashLanding.y, 0);
  assert.equal(runClear(world(), waypointById['bridge-approach'], bridge.dashStart), true);
  for (const x of [bridge.centerX - 3, bridge.centerX, bridge.centerX + 3]) {
    for (let z = bridge.gapBounds.minZ + 0.1; z < bridge.gapBounds.maxZ; z += 0.2) {
      assert.equal(surfaceHeightAt(x, z, bridge.dashStart.y, world()), null, 'the broken span has no supporting floor');
      const position = { x, y: bridge.dashStart.y, z };
      assert.deepEqual(resolvePlayerWorld(position, MOVEMENT.playerRadius, world().solids), position, 'the gap has no invisible wall');
    }
  }
  assert.equal(runClear(world(), bridge.dashStart, bridge.dashLanding), false);
});

test('run, walkoff, Sprint Jump and the best edge Jump fall short of the span with ordinary mechanics', async () => {
  const { bridge } = await route();
  for (const hz of [30, 60, 120]) {
    for (const mode of [
      { name: 'run', start: bridge.dashStart },
      { name: 'walkoff', start: bridge.dashStart, sprint: true },
      { name: 'run Jump', start: bridge.dashStart, jump: true },
      { name: 'Sprint Jump', start: bridge.dashStart, jump: true, sprint: true },
      { name: 'Sprint edge Jump', start: { ...bridge.dashStart, z: bridge.gapBounds.maxZ + 0.01 }, jump: true, sprint: true },
      { name: 'walkoff Dash', start: bridge.dashStart, sprint: true, dashWhileFalling: true },
    ]) {
      const { state, lowest } = simulate(mode.start, 1.4, { ...mode, hz });
      assert.ok(lowest < -1, `${mode.name} falls into the ravine at ${hz} Hz`);
      assert.equal(state.grounded, false, `${mode.name} fails to land at ${hz} Hz`);
    }
  }
});

test('a real Jump then descending airborne Dash reaches the lower bank at every simulation rate', async () => {
  const { bridge } = await route();
  for (const hz of [30, 60, 120]) {
    const { state, lowest, didDash } = simulate(bridge.dashStart, 1.05, { jump: true, sprint: true, dashWhileFalling: true, hz });
    assert.equal(didDash, true);
    assert.ok(state.position.z < bridge.gapBounds.minZ - 0.2, `airborne Dash reaches the far deck at ${hz} Hz`);
    assert.ok(lowest >= 0, `the Dash reaches supporting ground at ${hz} Hz`);
    assert.equal(state.grounded, true);
    assert.ok(state.dashReadyAt >= MOVEMENT.dashCooldown);
    const ready = state.dashReadyAt;
    assert.equal(tryStartDash(state, { x: 0, z: -1 }, ready - .01), false);
    assert.equal(tryStartDash(state, { x: 0, z: -1 }, ready), true);
    const fromRun = simulate({ ...bridge.dashStart, z: bridge.dashStart.z + 1 }, 1.1,
      { jump: true, sprint: true, sprintBlend: 0, dashWhileFalling: true, hz });
    assert.equal(fromRun.state.grounded, true, `Sprint buildup and an early Jump still land at ${hz} Hz`);
    assert.ok(fromRun.state.position.z < bridge.gapBounds.minZ);
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

test('the intact western footbridge is a substantial detour traversed by real running', async () => {
  const { bridge } = await route();
  const crossing = bridge.alternateFootbridge;
  assert.equal(runClear(world(), crossing.north, crossing.south), true);
  const targets = [
    { x: 32, y: 0, z: bridge.ravineBounds.maxZ+24 }, { x: -30, y: 0, z: bridge.ravineBounds.maxZ+24 },
    { x: -68, y: 0, z: bridge.ravineBounds.maxZ+10 }, crossing.north, crossing.crossing, crossing.south,
    { x: -68, y: 0, z: bridge.ravineBounds.minZ-10 }, { x: -30, y: 0, z: bridge.ravineBounds.minZ-22 },
    { x: 32, y: 0, z: bridge.ravineBounds.minZ-22 }, bridge.dashLanding,
  ];
  for (const hz of [30, 60, 120]) {
    let state = createMovementState(bridge.dashStart);
    let elapsed = 0;
    for (const target of targets) {
      while (Math.hypot(target.x - state.position.x, target.z - state.position.z) > 0.01) {
        const distance = Math.hypot(target.x - state.position.x, target.z - state.position.z);
        const yaw = Math.atan2(state.position.x - target.x, state.position.z - target.z);
        state = movePlayer(state, { forward: Math.min(1, distance / (MOVEMENT.runSpeed / hz)), yaw }, 1 / hz, elapsed, world());
        elapsed += 1 / hz;
        assert.ok(state.position.y >= 0, `the western detour stays on physical ground at ${hz} Hz`);
        assert.ok(elapsed < 45, `the real footbridge detour reaches the far bank at ${hz} Hz`);
      }
    }
    assert.equal(state.grounded, true);
    assert.equal(state.position.y, bridge.dashLanding.y);
    assert.ok(elapsed > 30, 'the intact crossing costs substantial travel time');
  }
});

test('the chase waypoints are runnable on either side and the final clearing has space to evade', async () => {
  const { chaseWaypoints, finalStand, bridge } = await route();
  for (let i = 1; i < chaseWaypoints.length; i += 1) {
    const from = chaseWaypoints[i - 1];
    const to = chaseWaypoints[i];
    if ((from.id === 'bridge-takeoff' && to.id === 'bridge-landing') || (from.id.endsWith('takeoff') && to.id.endsWith('landing'))) continue;
    // (the mill lane is jumped through: its own test below)
    if (from.id === 'mill-lane-entry' && to.id === 'mill-lane-exit') continue;
    assert.equal(runClear(world(), from, to), true, `${from.id} to ${to.id}`);
  }
  assert.ok(chaseWaypoints.some((point) => point.x === bridge.centerX));
  for (const [dx, dz] of [[-12, 0], [12, 0], [0, -12], [0, 12]]) {
    assert.equal(runClear(world(), finalStand, { ...finalStand, x: finalStand.x + dx, z: finalStand.z + dz }), true);
  }
});

test('ordinary locomotion traverses the full chase through the real Jump and airborne Dash obstacles', async () => {
  const { chaseWaypoints, bridge, totalChaseDistance, finalStand } = await route();
  for (const hz of [30, 60, 120]) {
    const dt = 1 / hz;
    let state = createMovementState(chaseWaypoints[0]);
    let elapsed = 0;
    let ticks = 0;
    for (const target of chaseWaypoints.slice(1)) {
      if (target.id === 'jump-landing' || target.id === 'dead-end-landing' || target.id === 'bridge-landing') {
        const isBridge = target.id === 'bridge-landing';
        const crossed = simulate(state.position, isBridge ? 1.05 : 1.1,
          { jump: true, sprint: isBridge, dashWhileFalling: isBridge, hz });
        state = crossed.state;
        elapsed += isBridge ? 1.05 : 1.1;
        ticks += Math.ceil((isBridge ? 1.05 : 1.1) * hz);
        assert.ok(state.position.z < target.z);
        assert.equal(state.grounded, true);
        if (isBridge) assert.ok(state.position.z < bridge.gapBounds.minZ);
        continue;
      }
      if (target.id === 'mill-lane-exit') {
        // through the lane on its line: a Jump at each thing in the way, a Sprint-Jump over the brook, never in it
        const mind = {};
        for (let step = millLaneStep(state, mind); !step.done; step = millLaneStep(state, mind)) {
          // (Sprint as the room's step resolves it: wanted, and stamina enough)
          state.sprinting = step.sprint;
          state = movePlayer(state, step, dt, elapsed, world());
          elapsed += dt; ticks += 1;
          assert.ok(state.position.y > -0.2, `the mill lane is crossed without a fall into the brook at ${hz} Hz`);
          assert.ok(elapsed < 600, 'the lane is got through');
        }
        assert.equal(mind.retry ?? false, false);
      }
      for (;;) {
        const distance = Math.hypot(target.x - state.position.x, target.z - state.position.z);
        if (distance < 0.01) break;
        const yaw = Math.atan2(state.position.x - target.x, state.position.z - target.z);
        state = movePlayer(state, { forward: Math.min(1, distance / (MOVEMENT.runSpeed * dt)), yaw }, dt, elapsed, world());
        elapsed += dt;
        ticks += 1;
        assert.ok(state.position.y > -0.2, `${target.id} stays on real ground at ${hz} Hz`);
        assert.ok(ticks < (totalChaseDistance / MOVEMENT.runSpeed + 8) * hz, `authored chase can be completed at ${hz} Hz`);
      }
    }
    assert.ok(Math.hypot(state.position.x - finalStand.x, state.position.z - finalStand.z) < 0.02);
    assert.equal(state.grounded, true);
    assert.ok(elapsed < totalChaseDistance / MOVEMENT.runSpeed + 5);
  }
});

test('the prepared navigation graph exactly matches physics and rejects stale geometry',async()=>{
  const {navigationSignature}=await import('../worlds/navigationSignature.mjs');
  const base=world();assert.equal(base.navigation.precomputed.signature,navigationSignature(base));
  const prepared=navGraph({...base}),calculated=navGraph({...base,navigation:{nodes:base.navigation.nodes}});
  assert.deepEqual(prepared.links,calculated.links);
  const changed={...base,solids:[...base.solids,{id:'changed-wall',center:[12,1,-54],size:[20,2,1]}]};
  assert.notEqual(navigationSignature(changed),base.navigation.precomputed.signature);
  const fallback=navGraph(changed),expected=navGraph({...changed,navigation:{nodes:changed.navigation.nodes}});
  assert.deepEqual(fallback.links,expected.links);
});

test('the reused Jump has a genuine low wall and an ordinary side gate',async()=>{
  const {jumpReuse}=await route();
  assert.equal(runClear(world(),jumpReuse.takeoff,jumpReuse.landing),false);
  const cleared=simulate(jumpReuse.takeoff,1.1,{jump:true});assert.ok(cleared.state.position.z<jumpReuse.landing.z);
  const around=[jumpReuse.approach,{x:26,y:0,z:-514},{x:26,y:0,z:-526},jumpReuse.exit];
  for(let i=1;i<around.length;i++)assert.equal(runClear(world(),around[i-1],around[i]),true);
});

test('the mill lane wants its jumps: walked, it stops at the trunk; the fence only from the wain; the brook a Sprint-Jump', async () => {
  const { millLane: lane } = await route();
  const hz = 60, dt = 1 / hz;
  const run = (from, ticks, input) => {
    let state = createMovementState(from);
    for (let i = 0; i < ticks; i += 1) { state.sprinting = Boolean(input(state).sprint); state = movePlayer(state, input(state), dt, i * dt, world()); }
    return state;
  };
  // walked (no Jump), the felled trunk stops the Spellblade where it lies
  const walked = run({ x: lane.centerX, y: 0, z: lane.entryZ - 1 }, hz * 3, () => ({ forward: 1, yaw: 0 }));
  assert.ok(walked.position.z > lane.log.maxZ, 'stopped at the trunk');
  // beside the wain, a Jump from the ground does not clear the fence
  const fenced = run({ x: lane.minX + 2, y: 0, z: lane.fence.maxZ + 3 }, hz * 2, (s) => ({ forward: 1, yaw: 0, jump: s.grounded }));
  assert.ok(fenced.position.z > lane.fence.minZ, 'the fence is too tall to be jumped from the ground');
  // a running Jump at the brook's very lip falls short: into the brook, and out again only by the ford
  const lip = { x: lane.centerX, y: 0, z: lane.brook.maxZ + 6 };
  const short = run(lip, hz * 2, (s) => ({ forward: 1, yaw: 0, jump: s.grounded && s.position.z <= lane.brook.maxZ + 0.15 && s.position.y > -0.1 }));
  assert.equal(short.position.y, lane.brook.bed, 'a running Jump lands in the brook');
  let wading = short;
  const mind = {};
  for (let i = 0; i < hz * 20 && wading.position.y < -0.01; i += 1) { const step = millLaneStep(wading, mind); wading.sprinting = false; wading = movePlayer(wading, step, dt, i * dt, world()); }
  assert.equal(wading.position.y, 0);
  assert.ok(wading.position.z > lane.brook.maxZ, 'the ford comes up on the near bank');
  // a Sprint-Jump from the same lip clears it
  const cleared = run(lip, hz * 2, (s) => ({ forward: 1, yaw: 0, sprint: true, jump: s.grounded && s.position.z <= lane.brook.maxZ + 0.6 && s.position.z > lane.brook.maxZ - 1 }));
  assert.ok(cleared.position.z < lane.brook.minZ && cleared.position.y === 0, 'a Sprint-Jump carries over the brook');
  // and the long way round, at a run, through the wall's open western end
  const gap = (lane.wall.gapMinX + lane.wall.gapMaxX) / 2;
  assert.equal(runClear(world(), { x: gap, y: 0, z: lane.wall.z + 8 }, { x: gap, y: 0, z: lane.wall.z - 8 }), true);
  assert.equal(runClear(world(), { x: lane.centerX, y: 0, z: lane.wall.z + 4 }, { x: lane.centerX, y: 0, z: lane.exitZ - 4 }), false);
});
