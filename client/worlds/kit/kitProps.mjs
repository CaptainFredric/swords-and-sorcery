import { KIT_PALETTE as P, shadeColor } from './facetKit.mjs';

// Small props for the environment kit: the lived-in things of a town and its tourney ground. Each draws into the
// shared batch (so a scene of them is still a handful of meshes). Positions are on the ground plane at y (default 0);
// facing is the way a front looks, as a yaw (0 faces +z, Math.PI faces -z).

const STRAW = 0xc9a65e;
const BLOOMS = [0xd8413b, 0xe9c33f, 0xf1efe6, 0x8f6ad1];

// a flat many-sided disc standing upright, facing `facing`
function disc(builder, [cx, cy, cz], facing, radius, sides, color) {
  const right = [Math.cos(facing), 0, -Math.sin(facing)];
  const point = (angle, r) => [cx + right[0] * Math.cos(angle) * r, cy + Math.sin(angle) * r, cz + right[2] * Math.cos(angle) * r];
  for (let i = 0; i < sides; i += 1) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    builder.tri([cx, cy, cz], point(a0, radius), point(a1, radius), color);
  }
}

const forward = (facing, distance) => [Math.sin(facing) * distance, Math.cos(facing) * distance];

export function barrel(batch, rand, { x, y = 0, z, tilt = 0 }) {
  const wood = shadeColor(P.timber, 1.15 + (rand() - 0.5) * 0.1);
  batch.wood.prism({ cx: x, cy: y, cz: z, radiusBottom: 0.27, radiusTop: 0.32, height: 0.41, sides: 10, color: wood, rand, rotY: tilt, cap: false });
  batch.wood.prism({ cx: x, cy: y + 0.41, cz: z, radiusBottom: 0.32, radiusTop: 0.27, height: 0.41, sides: 10, color: wood, rand, rotY: tilt });
  for (const at of [0.12, 0.66]) {
    batch.metal.prism({ cx: x, cy: y + at, cz: z, radiusBottom: 0.305, radiusTop: 0.315, height: 0.05, sides: 10, color: P.iron, rand, rotY: tilt, cap: false });
  }
}

export function crate(batch, rand, { x, y = 0, z, turn = 0, stack = false }) {
  batch.wood.block({ cx: x, cy: y, cz: z, sx: 0.62, sy: 0.6, sz: 0.62, rotY: turn, chamfer: 0.03, jitter: 0, color: shadeColor(P.timber, 1.25), rand, shade: 0.1 });
  batch.wood.block({ cx: x, cy: y + 0.58, cz: z, sx: 0.66, sy: 0.04, sz: 0.66, rotY: turn, chamfer: 0.01, jitter: 0, color: P.timberDark, rand });
  if (stack) crate(batch, rand, { x: x + 0.04, y: y + 0.62, z: z - 0.03, turn: turn + 0.35 });
}

export function woodpile(batch, rand, { x, y = 0, z, length = 2, facing = 0 }) {
  // split logs stacked three, two, one, their cut ends out
  const [ax, az] = [Math.cos(facing), -Math.sin(facing)];
  for (const [row, count] of [[0, 4], [1, 3], [2, 2]]) {
    for (let i = 0; i < count; i += 1) {
      const offset = (i - (count - 1) / 2) * 0.24;
      batch.wood.block({
        cx: x + ax * offset, cy: y + row * 0.21, cz: z + az * offset, sx: 0.22, sy: 0.22, sz: length,
        rotY: facing, chamfer: 0.05, jitter: 0.01, color: shadeColor(0x7a5a3c, 0.9 + rand() * 0.25), rand, shade: 0.2,
      });
    }
  }
}

export function sacks(batch, rand, { x, y = 0, z }) {
  for (const [dx, dz, s] of [[0, 0, 1], [0.34, 0.12, 0.9], [0.14, -0.3, 0.85]]) {
    batch.cloth.lump({ cx: x + dx, cy: y + 0.2 * s, cz: z + dz, rx: 0.22 * s, ry: 0.22 * s, rz: 0.18 * s, color: shadeColor(P.cream, 0.82), rand, squash: 0.2 });
  }
}

/** A lantern on a post (the flame is the caller's: returns where it burns). */
export function lanternPost(batch, rand, { x, y = 0, z }) {
  batch.wood.prism({ cx: x, cy: y, cz: z, radiusBottom: 0.08, radiusTop: 0.06, height: 2.1, sides: 6, color: P.timberDark, rand });
  batch.metal.block({ cx: x, cy: y + 2.02, cz: z, sx: 0.22, sy: 0.04, sz: 0.22, chamfer: 0, jitter: 0, color: P.iron, rand });
  batch.metal.block({ cx: x, cy: y + 2.4, cz: z, sx: 0.26, sy: 0.05, sz: 0.26, chamfer: 0, jitter: 0, color: P.iron, rand });
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    batch.metal.block({ cx: x + dx * 0.1, cy: y + 2.06, cz: z + dz * 0.1, sx: 0.025, sy: 0.34, sz: 0.025, chamfer: 0, jitter: 0, color: P.iron, rand });
  }
  batch.metal.prism({ cx: x, cy: y + 2.45, cz: z, radiusBottom: 0.16, radiusTop: 0, height: 0.14, sides: 4, color: P.iron, rand, rotY: Math.PI / 4 });
  return [x, y + 2.22, z];
}

export function flowers(batch, rand, { x, y = 0, z }) {
  for (let i = 0; i < 6; i += 1) {
    const dx = (rand() - 0.5) * 0.9;
    const dz = (rand() - 0.5) * 0.35;
    batch.foliage.lump({ cx: x + dx, cy: y + 0.08, cz: z + dz, rx: 0.14, ry: 0.1, rz: 0.12, color: P.foliageLight, rand, squash: 0.2 });
    batch.foliage.lump({ cx: x + dx, cy: y + 0.19, cz: z + dz, rx: 0.05, ry: 0.04, rz: 0.05, color: BLOOMS[Math.floor(rand() * BLOOMS.length)], rand, shade: 0.05 });
  }
}

/** A straw archery butt on its stand, the rings painted on its face. */
export function archeryTarget(batch, rand, { x, y = 0, z, facing = 0 }) {
  const [fx, fz] = forward(facing, 1);
  const center = [x, y + 1.05, z];
  // the stand: two legs in front, one behind
  for (const side of [-1, 1]) {
    const [rx, rz] = [Math.cos(facing) * side * 0.35, -Math.sin(facing) * side * 0.35];
    batch.wood.block({ cx: x + rx + fx * 0.1, cy: y, cz: z + rz + fz * 0.1, sx: 0.08, sy: 1.0, sz: 0.08, rotY: facing, chamfer: 0.01, jitter: 0, color: P.timber, rand });
  }
  batch.wood.block({ cx: x - fx * 0.35, cy: y, cz: z - fz * 0.35, sx: 0.08, sy: 1.25, sz: 0.08, rotY: facing, chamfer: 0.01, jitter: 0, color: P.timber, rand });
  // the butt: a thick straw disc, then the rings a hair in front of it
  const face = (inset) => [center[0] + fx * inset, center[1], center[2] + fz * inset];
  disc(batch.cloth, face(0.08), facing, 0.55, 14, STRAW);
  disc(batch.cloth, face(-0.08), facing + Math.PI, 0.55, 14, shadeColor(STRAW, 0.8));
  for (let i = 0; i < 14; i += 1) {
    const a0 = (i / 14) * Math.PI * 2;
    const a1 = ((i + 1) / 14) * Math.PI * 2;
    const rim = (angle, inset) => {
      const [bx, by, bz] = face(inset);
      return [bx + Math.cos(facing) * Math.cos(angle) * 0.55, by + Math.sin(angle) * 0.55, bz - Math.sin(facing) * Math.cos(angle) * 0.55];
    };
    batch.cloth.quad(rim(a0, -0.08), rim(a1, -0.08), rim(a1, 0.08), rim(a0, 0.08), shadeColor(STRAW, 0.9));
  }
  disc(batch.cloth, face(0.09), facing, 0.42, 14, P.cream);
  disc(batch.cloth, face(0.1), facing, 0.3, 14, P.crimson);
  disc(batch.cloth, face(0.11), facing, 0.17, 12, P.cream);
  disc(batch.cloth, face(0.12), facing, 0.08, 10, P.brass);
}

/** A rack of blunt practice blades against a wall. */
export function weaponRack(batch, rand, { x, y = 0, z, facing = 0 }) {
  const [ax, az] = [Math.cos(facing), -Math.sin(facing)];
  for (const side of [-1, 1]) {
    batch.wood.block({ cx: x + ax * side * 0.75, cy: y, cz: z + az * side * 0.75, sx: 0.1, sy: 1.3, sz: 0.1, rotY: facing, chamfer: 0.01, jitter: 0, color: P.timberDark, rand });
  }
  for (const height of [0.35, 1.05]) {
    batch.wood.block({ cx: x, cy: y + height, cz: z, sx: 1.6, sy: 0.08, sz: 0.1, rotY: facing, chamfer: 0.01, jitter: 0, color: P.timber, rand });
  }
  for (let i = 0; i < 4; i += 1) {
    const offset = -0.5 + i * 0.33;
    const [bx, bz] = [x + ax * offset, z + az * offset];
    batch.metal.block({ cx: bx, cy: y + 0.2, cz: bz, sx: 0.06, sy: 1.05, sz: 0.015, rotY: facing, chamfer: 0, jitter: 0, color: 0x9ea6b0, rand });
    batch.wood.block({ cx: bx, cy: y + 1.1, cz: bz, sx: 0.22, sy: 0.04, sz: 0.05, rotY: facing, chamfer: 0, jitter: 0, color: P.brassDark, rand });
    batch.wood.block({ cx: bx, cy: y + 1.14, cz: bz, sx: 0.045, sy: 0.2, sz: 0.045, rotY: facing, chamfer: 0, jitter: 0, color: P.timberDark, rand });
  }
}

/** A pennant on a pole, raised over a gatepost (base at the post's top). */
export function pennant(batch, rand, { x, y = 0, z, height = 1.2, facing = 0 }) {
  batch.wood.prism({ cx: x, cy: y, cz: z, radiusBottom: 0.05, radiusTop: 0.035, height, sides: 6, color: P.timberDark, rand });
  batch.metal.prism({ cx: x, cy: y + height, cz: z, radiusBottom: 0.06, radiusTop: 0, height: 0.12, sides: 6, color: P.brass, rand });
  const [ax, az] = [Math.cos(facing), -Math.sin(facing)];
  const top = y + height - 0.05;
  batch.cloth.tri([x, top, z], [x, top - 0.42, z], [x + ax * 0.9, top - 0.2, z + az * 0.9], P.crimson);
  batch.cloth.tri([x, top - 0.1, z], [x, top - 0.32, z], [x + ax * 0.55, top - 0.21, z + az * 0.55], P.cream);
}

/** Straw bales stacked to fill a solid (two layers). */
export function strawBales(batch, rand, solid) {
  const [cx, cy, cz] = solid.center;
  const [sx, sy, sz] = solid.size;
  const bottom = cy - sy / 2;
  const alongX = sx >= sz;
  const long = alongX ? sx : sz;
  const wide = alongX ? sz : sx;
  const layer = sy / 2;
  const place = (u, v, y, lu, lv) => batch.foliage.block({
    cx: cx + (alongX ? u : v), cy: y, cz: cz + (alongX ? v : u), sx: alongX ? lu : lv, sy: layer - 0.02, sz: alongX ? lv : lu,
    chamfer: 0.06, jitter: 0.02, color: shadeColor(STRAW, 0.9 + rand() * 0.18), rand, shade: 0.14,
  });
  // the bottom layer end to end in two rows, the top one across them, a little short of the ends
  for (const v of [-wide / 4, wide / 4]) for (const u of [-long / 4, long / 4]) place(u, v, bottom, long / 2 - 0.03, wide / 2 - 0.03);
  place(0, 0, bottom + layer, long * 0.62, wide - 0.05);
}

/** A striped pavilion filling a solid: octagonal walls, a peaked roof, a scalloped valance and a pennant on top. */
export function pavilion(batch, rand, solid, { door = 0 } = {}) {
  const [cx, cy, cz] = solid.center;
  const [sx, sy, sz] = solid.size;
  const bottom = cy - sy / 2;
  const radius = Math.min(sx, sz) / 2;
  const sides = 8;
  const eave = bottom + sy * 0.62;
  const apex = bottom + sy + 0.9;
  const ring = (angle, r, y) => [cx + Math.cos(angle) * r, y, cz + Math.sin(angle) * r];
  for (let i = 0; i < sides; i += 1) {
    const a0 = (i / sides) * Math.PI * 2 + Math.PI / sides;
    const a1 = ((i + 1) / sides) * Math.PI * 2 + Math.PI / sides;
    const stripe = i % 2 ? P.crimson : P.cream;
    batch.cloth.quad(ring(a0, radius, bottom), ring(a0, radius, eave), ring(a1, radius, eave), ring(a1, radius, bottom), stripe);
    batch.cloth.tri(ring(a0, radius + 0.25, eave), [cx, apex, cz], ring(a1, radius + 0.25, eave), i % 2 ? P.cream : P.crimson);
    // the valance hangs in two scallops per side
    const mid = (a0 + a1) / 2;
    for (const [s0, s1] of [[a0, mid], [mid, a1]]) {
      batch.cloth.tri(ring(s0, radius + 0.25, eave), ring(s1, radius + 0.25, eave), ring((s0 + s1) / 2, radius + 0.24, eave - 0.22), P.crimsonDark);
    }
  }
  // the door: a dark opening with its flaps tied back
  const [dx, dz] = [Math.sin(door), Math.cos(door)];
  const [rx, rz] = [Math.cos(door), -Math.sin(door)];
  const front = [cx + dx * (radius + 0.02), cz + dz * (radius + 0.02)];
  const doorAt = (u, y) => [front[0] + rx * u, y, front[1] + rz * u];
  batch.cloth.quad(doorAt(-0.45, bottom), doorAt(0.45, bottom), doorAt(0.3, eave - 0.1), doorAt(-0.3, eave - 0.1), 0x2a1c14);
  pennant(batch, rand, { x: cx, y: apex - 0.05, z: cz, height: 0.8, facing: door + Math.PI / 2 });
}
