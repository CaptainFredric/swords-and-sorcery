// The ordinary sword loop, measured. The real sim (shared/sim) is driven with real button presses; each frame its
// snapshot goes through the real third-person animation plan and an emulation of SpellbladeAnimator's cross-fades,
// and the shipped spellblade.glb is sampled (scripts/lib/glbPose.mjs). The first-person arms come from the real
// fpSlash paths through WeaponView's own chain hand-over rules. What is reported is what a player would see: where
// the sword tip goes, frame by frame, and where it jumps.
//
//   node scripts/sword-loop-audit.mjs [--json out.json] [--scenario name]
//
// A "snap" is a frame whose tip displacement exceeds both an absolute floor and several times the fastest that same
// stretch moves in the authored clips themselves (so a real cut at 50 m/s is not a snap, a fade that teleports is).

import { writeFileSync } from 'node:fs';
import { Room } from '../shared/sim/Room.mjs';
import { beginAttack, endAttack, setGuard, stepRoom, tryCastSpell, tryDash } from '../shared/sim/combat.mjs';
import { SWORD_STRIKE_TIMES, strikeKind } from '../shared/src/combat.mjs';
import { serializeSnapshot } from '../shared/sim/wire.mjs';
import { requestSwordTechnique } from '../shared/sim/swordTechniqueLive.mjs';
import { resolveSpellbladeState } from '../client/game/spellbladePose.mjs';
import { resolveSpellbladeAnimationPlan } from '../client/game/spellbladeAnimationPlan.mjs';
import { blendSeconds, blendWeights } from '../client/game/spellbladeBlend.mjs';
import { loadGlb, localPose, overlayMotion, worldMatrices, apply } from './lib/glbPose.mjs';

// the composition's bone owners (spellbladeComposition.mjs, which needs three.js: the same rule, restated)
function spellbladeBoneOwner(name) {
  const bone = name.replace(/[.]/g, '');
  if (/^(upper_arm|forearm|hand|finger|thumb).*R$/.test(bone) || bone === 'socket_sword') return 'sword';
  if (/^(upper_arm|forearm|hand|finger|thumb).*L$/.test(bone) || bone === 'socket_sorcery') return 'sorcery';
  if (/^(spine|chest|neck|head|clavicle)/.test(bone)) return 'posture';
  return 'locomotion';
}

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const FPS = 60;
const DT = 1 / FPS;

// (the canonical model with its motion sidecar laid over it, as the client plays it; --canonical: without)
const model = loadGlb(new URL('../client/assets/characters/spellblade/spellblade.glb', import.meta.url).pathname);
if (!process.argv.includes('--canonical')) overlayMotion(model, new URL('../client/assets/characters/spellblade/spellblade-motion.glb', import.meta.url).pathname);
// the sword's point and the grip in hand.R's frame (measured from the skinned sword's bind pose)
const TIP = [0.131, 1.3383, -0.1661];
const HAND = model.byName.get('hand.R');
const FEET = [model.byName.get('foot.L'), model.byName.get('foot.R')];
// each cut's clip and its authored contact frame (where the blade crosses the knight's front), by kind
const CLIP_CONTACT = [{ clip: 'Slash_1', time: 0.4 }, { clip: 'Slash_2', time: 0.38 }, { clip: 'Slash_3', time: 0.36 }];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const world = {
  floors: [{ id: 'floor', center: [0, -0.1, 0], size: [60, 0.2, 60], y: 0 }],
  ramps: [], solids: [],
  spawnPoints: [{ x: 0, y: 0, z: 0, yaw: 0 }, { x: 0, y: 0, z: -2, yaw: Math.PI }],
  abyssY: -9,
};

function duel() {
  const room = new Room('AUDIT');
  room.world = world;
  room.addPlayer({ id: 'a', token: 'ta', name: 'A' }, 0);
  room.addPlayer({ id: 'b', token: 'tb', name: 'B' }, 0);
  room.setReady('a', true, 0);
  room.setReady('b', true, 0);
  room.tick(3.1);
  const a = room.players.get('a');
  const b = room.players.get('b');
  Object.assign(a.position, { x: 0, y: 0, z: 0 });
  Object.assign(b.position, { x: 0, y: 0, z: -40 });
  a.yaw = 0; a.input.yaw = 0;
  a.spawnProtectionUntil = 0; b.spawnProtectionUntil = 0;
  return { room, a, b };
}

// SpellbladeAnimator's whole-clip path: the active clip, the clips fading out (each frozen where it was), cross-fades
// of blendSeconds; the composed (layered) path is reported, not emulated
class AnimatorEmulation {
  constructor() { this.active = null; this.fading = []; this.blend = { elapsed: 0, duration: 0 }; }
  apply(plan, step) {
    if (plan.layers) {
      // (the composition: each bone from its owner's clip; the gait on its own stride phase)
      const loco = plan.layers.locomotion;
      const c = model.clips.get(loco.clip) ?? model.clips.get(loco.fallback);
      this.gait = ((this.gait ?? 0) + step * (loco.rate ?? 1) / c.duration) % 1;
      const locoTime = loco.loop ? this.gait * c.duration : (loco.normalized ? loco.time * c.duration : loco.time);
      this.active = null; this.fading = [];
      // (the sword's channel cross-fades from the clip it had, over the plan's own blend: spellbladeComposition.mjs)
      const sword = plan.layers.sword;
      if (this.swordLayer && this.swordLayer.clip !== sword.clip) {
        this.swordFade = { from: { ...this.swordLayer }, elapsed: 0, duration: Number.isFinite(sword.blend) ? sword.blend : blendSeconds(this.swordLayer.clip, sword.clip) };
      }
      this.swordLayer = { clip: sword.clip, time: sword.time };
      const fade = this.swordFade;
      if (fade) {
        fade.elapsed += step;
        if (sword.carry) fade.from.time = Math.min(model.clips.get(fade.from.clip).duration, fade.from.time + step);
        if (fade.elapsed >= fade.duration) this.swordFade = null;
      }
      const w = this.swordFade ? ((x) => x * x * (3 - 2 * x))(this.swordFade.elapsed / this.swordFade.duration) : 1;
      return { layered: true, layers: [{ clip: sword.clip, time: sword.time, weight: w }, ...(this.swordFade ? [{ clip: this.swordFade.from.clip, time: this.swordFade.from.time, weight: 1 - w }] : [])],
        owners: { locomotion: { clip: c.name, time: locoTime }, other: { clip: plan.layers.sword.clip, time: plan.layers.sword.time } } };
    }
    this.swordLayer = null; this.swordFade = null;
    const clip = model.clips.has(plan.clip) ? plan.clip : plan.fallback;
    if (this.active?.clip !== clip) {
      const duration = this.active ? (plan.blend ?? blendSeconds(this.active.clip, clip)) : 0;
      if (duration > 0) {
        this.fading = this.fading.filter((e) => e.clip !== clip);
        this.fading.push({ ...this.active, frozen: this.active.time, carry: this.active.carry });
        for (const e of this.fading) { e.startWeight = e.weight ?? 1; e.elapsed = 0; e.duration = duration; }
      } else this.fading = [];
      this.active = { clip, time: 0, weight: 1, carry: Boolean(plan.carry) };
      this.blend = { elapsed: 0, duration };
    }
    const c = model.clips.get(clip);
    const time = plan.loop ? ((plan.time % c.duration) + c.duration) % c.duration : Math.max(0, Math.min(c.duration, plan.time ?? 0));
    this.active.time = plan.normalized ? (plan.time ?? 0) * c.duration : time;
    this.blend.elapsed += step;
    for (const e of this.fading) { e.elapsed += step; if (e.carry) e.frozen = Math.min(model.clips.get(e.clip).duration, e.frozen + step); }
    const progress = this.blend.duration > 0 ? this.blend.elapsed / this.blend.duration : 1;
    const weights = blendWeights(progress, this.fading.map((e) => ({ startWeight: e.startWeight, progress: e.duration > 0 ? e.elapsed / e.duration : 1 })));
    this.fading.forEach((e, i) => { e.weight = weights.fading[i]; });
    if (weights.active >= 1) this.fading = [];
    this.active.weight = weights.active;
    return { layered: false, layers: [{ clip, time: this.active.time, weight: weights.active }, ...this.fading.map((e) => ({ clip: e.clip, time: e.frozen, weight: e.weight }))] };
  }
}

const OWNER = model.gltf.nodes.map((n) => spellbladeBoneOwner(n.name ?? ''));
function sample(layers, owners = null) {
  let local = localPose(model, layers);
  if (owners) {
    const legs = localPose(model, [{ clip: owners.locomotion.clip, time: owners.locomotion.time, weight: 1 }]);
    local = local.map((v, i) => (OWNER[i] === 'locomotion' ? legs[i] : v));
  }
  const w = worldMatrices(model, local);
  return { tip: apply(w[HAND], TIP), hand: apply(w[HAND], [0, 0, 0]), feet: FEET.map((f) => apply(w[f], [0, 0, 0])) };
}

// the fastest the authored clip itself moves the tip around `time` (m per frame)
const authoredRate = new Map();
function authoredStep(clip, time) {
  const key = `${clip}:${Math.round(time * 120)}`;
  if (authoredRate.has(key)) return authoredRate.get(key);
  let best = 0;
  for (let k = -3; k <= 3; k += 1) {
    const t0 = Math.max(0, time + k * DT), t1 = t0 + DT;
    best = Math.max(best, distance(sample([{ clip, time: t0, weight: 1 }]).tip, sample([{ clip, time: t1, weight: 1 }]).tip));
  }
  authoredRate.set(key, best);
  return best;
}

/** Run a scenario: script(t, ctx) presses buttons; returns the per-frame trace and the snaps found. */
export function run(name, { seconds, script, defender = false }) {
  const { room, a, b } = duel();
  // (a knight to cut at: within reach, facing back)
  if (defender) Object.assign(b.position, { x: 0, y: 0, z: -1.9 });
  const animator = new AnimatorEmulation();
  const t0 = 10;
  let previous = null;
  const frames = [];
  const snaps = [];
  const swings = [];
  let guardSeenAt;
  let plantedFrames = 0, slidingFrames = 0, slideSum = 0;
  // the soles' height when planted (the Idle stance's lower foot)
  const footFloor = Math.min(...sample([{ clip: 'Idle', time: 1 / 30, weight: 1 }]).feet.map((f) => f[1]));
  for (let i = 0; i <= seconds * FPS; i += 1) {
    const now = t0 + i * DT;
    script(now - t0, { room, player: a, now });
    stepRoom(room, DT, now, world);
    const snap = serializeSnapshot(room, now, 'b').players.find((p) => p.id === 'a');
    // (as RemotePlayers tracks it)
    if (snap.guarding) guardSeenAt = now;
    snap.guardSeenAt = guardSeenAt;
    const state = resolveSpellbladeState(snap, now);
    const plan = resolveSpellbladeAnimationPlan({ state, player: snap, serverNow: now, localTime: now });
    const shown = animator.apply(plan, DT);
    const pose = sample(shown.layers, shown.owners);
    // the feet in the world: the knight's place and facing, his pose's feet in it (yaw about +y; forward is -z)
    const c = Math.cos(a.yaw), sn = Math.sin(a.yaw);
    const feet = pose.feet.map((f) => [a.position.x + f[0] * c + f[2] * sn, a.position.y + f[1], a.position.z - f[0] * sn + f[2] * c]);
    if (previous?.feet && a.grounded) {
      for (let k = 0; k < 2; k += 1) {
        const low = pose.feet[k][1] < footFloor + 0.05;
        const speed = Math.hypot(feet[k][0] - previous.feet[k][0], feet[k][2] - previous.feet[k][2]) / DT;
        if (low) { plantedFrames += 1; slideSum += speed; if (speed > 1) slidingFrames += 1; }
      }
    }
    const frame = { t: +(now - t0).toFixed(4), state, clip: plan.clip ?? plan.layers?.sword?.clip, time: +(plan.time ?? 0).toFixed(3), layered: shown.layered,
      tip: pose.tip.map((v) => +v.toFixed(3)), hand: pose.hand.map((v) => +v.toFixed(3)), active: snap.attackActive, started: snap.attackStartedAt };
    if (previous) {
      const step = distance(pose.tip, previous.pose.tip);
      // the most the authored motion moves in a frame here, of every clip being shown
      const authored = Math.max(...shown.layers.filter((l) => l.weight > 0.02).map((l) => authoredStep(l.clip, l.time)), ...previous.layers.filter((l) => l.weight > 0.02).map((l) => authoredStep(l.clip, l.time)));
      frame.step = +step.toFixed(3);
      frame.authored = +authored.toFixed(3);
      // (a hand-over between the whole-body mixer and the layered composition is inertialized in the game, not here)
      const handOver = shown.layered !== previous.frame.layered;
      if (!handOver && step > 0.12 && step > 2.5 * authored + 0.04) snaps.push({ t: frame.t, step: frame.step, authored: frame.authored, from: previous.frame.clip, to: frame.clip, state });
      // a frozen sword: the plan says it should move, nothing does (several frames)
    }
    previous = { pose, layers: shown.layers, frame, feet };
    frames.push(frame);
    for (const e of room.events.splice(0)) if (e.type === 'swordSwing' && e.playerId === 'a') swings.push({ strike: e.strikeIndex, kind: e.kind ?? strikeKind(a.attackVariant ?? 0, e.strikeIndex), startedAt: a.attackStartedAt });
  }
  // every strike's contact, as shown: the blade (hand to tip) against the authored clip's own blade at its contact
  const contacts = swings.map(({ strike, kind, startedAt }) => {
    const at = startedAt - t0 + SWORD_STRIKE_TIMES[strike];
    const frame = frames.reduce((best, f) => (Math.abs(f.t - at) < Math.abs(best.t - at) ? f : best), frames[0]);
    const want = CLIP_CONTACT[kind];
    const ref = sample([{ clip: want.clip, time: want.time, weight: 1 }]);
    const blade = (p) => { const v = [p.tip[0] - p.hand[0], p.tip[1] - p.hand[1], p.tip[2] - p.hand[2]]; const l = Math.hypot(...v); return v.map((x) => x / l); };
    const shownBlade = blade(frame), refBlade = blade(ref);
    const angle = Math.acos(Math.max(-1, Math.min(1, shownBlade.reduce((s, v, i) => s + v * refBlade[i], 0)))) * 180 / Math.PI;
    return { strike, kind, at: +at.toFixed(3), shown: `${frame.clip}@${frame.time}`, offContactDeg: +angle.toFixed(1) };
  });
  return { name, frames, snaps, contacts, footSlide: plantedFrames ? +(slidingFrames / plantedFrames).toFixed(3) : 0, footSpeed: plantedFrames ? +(slideSum / plantedFrames).toFixed(2) : 0 };
}

const hold = (from, to = Infinity) => (t, { room, player, now }) => {
  if (Math.abs(t - from) < DT / 2) beginAttack(room, player.id, now);
  if (Math.abs(t - to) < DT / 2) endAttack(room, player.id, now);
};

const technique = (id, from, to) => (t, { room, player, now }) => {
  if (Math.abs(t - from) < DT / 2) { player.technique = id; player.prowess = 100; requestSwordTechnique(room, player.id, true, now); }
  if (Math.abs(t - to) < DT / 2) requestSwordTechnique(room, player.id, false, now);
};

export const SCENARIOS = {
  'ten held chains': { seconds: 10 * 2.08 + 0.6, script: hold(0, 10 * 2.08 - 0.1) },
  'one tap': { seconds: 1.6, script: hold(0, 0.05) },
  'let go after two': { seconds: 2.6, script: hold(0, 0.8) },
  'guard into attack': { seconds: 2.4, script: (t, c) => { if (Math.abs(t) < DT / 2) setGuard(c.room, 'a', true, c.now); hold(0.8, 0.85)(t, c); } },
  'attack into guard mid-swing': { seconds: 2.0, script: (t, c) => { hold(0, 0.05)(t, c); if (Math.abs(t - 0.55) < DT / 2) setGuard(c.room, 'a', true, c.now); } },
  'plain run (baseline)': { seconds: 2.6, script: (t, c) => { c.player.input.forward = 1; } },
  'running chain': { seconds: 2.6, script: (t, c) => { c.player.input.forward = 1; hold(0, 2.0)(t, c); } },
  'sprinting chain': { seconds: 2.6, script: (t, c) => { c.player.input.forward = 1; c.player.input.sprint = true; hold(0.4, 2.4)(t, c); } },
  'jump mid-chain': { seconds: 2.6, script: (t, c) => { hold(0, 2.0)(t, c); c.player.input.jump = t > 0.5 && t < 0.6; } },
  'cast after a strike': { seconds: 2.0, script: (t, c) => { hold(0, 0.05)(t, c); if (Math.abs(t - 0.62) < DT / 2) tryCastSpell(c.room, 'a', { x: 0, y: 0, z: -1 }, c.now); } },
  'dash mid-chain': { seconds: 2.2, script: (t, c) => { hold(0, 1.6)(t, c); if (Math.abs(t - 0.6) < DT / 2) tryDash(c.room, 'a', { x: 0, z: -1 }, c.now); } },
  'parried': { seconds: 2.4, defender: true, script: (t, c) => { hold(0, 2.0)(t, c); if (Math.abs(t - 0.3) < DT / 2) setGuard(c.room, 'b', true, c.now); } },
  'blocked chain': { seconds: 2.6, defender: true, script: (t, c) => { if (Math.abs(t) < DT / 2) setGuard(c.room, 'b', true, c.now - 1); hold(0, 2.0)(t, c); } },
  // the Sword Techniques (main's rules, the sidecar's clips): out of rest, out of the guard, out of a cut, and back
  'riposte from rest': { seconds: 2.0, script: technique('rigid_riposte', 0.3, 0.35) },
  'riposte out of guard': { seconds: 2.2, script: (t, c) => { if (Math.abs(t) < DT / 2) setGuard(c.room, 'a', true, c.now); if (Math.abs(t - 0.75) < DT / 2) setGuard(c.room, 'a', false, c.now); technique('rigid_riposte', 0.8, 0.85)(t, c); } },
  'riposte after a cut': { seconds: 2.4, script: (t, c) => { hold(0, 0.05)(t, c); technique('rigid_riposte', 0.8, 0.85)(t, c); } },
  'whirl, two turns': { seconds: 2.6, script: technique('whirl_wind', 0.3, 1.0) },
  'whirl out of guard': { seconds: 2.4, script: (t, c) => { if (Math.abs(t) < DT / 2) setGuard(c.room, 'a', true, c.now); if (Math.abs(t - 0.75) < DT / 2) setGuard(c.room, 'a', false, c.now); technique('whirl_wind', 0.8, 0.9)(t, c); } },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = option('--scenario');
  const report = {};
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    if (only && only !== name) continue;
    const result = run(name, scenario);
    report[name] = { snaps: result.snaps, contacts: result.contacts, footSlide: result.footSlide, footSpeed: result.footSpeed, frames: option('--frames') ? result.frames : undefined };
    const missed = result.contacts.filter((c) => c.offContactDeg > 20);
    console.log(`${name}: ${result.snaps.length} snap frame(s); ${result.contacts.length} contacts, ${missed.length} not shown (blade > 20° off its authored contact); planted feet sliding > 1 m/s: ${(result.footSlide * 100).toFixed(0)}% of frames (mean ${result.footSpeed} m/s)`);
    for (const c of missed.slice(0, 6)) console.log(`   strike ${c.strike + 1} at ${c.at}s shown as ${c.shown}: ${c.offContactDeg}° off`);
    for (const s of result.snaps.slice(0, 12)) console.log(`   t=${s.t.toFixed(3)} ${s.from}→${s.to} tip moved ${s.step} m in a frame (authored ≤ ${s.authored})`);
  }
  const out = option('--json');
  if (out) writeFileSync(out, JSON.stringify(report, null, 1));
}
