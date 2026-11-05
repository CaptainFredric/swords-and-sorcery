// One collision contract for authoritative foot movement and browser prediction.
// A machine's occupied solids must not exist only on the host: otherwise the
// local camera walks through it and is dragged backwards every snapshot.
import { getBiByeSolids } from './biByeLlista.mjs';
import { soFistSolids } from './soFistGeometry.mjs';
import { fightFlightSolids } from './fightFlight.mjs';

export function playerMovementWorld(world, { ballista = null, ram = null, flight = null } = {}) {
  const occupied = [...getBiByeSolids(ballista), ...soFistSolids(ram), ...fightFlightSolids(flight)];
  return occupied.length
    ? { ...world, solids: [...(world.solids ?? []), ...occupied] }
    : world;
}
