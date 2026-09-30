// The sword as a blade in the world. Each strike swings a real blade (a segment from the sword hand out to the tip,
// with a little thickness) through its arc in the attacker's view: the forehand from high on the right down across to
// the left, the backhand back the other way, the third straight down from above the aim to below it. Wherever it is,
// it passes through the attacker's aim at the strike's contact. Swept in small angular steps (never more than a few
// centimetres apart at the tip), it meets whatever it passes through first. Three questions, kept apart:
//
//   - a knight (an upright capsule) anywhere in the swing's whole arc takes the blow...
//   - ...unless something solid stands between the attacker and where the blade met them (nothing through a wall or
//     round a corner);
//   - and the world stops the blade (it rings off, and the knight recoils) only where the swing is driven: within a
//     corridor either side of the aim. Out at the edges of a slash, a wall or a barrel the blade brushes does not end
//     an otherwise good blow.
//
// Pure: the server resolves strikes with it (shared/sim/combat.mjs); tests and the client can ask it the same
// questions.
//
// How cleanly a knight it meets is caught is one thing only: how far off the attacker's aim the knight's body was as
// the blade met it (the angle from the aim to the nearest point of their body's axis). Dead centre is the cleanest;
// the edge of the swing a glancing touch. Current tuning (provisional).

import { MELEE_CONTACT } from './combat.mjs';

const DEG = Math.PI / 180;

export const BLADE = Object.freeze({
  // the cutting stretch, measured from the eyes along the blade (the hand and hilt before it do not cut)
  from: 0.4,
  to: 2.35,
  radius: 0.08,          // the blade's half-thickness, for what it touches
  bodyRadius: 0.45,      // a knight, as the blade meets it: an upright capsule this thick
  stepDeg: 2,            // the sweep, judged at least this finely (about 8 cm apart at the tip)
  arcHalfDeg: 75,        // the side cuts cross this far each side of the aim
  worldStopDeg: 40,      // the world stops the blade only this far either side of the aim (the driven part of it)
  groundStopDeg: 25,     // and the ground only this near it: a blade driven into the ground, not one that dips to it
  tiltDeg: 12,           // their plane leans: high on the right, low on the left
  // the chop: from this far above the aim to this far below it
  chopFromDeg: 60,
  chopToDeg: 50,
});

// how cleanly a knight is caught, by how far off the aim their body was as the blade met it (degrees, quality 0..1):
// dead centre the cleanest, a knight clipped by the edge of the swing the least
// (a knight two metres off is some 26 degrees wide: aimed anywhere near their middle is 29-30, near their edge 28,
// a blow that catches them off to one side 25-27, as the blade comes round 22-24, the very end of the swing 19-21)
export const AIM_QUALITY = Object.freeze([[0, 1], [4, 0.97], [12, 0.82], [25, 0.6], [42, 0.33], [75, 0]]);

/** The quality of a blow that met a body `offAimDeg` off the aim (0..1, by AIM_QUALITY, evenly between its points). */
export function aimQuality(offAimDeg, curve = AIM_QUALITY) {
  const a = Math.max(0, Number(offAimDeg) || 0);
  for (let i = 1; i < curve.length; i += 1) {
    const [a0, q0] = curve[i - 1];
    const [a1, q1] = curve[i];
    if (a <= a1) return q0 + (q1 - q0) * (a - a0) / (a1 - a0);
  }
  return curve[curve.length - 1][1];
}

const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const normalize = (a) => { const n = Math.hypot(a.x, a.y, a.z) || 1; return scale(a, 1 / n); };

/** The aim's frame from a yaw and pitch: forward, right and up (three.js: forward at yaw 0 is -z). */
export function aimFrame(yaw, pitch = 0) {
  const cp = Math.cos(pitch);
  const forward = { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
  const right = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
  return { forward, right, up: normalize(cross(right, forward)) };
}

/**
 * Where a strike's blade points `dt` seconds from its contact (a unit direction), in an aim frame: the side cuts sweep
 * across their arc through the window (the forehand from the right, the backhand from the left), the chop comes down;
 * at the contact every strike points along the aim.
 */
export function bladeDirection(strike, dt, frame, contact = MELEE_CONTACT, blade = BLADE) {
  const share = Math.max(-1, Math.min(1, dt < 0 ? dt / contact.window.early : dt / contact.window.late));
  const sweep = contact.sweep[strike] ?? 0;
  if (!sweep) {
    // the chop: above the aim before the contact, below it after
    const angle = (share < 0 ? -share * blade.chopFromDeg : -share * blade.chopToDeg) * DEG;
    return normalize(add(scale(frame.forward, Math.cos(angle)), scale(frame.up, Math.sin(angle))));
  }
  // + toward the attacker's left; the plane leans down to the left
  const angle = sweep * share * blade.arcHalfDeg * DEG;
  const tilt = blade.tiltDeg * DEG;
  const left = normalize(add(scale(frame.right, -Math.cos(tilt)), scale(frame.up, -Math.sin(tilt))));
  return normalize(add(scale(frame.forward, Math.cos(angle)), scale(left, Math.sin(angle))));
}

/** How far the blade has turned between two moments of a strike (radians). */
export function bladeTurn(strike, dtA, dtB, frame) {
  const a = bladeDirection(strike, dtA, frame);
  const b = bladeDirection(strike, dtB, frame);
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
}

// the closest points between segments p0-p1 and q0-q1: { distance, s (0..1 along p), t (0..1 along q) }
export function segmentDistance(p0, p1, q0, q1) {
  const d1 = sub(p1, p0);
  const d2 = sub(q1, q0);
  const r = sub(p0, q0);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s;
  let t;
  if (a <= 1e-12 && e <= 1e-12) return { distance: Math.hypot(r.x, r.y, r.z), s: 0, t: 0 };
  if (a <= 1e-12) {
    s = 0;
    t = Math.max(0, Math.min(1, f / e));
  } else {
    const c = dot(d1, r);
    if (e <= 1e-12) {
      t = 0;
      s = Math.max(0, Math.min(1, -c / a));
    } else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > 1e-12 ? Math.max(0, Math.min(1, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    }
  }
  const cp = add(p0, scale(d1, s));
  const cq = add(q0, scale(d2, t));
  return { distance: Math.hypot(cp.x - cq.x, cp.y - cq.y, cp.z - cq.z), s, t };
}

// the blade's cutting stretch from the eyes along a direction
function bladeSegment(eye, direction, blade) {
  return [add(eye, scale(direction, blade.from)), add(eye, scale(direction, blade.to))];
}

// a segment against a box grown by `grow` all round: the fraction along the segment where it enters, or null
function segmentBox(start, end, box, grow) {
  const min = [box.center[0] - box.size[0] / 2 - grow, box.center[1] - box.size[1] / 2 - grow, box.center[2] - box.size[2] / 2 - grow];
  const max = [box.center[0] + box.size[0] / 2 + grow, box.center[1] + box.size[1] / 2 + grow, box.center[2] + box.size[2] / 2 + grow];
  const s = [start.x, start.y, start.z];
  const d = [end.x - start.x, end.y - start.y, end.z - start.z];
  let tMin = 0;
  let tMax = 1;
  let axisHit = -1;
  let sign = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    if (Math.abs(d[axis]) < 1e-12) {
      if (s[axis] < min[axis] || s[axis] > max[axis]) return null;
      continue;
    }
    let t1 = (min[axis] - s[axis]) / d[axis];
    let t2 = (max[axis] - s[axis]) / d[axis];
    let near = -1;
    if (t1 > t2) { [t1, t2] = [t2, t1]; near = 1; }
    if (t1 > tMin) { tMin = t1; axisHit = axis; sign = near; }
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  const normal = [0, 0, 0];
  if (axisHit >= 0) normal[axisHit] = sign;
  return { t: tMin, normal };
}

/** Whether a solid stops a blade (anything solid does unless it says otherwise: a curtain of cloth, say). */
export function blocksBlade(solid) {
  return solid?.blade !== false;
}

/** Whether something solid stands between the eyes and a point (a knight met behind a wall or round a corner). */
export function occluded(eye, point, solids) {
  for (const solid of solids) {
    if (!blocksBlade(solid)) continue;
    const hit = segmentBox(eye, point, solid, 0);
    if (hit && hit.t < 1 - 1e-6) return true;
  }
  return false;
}

// where a blade segment meets the top of a floor (below the eyes): the fraction along it, or null
function segmentFloor(start, end, floor) {
  const y = floor.y;
  if (!(start.y > y && end.y <= y)) return null;
  const t = (start.y - y) / (start.y - end.y);
  const x = start.x + (end.x - start.x) * t;
  const z = start.z + (end.z - start.z) * t;
  const halfX = floor.size[0] / 2;
  const halfZ = floor.size[2] / 2;
  if (Math.abs(x - floor.center[0]) > halfX || Math.abs(z - floor.center[2]) > halfZ) return null;
  return t;
}

/**
 * Sweep a blade between two directions from `eye` (unit vectors, `steps` evenly between) and report what it meets
 * first: { kind: 'body', id, point, along (m from the eyes) } or { kind: 'solid', solid, point, normal, along }, or
 * null. bodies: [{ id, base: { x, y, z } (the feet), top: the crown's height above them }]; solids: boxes.
 * aim: the attacker's aim (a unit vector): the world stops the blade only within `blade.worldStopDeg` of it (with no
 * aim given, anywhere). A knight met with something solid between the eyes and the blade's contact is not met.
 * ground: floors (a world's `floors`) the blade can be driven into, where the world stops it (with none, the ground is
 * not asked about): met as { kind: 'ground', floor, point, along }.
 */
export function sweepBlade(eye, fromDirection, toDirection, bodies, solids, { aim = null, blade = BLADE, ground = null } = {}) {
  const turn = Math.acos(Math.max(-1, Math.min(1, dot(fromDirection, toDirection))));
  const steps = Math.max(1, Math.ceil(turn / (blade.stepDeg * DEG)));
  const corridor = Math.cos(blade.worldStopDeg * DEG);
  const groundCorridor = Math.cos(blade.groundStopDeg * DEG);
  const stopping = solids.filter(blocksBlade);
  for (let i = 1; i <= steps; i += 1) {
    const direction = slerpDirection(fromDirection, toDirection, i / steps, turn);
    const [start, end] = bladeSegment(eye, direction, blade);
    const length = blade.to - blade.from;
    let best = null;
    for (const body of bodies) {
      const q0 = { x: body.base.x, y: body.base.y + blade.bodyRadius * 0.5, z: body.base.z };
      const q1 = { x: body.base.x, y: body.base.y + Math.max(blade.bodyRadius * 0.5, body.top - blade.bodyRadius * 0.4), z: body.base.z };
      const near = segmentDistance(start, end, q0, q1);
      if (near.distance > blade.bodyRadius + blade.radius) continue;
      const along = blade.from + near.s * length;
      if (best && along >= best.along) continue;
      // the way from the eyes to where the blade meets them must be open (checked a hand's breadth short of the
      // contact: the far side of a knight leaning on a wall is not the wall between)
      if (occluded(eye, add(eye, scale(direction, Math.max(0, along - 0.2))), stopping)) continue;
      best = { kind: 'body', id: body.id, point: add(start, scale(sub(end, start), near.s)), along, direction };
    }
    // the world stops the blade only where the swing is driven
    const driven = !aim || dot(direction, aim) >= corridor;
    const intoGround = !aim || dot(direction, aim) >= groundCorridor;
    for (const floor of intoGround && ground ? ground : []) {
      const t = segmentFloor(start, end, floor);
      if (t === null) continue;
      const along = blade.from + t * length;
      if (!best || along < best.along) best = { kind: 'ground', floor, point: add(start, scale(sub(end, start), t)), along, direction };
    }
    for (const solid of driven ? stopping : []) {
      const hit = segmentBox(start, end, solid, blade.radius);
      if (!hit) continue;
      const along = blade.from + hit.t * length;
      if (!best || along < best.along) {
        best = { kind: 'solid', solid, point: add(start, scale(sub(end, start), hit.t)), normal: hit.normal, along, direction };
      }
    }
    if (best) return best;
  }
  return null;
}

// a direction partway round from one unit vector to another (evenly by angle)
function slerpDirection(a, b, k, turn) {
  if (turn < 1e-6) return b;
  const sin = Math.sin(turn);
  return normalize(add(scale(a, Math.sin((1 - k) * turn) / sin), scale(b, Math.sin(k * turn) / sin)));
}

/**
 * How far off the aim a body stood (degrees): the angle between the aim and the nearest point of the body's axis (feet
 * to crown) to the aim's line from the eyes.
 */
export function offAimDegrees(eye, forward, base, top) {
  const far = add(eye, scale(forward, 50));
  const near = segmentDistance(eye, far, base, { x: base.x, y: base.y + top, z: base.z });
  const point = { x: base.x, y: base.y + near.t * top, z: base.z };
  const toward = normalize(sub(point, eye));
  return Math.acos(Math.max(-1, Math.min(1, dot(toward, forward)))) / DEG;
}
