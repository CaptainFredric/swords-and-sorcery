// The shoulders over everything the game plays (the played clips with the sidecar's techniques, every frame, and the
// crossfades), pose for pose against a reference model: how far the shoulder plates stretch or fold (Pauldron.L/.R and
// the Breastplate pieces that ride the shoulder), and whether any of them parts from a neighbour (any piece of
// Pauldron, Breastplate or Gauntlet it meets within 1 cm at bind, across meshes) further than the reference has it.
//   node scripts/spellblade-audit/shoulder-exposure.mjs <reference.glb> <model.glb>
import { localPose, worldMatrices, multiply, apply } from '../lib/glbPose.mjs';
import { readAccessor } from '../lib/glbSkin.mjs';
import { gameModel, TRANSITIONS } from './gauntlet-integrity.mjs';

const MESHES = ['Pauldron.L', 'Pauldron.R', 'Breastplate', 'Gauntlet.L', 'Gauntlet.R'];
const shoulderBone = (n) => /^(clavicle|upper_arm|pauldron)\.[LR]$/.test(n);

function setup(model) {
  const skin = model.gltf.skins[0], jn = skin.joints.map((x) => model.gltf.nodes[x].name);
  const ibm = readAccessor(model, skin.inverseBindMatrices).data;
  const verts = []; // { mesh, piece, pos, J, W, v }
  const parts = [];
  for (const node of model.gltf.nodes) {
    if (node.mesh == null) continue;
    const mesh = model.gltf.meshes[node.mesh];
    if (!MESHES.includes(mesh.name)) continue;
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
    const shoulderPiece = (r) => mesh.name.startsWith('Pauldron') || (mesh.name === 'Breastplate' && share.get(r)[0] >= 0.3 * share.get(r)[1]);
    const part = { mesh: mesh.name, pos, J, W, find, shoulderPiece, edges: [] };
    const seen = new Set();
    for (let t = 0; t < idx.length; t += 3) {
      const tri = [idx[t], idx[t + 1], idx[t + 2]];
      if (!shoulderPiece(find(tri[0]))) continue;
      for (const [a, b] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]]) {
        const k = a < b ? a * 1e6 + b : b * 1e6 + a; if (seen.has(k)) continue; seen.add(k);
        const rest = Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]);
        if (rest > 1e-4) part.edges.push(a, b, rest);
      }
    }
    parts.push(part);
    for (let v = 0; v < n; v += 1) verts.push({ part, v, piece: `${mesh.name}#${find(v)}`, shoulder: shoulderPiece(find(v)) });
  }
  // neighbouring pieces, across meshes, where at least one is a shoulder piece
  const cell = (x) => Math.floor(x / 0.01), grid = new Map();
  verts.forEach((x, i) => { const p = x.part.pos; const k = `${cell(p[x.v * 3])},${cell(p[x.v * 3 + 1])},${cell(p[x.v * 3 + 2])}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
  const neighbours = new Map();
  verts.forEach((x, i) => {
    if (!x.shoulder) return;
    const p = x.part.pos, cx = cell(p[x.v * 3]), cy = cell(p[x.v * 3 + 1]), cz = cell(p[x.v * 3 + 2]);
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) for (const j of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
      const y = verts[j]; if (y.piece === x.piece) continue;
      const q = y.part.pos; const d = Math.hypot(p[x.v * 3] - q[y.v * 3], p[x.v * 3 + 1] - q[y.v * 3 + 1], p[x.v * 3 + 2] - q[y.v * 3 + 2]);
      if (d > 0.01) continue;
      const key = x.piece < y.piece ? `${x.piece}|${y.piece}` : `${y.piece}|${x.piece}`;
      if (!neighbours.has(key)) neighbours.set(key, { pairs: [], rest: Infinity });
      const nb = neighbours.get(key); nb.rest = Math.min(nb.rest, d); if (nb.pairs.length < 800) nb.pairs.push([x, y]);
    }
  });
  return (layers) => {
    const world = worldMatrices(model, localPose(model, layers));
    const pal = skin.joints.map((nd, k) => multiply(world[nd], Array.from(ibm.subarray(k * 16, k * 16 + 16))));
    const sk = (part, v) => { const q = [part.pos[v * 3], part.pos[v * 3 + 1], part.pos[v * 3 + 2]], s = [0, 0, 0]; for (let c = 0; c < 4; c += 1) { const w = part.W[v * 4 + c]; if (!w) continue; const r = apply(pal[part.J[v * 4 + c]], q); s[0] += r[0] * w; s[1] += r[1] * w; s[2] += r[2] * w; } return s; };
    let lo = Infinity, hi = 0;
    for (const part of parts) for (let e = 0; e < part.edges.length; e += 3) { const a = sk(part, part.edges[e]), b = sk(part, part.edges[e + 1]); const r = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / part.edges[e + 2]; if (r < lo) lo = r; if (r > hi) hi = r; }
    const gaps = {};
    for (const [key, nb] of neighbours) { let d = Infinity; for (const [x, y] of nb.pairs) { const a = sk(x.part, x.v), b = sk(y.part, y.v); d = Math.min(d, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])); } gaps[key] = d - nb.rest; }
    return { plate: [lo, hi], gaps };
  };
}

const [refPath, path] = process.argv.slice(2);
const [ref, { clips }] = gameModel(refPath), [model] = gameModel(path);
const mr = setup(ref), mm = setup(model);
const poses = [];
for (const clip of clips) { const c = model.clips.get(clip); for (let t = 0; t <= c.duration + 1e-9; t += 1 / 30) poses.push([`${clip}@${t.toFixed(3)}`, [{ clip, time: Math.min(c.duration, t), weight: 1 }]]); }
for (const [a, ta, b, tb] of TRANSITIONS) { if (!clips.includes(a) || !clips.includes(b)) continue; for (let w = 0.1; w < 0.95; w += 0.1) poses.push([`${a}->${b} ${w.toFixed(1)}`, [{ clip: a, time: Math.min(model.clips.get(a).duration, ta + w * 0.12), weight: 1 - w }, { clip: b, time: Math.min(model.clips.get(b).duration, tb + w * 0.12), weight: w }]]); }
let st = 0, fo = 0, hole = 0, worstHole = { cm: 0 }, worst = { hi: 0, lo: 1 };
const opened = [];
for (const [label, layers] of poses) {
  const a = mm(layers), b = mr(layers);
  if (a.plate[1] > 1.5) st += 1; if (a.plate[0] < 0.6) fo += 1;
  if (a.plate[1] > worst.hi) { worst.hi = a.plate[1]; worst.hiAt = label; } if (a.plate[0] < worst.lo) { worst.lo = a.plate[0]; worst.loAt = label; }
  let o = 0, pair = '';
  for (const [k, g] of Object.entries(a.gaps)) { const d = g - (b.gaps[k] ?? 0); if (d > o) { o = d; pair = k; } }
  opened.push(o * 100); if (o > 0.02) hole += 1;
  if (o * 100 > worstHole.cm) worstHole = { cm: +(o * 100).toFixed(1), at: label, pair };
}
const pct = (x) => `${(100 * x / poses.length).toFixed(1)}%`;
const s = [...opened].sort((x, y) => x - y);
console.log(JSON.stringify({ model: path.split('/').pop(), poses: poses.length, shoulderStretched15: pct(st), shoulderFolded06: pct(fo), worstStretch: [+worst.hi.toFixed(2), worst.hiAt], worstFold: [+worst.lo.toFixed(2), worst.loAt],
  partsFurtherApartThanReference: { over2cm: pct(hole), p50cm: +s[Math.floor(s.length / 2)].toFixed(2), p90cm: +s[Math.floor(s.length * 0.9)].toFixed(2), worst: worstHole } }));
