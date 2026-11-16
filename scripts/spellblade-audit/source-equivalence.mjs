// Does a native Blender export of a source reproduce a delivered GLB's animation? Byte identity isn't asked: the two
// files may differ in joint order, in their global frame (Blender's Z-up against glTF's Y-up, an armature object's
// transform) and in sampling. So: every joint is matched by name; one rigid transform (and scale) is fitted between the
// two skeletons' bind poses; then in every frame of every clip the two skeletons' joint positions are compared through
// that one transform. Equivalent animation: every joint within 1 mm of its counterpart throughout.
//   node scripts/spellblade-audit/source-equivalence.mjs <delivered.glb> <native-export.glb> [--tolerance 0.001]
import { loadGlb, localPose, worldMatrices } from '../lib/glbPose.mjs';

const args = process.argv.slice(2);
const [aPath, bPath] = args.filter((x) => x.endsWith('.glb'));
const tol = Number(args.includes('--tolerance') ? args[args.indexOf('--tolerance') + 1] : 0.001);
const A = loadGlb(aPath), B = loadGlb(bPath);
const jointNames = (m) => m.gltf.skins[0].joints.map((n) => m.gltf.nodes[n].name);
const shared = jointNames(A).filter((n) => B.byName.has(n));
const pos = (m, w) => shared.map((n) => { const k = w[m.byName.get(n)]; return [k[12], k[13], k[14]]; });

// Kabsch with scale: B ≈ s R A + t, from the bind poses
function fit(P, Q) {
  const n = P.length, cp = [0, 1, 2].map((i) => P.reduce((s, p) => s + p[i], 0) / n), cq = [0, 1, 2].map((i) => Q.reduce((s, q) => s + q[i], 0) / n);
  const H = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let vp = 0;
  for (let k = 0; k < n; k += 1) { const p = P[k].map((v, i) => v - cp[i]), q = Q[k].map((v, i) => v - cq[i]); vp += p[0] ** 2 + p[1] ** 2 + p[2] ** 2; for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) H[i][j] += p[i] * q[j]; }
  // SVD-free: polar decomposition of H by iteration (R = H (HᵀH)^-1/2), good for well-conditioned skeletons
  let R = H.map((r) => r.slice());
  for (let it = 0; it < 60; it += 1) {
    const det = R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1]) - R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0]) + R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0]);
    const inv = [[(R[1][1] * R[2][2] - R[1][2] * R[2][1]) / det, (R[0][2] * R[2][1] - R[0][1] * R[2][2]) / det, (R[0][1] * R[1][2] - R[0][2] * R[1][1]) / det],
      [(R[1][2] * R[2][0] - R[1][0] * R[2][2]) / det, (R[0][0] * R[2][2] - R[0][2] * R[2][0]) / det, (R[0][2] * R[1][0] - R[0][0] * R[1][2]) / det],
      [(R[1][0] * R[2][1] - R[1][1] * R[2][0]) / det, (R[0][1] * R[2][0] - R[0][0] * R[2][1]) / det, (R[0][0] * R[1][1] - R[0][1] * R[1][0]) / det]];
    R = R.map((r, i) => r.map((v, j) => 0.5 * (v + inv[j][i])));
  }
  // H = Σ p qᵀ, the rotation taking P to Q is Rᵀ of the polar factor
  const Rt = [0, 1, 2].map((i) => [0, 1, 2].map((j) => R[j][i]));
  let num = 0;
  for (let k = 0; k < n; k += 1) { const p = P[k].map((v, i) => v - cp[i]), q = Q[k].map((v, i) => v - cq[i]); const rp = Rt.map((r) => r[0] * p[0] + r[1] * p[1] + r[2] * p[2]); num += rp[0] * q[0] + rp[1] * q[1] + rp[2] * q[2]; }
  const s = num / vp;
  return (p) => { const d = p.map((v, i) => v - cp[i]); const r = Rt.map((row) => row[0] * d[0] + row[1] * d[1] + row[2] * d[2]); return r.map((v, i) => s * v + cq[i]); };
}

const map = fit(pos(A, worldMatrices(A, localPose(A, []))), pos(B, worldMatrices(B, localPose(B, []))));
const bindErr = (() => { const a = pos(A, worldMatrices(A, localPose(A, []))), b = pos(B, worldMatrices(B, localPose(B, []))); return Math.max(...a.map((p, k) => Math.hypot(...map(p).map((v, i) => v - b[k][i])))); })();
console.log(`${shared.length} shared joints; bind poses agree within ${(bindErr * 1000).toFixed(2)} mm after one rigid fit`);
const rows = [];
const missing = [...A.clips.keys()].filter((c) => !B.clips.has(c));
for (const [clip, c] of A.clips) {
  if (!B.clips.has(clip)) continue;
  let worst = 0, at = 0, joint = '';
  const d = Math.min(c.duration, B.clips.get(clip).duration);
  for (let t = 0; t <= d + 1e-9; t += 1 / 30) {
    const a = pos(A, worldMatrices(A, localPose(A, [{ clip, time: Math.min(d, t), weight: 1 }])));
    const b = pos(B, worldMatrices(B, localPose(B, [{ clip, time: Math.min(d, t), weight: 1 }])));
    a.forEach((p, k) => { const e = Math.hypot(...map(p).map((v, i) => v - b[k][i])); if (e > worst) { worst = e; at = t; joint = shared[k]; } });
  }
  rows.push({ clip, worst, at, joint, durA: c.duration, durB: B.clips.get(clip).duration });
}
rows.sort((x, y) => y.worst - x.worst);
const within = rows.filter((r) => r.worst <= tol).length;
console.log(`clips compared ${rows.length}; within ${tol * 1000} mm: ${within}; missing from the export: ${missing.length ? missing.join(' ') : 'none'}`);
for (const r of rows.slice(0, 12)) console.log(`  ${r.clip.padEnd(40)} worst ${(r.worst * 1000).toFixed(1)} mm (${r.joint} @ ${r.at.toFixed(3)} s), duration ${r.durA.toFixed(3)} / ${r.durB.toFixed(3)} s`);
const med = rows.map((r) => r.worst).sort((x, y) => x - y)[Math.floor(rows.length / 2)];
console.log(`median clip's worst joint error ${(med * 1000).toFixed(2)} mm`);
