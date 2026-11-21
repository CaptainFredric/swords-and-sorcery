// A clip's skeleton (and sword) as stick figures, frame by frame, front and side: a quick look at a retarget or any
// Spellblade clip without a browser. Writes a JSON of joint positions; tools/animation/clip-sheet.py draws it.
//
//   node tools/animation/clip-sheet.mjs --clip Slash_1 [--motion a.motion.glb] [--out sheet.json] [--frames 0,4,8]

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadGlb, localPose, worldMatrices, apply, overlayMotion } from '../../scripts/lib/glbPose.mjs';

const args = process.argv.slice(2);
const option = (name, fallback = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const repo = fileURLToPath(new URL('../../', import.meta.url));
const model = loadGlb(option('--model', `${repo}client/assets/characters/spellblade/spellblade.glb`));
if (option('--motion')) overlayMotion(model, option('--motion'));
const clip = model.clips.get(option('--clip', 'Slash_1'));
const FPS = 30;
const frames = option('--frames') ? option('--frames').split(',').map(Number) : Array.from({ length: Math.round(clip.duration * FPS) + 1 }, (_, i) => i);
const BONES = [['pelvis', 'spine'], ['spine', 'chest'], ['chest', 'neck'], ['neck', 'head'], ['head', 'crest_01'],
  ['chest', 'clavicle.R'], ['clavicle.R', 'upper_arm.R'], ['upper_arm.R', 'forearm.R'], ['forearm.R', 'hand.R'],
  ['chest', 'clavicle.L'], ['clavicle.L', 'upper_arm.L'], ['upper_arm.L', 'forearm.L'], ['forearm.L', 'hand.L'],
  ['pelvis', 'thigh.R'], ['thigh.R', 'shin.R'], ['shin.R', 'foot.R'], ['pelvis', 'thigh.L'], ['thigh.L', 'shin.L'], ['shin.L', 'foot.L']];
// the sword: from the hand to its point, in the hand's own space (tools/assets/build-spellblade-motion.mjs)
const TIP = [0.131, 1.3383, -0.1661];
const out = { clip: clip.name, frames: [] };
for (const f of frames) {
  const W = worldMatrices(model, localPose(model, [{ clip: clip.name, time: Math.min(clip.duration, f / FPS), weight: 1 }]));
  const p = (n) => { const m = W[model.byName.get(n)]; return [m[12], m[13], m[14]]; };
  const hand = W[model.byName.get('hand.R')];
  out.frames.push({ f, bones: BONES.map(([a, b]) => [p(a), p(b)]), sword: [apply(hand, [0, 0, 0]), apply(hand, TIP)] });
}
writeFileSync(option('--out', `${repo}artifacts/clip-sheet.json`), JSON.stringify(out));
console.log(`${clip.name}: ${frames.length} frames`);
