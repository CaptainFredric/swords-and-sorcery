// The Sword Techniques in my own arms (shared/src/swordTechniques.mjs). Both are drawn from the server's own moment
// of the technique (techniqueMoment), so what the arms do is what the room is resolving:
//
//   Rigid Riposte: the sword brought up across the front and held there (while it is, it turns what meets it), then
//   driven straight out along the aim as the lunge carries me, held out through the thrust, and brought home;
//   Whirl Like the Wind: the view never turns with the spin; the blade goes round as the server's goes round (the
//   authored track's own angle), so each time the real blade passes in front I see it cross the view, left to right
//   (a Blazing Vortex's crosses the other way), and it is carried round behind for the next pass.
//
// A pose is what fpSlash.mjs's are. Pure.
//
// View space: +x right, +y up, -z ahead.

import { REST_ARM, createSwordPath } from './fpSlash.mjs';
import { vortexSpinPose } from './fpVortex.mjs';
import { SWORD_TECHNIQUES, techniqueBlade } from '../../shared/src/swordTechniques.mjs';

const DEG = Math.PI / 180;
const R = SWORD_TECHNIQUES.rigid_riposte;
const dir = (yaw, pitch) => { const c = Math.cos(pitch * DEG); return [-Math.sin(yaw * DEG) * c, Math.sin(pitch * DEG), -Math.cos(yaw * DEG) * c]; };

const BRACE = R.enterSec, THRUST = R.enterSec + R.braceSec, OUT = THRUST + R.thrustSec, HOME = OUT + R.recoverySec;
const rest = (t, extra = {}) => ({ t, wrist: [...REST_ARM.wrist], blade: [...REST_ARM.blade], edge: [...REST_ARM.edge], ...extra });
// the Riposte: up across the front, held, out, home
const riposte = createSwordPath([
  rest(0, { ease: 0.5 }),
  // the sword comes up and across: the point forward and to the left, high, the forte in front of the body
  { t: BRACE, wrist: [0.27, -0.2, -0.6], blade: dir(12, 16), edge: [-0.2, -0.9, 0.3], shoulder: [-0.03, 0.04, -0.03], body: [0, 0.004, 0.012], look: [0.5, 0.4, 0.3] },
  // held, drawn back a little as the body coils behind it
  { t: THRUST - 0.05, wrist: [0.24, -0.15, -0.55], blade: dir(22, 22), edge: [-0.2, -0.9, 0.3], shoulder: [-0.02, 0.06, 0.02], body: [0, 0.006, 0.03], look: [0.8, 0.5, 0.4], ease: 0.3 },
  // the thrust: the point laid on the aim and driven out, the arm to its length as the lunge carries it
  { t: THRUST + 0.07, wrist: [0.13, -0.2, -0.82], blade: dir(4, 3), edge: [0.05, -0.99, 0.1], shoulder: [-0.1, 0.01, -0.16], body: [0, -0.012, -0.05], look: [-0.9, -0.2, -0.2] },
  { t: THRUST + 0.14, wrist: [0.1, -0.21, -0.92], blade: dir(1, -1), edge: [0.05, -0.99, 0.1], shoulder: [-0.13, 0, -0.2], body: [0, -0.016, -0.07], look: [-1.1, -0.2, -0.2] },
  { t: OUT, wrist: [0.1, -0.23, -0.9], blade: dir(0, -4), edge: [0.05, -0.99, 0.1], shoulder: [-0.12, -0.01, -0.18], body: [0, -0.014, -0.05], look: [-0.7, -0.1, -0.1], ease: 0.3 },
  // home
  { t: OUT + 0.18, wrist: [0.26, -0.3, -0.72], blade: dir(8, 26), edge: [0.5, 0.3, 0.6], shoulder: [-0.04, -0.01, -0.06], body: [0, -0.004, -0.015], look: [-0.2, 0, 0] },
  rest(HOME, { ease: 0 }),
]);

/** How far a technique blade is turned from straight ahead (radians, + to the right), from the authored track. */
export function techniqueBladeTurn(clip, time) {
  const blade = techniqueBlade(clip, time);
  if (!blade) return 0;
  return Math.atan2(blade.tip.x - blade.base.x, -(blade.tip.z - blade.base.z));
}

/**
 * The arms for a technique at `moment` (techniqueMoment's): a pose, or null when the technique has none of its own.
 * state: the replicated technique state (for a Riposte broken off: how far in it was).
 */
export function techniquePose(moment, state = null) {
  if (!moment) return null;
  const { technique, phase } = moment;
  if (technique.kind === 'riposte') {
    if (phase === 'startup' || phase === 'thrust') return riposte.sample(Math.min(OUT, moment.age));
    if (phase === 'recovery') return riposte.sample(Math.min(HOME, OUT + moment.time));
    // turned by a parry: home from wherever the thrust was, quickly
    const from = Math.min(OUT, Math.max(0, (state?.endAt ?? 0) - (state?.startedAt ?? 0)));
    return riposte.recover(from, moment.time, 0.4);
  }
  // (the vortex's pose takes the blade's turn to the left; the Whirl's grows to the right)
  return vortexSpinPose(-techniqueBladeTurn(moment.clip, moment.time));
}

/** Whether the technique's own arms should be let go of (its recovery nearly played out): the rest takes over. */
export function techniqueArmsWeight(moment) {
  if (!moment) return 0;
  const { technique, phase } = moment;
  if (phase === 'recovery' || phase === 'interrupted' || phase === 'parried') {
    const tail = technique.kind === 'riposte' ? (phase === 'parried' ? 0.4 : technique.recoverySec) : (phase === 'interrupted' ? technique.interruptedSec : technique.exitSec);
    return Math.max(0, Math.min(1, 1 - (moment.time - tail * 0.5) / (tail * 0.5)));
  }
  return 1;
}
