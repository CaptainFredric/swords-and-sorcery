import { navigationSignature } from '../worlds/navigationSignature.mjs';
// How a bot finds its way round what stands between it and its foe. A world names a handful of waypoints (its
// `navigation.nodes`: the middle of each open space, each gate, each end of a ramp or stair); two waypoints are linked
// wherever a knight could run straight from one to the other (nothing solid in the way at knee or chest height, across
// the width of a body, and ground underfoot all the way: no gap and no drop). Worked out once per world.
//
// A bot that can see its way straight to its foe goes straight at them, as it always has. When it cannot, it first
// tries a step or two to one side (round a barrel, a stall, a pillar); only when that will not do (a bank, a wall, a
// house between them) does it take the shortest run of waypoints: from one it can reach straight, to one from which
// its foe can be reached straight.

import { findSwordWorldHit, surfaceHeightAt } from '../src/collision.mjs';

export const NAV = Object.freeze({
  heights: Object.freeze([0.4, 0.9, 1.6]), // the rays: knee, chest and head (a gap only a crouch fits is no way)
  halfWidth: 0.3,                       // and either side of the middle, a body's width apart
  step: 0.5,                            // ground checked this often along the way
  drop: 1.5,                            // a knight steps down this far without a thought (further is a fall)
  linkReach: 18,                        // waypoints further apart than this are not linked directly
  // round something small it tries a point this far aside (and this far on along the way) first
  sidesteps: Object.freeze([1.2, 2.4, 3.6]),
  sidestepsAhead: Object.freeze([0, 2.5]),
  arrived: 1.1,                         // this near a waypoint, it moves on to the next
  rethinkSec: 0.4,                      // how often a bot looks again at its way
});

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Whether a knight could run straight from `from` to `to` ({x, y, z}: feet): nothing solid in the way, and ground
 * underfoot the whole way that it could walk (up no more than a step at a time, down no more than a short drop),
 * arriving at `to`'s level.
 */
// a solid's reach across the ground and up (oriented boxes by their extents), worked out once per solid
const REACH = new WeakMap();
function reachOf(box) {
  let r = REACH.get(box);
  if (r) return r;
  const half = (i) => (box.axes ? box.axes.reduce((sum, axis, k) => sum + Math.abs(axis[i]) * box.size[k] / 2, 0) : box.size[i] / 2);
  const [hx, hy, hz] = [half(0), half(1), half(2)];
  r = { x0: box.center[0] - hx, x1: box.center[0] + hx, y0: box.center[1] - hy, y1: box.center[1] + hy, z0: box.center[2] - hz, z1: box.center[2] + hz };
  REACH.set(box, r);
  return r;
}

/** The solids that could stand anywhere along a run (its box, a body's width aside and a head's height up). */
function solidsAlong(solids, from, to, nav) {
  const pad = nav.halfWidth + 0.05;
  const x0 = Math.min(from.x, to.x) - pad, x1 = Math.max(from.x, to.x) + pad;
  const z0 = Math.min(from.z, to.z) - pad, z1 = Math.max(from.z, to.z) + pad;
  const top = Math.max(...nav.heights);
  const y0 = Math.min(from.y, to.y) + Math.min(...nav.heights) - 0.05, y1 = Math.max(from.y, to.y) + top + 0.05;
  return solids.filter((box) => {
    if (!box?.center || !box?.size) return false;
    const r = reachOf(box);
    return r.x1 >= x0 && r.x0 <= x1 && r.z1 >= z0 && r.z0 <= z1 && r.y1 >= y0 && r.y0 <= y1;
  });
}

export function runClear(world, from, to, nav = NAV) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return true;
  const side = { x: -dz / length, z: dx / length };
  // (only what stands near the run can stop it: the same answer as testing every solid, for far fewer rays)
  const near = world?.solids?.length ? solidsAlong(world.solids, from, to, nav) : [];
  if (near.length) {
    for (const height of nav.heights) {
      for (const offset of [0, -nav.halfWidth, nav.halfWidth]) {
        const origin = [from.x + side.x * offset, from.y + height, from.z + side.z * offset];
        const direction = [dx, to.y - from.y, dz];
        const range = Math.hypot(dx, to.y - from.y, dz);
        if (findSwordWorldHit(origin, direction, range, near)) return false;
      }
    }
  }
  if (world?.floors?.length || world?.ramps?.length) {
    const steps = Math.max(1, Math.ceil(length / nav.step));
    let underfoot = from.y;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      // the highest ground a knight standing at `underfoot` can step onto there (surfaceHeightAt: up to a step up)
      const ground = surfaceHeightAt(lerp(from.x, to.x, t), lerp(from.z, to.z, t), underfoot, world);
      if (ground === null || ground < underfoot - nav.drop) return false;
      underfoot = ground;
    }
    if (Math.abs(underfoot - to.y) > 0.7) return false;
  }
  return true;
}

const GRAPHS = new WeakMap();

/** A world's waypoints and the links between them (worked out once): { nodes, links: [[{ to, cost }]] }. */
export function navGraph(world, nav = NAV) {
  if (!world?.navigation?.nodes?.length) return null;
  let graph = GRAPHS.get(world);
  if (graph) return graph;
  const nodes = world.navigation.nodes;
  const links = nodes.map(() => []);
  const prepared = world.navigation.precomputed;
  if (nav === NAV && prepared && prepared.policy === JSON.stringify(nav) && prepared.signature === navigationSignature(world)) {
    for (const [a,b,cost] of prepared.edges) {
      links[a].push({to:b,cost}); links[b].push({to:a,cost});
    }
    graph = {nodes,links}; GRAPHS.set(world,graph); return graph;
  }
  for (let a = 0; a < nodes.length; a += 1) {
    for (let b = a + 1; b < nodes.length; b += 1) {
      const cost = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y, nodes[a].z - nodes[b].z);
      if (cost > nav.linkReach) continue;
      if (!runClear(world, nodes[a], nodes[b], nav) || !runClear(world, nodes[b], nodes[a], nav)) continue;
      links[a].push({ to: b, cost });
      links[b].push({ to: a, cost });
    }
  }
  graph = { nodes, links };
  GRAPHS.set(world, graph);
  return graph;
}

/**
 * The shortest run of waypoints from `from` to `to` (indices into the world's nodes), or null when there is none (or
 * no graph). Starts at any waypoint reachable straight from `from`, ends at any from which `to` is reachable straight.
 */
export function routeBetween(world, from, to, nav = NAV) {
  const graph = navGraph(world, nav);
  if (!graph) return null;
  const { nodes, links } = graph;
  // a route starts at a waypoint the bot can run to, and ends at one from which the target can be run to (in that
  // direction: a ledge a bot could drop from is no start for a bot below it)
  const near = (point, outward) => nodes.map((node, i) => ({ i, cost: Math.hypot(node.x - point.x, node.z - point.z) }))
    .filter(({ cost }) => cost <= nav.linkReach * 1.5)
    .sort((a, b) => a.cost - b.cost)
    .filter(({ i }) => (outward ? runClear(world, point, nodes[i], nav) : runClear(world, nodes[i], point, nav)));
  const starts = near(from, true);
  if (!starts.length) return null;
  const ends = new Map(near(to, false).map(({ i, cost }) => [i, cost]));
  if (!ends.size) return null;
  // Dijkstra: a handful of waypoints, so a plain scan for the nearest open one does
  const cost = new Array(nodes.length).fill(Infinity);
  const previous = new Array(nodes.length).fill(-1);
  const done = new Array(nodes.length).fill(false);
  for (const { i, cost: c } of starts) cost[i] = Math.min(cost[i], c);
  let best = null;
  for (;;) {
    let current = -1;
    for (let i = 0; i < nodes.length; i += 1) if (!done[i] && cost[i] < Infinity && (current < 0 || cost[i] < cost[current])) current = i;
    if (current < 0) break;
    done[current] = true;
    if (ends.has(current)) {
      const total = cost[current] + ends.get(current);
      if (!best || total < best.total) best = { total, end: current };
    }
    if (best && cost[current] > best.total) break;
    for (const { to: next, cost: c } of links[current]) {
      if (cost[current] + c < cost[next]) {
        cost[next] = cost[current] + c;
        previous[next] = current;
      }
    }
  }
  if (!best) return null;
  const route = [];
  for (let i = best.end; i >= 0; i = previous[i]) route.unshift(i);
  return route;
}

/** A point a step or two to one side from which `to` can be run to straight (the given side first), or null. */
export function sidestepToward(world, from, to, side = 1, nav = NAV) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz) || 1;
  for (const reach of nav.sidesteps) {
    for (const ahead of nav.sidestepsAhead) {
      if (ahead >= length) continue;
      for (const way of [side, -side]) {
        const point = {
          x: from.x + (dx / length) * ahead - (dz / length) * reach * way,
          y: from.y,
          z: from.z + (dz / length) * ahead + (dx / length) * reach * way,
        };
        if (runClear(world, from, point, nav) && runClear(world, point, to, nav)) return point;
      }
    }
  }
  return null;
}

/**
 * Where a bot should head for its foe: straight at them when it can run there straight, otherwise a step aside or the
 * next waypoint on the way round (null: straight, or no way known). Kept on the bot's own mind (ai.route: points),
 * looked at again now and then.
 */
export function wayToward(world, actor, target, ai, nowSec, nav = NAV) {
  if (!world?.navigation?.nodes?.length) return null;
  if (!(nowSec < (ai.routeCheckAt ?? -Infinity))) {
    ai.routeCheckAt = nowSec + nav.rethinkSec;
    ai.route = null;
    if (!runClear(world, actor.position, target.position, nav)) {
      const aside = sidestepToward(world, actor.position, target.position, ai.strafeDirection || 1, nav);
      const nodes = aside ? null : routeBetween(world, actor.position, target.position, nav);
      ai.route = aside ? [aside] : nodes?.map((i) => navGraph(world, nav).nodes[i]) ?? null;
    }
  }
  const route = ai.route;
  if (!route?.length) return null;
  // past the points already reached
  while (route.length) {
    const point = route[0];
    if (Math.hypot(point.x - actor.position.x, point.z - actor.position.z) > nav.arrived) break;
    route.shift();
  }
  if (!route.length) {
    ai.route = null;
    return null;
  }
  return route[0];
}
