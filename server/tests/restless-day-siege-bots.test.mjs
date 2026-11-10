// Restless Day's siege bots: who carries which ladder where, decided afresh as the siege turns; a ladder carried only
// where it physically fits; no loops once both curtains have fallen; and nothing asked of the human.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { GAME_MODES } from '../../shared/src/modes.mjs';
import { WORLD_IDS, getWorld } from '../../shared/worlds/registry.mjs';
import { TEAMS } from '../../shared/src/teams.mjs';
import { applyRoomCommand } from '../../shared/sim/wire.mjs';
import { stepRoom } from '../../shared/sim/combat.mjs';
import { stepBotControllers } from '../../shared/sim/BotController.mjs';
import { damageStructure } from '../../shared/sim/structures.mjs';
import { withRestlessLadders, constrainRestlessCarry, restlessnessStep, RESTLESS_DAY_RULES } from '../../shared/sim/restlessDayMode.mjs';
import { coordinateSiege, siegeTasks, siegeBotGoal, carryRoute, zoneOf, siegeState } from '../../shared/sim/restlessDaySiege.mjs';
import { createMovementState } from '../../shared/src/movement.mjs';
import { surfaceHeightAt } from '../../shared/src/collision.mjs';

const world = getWorld(WORLD_IDS.RESTLESS_DAY);

function match(start = 10) {
  const room = new Room('SIEGEB', { isPrivate: true, mode: GAME_MODES.RESTLESS_DAY, worldId: WORLD_IDS.RESTLESS_DAY });
  const human = room.addPlayer({ id: 'human-a', token: 'tok-a', name: 'Attacker', team: TEAMS.ATTACKERS }, start - 1);
  room.provisionModeActors(start - 1);
  room.startMatch(start);
  return { room, human, bots: [...room.players.values()].filter((p) => p.actorKind === 'bot' && p.team === TEAMS.ATTACKERS) };
}
const assignments = (room) => [...siegeState(room).assign.values()];
function run(room, from, seconds, each = () => {}) {
  let seed = 11;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const events = [];
  for (let i = 0; i < seconds * 30; i++) {
    const now = from + i / 30;
    each(now, i);
    stepBotControllers(room, now, room.world, { random });
    stepRoom(room, 1 / 30, now, room.world);
    events.push(...room.events.splice(0));
  }
  return events;
}

test('both ladders go to two different bots and two different landings; the human is never a carrier', () => {
  const { room, human } = match();
  coordinateSiege(room, 11);
  const a = assignments(room);
  assert.equal(a.length, 2);
  assert.notEqual(a[0].botId, a[1].botId);
  assert.ok(a.every((x) => x.botId !== human.id && room.players.get(x.botId).actorKind === 'bot'));
  assert.ok(Math.abs(a[0].landingX - a[1].landingX) > 3);
});

test('once both curtains have fallen nobody collects a ladder: no drop and re-pick, across deaths and respawns', () => {
  const { room, bots } = match();
  const [l] = room.restlessDay.ladders;
  const carrier = bots[0];
  carrier.position = { x: l.position.x, y: 0, z: l.position.z };
  assert.equal(applyRoomCommand(room, carrier, { type: 'siegeOperate' }, 11).rejected, undefined);
  room.restlessDay.phase = 2;
  room.events.length = 0;
  const events = run(room, 12, 12, (now, i) => {
    if (i === 120) { carrier.alive = false; carrier.respawnAt = now + 1; }   // dies and comes back mid-way
  });
  assert.equal(events.filter((e) => e.type === 'restlessLadderDropped').length, 1, 'dropped once');
  assert.equal(events.filter((e) => e.type === 'restlessLadderPicked').length, 0, 'never picked up again');
  assert.equal(assignments(room).length, 0);
  assert.deepEqual(siegeTasks(room), []);
  // and a human cannot shoulder one either
  const human = room.players.get('human-a');
  human.position = { ...room.restlessDay.ladders[0].position };
  assert.match(String(applyRoomCommand(room, human, { type: 'siegeOperate' }, 30).rejected), /done their work/);
});

test('a carrier killed on the way is replaced by another bot, and the ladder still reaches a landing', () => {
  const { room, bots } = match();
  let killed = null;
  const events = run(room, 11, 45, (now) => {
    const c = bots.find((b) => b.restlessCarrying);
    if (!killed && c && c.position.z > -55) { killed = c.id; c.health = 0; c.alive = false; c.respawnAt = now + 5; }
  });
  assert.ok(killed, 'a carrier was on the road');
  const picks = events.filter((e) => e.type === 'restlessLadderPicked');
  assert.ok(picks.some((e) => e.playerId !== killed), 'another bot took the dropped ladder up');
  assert.ok(events.some((e) => e.type === 'restlessLadderPlaced'), 'and a ladder was set up');
});

test('a ladder the human carries is left to the human; one he drops by leaving is taken up by a bot', () => {
  const { room, human } = match();
  const [l] = room.restlessDay.ladders;
  human.position = { x: l.position.x, y: 0, z: l.position.z };
  assert.equal(applyRoomCommand(room, human, { type: 'siegeOperate' }, 11).rejected, undefined);
  coordinateSiege(room, 11.5);
  assert.ok(!assignments(room).some((a) => a.ladderId === l.id), 'no bot sent for the ladder on the human shoulder');
  // the human disconnects: the ladder goes down, and the coordinator gives it to a bot
  human.connected = false;
  restlessnessStep(room, 1 / 30, 12);
  assert.equal(l.state, 'available');
  coordinateSiege(room, 12.6);
  assert.ok(assignments(room).some((a) => a.ladderId === l.id && room.players.get(a.botId).actorKind === 'bot'));
});

test('a broken gate makes that curtain\'s ladders unnecessary', () => {
  const { room, human } = match();
  assert.equal(siegeTasks(room).length, 2);
  assert.ok(damageStructure(room, 'outer-gate', 99999, human.id, 'so-fist-ication', 11));
  assert.deepEqual(siegeTasks(room), []);
  // and the attackers' way is through the gateway
  const goal = siegeBotGoal(room, room.players.get([...room.players.keys()].find((k) => k.startsWith('bot-att'))));
  assert.ok(goal.z > -24 && Math.abs(goal.x) < 3);
});

test('after the outer curtain falls, the last ladder over it stays while knights are still outside', () => {
  const { room, bots } = match();
  const [a, b] = room.restlessDay.ladders;
  Object.assign(a, { state: 'deployed', wall: 0, position: { x: -8, y: 0, z: -31 } });
  Object.assign(b, { state: 'broken', respawnAt: 99 });
  room.restlessDay.phase = 1;
  bots[0].position = { x: 0, y: 0, z: -50 };          // still in the field
  bots[1].position = { x: 0, y: 0, z: -5 };
  assert.deepEqual(siegeTasks(room).map((t) => t.ladder.id), [], 'the passage ladder is kept');
  for (const p of room.players.values()) if (p.team === TEAMS.ATTACKERS) p.position = { x: 0, y: 0, z: -5 };   // everyone inside now
  assert.deepEqual(siegeTasks(room).map((t) => [t.ladder.id, t.wall]), [[a.id, 1]], 'it moves to the inner curtain');
});

test('defenders contest the exit of a deployed ladder, flanking it without walling it off', () => {
  for (const x of [8, -6, 4.6]) {   // a ladder mid-landing, and two near a landing's hoarding post
    const { room } = match();
    const [a] = room.restlessDay.ladders;
    Object.assign(a, { state: 'deployed', wall: 0, position: { x, y: 0, z: -31 } });
    const defenders = [...room.players.values()].filter((p) => p.team === TEAMS.DEFENDERS && zoneOf(p.position) === 1);
    const guards = defenders.map((d) => siegeBotGoal(room, d)).filter((g) => g.y === 6 && Math.abs(g.x - x) < 3.2);
    assert.ok(guards.length >= 2, JSON.stringify(guards));
    // each guard leaves the climber room to step off (body radii 0.45 each), and stands inside the landing's posts
    const [lo, hi] = [[4.4, 11.6], [-11.6, -4.4]].find(([p, q]) => x >= p - 0.5 && x <= q + 0.5);
    for (const g of guards) {
      assert.ok(Math.abs(g.x - x) >= 1.35, `guard at ${g.x} blocks the ladder at ${x}`);
      assert.ok(g.x >= lo + 0.69 && g.x <= hi - 0.69, `guard at ${g.x} outside the landing`);
    }
  }
});

test('the ladder slows its carrier on the server as it does in the client\'s prediction', () => {
  const { room, bots } = match();
  const [l] = room.restlessDay.ladders;
  bots[0].position = { x: l.position.x, y: 0, z: l.position.z };
  applyRoomCommand(room, bots[0], { type: 'siegeOperate' }, 11);
  stepRoom(room, 1 / 30, 11.1, room.world);
  assert.equal(bots[0].speedScale, RESTLESS_DAY_RULES.carrySpeed);
});

test('a carrier whose ladder catches something in mid-air keeps falling: nobody hangs from his own ladder', () => {
  // a carrier dropping past the outer curtain's face with the ladder pointing into it
  const from = { x: 6, y: 3, z: -26.4 };
  const state = { ...createMovementState({ x: 6, y: 2.7, z: -26.0 }), restlessCarrying: 'ladder-a' };
  const verdict = constrainRestlessCarry(state, from, world, Math.PI);
  assert.notEqual(verdict, false);
  assert.equal(state.position.y, 2.7, 'height is the body\'s own');
  assert.equal(state.position.z, from.z, 'only the step across the ground is undone');
});

test('the carry planner takes a ladder to every landing, and from the outer walk down into the bailey, never off a walk', () => {
  for (const x of [-15.5, -8, 8, 17.5]) {
    const route = carryRoute(world, { x: 10, y: 0, z: -68 }, Math.PI, { x, y: 0, z: -31 });
    assert.ok(route, `no carry route to the outer landing at ${x}`);
  }
  // a ladder retrieved from the outer walk (its top at x 8) goes down a stair to the inner landings
  const composed = withRestlessLadders(world, { ladders: [{ id: 'l', state: 'deployed', wall: 0, position: { x: 8, y: 0, z: -31 } }] });
  for (const x of [-8, 8]) {
    const route = carryRoute(composed, { x: 8, y: 6, z: -24 }, -Math.PI / 2, { x, y: 0, z: 14 });
    assert.ok(route, `no carry route from the outer walk to the inner landing at ${x}`);
    let at = { x: 8, y: 6, z: -24 };
    for (const p of route) {
      // every leg keeps ground underfoot: no step off the walk
      for (let t = 0.1; t <= 1; t += 0.1) {
        const q = { x: at.x + (p.x - at.x) * t, z: at.z + (p.z - at.z) * t };
        assert.notEqual(surfaceHeightAt(q.x, q.z, 7, composed), null);
      }
      at = p;
    }
  }
});
