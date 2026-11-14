// What a foot (or a whole knight coming down) throws up off the ground under it: the look of a footfall and a landing,
// by what the floor is made of. Pure: the runtime asks what is underfoot and how much to draw, Effects draws it.
// Cosmetic only: nothing here touches movement, collision or the host's state.

// what a floor's material is to a foot: grass, earth, stone or timber
const CONTACT_OF = Object.freeze({
  grass: 'grass', hedge: 'grass', straw: 'grass',
  earth: 'earth', dirt: 'earth', mud: 'earth', sand: 'earth',
  stone: 'stone', limestone: 'stone', arcane: 'stone', paving: 'stone', plaster: 'stone', iron: 'stone', brass: 'stone',
  timber: 'timber', wood: 'timber',
});

/** The contact kind for a floor material ('earth' for anything unknown). */
export function contactOf(material) {
  return CONTACT_OF[material] ?? 'earth';
}

/**
 * What is underfoot at (x, z) for a body standing at y: the highest floor or ramp top within a step of the feet.
 * A ramp is the world's `rampMaterial` (stone if it names none).
 */
export function groundContactAt(world, x, z, y = 0) {
  let best = null;
  let height = -Infinity;
  for (const floor of world?.floors ?? []) {
    if (Math.abs(x - floor.center[0]) > floor.size[0] / 2 || Math.abs(z - floor.center[2]) > floor.size[2] / 2) continue;
    const top = floor.y ?? floor.center[1] + floor.size[1] / 2;
    if (top <= y + 0.65 && top > height + 1e-6) { height = top; best = floor.material; }
  }
  for (const ramp of world?.ramps ?? []) {
    if (x < ramp.minX || x > ramp.maxX || z < ramp.minZ || z > ramp.maxZ) continue;
    const t = ramp.axis === 'z' ? (z - ramp.minZ) / (ramp.maxZ - ramp.minZ) : (x - ramp.minX) / (ramp.maxX - ramp.minX);
    const top = ramp.startY + (ramp.endY - ramp.startY) * Math.max(0, Math.min(1, t));
    if (top <= y + 0.65 && top >= height - 0.05) { height = top; best = ramp.material ?? world.rampMaterial ?? 'stone'; }
  }
  return best === null ? null : contactOf(best);
}

// How far off a knight's feet are still worth drawing (beyond it a puff is a pixel), and the share of the effect
// budget footfalls may take before they give way to the fight's own effects.
export const CONTACT_LIMITS = Object.freeze({ footfallRange: 24, landingRange: 40, footfallBudget: 0.55, landingBudget: 0.8 });

// per contact: the puff's colour, how much a step raises, and what else comes up with it
const LOOK = Object.freeze({
  grass: Object.freeze({ dust: 0xb9b98e, puff: 0.35, blades: true, grit: 0 }),
  earth: Object.freeze({ dust: 0xc4a983, puff: 1, blades: false, grit: 0.4 }),
  stone: Object.freeze({ dust: 0xd3cec2, puff: 0.45, blades: false, grit: 0.6 }),
  timber: Object.freeze({ dust: 0xc9b48f, puff: 0.3, blades: false, grit: 0 }),
});

/**
 * A footfall's plan: puffs (0..2), their size, blades of grass flicked up, grit kicked. heavy: 0 walking .. 1 sprinting.
 * A walking step on grass raises next to nothing; a sprint on a dry road kicks a little cloud.
 */
export function footfallPlan(contact, heavy = 0) {
  const look = LOOK[contact] ?? LOOK.earth;
  const h = Math.max(0, Math.min(1, heavy));
  const amount = look.puff * (0.45 + 0.75 * h);
  return {
    contact,
    color: look.dust,
    puffs: amount >= 0.85 ? 2 : amount >= 0.22 ? 1 : 0,
    size: 0.22 + 0.16 * h,
    rise: 0.25 + 0.25 * h,
    life: 0.42 + 0.18 * h,
    blades: look.blades && h > 0.5 ? 1 : 0,
    grit: look.grit * h >= 0.35 ? 2 : 0,
  };
}

/**
 * A landing's plan, strength 0..1 (spellbladeMotion's landingStrength): none below a hop; above it, a low ring of
 * dust thrown out round the feet, grit (or grass) kicked up, and for a heavy one a slower pall that settles back.
 */
export function landingPlan(contact, strength = 0) {
  const s = Math.max(0, Math.min(1, strength));
  if (s < 0.2) return null;
  const look = LOOK[contact] ?? LOOK.earth;
  const soft = contact === 'grass' || contact === 'timber';
  return {
    contact,
    color: look.dust,
    ring: Math.round(4 + 6 * s * (soft ? 0.6 : 1)),
    radius: 0.9 + 1.4 * s,
    size: 0.3 + 0.25 * s,
    grit: look.grit ? Math.round(3 + 6 * s * look.grit) : 0,
    blades: look.blades ? Math.round(2 + 4 * s) : 0,
    settle: s >= 0.55 ? Math.round(2 + 3 * s) : 0,
  };
}

/** Whether a contact effect at `point` is worth drawing for a camera at `eye`, given the effects already alive. */
export function contactWorthDrawing(point, eye, { range, used, budget }) {
  if (!point || !eye) return false;
  if (used > budget) return false;
  const dx = point.x - eye.x, dy = (point.y ?? 0) - eye.y, dz = point.z - eye.z;
  return dx * dx + dy * dy + dz * dz <= range * range;
}
