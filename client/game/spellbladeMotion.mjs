// Procedural motion layered over the authored Spellblade clips: short directional hit flinches, guard and parry
// impacts, landing absorption and an airborne leg reach. Pure math (no three.js) so it runs in node tests; the
// animator turns the result into bone rotations.
//
// Everything is in the character's root space: +x is its right, +y up, -z forward (the model faces -Z).
// None of this changes state or control: a flinch is not a stagger, and server timings are untouched.

export const REACTIONS = Object.freeze({
  // a hit that lands: the torso folds away from the blow, the head snaps a beat later
  hit: Object.freeze({ rise: 0.05, hold: 0.03, fall: 0.3, spine: 0.13, chest: 0.11, head: 0.16, twist: 0.12, pelvis: 0.035 }),
  // a blow caught on the guard: the upper body is driven back and the sword arm shudders
  block: Object.freeze({ rise: 0.04, hold: 0.02, fall: 0.26, spine: 0.06, chest: 0.09, head: 0.06, pelvis: 0.05, shudder: 0.16 }),
  // a guard broken open: a heavier version of the block that the stagger clip takes over from
  guardBreak: Object.freeze({ rise: 0.04, hold: 0.04, fall: 0.3, spine: 0.1, chest: 0.12, head: 0.1, pelvis: 0.07, shudder: 0.22 }),
  // a successful parry: a sharp outward deflection of the blade with a small counter-twist
  parry: Object.freeze({ rise: 0.03, hold: 0.02, fall: 0.2, twist: 0.16, sweep: 0.3 }),
  // landing: knees and hips flex to absorb the fall, deeper for harder landings
  land: Object.freeze({ rise: 0.05, hold: 0.02, fall: 0.28, flex: 0.34, lean: 0.08 }),
});

const MAX_AGE = 0.6;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

// 0 -> 1 quickly (rise), holds, then eases back to 0 (fall); zero outside
export function reactionEnvelope(age, { rise, hold = 0, fall }) {
  if (!(age >= 0)) return 0;
  if (age < rise) return smoothstep(age / rise);
  if (age < rise + hold) return 1;
  const t = (age - rise - hold) / fall;
  return t >= 1 ? 0 : 1 - smoothstep(t);
}

/** World-space horizontal push (from attacker toward victim) -> unit vector in the victim's root space. */
export function localPushDirection(push, yaw) {
  const x = Number(push?.x) || 0;
  const z = Number(push?.z) || 0;
  const length = Math.hypot(x, z);
  if (length < 1e-6) return { x: 0, z: 1 };  // unknown source: pushed straight back
  const c = Math.cos(yaw || 0);
  const s = Math.sin(yaw || 0);
  // undo the root's rotation about +y
  const lx = (x * c - z * s) / length;
  const lz = (x * s + z * c) / length;
  return { x: lx, z: lz };
}

// the axis that tips a bone's upper end toward d (up x d)
function tiltAxis(d) {
  return [d.z || 0, 0, -d.x || 0];
}

/**
 * Bone rotations (root-space axis, radians) and a pelvis offset (metres) for every live reaction.
 * @param {Array<{kind:string, at:number, push?:{x:number,z:number}, strength?:number}>} reactions
 * @param {number} now   same clock as reaction.at
 * @param {number} yaw   the body's facing
 */
export function reactionPose(reactions, now, yaw = 0) {
  const rotations = [];
  const pelvis = [0, 0, 0];
  let legFlex = 0;
  for (const reaction of reactions ?? []) {
    const spec = REACTIONS[reaction.kind];
    if (!spec) continue;
    const age = now - reaction.at;
    const weight = reactionEnvelope(age, spec) * (Number.isFinite(reaction.strength) ? reaction.strength : 1);
    if (weight <= 1e-4) continue;
    const d = localPushDirection(reaction.push, yaw);
    const tilt = tiltAxis(d);

    if (reaction.kind === 'land') {
      legFlex = Math.max(legFlex, spec.flex * weight);
      // lean forward over the bent knees (the tilt axis for -z)
      rotations.push({ bone: 'spine', axis: [-1, 0, 0], angle: spec.lean * weight });
      continue;
    }
    if (reaction.kind === 'parry') {
      // the sword hand sweeps out to the right and the chest counter-twists
      rotations.push({ bone: 'chest', axis: [0, 1, 0], angle: spec.twist * weight });
      rotations.push({ bone: 'hand.R', axis: [0, 1, 0], angle: -spec.sweep * weight });
      rotations.push({ bone: 'forearm.R', axis: [0, 1, 0], angle: -spec.sweep * 0.5 * weight });
      continue;
    }

    rotations.push({ bone: 'spine', axis: tilt, angle: spec.spine * weight });
    rotations.push({ bone: 'chest', axis: tilt, angle: spec.chest * weight });
    // the head lags the torso slightly, then snaps
    const headWeight = reactionEnvelope(age - 0.03, spec) * (reaction.strength ?? 1);
    rotations.push({ bone: 'head', axis: tilt, angle: spec.head * headWeight });
    if (spec.twist) {
      // a blow from the side also turns the shoulders away from it
      rotations.push({ bone: 'chest', axis: [0, 1, 0], angle: -spec.twist * d.x * weight });
    }
    if (spec.shudder) {
      // the blade rings: a fast damped oscillation of the sword wrist
      const ring = Math.sin(Math.max(0, age) * 70) * Math.exp(-Math.max(0, age) * 12);
      rotations.push({ bone: 'hand.R', axis: tilt, angle: spec.shudder * ring * (reaction.strength ?? 1) });
      rotations.push({ bone: 'forearm.R', axis: tilt, angle: -spec.shudder * 0.4 * weight });
    }
    pelvis[0] += d.x * spec.pelvis * weight;
    pelvis[2] += d.z * spec.pelvis * weight;
  }
  return { rotations, pelvis, legFlex };
}

/** Drop reactions that have finished (keeps the per-character list short). */
export function pruneReactions(reactions, now) {
  return (reactions ?? []).filter((reaction) => now - reaction.at < MAX_AGE);
}

/**
 * While airborne the legs read the jump: tucked on the way up, relaxing into the authored air pose as it falls.
 * @returns {number} flex angle (radians; positive tucks the knees)
 */
export function airborneLegFlex(verticalVelocity, jumpImpulse = 7.2) {
  const v = Number.isFinite(verticalVelocity) ? verticalVelocity : 0;
  // tucked most just after take-off, relaxing to the authored air pose by the apex and on the way down
  return 0.16 * clamp01(v / jumpImpulse);
}

/** A landing's strength from the fastest downward speed seen while airborne (a step down barely registers). */
export function landingStrength(impactSpeed) {
  const speed = Math.max(0, Number(impactSpeed) || 0);
  return clamp01((speed - 1.5) / 8);
}

/**
 * Loop time for a gait clip from a shared phase, so Run and Sprint stay on the same foot while they cross-fade.
 * Both clips start on the same contact (Sprint is Run retimed).
 */
export function gaitTime(phase, duration) {
  const p = ((phase % 1) + 1) % 1;
  return p * duration;
}

// How much sorcery shows in the palm. At rest it is a small ember; during a cast it gathers through the charge,
// flares at the release and settles back. (level 0 = resting ember, 1 = the release flare)
export function sorceryLevel(clip, time, duration) {
  if (clip !== 'Cast' || !(duration > 0)) return 0;
  const u = Math.max(0, time) / duration;
  if (u < 0.45) {
    const t = u / 0.45;
    return 0.85 * t * t;                       // charge: gathers slowly, then fast
  }
  if (u < 0.6) return 0.85 + 0.15 * Math.sin(((u - 0.45) / 0.15) * Math.PI / 2);   // release flare
  const t = Math.min(1, (u - 0.6) / 0.4);
  return 1 - t * t * (3 - 2 * t);             // settles back to the ember
}

export const GAIT_CLIPS = Object.freeze(new Set(['Run', 'Sprint']));
