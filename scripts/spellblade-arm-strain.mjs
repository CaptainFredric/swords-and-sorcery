// How far a Spellblade GLB's own clips tear the sword arm's surface, with no game layers on top: the skinned edges of
// the arm's triangles (Gauntlet.R, Breastplate and Pauldron.R faces weighted mostly to the right arm) against their
// bind length, frame by frame through each clip, and which bones the worst-torn vertices are weighted to.
// (The game's own composition is measured in Chrome by scripts/spellblade-pose-gallery-browser.mjs: if the clip alone
// stays whole here and tears there, the tear is the game's.)
//   node scripts/spellblade-arm-strain.mjs [model.glb] [--clips Idle,Slash_1,...] [--side R|L] [--meshes Arm.R] [--json out.json]
//   (first person: spellblade-fp.glb --meshes Arm.R)
import { writeFileSync } from 'node:fs';
import { loadGlb, localPose, worldMatrices, multiply, apply } from './lib/glbPose.mjs';
import { readAccessor } from './lib/glbSkin.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const path = args.find((a) => a.endsWith('.glb')) ?? new URL('../client/assets/characters/spellblade/spellblade.glb', import.meta.url).pathname;
const side = option('--side', 'R');
const meshNames = option('--meshes', `Gauntlet.${side},Breastplate,Pauldron.${side}`).split(',');
const model = loadGlb(path);
const clips = option('--clips', 'Idle,Guard,Slash_1,Slash_1_to_2,Slash_2,Slash_2_to_3,Slash_3,Slash_1_to_3,Slash_2_to_1').split(',');
const skin = model.gltf.skins[0];
const jointName = skin.joints.map((n) => model.gltf.nodes[n].name);
const ARM = new Set([`clavicle.${side}`, `upper_arm.${side}`, `forearm.${side}`, `hand.${side}`, `elbow.${side}`, `pauldron.${side}`, `socket_sword`]
  .concat(jointName.filter((n) => n.endsWith(`.${side}`) && /finger|thumb/.test(n))));
const ibm = readAccessor(model, skin.inverseBindMatrices).data;

// the arm's triangles and their unique edges, in bind space
const parts = [];
for (const node of model.gltf.nodes) {
  if (node.mesh == null) continue;
  const mesh = model.gltf.meshes[node.mesh];
  if (!meshNames.includes(mesh.name)) continue;
  for (const prim of mesh.primitives) {
    const pos = readAccessor(model, prim.attributes.POSITION).data, joints = readAccessor(model, prim.attributes.JOINTS_0).data;
    const weights = readAccessor(model, prim.attributes.WEIGHTS_0).data, index = readAccessor(model, prim.indices).data;
    const onArm = (v) => { let w = 0; for (let c = 0; c < 4; c += 1) if (ARM.has(jointName[joints[v * 4 + c]])) w += weights[v * 4 + c]; return w > 0.5; };
    const seen = new Set(), edges = [];
    for (let t = 0; t < index.length; t += 3) {
      const tri = [index[t], index[t + 1], index[t + 2]];
      if (!tri.every(onArm)) continue;
      for (const [a, b] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]]) {
        const k = a < b ? `${a}:${b}` : `${b}:${a}`; if (seen.has(k)) continue; seen.add(k);
        const rest = Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]);
        if (rest > 1e-5) edges.push([a, b, rest]);
      }
    }
    parts.push({ name: mesh.name, pos, joints, weights, edges });
  }
}
const influence = (part, v) => {
  const out = [];
  for (let c = 0; c < 4; c += 1) { const w = part.weights[v * 4 + c]; if (w > 0.01) out.push(`${jointName[part.joints[v * 4 + c]]} ${w.toFixed(2)}`); }
  return out.join(' + ');
};

function strain(layers) {
  const world = worldMatrices(model, localPose(model, layers));
  const palette = skin.joints.map((node, k) => multiply(world[node], Array.from(ibm.subarray(k * 16, k * 16 + 16))));
  const ratios = [];
  for (const part of parts) {
    const cache = new Map();
    const at = (v) => {
      if (cache.has(v)) return cache.get(v);
      const p = [part.pos[v * 3], part.pos[v * 3 + 1], part.pos[v * 3 + 2]], s = [0, 0, 0];
      for (let c = 0; c < 4; c += 1) { const w = part.weights[v * 4 + c]; if (!w) continue; const q = apply(palette[part.joints[v * 4 + c]], p); s[0] += q[0] * w; s[1] += q[1] * w; s[2] += q[2] * w; }
      cache.set(v, s); return s;
    };
    for (const [a, b, rest] of part.edges) { const p = at(a), q = at(b); ratios.push({ r: Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) / rest, part, a, b }); }
  }
  ratios.sort((x, y) => x.r - y.r);
  const q = (p) => +ratios[Math.min(ratios.length - 1, Math.floor(p * ratios.length))].r.toFixed(3);
  const bad = ratios.filter((x) => x.r < 0.7 || x.r > 1.4);
  return { edges: ratios.length, p01: q(0.01), p99: q(0.99), min: +ratios[0].r.toFixed(3), max: +ratios.at(-1).r.toFixed(3), bad: bad.length,
    worst: [ratios.at(-1), ratios[0]].map((x) => ({ ratio: +x.r.toFixed(2), mesh: x.part.name, a: influence(x.part, x.a), b: influence(x.part, x.b) })) };
}

const report = { model: path, side, armEdges: parts.reduce((n, p) => n + p.edges.length, 0), bind: strain([]), clips: {} };
console.log(`${path}\narm edges ${report.armEdges}; bind ${JSON.stringify({ p99: report.bind.p99, max: report.bind.max, bad: report.bind.bad })}`);
for (const clip of clips) {
  const c = model.clips.get(clip);
  if (!c) { console.log(`  ${clip}: not in the model`); continue; }
  const frames = [];
  for (let f = 0; f <= Math.round(c.duration * 30); f += 1) frames.push({ f, t: +(f / 30).toFixed(3), ...strain([{ clip, time: Math.min(c.duration, f / 30), weight: 1 }]) });
  const worst = frames.reduce((w, x) => (x.bad > w.bad ? x : w));
  report.clips[clip] = { worstFrame: worst, frames: frames.map(({ worst: _, ...x }) => x) };
  console.log(`  ${clip.padEnd(14)} worst f${worst.f} (${worst.t}s): p99 ${worst.p99} max ${worst.max} min ${worst.min} bad ${worst.bad}/${worst.edges}`
    + `\n      stretched ${worst.worst[0].ratio}x  ${worst.worst[0].mesh}: [${worst.worst[0].a}] — [${worst.worst[0].b}]`
    + `\n      squashed  ${worst.worst[1].ratio}x  ${worst.worst[1].mesh}: [${worst.worst[1].a}] — [${worst.worst[1].b}]`);
}
const json = option('--json', null);
if (json) writeFileSync(json, JSON.stringify(report, null, 1));
