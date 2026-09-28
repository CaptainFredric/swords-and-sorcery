// The menu Spellblade's idle life: between stretches of the breathing Idle loop he looks around, shifts his weight,
// presents his blade, raises his guard or kindles sorcery in his palm. Built from the authored clips plus small
// procedural bone turns, so no new animation data is needed. Pure (no three.js): a function of time.

export const MOMENT_EVERY = 9;         // seconds between the starts of two moments
// bone turns (radians) at the full salute and the full rally, found by eye on the production rig: shoulders in the
// character's root space, elbow and wrist about their own joints
export const SALUTE = Object.freeze({ shoulderAcross: 1.25, shoulderForward: 0.1, elbow: 1.65, wrist: 0.45 });
export const RALLY = Object.freeze({ shoulderUp: 2.1, shoulderForward: 0.15, elbow: 0.2, headTurn: 0.25 });
const MOMENT_START = 3.2;              // each cycle opens with plain breathing
export const MOMENTS = Object.freeze({
  look: 3.4,
  shift: 2.8,
  present: 2.8,
  guard: 2.6,
  kindle: 1.1,
});
// a fixed, varied order: never the same moment twice in a row
const ORDER = Object.freeze(['look', 'present', 'shift', 'kindle', 'look', 'guard', 'shift', 'present', 'kindle', 'guard']);

function smoothstep(u) {
  const t = Math.max(0, Math.min(1, u));
  return t * t * (3 - 2 * t);
}

// eases in over the first fifth and out over the last fifth
function envelope(t) {
  return smoothstep(t / 0.2) * smoothstep((1 - t) / 0.2);
}

/** The moment playing at `time` (seconds on the menu clock), or null while he simply breathes. */
export function idleMoment(time) {
  const clock = Math.max(0, Number.isFinite(time) ? time : 0);
  const cycle = Math.floor(clock / MOMENT_EVERY);
  const phase = clock - cycle * MOMENT_EVERY - MOMENT_START;
  const kind = ORDER[cycle % ORDER.length];
  const duration = MOMENTS[kind];
  if (phase < 0 || phase >= duration) return null;
  const t = phase / duration;
  return { kind, t, elapsed: phase, duration, weight: envelope(t) };
}

// A choice on the front door gets an answer from him: he salutes with the blade before going it alone, raises it
// high toward the sky when calling for others, presents it on the way to the Armory. Each is a brief reaction
// (in quickly, held, eased out), taking over from whatever idle moment was playing.
export const REACTIONS = Object.freeze({
  salute: 2.6,
  rally: 2.8,
  present: 2.6,
  look: 2.2,
});

// in over the first seventh, out over the last quarter
function reactionEnvelope(t) {
  return smoothstep(t / 0.14) * smoothstep((1 - t) / 0.25);
}

/** The reaction playing at `time`, or null once it is over. reaction: { kind, startedAt } on the menu clock. */
export function reactionMoment(reaction, time) {
  const duration = REACTIONS[reaction?.kind];
  if (!duration || !Number.isFinite(time)) return null;
  const elapsed = time - reaction.startedAt;
  if (!(elapsed >= 0) || elapsed >= duration) return null;
  const t = elapsed / duration;
  return { kind: reaction.kind, t, elapsed, duration, weight: reactionEnvelope(t) };
}

/**
 * What the animator should play for a moment: an authored clip override (guard, kindle) and/or procedural bone
 * turns in the character's root space (+x right, +y up, -z forward).
 */
export function idlePose(moment) {
  if (!moment) return { clip: null, rotations: [] };
  const w = moment.weight;
  const t = moment.t;
  switch (moment.kind) {
    case 'look': {
      // glance over the left shoulder, then the right, then settle
      const turn = Math.sin(t * Math.PI * 2) * 0.5 * w;
      return {
        clip: null,
        rotations: [
          { bone: 'head', axis: [0, 1, 0], angle: turn },
          { bone: 'neck', axis: [0, 1, 0], angle: turn * 0.45 },
          { bone: 'chest', axis: [0, 1, 0], angle: turn * 0.18 },
        ],
      };
    }
    case 'shift': {
      // weight onto one leg: hips tip, the chest counters, the head stays level
      const lean = Math.sin(t * Math.PI) * w;
      return {
        clip: null,
        rotations: [
          { bone: 'spine', axis: [0, 0, 1], angle: 0.06 * lean },
          { bone: 'chest', axis: [0, 0, 1], angle: -0.08 * lean },
          { bone: 'head', axis: [0, 0, 1], angle: 0.03 * lean },
          { bone: 'chest', axis: [1, 0, 0], angle: 0.04 * lean },
        ],
      };
    }
    case 'present': {
      // lift the blade and turn it to catch the light, head tipped to regard it
      const lift = Math.sin(t * Math.PI) * w;
      const turn = Math.sin(t * Math.PI * 3) * 0.25 * lift;
      return {
        clip: null,
        rotations: [
          { bone: 'upper_arm.R', axis: [1, 0, 0], angle: 0.45 * lift },
          { bone: 'forearm.R', axis: [1, 0, 0], angle: 0.55 * lift },
          { bone: 'hand.R', axis: [0, 1, 0], angle: turn },
          { bone: 'head', axis: [1, 0, 0], angle: 0.12 * lift },
          { bone: 'head', axis: [0, 1, 0], angle: -0.18 * lift },
        ],
      };
    }
    case 'salute': {
      // the blade held upright before his face, the crossguard at his chin: arm across the chest, elbow bent high
      return {
        clip: null,
        rotations: [
          { bone: 'upper_arm.R', axis: [0, 1, 0], angle: SALUTE.shoulderAcross * w },
          { bone: 'upper_arm.R', axis: [1, 0, 0], angle: SALUTE.shoulderForward * w },
          { bone: 'forearm.R', axis: [1, 0, 0], angle: SALUTE.elbow * w, space: 'local' },
          { bone: 'hand.R', axis: [1, 0, 0], angle: SALUTE.wrist * w, space: 'local' },
          { bone: 'head', axis: [1, 0, 0], angle: -0.06 * w },
        ],
      };
    }
    case 'rally': {
      // the sword thrust up toward the sky over his sword side, chest out, looking up to it: to me!
      const shake = Math.sin(moment.elapsed * 9) * 0.02 * w;
      return {
        clip: null,
        rotations: [
          { bone: 'upper_arm.R', axis: [0, 0, 1], angle: RALLY.shoulderUp * w },
          { bone: 'upper_arm.R', axis: [1, 0, 0], angle: RALLY.shoulderForward * w },
          { bone: 'forearm.R', axis: [1, 0, 0], angle: RALLY.elbow * w, space: 'local' },
          { bone: 'hand.R', axis: [1, 0, 0], angle: shake, space: 'local' },
          { bone: 'chest', axis: [1, 0, 0], angle: -0.08 * w },
          { bone: 'head', axis: [1, 0, 0], angle: -0.22 * w },
          { bone: 'head', axis: [0, 1, 0], angle: RALLY.headTurn * w },
        ],
      };
    }
    case 'guard':
      return { clip: 'Guard', rotations: [] };
    case 'kindle':
      return { clip: 'Cast', rotations: [] };
    default:
      return { clip: null, rotations: [] };
  }
}
