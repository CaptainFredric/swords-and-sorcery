// Cloth for the Spellblade's cape and tabard: a small grid of particles, simulated in the world (position-based
// dynamics), that the rig's cloth bones follow. Pure math on plain arrays (no three.js), so it runs in node tests;
// ClothGridRig reads the skeleton into it and writes the bones back.
//
// Each grid is columns of nodes hanging from the body: row 0 is pinned where the body holds the cloth (the cape at the
// shoulders, the tabard at the belt), the rows below are free. Every frame:
//   gravity and air drag move the free nodes (in the world, so the cloth keeps its own momentum: it trails a run,
//     swings on a stop or a turn, and flies up on a fall);
//   a gentle pull draws each node back toward the cloth's authored drape on the body (firm near where it hangs from,
//     loose at the hem), so it keeps its shape at rest instead of collapsing onto him;
//   constraints keep the cloth from stretching (down each column: hard; across, and on the diagonals: softer), and
//     from folding up on itself;
//   capsules round his back, hips, thighs and shins push it out of the body, and it stays above the ground.

export const CLOTH_GRID_SPECS = Object.freeze({
  cape: Object.freeze({
    prefix: 'cape', columns: Object.freeze(['L', 'C', 'R']), rows: 4, anchor: 'chest',
    // how quickly each row returns toward its drape (1/s): row 0 is pinned
    follow: Object.freeze([0, 7, 3.2, 1.8, 1.2]),
    drag: 1.1,
    width: 0.8, shear: 0.3, bend: 0.25,
    colliders: Object.freeze(['torso', 'hips', 'thigh.L', 'thigh.R', 'shin.L', 'shin.R']),
  }),
  tabard: Object.freeze({
    prefix: 'tabard', columns: Object.freeze(['L', 'R']), rows: 3, anchor: 'pelvis',
    follow: Object.freeze([0, 9, 4, 2.4]),
    drag: 1.4,
    width: 0.85, shear: 0.3, bend: 0.25,
    colliders: Object.freeze(['thigh.L', 'thigh.R', 'shin.L', 'shin.R']),
  }),
});

// the body the cloth rests against: capsules between two joints (bone heads), radii measured on the model
export const CLOTH_COLLIDERS = Object.freeze({
  torso: Object.freeze({ from: 'pelvis', to: 'neck', radius: 0.21 }),
  hips: Object.freeze({ from: 'thigh.L', to: 'thigh.R', radius: 0.15 }),
  'thigh.L': Object.freeze({ from: 'thigh.L', to: 'shin.L', radius: 0.13 }),
  'thigh.R': Object.freeze({ from: 'thigh.R', to: 'shin.R', radius: 0.13 }),
  'shin.L': Object.freeze({ from: 'shin.L', to: 'foot.L', radius: 0.11 }),
  'shin.R': Object.freeze({ from: 'shin.R', to: 'foot.R', radius: 0.11 }),
});

export const CLOTH_GRAVITY = Object.freeze([0, -9.81, 0]);
const SUBSTEP = 1 / 120;
const MAX_SUBSTEPS = 8;
const ITERATIONS = 6;
const TELEPORT_DISTANCE = 2;
const MAX_SPEED = 25;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function index(grid, column, row) {
  return column * (grid.rows + 1) + row;
}

/**
 * A grid from the cloth's authored drape on the body: targets[column][row] = [x, y, z] in the world (row 0 where it
 * hangs from). Its rest shape (every constraint's length) is that drape.
 */
export function createClothGrid(spec, targets) {
  const columns = targets.length;
  const rows = targets[0].length - 1;
  const grid = {
    spec, columns, rows,
    x: targets.flat().map((p) => [...p]),
    prev: targets.flat().map((p) => [...p]),
    pinned: targets.map((column) => [...column[0]]),
    targets: targets.map((column) => column.map((p) => [...p])),
    links: [],
  };
  const link = (a, b, stiffness, mode = 'both') => grid.links.push({ a, b, rest: len(sub(grid.x[a], grid.x[b])), stiffness, mode });
  for (let c = 0; c < columns; c += 1) {
    for (let r = 1; r <= rows; r += 1) {
      link(index(grid, c, r - 1), index(grid, c, r), 1);
      if (r >= 2) link(index(grid, c, r - 2), index(grid, c, r), spec.bend, 'apart');
    }
  }
  for (let c = 0; c + 1 < columns; c += 1) {
    for (let r = 0; r <= rows; r += 1) {
      link(index(grid, c, r), index(grid, c + 1, r), spec.width);
      if (r >= 1) {
        link(index(grid, c, r - 1), index(grid, c + 1, r), spec.shear);
        link(index(grid, c + 1, r - 1), index(grid, c, r), spec.shear);
      }
    }
  }
  return grid;
}

/** Back onto the drape, still (a respawn, a teleport, a reset). */
export function resetClothGrid(grid, targets) {
  for (let c = 0; c < grid.columns; c += 1) {
    for (let r = 0; r <= grid.rows; r += 1) {
      const i = index(grid, c, r);
      grid.x[i] = [...targets[c][r]];
      grid.prev[i] = [...targets[c][r]];
      grid.targets[c][r] = [...targets[c][r]];
    }
    grid.pinned[c] = [...targets[c][0]];
  }
}

/** A push on the free cloth (velocity, m/s, in the world), stronger toward the hem: a gust, a landing. */
export function impulseClothGrid(grid, velocity) {
  for (let c = 0; c < grid.columns; c += 1) {
    for (let r = 1; r <= grid.rows; r += 1) {
      const i = index(grid, c, r);
      const share = r / grid.rows;
      for (let k = 0; k < 3; k += 1) grid.prev[i][k] -= velocity[k] * share * SUBSTEP;
    }
  }
}

function closestOnSegment(p, a, b) {
  const ab = sub(b, a);
  const l2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2)) : 0;
  return [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
}

// push a point out of a capsule; returns the push (or null)
function pushOut(p, capsule) {
  const c = closestOnSegment(p, capsule.a, capsule.b);
  const d = sub(p, c);
  const l = len(d);
  if (l >= capsule.radius) return null;
  if (l < 1e-6) return [0, 0, capsule.radius];
  const k = (capsule.radius - l) / l;
  return [d[0] * k, d[1] * k, d[2] * k];
}

function solveLinks(grid) {
  for (const { a, b, rest, stiffness, mode } of grid.links) {
    const wa = a % (grid.rows + 1) === 0 ? 0 : 1;
    const wb = b % (grid.rows + 1) === 0 ? 0 : 1;
    if (wa + wb === 0) continue;
    const d = sub(grid.x[b], grid.x[a]);
    const l = len(d);
    if (l < 1e-9) continue;
    if (mode === 'apart' && l >= rest) continue;
    const k = ((l - rest) / l) * stiffness / (wa + wb);
    for (let i = 0; i < 3; i += 1) {
      grid.x[a][i] += d[i] * k * wa;
      grid.x[b][i] -= d[i] * k * wb;
    }
  }
}

function collide(grid, colliders, ground) {
  const free = (r) => r > 0;
  for (let c = 0; c < grid.columns; c += 1) {
    for (let r = 0; r <= grid.rows; r += 1) {
      const i = index(grid, c, r);
      if (free(r)) {
        for (const capsule of colliders) {
          const push = pushOut(grid.x[i], capsule);
          if (push) for (let k = 0; k < 3; k += 1) grid.x[i][k] += push[k];
        }
        if (grid.x[i][1] < ground) grid.x[i][1] = ground;
      }
      // (and the middle of each segment, so a leg cannot slip between two nodes)
      if (r > 0) {
        const j = index(grid, c, r - 1);
        const mid = lerp(grid.x[j], grid.x[i], 0.5);
        for (const capsule of colliders) {
          const push = pushOut(mid, capsule);
          if (!push) continue;
          const shareJ = free(r - 1) ? 1 : 0;
          for (let k = 0; k < 3; k += 1) {
            grid.x[i][k] += push[k] * (shareJ ? 1 : 2);
            if (shareJ) grid.x[j][k] += push[k];
          }
        }
      }
    }
  }
}

/**
 * One frame. frame: { targets[column][row] (the drape on the body this frame, world), colliders: [{ a, b, radius }]
 * (world), ground (world y), wind? [x, y, z] (m/s of air moving past) }.
 */
export function stepClothGrid(grid, dt, frame) {
  if (!(dt > 0)) return grid;
  // (a jump in where it hangs from: a respawn or a teleport, not motion)
  const moved = Math.max(...frame.targets.map((column, c) => len(sub(column[0], grid.pinned[c]))));
  if (!Number.isFinite(moved) || moved > TELEPORT_DISTANCE) {
    resetClothGrid(grid, frame.targets);
    return grid;
  }
  const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(dt / SUBSTEP)));
  const h = dt / steps;
  const wind = frame.wind ?? [0, 0, 0];
  const keep = Math.exp(-grid.spec.drag * h);
  const fromTargets = grid.targets;
  for (let s = 1; s <= steps; s += 1) {
    const t = s / steps;
    // the drape and where it hangs from, moved through the frame a substep at a time (no snap per frame)
    const target = (c, r) => lerp(fromTargets[c][r], frame.targets[c][r], t);
    for (let c = 0; c < grid.columns; c += 1) {
      for (let r = 1; r <= grid.rows; r += 1) {
        const i = index(grid, c, r);
        const p = grid.x[i];
        const q = grid.prev[i];
        let v = [(p[0] - q[0]) * keep, (p[1] - q[1]) * keep, (p[2] - q[2]) * keep];
        const speed = len(v) / h;
        if (speed > MAX_SPEED) v = v.map((x) => x * (MAX_SPEED / speed));
        // air: drag toward the wind's speed, and gravity
        const air = 1 - keep;
        grid.prev[i] = [...p];
        for (let k = 0; k < 3; k += 1) p[k] += v[k] + (CLOTH_GRAVITY[k] * h + wind[k] * air) * h;
        // the pull back toward the drape: a shape, not a force (it moves the node and its last place together, so it
        // adds no speed: the cloth keeps its own momentum, and trails, swings and settles by it)
        const follow = 1 - Math.exp(-grid.spec.follow[r] * h);
        const goal = target(c, r);
        for (let k = 0; k < 3; k += 1) {
          const d = (goal[k] - p[k]) * follow;
          p[k] += d;
          grid.prev[i][k] += d;
        }
      }
      grid.x[index(grid, c, 0)] = target(c, 0);
    }
    for (let n = 0; n < ITERATIONS; n += 1) {
      solveLinks(grid);
      collide(grid, frame.colliders ?? [], frame.ground ?? -Infinity);
    }
  }
  grid.targets = frame.targets.map((column) => column.map((p) => [...p]));
  grid.pinned = frame.targets.map((column) => [...column[0]]);
  if (grid.x.some((p) => !p.every(Number.isFinite))) resetClothGrid(grid, frame.targets);
  return grid;
}

/** The node at a column and row (world). */
export function clothNode(grid, column, row) {
  return grid.x[index(grid, column, row)];
}
