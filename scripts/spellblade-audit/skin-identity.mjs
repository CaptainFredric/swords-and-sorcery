// Byte-level comparison of two GLBs' geometry, skinning and rest skeleton (accessor contents, not buffer layout).
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

function load(p) {
  const b = readFileSync(p);
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jl));
  return { json, bin: b.subarray(20 + jl + 8) };
}
const COMP = { 5126: 4, 5123: 2, 5121: 1, 5125: 4, 5122: 2, 5120: 1 };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function acc(g, i) {
  const a = g.json.accessors[i], v = g.json.bufferViews[a.bufferView];
  const sz = WIDTH[a.type] * COMP[a.componentType], st = v.byteStride || sz;
  const base = (v.byteOffset || 0) + (a.byteOffset || 0);
  const out = Buffer.alloc(a.count * sz);
  for (let k = 0; k < a.count; k++) g.bin.copy(out, k * sz, base + k * st, base + k * st + sz);
  return createHash('sha1').update(out).digest('hex');
}
const [A, B] = process.argv.slice(2).map(load);
const diffs = [];
let n = 0;
for (const m of A.json.meshes) {
  const o = B.json.meshes.find((x) => x.name === m.name);
  if (!o) { diffs.push(m.name + ':missing'); continue; }
  m.primitives.forEach((p, pi) => {
    const q = o.primitives[pi];
    for (const [k, ai] of Object.entries(p.attributes)) {
      n++;
      if (q.attributes[k] == null || acc(A, ai) !== acc(B, q.attributes[k])) diffs.push(`${m.name}.${pi}.${k}`);
    }
    if (p.indices != null) { n++; if (acc(A, p.indices) !== acc(B, q.indices)) diffs.push(`${m.name}.${pi}.indices`); }
  });
}
A.json.skins.forEach((s, i) => {
  const t = B.json.skins[i];
  n += 2;
  if (acc(A, s.inverseBindMatrices) !== acc(B, t.inverseBindMatrices)) diffs.push(`skin${i}.inverseBind`);
  const names = (g, sk) => sk.joints.map((j) => g.json.nodes[j].name).join();
  if (names(A, s) !== names(B, t)) diffs.push(`skin${i}.joints`);
});
const rest = (g) => g.json.nodes.map((x) => x.name + JSON.stringify([x.translation, x.rotation, x.scale, x.children?.length])).join('|');
n++;
if (rest(A) !== rest(B)) diffs.push('rest skeleton');
console.log(`${A.json.meshes.length} meshes, ${n} accessors/structures compared; differing: ${diffs.join(', ') || 'none'}`);
