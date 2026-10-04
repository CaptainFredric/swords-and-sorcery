// The first-person sword chain, drawn as one unbroken path of both arms. The chain's timing is the server's
// (SWORD_STRIKE_TIMES and MELEE_CONTACT in shared/src/combat.mjs): every key of a strike is placed from its contact,
// so each blade crosses the middle of the view at its contact, moving at its fastest, whatever those times become.
//
//   1. a compact forehand: a small cock out to the right (still in view, edge on), then down across to the low left;
//   2. the backhand: the forehand's momentum is carried on round the low left (the blade still moving, rebounding
//      and dipping, the body starting to unwind), and turns up into a rising cut across to the high right, leading
//      with the other edge (the hand turns with the blade as it goes, never twisting over on the spot);
//   3. the heavy third strike: the magic hand comes up from below and left onto the lower grip, the sword is raised
//      high on the right (out in front, not in the face), held a beat, then both hands drive it down through the
//      middle; the magic hand lets go early in the follow-through and the arms settle heavily back to rest.
//
// How the hand is turned is carried as a rotation: a quaternion per key, of the two ways its edge could lie (a
// double-edged blade leads with either) whichever turns the hand least over the whole chain, beginning and ending as
// the rig holds it at rest; so the sword never twists round in the hand between two frames. The body drives it: the shoulder and the arms' root travel with each cut and the view leans a degree or
// two, the blade trailing the hand a touch. The magic arm counterbalances the first two cuts (back with the
// forehand, across with the backhand, getting ready to reach) before it joins the grip.
//
// A chain can end after any strike (let go, and no more is committed); then the arms come home along a path of their
// own (recoveryPose), from where they were and as fast as they were moving. One that starts again before they are
// home takes over from them smoothly (blendPoses). swordArmIK.mjs turns the hands into arms.
// Pure: the time into the chain in; both arms' targets and the body's lean out.
//
// View space: +x right, +y up, -z ahead (the camera looks down -z).

import { MELEE_CONTACT, SWORD_CHAIN, SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';
import { normalize } from './swordArmIK.mjs';

const DEG = Math.PI / 180;

// the chain as the server runs it: the contacts, when each strike's swing begins, and when a held button starts
// the next chain (the third strike's contact and then a breath)
export const COMBO_CONTACTS = SWORD_STRIKE_TIMES;
export const COMBO_STRIKES = SWORD_CHAIN.starts;
export const COMBO_CYCLE = SWORD_STRIKE_TIMES[SWORD_STRIKE_TIMES.length - 1] + SWORD_CHAIN.restart;

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
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const smooth = (t) => { const s = Math.max(0, Math.min(1, t)); return s * s * (3 - 2 * s); };

// a direction by its turn to the left of straight ahead and its rise, in degrees
function dir(yaw, pitch) {
  const c = Math.cos(pitch * DEG);
  return [-Math.sin(yaw * DEG) * c, Math.sin(pitch * DEG), -Math.cos(yaw * DEG) * c];
}

// the edge that leads: the way the blade is going, taken square to the blade
function leading(lead, blade) {
  const b = normalize(blade);
  return normalize(sub(lead, scale(b, dot(lead, b))));
}

// --- the hand's turn as a quaternion [x, y, z, w]: the sword's own axes are its edge (x), blade (y) and flat (z)

function quatFromFrame(edge, blade) {
  const x = edge;
  const y = blade;
  const z = cross(x, y);
  const trace = x[0] + y[1] + z[2];
  let q;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    q = [(y[2] - z[1]) * s, (z[0] - x[2]) * s, (x[1] - y[0]) * s, 0.25 / s];
  } else if (x[0] > y[1] && x[0] > z[2]) {
    const s = 2 * Math.sqrt(1 + x[0] - y[1] - z[2]);
    q = [0.25 * s, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s];
  } else if (y[1] > z[2]) {
    const s = 2 * Math.sqrt(1 + y[1] - x[0] - z[2]);
    q = [(y[0] + x[1]) / s, 0.25 * s, (z[1] + y[2]) / s, (z[0] - x[2]) / s];
  } else {
    const s = 2 * Math.sqrt(1 + z[2] - x[0] - y[1]);
    q = [(z[0] + x[2]) / s, (z[1] + y[2]) / s, 0.25 * s, (x[1] - y[0]) / s];
  }
  return normalizeQuat(q);
}

function normalizeQuat(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  return n > 1e-12 ? q.map((v) => v / n) : [0, 0, 0, 1];
}

const dotQuat = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];

function rotateByQuat(q, v) {
  const [x, y, z, w] = q;
  const t = scale(cross([x, y, z], v), 2);
  return add(add(v, scale(t, w)), cross([x, y, z], t));
}

/** The hand's turn for this blade and edge, lying the nearer way to `near` (a quaternion): no half turns between keys. */
function nearerTurn(blade, edge, near) {
  const b = normalize(blade);
  const e = leading(edge, b);
  let q = quatFromFrame(e, b);
  if (near) {
    // the other way the edge could lie is half a turn about the blade: take whichever is nearer
    const flipped = quatFromFrame(scale(e, -1), b);
    if (Math.abs(dotQuat(flipped, near)) > Math.abs(dotQuat(q, near))) q = flipped;
    if (dotQuat(q, near) < 0) q = q.map((v) => -v);
  }
  return q;
}

// --- splines through keys: a cubic through each track, its tangents from the neighbouring keys (over time) unless
// a key says otherwise: `ease` scales them (0: it comes to a stop there, the hold before a heavy blow)

const TRACK = Object.freeze({
  wrist: (k) => k.wrist,
  turn: (k) => k.turn,
  shoulder: (k) => k.shoulder,
  body: (k) => k.body,
  look: (k) => k.look,
  grip: (k) => [k.grip],
  counter: (k) => k.counter,
});

function tangent(keys, k, track) {
  const key = keys[k];
  if (key.tangents?.[track]) return key.tangents[track];
  const pick = TRACK[track];
  const before = keys[Math.max(0, k - 1)];
  const after = keys[Math.min(keys.length - 1, k + 1)];
  const span = after.t - before.t;
  const ease = key.ease ?? 1;
  const a = pick(before);
  const b = pick(after);
  return span > 1e-9 ? a.map((v, c) => ((b[c] - v) / span) * ease) : a.map(() => 0);
}

function spline(keys, time, track) {
  const pick = TRACK[track];
  const n = keys.length;
  if (time <= keys[0].t) return pick(keys[0]);
  if (time >= keys[n - 1].t) return pick(keys[n - 1]);
  let i = 0;
  while (i < n - 2 && time > keys[i + 1].t) i += 1;
  const a = keys[i];
  const b = keys[i + 1];
  const h = b.t - a.t;
  const s = (time - a.t) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  const pa = pick(a);
  const pb = pick(b);
  const ma = tangent(keys, i, track);
  const mb = tangent(keys, i + 1, track);
  return pa.map((v, c) => (2 * s3 - 3 * s2 + 1) * v + (s3 - 2 * s2 + s) * h * ma[c] + (-2 * s3 + 3 * s2) * pb[c] + (s3 - s2) * h * mb[c]);
}

/**
 * A key of the chain at time t (s): where the sword wrist is, which way the blade points and which way its edge
 * leads; how far the shoulder has come with the body, how far the arms' root has been carried (`body`, metres), the
 * view's lean in degrees [pitch, roll, yaw], how much the magic hand holds the grip (0..1), and the magic arm's
 * counterbalance [drop, out, turn] (radians: the arm lowered, swung out to the left, the forearm turned).
 */
function key(t, wrist, blade, lead, { shoulder = [0, 0, 0], body = [0, 0, 0], look = [0, 0, 0], grip = 0, counter = [0, 0, 0], ease } = {}) {
  return { t, wrist, blade: normalize(blade), lead, shoulder, body, look, grip, counter, ease };
}

// how far apart two turns are (radians, either sign of either)
const apart = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(dotQuat(a, b))));

// Every key's turn. Each key's edge could lie either way (half a turn apart about the blade); of all the ways
// through, take the one that turns the hand least in all, beginning and ending as the rig holds it at rest (the
// first and last keys are the rest's own turn). Then each is signed the same way round as the one before, for the
// spline.
function settle(keys, restTurn) {
  const options = keys.map((k) => {
    const b = normalize(k.blade);
    const e = leading(k.lead, b);
    return [quatFromFrame(e, b), quatFromFrame(scale(e, -1), b)];
  });
  const fixed = (i) => (i === 0 || i === keys.length - 1 ? (apart(options[i][0], restTurn) < apart(options[i][1], restTurn) ? 0 : 1) : null);
  // cost[i][c]: the least turning to reach key i lying way c
  let cost = [0, 1].map((c) => (fixed(0) === null || fixed(0) === c ? 0 : Infinity));
  const back = [];
  for (let i = 1; i < keys.length; i += 1) {
    const next = [];
    const from = [];
    for (let c = 0; c < 2; c += 1) {
      if (fixed(i) !== null && fixed(i) !== c) { next.push(Infinity); from.push(0); continue; }
      const via = [0, 1].map((p) => cost[p] + apart(options[i - 1][p], options[i][c]));
      const best = via[0] <= via[1] ? 0 : 1;
      next.push(via[best]);
      from.push(best);
    }
    back.push(from);
    cost = next;
  }
  const way = [cost[0] <= cost[1] ? 0 : 1];
  for (let i = keys.length - 1; i > 0; i -= 1) way.unshift(back[i - 1][way[0]]);
  let near = null;
  keys.forEach((k, i) => {
    let q = options[i][way[i]];
    if (near && dotQuat(q, near) < 0) q = q.map((v) => -v);
    k.turn = q;
    near = q;
  });
  return Object.freeze(keys.map((k) => Object.freeze(k)));
}

const [C1, C2, C3] = SWORD_STRIKE_TIMES;
const { early: EARLY, late: LATE } = MELEE_CONTACT.window;
const REST_TURN = quatFromFrame(leading(REST_ARM.edge, REST_ARM.blade), normalize(REST_ARM.blade));
const rest = (t, extra = {}) => key(t, REST_ARM.wrist, REST_ARM.blade, REST_ARM.edge, extra);

// how long the heavy strike takes to settle after its contact (past the chain's cycle: a chain that starts again
// straight away takes over from the settle)
export const COMBO_END = C3 + 0.55;

export const COMBO = settle([
  rest(0, { ease: 0 }),
  // 1. the forehand: a small cock out to the right, the body coiling a touch (out in front, still in view)...
  key(C1 - 0.25, [0.46, -0.25, -0.6], dir(-38, 40), [-0.8, -0.3, -0.5],
    { shoulder: [0.03, 0.03, 0.03], body: [0.01, 0.005, 0.01], look: [0.4, 0.9, 0.9], counter: [-0.04, -0.05, 0] }),
  key(C1 - 0.16, [0.48, -0.23, -0.59], dir(-50, 33), [-0.8, -0.35, -0.45],
    { shoulder: [0.04, 0.03, 0.04], body: [0.015, 0.005, 0.012], look: [0.5, 1.1, 1.1], counter: [-0.06, -0.06, 0], ease: 0.35 }),
  // ...then it comes down across the front, the shoulder driving round behind it; through the middle at the contact
  key(C1 - EARLY, [0.44, -0.2, -0.63], dir(-25, 20), [-0.75, -0.3, -0.6],
    { shoulder: [-0.04, 0.03, -0.04], look: [0.2, 0.2, 0.3], counter: [0.06, 0.05, 0.04] }),
  key(C1, [0.3, -0.24, -0.65], dir(54, -12), [-0.65, -0.45, 0.6],
    { shoulder: [-0.13, 0.02, -0.11], body: [-0.02, -0.005, -0.01], look: [-0.5, -1.2, -1.2], counter: [0.26, 0.2, 0.08] }),
  key(C1 + LATE, [0.05, -0.27, -0.63], dir(70, -16), [-0.8, -0.5, 0.3],
    { shoulder: [-0.19, 0, -0.12], body: [-0.03, -0.01, -0.012], look: [-0.4, -1.4, -1.5], counter: [0.4, 0.28, 0.1] }),
  // 2. the backhand: the forehand's momentum carried on round the low left (the blade still moving, the body
  // starting to unwind), rebounding a little as it turns, then dipping to load...
  key(C1 + 0.22, [-0.03, -0.28, -0.62], dir(76, -17), [-0.8, -0.55, 0.2],
    { shoulder: [-0.21, -0.01, -0.11], body: [-0.03, -0.012, -0.01], look: [-0.2, -1.4, -1.6], counter: [0.42, 0.5, 0.09] }),
  key(C1 + 0.34, [-0.06, -0.25, -0.61], dir(73, 0), [0.75, 0.6, -0.2],
    { shoulder: [-0.21, -0.02, -0.1], body: [-0.028, -0.012, -0.008], look: [0.1, -1.3, -1.6], counter: [0.38, 0.8, 0.06] }),
  key(C2 - 0.24, [-0.06, -0.33, -0.61], dir(69, -19), [0.7, 0.65, -0.2],
    { shoulder: [-0.2, -0.03, -0.09], body: [-0.025, -0.012, -0.006], look: [0.3, -1.1, -1.5], counter: [0.3, 0.78, 0.04], ease: 0.6 }),
  // ...and rises across, the body unwinding behind it; through the middle at the contact
  key(C2 - EARLY, [-0.04, -0.31, -0.62], dir(64, -8), [0.75, 0.55, -0.35],
    { shoulder: [-0.15, 0, -0.1], body: [-0.01, -0.005, -0.01], look: [0.1, -0.3, -0.5], counter: [0.14, 0.66, 0] }),
  key(C2, [0.05, -0.28, -0.64], dir(-10, 35), [0.8, 0.5, 0.3],
    { shoulder: [-0.08, 0.03, -0.11], body: [0.015, 0.005, -0.01], look: [-0.3, 1.1, 1.0], counter: [0, 0.42, -0.06] }),
  key(C2 + LATE, [0.26, -0.15, -0.63], dir(-45, 40), [0.6, 0.35, 0.72],
    { shoulder: [0, 0.06, -0.07], body: [0.03, 0.01, -0.005], look: [0.1, 1.4, 1.3], counter: [-0.08, -0.18, -0.1] }),
  // it finishes high on the right, out in front; the magic hand is getting ready to reach
  key(C2 + 0.22, [0.33, -0.11, -0.62], dir(-48, 45), [-0.1, 0.4, 0.9],
    { shoulder: [0.01, 0.07, -0.05], body: [0.03, 0.012, 0], look: [0.4, 1.3, 1.2], grip: 0.3, counter: [-0.12, -0.24, -0.12] }),
  // 3. the heavy third strike: the magic hand takes the lower grip, and the sword goes up high on the right...
  key(C3 - 0.3, [0.3, -0.13, -0.6], dir(-22, 62), [-0.3, 0.1, -0.95],
    { shoulder: [0, 0.12, -0.05], body: [0.02, 0.015, 0.005], look: [1.1, 1.5, 1.1], grip: 1, counter: [-0.1, -0.14, -0.12] }),
  // ...held a beat, loaded...
  key(C3 - 0.14, [0.29, -0.11, -0.6], dir(-18, 68), [-0.25, -0.2, -0.95],
    { shoulder: [0, 0.14, -0.05], body: [0.02, 0.018, 0.01], look: [1.4, 1.6, 1.2], grip: 1, counter: [-0.1, -0.14, -0.12], ease: 0 }),
  // ...then driven down through the middle, the whole body behind it
  key(C3 - 0.07, [0.21, -0.1, -0.63], dir(-5, 63), [-0.1, -0.6, -0.8],
    { shoulder: [-0.04, 0.1, -0.08], body: [0.01, 0.005, -0.01], look: [0.8, 0.9, 0.6], grip: 1, counter: [-0.1, -0.14, -0.12] }),
  key(C3, [0.11, -0.23, -0.66], dir(9, -10), [-0.2, -0.95, 0.2],
    { shoulder: [-0.13, 0, -0.15], body: [-0.01, -0.02, -0.02], look: [-2.2, -1.6, -1.0], grip: 1, counter: [-0.05, -0.08, -0.08] }),
  key(C3 + 0.08, [0.07, -0.48, -0.73], dir(10, -40), [-0.1, -0.7, 0.7],
    { shoulder: [-0.18, -0.05, -0.13], body: [-0.02, -0.03, -0.02], look: [-1.8, -1.6, -1.1], grip: 0.6, counter: [0.04, 0.02, 0] }),
  // the magic hand lets go as the blow spends itself low, and the arms come heavily back to rest
  key(C3 + 0.22, [0.06, -0.56, -0.68], dir(12, -34), [0.2, 0.2, 0.95],
    { shoulder: [-0.17, -0.06, -0.1], body: [-0.015, -0.03, -0.012], look: [-1.1, -1.1, -0.9], counter: [0.06, 0.04, 0.02], ease: 0.3 }),
  key(C3 + 0.38, [0.2, -0.42, -0.62], dir(8, 5), [0.3, 0.9, -0.2],
    { shoulder: [-0.06, -0.02, -0.04], body: [-0.005, -0.01, -0.004], look: [-0.3, -0.3, -0.3], counter: [0.02, 0.01, 0] }),
  rest(COMBO_END, { ease: 0 }),
], REST_TURN);

// Sundering, every strike of the chain is a slam: the heavy strike's blow, both hands on the grip from the first,
// each timed to its own contact, the blade biting into the ground a beat before it is hauled straight back up
// (the edge carried round with it, no turn of the hand) for the next. After the last, the heavy strike's own settle.
const HELD = [-0.1, -0.14, -0.12];
function slam(c, { raise = 0.3, grip = 1, first = false } = {}) {
  return [
    // (up and back from the ground: the edge carried round with the blade, never turned over)
    ...(first ? [] : [key(c - 0.4, [0.2, -0.3, -0.64], dir(-12, 15), [-0.15, -0.95, -0.25],
      { shoulder: [-0.06, 0.06, -0.08], body: [0.005, 0.005, -0.005], look: [0.3, 0.4, 0.3], grip: 1, counter: HELD })]),
    key(c - raise, [0.3, -0.13, -0.6], dir(-22, 62), [-0.3, 0.1, -0.95],
      { shoulder: [0, 0.12, -0.05], body: [0.02, 0.015, 0.005], look: [1.1, 1.5, 1.1], grip, counter: HELD }),
    key(c - 0.14, [0.29, -0.11, -0.6], dir(-18, 68), [-0.25, -0.2, -0.95],
      { shoulder: [0, 0.14, -0.05], body: [0.02, 0.018, 0.01], look: [1.4, 1.6, 1.2], grip: 1, counter: HELD, ease: 0 }),
    key(c - 0.07, [0.21, -0.1, -0.63], dir(-5, 63), [-0.1, -0.6, -0.8],
      { shoulder: [-0.04, 0.1, -0.08], body: [0.01, 0.005, -0.01], look: [0.8, 0.9, 0.6], grip: 1, counter: HELD }),
    key(c, [0.11, -0.23, -0.66], dir(9, -10), [-0.2, -0.95, 0.2],
      { shoulder: [-0.13, 0, -0.15], body: [-0.01, -0.02, -0.02], look: [-2.2, -1.6, -1.0], grip: 1, counter: [-0.05, -0.08, -0.08] }),
  ];
}
// the blade in the ground, a beat (the view jolted with it)
const bite = (c) => [
  key(c + 0.08, [0.07, -0.48, -0.73], dir(10, -40), [-0.1, -0.7, 0.7],
    { shoulder: [-0.18, -0.05, -0.13], body: [-0.02, -0.035, -0.02], look: [-2.4, -1.6, -1.1], grip: 1, counter: [0, -0.04, -0.04] }),
  key(c + 0.2, [0.07, -0.52, -0.72], dir(11, -42), [-0.1, -0.7, 0.7],
    { shoulder: [-0.18, -0.06, -0.12], body: [-0.02, -0.04, -0.018], look: [-2.0, -1.4, -1.0], grip: 1, counter: [0, -0.04, -0.04], ease: 0.2 }),
];

export const SLAM = settle([
  rest(0, { ease: 0 }),
  ...slam(C1, { raise: 0.24, grip: 0.8, first: true }), ...bite(C1),
  ...slam(C2), ...bite(C2),
  ...slam(C3),
  // the last spends itself low, the magic hand letting go, and the arms come heavily back to rest
  ...COMBO.filter((k) => k.t > C3).map(({ turn, ...k }) => k),
], REST_TURN);

// the kinetic chain's delays (seconds): the body leads the hand by a beat, and the blade trails it a touch
export const CHAIN = Object.freeze({ body: 0.03, blade: 0.012 });
// where the magic hand comes up from to take the grip (and falls back to), relative to the grip: below and left
const REACH_FROM = Object.freeze([-0.12, -0.2, 0.05]);
// how far the magic arm's shoulder comes forward and in when both hands are on the sword
const OFF_SHOULDER = Object.freeze([0.22, 0.05, -0.18]);
// the lower hand's place on the grip: this far along the blade below the sword hand's grip (m), off to its left
const LOWER_GRIP = Object.freeze({ below: 0.165, aside: 0.012 });

// where the sword hand's fist closes on the grip, from the wrist and the blade's frame (measured from the rig)
function gripPoint(wrist, blade, edge) {
  const flat = cross(blade, edge);
  return add(add(add(wrist, scale(blade, 0.076)), scale(edge, -0.053)), scale(flat, 0.018));
}

/**
 * The magic hand on the lower grip, below the sword hand: where its wrist goes and how the hand lies (its fingers
 * wrap the grip the way the sword hand's do, its palm against it). Its fist sits clear below the sword hand's, over
 * the lower grip and the pommel, so the two read as two hands on one handle.
 */
export function offHandOnGrip({ wrist, blade, edge }) {
  const b = normalize(blade);
  const e = leading(edge, b);
  const flat = cross(b, e);
  // the sword hand's fingers and palm in the blade's frame (the rig at rest): the magic hand's lie the same way
  const fingers = normalize(add(add(scale(b, 0.851), scale(e, -0.477)), scale(flat, 0.219)));
  const palm = normalize(add(add(scale(b, 0.227), scale(e, -0.041)), scale(flat, -0.973)));
  const hold = add(sub(gripPoint(wrist, b, e), scale(b, LOWER_GRIP.below)), scale(flat, -LOWER_GRIP.aside));
  return { wrist: sub(hold, scale(fingers, 0.094)), aim: fingers, roll: palm, shoulder: OFF_SHOULDER };
}

// the pose from a chain's keys at `time`
function poseFrom(keys, time) {
  const wrist = spline(keys, time, 'wrist');
  const turn = normalizeQuat(spline(keys, time - CHAIN.blade, 'turn'));
  const lead = time + CHAIN.body;
  return {
    wrist,
    turn,
    shoulder: spline(keys, lead, 'shoulder'),
    body: spline(keys, lead, 'body'),
    look: spline(keys, lead, 'look'),
    grip: Math.max(0, Math.min(1, spline(keys, time, 'grip')[0])),
    counter: spline(keys, lead, 'counter'),
  };
}

// the pose as the arms take it: the sword arm's target, the magic hand's (on the grip, or swooping to or from it)
function present(raw, time) {
  const blade = rotateByQuat(raw.turn, [0, 1, 0]);
  const edge = rotateByQuat(raw.turn, [1, 0, 0]);
  const arm = { wrist: raw.wrist, blade, edge, shoulder: raw.shoulder };
  const grip = smooth(raw.grip);
  let offHand = null;
  if (grip > 1e-3) {
    const onGrip = offHandOnGrip(arm);
    // it swoops up into the grip from below and to the left (and drops away the same way), never sliding in flat
    const swoop = (1 - grip) ** 2;
    offHand = { ...onGrip, wrist: add(onGrip.wrist, scale(REACH_FROM, swoop)), weight: grip };
  }
  const [pitch, roll, yaw] = raw.look.map((d) => d * DEG);
  const strike = time >= COMBO_STRIKES[2] ? 2 : time >= COMBO_STRIKES[1] ? 1 : 0;
  return { arm, offHand, look: { pitch, roll, yaw }, body: raw.body, counter: raw.counter, strike, time, raw };
}

/**
 * The chain `time` seconds in (0 to COMBO_END; at rest outside it): the sword arm's target { wrist, blade, edge,
 * shoulder } at full weight, the magic hand's { wrist, aim, roll, shoulder, weight } on the grip (null while it keeps
 * to itself), the view's lean { pitch, roll, yaw } in radians, the arms' root carried by the body (`body`), the
 * magic arm's counterbalance (`counter`), and which strike it is (0, 1, 2).
 */
export function comboPose(time) {
  if (!Number.isFinite(time)) return null;
  const t = Math.max(0, Math.min(COMBO_END, time));
  return present(poseFrom(COMBO, t), t);
}

/** The Sundering chain `time` seconds in: every strike a slam (SLAM), posed as comboPose's. */
export function slamPose(time) {
  if (!Number.isFinite(time)) return null;
  const t = Math.max(0, Math.min(COMBO_END, time));
  return present(poseFrom(SLAM, t), t);
}

/** Author a separate sword path with the same continuous hand frame and natural recovery as the ordinary chain. */
export function createSwordPath(keyframes) {
  const keys = keyframes.map(({ t, wrist, blade, edge, ...motion }) => key(t, wrist, blade, edge, motion));
  const homeTurn = quatFromFrame(leading(keys[0].lead, keys[0].blade), normalize(keys[0].blade));
  const authored = settle(keys, homeTurn);
  const sample = (time) => Number.isFinite(time)
    ? present(poseFrom(authored, Math.max(0, Math.min(authored.at(-1).t, time))), time) : null;
  return Object.freeze({
    sample,
    recover(from, elapsed, seconds = 0.3) {
      if (!Number.isFinite(from) || !Number.isFinite(elapsed)) return sample(0);
      if (elapsed >= seconds) return sample(0);
      const start = poseFrom(authored, from), home = poseFrom(authored, 0);
      const moving = velocityAt(authored, from);
      if (dotQuat(start.turn, home.turn) < 0) home.turn = home.turn.map(v => -v);
      const zero = Object.fromEntries(Object.entries(TRACK).map(([name, pick]) => [name, pick(home).map(() => 0)]));
      const recovery = [{ t: 0, ...start, tangents: moving }, { t: seconds, ...home, tangents: zero }];
      const raw = Object.fromEntries(Object.keys(TRACK).map(name => [name, spline(recovery, Math.max(0, elapsed), name)]));
      raw.turn = normalizeQuat(raw.turn); raw.grip = 0;
      return present(raw, from);
    },
  });
}

// --- going home: when a chain ends before its heavy strike (or is broken off), the arms come back to rest from
// wherever they are, carrying on as they were moving and easing into rest (a real path, not a fade)

// how long the way home takes, and where it passes on the way: after the forehand the blade swings back up through
// the front; after the backhand it comes down from the high right
export const RECOVERY = Object.freeze({
  seconds: 0.46,
  quickSeconds: 0.3,
  // (strike: the last strike that landed)
  via: Object.freeze([
    Object.freeze({ at: 0.45, wrist: [0.22, -0.37, -0.63], blade: dir(38, 12), lead: [0.7, 0.6, -0.2], shoulder: [-0.08, 0, -0.06], look: [0.2, -0.4, -0.5], counter: [0.05, 0.05, 0.03] }),
    Object.freeze({ at: 0.45, wrist: [0.4, -0.22, -0.63], blade: dir(-10, 58), lead: [-0.4, -0.5, -0.75], shoulder: [0.01, 0.03, -0.03], look: [0.4, 0.6, 0.5], counter: [-0.04, -0.05, -0.04] }),
  ]),
});

// how fast each track is moving at `time` along a chain (a short look either side)
function velocityAt(keys, time) {
  const h = 1 / 240;
  const a = poseFrom(keys, time - h);
  const b = poseFrom(keys, time + h);
  const rate = (x, y) => x.map((v, i) => (y[i] - v) / (2 * h));
  if (dotQuat(a.turn, b.turn) < 0) b.turn = b.turn.map((v) => -v);
  return {
    wrist: rate(a.wrist, b.wrist),
    turn: rate(a.turn, b.turn),
    shoulder: rate(a.shoulder, b.shoulder),
    body: rate(a.body, b.body),
    look: rate(a.look, b.look),
    grip: [(b.grip - a.grip) / (2 * h)],
    counter: rate(a.counter, b.counter),
  };
}

const recoveries = new Map();

/** The keys of the way home from `from` seconds into a chain (built once for each place it can start from). */
function recoveryKeys(from, quick, slammed) {
  const id = `${from.toFixed(4)}:${quick}:${slammed}`;
  if (recoveries.has(id)) return recoveries.get(id);
  const chain = slammed ? SLAM : COMBO;
  const start = poseFrom(chain, from);
  const moving = velocityAt(chain, from);
  const seconds = quick ? RECOVERY.quickSeconds : RECOVERY.seconds;
  // (all but the magic hand's hold carry on as they were going: a reach for the grip stops as soon as there is no
  // strike to reach for)
  const first = { t: 0, ...start, tangents: { ...moving, grip: [Math.min(0, moving.grip[0])] } };
  const keys = [first];
  // (the heavy strike's own settle is its way home; a broken-off chain goes straight there, a little quicker)
  const landed = SWORD_STRIKE_TIMES.filter((contact) => from >= contact - 1e-9).length;
  // (a slam is already on its way back up from the ground: straight home from there)
  const via = !quick && !slammed && landed >= 1 && landed <= 2 ? RECOVERY.via[landed - 1] : null;
  if (via) {
    // the way the edge lies at the passing point: whichever makes the least turning overall, out and home
    const one = nearerTurn(via.blade, via.lead, start.turn);
    const other = nearerTurn(via.blade, scale(via.lead, -1), start.turn);
    const turn = apart(start.turn, one) + apart(one, REST_TURN) <= apart(start.turn, other) + apart(other, REST_TURN) ? one : other;
    // (a magic hand already on the grip lets go of it all the way home, not in a snatch)
    keys.push({ t: seconds * via.at, wrist: via.wrist, turn, shoulder: via.shoulder, body: [0, 0, 0], look: via.look, grip: start.grip * 0.35, counter: via.counter });
  }
  // home: the rest's own turn (as the rig holds it), from whichever side the hand has come round
  const home = dotQuat(REST_TURN, keys[keys.length - 1].turn) < 0 ? REST_TURN.map((v) => -v) : REST_TURN;
  keys.push({ t: seconds, wrist: [...REST_ARM.wrist], turn: home, shoulder: [0, 0, 0], body: [0, 0, 0], look: [0, 0, 0], grip: 0, counter: [0, 0, 0],
    tangents: { wrist: [0, 0, 0], turn: [0, 0, 0, 0], shoulder: [0, 0, 0], body: [0, 0, 0], look: [0, 0, 0], grip: [0], counter: [0, 0, 0] } });
  const frozen = Object.freeze(keys.map((k) => Object.freeze(k)));
  recoveries.set(id, frozen);
  if (recoveries.size > 64) recoveries.delete(recoveries.keys().next().value);
  return frozen;
}

/**
 * The arms on their way home after a chain ended `from` seconds in, `elapsed` seconds ago: a pose like comboPose's,
 * or null once they are at rest. quick: the chain was broken off (a parry, a wall), not let go. slam: it was a
 * Sundering chain (SLAM).
 */
export function recoveryPose(from, elapsed, { quick = false, slam: slammed = false } = {}) {
  if (!Number.isFinite(from) || !Number.isFinite(elapsed)) return null;
  // after the heavy strike the chain's own settle is the way home
  if (!quick && from >= C3 - 1e-9) return from + elapsed >= COMBO_END ? null : (slammed ? slamPose : comboPose)(from + elapsed);
  const keys = recoveryKeys(Math.max(0, Math.min(COMBO_END, from)), quick, Boolean(slammed));
  const last = keys[keys.length - 1].t;
  if (elapsed >= last) return null;
  const t = Math.max(0, elapsed);
  const raw = {
    wrist: spline(keys, t, 'wrist'),
    turn: normalizeQuat(spline(keys, t, 'turn')),
    shoulder: spline(keys, t, 'shoulder'),
    body: spline(keys, t, 'body'),
    look: spline(keys, t, 'look'),
    grip: Math.max(0, Math.min(1, spline(keys, t, 'grip')[0])),
    counter: spline(keys, t, 'counter'),
  };
  return present(raw, from);
}

/**
 * One pose giving way to another: `w` 0 is all `a`, 1 all `b` (the hand's turn is blended the short way round). For
 * a chain that starts again while the arms are still coming home from the last one.
 */
export function blendPoses(a, b, w) {
  if (!a) return b;
  if (!b) return a;
  const t = smooth(w);
  const qb = dotQuat(a.raw.turn, b.raw.turn) < 0 ? b.raw.turn.map((v) => -v) : b.raw.turn;
  const raw = {
    wrist: mix(a.raw.wrist, b.raw.wrist, t),
    turn: normalizeQuat(mix(a.raw.turn, qb, t)),
    shoulder: mix(a.raw.shoulder, b.raw.shoulder, t),
    body: mix(a.raw.body, b.raw.body, t),
    look: mix(a.raw.look, b.raw.look, t),
    grip: a.raw.grip + (b.raw.grip - a.raw.grip) * t,
    counter: mix(a.raw.counter, b.raw.counter, t),
  };
  return present(raw, b.time);
}

// the magic arm's counterbalance as bone turns: lowered (about the view's x: a turn about +x lifts it), swung out
// to the left (about its y), and the forearm turned (about its own length)
export function counterRotations([drop, out, turn], weight = 1) {
  if (!(weight > 1e-3)) return [];
  return [
    { bone: 'upper_arm.L', axis: [1, 0, 0], angle: -drop * weight },
    { bone: 'upper_arm.L', axis: [0, 1, 0], angle: out * weight },
    { bone: 'forearm.L', axis: [0, 1, 0], angle: turn * weight, space: 'local' },
  ];
}
