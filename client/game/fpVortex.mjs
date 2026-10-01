// The Blazing Vortex in my own arms. The view never turns with the spin (the aim stays where I put it); the spin is
// implied by the sword: both hands on the grip, the blade going round as the server's blade goes round
// (shared/src/ultimates.mjs vortexAngle), so each time the real blade passes in front of me I see it cross the view
// from right to left, at the moment it can cut whoever stands there, and then it is carried on round out of sight
// (the hands drop below the view on the left and come up again on the right) for the next pass.
//
//   startup: the sword comes up in front, the magic hand joins the grip (the star, and the blade lit, come here:
//   GameRuntime), then the hands are carried off to the left as the turn gathers;
//   active: pass after pass, at the spin's own rate; the view leans a degree or so with each (never the aim);
//   after: the arms come home (WeaponView lets go of the pose).
//
// A pose is what fpSlash.mjs's are: the sword arm's target { wrist, blade, edge, shoulder }, the magic hand on the
// lower grip, the view's lean { pitch, roll, yaw } (radians), how far the body carries the arms. Pure.
//
// View space: +x right, +y up, -z ahead (the camera looks down -z). `rel`: the blade's turn from straight ahead,
// radians, + to the left (the way it spins).

import { REST_ARM, offHandOnGrip } from './fpSlash.mjs';
import { normalize } from './swordArmIK.mjs';

const DEG = Math.PI / 180;

export const FP_VORTEX = Object.freeze({
  frontDeg: 105,          // the blade is in front (seen) within this far either side of straight ahead
  droopDeg: 8,            // as the real blade droops
  reach: 0.36,            // how far the hands swing out to each side (m)
  low: -0.3,              // the hands' height through a pass
  dip: 0.55,              // how far they drop below the view going round behind
  behindDropDeg: 55,      // and how far the point drops there
  roll: 1.4,              // the view's lean with each pass (degrees)
  raiseBy: 0.32,          // the share of the startup by which the sword is up and both hands are on it
  carryFrom: 0.34,        // from here to `carryBy` the raised sword is carried into the turn
  carryBy: 0.56,
});

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const smooth = (t) => { const s = Math.max(0, Math.min(1, t)); return s * s * (3 - 2 * s); };
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

// a direction by its turn to the left of straight ahead and its rise (radians)
function direction(turn, rise) {
  const c = Math.cos(rise);
  return [-Math.sin(turn) * c, Math.sin(rise), -Math.cos(turn) * c];
}

// the sword arm with the blade turned `rel` from straight ahead. The sword goes round as one thing (the hand's turn
// never jumps): in front it is level and sweeping; round behind, the hands dip below the view and the point drops
// (down past the body, never back through the eyes), and it comes up again on the other side
function spinArm(rel) {
  const front = FP_VORTEX.frontDeg * DEG;
  const a = wrap(rel);
  let under = 0;
  if (Math.abs(a) > front) {
    const v = ((a > 0 ? a : a + 2 * Math.PI) - front) / (2 * Math.PI - 2 * front);
    under = Math.sin(Math.PI * v);
  }
  return {
    wrist: [0.05 - Math.sin(a) * FP_VORTEX.reach, FP_VORTEX.low - FP_VORTEX.dip * under, -0.5 - Math.cos(a) * 0.16 + 0.1 * under],
    blade: direction(a, -(FP_VORTEX.droopDeg + FP_VORTEX.behindDropDeg * under) * DEG),
    // (the edge leads the way it is going: leftward)
    edge: normalize([-Math.cos(a), 0.3, Math.sin(a)]),
    shoulder: [-0.1 * Math.sin(a), 0.02 - 0.05 * under, -0.06],
  };
}

// the sword raised in front, to be lit: point up, a little forward, both hands coming onto it
const RAISED = Object.freeze({
  wrist: Object.freeze([0.14, -0.2, -0.6]),
  blade: Object.freeze(direction(4 * DEG, 76 * DEG)),
  edge: Object.freeze(normalize([0.9, 0.1, 0.4])),
  shoulder: Object.freeze([-0.03, 0.08, -0.05]),
});

function blendArm(a, b, t) {
  return {
    wrist: mix(a.wrist, b.wrist, t),
    blade: normalize(mix(a.blade, b.blade, t)),
    edge: normalize(mix(a.edge, b.edge, t)),
    shoulder: mix(a.shoulder ?? [0, 0, 0], b.shoulder ?? [0, 0, 0], t),
  };
}

function present(arm, grip, rel, lean) {
  const offHand = grip > 1e-3 ? { ...offHandOnGrip(arm), weight: grip } : null;
  if (offHand && grip < 1) {
    // (it comes up onto the grip from below and to the left)
    const away = (1 - grip) ** 2;
    offHand.wrist = [offHand.wrist[0] - 0.12 * away, offHand.wrist[1] - 0.2 * away, offHand.wrist[2] + 0.05 * away];
  }
  const a = wrap(rel);
  return {
    arm,
    offHand,
    // the view leans into each pass, a degree or so (the aim is the input's, untouched)
    look: { pitch: 0, roll: -Math.sin(a) * FP_VORTEX.roll * DEG * lean, yaw: 0 },
    body: [-0.02 * Math.sin(a) * lean, 0, 0],
    counter: [0, 0, 0],
  };
}

/**
 * The Vortex's startup, `share` of the way through it (0..1); `windup`: how far the turn has gathered (radians, as
 * vortexWindup gives it: a whole turn by the end).
 */
export function vortexStartupPose(share, windup) {
  const s = Math.max(0, Math.min(1, share));
  const raise = smooth(s / FP_VORTEX.raiseBy);
  const rest = { wrist: [...REST_ARM.wrist], blade: [...REST_ARM.blade], edge: [...REST_ARM.edge], shoulder: [0, 0, 0] };
  const raised = blendArm(rest, RAISED, raise);
  const carry = smooth((s - FP_VORTEX.carryFrom) / (FP_VORTEX.carryBy - FP_VORTEX.carryFrom));
  const arm = carry > 0 ? blendArm(raised, spinArm(windup), carry) : raised;
  return present(arm, raise, windup, carry);
}

/** The Vortex spinning: the blade turned `rel` from straight ahead (radians, + left). */
export function vortexSpinPose(rel) {
  return present(spinArm(rel), 1, rel, 1);
}

/** Whether the blade is in front of me (in view) when turned `rel` from straight ahead. */
export function vortexBladeInFront(rel) {
  return Math.abs(wrap(rel)) <= FP_VORTEX.frontDeg * DEG;
}
