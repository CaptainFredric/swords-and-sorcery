// A skinned mesh's connected pieces (welded where split vertices share a position), each with its size, its weights'
// means, and whether those weights vary across it (a gradient inside one rigid-looking piece is what tears).
//   node scripts/spellblade-audit/mesh-pieces.mjs <model.glb> <Mesh name> [--min 20]
import { loadGlb } from '../lib/glbPose.mjs';
import { readAccessor } from '../lib/glbSkin.mjs';

const args = process.argv.slice(2);
const [path, meshName] = args.filter((a) => !a.startsWith('--'));
const min = Number(args.includes('--min') ? args[args.indexOf('--min') + 1] : 20);
const m = loadGlb(path);
const jn = m.gltf.skins[0].joints.map((n) => m.gltf.nodes[n].name);
const node = m.gltf.nodes.find((n) => n.mesh != null && m.gltf.meshes[n.mesh].name === meshName);
const p = m.gltf.meshes[node.mesh].primitives[0];
const pos = readAccessor(m, p.attributes.POSITION).data, J = readAccessor(m, p.attributes.JOINTS_0).data, W = readAccessor(m, p.attributes.WEIGHTS_0).data, idx = readAccessor(m, p.indices).data;
const n = pos.length / 3;
const parent = Int32Array.from({ length: n }, (_, i) => i);
const find = (x) => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
for (let t = 0; t < idx.length; t += 3) { join(idx[t], idx[t + 1]); join(idx[t + 1], idx[t + 2]); }
const at = new Map();
for (let v = 0; v < n; v += 1) { const k = `${pos[v * 3].toFixed(5)},${pos[v * 3 + 1].toFixed(5)},${pos[v * 3 + 2].toFixed(5)}`; if (at.has(k)) join(v, at.get(k)); else at.set(k, v); }
const pieces = new Map();
for (let v = 0; v < n; v += 1) { const r = find(v); if (!pieces.has(r)) pieces.set(r, []); pieces.get(r).push(v); }
const rows = [];
for (const [root, verts] of pieces) {
  const sum = {}, sq = {};
  for (const v of verts) { const w = {}; for (let c = 0; c < 4; c += 1) if (W[v * 4 + c] > 0) w[jn[J[v * 4 + c]]] = (w[jn[J[v * 4 + c]]] ?? 0) + W[v * 4 + c];
    for (const [k, x] of Object.entries(w)) { sum[k] = (sum[k] ?? 0) + x; sq[k] = (sq[k] ?? 0) + x * x; } }
  const means = Object.entries(sum).map(([k, s]) => [k, s / verts.length]).sort((a, b) => b[1] - a[1]);
  // spread: the largest standard deviation of any bone's weight across the piece (0 = one rigid blend)
  const spread = Math.max(...Object.keys(sum).map((k) => Math.sqrt(Math.max(0, sq[k] / verts.length - (sum[k] / verts.length) ** 2))));
  const cy = verts.reduce((s, v) => s + pos[v * 3 + 1], 0) / verts.length, cx = verts.reduce((s, v) => s + pos[v * 3], 0) / verts.length;
  rows.push({ root, n: verts.length, spread, means, cx, cy });
}
rows.sort((a, b) => b.n - a.n);
console.log(`${meshName}: ${n} vertices, ${pieces.size} pieces (showing those of ${min}+ vertices)`);
for (const r of rows.filter((r) => r.n >= min)) console.log(`  #${String(r.root).padEnd(6)} ${String(r.n).padStart(5)} v  centre x ${r.cx.toFixed(2)} y ${r.cy.toFixed(2)}  spread ${r.spread.toFixed(2)}  ${r.means.slice(0, 4).map(([k, x]) => `${k} ${x.toFixed(2)}`).join(', ')}`);
