// How far the sword wrist could be straightened by re-placing the elbow alone: the shoulder and the hand (so the sword)
// stay exactly where each clip frame puts them; the elbow may sit anywhere on the circle the two arm bones allow; the
// forearm then points from the elbow to the hand. For each frame: the clip's wrist bend, and the least bend any elbow
// on that circle gives, with how far the elbow would move.
import { loadGlb, localPose, worldMatrices } from '../lib/glbPose.mjs';

const [path, list = 'Idle,Walk,Run,Sprint,Brake_Stop,Guard,Slash_1,Slash_2,Slash_3,Slash_1_to_2,Slash_2_to_3,Rigid_Riposte_Deflect_Thrust', side = 'R'] = process.argv.slice(2);
const m = loadGlb(path);
const id = (n) => m.byName.get(n);
const UA = id(`upper_arm.${side}`), FA = id(`forearm.${side}`), HA = id(`hand.${side}`);
const P = (w, i) => [w[i][12], w[i][13], w[i][14]];
const sub = (a, b) => a.map((v, i) => v - b[i]), add = (a, b) => a.map((v, i) => v + b[i]), mul = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.sqrt(dot(a, a)), unit = (a) => mul(a, 1 / len(a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const R = (w, i) => { const c = [0, 1, 2].map((j) => len([w[i][j * 4], w[i][j * 4 + 1], w[i][j * 4 + 2]])); return [0, 1, 2].map((j) => [w[i][j * 4] / c[j], w[i][j * 4 + 1] / c[j], w[i][j * 4 + 2] / c[j]]); }; // columns
const toLocal = (cols, v) => cols.map((c) => dot(c, v)), toWorld = (cols, v) => add(add(mul(cols[0], v[0]), mul(cols[1], v[1])), mul(cols[2], v[2]));
const deg = (x) => x * 180 / Math.PI, ang = (a, b) => deg(Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))));
const bw = worldMatrices(m, localPose(m, []));
const a = len(sub(P(bw, FA), P(bw, UA))), b = len(sub(P(bw, HA), P(bw, FA)));
const g = toLocal(R(bw, HA), unit(sub(P(bw, HA), P(bw, FA)))); // the forearm's direction, in the hand's own frame, at bind
for (const clip of list.split(',')) {
  const c = m.clips.get(clip); if (!c) continue;
  let worstClip = 0, worstBest = 0, moved = 0;
  const rows = [];
  for (let f = 0; f <= Math.round(c.duration * 30); f += 1) {
    const w = worldMatrices(m, localPose(m, [{ clip, time: Math.min(c.duration, f / 30), weight: 1 }]));
    const S = P(w, UA), E0 = P(w, FA), H = P(w, HA), f0 = toWorld(R(w, HA), g);
    const clipBend = ang(sub(H, E0), f0);
    const d = len(sub(H, S)), u = unit(sub(H, S));
    const x = (a * a - b * b + d * d) / (2 * d), r = Math.sqrt(Math.max(0, a * a - x * x));
    const e1 = unit(Math.abs(u[1]) < 0.9 ? cross(u, [0, 1, 0]) : cross(u, [1, 0, 0])), e2 = cross(u, e1);
    let best = { bend: 1e9 };
    for (let k = 0; k < 144; k += 1) {
      const phi = k * Math.PI / 72;
      const E = add(add(S, mul(u, x)), add(mul(e1, r * Math.cos(phi)), mul(e2, r * Math.sin(phi))));
      const bend = ang(sub(H, E), f0);
      if (bend < best.bend) best = { bend, E };
    }
    const move = len(sub(best.E, E0));
    rows.push(`${Math.round(clipBend)}>${Math.round(best.bend)}`);
    worstClip = Math.max(worstClip, clipBend); worstBest = Math.max(worstBest, best.bend); moved = Math.max(moved, move);
  }
  console.log(`${clip.padEnd(30)} wrist bend: clip worst ${Math.round(worstClip)}°, best elbow worst ${Math.round(worstBest)}°, elbow moves up to ${(moved * 100).toFixed(0)} cm   ${rows.slice(0, 14).join(' ')}`);
}
console.log(`upper arm ${a.toFixed(3)} m, forearm ${b.toFixed(3)} m`);
