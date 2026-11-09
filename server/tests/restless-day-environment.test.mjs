// Restless Day's environment, held to the game's own collision, movement, bots, machines and blades: no way out of
// the world, no way round a curtain, the siege kit's lanes open, ladders up only at the landings, bots routed from
// the muster to the dais, and the Rightful Renowner struck by real swings from every side of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { GAME_MODES } from '../../shared/src/modes.mjs';
import { WORLD_IDS, getWorld } from '../../shared/worlds/registry.mjs';
import { RESTLESS_LANDINGS } from '../../shared/worlds/restlessDay.mjs';
import { TEAMS } from '../../shared/src/teams.mjs';
import { applyRoomCommand } from '../../shared/sim/wire.mjs';
import { withRestlessLadders } from '../../shared/sim/restlessDayMode.mjs';
import { routeBetween, navGraph } from '../../shared/sim/botNav.mjs';
import { beginAttack, endAttack, stepRoom } from '../../shared/sim/combat.mjs';
import { createSoFistication, mountSoFistication, stepSoFistication, soFistEntry } from '../../shared/sim/soFistication.mjs';
import { createMovementState, movePlayer } from '../../shared/src/movement.mjs';
import { createBiByeLlista, mountBiByeLlista, stepBiByeLlista } from '../../shared/sim/biByeLlista.mjs';
import { floodWorld } from '../../scripts/world-audit.mjs';

const world = getWorld(WORLD_IDS.RESTLESS_DAY);

function match(start = 10) {
  const room = new Room('RDENV', { isPrivate: true, mode: GAME_MODES.RESTLESS_DAY, worldId: WORLD_IDS.RESTLESS_DAY });
  const attacker = room.addPlayer({ id: 'human-a', token: 'tok-a', name: 'Attacker', team: TEAMS.ATTACKERS }, start - 1);
  room.provisionModeActors(start - 1);
  room.startMatch(start);
  return { room, attacker };
}

test('no knight can run, crouch or hop out of Restless Day, and nothing is walked in under', () => {
  for (const height of [1.8, 1.2]) {
    const flood = floodWorld(world, { height });
    assert.deepEqual(flood.leaks, [], `${height} m body found a way into the void: ${JSON.stringify(flood.leaks.slice(0, 3))}`);
    assert.equal(flood.headClips.length, 0, 'a knight stands under a raised floor');
  }
});

test('neither curtain can be walked round: with the gates shut and no ladder up, the field is a closed pen', () => {
  const attackers = world.spawnPoints.filter((p) => p.team === TEAMS.ATTACKERS && p.phase === 0);
  const flood = floodWorld(world, { starts: attackers });
  const furthest = Math.max(...[...flood.cells.values()].map((c) => c.z));
  assert.ok(furthest < -25, `attackers on foot reached z ${furthest}`);
  // and from the bailey, the court is out of reach the same way
  const bailey = floodWorld(world, { starts: world.spawnPoints.filter((p) => p.team === TEAMS.ATTACKERS && p.phase === 1) });
  assert.ok(Math.max(...[...bailey.cells.values()].map((c) => c.z)) < 21, 'the inner curtain was walked round');
});

test('the siege kit keeps its lanes: nothing stands in the ram road, the ballista lane, the ladder lanes or the avenue', () => {
  const pad = 0.45;
  for (const [name, [x0, x1, z0, z1]] of Object.entries(world.lanes)) {
    const inLane = world.solids.filter((s) => {
      const h = s.size.map((v) => v / 2);
      return s.center[0] + h[0] > x0 - pad && s.center[0] - h[0] < x1 + pad && s.center[2] + h[2] > z0 && s.center[2] - h[2] < z1
        && s.center[1] - h[1] < 2.2;
    });
    assert.deepEqual(inLane.map((s) => s.id), [], `${name} lane obstructed`);
  }
});

test('SO-FIST-ICATION drives from its emplacement to the outer gate on its road', () => {
  const { room, attacker } = match();
  const e = world.siegeEmplacements[0];
  const b = room.soFistication ?? createSoFistication({ x: e.x, y: 0, z: e.z, heading: e.heading });
  room.soFistication = b;
  Object.assign(b, { x: e.x, z: e.z, heading: e.heading, speed: 0, operatorId: null });
  attacker.position = soFistEntry(b, room.world);
  assert.ok(mountSoFistication(room, b, attacker, 11), `a knight mounts the ram at its emplacement (state ${room.state}, phase ${room.objectiveState?.phase}, ram ${b.emplacementId})`);
  let t = 11;
  for (let i = 0; i < 60 * 25 && b.z < -29.4; i += 1) {
    // steer for the gate's middle (the carriage's forward is -sin, -cos of its heading)
    const want = Math.atan2(-(0 - b.x), -(-26 - b.z));
    let turn = want - b.heading;
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    attacker.input = { forward: 1, right: Math.max(-1, Math.min(1, -turn * 3)), yaw: b.heading, pitch: 0 };
    t += 1 / 60;
    stepSoFistication(room, b, 1 / 60, t, room.world);
  }
  assert.ok(b.z >= -29.4, `the ram stopped short at z ${b.z.toFixed(2)}`);
  assert.ok(Math.abs(b.x) < 2.2, `the ram reached the wall off the gate at x ${b.x.toFixed(2)}`);
});

test('the Bi-Bye-llista drives up its lane to a firing line and turns about in the muster', () => {
  const e = world.ballistaEmplacement;
  const drive = (input, seconds, b, p, room) => { p.input = { yaw: b.baseYaw, pitch: 0, ...input }; for (let i = 0; i < seconds * 30; i += 1) stepBiByeLlista(room, b, 1 / 30, (room.t += 1 / 30)); };
  const b = createBiByeLlista({ x: e.x, z: e.z, baseYaw: e.baseYaw });
  const p = { id: 'driver', alive: true, position: { x: b.x, y: b.y, z: b.z }, input: {} };
  const room = { world, players: new Map([[p.id, p]]), events: [], t: 0 };
  mountBiByeLlista(b, p);
  for (let s = 0; s < 20 && b.z < -45; s += 1) drive({ forward: 1 }, 1, b, p, room);
  assert.ok(b.z >= -45, `ballista stopped at z ${b.z.toFixed(1)} on its lane`);
  assert.ok(Math.abs(b.x - e.x) < 2.6, `ballista left its lane: x ${b.x.toFixed(1)}`);
  // back down to the muster and round: a full about-turn with no wall in reach
  const b2 = createBiByeLlista({ x: e.x, z: e.z, baseYaw: e.baseYaw });
  const p2 = { id: 'driver2', alive: true, position: { x: b2.x, y: b2.y, z: b2.z }, input: {} };
  const room2 = { world, players: new Map([[p2.id, p2]]), events: [], t: 0 };
  mountBiByeLlista(b2, p2);
  const start = b2.heading;
  drive({ forward: 1, right: 1 }, 14, b2, p2, room2);
  const turned = Math.abs(b2.heading - start); // (unwrapped: the carriage keeps turning)
  assert.ok(turned > 2 * Math.PI, `ballista turned only ${turned.toFixed(2)} rad in the muster`);
});

test('a ladder goes up only where the parapet is down, and every landing takes one', () => {
  const { room, attacker } = match();
  const ladder = room.restlessDay.ladders[0];
  const place = (x, wall) => {
    Object.assign(ladder, { state: 'available', holderId: null, wall: null, position: { x, y: 0, z: wall ? 14 : -31 } });
    room.restlessDay.phase = wall;
    attacker.restlessCarrying = null; attacker.speedScale = 1;
    attacker.position = { x, y: 0, z: wall ? 14 : -31 }; attacker.yaw = Math.PI;
    assert.equal(applyRoomCommand(room, attacker, { type: 'siegeOperate' }, 20).rejected, undefined, 'pick up');
    return applyRoomCommand(room, attacker, { type: 'siegeOperate' }, 21).rejected;
  };
  for (const wall of [0, 1]) {
    for (const [a, b] of RESTLESS_LANDINGS) {
      const mid = (a + b) / 2;
      assert.equal(place(mid, wall), undefined, `landing ${a}..${b} on wall ${wall} refused a ladder`);
      assert.equal(ladder.state, 'deployed');
    }
    for (const x of [-13.4, -2, 13.4]) assert.match(String(place(x, wall)), /lip|gate/, `parapet at x ${x} took a ladder`);
  }
});

test('a knight climbs each landing\'s ladder onto the walk and comes down its stair into the yard beyond', () => {
  for (const [wall, x] of [[0, -8], [0, 17.5], [1, 8], [1, -17.5]]) {
    const w = world.walls[wall];
    const composed = withRestlessLadders(world, { ladders: [{ id: 'l', state: 'deployed', wall, position: { x, y: 0, z: w.approachZ } }] });
    let s = { ...createMovementState({ x, y: 0, z: w.approachZ }), grounded: true };
    for (let i = 0; i < 90 && s.position.z < w.z - 0.5; i += 1) s = movePlayer(s, { forward: 1, yaw: Math.PI }, 1 / 30, i / 30, composed);
    assert.ok(Math.abs(s.position.y - w.height) < 0.05 && s.grounded, `wall ${wall} at x ${x}: stuck at ${JSON.stringify(s.position)}`);
    // then to the nearest stair head and down it
    const side = Math.sign(x);
    const route = routeBetween(composed, s.position, { x: side * 9, y: 0, z: wall ? 25.2 : -21.1 });
    assert.ok(route, `no way from the walk down to the yard at wall ${wall} x ${x}`);
  }
});

test('bots route from the muster to the dais as the siege opens the castle', () => {
  const L = (wall, x) => ({ id: `l${wall}${x}`, state: 'deployed', wall, position: { x, y: 0, z: wall ? 14 : -31 } });
  const muster = { x: 0, y: 0, z: -90 };
  assert.equal(routeBetween(world, muster, { x: 0, y: 0, z: -5 }), null, 'a closed castle has no way in');
  const outer = withRestlessLadders(world, { ladders: [L(0, -6)] });
  assert.ok(routeBetween(outer, muster, { x: 0, y: 0, z: -5 }), 'ladder on the outer curtain: muster to bailey');
  const inner = withRestlessLadders(world, { ladders: [L(1, 6)] });
  assert.ok(routeBetween(inner, { x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 45 }), 'ladder on the inner curtain: bailey to court');
  const open = { ...world, solids: world.solids.filter((s) => !['outer-gate', 'inner-gate'].includes(s.id)) };
  assert.ok(routeBetween(open, muster, { x: 0, y: 0.75, z: 50 }), 'both gates broken: muster to dais');
  // every waypoint is somewhere a knight can stand, and each joins the rest
  const graph = navGraph(open);
  assert.ok(graph.links.every((links) => links.length > 0), 'a waypoint with no way to it');
});

test('the Rightful Renowner takes real sword blows from every side of its dais', () => {
  for (const [x, z, yaw] of [[0, 52.9, Math.PI], [0, 59.1, 0], [-2.15, 56, -Math.PI / 2], [2.15, 56, Math.PI / 2]]) {
    const { room, attacker } = match();
    room.soFistication = null;
    const before = room.structures.entities['rightful-renowner'].health;
    attacker.position = { x, y: 1.1, z }; attacker.yaw = yaw;
    attacker.input = { yaw, pitch: 0.1, forward: 0, right: 0 }; attacker.spawnProtectionUntil = 0;
    for (const p of room.players.values()) if (p !== attacker) p.position = { ...p.position, x: p.position.x + 0, z: Math.min(p.position.z, 20) };
    assert.ok(beginAttack(room, attacker.id, 11), 'swing');
    endAttack(room, attacker.id, 11.1);
    for (let i = 1; i <= 60; i += 1) stepRoom(room, 1 / 60, 11 + i / 60);
    assert.ok(room.structures.entities['rightful-renowner'].health < before, `no blow landed from (${x}, ${z})`);
  }
});
