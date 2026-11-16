// What a candidate Spellblade GLB changes against the shipped one, measured, not read from a manifest:
// every clip (sword point, grip, both hands, both feet, pelvis, head: the largest gap at any frame, and when), new and
// missing clips, and each mesh's vertex data.
//   node scripts/spellblade-candidate-diff.mjs <candidate.glb> [--base other.glb] [--fp] [--json out.json]
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadGlb, localPose, worldMatrices, apply } from './lib/glbPose.mjs';
import { readAccessor, swordPoint } from './lib/glbSkin.mjs';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
const json = opt('--json');
const fp = args.includes('--fp');
const dir = new URL('../client/assets/characters/spellblade/', import.meta.url).pathname;
const basePath = opt('--base') ?? `${dir}${fp ? 'spellblade-fp.glb' : 'spellblade.glb'}`;
const candPath = args.find((a) => a.endsWith('.glb'));
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const A = loadGlb(basePath), B = loadGlb(candPath);
const pointsOf = (m) => {
  const sp = swordPoint(m);
  const named = (fp ? ['hand.R', 'hand.L', 'forearm.R', 'forearm.L'] : ['hand.R', 'hand.L', 'foot.L', 'foot.R', 'pelvis', 'head']).filter((n) => m.byName.has(n));
  return { sp, named };
};
const PA = pointsOf(A), PB = pointsOf(B);
const sample = (m, P, clip, t) => {
  const w = worldMatrices(m, localPose(m, [{ clip, time: t, weight: 1 }]));
  const out = { tip: apply(w[P.sp.joint], P.sp.tip), grip: apply(w[P.sp.joint], [0, 0, 0]) };
  for (const n of P.named) out[n] = apply(w[m.byName.get(n)], [0, 0, 0]);
  return out;
};
const clips = [];
for (const [name, ca] of A.clips) {
  const cb = B.clips.get(name);
  if (!cb) { clips.push({ name, status: 'missing' }); continue; }
  const dur = Math.max(ca.duration, cb.duration);
  let worst = { gap: 0 }; const per = {};
  for (let t = 0; t <= dur + 1e-9; t += 1 / 30) {
    const a = sample(A, PA, name, Math.min(t, ca.duration)), b = sample(B, PB, name, Math.min(t, cb.duration));
    for (const k of Object.keys(a)) { if (!b[k]) continue; const g = Math.hypot(...a[k].map((v, i) => v - b[k][i])); per[k] = Math.max(per[k] ?? 0, g); if (g > worst.gap) worst = { gap: g, part: k, t }; }
  }
  clips.push({ name, status: worst.gap > 0.005 || Math.abs(ca.duration - cb.duration) > 1e-3 ? 'changed' : 'same', duration: [+ca.duration.toFixed(3), +cb.duration.toFixed(3)], worst: +worst.gap.toFixed(3), part: worst.part, at: worst.t === undefined ? null : +worst.t.toFixed(3), per: Object.fromEntries(Object.entries(per).map(([k, v]) => [k, +v.toFixed(3)])) });
}
for (const [name, cb] of B.clips) if (!A.clips.has(name)) clips.push({ name, status: 'new', duration: [null, +cb.duration.toFixed(3)] });
const meshHash = (m) => Object.fromEntries((m.gltf.meshes ?? []).map((mesh) => [mesh.name, createHash('sha256').update(mesh.primitives.map((p) => Buffer.from(readAccessor(m, p.attributes.POSITION).data.buffer).toString('base64')).join('|')).digest('hex').slice(0, 12)]));
const ma = meshHash(A), mb = meshHash(B);
const meshes = [...new Set([...Object.keys(ma), ...Object.keys(mb)])].map((n) => ({ name: n, status: !ma[n] ? 'new' : !mb[n] ? 'missing' : ma[n] === mb[n] ? 'same' : 'changed' }));
const report = { base: { path: basePath, sha256: sha(basePath) }, candidate: { path: candPath, sha256: sha(candPath) }, clips, meshes };
console.log(`base ${report.base.sha256.slice(0, 12)}  candidate ${report.candidate.sha256.slice(0, 12)}`);
const changed = clips.filter((c) => c.status !== 'same');
console.log(`clips: ${clips.filter((c) => c.status === 'same').length} unchanged, ${changed.length} changed/new/missing`);
for (const c of changed.sort((a, b) => (b.worst ?? 9) - (a.worst ?? 9))) console.log(`  ${c.status.padEnd(7)} ${c.name.padEnd(42)} ${c.duration ? c.duration.join(' -> ') + ' s' : ''} ${c.worst !== undefined ? `max ${c.worst} m (${c.part} @ ${c.at}s)` : ''}`);
console.log('meshes:', meshes.filter((m) => m.status !== 'same').map((m) => `${m.name} ${m.status}`).join(', ') || 'all unchanged');
if (json) writeFileSync(json, JSON.stringify(report, null, 1));
