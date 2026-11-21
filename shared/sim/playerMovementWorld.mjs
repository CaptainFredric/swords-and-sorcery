// One collision contract for authoritative foot movement and browser prediction.
// A machine's occupied solids must not exist only on the host: otherwise the
// local camera walks through it and is dragged backwards every snapshot.
import { getBiByeSolids } from './biByeLlista.mjs';
import { soFistSolids } from './soFistGeometry.mjs';
import { fightFlightSolids } from './fightFlight.mjs';

// A detached gauntlet is an actual block of steel for knights AND fired
// projectiles, never an additional target to be moved by ordinary footsteps.
export function detachedRamFistSolid(ram){
  const fist=ram?.detachedFist;
  if(!fist?.position||ram?.wreckVisualExpired||
     !['rolling','resting'].includes(fist.state))return null;
  return {id:'sofist-detached-'+ram.id,material:'steel',
    center:[fist.position.x,fist.position.y,fist.position.z],
    size:[1.65,1.22,1.65]};
}
export function playerMovementWorld(world, { ballista = null, ram = null, flight = null } = {}) {
  // World-space steel gauntlet: one shared host/client collision primitive.
  const detachedSolid=detachedRamFistSolid(ram);
  const occupied = [...getBiByeSolids(ballista), ...soFistSolids(ram),
    ...fightFlightSolids(flight),...(detachedSolid?[detachedSolid]:[])];
  return occupied.length
    ? { ...world, solids: [...(world.solids ?? []), ...occupied] }
    : world;
}
