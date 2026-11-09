// Measured world audit: what a knight can actually reach, where it can fall out, how long it takes to get anywhere,
// and how much room there is to swing a sword. Uses the authoritative collision (surfaceHeightAt, resolvePlayerWorld)
// and the real bot graph (botNav), so every number describes the game, not the drawing.
//
//   node scripts/world-audit.mjs                 all worlds, summary table
//   node scripts/world-audit.mjs restless-day    one world, with leak/spawn/nav detail
//   node scripts/world-audit.mjs --json          machine-readable (used by tests)

import { getWorld, WORLD_IDS } from '../shared/worlds/registry.mjs';
import { GREENER_PASTURES } from '../shared/worlds/greenerPastures.mjs';
import { surfaceHeightAt, resolvePlayerWorld } from '../shared/src/collision.mjs';
import { MOVEMENT, createMovementState, movePlayer } from '../shared/src/movement.mjs';
import { navGraph, routeBetween, runClear } from '../shared/sim/botNav.mjs';
import { EDGE_CONFIG } from '../shared/sim/edgeOfVictory.mjs';

export const AUDIT = Object.freeze({
  cell: 0.5,              // grid spacing (a body is 0.9 m across, so no wall thinner than this is skipped)
  bodyHeight: 1.8,
  crouchHeight: 1.2,
  jumpPeak: 1.44,         // a standing jump's apex (7.2^2 / (2*18))
  runSpeed: MOVEMENT.runSpeed,
  swordRoom: 3,           // clear radius that comfortably holds a duel (two bodies plus a blade's reach)
  coverHeight: 1.6,       // a solid at least this tall over the floor hides a standing knight
  coverReach: 2.5,
});

const R = MOVEMENT.playerRadius;
const maxOf = (values) => { let m = 0; for (const v of values) if (v > m) m = v; return m; };

function boxBoundsXZ(box) {
  const [cx, , cz] = box.center;
  const [sx, sy, sz] = box.size;
  if (box.axes) {
    const ex = box.axes.reduce((s, a, i) => s + Math.abs(a[0]) * box.size[i] / 2, 0);
    const ez = box.axes.reduce((s, a, i) => s + Math.abs(a[2]) * box.size[i] / 2, 0);
    return { x0: cx - ex, x1: cx + ex, z0: cz - ez, z1: cz + ez, y0: box.center[1] - sy / 2, y1: box.center[1] + sy / 2 };
  }
  return { x0: cx - sx / 2, x1: cx + sx / 2, z0: cz - sz / 2, z1: cz + sz / 2, y0: box.center[1] - sy / 2, y1: box.center[1] + sy / 2 };
}

/** A spatial bucket of solids so a body test looks only at what is near. */
function solidIndex(solids, bucket = 4) {
  const map = new Map();
  for (const box of solids ?? []) {
    if (!box?.center || !box?.size) continue;
    const b = boxBoundsXZ(box);
    for (let ix = Math.floor((b.x0 - R) / bucket); ix <= Math.floor((b.x1 + R) / bucket); ix++)
      for (let iz = Math.floor((b.z0 - R) / bucket); iz <= Math.floor((b.z1 + R) / bucket); iz++) {
        const k = ix * 100003 + iz;
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(box);
      }
  }
  return (x, z) => map.get(Math.floor(x / bucket) * 100003 + Math.floor(z / bucket)) ?? [];
}

export function worldBounds(world) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const f of world.floors ?? []) {
    x0 = Math.min(x0, f.center[0] - f.size[0] / 2); x1 = Math.max(x1, f.center[0] + f.size[0] / 2);
    z0 = Math.min(z0, f.center[2] - f.size[2] / 2); z1 = Math.max(z1, f.center[2] + f.size[2] / 2);
  }
  for (const r of world.ramps ?? []) {
    x0 = Math.min(x0, r.minX); x1 = Math.max(x1, r.maxX); z0 = Math.min(z0, r.minZ); z1 = Math.max(z1, r.maxZ);
  }
  return { x0: x0 - 2, x1: x1 + 2, z0: z0 - 2, z1: z1 + 2 };
}

/**
 * Flood every place a knight on foot can stand, starting from the spawns, by running (up a step, down any drop).
 * Returns the reachable cells, the void edges it could run (or hop a low lip) into, and head-clipping spots.
 */
export function floodWorld(world, { starts = world.spawnPoints ?? [], cell = AUDIT.cell, limit = null, height = AUDIT.bodyHeight } = {}) {
  const near = solidIndex(world.solids);
  const clearCache = new Map();
  const bodyClear = (x, z, y, h = height) => {
    const key = `${x.toFixed(2)},${z.toFixed(2)},${y.toFixed(2)},${h}`;
    if (clearCache.has(key)) return clearCache.get(key);
    const placed = resolvePlayerWorld({ x, y, z }, R, near(x, z), h);
    const ok = Math.hypot(placed.x - x, placed.z - z) < 1e-3;
    clearCache.set(key, ok);
    return ok;
  };
  const b = worldBounds(world);
  const nx = Math.ceil((b.x1 - b.x0) / cell), nz = Math.ceil((b.z1 - b.z0) / cell);
  const cx = (i) => b.x0 + (i + 0.5) * cell, cz = (j) => b.z0 + (j + 0.5) * cell;
  const keyOf = (i, j, y) => `${i},${j},${Math.round(y * 20)}`;
  const cells = new Map();     // key -> { i, j, x, z, y }
  const leaks = [];            // { x, z, y, kind: 'walk' | 'jump' }
  const queue = [];
  const push = (i, j, y, from) => {
    if (i < 0 || j < 0 || i >= nx || j >= nz) return;
    if (limit && !limit(cx(i), cz(j))) return;
    const k = keyOf(i, j, y);
    if (cells.has(k)) return;
    cells.set(k, { i, j, x: cx(i), z: cz(j), y, from });
    queue.push(k);
  };
  const startCells = [];
  for (const s of starts) {
    const i = Math.round((s.x - b.x0) / cell - 0.5), j = Math.round((s.z - b.z0) / cell - 0.5);
    const y = surfaceHeightAt(cx(i), cz(j), (s.y ?? 0) + 0.1, world);
    if (y === null || !bodyClear(cx(i), cz(j), y)) continue;
    startCells.push(keyOf(i, j, y));
    push(i, j, y, null);
  }
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let q = 0; q < queue.length; q++) {
    const c = cells.get(queue[q]);
    for (const [di, dj] of DIRS) {
      const i = c.i + di, j = c.j + dj, x = cx(i), z = cz(j);
      if (limit && !limit(x, z)) continue;
      const ground = surfaceHeightAt(x, z, c.y, world);
      if (ground === null) {
        if (bodyClear(x, z, c.y)) leaks.push({ x, z, y: c.y, kind: 'walk', fx: c.x, fz: c.z });
        else if (bodyClear(x, z, c.y, AUDIT.crouchHeight)) leaks.push({ x, z, y: c.y, kind: 'crouch', fx: c.x, fz: c.z });
        else if (bodyClear(x, z, c.y + AUDIT.jumpPeak, AUDIT.bodyHeight - 0.3)) leaks.push({ x, z, y: c.y, kind: 'jump', fx: c.x, fz: c.z });
        continue;
      }
      if (!bodyClear(x, z, ground)) continue;
      // diagonal moves must not squeeze between two corners
      if (di && dj && (!bodyClear(cx(c.i + di), cz(c.j), c.y) || !bodyClear(cx(c.i), cz(c.j + dj), c.y))) continue;
      push(i, j, ground, queue[q]);
    }
  }
  // head clipping: standing under a floor slab lower than a body
  const headClips = [];
  for (const c of cells.values()) {
    for (const f of world.floors ?? []) {
      const under = f.center[1] - f.size[1] / 2;
      if (under <= c.y + 0.2 || under >= c.y + AUDIT.bodyHeight) continue;
      if (Math.abs(c.x - f.center[0]) <= f.size[0] / 2 && Math.abs(c.z - f.center[2]) <= f.size[2] / 2) { headClips.push({ x: c.x, z: c.z, y: c.y, floor: f.id }); break; }
    }
  }
  return { cells, leaks: dedupeLeaks(leaks), headClips, cell, bounds: b, nx, nz, bodyClear, startCells, keyOf, cx, cz };
}

function dedupeLeaks(leaks) {
  const seen = new Set();
  return leaks.filter((l) => { const k = `${l.x},${l.z},${l.kind}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Group points within `gap` metres of each other into clusters: [{ n, x0, x1, z0, z1, y }]. */
export function cluster(points, gap = 1.1) {
  const out = [];
  const left = points.slice();
  while (left.length) {
    const seed = left.pop();
    const group = [seed];
    for (let g = 0; g < group.length; g++) {
      for (let k = left.length - 1; k >= 0; k--) {
        if (Math.abs(left[k].x - group[g].x) <= gap && Math.abs(left[k].z - group[g].z) <= gap) group.push(left.splice(k, 1)[0]);
      }
    }
    out.push({ n: group.length, kind: seed.kind, y: seed.y, sample: seed.fx !== undefined ? { from: [seed.fx, seed.y, seed.fz], to: [seed.x, seed.z] } : undefined,
      x0: Math.min(...group.map((p) => p.x)), x1: Math.max(...group.map((p) => p.x)),
      z0: Math.min(...group.map((p) => p.z)), z1: Math.max(...group.map((p) => p.z)) });
  }
  return out.sort((a, b) => b.n - a.n);
}

/** Replay a leak with the real movement code: run (crouched if need be) from its cell toward the void for 2 s. */
export function confirmLeak(world, leak) {
  if (!leak.sample) return null;
  const [fx, fy, fz] = leak.sample.from, [tx, tz] = leak.sample.to;
  let state = { ...createMovementState({ x: fx, y: fy, z: fz }), grounded: true, crouched: leak.kind === 'crouch' };
  const yaw = Math.atan2(-(tx - fx), -(tz - fz));
  for (let i = 0; i < 60; i++) {
    state = movePlayer(state, { forward: 1, yaw, crouch: leak.kind === 'crouch', jump: leak.kind === 'jump' && i % 12 === 0 }, 1 / 30, i / 30, world);
    if (state.position.y < fy - 3) return { fell: true, at: [+state.position.x.toFixed(2), +state.position.z.toFixed(2)] };
  }
  return { fell: false, at: [+state.position.x.toFixed(2), +state.position.y.toFixed(2), +state.position.z.toFixed(2)] };
}

/** Per reachable cell, the distance to the nearest place a body cannot be (solid or void): a sword-room map. */
export function clearanceMap(flood) {
  const { cells, cell } = flood;
  const byIJ = new Map();
  for (const [k, c] of cells) {
    const ij = `${c.i},${c.j}`;
    if (!byIJ.has(ij)) byIJ.set(ij, []);
    byIJ.get(ij).push(k);
  }
  const dist = new Map();
  const queue = [];
  // seeds: cells that touch a non-cell (a blocked or void neighbour at the same level)
  for (const [k, c] of cells) {
    let edge = false;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ks = byIJ.get(`${c.i + di},${c.j + dj}`) ?? [];
      if (!ks.some((n) => Math.abs(cells.get(n).y - c.y) <= 0.66)) { edge = true; break; }
    }
    if (edge) { dist.set(k, R + cell / 2); queue.push(k); }
  }
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q], c = cells.get(k), d = dist.get(k);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const n of byIJ.get(`${c.i + di},${c.j + dj}`) ?? []) {
        if (dist.has(n) || Math.abs(cells.get(n).y - c.y) > 0.66) continue;
        dist.set(n, d + cell);
        queue.push(n);
      }
    }
  }
  return dist;
}

/** Shortest running distance (m) over the flood from a set of start points to every cell (Dijkstra on the grid). */
export function runDistances(world, flood, starts) {
  const { cells, cell } = flood;
  const byIJ = new Map();
  for (const [k, c] of cells) {
    const ij = `${c.i},${c.j}`;
    if (!byIJ.has(ij)) byIJ.set(ij, []);
    byIJ.get(ij).push(k);
  }
  const dist = new Map();
  // a small binary heap
  const heap = [];
  const up = (i) => { while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const down = (i) => { for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } };
  const add = (d, k) => { heap.push([d, k]); up(heap.length - 1); };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; down(0); } return top; };
  for (const s of starts) {
    const k = nearestCell(flood, s);
    if (k) { dist.set(k, 0); add(0, k); }
  }
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (heap.length) {
    const [d, k] = pop();
    if (d > dist.get(k)) continue;
    const c = cells.get(k);
    for (const [di, dj, w] of DIRS) {
      for (const n of byIJ.get(`${c.i + di},${c.j + dj}`) ?? []) {
        const nc = cells.get(n);
        // up no more than a step, down any distance (a fall), as the flood allowed
        if (nc.y > c.y + 0.66) continue;
        const nd = d + w * cell + Math.max(0, nc.y - c.y) * 0.5;
        if (nd < (dist.get(n) ?? Infinity)) { dist.set(n, nd); add(nd, n); }
      }
    }
  }
  return dist;
}

export function nearestCell(flood, p, maxDy = 0.8) {
  const { cells, bounds, cell } = flood;
  if (!flood.byIJ) {
    flood.byIJ = new Map();
    for (const [k, c] of cells) { const ij = `${c.i},${c.j}`; if (!flood.byIJ.has(ij)) flood.byIJ.set(ij, []); flood.byIJ.get(ij).push(k); }
  }
  const i0 = Math.round((p.x - bounds.x0) / cell - 0.5), j0 = Math.round((p.z - bounds.z0) / cell - 0.5);
  for (let r = 0; r <= 6; r++) {
    let best = null, bestD = Infinity;
    for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - r; j <= j0 + r; j++) {
      if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r) continue;
      for (const k of flood.byIJ.get(`${i},${j}`) ?? []) {
        const c = cells.get(k);
        if (p.y !== undefined && Math.abs(c.y - p.y) > maxDy + r * 0.3) continue;
        const d = Math.hypot(c.x - p.x, c.z - p.z) + Math.abs(c.y - (p.y ?? c.y));
        if (d < bestD) { bestD = d; best = k; }
      }
    }
    if (best) return best;
  }
  return null;
}

function spawnReport(world, flood) {
  const near = (s) => resolvePlayerWorld({ x: s.x, y: s.y ?? 0, z: s.z }, R, world.solids ?? [], AUDIT.bodyHeight);
  return (world.spawnPoints ?? []).map((s, index) => {
    const ground = surfaceHeightAt(s.x, s.z, (s.y ?? 0) + 0.1, world);
    const placed = near(s);
    const pushed = Math.hypot(placed.x - s.x, placed.z - s.z);
    return { index, x: s.x, y: s.y ?? 0, z: s.z, team: s.team ?? null, phase: s.phase ?? null,
      supported: ground !== null && Math.abs(ground - (s.y ?? 0)) < 0.05, ground, pushed: +pushed.toFixed(3) };
  });
}

function navReport(world) {
  const graph = navGraph(world);
  if (!graph) return { nodes: 0, links: 0, components: 0, isolated: [], invalid: [] };
  const { nodes, links } = graph;
  const seen = new Array(nodes.length).fill(-1);
  let components = 0;
  const sizes = [];
  for (let s = 0; s < nodes.length; s++) {
    if (seen[s] >= 0) continue;
    const stack = [s]; seen[s] = components; let n = 0;
    while (stack.length) { const a = stack.pop(); n++; for (const { to } of links[a]) if (seen[to] < 0) { seen[to] = components; stack.push(to); } }
    sizes.push(n); components++;
  }
  const main = sizes.indexOf(Math.max(...sizes));
  const invalid = nodes.filter((n) => {
    const g = surfaceHeightAt(n.x, n.z, n.y + 0.1, world);
    const placed = resolvePlayerWorld({ x: n.x, y: n.y, z: n.z }, R, world.solids ?? [], AUDIT.bodyHeight);
    return g === null || Math.abs(g - n.y) > 0.1 || Math.hypot(placed.x - n.x, placed.z - n.z) > 1e-3;
  }).map((n) => n.id);
  return { nodes: nodes.length, links: links.reduce((s, l) => s + l.length, 0) / 2, components, sizes,
    isolated: nodes.filter((_, i) => seen[i] !== main).map((n) => n.id), invalid };
}

function objectivesOf(world) {
  if (world.objectives?.length) return world.objectives.map((o) => ({ id: o.id, x: o.x, y: o.y ?? 0, z: o.z, radius: o.radius }));
  if (world.restlessDay?.renowner) {
    const r = world.restlessDay.renowner;
    return [{ id: 'outer-wall-walk', x: 0, y: 6, z: -23.4 }, { id: 'inner-wall-walk', x: 0, y: 7, z: 22.8 },
      { id: 'renowner-front', x: 0, y: 0, z: r.z - 6 }];
  }
  return [];
}

/** The full report for one world. */
export function auditWorld(world, { detail = false } = {}) {
  const t0 = Date.now();
  const flood = floodWorld(world);
  // a crouched body passes under things a standing one cannot: its own flood finds the voids only a crouch reaches
  const low = floodWorld(world, { height: AUDIT.crouchHeight });
  const standing = new Set(flood.leaks.map((l) => `${l.x},${l.z}`));
  for (const l of low.leaks) if (!standing.has(`${l.x},${l.z}`) && l.kind === 'walk') flood.leaks.push({ ...l, kind: 'crouch' });
  const clear = clearanceMap(flood);
  const cells = [...flood.cells.values()];
  const area = cells.length * flood.cell ** 2;
  const levels = new Map();
  for (const c of cells) { const y = Math.round(c.y * 2) / 2; levels.set(y, (levels.get(y) ?? 0) + flood.cell ** 2); }
  const roomy = [...clear.values()].filter((d) => d >= AUDIT.swordRoom).length * flood.cell ** 2;
  const maxClear = maxOf(clear.values());
  // projectile cover: a tall solid within reach of a cell
  const near = solidIndex(world.solids);
  let covered = 0;
  for (const c of cells) {
    const hit = near(c.x, c.z).some((box) => {
      const bb = boxBoundsXZ(box);
      if (bb.y1 < c.y + AUDIT.coverHeight || bb.y0 > c.y + 0.5) return false;
      const dx = Math.max(bb.x0 - c.x, 0, c.x - bb.x1), dz = Math.max(bb.z0 - c.z, 0, c.z - bb.z1);
      return Math.hypot(dx, dz) <= AUDIT.coverReach;
    });
    if (hit) covered++;
  }
  const spawns = spawnReport(world, flood);
  const leakClusters = cluster(flood.leaks).map((c) => ({ ...c, replay: confirmLeak(world, c) }));
  // traversal: spawn-to-spawn for free-for-all worlds; team spawns to each objective for team worlds
  const objectives = objectivesOf(world);
  const traversal = {};
  const teamSpawns = (team, phase = null) => spawns.filter((s) => s.team === team && (phase === null || s.phase === phase || s.phase === null));
  const teams = [...new Set(spawns.map((s) => s.team).filter(Boolean))];
  const secs = (m) => (m === undefined || m === Infinity ? null : +(m / AUDIT.runSpeed).toFixed(1));
  if (teams.length) {
    for (const team of teams) {
      const from = teamSpawns(team, spawns.some((s) => s.team === team && s.phase !== null) ? 0 : null);
      const dist = runDistances(world, flood, from);
      traversal[team] = Object.fromEntries(objectives.map((o) => [o.id, secs(dist.get(nearestCell(flood, o)))]));
      const other = spawns.filter((s) => s.team && s.team !== team);
      traversal[team].enemySpawn = secs(Math.min(...other.map((s) => dist.get(nearestCell(flood, s)) ?? Infinity)));
    }
  } else {
    const pairs = [];
    for (let a = 0; a < spawns.length; a++) {
      const dist = runDistances(world, flood, [spawns[a]]);
      for (let b = a + 1; b < spawns.length; b++) pairs.push(dist.get(nearestCell(flood, spawns[b])) ?? Infinity);
    }
    const finite = pairs.filter(Number.isFinite).sort((p, q) => p - q);
    traversal.spawnPairs = { median: secs(finite[finite.length >> 1]), max: secs(finite.at(-1)), unreachable: pairs.length - finite.length };
  }
  // bot reachability: can the graph route between spawns and objectives?
  const nav = navReport(world);
  const routeChecks = [];
  if (nav.nodes) {
    const targets = objectives.length ? objectives : spawns.slice(0, 4);
    const sources = teams.length ? teams.map((t) => teamSpawns(t, 0)[0]).filter(Boolean) : spawns.slice(0, 2);
    for (const s of sources) for (const o of targets) {
      const direct = runClear(world, s, o);
      const route = direct ? [] : routeBetween(world, s, o);
      routeChecks.push({ from: `${s.team ?? 'spawn'}#${s.index}`, to: o.id ?? `spawn#${o.index}`, ok: direct || Boolean(route), hops: route?.length ?? 0 });
    }
  }
  const report = {
    id: world.id, name: world.name,
    footprint: { w: +(flood.bounds.x1 - flood.bounds.x0 - 4).toFixed(1), d: +(flood.bounds.z1 - flood.bounds.z0 - 4).toFixed(1) },
    reachableArea: Math.round(area),
    levels: [...levels.entries()].sort((a, b) => a[0] - b[0]).filter(([, m]) => m >= 2).map(([y, m]) => [y, Math.round(m)]),
    swordRoomShare: +(roomy / Math.max(1, area)).toFixed(2), maxClearRadius: +maxClear.toFixed(1),
    coverShare: +(covered / Math.max(1, cells.length)).toFixed(2),
    solids: world.solids?.length ?? 0, floors: world.floors?.length ?? 0, ramps: world.ramps?.length ?? 0,
    leaks: { walk: flood.leaks.filter((l) => l.kind === 'walk').length, crouch: flood.leaks.filter((l) => l.kind === 'crouch').length, jump: flood.leaks.filter((l) => l.kind === 'jump').length,
      clusters: leakClusters.slice(0, detail ? 40 : 6) },
    headClipCells: flood.headClips.length,
    spawns: { total: spawns.length, unsupported: spawns.filter((s) => !s.supported).map((s) => s.index), blocked: spawns.filter((s) => s.pushed > 0).map((s) => s.index),
      unreached: spawns.filter((s) => !nearestCell(flood, s)).map((s) => s.index) },
    traversal,
    nav: { nodes: nav.nodes, links: nav.links, components: nav.components, isolated: nav.isolated, invalid: nav.invalid, routes: routeChecks },
    ms: Date.now() - t0,
  };
  if (detail) report.headClips = cluster(flood.headClips.map((h) => ({ ...h, kind: h.floor })));
  return report;
}

/** Edge of Victory: each contraction stage traced against the ground a knight can stand on. */
export function auditEdgeStages(world = getWorld(WORLD_IDS.RUINED_KEEP), config = EDGE_CONFIG) {
  const { center } = config;
  return config.stages.map(({ second, radius }) => {
    const limit = (x, z) => Math.hypot(x - center.x, z - center.z) <= radius - config.playerClearance;
    // every spawn the mode might use, and the centre, as seeds: which pieces of floor are cut off from one another?
    const seeds = [...(world.spawnPoints ?? []), { x: center.x, y: 0, z: center.z }].filter((p) => limit(p.x, p.z));
    const regions = [];
    const claimed = new Set();
    const all = floodWorld(world, { starts: seeds.length ? seeds : [{ x: center.x, y: 0, z: center.z }], limit });
    // split the flood into connected regions (two-way: a drop you cannot climb back counts as one-way)
    for (const [k] of all.cells) {
      if (claimed.has(k)) continue;
      const region = floodWorld(world, { starts: [all.cells.get(k)], limit });
      for (const rk of region.cells.keys()) claimed.add(rk);
      regions.push(region.cells.size * all.cell ** 2);
      if (regions.length > 12) break;
    }
    const clear = clearanceMap(all);
    const roomy = [...clear.values()].filter((d) => d >= AUDIT.swordRoom).length * all.cell ** 2;
    const total = all.cells.size * all.cell ** 2;
    return { second, radius, area: Math.round(total), regions: regions.map(Math.round).sort((a, b) => b - a),
      swordRoom: Math.round(roomy), maxClearRadius: +maxOf(clear.values()).toFixed(1), leaks: all.leaks.length };
  });
}

export function allWorlds() {
  // Greener Pastures is a tutorial run of over a kilometre: audited only when named
  return Object.values(WORLD_IDS).map(getWorld).filter((w) => w.id !== GREENER_PASTURES.id);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const ids = args.filter((a) => !a.startsWith('--'));
  const worlds = ids.length ? ids.map((id) => (id === 'greener-pastures' ? GREENER_PASTURES : getWorld(id))) : allWorlds();
  const reports = worlds.map((w) => auditWorld(w, { detail: ids.length > 0 }));
  if (ids.includes('ruined-keep') || !ids.length) reports.find((r) => r.id === 'ruined-keep').edgeStages = auditEdgeStages();
  if (json || ids.length) console.log(JSON.stringify(reports, null, 1));
  else {
    const rows = reports.map((r) => ({ id: r.id, 'size m': `${r.footprint.w}x${r.footprint.d}`, 'reach m2': r.reachableArea,
      levels: r.levels.length, 'sword%': Math.round(r.swordRoomShare * 100), 'cover%': Math.round(r.coverShare * 100),
      'leak w/c/j': `${r.leaks.walk}/${r.leaks.crouch}/${r.leaks.jump}`, 'falls': r.leaks.clusters.filter((c) => c.replay?.fell).length, headclip: r.headClipCells,
      'bad spawns': [...r.spawns.unsupported, ...r.spawns.blocked, ...r.spawns.unreached].length,
      'nav comp': r.nav.components, 'nav bad': r.nav.invalid.length, 'routes ok': `${r.nav.routes.filter((x) => x.ok).length}/${r.nav.routes.length}`,
      traverse: JSON.stringify(r.traversal).slice(0, 90), ms: r.ms }));
    console.table(rows);
  }
}
