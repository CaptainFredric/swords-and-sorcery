// Where should the sword hand pivot? An experiment on the GLB, keeping the sword exactly where every clip frame puts it
// (the socket's world transform, so the server's blade and every contact frame are untouched):
//   A. the current pivot (hand.R on the grip, ~15 cm past the wrist): the elbow alone is moved, on the circle the two
//      arm bones allow, to the place that bends the wrist least;
//   B. the pivot moved to the anatomical wrist (still the 66 joints: hand.R relocated, the forearm shortened to it,
//      socket_sword's offset lengthened to match): the sword fixes the hand, so the wrist point follows from it; the
//      elbow is placed on the circle that reaches that point, again bending the wrist least.
// For each played frame: the wrist bend left, the elbow's move from where the clip has it, and whether the arm reaches.
//   node scripts/spellblade-audit/wrist-pivot-experiment.mjs [model.glb] [--wrist 0.62] [--clips a,b,c]
import { loadGlb, localPose, worldMatrices } from '../lib/glbPose.mjs';
import { playedClips } from './played-clips.mjs';

const args = process.argv.slice(2);
const option = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const path = args.find((a) => a.endsWith('.glb')) ?? new URL('../../client/assets/characters/spellblade/spellblade.glb', import.meta.url).pathname;
const m = loadGlb(path);
const WRIST = Number(option('--wrist', '0.62')); // the anatomical wrist along the forearm (elbow 0, hand.R 1): the cuff's middle
const id = (n) => m.byName.get(n);
const UA = id('upper_arm.R'), FA = id('forearm.R'), HA = id('hand.R');
const P = (w, i) => [w[i][12], w[i][13], w[i][14]];
const sub = (a, b) => a.map((v, i) => v - b[i]), add = (a, b) => a.map((v, i) => v + b[i]), mul = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.sqrt(dot(a, a)), unit = (a) => mul(a, 1 / len(a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const R = (w, i) => [0, 1, 2].map((j) => unit([w[i][j * 4], w[i][j * 4 + 1], w[i][j * 4 + 2]]));
const toLocal = (c, v) => c.map((x) => dot(x, v)), toWorld = (c, v) => add(add(mul(c[0], v[0]), mul(c[1], v[1])), mul(c[2], v[2]));
const deg = (x) => x * 180 / Math.PI, ang = (a, b) => deg(Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))));
const bw = worldMatrices(m, localPose(m, []));
const a = len(sub(P(bw, FA), P(bw, UA))), L = len(sub(P(bw, HA), P(bw, FA)));
const wristBind = add(P(bw, FA), mul(sub(P(bw, HA), P(bw, FA)), WRIST));
const g = toLocal(R(bw, HA), unit(sub(P(bw, HA), P(bw, FA))));       // the forearm's direction in the hand's frame, at bind
const d = toLocal(R(bw, HA), sub(wristBind, P(bw, HA)));             // the wrist from the grip pivot, in the hand's frame
const Lb = len(sub(wristBind, P(bw, FA)));                           // the shortened forearm (elbow to wrist)

function bestElbow(S, target, forearm, f0) {
  const D = len(sub(target, S));
  if (D > a + forearm - 1e-6 || D < Math.abs(a - forearm) + 1e-6) return null; // out of reach
  const u = unit(sub(target, S)), x = (a * a - forearm * forearm + D * D) / (2 * D), r = Math.sqrt(Math.max(0, a * a - x * x));
  const e1 = unit(Math.abs(u[1]) < 0.9 ? cross(u, [0, 1, 0]) : cross(u, [1, 0, 0])), e2 = cross(u, e1);
  let best = null;
  for (let k = 0; k < 180; k += 1) {
    const phi = k * Math.PI / 90;
    const E = add(add(S, mul(u, x)), add(mul(e1, r * Math.cos(phi)), mul(e2, r * Math.sin(phi))));
    const bend = ang(sub(target, E), f0);
    if (!best || bend < best.bend) best = { bend, E };
  }
  return best;
}

const clips = option('--clips', null)?.split(',') ?? playedClips(m).played;
const pct = (arr, p) => { const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const all = { clip: [], A: [], B: [], moveA: [], moveB: [], unreachB: 0, n: 0 };
const rows = [];
for (const clip of clips) {
  const c = m.clips.get(clip); if (!c) continue;
  const r = { clip, clipBend: [], A: [], B: [], moveA: [], moveB: [], unreachB: 0 };
  for (let t = 0; t <= c.duration + 1e-9; t += 1 / 30) {
    const w = worldMatrices(m, localPose(m, [{ clip, time: Math.min(c.duration, t), weight: 1 }]));
    const S = P(w, UA), E0 = P(w, FA), H = P(w, HA), Rh = R(w, HA), f0 = toWorld(Rh, g);
    r.clipBend.push(ang(sub(H, E0), f0));
    const A = bestElbow(S, H, L, f0);
    if (A) { r.A.push(A.bend); r.moveA.push(len(sub(A.E, E0))); }
    const W = add(H, toWorld(Rh, d)); // the wrist, carried by the hand (so by the sword) exactly
    const B = bestElbow(S, W, Lb, f0);
    if (B) { r.B.push(B.bend); r.moveB.push(len(sub(B.E, E0))); } else r.unreachB += 1;
  }
  rows.push(r);
  all.clip.push(...r.clipBend); all.A.push(...r.A); all.B.push(...r.B); all.moveA.push(...r.moveA); all.moveB.push(...r.moveB); all.unreachB += r.unreachB; all.n += r.clipBend.length;
}
const f = (x) => (x === undefined ? '-' : Math.round(x));
console.log(`forearm ${L.toFixed(3)} m, wrist at ${WRIST} of it (${(L * (1 - WRIST) * 100).toFixed(0)} cm back from hand.R): shortened forearm ${Lb.toFixed(3)} m; upper arm ${a.toFixed(3)} m`);
console.log('clip                                   wrist bend: clip p50/max | A (current pivot, elbow moved) p50/max, elbow move max | B (pivot at the wrist) p50/max, elbow move max, unreachable');
for (const r of rows) console.log(`${r.clip.padEnd(38)} ${f(pct(r.clipBend, 0.5))}/${f(Math.max(...r.clipBend))} | A ${f(pct(r.A, 0.5))}/${f(Math.max(...r.A))}, ${f(Math.max(0, ...r.moveA) * 100)} cm | B ${r.B.length ? `${f(pct(r.B, 0.5))}/${f(Math.max(...r.B))}, ${f(Math.max(0, ...r.moveB) * 100)} cm` : '-'}, ${r.unreachB}/${r.clipBend.length}`);
console.log(`ALL ${all.n} frames: clip p50 ${f(pct(all.clip, 0.5))} p90 ${f(pct(all.clip, 0.9))} | A p50 ${f(pct(all.A, 0.5))} p90 ${f(pct(all.A, 0.9))} elbow p90 ${f(pct(all.moveA, 0.9) * 100)} cm | B p50 ${f(pct(all.B, 0.5))} p90 ${f(pct(all.B, 0.9))} elbow p90 ${f(pct(all.moveB, 0.9) * 100)} cm, unreachable ${all.unreachB}`);
