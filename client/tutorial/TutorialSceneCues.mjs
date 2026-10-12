// Reusable spatial observations for authored scenes. Dialogue is never consulted.
export function tutorialSceneCue(gate, {player, rival, route, elapsedSec = 0}) {
  if (gate.kind === 'fact') return false; // Combat and movement adapters own these facts.
  if (gate.kind === 'separation') return Boolean(player?.alive && rival?.alive)
    && elapsedSec >= (gate.minSec ?? 0)
    && Math.hypot(player.position.x-rival.position.x,player.position.z-rival.position.z) >= gate.distance;
  const actor = gate.actor === 'player' ? player : rival;
  if (!actor?.alive) return false;
  const target = gate.kind === 'near-entrance' ? route.entrance
    : route.waypointById[gate.landmark] ?? route.landmarks[gate.landmark];
  if (!target) throw new Error(`Unknown tutorial landmark: ${gate.landmark ?? gate.kind}`);
  if (gate.kind === 'near-entrance' || gate.kind === 'near-landmark') {
    return Math.hypot(actor.position.x-target.x,actor.position.z-target.z) <= gate.distance
      && (gate.playerDistance === undefined || Math.hypot(player.position.x-rival.position.x,player.position.z-rival.position.z) <= gate.playerDistance);
  }
  if (gate.kind === 'past-landmark') {
    const axis = gate.axis ?? 'z';
    return (actor.position[axis]-target[axis]) * (gate.direction ?? -1) >= 0 && (!gate.grounded || actor.grounded);
  }
  throw new Error(`Unknown tutorial scene observation: ${gate.kind}`);
}
