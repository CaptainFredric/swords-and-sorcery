// All Practice and Inspection summoning uses the same authoritative collision world.
// Candidates are deterministic so a shared room never invents a separate client pose.
import { resolvePlayerWorld, surfaceHeightAt } from '../src/collision.mjs';
import { playerMovementWorld } from './playerMovementWorld.mjs';

export function nearbyPracticeSpawn(room, playerId, excludeId = null, inspectionReference = null) {
  let anchor = room?.players?.get(playerId)
    ?? [...(room?.players?.values?.() ?? [])].find(player => player.actorKind === 'human');
  if (!anchor?.position || !Number.isFinite(anchor.yaw)) return null;
  const world = playerMovementWorld(room.world, {
    ballista: room.biByeLlista, ram: room.soFistication, flight: room.fightFlight,
  });
  const camera = inspectionReference;
  if (room.inspectionEnabled && camera && [camera.x, camera.y, camera.z, camera.yaw].every(Number.isFinite)) {
    // The local director's free camera can be high above the arena; anchor to
    // the highest real supporting floor below it before searching around it.
    const floor = surfaceHeightAt(camera.x, camera.z, camera.y + 1, world);
    if (floor !== null) anchor = { position: { x: camera.x, y: floor, z: camera.z }, yaw: camera.yaw };
  }
  const others = [...room.players.values()].filter(p => p.id !== excludeId && p.alive && p.position);
  const angles = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2,
    3 * Math.PI / 4, -3 * Math.PI / 4, Math.PI];
  // Prefer a useful sword/crossbow range; only fall back close when space is tight.
  for (const distance of [3, 2.5, 3.5, 2, 4]) {
    for (const angle of angles) {
      const yaw = anchor.yaw + angle;
      const x = anchor.position.x - Math.sin(yaw) * distance;
      const z = anchor.position.z - Math.cos(yaw) * distance;
      const y = surfaceHeightAt(x, z, anchor.position.y + 0.3, world);
      // A high ledge over an abyss is not a valid adjacent spawn.
      if (y === null || Math.abs(y - anchor.position.y) > 1.25) continue;
      const resolved = resolvePlayerWorld({ x, y, z }, 0.48, world.solids ?? [], 1.8);
      if (Math.hypot(resolved.x - x, resolved.z - z) > 0.03) continue;
      if (others.some(p => Math.abs(p.position.y - y) < 2 && Math.hypot(p.position.x - x, p.position.z - z) < 1.15)) continue;
      return { x, y, z, yaw: Math.atan2(x - anchor.position.x, z - anchor.position.z) };
    }
  }
  return null; // Never force a dummy through scenery or off the playable surface.
}
