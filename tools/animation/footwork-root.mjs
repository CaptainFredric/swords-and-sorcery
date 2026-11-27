// Footwork in the world: a clip's feet with its root motion added back (the knight moved by the simulation as the clip
// says), the acceptance rules of scripts/spellblade-candidate-acceptance.mjs:
//   a planted foot (its sole within 4 cm of the floor) travels at most 2 cm; a foot that moves is lifted at least 5 cm;
//   the knee's angle changes smoothly (at most 20 degrees per frame squared).
//
//   node tools/animation/footwork-root.mjs --clip Slash_1 [--motion a.motion.glb]   (its .json carries the root motion)

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadGlb, localPose, worldMatrices, overlayMotion } from '../../scripts/lib/glbPose.mjs';
import { skinnedHeights, skinnedMeshes } from '../../scripts/lib/glbSkin.mjs';

const args = process.argv.slice(2);
const option = (name, fallback = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const repo = fileURLToPath(new URL('../../', import.meta.url));
const model = loadGlb(option('--model', `${repo}client/assets/characters/spellblade/spellblade.glb`));
const motion = option('--motion');
let root = null;
if (motion) {
  overlayMotion(model, motion);
  const meta = motion.replace(/\.glb$/, '.json');
  if (existsSync(meta)) root = JSON.parse(readFileSync(meta, 'utf8')).rootMotion;
}
const clip = model.clips.get(option('--clip', 'Slash_1'));
const FPS = 30;
const meshes = skinnedMeshes(model);
const rootAt = (t) => {
  if (!root) return [0, 0];
  let i = 0;
  while (i < root.length - 2 && t > root[i + 1].t) i += 1;
  const a = root[i], b = root[Math.min(root.length - 1, i + 1)];
  const w = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;
  return [a.x + (b.x - a.x) * w, a.z + (b.z - a.z) * w];
};
const n = Math.round(clip.duration * FPS);
const rows = [];
for (let f = 0; f <= n; f += 1) {
  const t = Math.min(clip.duration, f / FPS);
  const pose = localPose(model, [{ clip: clip.name, time: t, weight: 1 }]);
  const W = worldMatrices(model, pose);
  const [rx, rz] = rootAt(t);
  const h = skinnedHeights(model, meshes, pose, ['Boot.L', 'Boot.R']);
  const at = (name) => { const m = W[model.byName.get(name)]; return [m[12] + rx, m[13], m[14] + rz]; };
  const knee = (s) => {
    const a = at(`thigh.${s}`), b = at(`shin.${s}`), c = at(`foot.${s}`);
    const u = a.map((v, i) => v - b[i]), v = c.map((x, i) => x - b[i]);
    return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / Math.hypot(...u) / Math.hypot(...v)))) * 180 / Math.PI;
  };
  rows.push({ f, L: { p: at('foot.L'), sole: h['Boot.L'][0], knee: knee('L') }, R: { p: at('foot.R'), sole: h['Boot.R'][0], knee: knee('R') } });
}
const floor = Math.min(...rows.flatMap((r) => [r.L.sole, r.R.sole]));
for (const s of ['L', 'R']) {
  let glide = 0, travel = 0, lift = 0, pop = 0, creep = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const a = rows[i - 1][s], b = rows[i][s];
    const d = Math.hypot(b.p[0] - a.p[0], b.p[2] - a.p[2]);
    travel += d;
    if (a.sole - floor < 0.04 && b.sole - floor < 0.04) { glide += d; if (d * FPS < 0.3) creep += d; }
    lift = Math.max(lift, b.sole - floor);
    if (i > 1) pop = Math.max(pop, Math.abs(rows[i][s].knee - 2 * rows[i - 1][s].knee + rows[i - 2][s].knee));
  }
  console.log(`${clip.name}${motion ? ' (motion)' : ''} foot.${s}: travels ${(travel * 100).toFixed(1)} cm, glides on the floor ${(glide * 100).toFixed(1)} cm (of it a planted foot creeping ${(creep * 100).toFixed(1)}, the rest a step skimming), lifted ${(lift * 100).toFixed(1)} cm, knee ${pop.toFixed(1)} deg/frame^2`);
}
if (root) console.log(`root motion: ${Math.hypot(root.at(-1).x, root.at(-1).z).toFixed(2)} m`);
