import * as THREE from 'three';
import { seededRandom } from './kitRandom.mjs';
import { subtractRects } from './rects.mjs';

// Drawn surfaces for big walkable floors: a deck of planks and a floor of laid flagstones, painted once into small
// canvases and tiled in world space (so a deck's planks run on unbroken from one floor to the next). The colours are
// the floor's own, varied board to board and stone to stone: the floor reads as built, not as one flat sheet.
// `metresPerTile` is how much floor one repeat of the canvas covers.

export const PLANK_TILE_METRES = 4;
export const FLAG_TILE_METRES = 4.8;

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
function shade(color, factor) {
  const c = new THREE.Color(color);
  return hex(new THREE.Color(Math.min(1, c.r * factor), Math.min(1, c.g * factor), Math.min(1, c.b * factor)).getHex());
}

function canvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

const cache = new Map();

/** Planks running along the canvas's width (u), eight boards to a tile, staggered butt joints, nails and grain. */
export function plankTexture(base = 0x7a5740, seed = 11) {
  const key = `plank:${base}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const rand = seededRandom(seed);
  const boards = 8;
  const h = size / boards;
  for (let row = 0; row < boards; row += 1) {
    const y = row * h;
    // each row is two or three boards end to end, their joints staggered from the row above
    let x = -Math.floor(rand() * size * 0.6);
    while (x < size) {
      const length = size * (0.45 + rand() * 0.5);
      const tone = shade(base, 0.82 + rand() * 0.34);
      for (const dx of [0, size]) {
        g.fillStyle = tone;
        g.fillRect(x + dx - size, y, length, h);
        g.fillRect(x + dx, y, length, h);
      }
      // grain: a few faint long lines along the board
      g.globalAlpha = 0.18;
      for (let k = 0; k < 4; k += 1) {
        g.fillStyle = shade(base, 0.62 + rand() * 0.2);
        const gy = y + 3 + rand() * (h - 6);
        for (const dx of [-size, 0, size]) g.fillRect(x + dx + rand() * 8, gy, length * (0.5 + rand() * 0.45), 1);
      }
      g.globalAlpha = 1;
      // the joint, and a pair of nails either side of it
      g.fillStyle = shade(base, 0.38);
      for (const dx of [-size, 0, size]) {
        g.fillRect(x + dx + length - 1, y, 2, h);
        for (const nx of [x + dx + 5, x + dx + length - 7]) {
          g.fillRect(nx, y + h * 0.25, 2, 2);
          g.fillRect(nx, y + h * 0.7, 2, 2);
        }
      }
      x += length;
    }
    // the seam between rows: dark, with a lighter worn lip above it
    g.fillStyle = shade(base, 0.32);
    g.fillRect(0, y + h - 2, size, 2);
    g.fillStyle = shade(base, 1.18);
    g.globalAlpha = 0.35;
    g.fillRect(0, y, size, 1);
    g.globalAlpha = 1;
  }
  const texture = canvasTexture(canvas);
  cache.set(key, texture);
  return texture;
}

/** Laid flagstones: rows of stones of uneven length, each its own shade, in pale mortar, a little worn at the edges. */
export function flagstoneTexture(base = 0x9b9a83, seed = 23) {
  const key = `flag:${base}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const rand = seededRandom(seed);
  g.fillStyle = shade(base, 0.62);
  g.fillRect(0, 0, size, size);
  const rows = 5;
  const h = size / rows;
  const joint = 3;
  for (let row = 0; row < rows; row += 1) {
    const y = row * h;
    let x = -Math.floor(rand() * 40);
    while (x < size) {
      const length = h * (0.8 + rand() * 0.9);
      const tone = shade(base, 0.8 + rand() * 0.32);
      for (const dx of [0, size, -size]) {
        g.fillStyle = tone;
        g.fillRect(x + dx + joint / 2, y + joint / 2, length - joint, h - joint);
        // worn edges: a darker rim along the bottom and right, a lighter one top and left
        g.globalAlpha = 0.28;
        g.fillStyle = shade(base, 0.6);
        g.fillRect(x + dx + joint / 2, y + h - joint / 2 - 3, length - joint, 3);
        g.fillRect(x + dx + length - joint / 2 - 3, y + joint / 2, 3, h - joint);
        g.fillStyle = shade(base, 1.22);
        g.fillRect(x + dx + joint / 2, y + joint / 2, length - joint, 2);
        g.globalAlpha = 1;
      }
      // a few specks and a crack now and then
      g.globalAlpha = 0.22;
      g.fillStyle = shade(base, 0.55);
      for (let k = 0; k < 6; k += 1) g.fillRect(x + rand() * length, y + rand() * h, 2, 2);
      if (rand() < 0.3) {
        g.beginPath();
        g.strokeStyle = shade(base, 0.5);
        g.moveTo(x + rand() * length, y + 4);
        g.lineTo(x + rand() * length, y + h * 0.5);
        g.lineTo(x + rand() * length, y + h - 4);
        g.stroke();
      }
      g.globalAlpha = 1;
      x += length;
    }
  }
  const texture = canvasTexture(canvas);
  cache.set(key, texture);
  return texture;
}

/**
 * World-space UVs for flat floor triangles (x, y, z triples): u across the way, v along it. `acrossX(x, z, y)` says
 * whether, at a triangle's middle, planks run along x (a deck whose length runs along z); else they run along z.
 */
export function floorUVs(vertices, metres, acrossX = () => true) {
  const uvs = new Float32Array((vertices.length / 3) * 2);
  for (let t = 0; t < vertices.length; t += 9) {
    const mx = (vertices[t] + vertices[t + 3] + vertices[t + 6]) / 3;
    const my = (vertices[t + 1] + vertices[t + 4] + vertices[t + 7]) / 3;
    const mz = (vertices[t + 2] + vertices[t + 5] + vertices[t + 8]) / 3;
    const along = acrossX(mx, mz, my);
    for (let k = 0; k < 3; k += 1) {
      const x = vertices[t + k * 3];
      const z = vertices[t + k * 3 + 2];
      const i = (t / 3 + k) * 2;
      uvs[i] = (along ? x : z) / metres;
      uvs[i + 1] = (along ? z : x) / metres;
    }
  }
  return uvs;
}

/**
 * One mesh of floors' top faces, tiled with a drawn surface: each floor's top minus what earlier floors at its height
 * already cover (they overlap a little so routes run straight; two faces must never share a plane), and its slab's
 * edges where it meets a drop, in `edgeColor`. Planks run across each floor's longer side.
 */
export function drawnFloors(floors, material, { metres = FLAG_TILE_METRES, name = 'drawn-floors', draw = () => true } = {}) {
  const positions = [];
  const uvs = [];
  const push = (x, y, z, alongX) => {
    positions.push(x, y, z);
    uvs.push((alongX ? x : z) / metres, (alongX ? z : x) / metres);
  };
  floors.forEach((floor, index) => {
    if (!draw(floor)) return;
    const [cx, , cz] = floor.center;
    const [sx, sy, sz] = floor.size;
    const y = floor.y;
    const alongX = sz >= sx;
    const covers = floors.slice(0, index).filter((other) => Math.abs(other.y - y) < 1e-6).map((other) => ({
      minX: other.center[0] - other.size[0] / 2, maxX: other.center[0] + other.size[0] / 2,
      minZ: other.center[2] - other.size[2] / 2, maxZ: other.center[2] + other.size[2] / 2,
    }));
    const pieces = subtractRects({ xa: cx - sx / 2, xb: cx + sx / 2, za: cz - sz / 2, zb: cz + sz / 2 }, covers);
    for (const { xa, xb, za, zb } of pieces) {
      // (counter-clockwise seen from above)
      push(xa, y, za, alongX); push(xa, y, zb, alongX); push(xb, y, zb, alongX);
      push(xa, y, za, alongX); push(xb, y, zb, alongX); push(xb, y, za, alongX);
    }
    // the slab's edges, its thickness, outward (seen where a floor meets a drop), drawn with the same stones
    const [xa, xb, za, zb, b] = [cx - sx / 2, cx + sx / 2, cz - sz / 2, cz + sz / 2, y - sy];
    const side = (p, q, r, t) => { for (const v of [p, q, r, p, r, t]) push(...v, true); };
    side([xb, b, za], [xa, b, za], [xa, y, za], [xb, y, za]);
    side([xa, b, zb], [xb, b, zb], [xb, y, zb], [xa, y, zb]);
    side([xa, b, za], [xa, b, zb], [xa, y, zb], [xa, y, za]);
    side([xb, b, zb], [xb, b, za], [xb, y, za], [xb, y, zb]);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = name;
  return mesh;
}
