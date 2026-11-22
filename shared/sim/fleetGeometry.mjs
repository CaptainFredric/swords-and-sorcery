import { soFistSolids, soFistVolumes, soFistFirstHit } from './soFistGeometry.mjs';
import { damageSoFistication, blastSoFistication } from './soFistication.mjs';
import { getBiByeSolids, damageBiByeLlista, blastBiByeLlista } from './biByeLlista.mjs';
import { biByeHitVolumes, biByeFirstHit } from './biByeComponents.mjs';
import { fightFlightSolids } from './fightFlight.mjs';
import { fightFlightHitVolumes, fightFlightFirstHit, damageFightFlight } from './fightFlightComponents.mjs';
import { areAllies } from '../src/teams.mjs';

export function getMachineKind(m) {
  if (!m) return null;
  if (m.kind === 'flight' || m.class === 'fight-and-flight' || m.class === 'flight' || m.type === 'fight-and-flight' || m.type === 'flight' || m.rotorHP !== undefined) return 'flight';
  if (m.kind === 'ballista' || m.class === 'bi-bye-llista' || m.class === 'ballista' || m.type === 'bi-bye-llista' || m.type === 'ballista' || m.weaponFocus !== undefined) return 'ballista';
  if (m.kind === 'ram' || m.class === 'so-fist-ication' || m.class === 'ram' || m.type === 'so-fist-ication' || m.type === 'ram' || m.components?.Fist !== undefined || m.pressure !== undefined) return 'ram';
  return 'machine';
}

/**
 * Returns all active machines in a room.
 * Supports both modern multi-instance room.machines Map and legacy singleton properties.
 */
export function getFleetMachines(room) {
  if (!room) return [];
  if (room.machines && room.machines.size > 0) {
    return [...room.machines.values()];
  }
  const legacy = [];
  if (room.soFistication) legacy.push(room.soFistication);
  if (room.biByeLlista) legacy.push(room.biByeLlista);
  if (room.fightFlight) legacy.push(room.fightFlight);
  return legacy;
}

/**
 * Returns bounding solids for all active machines, excluding a specified machine ID.
 */
export function getFleetSolids(room, excludeMachineId = null) {
  const solids = [];
  for (const m of getFleetMachines(room)) {
    if (m.id === excludeMachineId || m.health <= 0 || m.retired) continue;
    const kind = getMachineKind(m);
    if (kind === 'ram') {
      solids.push(...soFistSolids(m));
    } else if (kind === 'ballista') {
      solids.push(...getBiByeSolids(m));
    } else if (kind === 'flight') {
      solids.push(...fightFlightSolids(m));
    }
  }
  return solids;
}

/**
 * Returns articulated hit volumes for all active machines, excluding a specified operator.
 */
export function getFleetHitVolumes(room, excludeMachineId = null, nowSec = 0) {
  const volumes = [];
  for (const m of getFleetMachines(room)) {
    if (m.id === excludeMachineId || m.health <= 0 || m.retired) continue;
    const kind = getMachineKind(m);
    if (kind === 'ram') {
      volumes.push(...soFistVolumes(m, nowSec).map(v => ({ ...v, machineId: m.id })));
    } else if (kind === 'ballista') {
      volumes.push(...biByeHitVolumes(m, nowSec).map(v => ({ ...v, machineId: m.id })));
    } else if (kind === 'flight') {
      volumes.push(...fightFlightHitVolumes(m).map(v => ({ ...v, machineId: m.id })));
    }
  }
  return volumes;
}

/**
 * Sweeps a segment against all machines in the room.
 * Returns the closest hit or null.
 */
export function raycastFleet(room, from, to, options = {}) {
  const { excludeMachineId = null, attackerId = null, nowSec = 0, radius = 0 } = options;
  const a = Array.isArray(from) ? from : [from.x, from.y, from.z];
  const b = Array.isArray(to) ? to : [to.x, to.y, to.z];

  let closest = null;
  for (const m of getFleetMachines(room)) {
    if (m.id === excludeMachineId || m.health <= 0 || m.retired) continue;
    if (attackerId && m.operatorId && areAllies(room, attackerId, m.operatorId)) continue;

    let hit = null;
    const kind = getMachineKind(m);
    if (kind === 'ram') {
      hit = soFistFirstHit(m, a, b, nowSec, radius);
    } else if (kind === 'ballista') {
      hit = biByeFirstHit(m, a, b, nowSec, radius);
    } else if (kind === 'flight') {
      hit = fightFlightFirstHit(m, a, b, radius);
    }

    if (hit && (!closest || hit.t < closest.t)) {
      closest = {
        ...hit,
        targetMachine: m,
        kind,
        point: Array.isArray(hit.point)
          ? { x: hit.point[0], y: hit.point[1], z: hit.point[2] }
          : { ...hit.point },
      };
    }
  }
  return closest;
}

/**
 * Applies area damage/blast to all machines within radius.
 */
export function blastFleet(room, blast, attackerId, source, nowSec, excludeMachineIds = []) {
  const { point, radius, damage } = blast;
  const excluded = Array.isArray(excludeMachineIds) ? excludeMachineIds : (excludeMachineIds ? [excludeMachineIds] : []);
  for (const m of getFleetMachines(room)) {
    if (m.health <= 0 || m.retired) continue;
    if (excluded.includes(m.id)) continue;
    if (attackerId && m.operatorId && areAllies(room, attackerId, m.operatorId)) continue;

    const kind = getMachineKind(m);
    if (kind === 'ram') {
      blastSoFistication(room, m, blast, attackerId, source, nowSec);
    } else if (kind === 'ballista') {
      blastBiByeLlista(room, m, blast, attackerId, source, nowSec, room.world?.solids ?? []);
    } else if (kind === 'flight') {
      const d = Math.hypot(m.x - point.x, m.y - point.y, m.z - point.z);
      if (d <= radius) {
        const falloff = Math.max(0, 1 - d / (radius || 1));
        damageFightFlight(room, m, damage * falloff, attackerId, source, nowSec, { point });
      }
    }
  }
}
