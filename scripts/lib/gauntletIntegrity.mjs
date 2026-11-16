// Whether a pose keeps a gauntlet whole: its hard plates neither stretched nor folded, its pieces still meeting where
// they meet at bind (no plate coming away, no new opening at the wrist), and none of its plates inside the sword's
// blade. Pure Node, on the GLB as the game loads it (glbPose's sampler mixes layers as three.js does, so a crossfade
// is measured as the game draws it).
import { localPose, worldMatrices, multiply, apply } from './glbPose.mjs';
import { readAccessor } from './glbSkin.mjs';

const NEAR = 0.01;          // pieces whose vertices come within 1 cm at bind are neighbours
const PAIRS_PER_NEIGHBOUR = 600;

function invertAffine(m) { // column-major 4x4 with a 3x3 linear part
  const a = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
  const det = a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
  const i = [a[4] * a[8] - a[5] * a[7], a[2] * a[7] - a[1] * a[8], a[1] * a[5] - a[2] * a[4], a[5] * a[6] - a[3] * a[8], a[0] * a[8] - a[2] * a[6],
    a[2] * a[3] - a[0] * a[5], a[3] * a[7] - a[4] * a[6], a[1] * a[6] - a[0] * a[7], a[0] * a[4] - a[1] * a[3]].map((x) => x / det);
  const t = [m[12], m[13], m[14]];
  const it = [0, 1, 2].map((r) => -(i[r * 3] * t[0] + i[r * 3 + 1] * t[1] + i[r * 3 + 2] * t[2]));
  return [i[0], i[3], i[6], 0, i[1], i[4], i[7], 0, i[2], i[5], i[8], 0, it[0], it[1], it[2], 1];
}

export function gauntletIntegrity(model, side = 'R') {
  const skin = model.gltf.skins[0];
  const jointName = skin.joints.map((n) => model.gltf.nodes[n].name);
  const ibm = readAccessor(model, skin.inverseBindMatrices).data;
  const elbowish = new Set([`elbow.${side}`, `upper_arm.${side}`, `clavicle.${side}`]);
  const isFinger = (n) => n.endsWith(`.${side}`) && /^(finger|thumb)_/.test(n);
  const node = model.gltf.nodes.find((n) => n.mesh != null && model.gltf.meshes[n.mesh].name === `Gauntlet.${side}`);
  const prim = model.gltf.meshes[node.mesh].primitives[0];
  const pos = readAccessor(model, prim.attributes.POSITION).data, J = readAccessor(model, prim.attributes.JOINTS_0).data;
  const W = readAccessor(model, prim.attributes.WEIGHTS_0).data, idx = readAccessor(model, prim.indices).data;
  const n = pos.length / 3;
  // pieces: by triangles, welded where split vertices share a position
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  for (let t = 0; t < idx.length; t += 3) { join(idx[t], idx[t + 1]); join(idx[t + 1], idx[t + 2]); }
  const at = new Map();
  for (let v = 0; v < n; v += 1) { const k = `${pos[v * 3].toFixed(5)},${pos[v * 3 + 1].toFixed(5)},${pos[v * 3 + 2].toFixed(5)}`; if (at.has(k)) join(v, at.get(k)); else at.set(k, v); }
  const pieceOf = Int32Array.from({ length: n }, (_, v) => find(v));
  const kind = new Map();
  for (let v = 0; v < n; v += 1) {
    const p = pieceOf[v];
    const k = kind.get(p) ?? { finger: 0, elbow: 0, total: 0 };
    for (let c = 0; c < 4; c += 1) { const w = W[v * 4 + c]; if (!w) continue; const name = jointName[J[v * 4 + c]]; k.total += w; if (isFinger(name)) k.finger += w; if (elbowish.has(name)) k.elbow += w; }
    kind.set(p, k);
  }
  const plate = (p) => { const k = kind.get(p); return k.finger <= 0.02 * k.total && k.elbow <= 0.02 * k.total; };
  // plate edges
  const seen = new Set(), edges = [];
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    if (!plate(pieceOf[tri[0]])) continue;
    for (const [a, b] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]]) {
      const key = a < b ? a * 1e6 + b : b * 1e6 + a; if (seen.has(key)) continue; seen.add(key);
      const rest = Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]);
      if (rest > 1e-4) edges.push(a, b, rest);
    }
  }
  // neighbouring pieces and the vertex pairs where they meet at bind
  const cell = (x) => Math.floor(x / NEAR);
  const grid = new Map();
  for (let v = 0; v < n; v += 1) { const k = `${cell(pos[v * 3])},${cell(pos[v * 3 + 1])},${cell(pos[v * 3 + 2])}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(v); }
  const neighbours = new Map();
  for (let v = 0; v < n; v += 1) {
    const cx = cell(pos[v * 3]), cy = cell(pos[v * 3 + 1]), cz = cell(pos[v * 3 + 2]);
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
      for (const u of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
        if (u <= v || pieceOf[u] === pieceOf[v]) continue;
        const d = Math.hypot(pos[v * 3] - pos[u * 3], pos[v * 3 + 1] - pos[u * 3 + 1], pos[v * 3 + 2] - pos[u * 3 + 2]);
        if (d > NEAR) continue;
        const key = pieceOf[v] < pieceOf[u] ? `${pieceOf[v]}-${pieceOf[u]}` : `${pieceOf[u]}-${pieceOf[v]}`;
        if (!neighbours.has(key)) neighbours.set(key, { pairs: [], rest: Infinity });
        const nb = neighbours.get(key);
        nb.rest = Math.min(nb.rest, d);
        if (nb.pairs.length < PAIRS_PER_NEIGHBOUR * 2) nb.pairs.push(v, u);
      }
    }
  }
  const pieceName = (p) => { const k = kind.get(p); const tag = k.elbow > 0.02 * k.total ? 'elbow' : k.finger > 0.02 * k.total ? 'finger' : 'plate'; return `${tag}#${p}`; };
  // the blade, in the sword socket's frame: from just past the guard (the widest section) to the point
  const sword = model.gltf.nodes.find((x) => x.mesh != null && model.gltf.meshes[x.mesh].name === 'HeroSword');
  const sp = model.gltf.meshes[sword.mesh].primitives[0];
  const sPos = readAccessor(model, sp.attributes.POSITION).data, sJ = readAccessor(model, sp.attributes.JOINTS_0).data;
  const socketSlot = sJ[0], socketNode = skin.joints[socketSlot];
  const sIbm = Array.from(ibm.subarray(socketSlot * 16, socketSlot * 16 + 16));
  const local = [];
  for (let v = 0; v < sPos.length / 3; v += 1) local.push(apply(sIbm, [sPos[v * 3], sPos[v * 3 + 1], sPos[v * 3 + 2]]));
  const tip = local.reduce((b, q) => (Math.hypot(...q) > Math.hypot(...b) ? q : b));
  const L = Math.hypot(...tip), axis = tip.map((x) => x / L);
  const along = (q) => q[0] * axis[0] + q[1] * axis[1] + q[2] * axis[2];
  const radial = (q) => { const s = along(q); return Math.hypot(q[0] - axis[0] * s, q[1] - axis[1] * s, q[2] - axis[2] * s); };
  let guard = 0, widest = 0;
  for (const q of local) { const s = along(q); if (s > 0 && s < 0.4 * L && radial(q) > widest) { widest = radial(q); guard = s; } }
  // the blade's own thickness about its axis, from its vertices between the guard and the point
  const bladeVerts = local.filter((q) => along(q) > guard + 0.04 && along(q) < L - 0.05);
  const bladeHalfWidth = Math.max(...bladeVerts.map(radial));
  const plateVerts = [];
  for (let v = 0; v < n; v += 1) if (plate(pieceOf[v])) plateVerts.push(v);

  /** One pose: { plate: [min, max] edge ratio, gaps: { pieces -> metres opened beyond bind }, blade: plate vertices inside the blade } */
  return {
    pieces: [...new Set(pieceOf)].length, plateEdges: edges.length / 3, neighbours: neighbours.size, blade: { guard, length: L, halfWidth: bladeHalfWidth },
    measure(layers) {
      const world = worldMatrices(model, localPose(model, layers));
      const palette = skin.joints.map((nd, k) => multiply(world[nd], Array.from(ibm.subarray(k * 16, k * 16 + 16))));
      const cache = new Float64Array(n * 3).fill(NaN);
      const sk = (v) => {
        if (!Number.isNaN(cache[v * 3])) return [cache[v * 3], cache[v * 3 + 1], cache[v * 3 + 2]];
        const q = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]; const s = [0, 0, 0];
        for (let c = 0; c < 4; c += 1) { const w = W[v * 4 + c]; if (!w) continue; const r = apply(palette[J[v * 4 + c]], q); s[0] += r[0] * w; s[1] += r[1] * w; s[2] += r[2] * w; }
        cache[v * 3] = s[0]; cache[v * 3 + 1] = s[1]; cache[v * 3 + 2] = s[2]; return s;
      };
      let lo = Infinity, hi = -Infinity;
      for (let e = 0; e < edges.length; e += 3) { const a = sk(edges[e]), b = sk(edges[e + 1]); const r = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / edges[e + 2]; if (r < lo) lo = r; if (r > hi) hi = r; }
      const gaps = {};
      for (const [key, nb] of neighbours) {
        let d = Infinity;
        for (let i = 0; i < nb.pairs.length; i += 2) { const a = sk(nb.pairs[i]), b = sk(nb.pairs[i + 1]); const x = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); if (x < d) d = x; }
        gaps[key] = d - nb.rest;
      }
      const toSocket = invertAffine(world[socketNode]);
      let inBlade = 0;
      for (const v of plateVerts) { const q = apply(toSocket, sk(v)); const s = along(q); if (s > guard + 0.04 && s < L && radial(q) < bladeHalfWidth * 0.8) inBlade += 1; }
      return { plate: [lo, hi], gaps, inBlade };
    },
    describe: (key) => key.split('-').map((p) => pieceName(Number(p))).join(' / '),
  };
}
