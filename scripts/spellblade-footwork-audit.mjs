// Footwork in the shipped Spellblade clips: does a clip step (feet travel), advance (pelvis/root travel), or plant?
// The server owns world movement, so authored root/pelvis travel must be weight transfer, not displacement.
//   node scripts/spellblade-footwork-audit.mjs [clip-regex] [--model other.glb]
import { loadGlb, localPose, worldMatrices, apply } from './lib/glbPose.mjs';
const dir = new URL('../client/assets/characters/spellblade/', import.meta.url).pathname;
const argv = process.argv.slice(2);
const mi = argv.indexOf('--model');
const model = loadGlb(mi >= 0 ? argv.splice(mi, 2)[1] : `${dir}spellblade.glb`);
const re = new RegExp(argv[0] ?? '^(Slash|Mordhau|Idle_Mordhau|Guard|Slash_Recovery|Slash_Whiff|Rise_1|Brake|Turn_Pivot|Sunder|Block_Impact|Guard_Parry|Sprint_To_Guard)');
const id = (n) => model.byName.get(n);
const [ROOT, PELVIS, FL, FR] = ['root', 'pelvis', 'foot.L', 'foot.R'].map(id);
const hasTrack = (clip, node, path) => clip.channels.some((c) => c.node === node && c.path === path);
const fmt = (v) => v.toFixed(2).padStart(5);
// a skate: a foot within 4 cm of its Idle height moving faster than 1 m/s (a step lifts; a shuffle or snap does not)
const idleFeet = (() => { const w = worldMatrices(model, localPose(model, [{ clip: 'Idle', time: 0, weight: 1 }])); return [apply(w[FL], [0, 0, 0])[1], apply(w[FR], [0, 0, 0])[1]]; })();
console.log('clip                                  dur   root.T pelvis.T  pelvisΔxz  pelvisΔy(min)  footL-xz footR-xz  end≠start  skate-frames  peak-skate m/s');
for (const [name, clip] of model.clips) {
  if (!re.test(name)) continue;
  const n = Math.max(2, Math.round(clip.duration * 30));
  const P = [], L = [], R = [];
  for (let f = 0; f <= n; f += 1) {
    const w = worldMatrices(model, localPose(model, [{ clip: name, time: (f / n) * clip.duration, weight: 1 }]));
    P.push(apply(w[PELVIS], [0, 0, 0])); L.push(apply(w[FL], [0, 0, 0])); R.push(apply(w[FR], [0, 0, 0]));
  }
  let skate = 0, peak = 0;
  for (let f = 1; f <= n; f += 1) for (const [k, F] of [[0, L], [1, R]]) {
    const v = Math.hypot(F[f][0] - F[f - 1][0], F[f][2] - F[f - 1][2]) / (clip.duration / n);
    if (F[f][1] < idleFeet[k] + 0.04 && v > 1) { skate += 1; peak = Math.max(peak, v); }
  }
  const span = (A) => { let m = 0; for (const a of A) for (const b of A) m = Math.max(m, Math.hypot(a[0] - b[0], a[2] - b[2])); return m; };
  const dy = Math.min(...P.map((p) => p[1])) - P[0][1];
  const endDiff = Math.hypot(...P[n].map((v, i) => v - P[0][i])) + Math.hypot(...L[n].map((v, i) => v - L[0][i])) + Math.hypot(...R[n].map((v, i) => v - R[0][i]));
  console.log(`${name.padEnd(36)} ${clip.duration.toFixed(2)}  ${hasTrack(clip, ROOT, 'translation') ? '  yes ' : '   -  '}  ${hasTrack(clip, PELVIS, 'translation') ? ' yes ' : '  -  '}   ${fmt(span(P))}      ${fmt(dy)}        ${fmt(span(L))}    ${fmt(span(R))}     ${fmt(endDiff)}      ${String(skate).padStart(3)}         ${fmt(peak)}`);
}
