// The sword hand's turn from bind to a grip pose (in the hand's own frame), and how much of it is about the sword's
// grip axis. A turn about the grip leaves a fist round the grip still round it, so a gauntlet fist modelled at bind
// could be re-posed into the grip pose without moving the sword in it.
//   node scripts/spellblade-audit/grip-axis.mjs <model.glb> [clip@time ...]
import { loadGlb, localPose, worldMatrices, apply } from '../lib/glbPose.mjs';
import { swordPoint } from '../lib/glbSkin.mjs';

const [path, ...poses] = process.argv.slice(2);
const m = loadGlb(path);
const H = m.byName.get('hand.R'), F = m.byName.get('forearm.R');
const cols = (w, i) => { const c = [0, 1, 2].map((j) => { const v = [w[i][j * 4], w[i][j * 4 + 1], w[i][j * 4 + 2]]; const n = Math.hypot(...v); return v.map((x) => x / n); }); return c; };
const toLocal = (c, v) => c.map((a) => a[0] * v[0] + a[1] * v[1] + a[2] * v[2]);
const relRot = (w) => { const f = cols(w, F), h = cols(w, H); return h.map((hc) => toLocal(f, hc)); }; // hand axes in forearm frame (columns)
const mul3 = (A, B) => [0, 1, 2].map((j) => [0, 1, 2].map((i) => A[0][i] * B[j][0] + A[1][i] * B[j][1] + A[2][i] * B[j][2])); // columns: A*B
const T = (A) => [0, 1, 2].map((i) => [A[0][i], A[1][i], A[2][i]]);
function axisAngle(R) { // R as columns
  const r = (i, j) => R[j][i];
  const angle = Math.acos(Math.max(-1, Math.min(1, (r(0, 0) + r(1, 1) + r(2, 2) - 1) / 2)));
  const ax = [r(2, 1) - r(1, 2), r(0, 2) - r(2, 0), r(1, 0) - r(0, 1)]; const n = Math.hypot(...ax) || 1;
  return { angle: angle * 180 / Math.PI, axis: ax.map((x) => x / n) };
}
const bindW = worldMatrices(m, localPose(m, []));
const bindRel = relRot(bindW);
// the grip axis in the hand's own frame: the blade's direction from the sword socket
const sp = swordPoint(m);
const sw = cols(bindW, sp.joint), hw = cols(bindW, H);
const tipDir = (() => { const n = Math.hypot(...sp.tip); const v = sp.tip.map((x) => x / n); const world = [0, 1, 2].map((i) => sw[0][i] * v[0] + sw[1][i] * v[1] + sw[2][i] * v[2]); return toLocal(hw, world); })();
for (const p of poses.length ? poses : ['Idle@0', 'Slash_1@0.4', 'Slash_2@0.3', 'Slash_3@0.38', 'Guard@1.0', 'Run@0.3', 'Sprint@0.25']) {
  const [clip, t] = p.split('@');
  const w = worldMatrices(m, localPose(m, [{ clip, time: Number(t), weight: 1 }]));
  const delta = mul3(T(bindRel), relRot(w)); // the hand's turn from bind, in the hand's bind frame
  const { angle, axis } = axisAngle(delta);
  const along = Math.abs(axis[0] * tipDir[0] + axis[1] * tipDir[1] + axis[2] * tipDir[2]);
  console.log(`${p.padEnd(14)} turn ${angle.toFixed(0)}°, axis·grip ${along.toFixed(2)} (about the grip ${(angle * along).toFixed(0)}°, off it ${(angle * Math.sqrt(1 - along * along)).toFixed(0)}°)`);
}
