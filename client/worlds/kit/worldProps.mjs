import { KIT_PALETTE as P, shadeColor } from './facetKit.mjs';
import { brazier } from './kitPieces.mjs';
import { propSolid } from '../../../shared/worlds/props.mjs';
import {
  archeryTarget, barrel, crate, flowers, lanternPost, pavilion, pennant, sacks, weaponRack, woodpile,
} from './kitProps.mjs';

// A world's furnishings (its shared `props`, shared/worlds/props.mjs), drawn in the environment kit: any world's
// renderer hands them here with a batch. What stands is drawn to fill the box it stands as, so what you see is what
// stops you. A side's things (a tent, a standard) are in that side's colours. Fire and glow are the caller's to animate:
// each kind that burns or glows reports where.

export const SIDE_COLORS = Object.freeze({
  ATTACKERS: Object.freeze({ main: 0x3a6fb0, alt: P.cream, dark: 0x24466f }),
  DEFENDERS: Object.freeze({ main: P.crimson, alt: P.cream, dark: P.crimsonDark }),
  none: Object.freeze({ main: 0x7a6a4a, alt: P.cream, dark: 0x4d4330 }),
});
const sideOf = (prop) => SIDE_COLORS[prop.team] ?? SIDE_COLORS.none;

/** A square-sectioned beam from point a to point b (any slant), sharpened to a point at b if `point`. */
export function beam(builder, a, b, radius, color, { point = false } = {}) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...d) || 1;
  const t = d.map((v) => v / len);
  // two directions square to the beam
  const helper = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
  const u = norm(cross(t, helper));
  const w = cross(t, u);
  const ring = (p, r) => [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([i, j]) => p.map((v, k) => v + (u[k] * i + w[k] * j) * r));
  const tipAt = point ? b.map((v, k) => v - t[k] * radius * 3) : b;
  const A = ring(a, radius);
  const B = ring(tipAt, radius);
  // each face wound so it faces out (counter-clockwise from outside)
  const face = (p, q, r, s2, outward) => {
    const n = cross([q[0] - p[0], q[1] - p[1], q[2] - p[2]], [r[0] - p[0], r[1] - p[1], r[2] - p[2]]);
    if (n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2] >= 0) builder.quad(p, q, r, s2, color);
    else builder.quad(s2, r, q, p, color);
  };
  for (let i = 0; i < 4; i += 1) {
    const j = (i + 1) % 4;
    const mid = A[i].map((v, k) => (v + A[j][k]) / 2 - a[k]);
    face(A[i], A[j], B[j], B[i], mid);
  }
  face(A[3], A[2], A[1], A[0], t.map((v) => -v));
  if (point) {
    for (let i = 0; i < 4; i += 1) {
      const j = (i + 1) % 4;
      const out = B[i].map((v, k) => (v + B[j][k]) / 2 - tipAt[k] + t[k] * radius);
      const n = cross(B[j].map((v, k) => v - B[i][k]), b.map((v, k) => v - B[i][k]));
      if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0) builder.tri(B[i], B[j], b, color);
      else builder.tri(b, B[j], B[i], color);
    }
  } else {
    face(B[0], B[1], B[2], B[3], t);
  }
}

/** A two-wheeled supply cart, its shafts resting on the ground ahead (`facing`), a load of sacks and a crate in its bed. */
export function supplyCart(batch, rand, { x, y = 0, z, facing = 0 }) {
  const [fx, fz] = [Math.sin(facing), Math.cos(facing)];
  const [ax, az] = [Math.cos(facing), -Math.sin(facing)];
  const at = (along, across, height) => [x + fx * along + ax * across, y + height, z + fz * along + az * across];
  // the bed and its sides
  const [bx, by, bz] = at(-0.25, 0, 0.62);
  batch.wood.block({ cx: bx, cy: by, cz: bz, sx: 1.4, sy: 0.1, sz: 1.9, rotY: facing, chamfer: 0.02, jitter: 0, color: P.timber, rand });
  for (const side of [-1, 1]) {
    const [sx, sy, sz] = at(-0.25, side * 0.68, 0.72);
    batch.wood.block({ cx: sx, cy: sy, cz: sz, sx: 0.06, sy: 0.32, sz: 1.9, rotY: facing, chamfer: 0.01, jitter: 0, color: P.timberDark, rand });
  }
  for (const end of [-1.18, 0.68]) {
    const [ex, ey, ez] = at(end, 0, 0.72);
    batch.wood.block({ cx: ex, cy: ey, cz: ez, sx: 1.4, sy: 0.32, sz: 0.06, rotY: facing, chamfer: 0.01, jitter: 0, color: P.timberDark, rand });
  }
  // the wheels drawn upright: two tall thin blocks, one per side, under the axle
  for (const side of [-1, 1]) {
    const [hx, hy, hz] = at(-0.15, side * 0.74, 0.02);
    batch.wood.block({ cx: hx, cy: hy, cz: hz, sx: 0.08, sy: 0.86, sz: 0.86, rotY: facing, chamfer: 0.22, jitter: 0, color: shadeColor(P.timberDark, 1.15), rand, shade: 0.2 });
  }
  // the shafts, down to the ground ahead
  for (const side of [-1, 1]) {
    const [sx, sy, sz] = at(1.0, side * 0.42, 0.18);
    batch.wood.block({ cx: sx, cy: sy, cz: sz, sx: 0.08, sy: 0.08, sz: 1.3, rotY: facing, chamfer: 0.01, jitter: 0, color: P.timber, rand });
  }
  // the load
  const [lx, ly, lz] = at(-0.5, -0.25, 0.68);
  sacks(batch, rand, { x: lx, y: ly, z: lz });
  const [cx, cy, cz] = at(0.2, 0.3, 0.68);
  crate(batch, rand, { x: cx, y: cy, z: cz, turn: facing + 0.2 });
}

/** A side's standard: a tall pole, a cross-bar and a long banner in the side's colours with a pale stripe. */
export function standard(batch, rand, { x, y = 0, z, facing = 0, colors = SIDE_COLORS.none }) {
  batch.wood.prism({ cx: x, cy: y, cz: z, radiusBottom: 0.09, radiusTop: 0.06, height: 4.2, sides: 6, color: P.timberDark, rand });
  batch.metal.prism({ cx: x, cy: y + 4.2, cz: z, radiusBottom: 0.08, radiusTop: 0, height: 0.28, sides: 6, color: P.brass, rand });
  const [ax, az] = [Math.cos(facing), -Math.sin(facing)];
  const top = y + 3.95;
  batch.metal.block({ cx: x, cy: top, cz: z, sx: 1.3, sy: 0.05, sz: 0.05, rotY: facing, chamfer: 0, jitter: 0, color: P.brassDark, rand });
  // the banner hangs in a swallow-tail, a hair off each side of the pole so it never shares the pole's faces
  const point = (u, v) => [x + ax * u, top - v, z + az * u];
  batch.cloth.quad(point(-0.6, 0.04), point(0.6, 0.04), point(0.6, 1.5), point(-0.6, 1.5), colors.main);
  batch.cloth.tri(point(-0.6, 1.5), point(0, 1.5), point(-0.6, 1.95), colors.main);
  batch.cloth.tri(point(0, 1.5), point(0.6, 1.5), point(0.6, 1.95), colors.main);
  const [nx, nz] = [-az * 0.01, ax * 0.01];
  for (const side of [-1, 1]) {
    const o = ([px, py, pz]) => [px + nx * side, py, pz + nz * side];
    batch.cloth.quad(o(point(-0.12, 0.1)), o(point(0.12, 0.1)), o(point(0.12, 1.45)), o(point(-0.12, 1.45)), colors.alt);
  }
}

/** A cheval-de-frise: a beam on trestles bristling with sharpened stakes, `length` across its facing. */
export function stakes(batch, rand, { x, y = 0, z, facing = 0, length = 3 }) {
  const [ax, az] = [Math.cos(facing), -Math.sin(facing)];
  batch.wood.block({ cx: x, cy: y + 0.42, cz: z, sx: length, sy: 0.18, sz: 0.18, rotY: facing, chamfer: 0.03, jitter: 0.01, color: P.timberDark, rand });
  const count = Math.max(3, Math.round(length / 0.5));
  const [fx, fz] = [Math.sin(facing), Math.cos(facing)];
  for (let i = 0; i < count; i += 1) {
    const u = (i / (count - 1) - 0.5) * (length - 0.2);
    // each stake crosses the beam on a slant, its point out toward the facing or back, by turns
    const lean = i % 2 ? 1 : -1;
    const base = [x + ax * u - fx * lean * 0.38, y, z + az * u - fz * lean * 0.38];
    const tip = [x + ax * u + fx * lean * 0.45, y + 1.02, z + az * u + fz * lean * 0.45];
    beam(batch.wood, base, tip, 0.045, shadeColor(P.timber, 1.05 + rand() * 0.2), { point: true });
  }
  // the trestle legs at either end
  for (const side of [-1, 1]) {
    const [ex, ez] = [x + ax * side * (length / 2 - 0.15), z + az * side * (length / 2 - 0.15)];
    for (const lean of [-1, 1]) beam(batch.wood, [ex + fx * lean * 0.35, y, ez + fz * lean * 0.35], [ex, y + 0.5, ez], 0.05, P.timberDark);
  }
}

/** A smith's anvil on its block of oak. */
export function anvil(batch, rand, { x, y = 0, z, facing = 0 }) {
  batch.wood.prism({ cx: x, cy: y, cz: z, radiusBottom: 0.3, radiusTop: 0.27, height: 0.52, sides: 8, color: P.timberDark, rand });
  batch.metal.block({ cx: x, cy: y + 0.52, cz: z, sx: 0.28, sy: 0.14, sz: 0.5, rotY: facing, chamfer: 0.02, jitter: 0, color: P.iron, rand });
  batch.metal.block({ cx: x, cy: y + 0.66, cz: z, sx: 0.36, sy: 0.14, sz: 0.78, rotY: facing, chamfer: 0.03, jitter: 0, color: shadeColor(P.iron, 1.25), rand });
  const [fx, fz] = [Math.sin(facing), Math.cos(facing)];
  batch.metal.prism({ cx: x + fx * 0.47, cy: y + 0.7, cz: z + fz * 0.47, radiusBottom: 0.1, radiusTop: 0.02, height: 0.08, sides: 4, color: shadeColor(P.iron, 1.25), rand, rotY: facing });
}

/** A heap of coal or ore: lumps piled into a low mound. */
export function oreHeap(batch, rand, { x, y = 0, z }) {
  const dark = 0x2a2724;
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * Math.PI * 2 + rand() * 0.4;
    const r = i === 0 ? 0 : 0.35 + rand() * 0.25;
    const s = i === 0 ? 0.42 : 0.24 + rand() * 0.1;
    batch.stone.lump({ cx: x + Math.cos(a) * r, cy: y + (i === 0 ? 0.22 : 0.1), cz: z + Math.sin(a) * r, rx: s, ry: s * 0.75, rz: s, color: shadeColor(dark, 0.85 + rand() * 0.4), rand, squash: 0.25 });
  }
}

/** Soft glowing caps at a wall's foot (returns where their glow sits). */
export function fungus(batch, rand, { x, y = 0, z }) {
  for (let i = 0; i < 5; i += 1) {
    const [dx, dz] = [(rand() - 0.5) * 0.9, (rand() - 0.5) * 0.5];
    const h = 0.08 + rand() * 0.18;
    batch.foliage.prism({ cx: x + dx, cy: y, cz: z + dz, radiusBottom: 0.03, radiusTop: 0.025, height: h, sides: 5, color: 0xd9d2b4, rand });
    batch.cloth.lump({ cx: x + dx, cy: y + h, cz: z + dz, rx: 0.1 + rand() * 0.06, ry: 0.05, rz: 0.1 + rand() * 0.06, color: shadeColor(P.rune, 0.75 + rand() * 0.3), rand, shade: 0.05, squash: 0.4 });
  }
  return [x, y + 0.2, z];
}

/**
 * Draw a world's furnishings. Returns where flames burn ({ position, scale } each) and where things glow (positions),
 * for the caller to animate.
 */
export function drawWorldProps(batch, rand, props) {
  const flames = [];
  const glows = [];
  for (const prop of props ?? []) {
    const y = prop.y ?? 0;
    const at = { ...prop, y };
    switch (prop.kind) {
      case 'barrel': barrel(batch, rand, at); break;
      case 'crate': crate(batch, rand, at); break;
      case 'woodpile': woodpile(batch, rand, at); break;
      case 'sacks': sacks(batch, rand, at); break;
      case 'flowers': flowers(batch, rand, at); break;
      case 'target': archeryTarget(batch, rand, at); break;
      case 'rack': weaponRack(batch, rand, at); break;
      case 'lantern': flames.push({ position: lanternPost(batch, rand, at), scale: 0.55 }); break;
      case 'pennant': pennant(batch, rand, { ...at, height: prop.height ?? 1.6, color: sideOf(prop).main }); break;
      case 'tent': {
        const solid = propSolid(prop);
        const colors = sideOf(prop);
        pavilion(batch, rand, solid, { door: prop.facing ?? 0, colors: [colors.main, colors.alt, colors.dark] });
        break;
      }
      case 'cart': supplyCart(batch, rand, at); break;
      case 'brazier': flames.push({ position: brazier(batch, rand, at), scale: 1.8 }); break;
      case 'standard': standard(batch, rand, { ...at, colors: sideOf(prop) }); break;
      case 'stakes': stakes(batch, rand, at); break;
      case 'anvil': anvil(batch, rand, at); break;
      case 'ore': oreHeap(batch, rand, at); break;
      case 'fungus': glows.push(fungus(batch, rand, at)); break;
      default: break;
    }
  }
  return { flames, glows };
}

/**
 * Riveted ironwork filling a solid's box exactly (a hopper, a quench bin, a plate parapet): a plate in a darker frame,
 * a band at its top and foot, rivets along the bands. `builder`: the batch's builder for dull iron.
 */
export function ironwork(builder, rand, solid, { color = 0x55575c } = {}) {
  const [cx, cy, cz] = solid.center;
  const [sx, sy, sz] = solid.size;
  const bottom = cy - sy / 2;
  builder.block({ cx, cy: bottom, cz, sx, sy, sz, chamfer: 0.02, jitter: 0, color, rand, shade: 0.06 });
  const frame = shadeColor(color, 0.72);
  for (const [y, h] of [[bottom, 0.12], [bottom + sy - 0.1, 0.1]]) {
    builder.block({ cx, cy: y, cz, sx: sx + 0.04, sy: h, sz: sz + 0.04, chamfer: 0.01, jitter: 0, color: frame, rand, shade: 0.04 });
  }
  // rivets along the top band, on the two long faces
  const alongX = sx >= sz;
  const length = alongX ? sx : sz;
  const count = Math.max(2, Math.round(length / 0.35));
  for (let i = 0; i < count; i += 1) {
    const u = -length / 2 + (i + 0.5) * (length / count);
    for (const side of [-1, 1]) {
      const [x, z] = alongX ? [cx + u, cz + side * (sz / 2 + 0.025)] : [cx + side * (sx / 2 + 0.025), cz + u];
      builder.lump({ cx: x, cy: bottom + sy - 0.05, cz: z, rx: 0.025, ry: 0.025, rz: 0.025, color: shadeColor(color, 1.25), rand, squash: 0 });
    }
  }
}

/** Iron ingots stacked in crossed courses, filling a solid's box exactly. */
export function ingotStack(builder, rand, solid, { color = 0x5d5f63 } = {}) {
  const [cx, cy, cz] = solid.center;
  const [sx, sy, sz] = solid.size;
  const bottom = cy - sy / 2;
  const courses = Math.max(2, Math.round(sy / 0.21));
  const h = sy / courses;
  for (let c = 0; c < courses; c += 1) {
    const alongX = c % 2 === 0;
    const across = alongX ? sz : sx;
    const bars = Math.max(2, Math.round(across / 0.36));
    for (let b = 0; b < bars; b += 1) {
      const v = -across / 2 + (b + 0.5) * (across / bars);
      builder.block({
        cx: alongX ? cx : cx + v, cy: bottom + c * h, cz: alongX ? cz + v : cz,
        sx: alongX ? sx : across / bars - 0.04, sy: h - 0.015, sz: alongX ? across / bars - 0.04 : sz,
        chamfer: 0.03, jitter: 0, color: shadeColor(color, 0.85 + rand() * 0.3), rand, shade: 0.06,
      });
    }
  }
}
