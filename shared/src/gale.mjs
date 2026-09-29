// Gale Garner's gust: where a body stands in it, how hard it is shoved, and how a gust driven into the ground throws
// its caster. Pure (plain vectors in, plain vectors out); the server resolves it (shared/sim/combat.mjs) and the
// client predicts its own caster's recoil from the same function.
//
// A body is caught by the gust's pressure (0..1) if it stands in the wider, longer outer cone, and by its heart
// (exposure 0..1, for the little damage it does) if in the inner one; both fall evenly to nothing with distance and
// with angle off the gust's line (no bands). The shove runs along the gust (a little outward from its line, a little
// lifting). `sign` is the direction of the force: +1 pushes; a future pull (a vacuum left behind a spell) would be -1
// through the same field.

import { segmentAabbHit, surfaceHeightAt } from './collision.mjs';

const DEG = Math.PI / 180;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (a) => Math.hypot(a.x, a.y, a.z);
const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const normalize = (a) => { const n = length(a); return n > 1e-9 ? scale(a, 1 / n) : { x: 0, y: 0, z: 0 }; };
const smoothstep = (t) => { const s = Math.max(0, Math.min(1, t)); return s * s * (3 - 2 * s); };

// how strongly the gust reaches a point at `distance` and `angle` off its line, within `reach` and `halfAngle`
function falloff(distance, angle, reach, halfAngle) {
  if (!(distance < reach) || !(angle < halfAngle)) return 0;
  const near = (1 - distance / reach) ** 1.25;
  const on = 1 - smoothstep(angle / halfAngle);
  return near * on;
}

/**
 * Where `point` stands in a gust from `origin` along the unit `direction`: { pressure (0..1: how hard it is shoved),
 * exposure (0..1: how directly the heart caught it, for damage), distance, angle }.
 */
export function galeAt(spell, origin, direction, point) {
  const rel = sub(point, origin);
  const distance = length(rel);
  if (distance < 1e-6) return { pressure: 1, exposure: 1, distance: 0, angle: 0 };
  const along = dot(rel, direction);
  if (along <= 0) return { pressure: 0, exposure: 0, distance, angle: Math.PI };
  const angle = Math.acos(Math.max(-1, Math.min(1, along / distance)));
  const c = spell.cone;
  return {
    pressure: falloff(distance, angle, c.pressureReach, c.pressureHalfAngleDeg * DEG),
    exposure: falloff(distance, angle, c.reach, c.halfAngleDeg * DEG),
    distance,
    angle,
  };
}

// a Spellblade's body for the gust: an upright column, sampled up its height
const BODY_HEIGHTS = Object.freeze([0.25, 0.6, 0.95, 1.3, 1.65]);

/**
 * Where a whole body standing at `position` (its feet) sits in the gust: the part of it the gust catches best
 * (a gust at someone's chest or legs is a gust on them). { pressure, exposure, point, ... } as galeAt.
 */
export function galeOnBody(spell, origin, direction, position) {
  let best = null;
  for (const height of BODY_HEIGHTS) {
    const point = { x: position.x, y: position.y + height, z: position.z };
    const caught = galeAt(spell, origin, direction, point);
    if (!best || caught.pressure > best.pressure) best = { ...caught, point };
  }
  return best;
}

/** The shove (m/s) a gust gives a body at `point` caught with this `pressure`: along the gust, a little out, a little up. */
export function galeShove(spell, origin, direction, point, pressure, sign = 1) {
  const c = spell.cone;
  const out = normalize(sub(point, origin));
  const way = normalize({ x: direction.x * 0.75 + out.x * 0.25, y: direction.y * 0.75 + out.y * 0.25, z: direction.z * 0.75 + out.z * 0.25 });
  const strength = c.push * Math.max(0, Math.min(1, pressure)) * sign;
  return { x: way.x * strength, y: way.y * strength + Math.abs(strength) * c.lift, z: way.z * strength };
}

/**
 * A gust driven into the ground or a wall close in front throws its caster back off it (aimed down and behind, it
 * sends them forward and up): the closer the surface, the harder. `eye`: where the gust leaves from. Null when the
 * gust meets nothing within the recoil's reach.
 */
export function galeRecoil(spell, eye, direction, world) {
  const r = spell.recoil;
  if (!r) return null;
  const end = { x: eye.x + direction.x * r.reach, y: eye.y + direction.y * r.reach, z: eye.z + direction.z * r.reach };
  let hit = null;
  for (const box of world?.solids ?? []) {
    const found = segmentAabbHit([eye.x, eye.y, eye.z], [end.x, end.y, end.z], box);
    if (found && (hit === null || found.t * r.reach < hit)) hit = found.t * r.reach;
  }
  // the ground: stepped along the gust until it is at or below the surface under it
  if (direction.y < -0.05) {
    for (let d = 0.1; d <= r.reach && (hit === null || d < hit); d += 0.1) {
      const x = eye.x + direction.x * d;
      const y = eye.y + direction.y * d;
      const z = eye.z + direction.z * d;
      const ground = surfaceHeightAt(x, z, eye.y, world);
      if (ground !== null && y <= ground) { hit = d; break; }
    }
  }
  if (hit === null) return null;
  const strength = r.push * (1 - hit / r.reach) ** 0.7;
  return { x: -direction.x * strength, y: Math.min(r.maxUp, -direction.y * strength), z: -direction.z * strength };
}
