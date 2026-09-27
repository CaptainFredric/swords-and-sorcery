import * as THREE from 'three';
import { FacetBuilder, KIT_PALETTE as P, shadeColor } from './facetKit.mjs';

// Pieces of the environment kit. Each writes faceted triangles into a batch of builders (one per material) so a
// whole scene merges into a few draw calls. Anything collidable is drawn to fill its authoritative box exactly:
// what you see is what stops you.

export function createBatch() {
  return {
    stone: new FacetBuilder(),
    ground: new FacetBuilder(),
    wood: new FacetBuilder(),
    foliage: new FacetBuilder(),
    metal: new FacetBuilder(),
    cloth: new FacetBuilder(),
  };
}

/** A solid's box as a run along its long axis. */
export function runOf(solid) {
  const [cx, cy, cz] = solid.center;
  const [sx, sy, sz] = solid.size;
  const alongX = sx >= sz;
  return {
    alongX,
    length: alongX ? sx : sz,
    thickness: alongX ? sz : sx,
    bottom: cy - sy / 2,
    height: sy,
    cx,
    cz,
    // position along the run (-length/2 .. +length/2) and across it
    at(u, v = 0) {
      return alongX ? [cx + u, cz + v] : [cx + v, cz + u];
    },
    rotY: alongX ? 0 : Math.PI / 2,
  };
}

/**
 * Coursed ashlar masonry filling a box, optionally crowned with merlons (crenellations) above it.
 * style 'ashlar' (castle), 'drystone' (field walls, banks), 'rubble' (lips, broken work)
 */
export function masonry(batch, rand, solid, { style = 'ashlar', merlons = false, merlonHeight = 0.55, coping = true, color = P.stone } = {}) {
  const run = runOf(solid);
  const course = style === 'ashlar' ? 0.5 : style === 'drystone' ? 0.34 : 0.24;
  const rows = Math.max(1, Math.round(run.height / course));
  const rowHeight = run.height / rows;
  for (let r = 0; r < rows; r += 1) {
    let u = -run.length / 2;
    const offset = (r % 2) * 0.35;
    let first = true;
    while (u < run.length / 2 - 1e-3) {
      const base = style === 'ashlar' ? 0.85 + rand() * 0.55 : 0.4 + rand() * 0.45;
      let len = first ? Math.max(0.3, base - offset) : base;
      first = false;
      len = Math.min(len, run.length / 2 - u);
      const [x, z] = run.at(u + len / 2, 0);
      const rough = style !== 'ashlar';
      const inset = rough ? 0.035 * rand() : 0.012;
      const tone = r === rows - 1 && coping ? 1.08 : rough ? 0.8 + rand() * 0.35 : 0.96 + rand() * 0.1;
      // field stones sit unevenly: shorter than their course, with deep joints between them
      const height = rough ? rowHeight * (0.72 + rand() * 0.26) : rowHeight - 0.015;
      batch.stone.block({
        cx: x, cy: run.bottom + r * rowHeight + (rough ? rand() * (rowHeight - height) * 0.5 : 0), cz: z,
        sx: len - (rough ? 0.05 + rand() * 0.05 : 0.02), sy: height, sz: run.thickness - inset * 2,
        rotY: run.rotY + (rough ? (rand() - 0.5) * 0.06 : 0), chamfer: rough ? 0.08 : 0.035, jitter: rough ? 0.05 : 0.008,
        color: shadeColor(rough && rand() < 0.3 ? P.stoneDark : color, tone), rand, shade: rough ? 0.2 : 0.08,
      });
      u += len;
    }
  }
  if (coping && style !== 'rubble') {
    // a slightly proud coping course
    const [x, z] = run.at(0, 0);
    batch.stone.block({
      cx: x, cy: run.bottom + run.height - 0.001, cz: z, sx: run.length + 0.04, sy: 0.08, sz: run.thickness + 0.06,
      rotY: run.rotY, chamfer: 0.03, jitter: 0.005, color: P.stoneLight, rand, shade: 0.05,
    });
  }
  if (merlons) {
    const spacing = 1.25;
    const count = Math.max(1, Math.floor(run.length / spacing));
    const pad = (run.length - count * spacing) / 2;
    for (let i = 0; i < count; i += 1) {
      const [x, z] = run.at(-run.length / 2 + pad + spacing * (i + 0.5), 0);
      batch.stone.block({
        cx: x, cy: run.bottom + run.height + 0.07, cz: z, sx: 0.72, sy: merlonHeight, sz: run.thickness + 0.02,
        rotY: run.rotY, chamfer: 0.05, jitter: 0.015, color: shadeColor(P.stoneLight, 0.96 + rand() * 0.08), rand,
      });
    }
  }
}

/** Timber palisade on a low stone footing: pointed stakes and two rails. */
export function palisade(batch, rand, solid) {
  const run = runOf(solid);
  const footing = 0.3;
  masonry(batch, rand, { center: [solid.center[0], run.bottom + footing / 2, solid.center[2]], size: run.alongX ? [run.length, footing, run.thickness] : [run.thickness, footing, run.length] }, { style: 'drystone', coping: false });
  const stakes = Math.floor(run.length / 0.27);
  for (let i = 0; i < stakes; i += 1) {
    const [x, z] = run.at(-run.length / 2 + 0.135 + i * (run.length - 0.27) / Math.max(1, stakes - 1), (rand() - 0.5) * 0.04);
    const height = run.height - footing + 0.05 + rand() * 0.25;
    const radius = 0.1 + rand() * 0.03;
    const tone = shadeColor(P.timber, 0.85 + rand() * 0.3);
    batch.wood.prism({ cx: x, cy: run.bottom + footing - 0.05, cz: z, radiusBottom: radius, radiusTop: radius * 0.92, height, sides: 5, color: tone, rand, rotY: rand() * 2, cap: false });
    batch.wood.prism({ cx: x, cy: run.bottom + footing - 0.05 + height, cz: z, radiusBottom: radius * 0.92, radiusTop: 0, height: 0.28, sides: 5, color: tone, rand, rotY: rand() * 2 });
  }
  for (const railY of [0.75, 1.3]) {
    const [x, z] = run.at(0, run.thickness / 2 - 0.02);
    batch.wood.block({ cx: x, cy: run.bottom + railY, cz: z, sx: run.length, sy: 0.12, sz: 0.1, rotY: run.rotY, chamfer: 0.02, jitter: 0, color: P.timberDark, rand });
  }
}

/** A hedgerow of clipped faceted lumps filling the box. */
export function hedgerow(batch, rand, solid) {
  const run = runOf(solid);
  const count = Math.max(2, Math.round(run.length / 0.62));
  for (let i = 0; i < count; i += 1) {
    const u = -run.length / 2 + (i + 0.5) * (run.length / count);
    const [x, z] = run.at(u, 0);
    const ry = run.height * (0.5 + rand() * 0.08);
    batch.foliage.lump({ cx: x, cy: run.bottom + ry * 0.95, cz: z, rx: run.alongX ? 0.48 : run.thickness * 0.62, ry, rz: run.alongX ? run.thickness * 0.62 : 0.48, color: shadeColor(P.hedge, 0.88 + rand() * 0.25), rand, squash: 0.18 });
  }
}

export function tree(batch, rand, { x, y = 0, z, scale = 1, kind = 'oak' }) {
  const trunkHeight = (kind === 'pine' ? 1.6 : 2.1) * scale;
  batch.wood.prism({ cx: x, cy: y - 0.1, cz: z, radiusBottom: 0.26 * scale, radiusTop: 0.17 * scale, height: trunkHeight, sides: 6, color: shadeColor(P.timberDark, 0.9 + rand() * 0.2), rand, rotY: rand() * 3 });
  if (kind === 'pine') {
    for (let i = 0; i < 3; i += 1) {
      const radius = (1.45 - i * 0.32) * scale;
      batch.foliage.prism({ cx: x, cy: y + trunkHeight * 0.6 + i * 0.95 * scale, cz: z, radiusBottom: radius, radiusTop: 0, height: 1.7 * scale, sides: 7, color: shadeColor(P.foliageDark, 0.9 + rand() * 0.25), rand, rotY: rand() * 3 });
    }
    return;
  }
  const crowns = 3;
  for (let i = 0; i < crowns; i += 1) {
    const angle = (i / crowns) * Math.PI * 2 + rand();
    const spread = 0.55 * scale;
    batch.foliage.lump({
      cx: x + Math.cos(angle) * spread * (i ? 1 : 0.2), cy: y + trunkHeight + (0.5 + rand() * 0.6) * scale, cz: z + Math.sin(angle) * spread * (i ? 1 : 0.2),
      rx: (1.15 + rand() * 0.35) * scale, ry: (0.95 + rand() * 0.3) * scale, rz: (1.1 + rand() * 0.35) * scale,
      color: shadeColor(i === 1 ? P.foliageLight : P.foliage, 0.9 + rand() * 0.2), rand, squash: 0.16,
    });
  }
}

/** Timber-framed cottage over a solid box (walls fill it exactly), with roof, door, windows and chimney. */
export function cottage(batch, rand, solid, { roof = 'thatch', door = '-z' } = {}) {
  const [cx, cy, cz] = solid.center;
  const [sx, sy, sz] = solid.size;
  const bottom = cy - sy / 2;
  batch.stone.block({ cx, cy: bottom, cz, sx, sy: 0.45, sz, chamfer: 0.04, jitter: 0.01, color: P.stoneDark, rand });
  batch.stone.block({ cx, cy: bottom + 0.45, cz, sx: sx - 0.04, sy: sy - 0.45, sz: sz - 0.04, chamfer: 0.02, jitter: 0, color: P.plaster, rand, shade: 0.05 });
  // timber frame proud of the plaster on the two long faces
  const frame = (face) => {
    const zf = face * (sz / 2 + 0.01);
    batch.wood.block({ cx, cy: bottom + 0.45, cz: cz + zf, sx: sx + 0.06, sy: 0.14, sz: 0.08, chamfer: 0.01, jitter: 0, color: P.timberDark, rand });
    batch.wood.block({ cx, cy: bottom + sy - 0.16, cz: cz + zf, sx: sx + 0.06, sy: 0.16, sz: 0.08, chamfer: 0.01, jitter: 0, color: P.timberDark, rand });
    const posts = Math.max(2, Math.round(sx / 1.3));
    for (let i = 0; i <= posts; i += 1) {
      const x = cx - sx / 2 + (i / posts) * sx;
      batch.wood.block({ cx: x, cy: bottom + 0.45, cz: cz + zf, sx: 0.14, sy: sy - 0.45, sz: 0.08, chamfer: 0.01, jitter: 0, color: P.timberDark, rand });
      if (i < posts && i % 2 === 0) {
        // diagonal brace as a leaning slab
        const mid = x + sx / posts / 2;
        batch.wood.block({ cx: mid, cy: bottom + 0.6, cz: cz + zf, sx: 0.11, sy: sy - 0.9, sz: 0.07, rotY: 0, chamfer: 0.01, jitter: 0, color: P.timber, rand });
      }
    }
  };
  frame(-1);
  frame(1);
  // the gable ends get corner posts and a mid rail
  for (const face of [-1, 1]) {
    const xf = cx + face * (sx / 2 + 0.01);
    for (const dz of [-1, 0, 1]) {
      batch.wood.block({ cx: xf, cy: bottom + 0.45, cz: cz + dz * (sz / 2 - 0.07), sx: 0.08, sy: sy - 0.45, sz: 0.14, chamfer: 0.01, jitter: 0, color: P.timberDark, rand });
    }
    batch.wood.block({ cx: xf, cy: bottom + sy * 0.55, cz, sx: 0.08, sy: 0.12, sz: sz + 0.06, chamfer: 0.01, jitter: 0, color: P.timberDark, rand });
  }
  const doorZ = door === '-z' ? cz - sz / 2 - 0.02 : cz + sz / 2 + 0.02;
  batch.wood.block({ cx: cx - sx * 0.18, cy: bottom + 0.45, cz: doorZ, sx: 0.95, sy: 1.75, sz: 0.06, chamfer: 0.01, jitter: 0, color: P.timber, rand });
  for (const wx of [-0.32, 0.26]) {
    batch.wood.block({ cx: cx + sx * wx + 0.6, cy: bottom + 1.35, cz: doorZ, sx: 0.62, sy: 0.55, sz: 0.06, chamfer: 0.01, jitter: 0, color: 0x2a211b, rand });
  }
  const ridgeAlongX = sx >= sz;
  const roofHeight = Math.min(sx, sz) * 0.62;
  batch[roof === 'thatch' ? 'foliage' : 'stone'].roof({
    cx, cy: bottom + sy - 0.02, cz, sx: ridgeAlongX ? sx : sz, sz: ridgeAlongX ? sz : sx, height: roofHeight,
    overhang: 0.35, ridge: (ridgeAlongX ? sx : sz) * 0.32, color: roof === 'thatch' ? P.thatch : P.slate, rand, rotY: ridgeAlongX ? 0 : Math.PI / 2,
  });
  batch.stone.block({ cx: cx + sx * 0.3, cy: bottom + sy - 0.3, cz: cz + sz * 0.2, sx: 0.55, sy: roofHeight + 0.75, sz: 0.55, chamfer: 0.05, jitter: 0.02, color: P.stoneDark, rand });
}

/** A brass wall sconce; returns the flame's world position (flames and light are animated separately). */
export function sconce(batch, rand, { x, y, z, facing = 0 }) {
  const dx = Math.sin(facing) * 0.18;
  const dz = Math.cos(facing) * 0.18;
  batch.metal.block({ cx: x, cy: y - 0.55, cz: z, sx: 0.12, sy: 0.32, sz: 0.06, rotY: facing, chamfer: 0.02, jitter: 0, color: P.brassDark, rand });
  batch.metal.block({ cx: x + dx * 0.5, cy: y - 0.3, cz: z + dz * 0.5, sx: 0.06, sy: 0.06, sz: 0.2, rotY: facing, chamfer: 0.01, jitter: 0, color: P.brass, rand });
  batch.metal.prism({ cx: x + dx, cy: y - 0.3, cz: z + dz, radiusBottom: 0.05, radiusTop: 0.12, height: 0.16, sides: 6, color: P.brass, rand });
  return [x + dx, y - 0.08, z + dz];
}

/** A free-standing brass brazier on a stone plinth; returns the flame position. */
export function brazier(batch, rand, { x, y = 0, z }) {
  batch.stone.block({ cx: x, cy: y, cz: z, sx: 0.62, sy: 0.5, sz: 0.62, chamfer: 0.06, jitter: 0.02, color: P.stoneDark, rand });
  batch.metal.prism({ cx: x, cy: y + 0.5, cz: z, radiusBottom: 0.08, radiusTop: 0.08, height: 0.55, sides: 6, color: P.brassDark, rand });
  batch.metal.prism({ cx: x, cy: y + 1.02, cz: z, radiusBottom: 0.12, radiusTop: 0.34, height: 0.24, sides: 8, color: P.brass, rand });
  return [x, y + 1.36, z];
}

let heraldryTexture = null;

/** The Spellblade's arms: crimson field, cream border with a stepped hem, brass trident. Shared by every banner. */
export function heraldry() {
  if (heraldryTexture) return heraldryTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#8c2a23';
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#6a1f1a';
  for (let y = 0; y < 256; y += 6) g.fillRect(0, y, 128, 1);     // weave
  g.fillStyle = '#e4d6af';
  g.fillRect(0, 0, 128, 10);
  g.fillRect(0, 0, 10, 232);
  g.fillRect(118, 0, 10, 232);
  // stepped hem
  g.beginPath();
  g.moveTo(0, 222); g.lineTo(32, 222); g.lineTo(32, 238); g.lineTo(64, 238); g.lineTo(64, 256);
  g.lineTo(64, 238); g.lineTo(96, 238); g.lineTo(96, 222); g.lineTo(128, 222); g.lineTo(128, 236);
  g.lineTo(100, 236); g.lineTo(100, 252); g.lineTo(28, 252); g.lineTo(28, 236); g.lineTo(0, 236); g.closePath();
  g.fill();
  // trident
  g.fillStyle = '#d4a653';
  g.fillRect(60, 70, 8, 120);
  g.fillRect(38, 96, 52, 8);
  g.fillRect(38, 66, 8, 38);
  g.fillRect(82, 66, 8, 38);
  for (const x of [42, 64, 86]) {
    g.beginPath(); g.moveTo(x - 7, 70); g.lineTo(x, 52); g.lineTo(x + 7, 70); g.closePath(); g.fill();
  }
  g.fillRect(54, 186, 20, 8);
  heraldryTexture = new THREE.CanvasTexture(canvas);
  heraldryTexture.colorSpace = THREE.SRGBColorSpace;
  heraldryTexture.anisotropy = 4;
  return heraldryTexture;
}

/** A hanging banner (animated by the caller through mesh.rotation.x); pole included in the metal batch. */
export function banner(batch, rand, { x, y, z, width = 1.1, height = 2.2, facing = 0 }) {
  const geometry = new THREE.PlaneGeometry(width, height, 1, 4);
  geometry.translate(0, -height / 2, 0);
  const material = new THREE.MeshStandardMaterial({ map: heraldry(), roughness: 0.92, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = facing;
  mesh.castShadow = true;
  mesh.userData.phase = rand() * Math.PI * 2;
  const along = [Math.cos(facing), -Math.sin(facing)];
  batch.metal.block({ cx: x, cy: y - 0.03, cz: z, sx: width + 0.3, sy: 0.07, sz: 0.07, rotY: facing, chamfer: 0.01, jitter: 0, color: P.brassDark, rand });
  for (const side of [-1, 1]) {
    const ex = x + along[0] * side * (width / 2 + 0.16);
    const ez = z + along[1] * side * (width / 2 + 0.16);
    batch.metal.lump({ cx: ex, cy: y + 0.005, cz: ez, rx: 0.06, ry: 0.06, rz: 0.06, color: P.brass, rand, squash: 0 });
  }
  return mesh;
}

/** A standing stone with a softly glowing cyan rune (the rune is returned as its own mesh). */
export function runeStone(batch, rand, runeMaterial, { x, y = 0, z, facing = 0, height = 1.5 }) {
  batch.stone.block({ cx: x, cy: y - 0.1, cz: z, sx: 0.62, sy: height, sz: 0.42, rotY: facing, chamfer: 0.12, jitter: 0.05, color: P.stoneDark, rand, shade: 0.18 });
  const rune = new FacetBuilder();
  const face = 0.215;
  const fx = Math.sin(facing) * -face;
  const fz = Math.cos(facing) * -face;
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  const seg = (u0, v0, u1, v1) => {
    const w = 0.035;
    const p = (u, v, du) => [x + fx + (u + du) * c, y + v, z + fz - (u + du) * s];
    rune.quad(p(u0, v0, -w), p(u0, v0, w), p(u1, v1, w), p(u1, v1, -w), 0xffffff);
  };
  const base = height * 0.4;
  seg(0, base, 0, base + 0.55);
  seg(-0.12, base + 0.42, 0.12, base + 0.2);
  seg(-0.1, base + 0.12, 0.1, base + 0.3);
  const mesh = new THREE.Mesh(rune.geometry(), runeMaterial);
  mesh.name = 'rune';
  return mesh;
}
