// Gale Garner's gust: where a body stands in it, how hard it is shoved, and how a gust driven into the ground throws
// its caster. Pure (plain vectors in, plain vectors out); the server resolves it (shared/sim/combat.mjs) and the
// client predicts its own caster's recoil from the same function.
//
// A body is caught by the gust's pressure (0..1) if it stands in the wider, longer outer cone, and by its heart
// (exposure 0..1, for the little damage it does) if in the inner one; both fall evenly to nothing with distance and
// with angle off the gust's line (no bands): the pressure is strongest near the hand and still a real shove far out,
// and across the cone its middle is full strength, easing to nothing at the edge. The shove runs along the gust (a
// little outward from its line, a little lifting). `sign` is the direction of the force: +1 pushes; a future pull (a
// vacuum left behind a spell) would be -1 through the same field.

import { segmentAabbHit, surfaceHeightAt } from './collision.mjs';
import { POSTURES } from './body.mjs';

const DEG = Math.PI / 180;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (a) => Math.hypot(a.x, a.y, a.z);
const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const normalize = (a) => { const n = length(a); return n > 1e-9 ? scale(a, 1 / n) : { x: 0, y: 0, z: 0 }; };
const smoothstep = (t) => { const s = Math.max(0, Math.min(1, t)); return s * s * (3 - 2 * s); };

// how strongly the gust reaches a point at `distance` and `angle` off its line, within `reach` and `halfAngle`:
// (1 - d / reach) ^ bend along it, full across the `core` share of its angle and easing out to the edge
function falloff(distance, angle, reach, halfAngle, bend = 1, core = 0) {
  if (!(distance < reach) || !(angle < halfAngle)) return 0;
  const near = (1 - distance / reach) ** bend;
  const on = 1 - smoothstep((angle / halfAngle - core) / (1 - core));
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
    pressure: falloff(distance, angle, c.pressureReach, c.pressureHalfAngleDeg * DEG, c.bend ?? 1, c.core ?? 0),
    exposure: falloff(distance, angle, c.reach, c.halfAngleDeg * DEG, 1, c.core ?? 0),
    distance,
    angle,
  };
}

// a Spellblade's body for the gust: an upright column, sampled up its height
const BODY_HEIGHTS = Object.freeze([0.25, 0.6, 0.95, 1.3, 1.65]);

/**
 * Where a whole body at `position` (its feet) sits in the gust: the part of it the gust catches best (a gust at
 * someone's chest or legs is a gust on them). { pressure, exposure, point, ... } as galeAt. crown: how high the body
 * reaches (a crouched one is sampled lower down).
 */
export function galeOnBody(spell, origin, direction, position, crown = POSTURES.standing.crown) {
  let best = null;
  const scale = crown / POSTURES.standing.crown;
  for (const height of BODY_HEIGHTS) {
    const point = { x: position.x, y: position.y + height * scale, z: position.z };
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
 * A gust driven into the ground or a wall throws its caster off it, straight back along the gust: aimed straight down
 * it lifts them, down and behind sends them forward and up, down and ahead back and up. Full strength while the
 * surface is within `full` of the eyes, fading out to `reach`; the more squarely the gust meets it, the harder (one
 * that only grazes a wall hardly throws them at all). `eye`: where the gust leaves from. Null when the gust meets
 * nothing within the recoil's reach. Apply it with launchBody (shared/src/movement.mjs), capped at `maxUp`.
 */
export function galeRecoil(spell, eye, direction, world) {
  const r = spell.recoil;
  if (!r) return null;
  const end = { x: eye.x + direction.x * r.reach, y: eye.y + direction.y * r.reach, z: eye.z + direction.z * r.reach };
  let hit = null;
  let normal = null;
  for (const box of world?.solids ?? []) {
    const found = segmentAabbHit([eye.x, eye.y, eye.z], [end.x, end.y, end.z], box);
    if (found && (hit === null || found.t * r.reach < hit)) {
      hit = found.t * r.reach;
      normal = found.normal;
    }
  }
  // the ground: stepped along the gust until it is at or below the surface under it
  if (direction.y < -0.05) {
    for (let d = 0.1; d <= r.reach && (hit === null || d < hit); d += 0.1) {
      const x = eye.x + direction.x * d;
      const y = eye.y + direction.y * d;
      const z = eye.z + direction.z * d;
      const ground = surfaceHeightAt(x, z, eye.y, world);
      if (ground !== null && y <= ground) {
        hit = d;
        normal = [0, 1, 0];
        break;
      }
    }
  }
  if (hit === null) return null;
  // (a gust that starts inside a solid has no face to meet: it counts as square on)
  const facing = normal && (normal[0] || normal[1] || normal[2]);
  const square = facing ? Math.abs(direction.x * normal[0] + direction.y * normal[1] + direction.z * normal[2]) : 1;
  const full = r.full ?? 0;
  const near = 1 - smoothstep((hit - full) / Math.max(1e-6, r.reach - full));
  const strength = r.push * near * square ** 0.75;
  return { x: -direction.x * strength, y: -direction.y * strength, z: -direction.z * strength, maxUp: r.maxUp };
}
