// A Spellblade's body, standing or crouched: the one description everything reads (the world's walls and ceilings,
// every blow and blast, the eyes). Crouching is a real posture, not a lowered camera: the body is shorter, so it fits
// under what a standing knight cannot and whatever passes over it misses it, and it cannot stand up again until there
// is room over its head. It is no dodge and gives nothing hidden: it moves slower, cannot sprint or jump, and a blow
// aimed at it lands as on anyone. Current tuning (provisional).

export const POSTURES = Object.freeze({
  // height: feet to crown; center: the body's middle (a blast's heart, a spell's aim); eye: the head, where blows and
  // spells are judged from; camera: where the first-person view sits (a little above, as the helm's slit is)
  standing: Object.freeze({ height: 1.8, center: 0.9, eye: 1.35, camera: 1.58, crown: 1.75 }),
  crouched: Object.freeze({ height: 1.2, center: 0.6, eye: 0.85, camera: 1.08, crown: 1.15 }),
});

export const CROUCH = Object.freeze({
  speed: 0.5,          // share of the run it keeps
  // how quickly the first-person view settles to the new height (seconds): the body changes at once
  viewSec: 0.14,
});

/** The body a knight has now (or had, from a lag-compensated transform): standing unless `crouched`. */
export function postureOf(body) {
  return body?.crouched ? POSTURES.crouched : POSTURES.standing;
}

/**
 * Whether a body at `position` (its feet) has room to stand: nothing solid over it between its crouched crown and
 * a standing one, within `radius` across.
 */
export function roomToStand(position, radius, world) {
  const from = position.y + POSTURES.crouched.height;
  const to = position.y + POSTURES.standing.height;
  for (const box of world?.solids ?? []) {
    const minY = box.center[1] - box.size[1] / 2;
    const maxY = box.center[1] + box.size[1] / 2;
    if (maxY <= from || minY >= to) continue;
    const halfX = box.size[0] / 2;
    const halfZ = box.size[2] / 2;
    const dx = Math.max(0, Math.abs(position.x - box.center[0]) - halfX);
    const dz = Math.max(0, Math.abs(position.z - box.center[2]) - halfZ);
    if (dx * dx + dz * dz < radius * radius) return false;
  }
  return true;
}
