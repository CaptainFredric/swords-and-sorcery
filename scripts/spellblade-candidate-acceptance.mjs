// Argon's next third-person Spellblade, measured against what PR #497 asked of it, before any binary is swapped.
//   node scripts/spellblade-candidate-acceptance.mjs <candidate.glb> [--with-sidecar] [--json out.json]
// With no candidate it measures the shipped model as the client composes it (the baseline the numbers below came from).
//
// 1. compatibility (scripts/spellblade-compat-check.mjs): skeleton, binds, materials, sockets, sword point, clips, root;
// 2. the asks of docs/verification/swordsmanship-acceptance-20261114 §4, each a measured number with its target:
//    the forehand's and backhand's follow-through (how far round, the wrist fold, the hips' share of the turn), the chop
//    down the aim, the cuts' footwork (skating frames), and every bridge landing on the next cut;
// 3. the presentation constants the game needs re-measured for this model (client/game/swordChainPresentation.mjs
//    STRIKE_CLIPS): where each cut crosses the aim, the frames matching the server's blade at the swing window's ends,
//    the bridges' start and landing frames. Printed as a block to paste after review.
// Exit code 1 when compatibility breaks; the asks are reported, not enforced (they are design targets).
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { loadGlb, localPose, worldMatrices, apply, composeMotion } from './lib/glbPose.mjs';
import { swordPoint } from './lib/glbSkin.mjs';
import { aimFrame, bladeDirection } from '../shared/src/blade.mjs';
import { MELEE_CONTACT } from '../shared/src/combat.mjs';

const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const json = jsonAt >= 0 ? args.splice(jsonAt, 2)[1] : null;
const candidate = args.find((a) => a.endsWith('.glb'));
const dir = new URL('../client/assets/characters/spellblade/', import.meta.url).pathname;
const model = loadGlb(candidate ?? `${dir}spellblade.glb`);
if (!candidate || args.includes('--with-sidecar')) composeMotion(model, `${dir}spellblade-motion.glb`);
const { joint: SWORD, tip: TIP } = swordPoint(model);
const id = (n) => model.byName.get(n);
const D = 180 / Math.PI;
const sub = (a, b) => a.map((v, i) => v - b[i]);
const heading = (v) => Math.atan2(-v[0], -v[2]) * D;
const pitch = (v) => Math.atan2(v[1], Math.hypot(v[0], v[2])) * D;
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.reduce((s, v, i) => s + v * b[i], 0) / (Math.hypot(...a) * Math.hypot(...b))))) * D;
const has = (clip) => model.clips.has(clip);
const duration = (clip) => model.clips.get(clip).duration;
function pose(clip, t) {
  const w = worldMatrices(model, localPose(model, [{ clip, time: Math.max(0, Math.min(duration(clip), t)), weight: 1 }]));
  const at = (n, p = [0, 0, 0]) => apply(w[id(n)], p);
  const grip = apply(w[SWORD], [0, 0, 0]), tip = apply(w[SWORD], TIP);
  return { grip, tip, blade: sub(tip, grip), forearm: sub(at('hand.R'), at('forearm.R')), hipLine: sub(at('thigh.L'), at('thigh.R')), shoulderLine: sub(at('upper_arm.L'), at('upper_arm.R')),
    points: [tip, grip, at('hand.L'), at('chest'), at('foot.L'), at('foot.R')] };
}
const lineHeading = (d) => heading([-d[2], 0, d[0]]);
const gap = (A, B) => A.reduce((s, a, i) => s + Math.hypot(...sub(a, B[i])), 0);
const report = { model: candidate ?? 'shipped (composed with the motion sidecar)', compatibility: null, asks: [], strikeClips: {}, bridges: {} };

// 1. compatibility
if (candidate) {
  const r = spawnSync(process.execPath, [new URL('./spellblade-compat-check.mjs', import.meta.url).pathname, candidate], { encoding: 'utf8' });
  report.compatibility = { ok: r.status === 0, output: r.stdout.trim().split('\n') };
  console.log(r.stdout.trim());
}

// 3 (first: the asks are measured at these frames). Where each cut crosses the aim, and the server-matching window frames.
const CUTS = [{ clip: 'Slash_1', kind: 0, sign: 1 }, { clip: 'Slash_2', kind: 1, sign: -1 }, { clip: 'Slash_3', kind: 2, sign: 1 }];
const aim = aimFrame(0, 0);
const asArray = (v) => (Array.isArray(v) ? v : [v.x, v.y, v.z]);
for (const cut of CUTS) {
  if (!has(cut.clip)) continue;
  const f = (t) => { const b = pose(cut.clip, t).blade; return cut.kind === 2 ? -pitch(b) : cut.sign * heading(b); };
  let contact = null, prev = null;
  for (let t = 0.2; t <= Math.min(0.6, duration(cut.clip)); t += 1 / 480) { const v = f(t); if (prev && prev[1] < 0 && v >= 0) { contact = prev[0] + (0 - prev[1]) / (v - prev[1]) * (t - prev[0]); break; } prev = [t, v]; }
  const nearest = (dt, lo, hi) => { const s = asArray(bladeDirection(cut.kind, dt, aim)); let b = null; for (let t = lo; t <= hi; t += 1 / 480) { const a = angle(pose(cut.clip, t).blade, s); if (!b || a < b[1]) b = [t, a]; } return b; };
  const swing0 = contact ? nearest(-MELEE_CONTACT.window.early, contact - 0.12, contact) : null;
  const swing1 = contact ? nearest(MELEE_CONTACT.window.late, contact, contact + 0.15) : null;
  report.strikeClips[cut.clip] = { contact: contact && +contact.toFixed(3), swing: swing0 && [+swing0[0].toFixed(3), +swing1[0].toFixed(3)], swingFit: swing0 && [+swing0[1].toFixed(0), +swing1[1].toFixed(0)],
    lateralAtContact: contact && cut.kind === 2 ? +heading(pose(cut.clip, contact).blade).toFixed(0) : undefined,
    rateAtContact: contact && +((f(contact + 0.005) - f(contact - 0.005)) / 0.01).toFixed(0) };
}
for (const [bridge, from, to] of [['Slash_1_to_2', 'Slash_1', 'Slash_2'], ['Slash_2_to_3', 'Slash_2', 'Slash_3'], ['Slash_2_to_1', 'Slash_2', 'Slash_1'], ['Slash_1_to_3', 'Slash_1', 'Slash_3']]) {
  if (!has(bridge) || !has(from) || !has(to)) { report.bridges[bridge] = 'missing'; continue; }
  const best = (clip, ref, lo, hi) => { let b = null; for (let t = lo; t <= hi; t += 1 / 120) { const d = gap(pose(clip, t).points, ref); if (!b || d < b[1]) b = [t, d]; } return b; };
  const s = best(from, pose(bridge, 0).points, 0.3, duration(from)), e = best(to, pose(bridge, duration(bridge)).points, 0, 0.4);
  report.bridges[bridge] = { duration: +duration(bridge).toFixed(3), startsOn: [from, +s[0].toFixed(3), +s[1].toFixed(3)], landsOn: [to, +e[0].toFixed(3), +e[1].toFixed(3)] };
}

// 2. the asks
const ask = (name, measured, target, ok) => { report.asks.push({ name, measured, target, pass: Boolean(ok) }); };
const rest = report.bridges.Slash_1_to_2?.startsOn?.[1] ?? 0.467;
for (const [clip, sign, label, reachTarget] of [['Slash_1', 1, 'forehand', 90], ['Slash_2', -1, 'backhand', 95]]) {
  if (!has(clip)) continue;
  const c = report.strikeClips[clip].contact ?? 0.4;
  let reach = -Infinity, wrist = 0, hips = 0, shoulders = 0;
  for (let t = c + MELEE_CONTACT.window.late; t <= Math.min(duration(clip), c + 0.25); t += 1 / 60) {
    const p = pose(clip, t);
    reach = Math.max(reach, sign * heading(p.blade));
    wrist = Math.max(wrist, angle(p.forearm, p.blade));
    hips = Math.max(hips, sign * lineHeading(p.hipLine)); shoulders = Math.max(shoulders, sign * lineHeading(p.shoulderLine));
  }
  ask(`${label} follow-through reach (deg round from the aim)`, +reach.toFixed(0), `<= ${reachTarget} (server arc ends 75; was 124 / 138)`, reach <= reachTarget);
  ask(`${label} wrist fold after contact (deg)`, +wrist.toFixed(0), '<= 12 (was 26 / f16)', wrist <= 12);
  ask(`${label} hips' turn vs shoulders' (deg)`, `${hips.toFixed(0)} / ${shoulders.toFixed(0)}`, 'hips >= 15 (was 3 / 51)', hips >= 15);
  ask(`${label} heading at the bridge start (${rest}s)`, +(sign * heading(pose(clip, rest).blade)).toFixed(0), '<= 95', sign * heading(pose(clip, rest).blade) <= 95);
}
if (report.strikeClips.Slash_3?.contact) ask('chop: blade to the side where it crosses the aim (deg)', report.strikeClips.Slash_3.lateralAtContact, '|x| <= 12 (was 37)', Math.abs(report.strikeClips.Slash_3.lateralAtContact) <= 12);
if (has('Slash_3')) { let low = 90; for (let t = (report.strikeClips.Slash_3.contact ?? 0.38); t <= Math.min(duration('Slash_3'), (report.strikeClips.Slash_3.contact ?? 0.38) + 0.12); t += 1 / 60) low = Math.min(low, pitch(pose('Slash_3', t).blade)); ask('chop: how far below the aim it goes within 0.12 s (deg)', +low.toFixed(0), '<= -40 (server -50; was -15)', low <= -40); }
const idle = (() => { const w = worldMatrices(model, localPose(model, [{ clip: 'Idle', time: 0, weight: 1 }])); return [apply(w[id('foot.L')], [0, 0, 0])[1], apply(w[id('foot.R')], [0, 0, 0])[1]]; })();
// Footwork. A threshold on speed alone was met by 8916d5bd with a foot gliding 1.4 cm off the floor at 0.96 m/s (under
// 4 cm, under 1 m/s), the same five-frame glide in all three cuts, the other foot pinned to the micron while the
// pelvis travels and turns, and the knee absorbing the difference. So the asks are now: no glide (a foot near the floor
// travels ≤ 2 cm in the clip, however slowly), a foot that moves is lifted to move (≥ 5 cm), and the knees bend smoothly
// (frame-to-frame change of the knee's own rate ≤ 20°/frame², the pop a pinned foot under a travelling pelvis makes).
const kneeBend = (w, s) => {
  const hip = apply(w[id(`thigh.${s}`)], [0, 0, 0]), knee = apply(w[id(`shin.${s}`)], [0, 0, 0]), ankle = apply(w[id(`foot.${s}`)], [0, 0, 0]);
  const u = hip.map((v, i) => v - knee[i]), v2 = ankle.map((v, i) => v - knee[i]);
  return 180 - Math.acos(Math.max(-1, Math.min(1, (u[0] * v2[0] + u[1] * v2[1] + u[2] * v2[2]) / (Math.hypot(...u) * Math.hypot(...v2))))) * 180 / Math.PI;
};
for (const clip of ['Slash_1', 'Slash_2', 'Slash_3']) {
  if (!has(clip)) continue;
  const n = Math.round(duration(clip) * 30); let skate = 0, peak = 0, prev = null;
  const glide = [0, 0], travel = [0, 0], lift = [0, 0], knees = [[], []];
  for (let f = 0; f <= n; f += 1) {
    const w = worldMatrices(model, localPose(model, [{ clip, time: f / 30, weight: 1 }]));
    const feet = ['foot.L', 'foot.R'].map((b) => apply(w[id(b)], [0, 0, 0]));
    ['L', 'R'].forEach((s, k) => { knees[k].push(kneeBend(w, s)); lift[k] = Math.max(lift[k], feet[k][1] - idle[k]); });
    if (prev) feet.forEach((p, k) => {
      const d = Math.hypot(p[0] - prev[k][0], p[2] - prev[k][2]), v = d * 30;
      travel[k] += d;
      if (p[1] < idle[k] + 0.04 && prev[k][1] < idle[k] + 0.04) glide[k] += d;
      if (p[1] < idle[k] + 0.04 && v > 1) { skate += 1; peak = Math.max(peak, v); }
    });
    prev = feet;
  }
  const jerk = knees.map((k) => Math.max(0, ...k.slice(2).map((x, i) => Math.abs(x - 2 * k[i + 1] + k[i]))));
  ask(`${clip} skating frames (foot within 4 cm of the ground moving > 1 m/s), peak m/s`, `${skate} @ ${peak.toFixed(1)}`, '<= 8 frames, peak <= 2 m/s (46-clip cuts: 4-8 @ 1.5-1.7; 89: 13-17 @ 5.5-7.8)', skate <= 8 && peak <= 2);
  ask(`${clip} glide: distance a foot within 4 cm of the floor travels, L / R (cm)`, `${(glide[0] * 100).toFixed(1)} / ${(glide[1] * 100).toFixed(1)}`, '<= 2 each (a planted foot stays planted; a step is lifted)', glide.every((g) => g <= 0.02));
  ask(`${clip} a moving foot is lifted: travel / lift, L and R (cm)`, ['L', 'R'].map((s, k) => `${s} ${(travel[k] * 100).toFixed(0)}/${(lift[k] * 100).toFixed(1)}`).join(', '), 'a foot travelling > 5 cm lifts >= 5 cm', travel.every((t, k) => t <= 0.05 || lift[k] >= 0.05));
  ask(`${clip} knee pop: largest change of the knee's bend rate, L / R (deg/frame^2)`, `${jerk[0].toFixed(0)} / ${jerk[1].toFixed(0)}`, '<= 20 (8916d5bd: up to 43, a pinned foot under a travelling pelvis)', jerk.every((j) => j <= 20));
}
for (const [bridge, value] of Object.entries(report.bridges)) {
  if (value === 'missing') { ask(`${bridge} present`, 'missing', 'present', false); continue; }
  ask(`${bridge} starts on ${value.startsOn[0]} / lands on ${value.landsOn[0]} (summed joint gap, m)`, `${value.startsOn[2]} / ${value.landsOn[2]}`, '<= 0.05 each (Slash_2_to_1 was 0.77 at landing)', value.startsOn[2] <= 0.05 && value.landsOn[2] <= 0.05);
}

console.log(`\n${report.model}`);
for (const a of report.asks) console.log(`  ${a.pass ? 'meets ' : 'misses'}  ${a.name}: ${a.measured}   (target ${a.target})`);
console.log('\nSTRIKE_CLIPS for this model (swordChainPresentation.mjs; review, then paste; far = the bridges\' start, pickUp = where they land):');
for (const [clip, v] of Object.entries(report.strikeClips)) {
  const far = report.bridges[`${clip}_to_${clip === 'Slash_1' ? 2 : 3}`]?.startsOn?.[1];
  const pick = Object.values(report.bridges).find((b) => b !== 'missing' && b.landsOn[0] === clip)?.landsOn?.[1];
  console.log(`  ${clip}: { contact: ${v.contact}, swing: [${v.swing}], far: ${far ?? '(the heavy strike plays to its end)'}, pickUp: ${pick ?? '?'} }   // window fit ${v.swingFit?.join('/')} deg, ${v.rateAtContact} deg/s at contact`);
}
if (json) writeFileSync(json, JSON.stringify(report, null, 1));
if (report.compatibility && !report.compatibility.ok) process.exitCode = 1;
