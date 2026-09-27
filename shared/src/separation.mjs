import { MOVEMENT } from './movement.mjs';
import { resolvePlayerWorld, surfaceHeightAt } from './collision.mjs';

// Two Spellblades never stand inside each other. The spacing is closer than two full collision radii, so melee stays
// intimate (armour can brush), but bodies no longer occupy the same space.
export const SEPARATION = Object.freeze({
  minDistance: 0.75,
  // bodies overlap vertically unless one is clearly above the other (a jump over, a ledge)
  verticalReach: 1.5,
  // never shove someone off an edge: a push that would drop them more than this is refused
  maxDrop: 0.3,
});

/**
 * How far to move a (and the opposite for b), horizontally, so they end up minDistance apart.
 * Coincident bodies part along a fixed axis chosen by id so the result is deterministic.
 */
export function separationPush(a, b) {
  if (Math.abs((a.y ?? 0) - (b.y ?? 0)) >= SEPARATION.verticalReach) return null;
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  const distance = Math.hypot(dx, dz);
  if (distance >= SEPARATION.minDistance) return null;
  const overlap = SEPARATION.minDistance - distance;
  let nx = 1;
  let nz = 0;
  if (distance > 1e-6) {
    nx = dx / distance;
    nz = dz / distance;
  } else if (String(a.id ?? '') < String(b.id ?? '')) {
    nx = -1;
  }
  return { x: nx * overlap, z: nz * overlap };
}

// move a position by (dx, dz) unless that would walk it into a wall or off a ledge; returns the share applied
function tryMove(position, dx, dz, world) {
  const moved = resolvePlayerWorld(
    { ...position, x: position.x + dx, z: position.z + dz },
    MOVEMENT.playerRadius,
    world?.solids ?? [],
  );
  const ground = world ? surfaceHeightAt(moved.x, moved.z, position.y, world) : position.y;
  if (ground === null || position.y - ground > SEPARATION.maxDrop) return false;
  position.x = moved.x;
  position.z = moved.z;
  return true;
}

/** Authoritative: push every overlapping pair of living bodies apart, half each (all of it if one is pinned). */
export function separatePlayers(players, world) {
  const bodies = players.filter((player) => player.alive !== false);
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i];
      const b = bodies[j];
      const push = separationPush({ ...a.position, id: a.id }, { ...b.position, id: b.id });
      if (!push) continue;
      const aMoved = tryMove(a.position, push.x / 2, push.z / 2, world);
      const bMoved = tryMove(b.position, -push.x / 2, -push.z / 2, world);
      // one side is against a wall or an edge: the other gives way completely
      if (aMoved && !bMoved) tryMove(a.position, push.x / 2, push.z / 2, world);
      if (bMoved && !aMoved) tryMove(b.position, -push.x / 2, -push.z / 2, world);
    }
  }
}

/** Client prediction: move only the local body, by its half of each push (the server moves the other half). */
export function separateLocal(position, others, world) {
  for (const other of others) {
    const push = separationPush(position, other);
    if (push) tryMove(position, push.x / 2, push.z / 2, world);
  }
  return position;
}
