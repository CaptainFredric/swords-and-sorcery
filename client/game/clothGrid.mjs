// Cloth for the Spellblade's cape and tabard: a small grid of particles, simulated in the world (position-based
// dynamics), that the rig's cloth bones follow. Pure math on plain arrays (no three.js), so it runs in node tests;
// ClothGridRig reads the skeleton into it and writes the bones back.
//
// Each grid is columns of nodes hanging from the body: row 0 is pinned where the body holds the cloth (the cape at the
// shoulders, the tabard at the belt), the rows below are free. Every frame:
//   the cloth is carried with the body by part of its own motion (inertia): a sudden start, stop or turn swings it by
//     the rest, as a heavy cloth does, instead of flinging it the whole way; the air it moves through is still the
//     world's, so a steady run trails it as fully as before;
//   gravity and air drag move the free nodes (so the cloth keeps its own momentum: it trails a run, swings on a stop
//     or a turn, and flies up on a fall);
//   a gentle pull draws each node back toward the cloth's authored drape on the body (firm near where it hangs from,
//     loose at the hem), so it keeps its shape at rest instead of collapsing onto him;
//   constraints keep the cloth from stretching (down each column: hard; across, and on the diagonals: softer), and
//     from folding up on itself;
//   capsules round his back, hips, thighs and shins push it out of the body (without a bounce: it slides on him), and
//     it stays above the ground;
//   and it keeps to its own side of him: never nearer his body than its reach from where it hangs at rest (the cape
//     behind him, the tabard in front: a swing stops against him instead of passing through), and never above where
//     it hangs from (a cape flies out level at most, never over his head).

export const CLOTH_GRID_SPECS = Object.freeze({
  cape: Object.freeze({
    prefix: 'cape', columns: Object.freeze(['L', 'C', 'R']), rows: 4, anchor: 'chest',
    // how quickly each row returns toward its drape (1/s): row 0 is pinned
    follow: Object.freeze([0, 7, 3.2, 1.8, 1.2]),
    drag: 1.4,
    width: 1, shear: 0.3, bend: 0.25,
    colliders: Object.freeze(['torso', 'hips', 'thigh.L', 'thigh.R', 'shin.L', 'shin.R']),
    // the share of his own motion the cloth feels (1: all of it, a loose cloth; 0: none, carried rigidly with him)
    inertia: Object.freeze({ move: 0.55, turn: 0.3 }),
    // how near his body (m) each row may come from where it hangs at rest: the cape against his back, then his legs
    reach: Object.freeze([0, 0.02, 0.03, 0.05, 0.07]),
    // how high (m) above where it hangs from any node may rise (or each row's, as a list)
    rise: 0.04,
    // how far (m) the cloth reaches beyond its outer columns (its edges collide too)
    span: 0.15,
  }),
  tabard: Object.freeze({
    prefix: 'tabard', columns: Object.freeze(['L', 'R']), rows: 3, anchor: 'pelvis',
    follow: Object.freeze([0, 9, 4, 2.4]),
    drag: 1.6,
    width: 1, shear: 0.3, bend: 0.25,
    colliders: Object.freeze(['thigh.L', 'thigh.R', 'shin.L', 'shin.R']),
    inertia: Object.freeze({ move: 0.55, turn: 0.3 }),
    reach: Object.freeze([0, 0.02, 0.05, 0.08]),
    // (each row's own: a knee lifts the tabard's hem out to about level, but never folds it up over the belt)
    rise: Object.freeze([0, 0.04, -0.04, -0.12]),
    span: 0.09,
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

/**
 * A bone's name as the glTF loader leaves it (three's PropertyBinding.sanitizeNodeName): whitespace to underscores,
 * and the characters a property path reserves ([ ] . : /) dropped, so 'cape.C.1' arrives as 'capeC1'.
 */
export function loadedBoneName(name) {
  return String(name).replace(/\s/g, '_').replace(/[[\].:/]/g, '');
}

export const CLOTH_GRAVITY = Object.freeze([0, -9.81, 0]);
const SUBSTEP = 1 / 120;
const MAX_SUBSTEPS = 8;
const ITERATIONS = 6;
const TELEPORT_DISTANCE = 2;
const MAX_SPEED = 25;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const unit = (a) => { const l = len(a); return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };

// quaternions as [x, y, z, w]
const qMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qInv = (q) => [-q[0], -q[1], -q[2], q[3]];
function qPow(q, t) {
  // the same turn about the same axis, t of the way (the short way round)
  const s = q[3] < 0 ? -1 : 1;
  const w = Math.max(-1, Math.min(1, q[3] * s));
  const angle = 2 * Math.acos(w);
  const sinHalf = Math.sqrt(Math.max(0, 1 - w * w));
  if (sinHalf < 1e-9) return [0, 0, 0, 1];
  const axis = [q[0] * s / sinHalf, q[1] * s / sinHalf, q[2] * s / sinHalf];
  const half = angle * t / 2;
  return [axis[0] * Math.sin(half), axis[1] * Math.sin(half), axis[2] * Math.sin(half), Math.cos(half)];
}
function qSlerp(a, b, t) {
  const d = dot(a, b) + a[3] * b[3];
  const bb = d < 0 ? b.map((x) => -x) : b;
  return qMul(qPow(qMul(bb, qInv(a)), t), a);
}
function qRotate(q, v) {
  const p = qMul(qMul(q, [v[0], v[1], v[2], 0]), qInv(q));
  return [p[0], p[1], p[2]];
}

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
    body: null,
    colliders: null,
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
export function resetClothGrid(grid, targets, body = null) {
  for (let c = 0; c < grid.columns; c += 1) {
    for (let r = 0; r <= grid.rows; r += 1) {
      const i = index(grid, c, r);
      grid.x[i] = [...targets[c][r]];
      grid.prev[i] = [...targets[c][r]];
      grid.targets[c][r] = [...targets[c][r]];
    }
    grid.pinned[c] = [...targets[c][0]];
  }
  grid.body = body ? { position: [...body.position], quaternion: [...body.quaternion] } : null;
  grid.colliders = null;
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
  const l2 = dot(ab, ab);
  const t = l2 > 1e-12 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
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

// a node moved by a contact: it keeps no speed into what it touched (no bounce, and no pushing back in), and slides on
function touch(grid, i, push) {
  const p = grid.x[i];
  for (let k = 0; k < 3; k += 1) p[k] += push[k];
  const n = unit(push);
  const v = sub(p, grid.prev[i]);
  const into = Math.min(0, dot(v, n));
  for (let k = 0; k < 3; k += 1) grid.prev[i][k] = p[k] - (v[k] - n[k] * into);
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

// the cloth against the body: at every node, between nodes (down and across), and out to the cloth's edges beyond
// its outer columns, so a leg can neither slip between two nodes nor pass through the cloth's sides
function collide(grid, colliders, ground) {
  const span = grid.spec.span ?? 0;
  const push = (point, nodes) => {
    for (const capsule of colliders) {
      const out = pushOut(point, capsule);
      if (!out) continue;
      for (const i of nodes) touch(grid, i, out);
      for (let k = 0; k < 3; k += 1) point[k] += out[k];
    }
  };
  for (let c = 0; c < grid.columns; c += 1) {
    for (let r = 1; r <= grid.rows; r += 1) {
      const i = index(grid, c, r);
      push([...grid.x[i]], [i]);
      if (grid.x[i][1] < ground) touch(grid, i, [0, ground - grid.x[i][1], 0]);
      // down the column (from where it hangs, the free node takes the whole push)
      const j = index(grid, c, r - 1);
      push(lerp(grid.x[j], grid.x[i], 0.5), r - 1 > 0 ? [i, j] : [i, i]);
      // across, to the next column
      if (c + 1 < grid.columns) push(lerp(grid.x[i], grid.x[index(grid, c + 1, r)], 0.5), [i, index(grid, c + 1, r)]);
      // out to the edge
      if (span > 0 && grid.columns > 1 && (c === 0 || c === grid.columns - 1)) {
        const side = unit(sub(grid.x[i], grid.x[index(grid, c === 0 ? 1 : c - 1, r)]));
        push(grid.x[i].map((x, k) => x + side[k] * span), [i]);
      }
    }
  }
}

// its own side of him: never nearer his body than its reach from the drape, never above where it hangs from
function keepSide(grid, target, frame) {
  const { reach = [], rise = Infinity } = grid.spec;
  const outward = frame.outward;
  const up = frame.up;
  for (let c = 0; c < grid.columns; c += 1) {
    const top = target(c, 0);
    for (let r = 1; r <= grid.rows; r += 1) {
      const i = index(grid, c, r);
      if (outward) {
        const d = dot(sub(grid.x[i], target(c, r)), outward) + (reach[r] ?? 0);
        if (d < 0) touch(grid, i, outward.map((x) => -x * d));
      }
      const limit = Array.isArray(rise) ? rise[r] : rise;
      if (up && Number.isFinite(limit)) {
        const h = dot(sub(grid.x[i], top), up) - limit;
        if (h > 0) touch(grid, i, up.map((x) => -x * h));
      }
    }
  }
}

/**
 * One frame. frame: {
 *   targets[column][row] (the drape on the body this frame, world), colliders: [{ a, b, radius }] (world),
 *   ground (world y), wind? [x, y, z] (m/s of air moving past),
 *   body? { position, quaternion [x, y, z, w] } (the body's own place and turn this frame, world: the cloth is carried
 *     with its motion by all but the spec's inertia share),
 *   outward? (unit, world: the way from his body to the cloth), up? (unit, world: his up)
 * }.
 */
export function stepClothGrid(grid, dt, frame) {
  if (!(dt > 0)) return grid;
  // (a jump in where it hangs from: a respawn or a teleport, not motion)
  const moved = Math.max(...frame.targets.map((column, c) => len(sub(column[0], grid.pinned[c]))));
  if (!Number.isFinite(moved) || moved > TELEPORT_DISTANCE) {
    resetClothGrid(grid, frame.targets, frame.body);
    return grid;
  }
  const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(dt / SUBSTEP)));
  const h = dt / steps;
  const keep = Math.exp(-grid.spec.drag * h);
  const fromTargets = grid.targets;
  const inertia = grid.spec.inertia ?? { move: 1, turn: 1 };
  const bodyFrom = grid.body;
  const bodyTo = frame.body ?? null;
  const carrying = Boolean(bodyFrom && bodyTo);
  // the air: the world's, seen from the share of his motion the cloth is carried by (so a steady run trails it fully)
  const carried = carrying ? sub(bodyTo.position, bodyFrom.position).map((x) => x * (1 - inertia.move) / dt) : [0, 0, 0];
  const wind = sub(frame.wind ?? [0, 0, 0], carried);
  const fromColliders = grid.colliders && grid.colliders.length === (frame.colliders ?? []).length ? grid.colliders : null;
  let bodyAt = carrying ? bodyFrom : null;
  for (let s = 1; s <= steps; s += 1) {
    const t = s / steps;
    // the drape and where it hangs from, moved through the frame a substep at a time (no snap per frame)
    const target = (c, r) => lerp(fromTargets[c][r], frame.targets[c][r], t);
    const colliders = (frame.colliders ?? []).map((capsule, k) => (fromColliders
      ? { a: lerp(fromColliders[k].a, capsule.a, t), b: lerp(fromColliders[k].b, capsule.b, t), radius: capsule.radius }
      : capsule));
    if (carrying) {
      // carried with him by the rest of his motion this substep: his move, and his turn about where he stands
      const next = { position: lerp(bodyFrom.position, bodyTo.position, t), quaternion: qSlerp(bodyFrom.quaternion, bodyTo.quaternion, t) };
      const move = sub(next.position, bodyAt.position).map((x) => x * (1 - inertia.move));
      const turn = qPow(qMul(next.quaternion, qInv(bodyAt.quaternion)), 1 - inertia.turn);
      for (let c = 0; c < grid.columns; c += 1) {
        for (let r = 1; r <= grid.rows; r += 1) {
          const i = index(grid, c, r);
          for (const p of [grid.x[i], grid.prev[i]]) {
            const around = qRotate(turn, sub(p, bodyAt.position));
            for (let k = 0; k < 3; k += 1) p[k] = bodyAt.position[k] + around[k] + move[k];
          }
        }
      }
      bodyAt = next;
    }
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
      collide(grid, colliders, frame.ground ?? -Infinity);
      keepSide(grid, target, frame);
    }
  }
  grid.targets = frame.targets.map((column) => column.map((p) => [...p]));
  grid.pinned = frame.targets.map((column) => [...column[0]]);
  grid.body = bodyTo ? { position: [...bodyTo.position], quaternion: [...bodyTo.quaternion] } : null;
  grid.colliders = (frame.colliders ?? []).map((capsule) => ({ a: [...capsule.a], b: [...capsule.b], radius: capsule.radius }));
  if (grid.x.some((p) => !p.every(Number.isFinite))) resetClothGrid(grid, frame.targets, frame.body);
  return grid;
}

/** The node at a column and row (world). */
export function clothNode(grid, column, row) {
  return grid.x[index(grid, column, row)];
}
