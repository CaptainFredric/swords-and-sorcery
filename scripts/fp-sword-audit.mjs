// The first-person sword, measured: LocalSwordChain driven by presses and releases, its poses taken from the real
// fpSlash paths through WeaponView's own hand-over rules (restated here: WeaponView needs three.js and a GPU), and
// two things reported per scenario:
//   - jumps: frames where the sword hand or the blade moves several times faster than the path it is on;
//   - agreement: through each strike's live window, how far (degrees, as seen from the eye) the drawn blade is from
//     where the server's blade is (shared/src/blade.mjs bladeDirection) — the arc you see against the arc that hits.
//
//   node scripts/fp-sword-audit.mjs [--scenario name]

import { MELEE_CONTACT, SWORD_STRIKE_TIMES } from '../shared/src/combat.mjs';
import { aimFrame, bladeDirection } from '../shared/src/blade.mjs';
import { LocalSwordChain } from '../client/game/localSwordChain.mjs';
import { blendPoses, comboPose, recoveryPose } from '../client/game/fpSlash.mjs';
import { swordPresentationTime } from '../client/game/spellbladeAnimationPlan.mjs';
const fpChains = await import('../client/game/fpSwordChains.mjs').catch(() => ({}));

const FPS = 120;
const DT = 1 / FPS;
const DEG = 180 / Math.PI;
// the drawn blade: from the fist on the grip, this long (the first-person sword, measured from spellblade-fp.glb)
const BLADE_LENGTH = 1.05;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return a.map((v) => v / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// the view leaned by the pose's look (pitch about x, yaw about y, roll about z: the camera's own Euler order YXZ)
function lean(v, { pitch, roll, yaw }) {
  const rx = (p, a) => [p[0], p[1] * Math.cos(a) - p[2] * Math.sin(a), p[1] * Math.sin(a) + p[2] * Math.cos(a)];
  const ry = (p, a) => [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)];
  const rz = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]];
  return ry(rx(rz(v, roll), pitch), yaw);
}

// the drawn blade in the true aim's frame (camera space, the eye at the origin): its grip and its point
function drawnBlade(pose) {
  const { wrist, blade } = pose.arm;
  const grip = [wrist[0] + blade[0] * 0.08, wrist[1] + blade[1] * 0.08, wrist[2] + blade[2] * 0.08];
  const tip = grip.map((v, i) => v + blade[i] * BLADE_LENGTH);
  return { grip: lean(grip, pose.look), tip: lean(tip, pose.look) };
}

// how far, as seen from the eye, a direction is from the drawn blade (the nearest point of it), in degrees
function offBlade(direction, { grip, tip }) {
  let best = Infinity;
  for (let k = 0; k <= 40; k += 1) {
    const p = grip.map((v, i) => v + (tip[i] - v) * (k / 40));
    best = Math.min(best, Math.acos(Math.max(-1, Math.min(1, dot(unit(p), direction)))) * DEG);
  }
  return best;
}

/**
 * WeaponView's chain hand-over (#combo/#comboShow), restated: the chain's own path while it runs (a new chain taking
 * over from the last over 0.18 s), the way home after it ends. variant: the chain shown (fpSwordChains), as the arms
 * choose it when it starts.
 */
class FirstPersonArms {
  constructor() { this.source = null; this.handover = null; this.last = null; this.shown = null; }
  step(chain, now, variantFor = () => 0) {
    if (chain) {
      if (this.source?.chainAt !== chain.startedAt) {
        const previous = this.source;
        this.handover = previous ? { from: previous, at: now } : null;
        const variant = variantFor(chain);
        const pose = fpChains.chainPose ? (t) => fpChains.chainPose(variant, t - chain.startedAt) : (t) => comboPose(swordPresentationTime(t - chain.startedAt, 0));
        this.source = { chainAt: chain.startedAt, variant, pose };
      }
      this.last = { since: now - chain.startedAt, at: now, variant: this.source.variant };
      return this.#show(this.source.pose(now), now);
    }
    if (!this.source) return null;
    if (this.source.chainAt !== undefined && this.last) {
      const { since, at, variant } = this.last;
      this.source = { home: true, pose: (t) => (fpChains.chainRecoveryPose ? fpChains.chainRecoveryPose(variant, since, t - at) : recoveryPose(since, t - at)) };
    }
    const pose = this.source.pose(now);
    if (!pose) { this.source = null; this.handover = null; return null; }
    return this.#show(pose, now);
  }
  #show(pose, now) {
    let shown = pose;
    if (this.handover) {
      const w = (now - this.handover.at) / 0.18;
      if (w >= 1) this.handover = null;
      else shown = blendPoses(this.handover.from.pose(now) ?? comboPose(0), pose, w);
    }
    this.shown = shown;
    return shown;
  }
}

const angleBetween = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))) * DEG;

export function runFirstPerson(name, { seconds, presses }) {
  const chain = new LocalSwordChain();
  const arms = new FirstPersonArms();
  const t0 = 10;
  const frames = [];
  const live = [];
  let previous = null;
  for (let i = 0; i <= seconds * FPS; i += 1) {
    const now = t0 + i * DT;
    for (const [at, down] of presses) if (Math.abs(now - t0 - at) < DT / 2) (down ? chain.press(now) : chain.release());
    const c = chain.step(now);
    const pose = arms.step(c, now, (ch) => (fpChains.variantForChain ? fpChains.variantForChain(ch) : 0)) ?? comboPose(0);
    const frame = { t: +(now - t0).toFixed(4), wrist: pose.arm.wrist, blade: pose.arm.blade };
    if (previous) {
      frame.wristStep = len(sub(pose.arm.wrist, previous.arm.wrist));
      frame.bladeStep = angleBetween(pose.arm.blade, previous.arm.blade);
    }
    // the server's blade through each committed strike's live window (from its swing to `follow` past contact)
    if (c) {
      for (let strike = 0; strike < c.committed; strike += 1) {
        const dt = now - (c.startedAt + SWORD_STRIKE_TIMES[strike]);
        if (dt < -MELEE_CONTACT.window.early || dt > MELEE_CONTACT.follow) continue;
        const kind = fpChains.strikeKind ? fpChains.strikeKind(c.variant ?? 0, strike) : strike;
        const d = bladeDirection(kind, dt, aimFrame(0, 0));
        live.push({ strike, chainAt: c.startedAt, dt: +dt.toFixed(3), off: +offBlade([d.x, d.y, d.z], drawnBlade(pose)).toFixed(1) });
      }
    }
    previous = pose;
    frames.push(frame);
  }
  // jumps: a frame moving far faster than its neighbours on either side (a hand-over or a seam, not a fast cut)
  const jumps = [];
  for (let i = 3; i < frames.length - 3; i += 1) {
    const around = [...frames.slice(i - 3, i), ...frames.slice(i + 1, i + 4)];
    const w = Math.max(...around.map((f) => f.wristStep ?? 0)), b = Math.max(...around.map((f) => f.bladeStep ?? 0));
    const f = frames[i];
    if ((f.wristStep > 0.01 && f.wristStep > 2.2 * w) || (f.bladeStep > 2 && f.bladeStep > 2.2 * b)) jumps.push({ t: f.t, wrist: +f.wristStep.toFixed(4), blade: +f.bladeStep.toFixed(2) });
  }
  const atContact = live.filter((l) => Math.abs(l.dt) < 0.5 / FPS);
  // (the part of the window on screen: from half way through its approach, where the server's blade comes within 40
  // degrees of the aim, to `follow`)
  const onScreen = live.filter((l) => l.dt >= -MELEE_CONTACT.window.early / 2);
  return {
    name, frames, jumps, live,
    contactOff: atContact.map((l) => l.off),
    maxLiveOff: live.length ? Math.max(...live.map((l) => l.off)) : 0,
    onScreenMean: onScreen.length ? +(onScreen.reduce((s, l) => s + l.off, 0) / onScreen.length).toFixed(1) : 0,
    onScreenMax: onScreen.length ? Math.max(...onScreen.map((l) => l.off)) : 0,
    meanLiveOff: live.length ? +(live.reduce((s, l) => s + l.off, 0) / live.length).toFixed(1) : 0,
    peakWrist: Math.max(...frames.map((f) => f.wristStep ?? 0)) * FPS,
  };
}

export const FP_SCENARIOS = {
  'ten held chains': { seconds: 10 * 2.08 + 0.6, presses: [[0, true], [10 * 2.08 - 0.1, false]] },
  'one tap': { seconds: 1.4, presses: [[0, true], [0.05, false]] },
  'let go after two': { seconds: 2.4, presses: [[0, true], [0.8, false]] },
  'tap again after the restart': { seconds: 4.4, presses: [[0, true], [0.05, false], [2.3, true], [2.35, false]] },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv.includes('--scenario') ? process.argv[process.argv.indexOf('--scenario') + 1] : null;
  for (const [name, scenario] of Object.entries(FP_SCENARIOS)) {
    if (only && only !== name) continue;
    const r = runFirstPerson(name, scenario);
    console.log(`${name}: ${r.jumps.length} jump(s); peak hand speed ${r.peakWrist.toFixed(2)} m/s; drawn blade vs server blade: at contact ≤ ${Math.max(...r.contactOff)}°, on screen (dt ≥ −0.045) mean ${r.onScreenMean}° max ${r.onScreenMax}°; whole window mean ${r.meanLiveOff}° max ${r.maxLiveOff}°`);
    for (const j of r.jumps.slice(0, 8)) console.log(`   t=${j.t.toFixed(3)} hand ${j.wrist} m, blade ${j.blade}° in a frame`);
  }
}
