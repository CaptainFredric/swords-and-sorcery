import * as THREE from 'three';

// The Swords & Sorcery environment kit: chunky faceted pieces that match the Spellblade's armour, built as flat-
// shaded triangles with per-face colour and merged per material (a whole district is a handful of draw calls).
// Used by Castleward now; built to be reused for the slow cinematic town/keep menu later.

// Colours are sRGB hex; three.js converts them to linear for the vertex colour attribute.
export const KIT_PALETTE = Object.freeze({
  stoneLight: 0xb3a88f,
  stone: 0x978d78,
  stoneDark: 0x6f675a,
  stoneDeep: 0x4b463e,
  paving: 0x8f8573,
  grass: 0x5f7a3d,
  grassLight: 0x7a9148,
  grassDark: 0x4a6232,
  earth: 0x8a6c4a,
  earthDark: 0x6a523a,
  timber: 0x5c4231,
  timberDark: 0x3b2b20,
  plaster: 0xd4c5a2,
  thatch: 0xa3875a,
  slate: 0x505659,
  crimson: 0x8c2a23,
  crimsonDark: 0x5c1b17,
  cream: 0xe4d6af,
  brass: 0xc89c50,
  brassDark: 0x8c6a34,
  iron: 0x3b3c3e,
  foliage: 0x4e6f37,
  foliageDark: 0x3c572b,
  foliageLight: 0x6a8b44,
  hedge: 0x3f5e2e,
  cliff: 0x6d655a,
  cliffDark: 0x4a443d,
  flame: 0xffb04a,
  rune: 0x3fd4ee,
});

export { seededRandom, valueNoise } from './kitRandom.mjs';
import { valueNoise } from './kitRandom.mjs';

const _color = new THREE.Color();

/** Accumulates flat-shaded triangles with per-face colour. */
export class FacetBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
  }

  get triangleCount() {
    return this.positions.length / 9;
  }

  tri(a, b, c, color) {
    const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
    const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length; ny /= length; nz /= length;
    _color.set(color);
    for (const p of [a, b, c]) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(nx, ny, nz);
      this.colors.push(_color.r, _color.g, _color.b);
    }
  }

  // a triangle whose colour blends between its corners (soft ground), still with a flat normal
  triBlend(a, b, c, colorA, colorB, colorC) {
    const start = this.colors.length;
    this.tri(a, b, c, colorA);
    for (const [k, color] of [[1, colorB], [2, colorC]]) {
      _color.set(color);
      this.colors[start + k * 3] = _color.r;
      this.colors[start + k * 3 + 1] = _color.g;
      this.colors[start + k * 3 + 2] = _color.b;
    }
  }

  // counter-clockwise seen from outside
  quad(a, b, c, d, color) {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }

  /**
   * A stone block: bottom flush, top edges chamfered, top corners jittered so no two blocks catch light alike.
   * @param {object} o  cx, cy (bottom), cz, sx, sy, sz, rotY, chamfer, jitter, color, rand, shade (0..1 variance)
   */
  block({ cx, cy, cz, sx, sy, sz, rotY = 0, chamfer = 0.06, jitter = 0.02, color = KIT_PALETTE.stone, rand = Math.random, shade = 0.12, bottom = false }) {
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    const hx = sx / 2;
    const hz = sz / 2;
    const ch = Math.min(chamfer, hx * 0.45, hz * 0.45, sy * 0.45);
    const at = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const top = sy;
    const j = () => (rand() - 0.5) * 2 * jitter;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const B = corners.map(([u, v]) => at(u * hx, 0, v * hz));
    const M = corners.map(([u, v]) => at(u * hx, top - ch, v * hz));
    const T = corners.map(([u, v]) => at(u * (hx - ch), top + j(), v * (hz - ch)));
    const tone = (factor) => shadeColor(color, factor + (rand() - 0.5) * shade);
    for (let i = 0; i < 4; i += 1) {
      const k = (i + 1) % 4;
      this.quad(B[k], B[i], M[i], M[k], tone(0.94));   // side
      this.quad(M[k], M[i], T[i], T[k], tone(1.04));   // chamfer
    }
    this.quad(T[3], T[2], T[1], T[0], tone(1.08));     // top (winding toward +y)
    if (bottom) this.quad(B[0], B[1], B[2], B[3], tone(0.7));
  }

  /** A faceted lump (icosahedron-derived) for foliage, rocks and hedges. */
  lump({ cx, cy, cz, rx, ry, rz, color, rand = Math.random, detail = 0, shade = 0.16, squash = 0.12 }) {
    const geometry = new THREE.IcosahedronGeometry(1, detail);
    const pos = geometry.getAttribute('position');
    const jittered = [];
    const seen = new Map();
    for (let i = 0; i < pos.count; i += 1) {
      const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      if (!seen.has(key)) seen.set(key, 1 + (rand() - 0.5) * 2 * squash);
      const k = seen.get(key);
      jittered.push([cx + pos.getX(i) * rx * k, cy + pos.getY(i) * ry * k, cz + pos.getZ(i) * rz * k]);
    }
    for (let i = 0; i < jittered.length; i += 3) {
      const up = (jittered[i][1] + jittered[i + 1][1] + jittered[i + 2][1]) / 3 - cy;
      this.tri(jittered[i], jittered[i + 1], jittered[i + 2], shadeColor(color, 0.86 + 0.2 * Math.sign(up) * Math.min(1, Math.abs(up) / ry) + (rand() - 0.5) * shade));
    }
    geometry.dispose();
  }

  /** A tapered, faceted prism along +y (trunks, posts, spires). */
  prism({ cx, cy, cz, radiusBottom, radiusTop, height, sides = 6, color, rand = Math.random, rotY = 0, shade = 0.1, cap = true }) {
    for (let i = 0; i < sides; i += 1) {
      const a0 = rotY + (i / sides) * Math.PI * 2;
      const a1 = rotY + ((i + 1) / sides) * Math.PI * 2;
      const b0 = [cx + Math.cos(a0) * radiusBottom, cy, cz + Math.sin(a0) * radiusBottom];
      const b1 = [cx + Math.cos(a1) * radiusBottom, cy, cz + Math.sin(a1) * radiusBottom];
      const t0 = [cx + Math.cos(a0) * radiusTop, cy + height, cz + Math.sin(a0) * radiusTop];
      const t1 = [cx + Math.cos(a1) * radiusTop, cy + height, cz + Math.sin(a1) * radiusTop];
      this.quad(b0, t0, t1, b1, shadeColor(color, 0.92 + (rand() - 0.5) * shade));
      if (cap && radiusTop > 1e-3) this.tri([cx, cy + height, cz], t1, t0, shadeColor(color, 1.05));
    }
  }

  /** A pyramid roof or spire over a rectangle (ridge along x when ridge > 0). */
  roof({ cx, cy, cz, sx, sz, height, overhang = 0.3, ridge = 0, color, rand = Math.random, rotY = 0 }) {
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    const at = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const hx = sx / 2 + overhang;
    const hz = sz / 2 + overhang;
    const r = Math.min(ridge, hx * 0.9);
    const e = [at(-hx, 0, -hz), at(hx, 0, -hz), at(hx, 0, hz), at(-hx, 0, hz)];
    const p0 = at(-r, height, 0);
    const p1 = at(r, height, 0);
    const tone = (f) => shadeColor(color, f + (rand() - 0.5) * 0.08);
    this.quad(e[0], p0, p1, e[1], tone(0.96));   // front slope (-z)
    this.quad(e[2], p1, p0, e[3], tone(1.02));   // back slope
    this.tri(e[1], p1, e[2], tone(0.9));          // hips
    this.tri(e[3], p0, e[0], tone(0.88));
    this.quad(e[0], e[1], e[2], e[3], tone(0.6)); // eaves underside
  }

  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeBoundingSphere();
    return geometry;
  }
}

export function shadeColor(hex, factor) {
  const color = new THREE.Color(hex);
  color.multiplyScalar(Math.max(0, factor));
  return color;
}

/** One merged mesh per builder, shadows on. */
export function facetMesh(builder, material, { castShadow = true, receiveShadow = true, name = '' } = {}) {
  const mesh = new THREE.Mesh(builder.geometry(), material);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.name = name;
  return mesh;
}

export function kitMaterials() {
  return {
    stone: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0.02 }),
    ground: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 }),
    wood: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88, metalness: 0 }),
    foliage: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.42, metalness: 0.72 }),
    cloth: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, side: THREE.DoubleSide }),
    flame: new THREE.MeshBasicMaterial({ color: KIT_PALETTE.flame, transparent: true, opacity: 0.92 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffb35a, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }),
    rune: new THREE.MeshStandardMaterial({ color: 0x1d3a40, emissive: KIT_PALETTE.rune, emissiveIntensity: 0.9, roughness: 0.4, flatShading: true, side: THREE.DoubleSide }),
  };
}
