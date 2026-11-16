// The shoulder plates (every piece of Pauldron.L/.R, and the Breastplate pieces that ride the shoulder: clavicle,
// pauldron and upper arm holding at least 30%) and how far a pose stretches or folds their edges against bind.
import { localPose, worldMatrices, multiply, apply } from './glbPose.mjs';
import { readAccessor } from './glbSkin.mjs';

export function shoulderPlates(model) {
  const skin = model.gltf.skins[0], jn = skin.joints.map((x) => model.gltf.nodes[x].name);
  const ibm = readAccessor(model, skin.inverseBindMatrices).data;
  const shoulderBone = (n) => /^(clavicle|upper_arm|pauldron)\.[LR]$/.test(n);
  const parts = [];
  for (const node of model.gltf.nodes) {
    if (node.mesh == null) continue;
    const mesh = model.gltf.meshes[node.mesh];
    if (!['Pauldron.L', 'Pauldron.R', 'Breastplate'].includes(mesh.name)) continue;
    const p = mesh.primitives[0];
    const pos = readAccessor(model, p.attributes.POSITION).data, J = readAccessor(model, p.attributes.JOINTS_0).data, W = readAccessor(model, p.attributes.WEIGHTS_0).data, idx = readAccessor(model, p.indices).data;
    const n = pos.length / 3;
    const parent = Int32Array.from({ length: n }, (_, i) => i);
    const find = (x) => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
    const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
    for (let t = 0; t < idx.length; t += 3) { join(idx[t], idx[t + 1]); join(idx[t + 1], idx[t + 2]); }
    const at = new Map();
    for (let v = 0; v < n; v += 1) { const k = `${pos[v * 3].toFixed(5)},${pos[v * 3 + 1].toFixed(5)},${pos[v * 3 + 2].toFixed(5)}`; if (at.has(k)) join(v, at.get(k)); else at.set(k, v); }
    const share = new Map();
    for (let v = 0; v < n; v += 1) { const r = find(v); const s = share.get(r) ?? [0, 0]; for (let c = 0; c < 4; c += 1) { s[1] += W[v * 4 + c]; if (shoulderBone(jn[J[v * 4 + c]])) s[0] += W[v * 4 + c]; } share.set(r, s); }
    const keep = (r) => mesh.name.startsWith('Pauldron') || share.get(r)[0] >= 0.3 * share.get(r)[1];
    const edges = [], seen = new Set();
    for (let t = 0; t < idx.length; t += 3) {
      const tri = [idx[t], idx[t + 1], idx[t + 2]];
      if (!keep(find(tri[0]))) continue;
      for (const [a, b] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]]) {
        const k = a < b ? a * 1e6 + b : b * 1e6 + a; if (seen.has(k)) continue; seen.add(k);
        const rest = Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]);
        if (rest > 1e-4) edges.push(a, b, rest);
      }
    }
    parts.push({ pos, J, W, edges });
  }
  /** [smallest, largest] edge length over bind for the shoulder plates in a pose (glbPose layers). */
  return (layers) => {
    const world = worldMatrices(model, localPose(model, layers));
    const pal = skin.joints.map((nd, k) => multiply(world[nd], Array.from(ibm.subarray(k * 16, k * 16 + 16))));
    let lo = Infinity, hi = 0;
    for (const p of parts) {
      const sk = (v) => { const q = [p.pos[v * 3], p.pos[v * 3 + 1], p.pos[v * 3 + 2]], s = [0, 0, 0]; for (let c = 0; c < 4; c += 1) { const w = p.W[v * 4 + c]; if (!w) continue; const r = apply(pal[p.J[v * 4 + c]], q); s[0] += r[0] * w; s[1] += r[1] * w; s[2] += r[2] * w; } return s; };
      for (let e = 0; e < p.edges.length; e += 3) { const a = sk(p.edges[e]), b = sk(p.edges[e + 1]); const r = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / p.edges[e + 2]; if (r < lo) lo = r; if (r > hi) hi = r; }
    }
    return [lo, hi];
  };
}
