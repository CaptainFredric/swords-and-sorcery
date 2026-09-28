// The first-person sword combo, drawn as one unbroken path of the sword hand over the whole chain (the server's
// strikes land 0.4, 1.1 and 1.8 s after the button goes down): fast, fast, heavy.
//
//   1. a compact forehand, from a small cock on the right, down across to the low left, and it stays there;
//   2. a backhand rising from exactly there, the wrist rolled over, back up across to the high right;
//   3. the finisher: the magic hand joins the grip below the sword hand, the blade is chambered over the right
//      shoulder, and both hands drive it down through the middle; the magic hand lets go as it recovers.
//
// Nothing goes back to rest between strikes: each follow-through is the next one's windup. The shoulder travels with
// the body (in with each cut, back as it gathers), the view turns a degree or two with it, and the blade is kept out
// of the eye's plane (never laid flat across the view up close). swordArmIK.mjs turns the hands into arms.
// Pure: the time into the chain in; both arms' targets and the view's lean out.
//
// View space: +x right, +y up, -z ahead (the camera looks down -z).

import { normalize } from './swordArmIK.mjs';

const DEG = Math.PI / 180;

// the chain as the server runs it: strikes land at these times, and a held button starts the next chain 0.28 s after
// the last (so a chain comes round every 2.08 s)
export const COMBO_CONTACTS = Object.freeze([0.4, 1.1, 1.8]);
export const COMBO_CYCLE = 2.08;
// each strike's own stretch of the chain (for the swing sounds and anything that asks which strike it is)
export const COMBO_STRIKES = Object.freeze([0, 0.72, 1.44]);

// the sword hand at rest: the first-person Idle with its neutral grip (measured from the rig)
export const REST_ARM = Object.freeze({
  wrist: Object.freeze([0.398, -0.31, -0.649]),
  blade: Object.freeze([-0.172, 0.815, -0.554]),
  edge: Object.freeze([0.94, 0.304, 0.155]),
});

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// the edge that leads: the way the blade is going, taken square to the blade
function leading(lead, blade) {
  const b = normalize(blade);
  return normalize(sub(lead, scale(b, dot(lead, b))));
}

/**
 * A key of the chain at time t (s): where the sword wrist is, which way the blade points, which way its edge leads,
 * how far the shoulder has come with the body, how much the magic hand holds the grip (0..1), and the view's lean in
 * degrees [pitch, roll, yaw].
 */
function key(t, wrist, blade, lead, { shoulder = [0, 0, 0], grip = 0, look = [0, 0, 0] } = {}) {
  return Object.freeze({ t, wrist, blade: normalize(blade), edge: leading(lead, blade), shoulder, grip, look });
}

export const COMBO = Object.freeze([
  key(0, REST_ARM.wrist, REST_ARM.blade, REST_ARM.edge),
  // 1. the forehand: a small cock up on the right, the body coiling a touch...
  // (the blade laid back out to the right, not stood up in front of the eye)
  key(0.15, [0.47, -0.22, -0.55], [0.8, 0.45, 0.2], [-0.2, -0.2, -0.95], { shoulder: [0.02, 0.06, -0.02], look: [0.3, 0.8, 0.6] }),
  // ...then its point sweeps across the front and down, the shoulder coming round behind it; it lands in the middle
  key(0.31, [0.3, -0.2, -0.64], [0.3, 0.45, -0.84], [-0.9, -0.3, -0.2], { shoulder: [-0.06, 0.04, -0.08] }),
  key(0.4, [0.14, -0.25, -0.66], [-0.45, 0.2, -0.87], [-0.7, -0.65, 0.3], { shoulder: [-0.14, 0.03, -0.12], look: [-0.4, -1.2, -1.1] }),
  key(0.5, [0.02, -0.33, -0.62], [-0.85, -0.3, -0.43], [0.1, -0.95, 0.3], { shoulder: [-0.2, 0, -0.12], look: [-0.3, -1.3, -1.4] }),
  // it stays low on the left, the wrist rolling over for the way back
  key(0.64, [-0.01, -0.35, -0.6], [-0.8, -0.4, -0.45], [0.45, 0.7, -0.5], { shoulder: [-0.21, -0.01, -0.11], look: [0, -1.1, -1.4] }),
  // 2. the backhand: a small dip, then up and across, the body unwinding the other way
  key(0.84, [-0.05, -0.39, -0.57], [-0.78, -0.28, -0.56], [0.45, 0.85, -0.25], { shoulder: [-0.22, -0.02, -0.1], look: [0.2, -1, -1.5] }),
  key(1, [0.06, -0.3, -0.64], [-0.45, 0.35, -0.82], [0.7, 0.7, 0], { shoulder: [-0.16, 0.01, -0.12] }),
  key(1.1, [0.19, -0.2, -0.65], [0.45, 0.45, -0.77], [0.8, 0.4, 0.45], { shoulder: [-0.1, 0.03, -0.11], look: [-0.3, 1, 0.9] }),
  key(1.22, [0.32, -0.1, -0.58], [0.72, 0.6, -0.35], [0.6, 0.3, 0.75], { shoulder: [-0.02, 0.06, -0.06], look: [0, 1.3, 1.3] }),
  // it stays high on the right; the magic hand comes across to the grip
  key(1.36, [0.3, -0.06, -0.55], [0.55, 0.78, -0.3], [-0.3, 0.1, -0.95], { shoulder: [-0.02, 0.07, -0.05], grip: 0.5, look: [0.4, 1.2, 1.2] }),
  // 3. the finisher: chambered over the right shoulder in both hands...
  key(1.58, [0.22, -0.06, -0.54], [0.45, 0.85, 0.2], [-0.35, 0.1, -0.93], { shoulder: [-0.06, 0.1, -0.06], grip: 1, look: [1.2, 1.6, 1.3] }),
  // ...and driven down through the middle, the whole body behind it
  key(1.7, [0.2, -0.1, -0.6], [0.35, 0.55, -0.76], [-0.6, -0.6, -0.5], { shoulder: [-0.1, 0.06, -0.1], grip: 1, look: [0.2, 0.6, 0.3] }),
  key(1.8, [0.12, -0.24, -0.66], [-0.62, -0.12, -0.78], [-0.35, -0.9, 0.25], { shoulder: [-0.16, 0, -0.16], grip: 1, look: [-2.2, -1.8, -1.2] }),
  key(1.92, [-0.06, -0.43, -0.58], [-0.72, -0.62, -0.3], [0.2, -0.55, 0.8], { shoulder: [-0.2, -0.04, -0.13], grip: 1, look: [-1.4, -1.6, -1.3] }),
  // and it comes back to rest as the magic hand lets go
  key(COMBO_CYCLE, REST_ARM.wrist, REST_ARM.blade, REST_ARM.edge),
]);

// a cubic through the keys (tangents from the neighbours, over time), so the hand never stops at a key: the chain
// flows, and it is quick where the keys are far apart and slow where they are close
function hermite(keys, time, pick) {
  const n = keys.length;
  let i = 0;
  while (i < n - 2 && time > keys[i + 1].t) i += 1;
  const a = keys[i];
  const b = keys[i + 1];
  const tangent = (k) => {
    const before = keys[Math.max(0, k - 1)];
    const after = keys[Math.min(n - 1, k + 1)];
    const span = after.t - before.t;
    const pa = pick(before);
    const pb = pick(after);
    return span > 1e-9 ? pa.map((v, c) => (pb[c] - v) / span) : pa.map(() => 0);
  };
  const h = b.t - a.t;
  const s = Math.max(0, Math.min(1, (time - a.t) / h));
  const s2 = s * s;
  const s3 = s2 * s;
  const pa = pick(a);
  const pb = pick(b);
  const ma = tangent(i);
  const mb = tangent(i + 1);
  return pa.map((v, c) => (2 * s3 - 3 * s2 + 1) * v + (s3 - 2 * s2 + s) * h * ma[c] + (-2 * s3 + 3 * s2) * pb[c] + (s3 - s2) * h * mb[c]);
}

// where the sword hand's fist closes on the grip, from the wrist and the blade's frame (measured from the rig)
function gripPoint(wrist, blade, edge) {
  const flat = cross(blade, edge);
  return add(add(add(wrist, scale(blade, 0.076)), scale(edge, -0.053)), scale(flat, 0.018));
}

// the kinetic chain's delays (seconds): the body ahead of the hand, the blade behind it
export const CHAIN = Object.freeze({ body: 0.03, blade: 0.035 });
// where the magic hand comes up from to take the grip (and falls back to), relative to the grip: below, left, nearer
const REACH_FROM = Object.freeze([-0.1, -0.17, 0.07]);

// how far the magic arm's shoulder comes forward and in when both hands are on the sword
const OFF_SHOULDER = Object.freeze([0.24, 0.06, -0.2]);

/**
 * The magic hand on the grip, below the sword hand: where its wrist goes and how the hand lies (its fingers wrap the
 * grip the way the sword hand's do, its palm against it).
 */
export function offHandOnGrip({ wrist, blade, edge }) {
  const b = normalize(blade);
  const e = leading(edge, b);
  const flat = cross(b, e);
  // the sword hand's fingers and palm in the blade's frame (the rig at rest): the magic hand's lie the same way
  const fingers = normalize(add(add(scale(b, 0.851), scale(e, -0.477)), scale(flat, 0.219)));
  const palm = normalize(add(add(scale(b, 0.227), scale(e, -0.041)), scale(flat, -0.973)));
  // a hand's width below the sword hand's fist, and the wrist a palm's length back from there; the body squares up
  // to the blow, bringing the magic arm's shoulder forward and in so it can reach
  const hold = sub(gripPoint(wrist, b, e), scale(b, 0.13));
  return { wrist: sub(hold, scale(fingers, 0.094)), aim: fingers, roll: palm, shoulder: OFF_SHOULDER };
}

/**
 * The combo `time` seconds into a chain (taken round the cycle): the sword arm's target { wrist, blade, edge, shoulder }
 * at full weight, the magic hand's { wrist, aim, roll, weight } on the grip (weight 0 when it keeps to itself), the
 * view's lean { pitch, roll, yaw } in radians, and which strike it is (0, 1, 2).
 */
export function comboPose(time) {
  if (!Number.isFinite(time)) return null;
  const at = (offset) => ((((time + offset) % COMBO_CYCLE) + COMBO_CYCLE) % COMBO_CYCLE);
  const t = at(0);
  // a whip, not a lever: the body leads the cut by a beat, the hand follows, and the blade trails the hand
  const lead = at(CHAIN.body);
  const trail = at(-CHAIN.blade);
  const wrist = hermite(COMBO, t, (k) => k.wrist);
  const blade = normalize(hermite(COMBO, trail, (k) => k.blade));
  const edge = leading(hermite(COMBO, trail, (k) => k.edge), blade);
  const shoulder = hermite(COMBO, lead, (k) => k.shoulder);
  const [pitch, roll, yaw] = hermite(COMBO, lead, (k) => k.look).map((d) => d * DEG);
  // the magic hand's hold eases on and off (never overshooting)
  const hold = Math.max(0, Math.min(1, hermite(COMBO, t, (k) => [k.grip])[0]));
  const grip = hold * hold * (3 - 2 * hold);
  const strike = t >= COMBO_STRIKES[2] ? 2 : t >= COMBO_STRIKES[1] ? 1 : 0;
  const arm = { wrist, blade, edge, shoulder };
  let offHand = null;
  if (grip > 1e-3) {
    const onGrip = offHandOnGrip(arm);
    // it swoops up into the grip from below (and drops away the same way when it lets go), never sliding in flat
    const swoop = (1 - grip) ** 2;
    offHand = { ...onGrip, wrist: add(onGrip.wrist, scale(REACH_FROM, swoop)), weight: grip };
  }
  return { arm, offHand, look: { pitch, roll, yaw }, strike, time: t };
}

// the magic arm drops and draws aside while the sword works, so the follow-through is not hidden behind it
export const OFF_HAND_CLEAR = Object.freeze([
  { bone: 'upper_arm.L', axis: [1, 0, 0], angle: -0.28 },
  { bone: 'upper_arm.L', axis: [0, 1, 0], angle: -0.18 },
]);
