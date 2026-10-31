// First multiplayer-compatible siege foundry slice. This uses existing
// authoritative machine lifecycle/state, NEVER creates client-side fake siege.
// Engine currently stores one instance per vehicle class per room; production
// rejects a second active instance of that same class until the collection
// refactor can support true mirror-match fleets.
import { createBiByeLlista, getBiByeSolids } from './biByeLlista.mjs';
import { biByeTerrainContext, biByeTerrainPose, biByeTerrainClear, biByeDeploymentSupport } from './biByeTerrain.mjs';
import { createSoFistication, soFistTerrainPose, soFistClear } from './soFistication.mjs';
import { soFistSolids } from './soFistGeometry.mjs';
import { createFightFlight, fightFlightExit, fightFlightSolids } from './fightFlight.mjs';
import { fightFlightConstructionClear } from './practiceFightFlight.mjs';
import { HIGH_GROUNDS_RULES } from './highGroundsMode.mjs';

export const HIGH_GROUNDS_MACHINES = Object.freeze([
  'bi-bye-llista', 'so-fist-ication', 'fight-and-flight',
]);
const fieldOf = Object.freeze({
  'bi-bye-llista': 'biByeLlista',
  'so-fist-ication': 'soFistication',
  'fight-and-flight': 'fightFlight',
});
function running(machine) {
  return machine && !machine.retired && machine.mode !== 'DESTROYED' && machine.health > 0;
}
export function requestHighGroundsMachine(room, player, type, now) {
  if (room?.mode !== 'HIGH_GROUNDS' || room.state !== 'PLAYING' || !room.highGrounds) {
    return { rejected: 'The High Grounds foundries operate during a territory match.' };
  }
  if (!HIGH_GROUNDS_MACHINES.includes(type)) return { rejected: 'Unknown siege machine.' };
  if (!player || player.actorKind !== 'human' || !player.alive ||
    player.operatingBallistaId || player.operatingRamId || player.operatingFightFlightId) {
    return { rejected: 'A living, dismounted Spellblade must claim production.' };
  }
  const f = room.highGrounds.foundries.find(site => site.team === player.team);
  if (!f || Math.hypot(player.position.x-f.x, player.position.z-f.z) >
    HIGH_GROUNDS_RULES.foundryInteractRadius || Math.abs(player.position.y - f.y) > 2) {
    return { rejected: 'Approach your own siege foundry to select a machine.' };
  }
  if (f.readyAt > now) return { rejected: 'The foundry is still recovering from production.' };
  const own = f.machine && room[fieldOf[f.machine]];
  if (own?.id === f.machineId && running(own)) {
    return { rejected: 'Your team already has a functioning siege machine.' };
  }
  const field = fieldOf[type];
  if (running(room[field])) {
    return { rejected: 'That machine type is already deployed. Choose another until fleet support is implemented.' };
  }
  const at = { x: f.spawnX, y: f.y, z: f.spawnZ, heading: f.heading };
  const other = [
    ...running(room.biByeLlista) ? getBiByeSolids(room.biByeLlista) : [],
    ...running(room.soFistication) ? soFistSolids(room.soFistication) : [],
    ...running(room.fightFlight) ? fightFlightSolids(room.fightFlight) : [],
  ];
  let machine = null, eventType = null, revision = null;
  if (type === 'bi-bye-llista') {
    revision = 'biByeRevision'; eventType = 'bibyeConstructed';
    const draft = createBiByeLlista({ x: at.x, y: at.y, z: at.z, baseYaw: at.heading, team: player.team });
    const ctx = biByeTerrainContext(room.world, draft, other);
    const pose = biByeTerrainPose(draft, ctx);
    if (pose && biByeTerrainClear({ ...draft, ...pose }, ctx) &&
      biByeDeploymentSupport({ ...draft, ...pose }, room.world).ok) {
      machine = Object.assign(draft, pose, { terrainInitialized: true, smallBoltReadyAt: now });
    }
  } else if (type === 'so-fist-ication') {
    revision = 'soFistRevision'; eventType = 'soFistConstructed';
    const draft = createSoFistication({ ...at, team: player.team });
    const pose = soFistTerrainPose(draft, room.world);
    if (pose && soFistClear({ ...draft, ...pose }, room.world, other, { operatorStation: true })) {
      machine = Object.assign(draft, pose);
    }
  } else {
    revision = 'fightFlightRevision'; eventType = 'fightFlightConstructed';
    const draft = createFightFlight({ ...at, team: player.team });
    if (fightFlightConstructionClear(room, at, null) && fightFlightExit(room, draft, player)) {
      machine = draft;
    }
  }
  if (!machine) return { rejected: 'The deployment corridor is obstructed or unsupported.' };
  // Only after every validation passes does production commit cooldown and
  // inventory. No choice overrides, no resource reset by operator handoff.
  room[revision] = (room[revision] ?? 0) + 1;
  machine.id = type + '-' + room.code + '-' + room[revision];
  if (type === 'fight-and-flight') machine.lifecycleId = machine.id;
  machine.builtAt = now;
  room[field] = machine;
  if (type === 'bi-bye-llista') room.bibyeProjectiles ??= new Map();
  if (type === 'fight-and-flight') room.fightFlightProjectiles ??= new Map();
  f.machineId = machine.id;
  f.machine = type;
  f.lastProducedAt = now;
  f.readyAt = now + HIGH_GROUNDS_RULES.foundryCooldownSec;
  room.events.push({ type: eventType, machineId: machine.id,
    ...(type === 'bi-bye-llista' ? { ballistaId: machine.id } : {}),
    rebuild: false, point: { x: machine.x, y: machine.y, z: machine.z }, at: now });
  room.events.push({ type: 'highGroundsProduced', team: player.team, typeId: type,
    machineId: machine.id, foundryId: f.id, readyAt: f.readyAt, at: now });
  return {};
}
