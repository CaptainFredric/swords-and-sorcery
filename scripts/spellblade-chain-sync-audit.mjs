// The third-person sword against the server's sword, through the real sim and the real animation plan.
// scripts/sword-loop-audit.mjs drives the room and emulates SpellbladeAnimator over the shipped model as the client
// composes it (spellblade.glb + the motion sidecar's Slash_1 upper body); this compares what it shows with
// shared/src/blade.mjs bladeDirection, the blade the server sweeps for hits:
//
//   sync     at the contact: the heading of the shown blade minus the server's (a chop: the server's pitch minus the
//            shown one), positive = the shown blade is AHEAD along the cut; and the worst 3-D angle between the two
//            through the swing window (contact -0.09 s to +0.11 s)
//   reach    how far round the shown blade goes in the follow-through, as a heading measured along the cut
//            (0 = the aim, 75 = where the server's arc ends, 90 = straight out to the side, >90 = behind the knight)
//   sweep    the fastest the point moves in a frame after the cut (a cross-fade through the body reads as one)
//
//   node scripts/spellblade-chain-sync-audit.mjs [--scenario name] [--json out.json] [--frames]
import { writeFileSync } from 'node:fs';
import { run, SCENARIOS } from './sword-loop-audit.mjs';
import { aimFrame, bladeDirection, BLADE } from '../shared/src/blade.mjs';
import { MELEE_CONTACT, SWORD_STRIKE_TIMES } from '../shared/src/combat.mjs';

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const DEG = 180 / Math.PI;
// heading in the knight's frame (the model faces -z; + toward his left, -x)
const heading = (v) => Math.atan2(-v[0], -v[2]) * DEG;
const asArray = (v) => (Array.isArray(v) ? v : [v.x, v.y, v.z]);
const wrap = (a) => ((a + 540) % 360) - 180;

export function audit(name, scenario) {
  const result = run(name, scenario);
  const frame = result.frames;
  const at = (t) => frame.reduce((best, f) => (Math.abs(f.t - t) < Math.abs(best.t - t) ? f : best), frame[0]);
  const blade = (f) => f.tip.map((v, i) => v - f.hand[i]);
  const aim = aimFrame(0, 0);
  const strikes = result.contacts.map((c, i) => {
    const sweep = MELEE_CONTACT.sweep[c.kind] ?? 0;
    const sign = sweep || 1;
    const window = [];
    for (let dt = -MELEE_CONTACT.window.early; dt <= MELEE_CONTACT.window.late + 1e-9; dt += 1 / 60) {
      const f = at(c.at + dt);
      const server = asArray(bladeDirection(c.kind, dt, aim));
      const shown = blade(f);
      // a chop is judged by its pitch (it comes down the aim), a side cut by its heading along the arc
      const err = sweep
        ? sign * wrap(heading(shown) - heading(server))
        : (Math.atan2(server[1], Math.hypot(server[0], server[2])) - Math.atan2(shown[1], Math.hypot(shown[0], shown[2]))) * DEG;
      const n = Math.hypot(...shown);
      const off = Math.acos(Math.max(-1, Math.min(1, shown.reduce((a, v, j) => a + (v / n) * server[j], 0)))) * DEG;
      window.push({ dt: +dt.toFixed(3), err: +err.toFixed(1), off: +off.toFixed(1), clip: f.clip, time: f.time });
    }
    const contact = window.reduce((best, w) => (Math.abs(w.dt) < Math.abs(best.dt) ? w : best));
    const lateral = sweep ? 0 : wrap(heading(blade(at(c.at))));
    // the follow-through: from the end of the swing window to the next contact's approach (or the end of the run)
    const next = result.contacts[i + 1]?.at ?? frame.at(-1).t;
    // (to the end of its slot: the next strike's raise, or a chain's restart, is not this one's follow-through)
    const span = frame.filter((f) => f.t > c.at + MELEE_CONTACT.window.late && f.t < Math.min(next - 0.2, c.at + 0.3));
    const reach = span.length ? Math.max(...span.map((f) => sign * heading(blade(f)))) : null;
    let sweepMax = 0;
    for (let k = 1; k < span.length; k += 1) sweepMax = Math.max(sweepMax, Math.hypot(...span[k].tip.map((v, j) => v - span[k - 1].tip[j])) / (span[k].t - span[k - 1].t));
    return { strike: c.strike, kind: c.kind, at: c.at, contactErr: contact.err, maxErr: Math.max(...window.map((w) => w.off)), chopLateral: +lateral.toFixed(1), reach: reach === null ? null : +reach.toFixed(0), sweep: +sweepMax.toFixed(1), window };
  });
  return { name, strikes, snaps: result.snaps.length, footSlide: result.footSlide, footSpeed: result.footSpeed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = option('--scenario');
  const report = {};
  const KIND = ['forehand', 'backhand', 'chop'];
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    if (only && only !== name) continue;
    const r = audit(name, scenario);
    if (!r.strikes.length) continue;
    report[name] = args.includes('--frames') ? r : { ...r, strikes: r.strikes.map(({ window, ...s }) => s) };
    console.log(`${name}: ${r.snaps} snap(s), feet sliding ${(r.footSlide * 100).toFixed(0)}% (${r.footSpeed} m/s)`);
    for (const s of r.strikes) {
      console.log(`  ${String(s.strike + 1)} ${KIND[s.kind].padEnd(8)} @${s.at.toFixed(2)}  ahead of the server's blade at contact ${String(s.contactErr).padStart(6)}°, worst 3-D angle in window ${String(s.maxErr.toFixed(0)).padStart(4)}°${s.kind === 2 ? `, chop ${s.chopLateral}° off to the side` : ''}  follow-through reaches ${s.reach}° (server arc ends ${BLADE.arcHalfDeg}°)  point ${s.sweep} m/s`);
    }
  }
  // per kind, over every scenario: the mean |contact error|, the worst window angle, the farthest follow-through
  const all = Object.values(report).flatMap((r) => r.strikes);
  for (let k = 0; k < 3; k += 1) {
    const ks = all.filter((s) => s.kind === k);
    if (!ks.length) continue;
    const reach = ks.map((s) => s.reach).filter((v) => v !== null);
    console.log(`ALL ${KIND[k].padEnd(8)} n=${ks.length}  |contact error| mean ${(ks.reduce((a, s) => a + Math.abs(s.contactErr), 0) / ks.length).toFixed(1)}° max ${Math.max(...ks.map((s) => Math.abs(s.contactErr))).toFixed(1)}°  window worst ${Math.max(...ks.map((s) => s.maxErr)).toFixed(0)}°  follow-through max ${Math.max(...reach)}°  point max ${Math.max(...ks.map((s) => s.sweep))} m/s`);
  }
  const out = option('--json');
  if (out) writeFileSync(out, JSON.stringify(report, null, 1));
}
