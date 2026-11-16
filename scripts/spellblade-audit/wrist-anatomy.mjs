// The sword hand against the forearm, anatomically: the hand's rotation relative to the forearm (both in world space),
// as a change from the bind pose, split into twist about the FOREARM's own axis (pronation/supination) and the bend
// that remains (flexion/deviation). Bind: twist 0, bend 0. A human wrist bends ~70-80° and the forearm turns ~80-90°
// either way. REF_CLIP=Idle measures against the grip every cut starts from (Idle f0) instead of the bind pose.
//   [REF_CLIP=Idle] node scripts/spellblade-audit/wrist-anatomy.mjs <model.glb> [clips] [R|L]
import { loadGlb, localPose, worldMatrices } from '../lib/glbPose.mjs';

const [path, list = 'Idle,Walk,Run,Sprint,Guard,Slash_1,Slash_2,Slash_3', side = 'R'] = process.argv.slice(2);
const m = loadGlb(path);
const hand = m.byName.get(`hand.${side}`), fore = m.byName.get(`forearm.${side}`);
const rot = (w) => [[w[0], w[4], w[8]], [w[1], w[5], w[9]], [w[2], w[6], w[10]]].map((r) => { return r; });
const colNorm = (w) => { const c = [0, 1, 2].map((j) => Math.hypot(w[j * 4], w[j * 4 + 1], w[j * 4 + 2])); return [0, 1, 2].map((i) => [0, 1, 2].map((j) => w[j * 4 + i] / c[j])); };
const mul = (a, b) => a.map((r, i) => [0, 1, 2].map((j) => r[0] * b[0][j] + r[1] * b[1][j] + r[2] * b[2][j]));
const T = (a) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => a[j][i]));
const quat = (R) => { const tr = R[0][0] + R[1][1] + R[2][2]; let q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(R[2][1] - R[1][2]) / s, (R[0][2] - R[2][0]) / s, (R[1][0] - R[0][1]) / s, s / 4]; }
  else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) { const s = Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]) * 2; q = [s / 4, (R[0][1] + R[1][0]) / s, (R[0][2] + R[2][0]) / s, (R[2][1] - R[1][2]) / s]; }
  else if (R[1][1] > R[2][2]) { const s = Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]) * 2; q = [(R[0][1] + R[1][0]) / s, s / 4, (R[1][2] + R[2][1]) / s, (R[0][2] - R[2][0]) / s]; }
  else { const s = Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]) * 2; q = [(R[0][2] + R[2][0]) / s, (R[1][2] + R[2][1]) / s, s / 4, (R[1][0] - R[0][1]) / s]; }
  return q; };
const deg = (x) => x * 180 / Math.PI;
// the forearm's axis in its own frame: from its head toward the hand's head, at bind
const bw = worldMatrices(m, localPose(m, []));
const pos = (w, i) => [w[i][12], w[i][13], w[i][14]];
const Fb = colNorm(bw[fore]), Hb = colNorm(bw[hand]);
const dirW = pos(bw, hand).map((v, i) => v - pos(bw, fore)[i]); const L = Math.hypot(...dirW);
const axisF = mul(T(Fb), dirW.map((v) => [v / L])).map((r) => r[0]); // in forearm-local coordinates
const REF = process.env.REF_CLIP; const relBind = REF ? (() => { const w = worldMatrices(m, localPose(m, [{ clip: REF, time: 0, weight: 1 }])); return mul(T(colNorm(w[fore])), colNorm(w[hand])); })() : mul(T(Fb), Hb);
for (const clip of list.split(',')) {
  const c = m.clips.get(clip); if (!c) continue;
  let worst = { twist: 0, bend: 0 };
  const rows = [];
  for (let f = 0; f <= Math.round(c.duration * 30); f += 1) {
    const w = worldMatrices(m, localPose(m, [{ clip, time: Math.min(c.duration, f / 30), weight: 1 }]));
    const rel = mul(T(colNorm(w[fore])), colNorm(w[hand]));
    const d = mul(rel, T(relBind)); // change from bind, in the forearm's frame
    const q = quat(d);
    const proj = q[0] * axisF[0] + q[1] * axisF[1] + q[2] * axisF[2];
    let tw = [axisF[0] * proj, axisF[1] * proj, axisF[2] * proj, q[3]]; const n = Math.hypot(...tw) || 1; tw = tw.map((v) => v / n);
    let twist = deg(2 * Math.atan2(Math.hypot(tw[0], tw[1], tw[2]) * Math.sign(proj || 1), tw[3])); twist = ((twist + 540) % 360) - 180;
    const total = deg(2 * Math.acos(Math.min(1, Math.abs(q[3]))));
    // the bend: the swing left once the twist is taken out
    const sw = [q[3] * -tw[0] + q[0] * tw[3] + q[1] * -tw[2] - q[2] * -tw[1], q[3] * -tw[1] - q[0] * -tw[2] + q[1] * tw[3] + q[2] * -tw[0], q[3] * -tw[2] + q[0] * -tw[1] - q[1] * -tw[0] + q[2] * tw[3], q[3] * tw[3] + q[0] * tw[0] + q[1] * tw[1] + q[2] * tw[2]];
    const bend = deg(2 * Math.acos(Math.min(1, Math.abs(sw[3]))));
    rows.push({ f, twist: Math.round(twist), bend: Math.round(bend), total: Math.round(total) });
    if (Math.abs(twist) > Math.abs(worst.twist)) worst.twist = Math.round(twist), worst.tf = f;
    if (bend > worst.bend) worst.bend = Math.round(bend), worst.bf = f;
  }
  console.log(`${clip.padEnd(12)} forearm twist (pronation) max ${worst.twist}° @f${worst.tf}, wrist bend max ${worst.bend}° @f${worst.bf}   bend by frame: ${rows.map((r) => r.bend).join(' ')}`);
}
