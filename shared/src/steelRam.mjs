// Steel Dash Ram. Sheathed in Steel, a dash is an armoured charge: driven bodily into another knight, it gives them its
// momentum. A light blow, a hard shove and a good part of their balance; the dash stops dead where they met (the
// rammer set back a little, most of the momentum theirs). An ordinary dash is as it ever was.
//
// How strong the plate was as the dash began is what the ram is, all the way through it (plate wearing off mid-dash
// changes nothing), and it scales all of it: full plate rams for `damage`, `shove`, `lift` and `stagger`, half-worn
// for half; plate all but worn off (under `minStrength`) makes no ram, only a dash.
//
// A guard facing it braces: no harm, `guard.stamina` paid (by the ram's strength), a share of the shove and of the
// balance, and the dash still stops; no parry (a body check is no blade to turn). A guard it spends breaks, as any
// guard does. Plate on the one struck takes from the hurt only (steel.mjs), never the shove or the balance. It is no
// interrupt: it ends a dash they were in, and anything else only if their balance breaks (stagger.mjs). Only the first
// knight met, never one through a wall, never one just risen (spawn protection), never the dead. Pure but for the
// rules; combat.mjs makes it happen, and the client foresees its own (GameRuntime). Current tuning.

import { steelStrength } from './steel.mjs';

export const STEEL_RAM = Object.freeze({
  minStrength: 0.15,
  damage: 12,
  shove: 4,             // m/s across the ground (a sword blow's is 1.7)
  lift: 0.25,           // m/s upward
  stagger: 24,
  guard: Object.freeze({ stamina: 28, shove: 0.45, stagger: 0.4 }),
  // two armoured bodies meet when their middles are this close across the ground (they stand no closer than
  // separation.mjs SEPARATION.minDistance), and their feet within `vertical` of each other's height
  reach: 0.85,
  vertical: 1.2,
  // the rammer, stopped dead, is set back this much (m/s, as a shove)
  setback: 1.1,
  // a dash begun at a knight this near and this nearly straight at them is a Steel charge (for the voice: the dash
  // carries whom it was at)
  charge: Object.freeze({ range: 7.5, coneDeg: 30 }),
});

const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

/** How strong a ram a dash begun now would be (0: none): the plate's strength, if enough remains of it. */
export function ramStrength(steel, nowSec, rules = STEEL_RAM) {
  const strength = steelStrength(steel, nowSec);
  return strength >= rules.minStrength ? strength : 0;
}

/**
 * What a ram of `strength` does to the knight it meets: { damage (before any plate of theirs), shove, lift, stagger,
 * guardStamina }. guarded: met by their guard (no harm; the guard pays; a share of the shove and the balance).
 */
export function ramEffect(strength, { guarded = false } = {}, rules = STEEL_RAM) {
  const s = clamp01(strength);
  if (guarded) {
    return {
      damage: 0,
      shove: rules.shove * s * rules.guard.shove,
      lift: rules.lift * s * rules.guard.shove,
      stagger: rules.stagger * s * rules.guard.stagger,
      guardStamina: rules.guard.stamina * s,
    };
  }
  return { damage: Math.round(rules.damage * s), shove: rules.shove * s, lift: rules.lift * s, stagger: rules.stagger * s, guardStamina: 0 };
}

/**
 * The first body a rammer meets as their middle travels from `from` to `to` (feet, this tick): { id, t (0..1 along the
 * way), at (where the rammer's feet are as they meet), normal (unit, across the ground, from rammer to them) }, or
 * null. bodies: [{ id, position (feet) }]. Swept, so no dash can pass through a body between ticks; a body already
 * touching counts only if the way leads into it.
 */
export function ramContact(from, to, bodies, rules = STEEL_RAM) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const a = dx * dx + dz * dz;
  const reach2 = rules.reach * rules.reach;
  let best = null;
  for (const body of bodies) {
    const p = body.position;
    const fx = from.x - p.x;
    const fz = from.z - p.z;
    const c = fx * fx + fz * fz - reach2;
    let t;
    if (c <= 0) {
      // touching already: a ram only if the way leads into them
      if (a < 1e-12 || fx * dx + fz * dz >= 0) continue;
      t = 0;
    } else {
      if (a < 1e-12) continue;
      const b = 2 * (fx * dx + fz * dz);
      const disc = b * b - 4 * a * c;
      if (disc < 0) continue;
      t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0 || t > 1) continue;
    }
    const y = (from.y ?? 0) + ((to.y ?? 0) - (from.y ?? 0)) * t;
    if (Math.abs(y - (p.y ?? 0)) > rules.vertical) continue;
    if (best && t >= best.t) continue;
    const at = { x: from.x + dx * t, y, z: from.z + dz * t };
    const nx = p.x - at.x;
    const nz = p.z - at.z;
    const length = Math.hypot(nx, nz);
    best = { id: body.id, t, at, normal: length > 1e-9 ? { x: nx / length, z: nz / length } : { x: dx / Math.sqrt(a), z: dz / Math.sqrt(a) } };
  }
  return best;
}

/**
 * Whom a dash begun at `position` going `direction` ({x, z}) is a charge at: the nearest of `bodies` ({ id, position })
 * within `charge.range` and `charge.coneDeg` of the way it goes, or null.
 */
export function chargeTarget(position, direction, bodies, rules = STEEL_RAM) {
  const length = Math.hypot(direction?.x ?? 0, direction?.z ?? 0);
  if (length < 1e-9) return null;
  const wx = direction.x / length;
  const wz = direction.z / length;
  const cone = Math.cos((rules.charge.coneDeg * Math.PI) / 180);
  let best = null;
  for (const body of bodies) {
    const dx = body.position.x - position.x;
    const dz = body.position.z - position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-6 || distance > rules.charge.range) continue;
    if ((dx * wx + dz * wz) / distance < cone) continue;
    if (!best || distance < best.distance) best = { id: body.id, distance };
  }
  return best?.id ?? null;
}
