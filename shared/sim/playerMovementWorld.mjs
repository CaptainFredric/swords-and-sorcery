// One collision contract for authoritative foot movement and browser prediction.
// A machine's occupied solids must not exist only on the host: otherwise the
// local camera walks through it and is dragged backwards every snapshot.
import { getBiByeSolids } from './biByeLlista.mjs';
import { soFistSolids } from './soFistGeometry.mjs';
import { fightFlightSolids } from './fightFlight.mjs';

export function playerMovementWorld(world, { ballista = null, ram = null, flight = null } = {}) {
  const fist=ram?.detachedFist;
  // World-space steel gauntlet: a settled launch is actual cover, not a
  // visual pickup ring. This very same function runs on host and client, so
  // no rubber-banding through the fist on remote player movement.
  const detachedSolid=fist?.position&&!ram?.wreckVisualExpired&&
    ['rolling','resting'].includes(fist.state)
    ? [{id:'sofist-detached-'+ram.id,material:'steel',
      center:[fist.position.x,fist.position.y,fist.position.z],
      size:[1.65,1.22,1.65]}] : [];
  const occupied = [...getBiByeSolids(ballista), ...soFistSolids(ram),
    ...fightFlightSolids(flight),...detachedSolid];
  return occupied.length
    ? { ...world, solids: [...(world.solids ?? []), ...occupied] }
    : world;
}
