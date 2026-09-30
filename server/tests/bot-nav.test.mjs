import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { stepBotControllers } from '../../shared/sim/BotController.mjs';
import { stepRoom } from '../../shared/sim/combat.mjs';
import { navGraph, routeBetween, runClear } from '../../shared/sim/botNav.mjs';
import { getWorld, WORLD_IDS } from '../../shared/worlds/registry.mjs';

// How bots find their way (shared/sim/botNav.mjs), and the contract every world keeps for it: waypoints all joined up,
// every spawn on the way, and a knight who spawns standing clear of anything solid, on ground.

const TICK = 1 / 30;
const WORLDS = Object.values(WORLD_IDS).map(getWorld);

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

for (const world of WORLDS) {
  test(`${world.id}: every spawn stands clear of anything solid, on ground`, () => {
    for (const spawn of world.spawnPoints) {
      for (const solid of world.solids) {
        const [cx, cy, cz] = solid.center;
        const [sx, sy, sz] = solid.size;
        const overlapsHeight = spawn.y + 0.1 < cy + sy / 2 && spawn.y + 1.8 > cy - sy / 2;
        const nearX = Math.max(Math.abs(spawn.x - cx) - sx / 2, 0);
        const nearZ = Math.max(Math.abs(spawn.z - cz) - sz / 2, 0);
        assert.ok(!overlapsHeight || Math.hypot(nearX, nearZ) >= 0.5,
          `spawn (${spawn.x}, ${spawn.y}, ${spawn.z}) is inside or against ${solid.id}`);
      }
      assert.ok(runClear(world, spawn, { ...spawn, x: spawn.x + 0.01 }), `spawn (${spawn.x}, ${spawn.z}) has ground`);
    }
  });

  if (!world.navigation) continue;

  test(`${world.id}: the waypoints are all joined up, and every spawn can reach one straight`, () => {
    const graph = navGraph(world);
    const seen = new Set([0]);
    const queue = [0];
    while (queue.length) {
      for (const { to } of graph.links[queue.shift()]) if (!seen.has(to)) { seen.add(to); queue.push(to); }
    }
    const cut = graph.nodes.filter((_, i) => !seen.has(i)).map((node) => node.id);
    assert.deepEqual(cut, [], 'waypoints cut off from the rest');
    for (const spawn of world.spawnPoints) {
      assert.ok(graph.nodes.some((node) => runClear(world, spawn, node)), `spawn (${spawn.x}, ${spawn.z}) is off the way`);
      for (const other of world.spawnPoints) {
        assert.ok(runClear(world, spawn, other) || routeBetween(world, spawn, other),
          `no way from (${spawn.x}, ${spawn.z}) to (${other.x}, ${other.z})`);
      }
    }
  });
}

// a Bot Duel with the bot at `from` and its foe standing still at `to`; how near the bot got, and when
function chase(from, to, seconds = 12) {
  const manager = new RoomManager({ random: lcg(7) });
  const room = manager.createSoloRoom('BOT_DUEL', 0);
  const human = room.addPlayer({ id: 'human', token: 'token', name: 'Aden' }, 0);
  room.provisionModeActors(0);
  room.setArenaReady(human.id, true, 0);
  room.tick(3.1);
  const bot = [...room.players.values()].find((p) => p.actorKind === 'bot');
  human.connected = true;
  Object.assign(human.position, to);
  Object.assign(bot.position, from);
  const random = lcg(3);
  for (let now = 4; now < 4 + seconds; now += TICK) {
    human.health = 100;
    human.input = { forward: 0, right: 0, jump: false, yaw: 0, pitch: 0 };
    stepBotControllers(room, now, room.world, { random });
    stepRoom(room, TICK, now, room.world).splice(0);
    const apart = Math.hypot(bot.position.x - human.position.x, bot.position.z - human.position.z);
    if (apart < 3 && Math.abs(bot.position.y - human.position.y) < 1) return { reached: now - 4, bot };
  }
  return { reached: null, bot };
}

test('a bot in the tourney field\'s corner finds the gate and comes round the bank to its foe', () => {
  const { reached, bot } = chase({ x: 5.8, y: 0, z: -20.9 }, { x: -6, y: 0, z: -4.5 });
  assert.ok(reached !== null, `stuck at (${bot.position.x.toFixed(1)}, ${bot.position.z.toFixed(1)})`);
  assert.ok(reached < 9, `took ${reached.toFixed(1)} s`);
});

test('a bot on the green finds the ramp and the stair to a foe up on the wall walk', () => {
  const { reached, bot } = chase({ x: -6, y: 0, z: -4.5 }, { x: -7.4, y: 4, z: 23.5 });
  assert.ok(reached !== null, `stuck at (${bot.position.x.toFixed(1)}, ${bot.position.y.toFixed(1)}, ${bot.position.z.toFixed(1)})`);
});

test('round something small it steps aside, not off round the waypoints', () => {
  const manager = new RoomManager({ random: lcg(7) });
  const room = manager.createSoloRoom('BOT_DUEL', 0);
  const human = room.addPlayer({ id: 'human', token: 'token', name: 'Aden' }, 0);
  room.provisionModeActors(0);
  room.setArenaReady(human.id, true, 0);
  room.tick(3.1);
  const bot = [...room.players.values()].find((p) => p.actorKind === 'bot');
  // the market well stands between them
  Object.assign(bot.position, { x: -2.8, y: 0, z: 2.5 });
  Object.assign(human.position, { x: -2.8, y: 0, z: -5 });
  stepBotControllers(room, 4, room.world, { random: () => 0.9 });
  assert.equal(bot.ai.route?.length, 1, 'one step aside');
  assert.equal(bot.ai.route[0].id, undefined, 'a step aside, not a waypoint');
  assert.ok(Math.hypot(bot.ai.route[0].x - bot.position.x, bot.ai.route[0].z - bot.position.z) <= 4.5);
});
