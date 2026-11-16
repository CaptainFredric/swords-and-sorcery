// The gauntlet's wrist and hand plates (Gauntlet.L/.R pieces held by the forearm, the hand and the fingers, not the
// elbow) and how far a pose stretches or folds their edges against bind. Shared by the regression test and the tools.
import { localPose, worldMatrices, multiply, apply } from './glbPose.mjs';
import { readAccessor } from './glbSkin.mjs';

export function gauntletPlates(model, side = 'R') {
  const skin = model.gltf.skins[0];
  const jointName = skin.joints.map((n) => model.gltf.nodes[n].name);
  const elbowish = new Set([`elbow.${side}`, `upper_arm.${side}`, `clavicle.${side}`]);
  const node = model.gltf.nodes.find((n) => n.mesh != null && model.gltf.meshes[n.mesh].name === `Gauntlet.${side}`);
  const plates = [];
  for (const prim of model.gltf.meshes[node.mesh].primitives) {
    const pos = readAccessor(model, prim.attributes.POSITION).data, J = readAccessor(model, prim.attributes.JOINTS_0).data;
    const W = readAccessor(model, prim.attributes.WEIGHTS_0).data, idx = readAccessor(model, prim.indices).data;
    const n = pos.length / 3;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x) => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
    const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
    for (let t = 0; t < idx.length; t += 3) { join(idx[t], idx[t + 1]); join(idx[t + 1], idx[t + 2]); }
    const at = new Map();
    for (let v = 0; v < n; v += 1) { const k = `${pos[v * 3].toFixed(5)},${pos[v * 3 + 1].toFixed(5)},${pos[v * 3 + 2].toFixed(5)}`; if (at.has(k)) join(v, at.get(k)); else at.set(k, v); }
    const touchesElbow = new Set();
    for (let v = 0; v < n; v += 1) for (let c = 0; c < 4; c += 1) if (W[v * 4 + c] > 0.02 && elbowish.has(jointName[J[v * 4 + c]])) touchesElbow.add(find(v));
    const seen = new Set();
    const edges = [];
    for (let t = 0; t < idx.length; t += 3) {
      const tri = [idx[t], idx[t + 1], idx[t + 2]];
      if (touchesElbow.has(find(tri[0]))) continue;
      for (const [a, b] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]]) {
        const k = a < b ? a * 1e6 + b : b * 1e6 + a; if (seen.has(k)) continue; seen.add(k);
        const rest = Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]);
        if (rest > 1e-4) edges.push([a, b, rest]);
      }
    }
    plates.push({ pos, J, W, edges });
  }
  const ibm = readAccessor(model, skin.inverseBindMatrices).data;
  /** [smallest, largest] edge length over bind for the plates in a pose (layers as glbPose.localPose takes them). */
  return (layers) => {
    const world = worldMatrices(model, localPose(model, layers));
    const palette = skin.joints.map((nd, k) => multiply(world[nd], Array.from(ibm.subarray(k * 16, k * 16 + 16))));
    let lo = Infinity, hi = -Infinity;
    for (const p of plates) {
      const cache = new Map();
      const skinned = (v) => {
        if (cache.has(v)) return cache.get(v);
        const q = [p.pos[v * 3], p.pos[v * 3 + 1], p.pos[v * 3 + 2]], s = [0, 0, 0];
        for (let c = 0; c < 4; c += 1) { const w = p.W[v * 4 + c]; if (!w) continue; const r = apply(palette[p.J[v * 4 + c]], q); s[0] += r[0] * w; s[1] += r[1] * w; s[2] += r[2] * w; }
        cache.set(v, s); return s;
      };
      for (const [a, b, rest] of p.edges) { const x = skinned(a), y = skinned(b); const r = Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) / rest; lo = Math.min(lo, r); hi = Math.max(hi, r); }
    }
    return [lo, hi];
  };
}
