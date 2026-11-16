// What still distorts on the sword arm, by region, over everything the game plays (the played clips with the sidecar's
// techniques, every frame): the shoulder (Pauldron.R and the Breastplate's shoulder, weighted to clavicle / pauldron /
// upper arm), the elbow (the pieces the elbow cop holds), the cuff and wrist band (Gauntlet.R's wrist plates), and the
// hand plates. For each: how often an edge is stretched past 1.5x or folded under 0.6x, and the worst.
//   node scripts/spellblade-audit/arm-regions.mjs <model.glb> [...more.glb]
import { localPose, worldMatrices, multiply, apply } from '../lib/glbPose.mjs';
import { readAccessor } from '../lib/glbSkin.mjs';
import { gameModel } from './gauntlet-integrity.mjs';

function regions(model) {
  const skin = model.gltf.skins[0];
  const jn = skin.joints.map((n) => model.gltf.nodes[n].name);
  const ibm = readAccessor(model, skin.inverseBindMatrices).data;
  const parts = [];
  for (const node of model.gltf.nodes) {
    if (node.mesh == null) continue;
    const mesh = model.gltf.meshes[node.mesh];
    if (!['Gauntlet.R', 'Breastplate', 'Pauldron.R'].includes(mesh.name)) continue;
    const p = mesh.primitives[0];
    const pos = readAccessor(model, p.attributes.POSITION).data, J = readAccessor(model, p.attributes.JOINTS_0).data, W = readAccessor(model, p.attributes.WEIGHTS_0).data, idx = readAccessor(model, p.indices).data;
    const share = (v, names) => { let s = 0; for (let c = 0; c < 4; c += 1) if (names.has(jn[J[v * 4 + c]])) s += W[v * 4 + c]; return s; };
    const SHOULDER = new Set(['clavicle.R', 'pauldron.R', 'upper_arm.R']), ELBOW = new Set(['elbow.R']), FOREARM = new Set(['forearm.R']), HAND = new Set(['hand.R']);
    const regionOf = (v) => {
      if (mesh.name === 'Pauldron.R') return 'shoulder';
      if (mesh.name === 'Breastplate') return share(v, SHOULDER) > 0.5 ? 'shoulder' : null;
      if (share(v, ELBOW) > 0.3) return 'elbow';
      const f = share(v, FOREARM), h = share(v, HAND);
      if (f > 0.5 && h > 0.1 && h < 0.6) return 'cuff and band';
      if (f > 0.5 && h > 0) return 'cuff and band';
      if (h > 0.5) return 'hand plates';
      if (f > 0.9) return 'vambrace';
      return null;
    };
    const seen = new Set();
    for (let t = 0; t < idx.length; t += 3) {
      const tri = [idx[t], idx[t + 1], idx[t + 2]];
      const reg = regionOf(tri[0]);
      if (!reg || tri.some((v) => regionOf(v) !== reg)) continue;
      for (const [a, b] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]]) {
        const k = `${mesh.name}:${Math.min(a, b)}:${Math.max(a, b)}`; if (seen.has(k)) continue; seen.add(k);
        const rest = Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]);
        if (rest > 1e-4) parts.push({ reg, a, b, rest, pos, J, W });
      }
    }
  }
  return (layers) => {
    const world = worldMatrices(model, localPose(model, layers));
    const pal = skin.joints.map((nd, k) => multiply(world[nd], Array.from(ibm.subarray(k * 16, k * 16 + 16))));
    const out = {};
    const sk = (e, v) => { const q = [e.pos[v * 3], e.pos[v * 3 + 1], e.pos[v * 3 + 2]], s = [0, 0, 0]; for (let c = 0; c < 4; c += 1) { const w = e.W[v * 4 + c]; if (!w) continue; const r = apply(pal[e.J[v * 4 + c]], q); s[0] += r[0] * w; s[1] += r[1] * w; s[2] += r[2] * w; } return s; };
    for (const e of parts) {
      const x = sk(e, e.a), y = sk(e, e.b); const r = Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) / e.rest;
      const o = out[e.reg] ??= { hi: 0, lo: Infinity };
      if (r > o.hi) o.hi = r; if (r < o.lo) o.lo = r;
    }
    return out;
  };
}

for (const path of process.argv.slice(2)) {
  const [model, { clips }] = gameModel(path);
  const measure = regions(model);
  const stat = {};
  let n = 0;
  for (const clip of clips) {
    const c = model.clips.get(clip);
    for (let t = 0; t <= c.duration + 1e-9; t += 1 / 30) {
      n += 1;
      for (const [reg, o] of Object.entries(measure([{ clip, time: Math.min(c.duration, t), weight: 1 }]))) {
        const s = stat[reg] ??= { stretched: 0, folded: 0, hi: 0, hiAt: '', lo: Infinity, loAt: '' };
        if (o.hi > 1.5) s.stretched += 1; if (o.lo < 0.6) s.folded += 1;
        if (o.hi > s.hi) { s.hi = o.hi; s.hiAt = `${clip}@${t.toFixed(2)}`; }
        if (o.lo < s.lo) { s.lo = o.lo; s.loAt = `${clip}@${t.toFixed(2)}`; }
      }
    }
  }
  console.log(`${path.split('/').pop()}: ${n} played frames`);
  for (const [reg, s] of Object.entries(stat)) console.log(`  ${reg.padEnd(14)} stretched >1.5x ${(100 * s.stretched / n).toFixed(0)}% (worst ${s.hi.toFixed(2)}x ${s.hiAt}), folded <0.6x ${(100 * s.folded / n).toFixed(0)}% (worst ${s.lo.toFixed(2)}x ${s.loAt})`);
}
