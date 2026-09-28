// Places the first-person sword arm by its hand: given where the wrist should be and which way the blade should
// point (in the view's own space: +x right, +y up, -z ahead), bend the elbow to the reach, swing the shoulder to put
// the wrist there, let the elbow hang toward its pole, then turn the hand to aim the blade and set its edge.
//
// Works through a small bone api (the animator's procedural hook), so the math here is plain vectors:
//   position(bone) -> [x, y, z]; direction(bone, localAxis) -> unit [x, y, z];
//   rotate(bone, axis, angle): turn a bone through its pivot about a view-space axis; shift(bone, offset).

const ARM = Object.freeze({ shoulder: 'upper_arm.R', elbow: 'forearm.R', wrist: 'hand.R', grip: 'socket_sword' });
// the elbow hangs down and out while the hand works in front
const POLE = Object.freeze([0.55, -0.8, 0.1]);
// the blade in the grip socket's own frame (measured from the sword's vertices: 0.78 m from the grip to the point,
// 0.19 m edge to edge); the socket is not square to it
const BLADE_AXIS = Object.freeze([0.283, 0.767, 0.576]);
const EDGE_AXIS = Object.freeze([0.959, -0.212, -0.189]);

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
 * Pose the sword arm toward `target` { wrist, blade, edge, shoulder? } with `weight` 0..1 (0 leaves the clip's arm
 * alone, 1 is exactly the target). shoulder: an offset for the shoulder itself (the body turning into the cut).
 */
export function solveSwordArm(api, target, weight = 1) {
  const w = clamp(Number.isFinite(weight) ? weight : 0, 0, 1);
  if (w < 1e-3 || !target) return;
  if (target.shoulder) api.shift(ARM.shoulder, scale(target.shoulder, w));

  const S = api.position(ARM.shoulder);
  const E = api.position(ARM.elbow);
  const W = api.position(ARM.wrist);
  const goal = lerp(W, target.wrist, w);
  const upper = length(sub(E, S));
  const lower = length(sub(W, E));

  // 1. bend the elbow to the reach the goal needs
  const toShoulder = sub(S, E);
  const toWrist = sub(W, E);
  let hinge = cross(toShoulder, toWrist);
  if (length(hinge) < 1e-4 * upper * lower) hinge = api.direction(ARM.elbow, [1, 0, 0]);
  hinge = normalize(hinge);
  const bend = elbowAngleFor(upper, lower, length(sub(goal, S))) - angleBetween(toShoulder, toWrist);
  // turning the forearm about toShoulder x toWrist opens the elbow
  api.rotate(ARM.elbow, hinge, bend);

  // 2. swing the shoulder so the wrist lands on the goal
  const reached = api.position(ARM.wrist);
  const from = normalize(sub(reached, S));
  const to = normalize(sub(goal, S));
  const swing = cross(from, to);
  if (length(swing) > 1e-6) api.rotate(ARM.shoulder, normalize(swing), angleBetween(from, to));

  // 3. roll the arm about the shoulder-to-wrist line until the elbow hangs toward its pole
  const line = to;
  const roll = signedAngle(sub(api.position(ARM.elbow), S), POLE, line);
  if (Math.abs(roll) > 1e-4) api.rotate(ARM.shoulder, line, roll * w);

  // 4. aim the blade, then turn it about itself so an edge leads the cut
  if (target.blade) {
    const bladeNow = api.direction(ARM.grip, BLADE_AXIS);
    const bladeWant = normalize(lerp(bladeNow, normalize(target.blade), w));
    const aim = cross(bladeNow, bladeWant);
    if (length(aim) > 1e-6) api.rotate(ARM.wrist, normalize(aim), angleBetween(bladeNow, bladeWant));
    if (target.edge) {
      const blade = api.direction(ARM.grip, BLADE_AXIS);
      const edgeNow = api.direction(ARM.grip, EDGE_AXIS);
      // either edge will do: take the nearer, so the blade never spins half a turn
      let edgeWant = normalize(reject(target.edge, blade));
      if (dot(edgeWant, edgeNow) < 0) edgeWant = scale(edgeWant, -1);
      const turn = signedAngle(edgeNow, edgeWant, blade);
      if (Math.abs(turn) > 1e-4) api.rotate(ARM.wrist, blade, turn * w);
    }
  }
}
