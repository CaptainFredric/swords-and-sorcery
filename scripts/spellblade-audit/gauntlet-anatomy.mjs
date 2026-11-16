// Gauntlet.<side>: its connected pieces, where each lies along the forearm→hand axis (0 = elbow, 1 = wrist joint, >1 =
// the hand), and how each piece is weighted today.
import { loadGlb, localPose, worldMatrices, apply } from '../lib/glbPose.mjs';
import { readAccessor } from '../lib/glbSkin.mjs';

const [path, side = 'R'] = process.argv.slice(2);
const m = loadGlb(path);
const skin = m.gltf.skins[0];
const jn = skin.joints.map((n) => m.gltf.nodes[n].name);
const world = worldMatrices(m, localPose(m, []));
const at = (name) => apply(world[m.byName.get(name)], [0, 0, 0]);
const elbow = at(`forearm.${side}`), wrist = at(`hand.${side}`);
const axis = wrist.map((v, i) => v - elbow[i]); const len = Math.hypot(...axis); const u = axis.map((v) => v / len);
console.log(`forearm length ${len.toFixed(3)} m, elbow ${elbow.map((v) => v.toFixed(3))}, wrist ${wrist.map((v) => v.toFixed(3))}`);
const node = m.gltf.nodes.find((n) => n.mesh != null && m.gltf.meshes[n.mesh].name === `Gauntlet.${side}`);
// mesh space = world space at bind for this rig? check the node transform
console.log('mesh node transform', JSON.stringify({ t: node.translation, r: node.rotation, s: node.scale }));
for (const [pi, prim] of m.gltf.meshes[node.mesh].primitives.entries()) {
  const pos = readAccessor(m, prim.attributes.POSITION).data, J = readAccessor(m, prim.attributes.JOINTS_0).data, W = readAccessor(m, prim.attributes.WEIGHTS_0).data;
  const idx = readAccessor(m, prim.indices).data, n = pos.length / 3;
  // components by shared vertex index, and by shared position (split normals/UV seams)
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  for (let t = 0; t < idx.length; t += 3) { join(idx[t], idx[t + 1]); join(idx[t + 1], idx[t + 2]); }
  const byPos = new Map();
  for (let v = 0; v < n; v += 1) { const k = `${pos[v * 3].toFixed(5)},${pos[v * 3 + 1].toFixed(5)},${pos[v * 3 + 2].toFixed(5)}`; if (byPos.has(k)) join(v, byPos.get(k)); else byPos.set(k, v); }
  const comps = new Map();
  for (let v = 0; v < n; v += 1) { const r = find(v); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(v); }
  console.log(`primitive ${pi}: ${n} vertices, ${idx.length / 3} triangles, ${comps.size} pieces`);
  const rows = [];
  for (const verts of comps.values()) {
    let lo = Infinity, hi = -Infinity; const w = {};
    for (const v of verts) {
      const p = [pos[v * 3] - elbow[0], pos[v * 3 + 1] - elbow[1], pos[v * 3 + 2] - elbow[2]];
      const s = (p[0] * u[0] + p[1] * u[1] + p[2] * u[2]) / len; lo = Math.min(lo, s); hi = Math.max(hi, s);
      for (let c = 0; c < 4; c += 1) { const x = W[v * 4 + c]; if (x > 0.001) w[jn[J[v * 4 + c]]] = (w[jn[J[v * 4 + c]]] ?? 0) + x; }
    }
    const blended = verts.filter((v) => { let mx = 0; for (let c = 0; c < 4; c += 1) mx = Math.max(mx, W[v * 4 + c]); return mx < 0.98; }).length;
    rows.push({ verts: verts.length, along: `${lo.toFixed(2)}..${hi.toFixed(2)}`, blended, weights: Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, x]) => `${k} ${(x / verts.length).toFixed(2)}`).join(', '), lo });
  }
  rows.sort((a, b) => a.lo - b.lo);
  for (const r of rows) console.log(`  ${String(r.verts).padStart(5)} v  along ${r.along.padEnd(11)} blended ${String(r.blended).padStart(4)}  ${r.weights}`);
}
