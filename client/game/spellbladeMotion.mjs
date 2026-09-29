// Procedural motion layered over the authored Spellblade clips: short directional hit flinches, guard and parry
// impacts, landing absorption and an airborne leg reach. Pure math (no three.js) so it runs in node tests; the
// animator turns the result into bone rotations.
//
// Everything is in the character's root space: +x is its right, +y up, -z forward (the model faces -Z).
// None of this changes state or control: a flinch is not a stagger, and server timings are untouched.

export const REACTIONS = Object.freeze({
  // a hit that lands: the torso is knocked away from the blow and turned with the blade's travel, the head snaps a
  // beat later, the sword arm is flung wide, the weight shifts and the knees give a little; then it settles, swinging
  // a touch past upright before it steadies (a flinch, not a stagger: nothing about control changes)
  hit: Object.freeze({ rise: 0.045, hold: 0.035, fall: 0.32, spine: 0.2, chest: 0.17, head: 0.28, twist: 0.22, pelvis: 0.06, arm: 0.34, knees: 0.1, settle: 0.18 }),
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

// 0 -> 1 quickly (rise), holds, then eases back to 0 (fall); zero outside. With `settle`, the way back swings that far
// past rest before it steadies (the body's weight carrying it through)
export function reactionEnvelope(age, { rise, hold = 0, fall, settle = 0 }) {
  if (!(age >= 0)) return 0;
  if (age < rise) return smoothstep(age / rise);
  if (age < rise + hold) return 1;
  const t = (age - rise - hold) / fall;
  if (t >= 1) return 0;
  if (!settle) return 1 - smoothstep(t);
  return t < 0.62 ? 1 - smoothstep(t / 0.62) : -settle * Math.sin((Math.PI * (t - 0.62)) / 0.38);
}

// which way a sword blow's blade travels across the one it hits, in their own frame (+1 toward their right): the
// forehand and the finisher come from the attacker's right (the victim's left), the backhand the other way
export function bladeTravel(strike) {
  if (strike === 1) return -1;
  if (strike === 0 || strike === 2) return 1;
  return null;
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
 * Bone rotations (root-space axis, radians) and a pelvis offset (metres) for every live reaction. slack: the body is
 * dying (its arms and knees are the death's, not the blow's).
 * @param {Array<{kind:string, at:number, push?:{x:number,z:number}, strength?:number}>} reactions
 * @param {number} now   same clock as reaction.at
 * @param {number} yaw   the body's facing
 */
export function reactionPose(reactions, now, yaw = 0, { slack = false } = {}) {
  const rotations = [];
  const pelvis = [0, 0, 0];
  let legFlex = 0;
  for (const reaction of reactions ?? []) {
    const spec = REACTIONS[reaction.kind];
    if (!spec) continue;
    const age = now - reaction.at;
    const weight = reactionEnvelope(age, spec) * (Number.isFinite(reaction.strength) ? reaction.strength : 1);
    // (a reaction settling swings back past rest: its weight goes briefly negative)
    if (Math.abs(weight) <= 1e-4) continue;
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

    // the finisher comes down from above: more fold, deeper knees
    const heavy = reaction.strike === 2 ? 1.3 : 1;
    rotations.push({ bone: 'spine', axis: tilt, angle: spec.spine * heavy * weight });
    rotations.push({ bone: 'chest', axis: tilt, angle: spec.chest * weight });
    // the head lags the torso slightly, then snaps
    const headWeight = reactionEnvelope(age - 0.03, spec) * (reaction.strength ?? 1);
    rotations.push({ bone: 'head', axis: tilt, angle: spec.head * headWeight });
    if (spec.twist) {
      // the shoulders turn with the blade's travel across the body (or away from a blow from the side)
      const across = bladeTravel(reaction.strike) ?? d.x;
      rotations.push({ bone: 'chest', axis: [0, 1, 0], angle: -spec.twist * across * weight });
      rotations.push({ bone: 'head', axis: [0, 1, 0], angle: -spec.twist * 0.5 * across * headWeight });
      if (spec.arm && !slack) {
        // the sword arm is flung wide, a beat behind the shoulders, the elbow jerked
        rotations.push({ bone: 'upper_arm.R', axis: [0, 1, 0], angle: -spec.arm * across * headWeight });
        rotations.push({ bone: 'upper_arm.R', axis: tilt, angle: spec.arm * 0.5 * headWeight });
        rotations.push({ bone: 'forearm.R', axis: [1, 0, 0], angle: spec.arm * 0.6 * headWeight, space: 'local' });
      }
    }
    if (spec.knees && !slack) legFlex = Math.max(legFlex, spec.knees * heavy * Math.max(0, weight));
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

/**
 * A death, layered over the Death clip (which stands a beat with its sword arm flung out, then topples back in one
 * piece, legs locked): the knees and hips give at once, the body sags after the killing blow's push, the sword arm
 * goes slack along the body and the head drops; as the fall takes over, the knees stay bent, so it crumples rather
 * than falling like a plank. age: seconds since the death; push: the killing blow's direction (world, attacker toward
 * victim).
 */
export function deathSlump(age, push = null, yaw = 0) {
  const none = { rotations: [], pelvis: [0, 0, 0], legFlex: 0 };
  if (!(age >= 0)) return none;
  // the legs go almost at once, and the clip's fall takes the upper body back from there
  const w = age >= 0.75 ? 0 : smoothstep(age / 0.16) * (1 - smoothstep((age - 0.42) / 0.3));
  // the arms stay slack longer, trailing the fall instead of flinging up with it
  const limp = age >= 0.95 ? 0 : smoothstep(age / 0.16) * (1 - smoothstep((age - 0.65) / 0.3));
  const fall = smoothstep((age - 0.3) / 0.3);
  const rotations = [];
  if (w > 1e-4) {
    const d = localPushDirection(push, yaw);
    const tilt = tiltAxis(d);
    rotations.push(
      // the body sags after the blow
      { bone: 'spine', axis: tilt, angle: 0.2 * w },
      { bone: 'chest', axis: tilt, angle: 0.12 * w },
      // the head drops, chin toward the chest
      { bone: 'head', axis: [-1, 0, 0], angle: 0.32 * w },
    );
  }
  if (limp > 1e-4) {
    rotations.push(
      // both arms lose their tension: back in along the body, the elbows sagging
      { bone: 'upper_arm.R', axis: [0, 0, 1], angle: -0.55 * limp },
      { bone: 'forearm.R', axis: [1, 0, 0], angle: 0.45 * limp, space: 'local' },
      { bone: 'upper_arm.L', axis: [0, 0, 1], angle: 0.35 * limp },
      { bone: 'forearm.L', axis: [1, 0, 0], angle: 0.35 * limp, space: 'local' },
    );
  }
  if (fall > 1e-4) {
    // going over with the knees still bent (the joints' own bend: hip and knee), easing half straight as he lies
    const bend = fall * (1 - 0.5 * deathRest(age));
    for (const side of ['L', 'R']) {
      rotations.push({ bone: `thigh.${side}`, axis: [1, 0, 0], angle: 0.35 * bend, space: 'local' });
      rotations.push({ bone: `shin.${side}`, axis: [1, 0, 0], angle: 0.7 * bend, space: 'local' });
    }
  }
  if (!rotations.length) return none;
  const d = localPushDirection(push, yaw);
  return { rotations, pelvis: [d.x * 0.08 * w, 0, d.z * 0.08 * w], legFlex: 0.42 * w };
}

// The Death clip ends mid-fall: toppled back in one piece, propped on its heels at a slant. The body carries on down
// from there until it lies on the ground: slow to start and quick at the end (it is falling), a small bounce as the
// armour lands, then still. The animator turns the whole body the rest of the way about the heels and rests its
// lowest part on the ground (SpellbladeAnimator #lieDown); these are the timing, and how far off the ground each part
// rests (its bone sits inside the armour).
export const DEATH_REST = Object.freeze({
  buckle: 0.45,         // from here the knees give and he comes down onto the ground (not kicking his feet up)...
  buckleSeconds: 0.35,  // ...over this long
  start: 0.9,           // seconds into the death: the clip's topple is well under way
  land: 1.4,            // flat on the ground
  settled: 1.75,        // the bounce over
  bounce: 0.05,         // how far back up the bounce lifts him (a share of the last of the fall)
  clearance: Object.freeze({ pelvis: 0.16, chest: 0.2, head: 0.15, 'foot.L': 0.07, 'foot.R': 0.07, 'hand.L': 0.08, 'hand.R': 0.08 }),
});

/** How far the body has gone from the clip's slant to lying on the ground at `age` (0..1, with the bounce). */
export function deathRest(age) {
  const { start, land, settled, bounce } = DEATH_REST;
  if (!(age > start)) return 0;
  if (age <= land) {
    const f = (age - start) / (land - start);
    return f * f;
  }
  const b = clamp01((age - land) / (settled - land));
  return 1 - bounce * Math.sin(Math.PI * b) * (1 - b);
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
