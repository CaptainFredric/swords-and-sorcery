// One collision contract for authoritative foot movement and browser prediction.
// A machine's occupied solids must not exist only on the host: otherwise the
// local camera walks through it and is dragged backwards every snapshot.
import { getBiByeSolids } from './biByeLlista.mjs';
import { soFistSolids } from './soFistGeometry.mjs';
import { fightFlightSolids } from './fightFlight.mjs';
import { dragOonSolids } from './dragOonGeometry.mjs';
import { getMachineKind } from './fleetGeometry.mjs';

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
export function playerMovementWorld(world, { ballista = null, ram = null, flight = null, dragOon = null, machines = null } = {}) {
  // World-space steel gauntlet: one shared host/client collision primitive.
  const occupied = [];
  const detachedSolids = [];
  if (machines) {
    for (const m of machines) {
      if (!m || m.health <= 0 || m.retired) continue;
      const kind = getMachineKind(m);
      if (kind === 'ram') {
        occupied.push(...soFistSolids(m));
        const detached = detachedRamFistSolid(m);
        if (detached) detachedSolids.push(detached);
      } else if (kind === 'ballista') {
        occupied.push(...getBiByeSolids(m));
      } else if (kind === 'flight') {
        occupied.push(...fightFlightSolids(m));
      } else if (kind === 'dragoon') {
        occupied.push(...dragOonSolids(m));
      }
    }
  } else {
    if (ram && !(ram.health <= 0) && !ram.retired) {
      occupied.push(...soFistSolids(ram));
      const detached = detachedRamFistSolid(ram);
      if (detached) detachedSolids.push(detached);
    }
    if (ballista && !(ballista.health <= 0) && !ballista.retired) {
      occupied.push(...getBiByeSolids(ballista));
    }
    if (flight && !(flight.health <= 0) && !flight.retired) {
      occupied.push(...fightFlightSolids(flight));
    }
    if (dragOon && !(dragOon.health <= 0) && !dragOon.retired) {
      occupied.push(...dragOonSolids(dragOon));
    }
  }
  occupied.push(...detachedSolids);
  return occupied.length
    ? { ...world, solids: [...(world.solids ?? []), ...occupied] }
    : world;
}
