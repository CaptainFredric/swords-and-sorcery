// The menu knight's answers to a choice on the front door, as short performances: he gathers himself (a crouch, the
// blade drawn back), snaps into the gesture, holds it with a little life, finishes with a flourish and settles back
// into his stance. Written as keys the way an animator blocks a shot: where the sword hand goes and which way the
// blade points (the arm solver puts the arm there, swordArmIK.mjs), where the spell hand goes, how the body bends.
// Pure: the performance and the time into it, in; what to pose, out.
//
// Root space of the third-person rig: +x the knight's right, +y up, -z the way he faces. His shoulders are at
// y 1.40 (x ±0.28), his chest at 1.23, his head at 1.61.

const blade = (wrist, aim, roll = [1, 0, 0]) => Object.freeze({ wrist, aim, roll });

// ease: how a key is reached from the one before it
//   smooth  eased in and out;  snap  quick with a small overshoot;  swift  fast out, eased in;  hold  unchanged
const key = (at, ease, pose) => Object.freeze({ at, ease, ...pose });

export const PERFORMANCES = Object.freeze({
  // Solo: the blade raised upright before his face (the fist at his chest, clear of the scarf), then lowered to the
  // side in salute
  salute: Object.freeze({
    duration: 2.7,
    breathe: 0.012,
    keys: Object.freeze([
      key(0, 'smooth', { crouch: 0, body: {}, sword: null }),
      key(0.32, 'smooth', {
        crouch: 0.22, body: { spine: 0.06, chestTurn: 0.16, head: 0.05 },
        sword: blade([0.4, 0.9, 0.02], [0.25, -0.55, 0.8]),
      }),
      key(0.64, 'snap', {
        crouch: 0, body: { spine: -0.02, head: -0.1 },
        sword: blade([0.05, 1.33, -0.32], [0, 1, -0.12]),
      }),
      key(1.75, 'hold', {
        crouch: 0, body: { spine: -0.02, head: -0.1 },
        sword: blade([0.05, 1.33, -0.32], [0, 1, -0.12]),
      }),
      key(2.1, 'swift', {
        crouch: 0.05, body: { chest: 0.06, head: 0.12 },
        sword: blade([0.42, 0.98, -0.42], [0.35, -0.5, -0.8], [0, 1, 0]),
      }),
      key(2.7, 'smooth', { crouch: 0, body: {}, sword: null }),
    ]),
  }),
  // the party modes: gathered low, then the sword thrust up over his sword side, chest out, looking up at it, the
  // other fist on his hip; a moment's pride, then a wide sweep back down
  rally: Object.freeze({
    duration: 2.9,
    breathe: 0.015,
    keys: Object.freeze([
      key(0, 'smooth', { crouch: 0, body: {}, sword: null, spell: null }),
      key(0.26, 'smooth', {
        crouch: 0.32, body: { spine: 0.1, chestTurn: 0.2, head: 0.1 },
        sword: blade([0.38, 0.84, 0.14], [0.1, -0.45, 0.89]),
        spell: blade([-0.36, 1.0, -0.12], [0.3, -0.6, -0.7]),
      }),
      key(0.56, 'snap', {
        crouch: 0, body: { spine: -0.1, chest: -0.06, chestTurn: -0.1, head: -0.28, headTurn: 0.22 },
        sword: blade([0.46, 2.02, -0.14], [0.45, 0.87, -0.2]),
        spell: blade([-0.3, 0.98, 0.02], [0.6, -0.4, 0.3]),
      }),
      key(2.0, 'hold', {
        crouch: 0, body: { spine: -0.1, chest: -0.06, chestTurn: -0.1, head: -0.28, headTurn: 0.22 },
        sword: blade([0.46, 2.0, -0.14], [0.45, 0.87, -0.2]),
        spell: blade([-0.3, 0.98, 0.02], [0.6, -0.4, 0.3]),
      }),
      key(2.4, 'swift', {
        crouch: 0.1, body: { spine: 0.04 },
        sword: blade([0.45, 1.05, -0.45], [0.3, -0.35, -0.9], [0, 1, 0]),
        spell: null,
      }),
      key(2.9, 'smooth', { crouch: 0, body: {}, sword: null, spell: null }),
    ]),
  }),
  // the Armory: the blade laid across both hands before him, turned to catch the light
  present: Object.freeze({
    duration: 2.6,
    breathe: 0.008,
    keys: Object.freeze([
      key(0, 'smooth', { crouch: 0, body: {}, sword: null, spell: null }),
      key(0.5, 'smooth', {
        crouch: 0.08, body: { chest: 0.05, head: 0.2 },
        sword: blade([0.24, 1.22, -0.34], [-1, 0.05, -0.12], [0, 1, 0]),
        spell: blade([-0.22, 1.12, -0.4], [0, 1, 0]),
      }),
      key(1.25, 'smooth', {
        crouch: 0.08, body: { chest: 0.05, head: 0.22, headTurn: -0.12 },
        sword: blade([0.24, 1.24, -0.36], [-1, 0.08, -0.12], [0, 0.7, -0.7]),
        spell: blade([-0.22, 1.12, -0.42], [0, 1, 0]),
      }),
      key(1.95, 'smooth', {
        crouch: 0.08, body: { chest: 0.05, head: 0.2 },
        sword: blade([0.24, 1.22, -0.34], [-1, 0.05, -0.12], [0, 1, 0]),
        spell: blade([-0.22, 1.12, -0.4], [0, 1, 0]),
      }),
      key(2.6, 'smooth', { crouch: 0, body: {}, sword: null, spell: null }),
    ]),
  }),
});

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const EASE = {
  smooth: (t) => t * t * (3 - 2 * t),
  swift: (t) => 1 - (1 - t) ** 3,
  hold: (t) => t * t * (3 - 2 * t),
  // quick, overshooting a little and settling (easeOutBack)
  snap: (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2,
};

const mix = (a, b, t) => a + (b - a) * t;
const mixVec = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
const unit = (v) => {
  const n = Math.hypot(...v);
  return n > 1e-9 ? v.map((x) => x / n) : v;
};

// an arm's channel between two keys: fading in from (or out to) the clip's own arm when a key has none
function armBetween(a, b, t) {
  if (!a && !b) return null;
  if (a && b) {
    return { weight: 1, target: { wrist: mixVec(a.wrist, b.wrist, t), aim: unit(mixVec(a.aim, b.aim, t)), roll: unit(mixVec(a.roll, b.roll, t)) } };
  }
  const only = a ?? b;
  return { weight: a ? 1 - t : t, target: { wrist: only.wrist, aim: only.aim, roll: only.roll } };
}

const BODY = [
  // [channel, bone, root-space axis]: + spine/chest/head bow forward, + turns toward his sword side
  ['spine', 'spine', [-1, 0, 0]],
  ['chest', 'chest', [-1, 0, 0]],
  ['chestTurn', 'chest', [0, -1, 0]],
  ['head', 'head', [-1, 0, 0]],
  ['headTurn', 'head', [0, -1, 0]],
];

/**
 * The performance `kind` at `elapsed` seconds: { crouch, rotations, sword, spell } where sword/spell are
 * { target, weight } for the arm solver (or null), or null once it is over.
 */
export function performanceAt(kind, elapsed) {
  const performance = PERFORMANCES[kind];
  if (!performance || !(elapsed >= 0) || elapsed >= performance.duration) return null;
  const keys = performance.keys;
  let i = 0;
  while (i < keys.length - 2 && elapsed >= keys[i + 1].at) i += 1;
  const a = keys[i];
  const b = keys[i + 1];
  const t = EASE[b.ease](clamp01((elapsed - a.at) / (b.at - a.at)));
  const crouch = Math.max(0, mix(a.crouch ?? 0, b.crouch ?? 0, t));
  const rotations = [];
  for (const [channel, bone, axis] of BODY) {
    const angle = mix(a.body?.[channel] ?? 0, b.body?.[channel] ?? 0, t);
    if (Math.abs(angle) > 1e-4) rotations.push({ bone, axis, angle });
  }
  const sword = armBetween(a.sword, b.sword, t);
  const spell = armBetween(a.spell, b.spell, t);
  // a held pose still breathes: the blade rises and falls a finger's width
  if (sword && performance.breathe) sword.target.wrist = [sword.target.wrist[0], sword.target.wrist[1] + Math.sin(elapsed * 4.2) * performance.breathe * sword.weight, sword.target.wrist[2]];
  return { crouch, rotations, sword, spell };
}
