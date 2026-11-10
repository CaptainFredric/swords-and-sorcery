// Restless Day's siege, as the bots fight it: a small authoritative coordinator per room that decides which wall
// still matters, which ladders should be where, and which living attacking bot carries each one; a carry planner
// that routes a knight with a 5.4 m ladder on his shoulder only where the ladder itself fits (the same beam test the
// rules apply, swept along the whole way and through every turn, never off a supported edge); and the objectives
// each side's bots work toward. No bot is moved, no rule is bent: bots press the same inputs and the same interact
// a player does, and the coordinator only decides who does what.
//
// Attackers: gather -> secure a ladder -> carry it to a landing -> place -> climb -> through the bailey -> the next
// curtain -> the Rightful Renowner. A breached curtain (by ladder or broken gate) needs no more ladders; once both
// are breached no bot fetches a ladder again. A human is never needed: carriers are only ever bots, chosen afresh as
// bots die, respawn, stall or are needed elsewhere.
// Defenders: contest the exits of deployed ladders (and burn the ladders when nobody is climbing), patrol the
// walk's landings, hunt attackers loose in the bailey, then ring the dais.
import { TEAMS } from '../src/teams.mjs';
import { surfaceHeightAt } from '../src/collision.mjs';
import { navGraph, runClear, routeBetween, sidestepToward } from './botNav.mjs';
import { RESTLESS_LANDINGS } from '../worlds/restlessDay.mjs';
import { restlessCarryClear, interactRestlessLadder, ladderReach } from './restlessDayMode.mjs';

export const SIEGE = Object.freeze({
  coordinateEverySec: 0.5,
  pickupReach: 3.3,          // (the rule allows 3.8; a little inside it, so a bot never hovers on the boundary)
  placeWithin: 1.1,          // metres from the chosen landing point
  stallSec: 6,               // a carrier making no headway for this long has met an obstruction
  blockedLegSec: 25,         // and the leg it was on is avoided for this long
  maxCarryFails: 4,          // after which the ladder is set down and handed to another carrier
  handoffCooldownSec: 20,
  sampleStep: 0.35,          // the carry planner checks the beam this often along a leg
  turnStepDeg: 12,           // and every this many degrees through a turn
  headings: 24,
  contestReach: 13,          // defenders burn a ladder from no further than this
  patrolSwapSec: [11, 19],
  engageRange: 6.5,          // a foe this near is fought by the shared combat brain
  stallMoveSec: 4,           // a walker making no headway for this long recovers
  recoverSec: 1.6,
  transferGain: 25,          // a better-placed bot takes over a ladder not yet lifted if it is this many metres nearer
});

const A = TEAMS.ATTACKERS, D = TEAMS.DEFENDERS;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const dist3 = (a, b) => Math.hypot(a.x - b.x, (a.y ?? 0) - (b.y ?? 0), a.z - b.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// movement forward is (-sin yaw, -cos yaw)
const yawFrom = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

function walls(room) { return room.world.walls ?? room.restlessDayCanonicalWorld?.walls; }
function walkZ(w) { return (w.walk[0] + w.walk[1]) / 2; }
export function gateDown(room, wall) {
  return (room.structures?.entities?.[wall === 0 ? 'outer-gate' : 'inner-gate']?.health ?? 1) <= 0;
}
const deployedAt = (s, wall) => s.ladders.filter((l) => l.state === 'deployed' && l.wall === wall);
export function wallPassable(room, wall) { return gateDown(room, wall) || deployedAt(room.restlessDay, wall).length > 0; }

/** Where a body is in the castle: 0 field, 1 bailey (and the outer walk), 2 court (and the inner walk). */
export function zoneOf(p) {
  if (p.y > 5.5 && p.z > 19 && p.z < 25) return 2;     // the inner walk: reached from the bailey only by ladder
  if (p.y > 4.5 && p.z > -26.5 && p.z < -21) return 1; // the outer walk opens onto the bailey by its stairs
  if (p.z < -24) return 0;
  if (p.z < 22) return 1;
  return 2;
}
const humanAway = (p) => p.actorKind === 'human' && !p.connected;

export function siegeState(room) {
  const s = room.restlessDay;
  if (!s) return null;
  if (!s.siege) {
    s.siege = { nextAt: 0, assign: new Map(), cool: new Map(), blocked: new Map(), posts: new Map(),
      stats: { pickups: 0, placements: 0, setDowns: 0, replans: 0, handoffs: 0, routeFailures: 0 } };
  }
  return s.siege;
}
const assignmentOf = (siege, botId) => [...siege.assign.values()].find((a) => a.botId === botId) ?? null;

/** The landing points along a wall a ladder can be placed at (the mode's lip rule takes them there). */
function landingPoints(w) {
  return RESTLESS_LANDINGS.map(([a, b]) => ({ x: (a + b) / 2, z: w.approachZ })).filter((p) => Math.abs(p.x) <= 19);
}
function chooseLanding(room, siege, wall, ladder, avoid = []) {
  const w = walls(room)[wall];
  const taken = [
    ...deployedAt(room.restlessDay, wall).map((l) => l.position.x),
    ...[...siege.assign.values()].filter((a) => a.wall === wall && a.ladderId !== ladder.id).map((a) => a.landingX),
  ];
  const from = ladder.position;
  const free = landingPoints(w).filter((p) => !avoid.includes(p.x) && taken.every((x) => Math.abs(x - p.x) > 3.2));
  // nearest to where the ladder is, the central landings preferred a little (shorter walk for the climbers)
  free.sort((p, q) => (Math.abs(p.x - from.x) + Math.abs(p.x) * 0.25) - (Math.abs(q.x - from.x) + Math.abs(q.x) * 0.25));
  return free[0]?.x ?? landingPoints(w)[0].x;
}

/** Where a ladder is picked up from: where it lies, or (deployed) the wall-walk beside its top. */
export function pickupPoint(room, ladder) {
  if (ladder.state === 'deployed' && Number.isInteger(ladder.wall)) {
    const w = walls(room)[ladder.wall];
    return { x: ladder.position.x, y: w.height, z: walkZ(w) };
  }
  // (where it lies, at the height it lies at: a ladder set down on a wall-walk is fetched from the walk)
  return { x: ladder.position.x, y: ladder.position.y ?? 0, z: ladder.position.z };
}

// ---------------------------------------------------------------------------------------------------------------
// The coordinator

/** Which ladders should go to which wall now. */
export function siegeTasks(room) {
  const s = room.restlessDay;
  if (!s || s.phase >= 2) return [];
  const attackers = [...room.players.values()].filter((p) => p.team === A && p.alive && !humanAway(p));
  const humanCarried = (l) => l.state === 'carrying' && room.players.get(l.holderId)?.actorKind === 'human';
  const usable = s.ladders.filter((l) => l.state !== 'broken' && !humanCarried(l));
  if (s.phase === 0) {
    if (gateDown(room, 0)) return [];
    return usable.filter((l) => !(l.state === 'deployed' && l.wall === 0)).map((l) => ({ ladder: l, wall: 0 }));
  }
  // phase 1: the inner curtain, keeping the outer one passable while anyone is still outside it
  if (gateDown(room, 1)) return [];
  const gate0 = gateDown(room, 0);
  // (bots only: a human outside the wall chooses his own way, and never holds the siege back by standing there)
  const stranded = attackers.some((p) => p.actorKind === 'bot' && zoneOf(p.position) === 0);
  const passages = deployedAt(s, 0).length + (gate0 ? 1 : 0);
  const tasks = [];
  // (a ladder lying on the outer walk is inside: the walk opens onto the bailey by its stairs)
  const inside = (l) => (l.state === 'available' && (zoneOf(l.position) >= 1 || gate0)) || (l.state === 'deployed' && l.wall === 0)
    || (l.state === 'carrying' && zoneOf(l.position) >= 1);
  let reserved = 0;
  for (const l of usable) {
    if (l.state === 'deployed' && l.wall === 1) continue;
    if (inside(l)) {
      // the last ladder over the outer curtain stays while someone still needs it
      if (l.state === 'deployed' && l.wall === 0 && stranded && passages - reserved <= 1) { reserved++; continue; }
      tasks.push({ ladder: l, wall: 1 });
    } else if (!gate0 && (stranded || passages === 0)) {
      // a ladder still in the field becomes the outer passage, freeing the deployed one to move inward
      tasks.push({ ladder: l, wall: 0 });
    }
  }
  return tasks;
}

function eligibleCarrier(room, siege, p, ladder, now) {
  if (p.team !== A || !p.alive || p.actorKind !== 'bot') return false;
  if (p.operatingRamId || p.operatingBallistaId || p.operatingFightFlightId) return false;
  if ((siege.cool.get(`${p.id}:${ladder.id}`) ?? -Infinity) > now) return false;
  return true;
}

/** Re-plan assignments (cheap, every half second): release what is no longer valid, fill what is needed. */
export function coordinateSiege(room, now) {
  const s = room.restlessDay, siege = siegeState(room);
  if (!siege) return;
  if (s.phase >= 2) { siege.assign.clear(); return; }
  // releases: a dead or departed carrier, a broken or already-placed ladder, a ladder somebody else now holds
  for (const [id, a] of siege.assign) {
    const l = s.ladders.find((x) => x.id === id), b = room.players.get(a.botId);
    const placed = l?.state === 'deployed' && l.wall === a.wall;
    const otherHolder = l?.state === 'carrying' && l.holderId !== a.botId;
    if (!l || l.state === 'broken' || !b || !b.alive || b.team !== A || placed || otherHolder) siege.assign.delete(id);
  }
  if (now < siege.nextAt) return;
  siege.nextAt = now + SIEGE.coordinateEverySec;
  const tasks = siegeTasks(room);
  const wanted = new Set(tasks.map((t) => t.ladder.id));
  for (const [id, a] of siege.assign) {
    // a task that is no longer needed (its wall fell by another way) is released, and a carrier sets it down
    if (!wanted.has(id)) {
      siege.assign.delete(id);
      const bot = room.players.get(a.botId);
      if (bot?.restlessCarrying === id) setDown(room, siege, bot, now, 'obsolete');
    }
  }
  const bots = [...room.players.values()].filter((p) => p.team === A && p.alive && p.actorKind === 'bot');
  for (const { ladder, wall } of tasks) {
    const current = siege.assign.get(ladder.id);
    if (current && current.wall === wall) {
      // not yet lifted, and someone much better placed has come free: hand it over
      if (ladder.state !== 'carrying' && now - current.since > 5) {
        const at = pickupPoint(room, ladder), holder = room.players.get(current.botId);
        const mine = holder ? dist3(holder.position, at) + (zoneOf(holder.position) === zoneOf(at) ? 0 : 40) : Infinity;
        const busy = new Set([...siege.assign.values()].map((a) => a.botId));
        const better = bots.filter((b) => !busy.has(b.id) && eligibleCarrier(room, siege, b, ladder, now))
          .map((b) => ({ b, cost: dist3(b.position, at) + (zoneOf(b.position) === zoneOf(at) ? 0 : 40) }))
          .sort((p, q) => p.cost - q.cost)[0];
        if (better && better.cost + SIEGE.transferGain < mine) {
          siege.assign.set(ladder.id, newAssignment(room, siege, ladder, better.b.id, wall, now));
          siege.stats.handoffs++;
        }
      }
      continue;
    }
    if (ladder.state === 'carrying' && room.players.get(ladder.holderId)?.actorKind === 'bot') {
      // a bot already holds it (it may have been re-tasked to the other wall): it keeps it
      siege.assign.set(ladder.id, newAssignment(room, siege, ladder, ladder.holderId, wall, now));
      continue;
    }
    const busy = new Set([...siege.assign.values()].map((a) => a.botId));
    const at = pickupPoint(room, ladder);
    const candidates = bots.filter((b) => !busy.has(b.id) && eligibleCarrier(room, siege, b, ladder, now))
      .map((b) => ({ b, cost: dist3(b.position, at) + (zoneOf(b.position) === zoneOf(at) ? 0 : 40) }))
      .sort((p, q) => p.cost - q.cost);
    for (const { b } of candidates.slice(0, 3)) {
      // only a bot that can actually get there (the bot graph, as it is now)
      if (!runClear(room.world, b.position, at) && !routeBetween(room.world, b.position, at)) continue;
      siege.assign.set(ladder.id, newAssignment(room, siege, ladder, b.id, wall, now));
      break;
    }
  }
}

function newAssignment(room, siege, ladder, botId, wall, now) {
  return { ladderId: ladder.id, botId, wall, landingX: chooseLanding(room, siege, wall, ladder), since: now,
    best: Infinity, bestAt: now, fails: 0, route: null, routeAt: -Infinity, leg: null, lastNode: undefined, triedLandings: [] };
}

function setDown(room, siege, bot, now, why) {
  if (!bot.restlessCarrying) return false;
  const r = interactRestlessLadder(room, bot, now);
  if (!r.rejected) { siege.stats.setDowns++; room.events.push({ type: 'restlessSiegeSetDown', playerId: bot.id, reason: why, at: now }); return true; }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------
// The carry planner

const NEAR = new WeakMap();
function solidsNear(world, x, z, reach = 4.3) {
  let all = NEAR.get(world);
  if (!all) {
    all = (world.solids ?? []).filter((b) => b?.center && b?.size).map((b) => ({ b,
      x0: b.center[0] - b.size[0] / 2, x1: b.center[0] + b.size[0] / 2, z0: b.center[2] - b.size[2] / 2, z1: b.center[2] + b.size[2] / 2 }));
    NEAR.set(world, all);
  }
  return { solids: all.filter((s) => s.x1 >= x - reach && s.x0 <= x + reach && s.z1 >= z - reach && s.z0 <= z + reach).map((s) => s.b) };
}
/** The rule's own beam test, against only the solids within a ladder's length. */
export function beamClear(world, p, yaw) { return restlessCarryClear(solidsNear(world, p.x, p.z), p, yaw); }

/** Every heading the ladder fits at, standing here (a carrier turns only through these). */
function headingsAt(cache, world, p) {
  const key = `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`;
  let h = cache.headings.get(key);
  if (!h) {
    h = Array.from({ length: SIEGE.headings }, (_, i) => beamClear(world, p, -Math.PI + (i / SIEGE.headings) * Math.PI * 2));
    cache.headings.set(key, h);
  }
  return h;
}
const bucket = (yaw) => ((Math.round((wrap(yaw) + Math.PI) / (Math.PI * 2) * SIEGE.headings) % SIEGE.headings) + SIEGE.headings) % SIEGE.headings;
/** Can a carrier standing at p turn from one heading to another (either way round) without the ladder meeting anything? */
function canTurn(cache, world, p, fromYaw, toYaw) {
  const h = headingsAt(cache, world, p);
  const a = bucket(fromYaw), b = bucket(toYaw), n = SIEGE.headings;
  if (a === b) return h[a];
  const arc = (step) => { for (let i = a; ; i = (i + step + n) % n) { if (!h[i]) return false; if (i === b) return true; } };
  return arc(1) || arc(-1);
}

/**
 * Can a carrier walk straight from a to b with the ladder ahead of him: ground underfoot all the way (up no more
 * than a step, down no more than a step: no walking off a wall-walk), the beam clear at every point, and nothing in
 * his own body's way.
 */
function legClear(cache, world, a, b) {
  const key = `${a.x.toFixed(2)},${a.y.toFixed(2)},${a.z.toFixed(2)}>${b.x.toFixed(2)},${b.y.toFixed(2)},${b.z.toFixed(2)}`;
  if (cache.legs.has(key)) return cache.legs.get(key);
  const yaw = yawFrom(a, b);
  const length = dist(a, b);
  const steps = Math.max(1, Math.ceil(length / SIEGE.sampleStep));
  let y = a.y, ok = true;
  for (let i = 0; i <= steps && ok; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    const g = surfaceHeightAt(x, z, y + 0.1, world);
    if (g === null || g < y - 0.7) { ok = false; break; }
    y = g;
    if (!beamClear(world, { x, y, z }, yaw)) ok = false;
  }
  if (ok && Math.abs(y - b.y) > 0.7) ok = false;
  // and the carrier's own body must get along it (the bot graph's test: nothing in the way, no drop)
  if (ok && !runClear(world, a, b)) ok = false;
  cache.legs.set(key, ok);
  return ok;
}

const PLANS = new WeakMap();
function planCache(world) {
  let c = PLANS.get(world);
  if (!c) PLANS.set(world, c = { legs: new Map(), headings: new Map() });
  return c;
}

/**
 * The carry route from a carrier (position and heading) to a destination: a list of points, or null when the ladder
 * cannot be got there. Dijkstra over the bot graph's waypoints and the heading the carrier arrives with, using only
 * legs the ladder fits along and turns it fits through. `blocked`: leg keys to avoid (recent obstructions).
 */
export function carryRoute(world, from, fromYaw, to, blocked = new Set()) {
  const cache = planCache(world);
  const direct = () => legClear(cache, world, from, to) && canTurn(cache, world, from, fromYaw, yawFrom(from, to));
  if (dist(from, to) < 0.3 || direct()) return [to];
  const graph = navGraph(world);
  if (!graph) return null;
  const { nodes, links } = graph;
  const legKey = (a, b) => `${a}>${b}`;
  const n = nodes.length, H = SIEGE.headings;
  const cost = new Map(), prev = new Map();
  const open = [];
  const push = (state, c, p) => { if (c < (cost.get(state) ?? Infinity)) { cost.set(state, c); prev.set(state, p); open.push([c, state]); } };
  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    if (dist(from, node) > 18 || blocked.has(legKey('start', i))) continue;
    if (!legClear(cache, world, from, node) || !canTurn(cache, world, from, fromYaw, yawFrom(from, node))) continue;
    push(i * H + bucket(yawFrom(from, node)), dist(from, node), -1);
  }
  let best = null;
  while (open.length) {
    open.sort((p, q) => q[0] - p[0]);
    const [c, state] = open.pop();
    if (c > (cost.get(state) ?? Infinity)) continue;
    if (best && c >= best.cost) break;
    const i = Math.floor(state / H), inYaw = -Math.PI + ((state % H) / H) * Math.PI * 2;
    const node = nodes[i];
    // the destination straight from here?
    if (dist(node, to) <= 18 && !blocked.has(legKey(i, 'end')) && legClear(cache, world, node, to)
      && canTurn(cache, world, node, inYaw, yawFrom(node, to))) {
      const total = c + dist(node, to);
      if (!best || total < best.cost) best = { cost: total, state };
    }
    for (const { to: j, cost: w } of links[i]) {
      if (blocked.has(legKey(i, j))) continue;
      const out = yawFrom(node, nodes[j]);
      if (!canTurn(cache, world, node, inYaw, out) || !legClear(cache, world, node, nodes[j])) continue;
      push(j * H + bucket(out), c + w, state);
    }
  }
  if (!best) return null;
  const path = [to];
  for (let st = best.state; st >= 0; st = prev.get(st)) {
    const i = Math.floor(st / H);
    path.unshift({ ...nodes[i], node: i });
  }
  return path;
}

// ---------------------------------------------------------------------------------------------------------------
// What each bot is for

const ATTACK_POINT = (rivalIndex) => {
  const a = ((rivalIndex ?? 0) * 1.31) % (Math.PI * 2);
  return { x: Math.sin(a) * 2.6, y: 1.1, z: 56 + Math.cos(a) * 2.6 };
};

/** The goal the shared bot brain walks a Restless Day bot toward (it fights whoever it meets on the way). */
export function siegeBotGoal(room, actor) {
  const s = room.restlessDay, siege = siegeState(room);
  if (!s || !siege) return null;
  const W = walls(room);
  if (actor.team === D) return defenderGoal(room, actor, s, siege, W);
  const mine = assignmentOf(siege, actor.id);
  if (mine) {
    const l = s.ladders.find((x) => x.id === mine.ladderId);
    if (actor.restlessCarrying) return { x: mine.landingX, y: 0, z: W[mine.wall].approachZ };
    if (l) return pickupPoint(room, l);
  }
  const zone = zoneOf(actor.position);
  if (s.phase >= 2 && zone === 2) return ATTACK_POINT(actor.rivalIndex);
  // the wall in front of this knight: the outer one from the field, the inner one from the bailey
  const front = zone === 0 ? 0 : 1;
  if (zone === 2) return ATTACK_POINT(actor.rivalIndex);
  if (wallPassable(room, front)) {
    // through it: the gate if broken, else the nearest deployed ladder, and on into the next zone
    if (gateDown(room, front)) return { x: 0, y: 0, z: front === 0 ? -10 : 34 };
    const ladder = deployedAt(s, front).sort((p, q) => dist(p.position, actor.position) - dist(q.position, actor.position))[0];
    return { x: ladder.position.x * 0.5, y: 0, z: front === 0 ? -10 : 34 };
  }
  // cut off behind a curtain the siege has already passed (no ladder left on it, none coming): its gate, to break it
  const carried = [...siege.assign.values()].find((a) => a.wall === front);
  if (front < s.phase && !carried) return gateFront(W, front);
  // no way through yet: escort the ladder coming to this wall, or stand ready at its foot
  const w = W[front];
  const i = actor.rivalIndex ?? 0;
  if (carried) {
    const carrier = room.players.get(carried.botId);
    if (carrier?.alive && zoneOf(carrier.position) === zone && dist(carrier.position, { x: carried.landingX, z: w.approachZ }) > 9) {
      // a few metres off the carrier's shoulder, on the wall side
      return { x: carrier.position.x + (i % 2 ? 2.4 : -2.4), y: carrier.position.y, z: carrier.position.z + 2.2 };
    }
    return { x: carried.landingX + (i % 2 ? 3.2 : -3.2), y: 0, z: w.approachZ - 2.5 };
  }
  const xs = landingPoints(w).map((p) => p.x);
  return { x: xs[i % xs.length], y: 0, z: w.approachZ - 3.5 };
}

const gateFront = (W, wall) => ({ x: 0, y: 0, z: W[wall].z - W[wall].thickness / 2 - 1.35, gate: wall });

function defenderGoal(room, actor, s, siege, W) {
  const zone = zoneOf(actor.position);
  // thrown down into the field (a blow, a gust off a landing): back up an attackers' ladder if one stands, else
  // along the wall's foot after any attacker there
  if (zone === 0) {
    const foe = [...room.players.values()].filter((p) => p.team === A && p.alive && zoneOf(p.position) === 0)
      .sort((p, q) => dist(p.position, actor.position) - dist(q.position, actor.position))[0];
    if (foe) return { ...foe.position };
    if (deployedAt(s, 0).length) return { x: deployedAt(s, 0)[0].position.x, y: W[0].height, z: walkZ(W[0]) };
    const side = Math.floor((s.elapsed ?? 0) / 9 + (hash(actor.id) % 7)) % 2 ? 1 : -1;
    return { x: side * 14, y: 0, z: W[0].approachZ + 1.5 };
  }
  const i = actor.rivalIndex ?? 0;
  const swap = SIEGE.patrolSwapSec[0] + (hash(actor.id) % 1000) / 1000 * (SIEGE.patrolSwapSec[1] - SIEGE.patrolSwapSec[0]);
  const turn = Math.floor((room.restlessDay.elapsed ?? 0) / swap);
  if (s.phase >= 2) {
    // the court is the last ground: go for the attackers in it, those at the Renowner first; none: ring the dais
    const r = s.renowner.position;
    const foes = [...room.players.values()].filter((p) => p.team === A && p.alive && zoneOf(p.position) === 2)
      .sort((p, q) => dist(p.position, r) - dist(q.position, r));
    if (foes.length) {
      const f = foes[i % Math.min(foes.length, 2)];
      return { ...f.position };
    }
    const a = (i * 1.26 + turn * 0.9) % (Math.PI * 2);
    return { x: Math.sin(a) * 9, y: 0, z: 56 + Math.cos(a) * 9 };
  }
  const wall = Math.min(1, s.phase);
  const w = W[wall];
  // a defender cut off from that wall's walk (respawned on the fallen outer walk, or down in the bailey) hunts the
  // attackers in his own part of the castle, the carriers first
  const onSide = wall === 0 ? zone <= 1 : (zone === 2);
  if (!onSide || (wall === 1 && zone === 1)) {
    const foes = [...room.players.values()].filter((p) => p.team === A && p.alive && zoneOf(p.position) === zone)
      .sort((p, q) => (q.restlessCarrying ? 1 : 0) - (p.restlessCarrying ? 1 : 0) || dist(p.position, actor.position) - dist(q.position, actor.position));
    if (foes[0]) return { ...foes[0].position };
    if (wall === 1 && zone === 1) return { x: (i % 2 ? 6 : -6), y: 0, z: 12 };
  }
  // contest the exits of the attackers' ladders on this wall, the nearest two defenders to each: on the landing's
  // own edge, where a climber must come off the ladder through them. A ladder being carried to this wall is seen
  // coming: its landing is the one in front of its carrier.
  const edge = w.walk[0] + 0.55;   // (the attackers' side of either walk)
  const coming = [...siege.assign.values()].filter((a) => a.wall === wall && room.players.get(a.botId)?.restlessCarrying)
    .filter((a) => { const c = room.players.get(a.botId); return dist(c.position, { x: a.landingX, z: w.approachZ }) < 30; })
    .map((a) => a.landingX);
  const exits = [...deployedAt(s, wall).map((l) => l.position.x), ...coming].map((x) => ({ x, y: w.height, z: edge }));
  if (exits.length) {
    const mates = [...room.players.values()].filter((p) => p.team === D && p.alive && zoneOf(p.position) === zone)
      .sort((p, q) => (p.rivalIndex ?? 0) - (q.rivalIndex ?? 0));
    const rank = mates.findIndex((p) => p.id === actor.id);
    if (rank >= 0 && rank < exits.length * 2) {
      const e = exits[rank % exits.length];
      return { x: exitPost(e.x, rank < exits.length ? 1 : -1), y: e.y, z: e.z };
    }
  }
  // patrol the walk's landings, changing post now and then (not those whose exits are guarded: a patrol there would
  // stand on the ladder's top)
  const all = landingPoints(w).map((p) => ({ x: p.x, y: w.height, z: walkZ(w) }));
  const open = all.filter((p) => !exits.some((e) => Math.abs(p.x - e.x) < 3.6));
  const posts = open.length ? open : all;
  return posts[(i + turn) % posts.length];
}

// Where a guard flanks a ladder's exit: 1.5 m to one side, inside the landing's hoarding posts. Never closer than
// 1.35 m, so a climber (0.45 m about the body, as each guard) can always step off the ladder and fight, rather than
// meet a wall of bodies; where one side has no room both guards stand on the open side.
function exitPost(x, side) {
  const [lo, hi] = RESTLESS_LANDINGS.find(([a, b]) => x >= a - 0.5 && x <= b + 0.5) ?? [x - 9, x + 9];
  const clamp = (v) => Math.min(hi - 0.7, Math.max(lo + 0.7, v));
  const post = clamp(x + side * 1.5);
  return Math.abs(post - x) >= 1.35 ? post : clamp(x - side * 2.7);
}

// ---------------------------------------------------------------------------------------------------------------
// Acting: what a bot does itself this tick (ladder handling, carrying, burning ladders). Returns true when it has
// set the bot's inputs for this tick; false hands the bot back to the shared bot brain.

export function siegeBotAct(room, actor, now, { ai, world = room.world, wayToward, tryCastSpell, beginAttack, endAttack } = {}) {
  const s = room.restlessDay, siege = siegeState(room);
  if (!s || !siege || room.state !== 'PLAYING' || !actor.alive) return false;
  if (actor.operatingRamId || actor.operatingBallistaId || actor.operatingFightFlightId) return false;
  if (actor.team === D) {
    if (defenderAct(room, actor, now, s, world, tryCastSpell)) return true;
    if (foeNear(room, actor, SIEGE.engageRange + 1)) return false;
    return walk(room, actor, siegeBotGoal(room, actor), now, siege, world, ai, wayToward);
  }
  const a = assignmentOf(siege, actor.id);
  if (actor.restlessCarrying) {
    if (!a) { setDown(room, siege, actor, now, 'unassigned'); return hold(actor); }
    return carryAct(room, actor, now, s, siege, a, world);
  }
  // fetching a ladder, a foe at arm's length is fought; anyone else only when one comes near
  if (foeNear(room, actor, a ? 2.4 : SIEGE.engageRange)) return false;
  // beside the Renowner the shared brain swings at it
  if (s.phase >= 2 && Math.hypot(actor.position.x - s.renowner.position.x, actor.position.z - s.renowner.position.z) < 5.5) return false;
  if (a) {
    const l = s.ladders.find((x) => x.id === a.ladderId);
    if (l && ladderReach(l, actor) <= SIEGE.pickupReach && lift(room, actor, now, siege, a, world)) return true;
  }
  const goal = siegeBotGoal(room, actor);
  // at a gate it has come to break: the sword, as any knight's against timber (an ordinary blow, an ordinary pace)
  if (goal?.gate !== undefined && dist(actor.position, goal) < 1.4 && beginAttack) {
    const yaw = Math.PI;
    actor.input = { ...actor.input, yaw, pitch: 0.12, forward: 0, right: 0, sprint: false, jump: false };
    actor.yaw = yaw;
    if (actor.attackHeld && now >= (ai?.gateReleaseAt ?? 0)) { endAttack?.(room, actor.id, now); if (ai) ai.gateNextAt = now + 0.45; }
    else if (!actor.attackHeld && now >= (ai?.gateNextAt ?? 0) && beginAttack(room, actor.id, now) && ai) ai.gateReleaseAt = now + 0.35;
    return true;
  }
  if (actor.attackHeld && goal?.gate !== undefined) endAttack?.(room, actor.id, now);
  return walk(room, actor, goal, now, siege, world, ai, wayToward);
}

const foeNear = (room, actor, range) => [...room.players.values()].some((p) => p.alive && p.team !== actor.team
  && (p.actorKind !== 'human' || p.connected) && dist(p.position, actor.position) < range && Math.abs(p.position.y - actor.position.y) < 2);

/** The headings in the widest run of headings the ladder fits at, here (a carrier can swing round within it). */
function openArc(world, p) {
  const n = SIEGE.headings;
  const clear = Array.from({ length: n }, (_, i) => beamClear(world, p, -Math.PI + (i / n) * Math.PI * 2));
  if (clear.every(Boolean)) return clear.map((_, i) => i);
  let best = [], run = [];
  const start = clear.indexOf(false);
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (clear[i]) run.push(i); else { if (run.length > best.length) best = run; run = []; }
  }
  if (run.length > best.length) best = run;
  return best;
}

/** Lift the assigned ladder, facing a way it fits and can swing from (the rule refuses one shouldered into stone). */
function lift(room, actor, now, siege, a, world) {
  const toward = yawFrom(actor.position, { x: a.landingX, z: walls(room)[a.wall].approachZ });
  const arc = openArc(world, actor.position);
  // a lone gap between two merlons would leave the carrier unable to turn: lift only within a real sweep of room
  const usable = new Set(arc.length >= 3 ? arc : []);
  for (let k = 0; k < SIEGE.headings; k++) {
    const yaw = toward + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI * 2 / SIEGE.headings);
    if (!usable.has(bucket(yaw)) || !beamClear(world, actor.position, yaw)) continue;
    actor.yaw = yaw;
    actor.input = { ...actor.input, yaw, forward: 0, right: 0, sprint: false, jump: false };
    const r = interactRestlessLadder(room, actor, now);
    if (r.rejected) return false;
    siege.stats.pickups++; a.best = Infinity; a.bestAt = now;
    return hold(actor, yaw);
  }
  return false;
}

/**
 * Walk a bot toward its goal across the castle: over the curtain between here and there by its broken gate or by a
 * deployed ladder (to the foot, straight up the incline, onto the walk, on), elsewhere by the bot graph; and when
 * headway stops, a short recovery (a step aside, or back to open ground) before trying again.
 */
function walk(room, actor, goal, now, siege, world, ai, wayToward) {
  if (!goal) return false;
  const p = actor.position, s = room.restlessDay, W = walls(room);
  const here = zoneOf(p), there = zoneOf(goal);
  const mv = siege.moves?.get(actor.id) ?? { best: Infinity, bestAt: now, key: '', recoverUntil: -Infinity, recoverTo: null, recoveries: 0 };
  (siege.moves ??= new Map()).set(actor.id, mv);
  const key = `${goal.x.toFixed(0)},${goal.z.toFixed(0)}`;
  // a new goal, or a walk taken up again after fighting, dying or resting, starts its headway afresh
  if (key !== mv.key || now - (mv.lastAt ?? -Infinity) > 1) Object.assign(mv, { key, best: Infinity, bestAt: now });
  mv.lastAt = now;
  let aim = null;
  // a curtain in the way, crossed only where it can be
  const wall = there > here ? here : null;
  if (wall !== null && wall <= 1 && !gateDown(room, wall)) {
    const w = W[wall];
    const ladder = deployedAt(s, wall).sort((x, y) => dist(x.position, p) - dist(y.position, p))[0];
    if (ladder) {
      const foot = { x: ladder.position.x, y: 0, z: w.approachZ - 0.6 };
      const top = { x: ladder.position.x, y: w.height, z: walkZ(w) };
      const onLadder = Math.abs(p.x - ladder.position.x) < 1.2 && p.z > w.approachZ - 1 && p.z < w.z && p.y > 0.05;
      if (onLadder || (dist(p, foot) < 1.3 && p.y < 0.6)) aim = top;
      else aim = wayToward?.(world, actor, { position: foot }, ai, now) ?? foot;
    }
  }
  if (!aim) aim = wayToward?.(world, actor, { position: goal }, ai, now) ?? goal;
  const far = dist(p, goal);
  if (far < 1.1 && Math.abs(p.y - (goal.y ?? p.y)) < 1) {
    // arrived: face the nearest foe's side and hold
    return hold(actor, actor.team === A ? Math.PI : 0);
  }
  // headway toward the goal (in three dimensions: a climb is headway)
  const progress = dist3(p, goal);
  if (progress < mv.best - 0.4) { mv.best = progress; mv.bestAt = now; }
  if (now < mv.recoverUntil && mv.recoverTo) { steer(actor, mv.recoverTo, false); return true; }
  if (now - mv.bestAt > SIEGE.stallMoveSec) {
    // stalled: a step aside from where it wanted to go, else back the way that is open
    const side = (mv.recoveries % 2) ? -1 : 1;
    const aside = sidestepToward(world, p, aim, side) ?? sidestepToward(world, p, aim, -side);
    let to = aside;
    if (!to) {
      for (let k = 0; k < 8 && !to; k++) {
        const ang = actor.yaw + Math.PI + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 4);
        const q = { x: p.x - Math.sin(ang) * 2.5, y: p.y, z: p.z - Math.cos(ang) * 2.5 };
        if (runClear(world, p, q)) to = q;
      }
    }
    // (nothing open within reach: a turn of the heading, the same for the same bot every time)
    const ang = actor.yaw + 1.9 * (1 + mv.recoveries);
    mv.recoverTo = to ?? { x: p.x - Math.sin(ang) * 2, y: p.y, z: p.z - Math.cos(ang) * 2 };
    mv.recoverUntil = now + SIEGE.recoverSec;
    mv.recoveries++; mv.bestAt = now; mv.best = Infinity;
    siege.stats.recoveries = (siege.stats.recoveries ?? 0) + 1;
    steer(actor, mv.recoverTo, false);
    return true;
  }
  steer(actor, aim, far > 7 && (actor.guardStamina ?? 100) > 40);
  return true;
}

function hold(actor, yaw = actor.yaw) {
  actor.input = { ...actor.input, forward: 0, right: 0, sprint: false, jump: false, yaw };
  actor.yaw = yaw;
  return true;
}
function steer(actor, to, sprint = false) {
  const yaw = yawFrom(actor.position, to);
  actor.input = { ...actor.input, yaw, pitch: 0, forward: 1, right: 0, sprint, jump: false, attack: false, guard: false };
  actor.yaw = yaw;
}

function carryAct(room, actor, now, s, siege, a, world) {
  const w = walls(room)[a.wall];
  const dest = { x: a.landingX, y: 0, z: w.approachZ };
  const p = actor.position;
  // at the landing: face the wall and set the ladder up
  if (dist(p, dest) <= SIEGE.placeWithin && p.y < 0.6) {
    const yaw = Math.PI;
    if (Math.abs(wrap(actor.yaw - yaw)) > 0.05) return hold(actor, yaw);
    const r = interactRestlessLadder(room, actor, now);
    if (!r.rejected) { siege.stats.placements++; siege.assign.delete(a.ladderId); return hold(actor); }
    // refused (another ladder too close, the lip): another landing
    a.triedLandings.push(a.landingX);
    a.landingX = chooseLanding(room, siege, a.wall, s.ladders.find((l) => l.id === a.ladderId) ?? { id: a.ladderId, position: p }, a.triedLandings);
    a.route = null; a.fails++;
    return hold(actor);
  }
  // headway: the remaining route length, falling; a stall is an obstruction: avoid that leg, plan again
  const remaining = a.route ? routeLength(p, a.route) : dist(p, dest);
  if (remaining < a.best - 0.4) { a.best = remaining; a.bestAt = now; }
  if (now - a.bestAt > SIEGE.stallSec) {
    a.fails++; siege.stats.replans++;
    if (a.leg) siege.blocked.set(a.leg, now + SIEGE.blockedLegSec);
    a.route = null; a.best = Infinity; a.bestAt = now;
  }
  if (a.fails >= SIEGE.maxCarryFails) return handOff(room, actor, now, siege, a);
  // plan again every few seconds (the castle changes), and after a failed plan, no sooner than a second later
  if ((!a.route && now - a.routeAt > 1) || (a.route && now - a.routeAt > 3)) {
    const blocked = new Set([...siege.blocked].filter(([, until]) => until > now).map(([k]) => k));
    a.route = carryRoute(world, p, actor.yaw ?? 0, dest, blocked);
    a.routeAt = now; a.lastNode = undefined;
    if (!a.route) {
      // no way to this landing: any other landing on the same wall the ladder can be got to
      const others = landingPoints(w).filter((q) => q.x !== a.landingX && !a.triedLandings.includes(q.x));
      for (const q of others) {
        const route = carryRoute(world, p, actor.yaw ?? 0, { x: q.x, y: 0, z: w.approachZ }, blocked);
        if (route) { a.triedLandings.push(a.landingX); a.landingX = q.x; a.route = route; break; }
      }
    }
    if (!a.route) { siege.stats.routeFailures++; a.fails++; return a.fails >= SIEGE.maxCarryFails ? handOff(room, actor, now, siege, a) : hold(actor); }
  }
  if (!a.route) return hold(actor);
  // the next point not yet reached (the leg being walked is remembered: it is the one to avoid if this stalls)
  while (a.route.length > 1 && dist(p, a.route[0]) < 0.7) { const done = a.route.shift(); if (done.node !== undefined) a.lastNode = done.node; }
  const next = a.route[0];
  a.leg = `${a.lastNode ?? 'start'}>${next.node ?? 'end'}`;
  const want = yawFrom(p, next);
  // turn in place first when the turn is large (the ladder swings round the carrier, not through the wall)
  if (Math.abs(wrap(want - (actor.yaw ?? 0))) > 0.5) {
    const step = Math.sign(wrap(want - actor.yaw)) * Math.min(0.35, Math.abs(wrap(want - actor.yaw)));
    const yaw = wrap(actor.yaw + step);
    return beamClear(world, p, yaw) ? hold(actor, yaw) : (a.route = null, hold(actor));
  }
  steer(actor, next, false);
  return true;
}

function routeLength(p, route) {
  let total = 0, at = p;
  for (const q of route) { total += dist(at, q); at = q; }
  return total;
}

/** The carrier cannot get it there: set the ladder down (on supported ground) and let another bot try. */
function handOff(room, actor, now, siege, a) {
  setDown(room, siege, actor, now, 'no-route');
  siege.cool.set(`${actor.id}:${a.ladderId}`, now + SIEGE.handoffCooldownSec);
  siege.assign.delete(a.ladderId);
  siege.stats.handoffs++;
  return hold(actor);
}

function defenderAct(room, actor, now, s, world, tryCastSpell) {
  if (s.phase >= 2 || !tryCastSpell) return false;
  const W = walls(room);
  const wall = Math.min(1, s.phase), w = W[wall];
  if (zoneOf(actor.position) !== (wall === 0 ? 1 : 2) || Math.abs(actor.position.y - w.height) > 0.6) return false;
  const ladder = deployedAt(s, wall).find((l) => Math.hypot(actor.position.x - l.position.x, actor.position.z - (w.z - 3)) < SIEGE.contestReach);
  if (!ladder) return false;
  // a climber near: fight him (the ordinary brain); nobody on it: burn the ladder from the wall
  const climber = [...room.players.values()].some((p) => p.team === A && p.alive && dist(p.position, ladder.position) < 9 && p.position.y > 0.4);
  if (climber || now < (actor.spellReadyAt ?? 0)) return false;
  const target = { x: ladder.position.x + 1.39, y: w.height * 0.62, z: w.approachZ + (w.z - (wall === 0 ? 1.8 : 1.9) - w.approachZ) * 0.66 };
  const eye = { x: actor.position.x, y: actor.position.y + 1.35, z: actor.position.z };
  const d = { x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z };
  const len = Math.hypot(d.x, d.y, d.z) || 1;
  actor.yaw = Math.atan2(-d.x, -d.z);
  actor.input = { ...actor.input, yaw: actor.yaw, pitch: Math.asin(d.y / len), forward: 0, right: 0, sprint: false };
  tryCastSpell(room, actor.id, { x: d.x / len, y: d.y / len, z: d.z / len }, now);
  return true;
}
