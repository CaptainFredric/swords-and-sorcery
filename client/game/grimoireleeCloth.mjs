// Replace baked institutional trident paint *on the existing UV atlas* at load time.
// No mesh overlay: the insignia follows the original cloth skinning, folds, dye and UVs.
// Personal/earned back-banner atlases remain untouched and take precedence when equipped.
import * as THREE from 'three';
import { appUrl } from '../appUrl.mjs';

const cache = new WeakMap(); // original texture -> (geometry -> generated atlas Promise)
let markPromise;
const MARK_URL = '/client/assets/heraldry/grimoirelee.svg';
const MARK_ASPECT = 700 / 1120; // canonical master SVG viewBox
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function markImage() {
  if (!markPromise) markPromise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Grimoirelee mark failed to load'));
    image.src = appUrl(MARK_URL);
  });
  return markPromise;
}

// Map each texture pixel back to its physical location on the cloth. The two
// cape UV islands are rotated/cut in the atlas, so drawing in raw UV-space
// would bend the book and sword. Interpolating positions avoids that distortion.
function clothCoordinates(geometry, size, flipY) {
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  if (!position || !uv) throw new Error('Cape lacks position or UV attributes');
  const indices = geometry.getIndex();
  const count = indices ? indices.count : position.count;
  const x = new Float32Array(size * size);
  const y = new Float32Array(size * size);
  const covered = new Uint8Array(size * size);
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  // Three.js is Y-up after glTF import (the authoring script is Z-up).
  // Rasterize the existing triangles rather than approximating the banner as a plane.
  for (let t = 0; t + 2 < count; t += 3) {
    const ids = [t, t + 1, t + 2].map(i => indices ? indices.getX(i) : i);
    const corners = ids.map(i => ({
      // GLTFLoader sets flipY=false (its UV origin is upper-left); kit textures
      // may use the opposite convention. Match the material's actual upload mode.
      u: uv.getX(i) * (size - 1), v: (flipY ? 1 - uv.getY(i) : uv.getY(i)) * (size - 1),
      px: position.getX(i), py: position.getY(i),
    }));
    const [a, b, c] = corners;
    const det = (b.v - c.v) * (a.u - c.u) + (c.u - b.u) * (a.v - c.v);
    if (Math.abs(det) < 1e-6) continue;
    const left = Math.max(0, Math.floor(Math.min(a.u, b.u, c.u)));
    const right = Math.min(size - 1, Math.ceil(Math.max(a.u, b.u, c.u)));
    const top = Math.max(0, Math.floor(Math.min(a.v, b.v, c.v)));
    const bottom = Math.min(size - 1, Math.ceil(Math.max(a.v, b.v, c.v)));
    for (let py = top; py <= bottom; py += 1) {
      for (let px = left; px <= right; px += 1) {
        const l1 = ((b.v - c.v) * (px - c.u) + (c.u - b.u) * (py - c.v)) / det;
        const l2 = ((c.v - a.v) * (px - c.u) + (a.u - c.u) * (py - c.v)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < -0.002 || l2 < -0.002 || l3 < -0.002) continue;
        const k = py * size + px;
        const across = l1 * a.px + l2 * b.px + l3 * c.px;
        const up = l1 * a.py + l2 * b.py + l3 * c.py;
        covered[k] = 1; x[k] = across; y[k] = up;
        xMin = Math.min(xMin, across); xMax = Math.max(xMax, across);
        yMin = Math.min(yMin, up); yMax = Math.max(yMax, up);
      }
    }
  }
  return { x, y, covered, xMin, xMax, yMin, yMax };
}

async function compose(mesh, base) {
  const [mark] = await Promise.all([markImage()]);
  const original = base.image;
  if (!original?.width || !original?.height) throw new Error('Cloth atlas is not ready');
  const size = original.width;
  if (original.height !== size) throw new Error('Expected a square character texture atlas');
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(original, 0, 0, size, size);
  const pixels = ctx.getImageData(0, 0, size, size);
  const data = pixels.data;
  const coords = clothCoordinates(mesh.geometry, size, base.flipY);
  const { x, y, covered, xMin, xMax, yMin, yMax } = coords;
  const width = xMax - xMin, height = yMax - yMin;
  if (!Number.isFinite(width) || width < 0.01 || height < 0.01) throw new Error('Invalid cloth UV geometry');
  const swatches = [];
  const potential = [];
  for (let i = 0; i < covered.length; i += 1) {
    if (!covered[i]) continue;
    const nx = (x[i] - xMin) / width, ny = (yMax - y[i]) / height;
    if (nx > .19 && nx < .30 && ny > .28 && ny < .72) {
      const p = i * 4;
      swatches.push([data[p], data[p + 1], data[p + 2]]);
    }
  }
  const median = (values, fallback) => {
    if (!values.length) return fallback;
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };
  const field = [0, 1, 2].map((channel) => median(swatches.map(s => s[channel]), [111, 33, 29][channel]));
  let markMinX = Infinity, markMaxX = -Infinity, markMinY = Infinity, markMaxY = -Infinity;
  for (let i = 0; i < covered.length; i += 1) {
    if (!covered[i]) continue;
    const nx = (x[i] - xMin) / width, ny = (yMax - y[i]) / height;
    if (nx < .27 || nx > .73 || ny < .12 || ny > .76) continue; // border and hem are sacred
    const p = i * 4;
    const r = data[p], g = data[p + 1], b = data[p + 2];
    if (g > field[1] * 1.28 && r > field[0] * 1.08 && g > r * .58 && b > r * .39) {
      potential.push(i);
      markMinX = Math.min(markMinX, x[i]); markMaxX = Math.max(markMaxX, x[i]);
      markMinY = Math.min(markMinY, y[i]); markMaxY = Math.max(markMaxY, y[i]);
    }
  }
  // Repaint just the old charge, not the fabric border or any neighboring map islands.
  for (const i of potential) {
    const p = i * 4;
    data[p] = field[0]; data[p + 1] = field[1]; data[p + 2] = field[2];
  }
  const found = potential.length > 16;
  const centreX = found ? (markMinX + markMaxX) / 2 : (xMin + xMax) / 2;
  const centreY = found ? (markMinY + markMaxY) / 2 : yMax - height * .45;
  const markH = Math.min(found ? (markMaxY - markMinY) * 1.2 : height * .53,
    height * .68, width * .76 / MARK_ASPECT);
  const markW = markH * MARK_ASPECT;
  // Pre-rasterize the one master SVG, including the two negative-space blade scars.
  const mw = 350, mh = 560; // half-resolution sampling at the master 700:1120 aspect
  const stamp = document.createElement('canvas');
  stamp.width = mw; stamp.height = mh;
  const sc = stamp.getContext('2d', { willReadFrequently: true });
  sc.drawImage(mark, 0, 0, mw, mh);
  const ink = sc.getImageData(0, 0, mw, mh).data;
  for (let i = 0; i < covered.length; i += 1) {
    if (!covered[i]) continue;
    const u = (x[i] - centreX) / markW + .5;
    const v = (centreY - y[i]) / markH + .5; // canvas y increases downward
    if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
    const ix = Math.floor(u * mw), iy = Math.floor(v * mh);
    const q = (iy * mw + ix) * 4, alpha = ink[q + 3] / 255;
    if (alpha <= 0) continue;
    const p = i * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      data[p + channel] = Math.round(data[p + channel] * (1 - alpha) + ink[q + channel] * alpha);
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = base.flipY;
  texture.colorSpace = base.colorSpace;
  texture.wrapS = base.wrapS; texture.wrapT = base.wrapT;
  texture.anisotropy = base.anisotropy;
  texture.channel = base.channel ?? 0;
  texture.needsUpdate = true;
  return texture;
}

export function grimoireleeClothTexture(mesh, base) {
  if (!base) return Promise.reject(new Error('No cloth atlas'));
  let byGeometry = cache.get(base);
  if (!byGeometry) { byGeometry = new WeakMap(); cache.set(base, byGeometry); }
  if (!byGeometry.has(mesh.geometry)) byGeometry.set(mesh.geometry, compose(mesh, base));
  return byGeometry.get(mesh.geometry);
}
