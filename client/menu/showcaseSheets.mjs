// The Armory's three ultimates, performed. Chosen in the Armory, Sunder All That Rusts, the Blazing Vortex and Spells &
// Chivalry are each shown as they are in a fight, for a few seconds: the same clips at the same timing, the same
// effects and the same sounds, staged on the green where he stands. Written like the round's fight sheets
// (tour/tourFights.mjs): pure, time in, poses and cues out; ArmoryShowcase.mjs makes them real. Nothing is simulated:
// who is struck, and when, is written down here.
//
// Everything is in the Spellblade's own frame where he stands (the menu's character root): right +x, up +y, forward
// -z. He faces the camera, so his right is the left of the screen. `turn`: which way he faces in that frame (0
// forward, +pi/2 to his left), and a rival's `heading` the same for the rival. A point is [x, y, z].
//
// The hero's pose: { plan (an animator plan: a clip, or the layered plan a knight in Spells & Chivalry has),
// gesture (or null: the Armory's own arm gestures, armoryPreview.mjs, laid over the plan), crouch, rotations,
// reactions (a flinch or a guard taking a blow, at its moment), turn, lift, steel: { strength, ripple } (Sheathe in
// Steel: how hard the plate is, seconds since it was called), sunder (the blade's heat), vortex: { share, spinning,
// lit } (the burning blade), palm: { spell, amount } (a prepared spell held up in the palm), dizzy (0..1) }.
//
// `level`: how much louder its sounds are played than another knight's at that distance, so that each sits beside
// the card cues (armorySound.mjs) at the loudness they do (measured offline through the engine: the loudest 400 ms
// of each within 1.5 dB of its card's cue).
//
// A rival's pose: { hidden } or { x, z, lift, heading, tumble (leaning back off his feet, radians), plan, death,
// reactions }.

import { SWORD_CHAIN, SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';
import { MOVEMENT } from '../../shared/src/movement.mjs';
import { SPELLS } from '../../shared/src/spells.mjs';
import { ULTIMATES, vortexWindup } from '../../shared/src/ultimates.mjs';
import { resolveSpellbladeAnimationPlan } from '../game/spellbladeAnimationPlan.mjs';
import { armoryPose } from './armoryPreview.mjs';
import { clipAt, keyed } from './tour/tourFights.mjs';

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (t) => { const s = clamp01(t); return s * s * (3 - 2 * s); };
const between = (t, a, b) => clamp01((t - a) / (b - a));
// the way a knight at `from` faces to look at `to` (both [x, z] in the frame)
const facing = (from, to) => Math.atan2(-(to[0] - from[0]), -(to[1] - from[1]));

// --- Sunder All That Rusts -------------------------------------------------------------------------------------------
// The brace and the slam as a knight Sundering plays them (spellbladeAnimationPlan.mjs): the heavy strike's own swing
// (Slash_3), its raise played through the brace, then driven down. Two things differ, both for the ground: in a fight
// the slam's blow is struck where that swing meets a knight (level with a chest), and the host splits the ground
// along the aim; here there is nobody, so the swing is driven on down until the blade is in the turf. And at the top
// he holds a breath as the bell rings and the steel takes its heat (in a fight the slam follows the bell at once).
// Then the blade stays where it struck while his weight goes into it, and the ground splits.
const SLAM_CONTACT = SWORD_STRIKE_TIMES[2] - SWORD_CHAIN.starts[2];
// Slash_3's raise at its height (the blade overhead and back), and where its blade comes down to the ground
const SLAM_RAISED = 0.22;
const SLAM_GROUND = 0.5;
const SUNDER_BEATS = Object.freeze({
  commit: ULTIMATES.sunder.startupSec,                          // the brace done: the bell, the heat in the blade
  drive: ULTIMATES.sunder.startupSec + 0.2,                     // the held breath at the top, then down
  contact: ULTIMATES.sunder.startupSec + 0.2 + 0.22,            // (the swing's own pace, and a little more)
  rise: 1.6,                                                    // the blade comes up out of the ground
  rest: 2.25,                                                   // standing again
  cool: 2.6,
  duration: 3.2,
});
// he turns side on as he braces (to his left: facing the right of the screen, a little away), so the slam is seen
// from the side and its split runs away across the green
const SUNDER_TURN = 1.9;

const SUNDER = Object.freeze({
  id: 'sunder',
  duration: SUNDER_BEATS.duration,
  // the light in his palm meanwhile: low, so the heat is the blade's
  palmLight: { color: 0xd79a45, intensity: 0.5 },
  level: 1,
  beats: SUNDER_BEATS,
  hero(t) {
    const b = SUNDER_BEATS;
    let time;
    if (t < b.commit) time = SLAM_RAISED * smooth(t / b.commit);
    else if (t < b.drive) time = SLAM_RAISED;
    else if (t < b.contact) time = SLAM_RAISED + (SLAM_GROUND - SLAM_RAISED) * ((t - b.drive) / (b.contact - b.drive)) ** 1.3;
    else if (t < b.rise) time = SLAM_GROUND;
    else time = SLAM_GROUND + (t - b.rise) * 0.3;
    const plan = t < b.rest ? { clip: 'Slash_3', time, loop: false } : { clip: 'Idle', time: t, loop: true };
    // the weight: coiled at the top, then down into the blow, and up again
    const crouch = keyed([[0, 0], [b.commit, 0.12], [b.drive, 0.16], [b.contact, 0.2], [b.contact + 0.08, 0.36], [b.rise, 0.28], [b.rest, 0.04], [b.rest + 0.35, 0]], t);
    const turn = keyed([[0, 0], [0.45, SUNDER_TURN], [b.rest, SUNDER_TURN], [b.duration - 0.15, 0]], t);
    return { plan, gesture: null, crouch, rotations: [], reactions: [], turn, lift: 0, sunder: t >= b.commit && t < b.cool };
  },
  rivals: [],
  cues: [
    { at: 0, type: 'brace' },
    { at: SUNDER_BEATS.commit, type: 'bell' },
    { at: SUNDER_BEATS.drive, type: 'swing', heavy: true },
    { at: SUNDER_BEATS.contact, type: 'slam' },
  ],
  // what the camera keeps in view: him with his blade up and where it comes down, from low (the split runs on out of
  // the frame)
  framing: {
    shots: [{ at: 0, points: [[0, 0, 0.8], [-Math.sin(SUNDER_TURN) * 1.3, -Math.cos(SUNDER_TURN) * 1.3, 0.5]], rise: 0.95, aim: 0.95 }],
    weight: [[0, 0], [0.55, 1], [SUNDER_BEATS.duration - 0.75, 1], [SUNDER_BEATS.duration, 0]],
  },
});

// --- Blazing Vortex --------------------------------------------------------------------------------------------------
// As a knight lights one (RemotePlayers.mjs): a hop, the sword raised and lit, a turn gathering through the startup
// to the spin's own pace (vortexWindup), the blade held out level and the whole knight going round at 3.25 turns a
// second, a ball of the Vortex's fire leaving it on a completed turn. In a fight it goes for eight seconds; here for
// about one, then it winds down, timed so that he comes round to face the front as it stops, and a moment's dizziness.
const VORTEX = ULTIMATES.vortex;
const VORTEX_RATE = 2 * Math.PI * VORTEX.balanced.revPerSec;
const VORTEX_SLOW = 0.45;
// the spin at full pace this long: with the windup's turn and the slowing, five turns in all, so he stops facing front
const VORTEX_TURNS = 5;
const VORTEX_FULL = (VORTEX_TURNS - 1) / VORTEX.balanced.revPerSec - VORTEX_SLOW / 2;
const VORTEX_BEATS = Object.freeze({
  commit: VORTEX.startupSec,
  slow: VORTEX.startupSec + VORTEX_FULL,
  stop: VORTEX.startupSec + VORTEX_FULL + VORTEX_SLOW,
  steady: VORTEX.startupSec + VORTEX_FULL + VORTEX_SLOW + 0.9,
  duration: VORTEX.startupSec + VORTEX_FULL + VORTEX_SLOW + 1.25,
});

/** How far round the Vortex has turned him at t (radians, to his left). */
export function vortexTurn(t) {
  const b = VORTEX_BEATS;
  if (t <= b.commit) return vortexWindup({ commitAt: b.commit }, t);
  const windup = 2 * Math.PI;
  if (t <= b.slow) return windup + VORTEX_RATE * (t - b.commit);
  const tau = Math.min(VORTEX_SLOW, t - b.slow);
  return windup + VORTEX_RATE * (b.slow - b.commit) + VORTEX_RATE * (tau - (tau * tau) / (2 * VORTEX_SLOW));
}

// the hop as it is lit: thrown up as a knight is (ULTIMATES.vortex.hop), falling back as anyone does
function vortexHop(t) {
  return Math.max(0, VORTEX.hop * t - 0.5 * MOVEMENT.gravity * t * t);
}

// where its fire goes: off into the background on the turns it is thrown (one a turn in a fight; here now and then),
// each somewhere else, rising over the town (in his frame: behind him is +z)
const VORTEX_THROWS = Object.freeze([
  { turn: 2, to: [-7, 5.5, 17] },
  { turn: 3, to: [6.5, 3.2, 15] },
  { turn: 4, to: [-2.5, 7, 21] },
]);
// the moment the spin completes its nth turn (the windup is the first)
function turnAt(n) {
  let lo = VORTEX_BEATS.commit;
  let hi = VORTEX_BEATS.stop;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (vortexTurn(mid) < n * 2 * Math.PI) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

const VORTEX_SHOWCASE = Object.freeze({
  id: 'vortex',
  duration: VORTEX_BEATS.duration,
  palmLight: { color: 0xff7a2a, intensity: 0.5 },
  level: 1.6,
  beats: VORTEX_BEATS,
  hero(t) {
    const b = VORTEX_BEATS;
    const share = clamp01(t / b.commit);
    const spinning = t >= b.commit && t < b.stop;
    let plan;
    if (t < b.stop) {
      const ultimateState = { id: 'vortex', phase: t < b.commit ? 'startup' : 'active', commitAt: b.commit, until: b.stop };
      plan = resolveSpellbladeAnimationPlan({ state: 'vortex', player: { ultimateState }, serverNow: t, localTime: t });
    } else {
      plan = { clip: 'Idle', time: t, loop: true };
    }
    // dizzy as it runs out (seen only, as in a fight), steadying by the end
    const dizzy = between(t, b.stop - 0.2, b.stop) * (1 - between(t, b.steady - 0.4, b.steady));
    return {
      plan, gesture: null, crouch: keyed([[0, 0], [0.06, 0.18], [0.14, 0], [b.stop - 0.1, 0], [b.stop + 0.1, 0.12], [b.steady, 0]], t),
      rotations: [], reactions: [], turn: vortexTurn(t), lift: vortexHop(t), dizzy,
      vortex: t < b.stop + 0.4 ? { share, spinning, lit: t < b.stop } : null,
    };
  },
  rivals: [],
  cues: [
    { at: 0, type: 'ignite' },
    { at: VORTEX_BEATS.commit, type: 'catch' },
    ...Array.from({ length: VORTEX_TURNS - 1 }, (_, i) => ({ at: turnAt(i + 2) - 0.12, type: 'whoosh' })),
    ...VORTEX_THROWS.map((fire) => ({ at: turnAt(fire.turn), type: 'launch', to: fire.to, spell: VORTEX.balanced.fire })),
    { at: VORTEX_BEATS.slow, type: 'windDown' },
  ].sort((a, b) => a.at - b.at),
  framing: {
    shots: [{ at: 0, points: [[0, 0, 1.4]], aim: 1.2 }],
    weight: [[0, 0], [0.5, 1], [VORTEX_BEATS.duration - 0.7, 1], [VORTEX_BEATS.duration, 0]],
  },
});

// --- Spells & Chivalry -----------------------------------------------------------------------------------------------
// Six beats. 1: the fist to the chest, and Sheathe in Steel takes the plate. 2: the guard raised, and held from then
// on. 3: a knight comes at him from his left; his blow lands on the guard (a clash, no harm), while the Spellblade's
// own guarded cuts go on through it: two, and the knight is thrown down. 4: another from his right, met with a Gale.
// 5: a Fireball and a Frostfire, out past the camera on either side. 6: the guard held, the palm turning through the
// prepared spells. His body is posed by the game's own Chivalry composition (the guard and the cut, or the guard and
// the cast, at once: spellbladeAnimationPlan.mjs), from a knight's state written down for each moment.
const GUARD_AT = 0.95;
const A_FROM = [-4.8, -1.0];
const A_AT = [-1.75, -0.35];
// (the second comes from behind him on his right: in front of him on that side is the market stall; and the Gale
// throws him on away into the green, not across toward the Armory's panel)
const B_FROM = [3.6, 3.6];
const B_AT = [1.6, 1.25];
const CHIVALRY_BEATS = Object.freeze({
  steel: 0.06,
  guard: GUARD_AT,
  aRun: 1.3, aArrive: 2.05,
  aSwing: 2.05,
  cut: 2.2,                                                     // his guarded chain: two strikes
  bRun: 3.35, bArrive: 4.3,
  gale: 4.05,
  fireball: 5.6,
  frostfire: 6.5,
  mastery: 7.3,
  steelFades: 8.6,
  duration: 10.6,
});
const B = CHIVALRY_BEATS;
const A_CLASH = B.aSwing + (SWORD_STRIKE_TIMES[1] - SWORD_CHAIN.starts[1]);
const CUTS = Object.freeze([B.cut + SWORD_STRIKE_TIMES[0], B.cut + SWORD_STRIKE_TIMES[1]]);
const CUT_ENDS = B.cut + SWORD_CHAIN.starts[2];
const GALE_RELEASE = B.gale + SPELLS.gale.gatherSec;
const FIREBALL_RELEASE = B.fireball + SPELLS.fireball.gatherSec;
const FROSTFIRE_RELEASE = B.frostfire + SPELLS.frostfire.gatherSec;
// where the knights are knocked to, and when
const A_DOWN = [-3.5, -0.15];
const B_BLOWN = [4.3, 3.4];
const B_HIT = GALE_RELEASE + 0.08;
// the two spells come out at the viewer and go by the camera, one either side of it, never through it: `past` is
// where each passes the camera ([right, up] of it, metres), `yaw` how he turns to throw it (in his frame, roughly
// toward that side of the camera)
export const CHIVALRY_SHOTS = Object.freeze({
  fireball: Object.freeze({ yaw: 0.22, past: Object.freeze([1.5, 0.2]) }),
  frostfire: Object.freeze({ yaw: -0.2, past: Object.freeze([-1.3, 0.85]) }),
});
// the palm through the prepared spells, once each and round again, as he stands at the end
export const PALM_CYCLE = Object.freeze(['fireball', 'frostfire', 'gale']);
const PALM_EACH = 1.0;

const towardA = facing([0, 0], A_AT);
const towardB = facing([0, 0], B_AT);

// the knight's state at t, as the game would have it, for the animation plan
function chivalryKnight(t) {
  const casts = [[B.gale, SPELLS.gale.gatherSec], [B.fireball, SPELLS.fireball.gatherSec], [B.frostfire, SPELLS.frostfire.gatherSec]];
  const cast = casts.find(([at, gather]) => t >= at && t < at + gather + 0.35);
  return {
    alive: true,
    ultimateState: { id: 'chivalry', phase: 'active', commitAt: 0, until: B.duration + 1 },
    guarding: t >= GUARD_AT,
    attackActive: t >= B.cut && t < CUT_ENDS,
    attackStartedAt: B.cut,
    castPoseStartAt: cast ? cast[0] : undefined,
    castPoseUntil: cast ? cast[0] + cast[1] + 0.35 : undefined,
    velocity: { x: 0, y: 0, z: 0 },
  };
}

function palmAt(t) {
  if (t < B.mastery) return null;
  const age = t - B.mastery;
  const index = Math.floor(age / PALM_EACH);
  const within = age - index * PALM_EACH;
  // each comes up, holds, and gives way to the next (the last fading as the showcase ends)
  const amount = smooth(within / 0.22) * (1 - smooth((within - (PALM_EACH - 0.2)) / 0.2)) * (1 - between(t, B.duration - 0.35, B.duration));
  return { spell: PALM_CYCLE[index % PALM_CYCLE.length], amount };
}

const CHIVALRY = Object.freeze({
  id: 'chivalry',
  duration: B.duration,
  palmLight: { color: 0x8fd3ff, intensity: 0.8 },
  level: 1.45,
  beats: B,
  hero(t) {
    // beat 1 is the Armory's own Steel gesture (the fist to the chest, on the Steel cue's contacts), then the guard
    const steelGesture = t < GUARD_AT + 0.2 ? armoryPose('steel', t) : null;
    if (steelGesture && t > GUARD_AT) {
      const fade = 1 - between(t, GUARD_AT, GUARD_AT + 0.2);
      for (const arm of ['spell', 'sword']) if (steelGesture[arm]) steelGesture[arm] = { ...steelGesture[arm], weight: steelGesture[arm].weight * fade };
      steelGesture.fist *= fade;
    }
    const plan = t < GUARD_AT
      ? { clip: 'Idle', time: t, loop: true }
      : resolveSpellbladeAnimationPlan({ state: 'guard', player: chivalryKnight(t), serverNow: t, localTime: t });
    const turn = keyed([
      [1.45, 0], [1.95, towardA], [CUTS[1] + 0.25, towardA], [B.gale - 0.1, towardB], [GALE_RELEASE + 0.45, towardB],
      [B.fireball - 0.05, CHIVALRY_SHOTS.fireball.yaw], [FIREBALL_RELEASE + 0.3, CHIVALRY_SHOTS.fireball.yaw],
      [B.frostfire - 0.05, CHIVALRY_SHOTS.frostfire.yaw], [FROSTFIRE_RELEASE + 0.3, CHIVALRY_SHOTS.frostfire.yaw], [B.mastery + 0.3, 0],
    ], t);
    // his guard taking the first knight's blow: the block's flinch, pushed from that knight's side
    const push = { x: -A_AT[0], z: -A_AT[1] };
    const reactions = t >= A_CLASH ? [{ kind: 'block', at: A_CLASH, push, strength: 1 }] : [];
    const steelAge = t - B.steel;
    const strength = steelAge < 0 ? 0 : smooth(steelAge / 0.1) * (1 - between(t, B.steelFades, B.steelFades + 1.2));
    return {
      plan, gesture: steelGesture, crouch: 0, rotations: [], reactions, turn, lift: 0,
      steel: { strength, ripple: steelAge >= 0 ? steelAge : null },
      palm: palmAt(t),
    };
  },
  rivals: [
    // the first: runs in from his left, swings into his guard, is cut twice and thrown down
    (t) => {
      if (t < B.aRun - 0.05 || t > B.duration - 0.05) return { hidden: true };
      const arrive = between(t, B.aRun, B.aArrive);
      const knocked = between(t, CUTS[1], CUTS[1] + 0.5);
      const run = t < B.aArrive;
      const out = 1 - (1 - knocked) ** 2;
      const x = run ? A_FROM[0] + (A_AT[0] - A_FROM[0]) * arrive : A_AT[0] + (A_DOWN[0] - A_AT[0]) * out;
      const z = run ? A_FROM[1] + (A_AT[1] - A_FROM[1]) * arrive : A_AT[1] + (A_DOWN[1] - A_AT[1]) * out;
      const plan = clipAt([
        [-99, 'Run', { loop: true }],
        [B.aSwing, 'Slash_2'],
        [CUTS[0], 'Stagger'],
        [CUTS[1], 'Death'],
      ], t);
      const blow = (at, strike) => ({ kind: 'hit', at, push: { x: A_AT[0], z: A_AT[1] }, strength: 1, strike });
      return {
        x, z, lift: Math.sin(Math.PI * knocked) * 0.28, heading: facing(A_AT, [0, 0]), plan,
        death: t >= CUTS[1] ? { age: t - CUTS[1], push: { x: -1, z: 0 } } : null,
        reactions: CUTS.filter((at) => t >= at).map((at, i) => blow(at, i)),
      };
    },
    // the second: comes in from his right, raising his sword, and is blown away by the Gale
    (t) => {
      if (t < B.bRun - 0.05 || t > B.duration - 0.05) return { hidden: true };
      const arrive = between(t, B.bRun, B.bArrive);
      const flung = between(t, B_HIT, B_HIT + 0.8);
      const before = t < B_HIT;
      const out = 1 - (1 - flung) ** 2;
      const x = before ? B_FROM[0] + (B_AT[0] - B_FROM[0]) * arrive : B_AT[0] + (B_BLOWN[0] - B_AT[0]) * out;
      const z = before ? B_FROM[1] + (B_AT[1] - B_FROM[1]) * arrive : B_AT[1] + (B_BLOWN[1] - B_AT[1]) * out;
      const plan = clipAt([
        [-99, 'Run', { loop: true }],
        [B.bArrive - 0.25, 'Slash_1', { rate: 0.6 }],
        [B_HIT, 'Air'],
        [B_HIT + 0.78, 'Death'],
      ], t);
      // thrown off his feet: lifted, leaning back as he goes, and down on his back
      const tumble = t < B_HIT ? 0 : keyed([[B_HIT, 0], [B_HIT + 0.35, 0.75], [B_HIT + 0.78, 1.2], [B_HIT + 1.1, 0]], t);
      return {
        x, z, lift: Math.sin(Math.PI * flung) * 1.0, tumble, heading: facing(B_AT, [0, 0]), plan,
        death: t >= B_HIT + 0.78 ? { age: t - (B_HIT + 0.78), push: { x: 1, z: 0 } } : null,
        reactions: t >= B_HIT ? [{ kind: 'hit', at: B_HIT, push: { x: B_AT[0], z: B_AT[1] }, strength: 1.2 }] : [],
      };
    },
  ],
  cues: [
    { at: B.steel, type: 'steel' },
    { at: B.aSwing, type: 'swing', by: 0 },
    { at: B.cut, type: 'swing', by: 'hero' },
    { at: A_CLASH, type: 'clash', rival: 0 },
    { at: CUTS[0], type: 'hit', rival: 0 },
    { at: B.cut + SWORD_CHAIN.starts[1], type: 'swing', by: 'hero' },
    { at: CUTS[1], type: 'hit', rival: 0, heavy: true },
    { at: CUTS[1] + 0.5, type: 'fall', rival: 0 },
    { at: B.gale, type: 'gather', spell: 'gale' },
    { at: GALE_RELEASE, type: 'gale', rival: 1 },
    { at: B_HIT + 0.78, type: 'fall', rival: 1 },
    { at: B.fireball, type: 'gather', spell: 'fireball' },
    { at: FIREBALL_RELEASE, type: 'cast', spell: 'fireball', ...CHIVALRY_SHOTS.fireball },
    { at: B.frostfire, type: 'gather', spell: 'frostfire' },
    { at: FROSTFIRE_RELEASE, type: 'cast', spell: 'frostfire', ...CHIVALRY_SHOTS.frostfire },
  ].sort((a, b) => a.at - b.at),
  // him and the first knight, then across to him and the second, then him alone as he throws his spells; for the
  // last beat it comes back in on him and his palm
  framing: {
    shots: [
      { at: 0, points: [[0, 0, 0.7], [A_AT[0], A_AT[1], 0.6]] },
      { at: B.bRun + 0.3, points: [[0, 0, 0.7], [B_AT[0], B_AT[1], 0.6], [(B_AT[0] + B_BLOWN[0]) / 2, (B_AT[1] + B_BLOWN[1]) / 2, 0.5]] },
      { at: B.fireball - 0.2, points: [[0, 0, 1.2]] },
    ],
    weight: [[0, 0], [1.3, 1], [B.mastery - 0.1, 1], [B.mastery + 1.0, 0]],
  },
});

export const ARMORY_SHOWCASES = Object.freeze({ sunder: SUNDER, vortex: VORTEX_SHOWCASE, chivalry: CHIVALRY });

/** Whether `id` is performed as a showcase (an ultimate) rather than a short gesture. */
export function hasShowcase(id) {
  return Object.hasOwn(ARMORY_SHOWCASES, id);
}

/** How long the Armory shows a choice: a showcase its own length, anything else the short gesture (armoryPreview). */
export function armoryShowcaseSeconds(id, gestureSec) {
  return hasShowcase(id) ? ARMORY_SHOWCASES[id].duration : gestureSec;
}

// the shots eased between: each takes over from the one before across this long around its moment
const SHOT_EASE = 0.45;

/**
 * Which of a showcase's shots holds at t, and how far it has gone over to the next: { from, to, share } (indices into
 * framing.shots).
 */
export function framingAt(framing, t) {
  const shots = framing.shots;
  let index = 0;
  for (let i = 1; i < shots.length; i += 1) if (t >= shots[i].at - SHOT_EASE) index = i;
  if (index === 0) return { from: 0, to: 0, share: 0 };
  const share = smooth((t - (shots[index].at - SHOT_EASE)) / (2 * SHOT_EASE));
  return { from: index - 1, to: index, share };
}

/**
 * The shot that keeps a showcase in view, in world space: looking the same way as `look` ([x, z], level), pulled back
 * and slid across until every point ([x, z, reach] in the world) stands in the `clear` part of the screen (shares of
 * its width, left to right: clear of the Armory's panel). As the round frames its fights (tour/tourCamera.mjs
 * fightShot), for any number of points. Returns { camera, target, fov } as menuShots.mjs has them.
 */
export function showcaseShot(points, look, { aspect = 4 / 3, clear = [0.45, 0.97], fov = 40, minBack = 4.2, maxBack = 14, rise = 1.35, risePerBack = 0.06, aim = 1.05 } = {}) {
  const length = Math.hypot(look[0], look[1]) || 1;
  const l = [look[0] / length, look[1] / length];
  const right = [-l[1], l[0]];
  const middle = points.reduce((sum, [x, z]) => [sum[0] + x / points.length, sum[1] + z / points.length], [0, 0]);
  const spots = points.map(([x, z, reach = 0.6]) => ({
    across: (x - middle[0]) * right[0] + (z - middle[1]) * right[1],
    along: (x - middle[0]) * l[0] + (z - middle[1]) * l[1],
    reach,
  }));
  // a point `across` right of the middle, `depth` ahead of a camera slid `slide` to the right, shows at
  // (across - slide) / (depth * spread) from the centre of the screen (-1 left .. 1 right)
  const spread = Math.tan((fov * Math.PI) / 360) * aspect;
  const [from, to] = clear.map((share) => share * 2 - 1);
  let back = minBack;
  let slide = 0;
  for (;;) {
    let least = -Infinity;
    let most = Infinity;
    for (const { across, along, reach } of spots) {
      const depth = Math.max(0.5, back + along);
      least = Math.max(least, across + reach - to * depth * spread);
      most = Math.min(most, across - reach - from * depth * spread);
    }
    slide = (least + most) / 2;
    if (least <= most || back >= maxBack) break;
    back = Math.min(maxBack, back + 0.1);
  }
  const x = middle[0] + right[0] * slide;
  const z = middle[1] + right[1] * slide;
  return {
    camera: [x - l[0] * back, rise + back * risePerBack, z - l[1] * back],
    target: [x, aim, z],
    fov,
  };
}

// (the game's own moments the sheets are written against, for the tests)
export const SHOWCASE_TIMING = Object.freeze({ SHOT_EASE, SLAM_CONTACT, SLAM_RAISED, SLAM_GROUND, VORTEX_RATE, A_CLASH, CUTS, GALE_RELEASE, B_HIT, turnAt });
