// Places an arm by its hand: given where the wrist should be and which way the held thing should point (the blade, or
// a palm's face), bend the elbow to the reach, swing the shoulder to put the wrist there, let the elbow hang toward
// its pole, then turn the hand to aim and set its roll. Used for the first-person sword combo and the menu knight's
// flourishes (third person), each with its own chain.
//
// Works through a small bone api (the animator's procedural hook), so the math here is plain vectors in the rig's
// root space:
//   position(bone) -> [x, y, z]; direction(bone, localAxis) -> unit [x, y, z];
//   rotate(bone, axis, angle): turn a bone through its pivot about a root-space axis; shift(bone, offset).

// the first-person sword arm: the blade in the grip socket's own frame (measured from the sword's vertices: 0.78 m
// from the grip to the point, 0.19 m edge to edge); the socket is not square to it. The elbow hangs down and out.
export const FIRST_PERSON_SWORD_ARM = Object.freeze({
  shoulder: 'upper_arm.R', elbow: 'forearm.R', wrist: 'hand.R', grip: 'socket_sword',
  aim: Object.freeze([0.283, 0.767, 0.576]), roll: Object.freeze([0.959, -0.212, -0.189]),
  pole: Object.freeze([0.55, -0.8, 0.1]),
});

// the third-person Spellblade (menu flourishes): its blade (0.94 m) in the grip socket, the elbows out and down
export const THIRD_PERSON_SWORD_ARM = Object.freeze({
  shoulder: 'upper_arm.R', elbow: 'forearm.R', wrist: 'hand.R', grip: 'socket_sword',
  aim: Object.freeze([0.345, 0.039, -0.938]), roll: Object.freeze([0.938, -0.002, 0.346]),
  pole: Object.freeze([0.6, -0.7, 0.35]),
});
// and the spell hand: `aim` is the palm's face (up, in idle), `roll` runs across the palm
export const THIRD_PERSON_SPELL_ARM = Object.freeze({
  shoulder: 'upper_arm.L', elbow: 'forearm.L', wrist: 'hand.L', grip: 'socket_sorcery',
  aim: Object.freeze([0, 0, -1]), roll: Object.freeze([1, 0, 0]),
  pole: Object.freeze([-0.6, -0.7, 0.35]),
});

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a) => Math.hypot(a[0], a[1], a[2]);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function normalize(a) {
  const n = length(a);
  return n > 1e-9 ? scale(a, 1 / n) : [0, 0, 0];
}

export function lerp(a, b, t) {
  return add(a, scale(sub(b, a), t));
}

function angleBetween(a, b) {
  return Math.acos(clamp(dot(normalize(a), normalize(b)), -1, 1));
}

// the part of `a` square to the unit vector `axis`
function reject(a, axis) {
  return sub(a, scale(axis, dot(a, axis)));
}

// the angle turning `from` onto `to` about `axis` (right-handed), both taken square to it
function signedAngle(from, to, axis) {
  const f = normalize(reject(from, axis));
  const t = normalize(reject(to, axis));
  if (length(f) < 1e-6 || length(t) < 1e-6) return 0;
  return Math.atan2(dot(cross(f, t), axis), clamp(dot(f, t), -1, 1));
}

/** Rodrigues: `v` turned by `angle` about the unit `axis`. */
export function rotateVector(v, axis, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)));
}

/** The elbow angle (between upper arm and forearm) that puts the wrist `reach` from the shoulder. */
export function elbowAngleFor(upper, lower, reach) {
  const d = clamp(reach, Math.abs(upper - lower) + 1e-4, upper + lower - 1e-4);
  return Math.acos(clamp((upper * upper + lower * lower - d * d) / (2 * upper * lower), -1, 1));
}

/**
 * Pose an arm (a chain) toward `target` { wrist, aim, roll, shoulder? } with `weight` 0..1 (0 leaves the clip's arm
 * alone, 1 is exactly the target). aim: which way the held thing points; roll: which way its `roll` axis should lie
 * (either sign will do, the nearer is taken); shoulder: an offset for the shoulder itself (the body turning in).
 */
export function solveArm(api, chain, target, weight = 1) {
  const w = clamp(Number.isFinite(weight) ? weight : 0, 0, 1);
  if (w < 1e-3 || !target) return;
  if (target.shoulder) api.shift(chain.shoulder, scale(target.shoulder, w));

  const S = api.position(chain.shoulder);
  const E = api.position(chain.elbow);
  const W = api.position(chain.wrist);
  const goal = lerp(W, target.wrist, w);
  const upper = length(sub(E, S));
  const lower = length(sub(W, E));

  // 1. bend the elbow to the reach the goal needs
  const toShoulder = sub(S, E);
  const toWrist = sub(W, E);
  let hinge = cross(toShoulder, toWrist);
  if (length(hinge) < 1e-4 * upper * lower) hinge = api.direction(chain.elbow, [1, 0, 0]);
  hinge = normalize(hinge);
  const bend = elbowAngleFor(upper, lower, length(sub(goal, S))) - angleBetween(toShoulder, toWrist);
  // turning the forearm about toShoulder x toWrist opens the elbow
  api.rotate(chain.elbow, hinge, bend);

  // 2. swing the shoulder so the wrist lands on the goal
  const reached = api.position(chain.wrist);
  const from = normalize(sub(reached, S));
  const to = normalize(sub(goal, S));
  const swing = cross(from, to);
  if (length(swing) > 1e-6) api.rotate(chain.shoulder, normalize(swing), angleBetween(from, to));

  // 3. roll the arm about the shoulder-to-wrist line until the elbow hangs toward its pole
  const line = to;
  const roll = signedAngle(sub(api.position(chain.elbow), S), chain.pole, line);
  if (Math.abs(roll) > 1e-4) api.rotate(chain.shoulder, line, roll * w);

  // 4. aim what the hand holds, then turn it about itself so its roll axis lies as asked
  const aimWant = target.aim ?? target.blade;
  if (aimWant) {
    const aimNow = api.direction(chain.grip, chain.aim);
    const want = normalize(lerp(aimNow, normalize(aimWant), w));
    const turn = cross(aimNow, want);
    if (length(turn) > 1e-6) api.rotate(chain.wrist, normalize(turn), angleBetween(aimNow, want));
    const rollWant = target.roll ?? target.edge;
    if (rollWant) {
      const axis = api.direction(chain.grip, chain.aim);
      const rollNow = api.direction(chain.grip, chain.roll);
      // either side will do: take the nearer, so the hand never spins half a turn
      let lie = normalize(reject(rollWant, axis));
      if (dot(lie, rollNow) < 0) lie = scale(lie, -1);
      const twist = signedAngle(rollNow, lie, axis);
      if (Math.abs(twist) > 1e-4) api.rotate(chain.wrist, axis, twist * w);
    }
  }
}

/** The first-person sword arm toward { wrist, blade, edge, shoulder? } (see fpSlash.mjs). */
export function solveSwordArm(api, target, weight = 1) {
  solveArm(api, FIRST_PERSON_SWORD_ARM, target, weight);
}
