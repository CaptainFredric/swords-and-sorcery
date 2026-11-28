/**
 * Which renderer draws a machine. A snapshot's machine carries its class in several fields: kind (ram, ballista,
 * flight) and, spread from the simulation object, class and type (so-fist-ication, bi-bye-llista, fight-and-flight).
 * Reading type first sent every Fight-and-Flight to the ram renderer: a SO-FIST-ICATION drawn wherever the aircraft
 * flew, rising, hovering and banking over the battlefield.
 */
export function fleetRenderKind(machine) {
  const value = machine?.kind ?? machine?.class ?? machine?.type;
  if (value === 'dragoon' || value === 'drag-oon' || machine?.fuel !== undefined) return 'dragoon';
  if (value === 'flight' || value === 'fight-and-flight') return 'flight';
  if (value === 'ballista' || value === 'bi-bye-llista') return 'ballista';
  return 'ram';
}
