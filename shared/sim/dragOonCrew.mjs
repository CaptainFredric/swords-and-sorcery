// Cooperative Burning Brotherhood crew management, timed boarding/disembarkation transitions,
// aperture positioning, centralized elemental eligibility rules, and All Abort! occupant ejection.
import { elementForSpell } from '../src/oneHitInfusions.mjs';
import { isSpell } from '../src/spells.mjs';
import { areAllies } from '../src/teams.mjs';
import { segmentAabbHit } from '../src/collision.mjs';
import { DRAG_OON_ELEMENTS, DRAG_OON_GEOMETRY, DRAG_OON_TUNING } from '../src/dragOonConfig.mjs';
import { launchBody } from '../src/movement.mjs';
import {
  dragOonFrame,
  dragOonOperatorPose,
  dragOonPassengerStationPose,
  clampDragOonPassengerAim,
  dragOonExit,
} from './dragOonGeometry.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function dragOonElementForSpell(spellId) {
  if (!spellId || !isSpell(spellId)) return null;
  if (spellId === 'steel') return 'steel';
  return elementForSpell(spellId);
}

/**
 * Centralized rule computing active elemental counts & capped tiers (0, 1, 2)
 * from eligible seated crew plus Practice-only overrides.
 *
 * Eligibility defenses:
 * - Reads server-authoritative player.spell (validated via isSpell).
 * - Deduplicates within a single occupant so prepared lists / swaps cannot mint duplicate copies.
 * - Keeps distinct contributions from mixed or matching passengers simultaneously active.
 */
export function computeDragOonInfusions(room, m) {
  const counts = { fire: 0, frost: 0, gale: 0, lightning: 0, steel: 0 };
  if (!m || m.retired || m.health <= 0 || m.mode === 'DESTROYED') {
    return { counts, tiers: { ...counts }, contributors: [] };
  }

  const contributors = [];
  const collectSpellIds = (actor) => {
    if (!actor?.alive || (actor.actorKind === 'human' && actor.connected === false)) return [];
    const primary = isSpell(actor.spell) ? actor.spell : null;
    if (!DRAG_OON_TUNING.crew.allowMultiPreparedSpells) {
      return primary ? [primary] : [];
    }
    const set = new Set([primary, ...(actor.preparedSpells ?? [])].filter(isSpell));
    return [...set];
  };

  const evaluateOccupant = (actor, role, station = null) => {
    const spells = collectSpellIds(actor);
    const seenElementsThisActor = new Set();
    for (const spellId of spells) {
      const element = dragOonElementForSpell(spellId);
      if (!element) continue;
      // Unless multi-spell explicitly allows different elements, block duplicate element stacking per actor.
      if (seenElementsThisActor.has(element)) continue;
      seenElementsThisActor.add(element);
      counts[element] += 1;
      contributors.push({ playerId: actor.id, role, station, spell: spellId, element });
    }
  };

  if (DRAG_OON_TUNING.crew.pilotContributes && m.operatorId) {
    const op = room?.players?.get?.(m.operatorId);
    if (op && op.operatingDragOonId === m.id) evaluateOccupant(op, 'operator', null);
  }

  const capacity = clamp(m.passengerCapacity ?? DRAG_OON_TUNING.crew.defaultPassengerCapacity, 1, DRAG_OON_TUNING.crew.maxPassengerCapacity);
  for (let i = 0; i < capacity; i++) {
    const pid = m.passengers?.[i];
    if (!pid) continue;
    const p = room?.players?.get?.(pid);
    if (!p || p.aboardDragOonId !== m.id || !p.alive) continue;
    evaluateOccupant(p, 'passenger', i);
  }

  // Experimental Practice-only synthetic passenger spells & manual tier overrides.
  if (room?.mode === 'PRACTICE' && m.practiceOverrides) {
    for (const spellId of m.practiceOverrides.simulatedPassengers ?? []) {
      const element = dragOonElementForSpell(spellId);
      if (!element) continue;
      counts[element] += 1;
      contributors.push({ playerId: 'practice-sim', role: 'simulated', station: null, spell: spellId, element });
    }
    const overrides = m.practiceOverrides.infusions;
    if (overrides) {
      for (const el of DRAG_OON_ELEMENTS) {
        if (Number.isFinite(overrides[el])) {
          counts[el] = Math.max(counts[el], Math.max(0, Math.min(4, Math.trunc(overrides[el]))));
        }
      }
    }
  }

  const tiers = Object.fromEntries(
    DRAG_OON_ELEMENTS.map(el => [el, counts[el] >= 2 ? 2 : counts[el] >= 1 ? 1 : 0])
  );
  m.infusions = { counts, tiers };
  return { counts, tiers, contributors };
}

export function isDragOonOccupant(m, playerId) {
  if (!m || !playerId) return false;
  if (m.operatorId === playerId) return true;
  return Array.isArray(m.passengers) && m.passengers.includes(playerId);
}

export function dragOonOccupantIds(m) {
  const ids = [];
  if (m?.operatorId) ids.push(m.operatorId);
  for (const pid of m?.passengers ?? []) {
    if (pid && !ids.includes(pid)) ids.push(pid);
  }
  return ids;
}

export function dragOonFreeStation(m) {
  const cap = clamp(m?.passengerCapacity ?? DRAG_OON_TUNING.crew.defaultPassengerCapacity, 1, DRAG_OON_TUNING.crew.maxPassengerCapacity);
  const reserved = new Set(
    (m?.crewTransitions ?? [])
      .filter(t => t.kind === 'board' && t.role === 'passenger' && Number.isInteger(t.station))
      .map(t => t.station)
  );
  for (let i = 0; i < cap; i++) {
    if (!m.passengers?.[i] && !reserved.has(i)) return i;
  }
  return null;
}

function actorBusyElseWhere(player, m) {
  return Boolean(
    player.operatingRamId ||
    player.operatingBallistaId ||
    player.operatingFightFlightId ||
    (player.operatingDragOonId && player.operatingDragOonId !== m.id) ||
    (player.aboardDragOonId && player.aboardDragOonId !== m.id) ||
    player.hellpingCapturedBy ||
    player.hellpingCarriedBy ||
    player.restlessCarrying
  );
}

function canReachDragOonForBoarding(player, m) {
  const dx = player.position.x - m.x;
  const dz = player.position.z - m.z;
  const dy = player.position.y - m.y;
  // Compare against hull outer footprint + reach allowance so approaching any flank works cleanly.
  return Math.hypot(dx, dz) <= DRAG_OON_TUNING.crew.boardReachRadius && Math.abs(dy) <= 2.4;
}

export function cancelCrewTransitionsForPlayer(m, player) {
  if (!m) return;
  if (Array.isArray(m.crewTransitions)) {
    m.crewTransitions = m.crewTransitions.filter(t => t.playerId !== player.id);
  }
  if (player.dragOonTransition?.machineId === m.id) {
    player.dragOonTransition = null;
  }
}

/** Immediately seats an operator or passenger during mode spawning / Practice setup. */
export function assignDragOonCrewInstant(room, m, player, { role = 'operator', station = null, now = 0 } = {}) {
  if (!m || !player || !player.alive || m.health <= 0 || m.retired) return false;
  cancelCrewTransitionsForPlayer(m, player);
  if (role === 'operator') {
    if (m.operatorId && m.operatorId !== player.id) return false;
    m.operatorId = player.id;
    player.operatingDragOonId = m.id;
    player.aboardDragOonId = null;
    player.dragOonStation = null;
    player.position = dragOonOperatorPose(m);
  } else {
    const cap = clamp(m.passengerCapacity ?? DRAG_OON_TUNING.crew.defaultPassengerCapacity, 1, DRAG_OON_TUNING.crew.maxPassengerCapacity);
    const chosen = Number.isInteger(station) && station >= 0 && station < cap && !m.passengers[station]
      ? station
      : dragOonFreeStation(m);
    if (chosen == null) return false;
    m.passengers[chosen] = player.id;
    player.aboardDragOonId = m.id;
    player.dragOonStation = chosen;
    player.operatingDragOonId = null;
    const pose = dragOonPassengerStationPose(m, chosen, 'seat');
    player.position = { x: pose.x, y: pose.y, z: pose.z };
  }
  player.velocity = { x: 0, y: 0, z: 0 };
  player.impulse = { x: 0, z: 0 };
  player.sprinting = false;
  player.guardHeld = false;
  player.guarding = false;
  player.attackHeld = false;
  computeDragOonInfusions(room, m);
  room?.events?.push({ type: 'dragOonCrewBoarded', machineId: m.id, playerId: player.id, role, station: player.dragOonStation ?? null, at: now });
  return true;
}

/**
 * Initiates time-consuming cooperative boarding (operator or passenger seat).
 * Prevents teleporting mid-flight, stacking two players into one slot, or enemy boarding.
 */
export function requestDragOonBoard(room, m, player, now, { role = 'auto', station = null } = {}) {
  if (!m || m.retired || m.health <= 0 || m.mode === 'DESTROYED') {
    return { rejected: 'This DRAG-OON is destroyed.' };
  }
  if (!player?.alive || player.actorKind === 'human' && player.connected === false) {
    return { rejected: 'Unable to board right now.' };
  }
  if (actorBusyElseWhere(player, m) || isDragOonOccupant(m, player.id)) {
    return { rejected: 'Already operating or aboard a machine.' };
  }
  if ((player.staggerUntil ?? 0) > now || player.pendingSpell || player.ultimateState || player.swordTechnique) {
    return { rejected: 'Finish current combat action before boarding.' };
  }
  if (m.team && player.team && m.team !== player.team) {
    return { rejected: 'Cannot board an enemy DRAG-OON.' };
  }
  if (m.rite?.active) {
    return { rejected: 'Boarding is locked during Rite of Ascension.' };
  }
  if (m.campFire?.sealed) {
    return { rejected: 'Hatches are sealed during Camp Fire.' };
  }
  if (!m.grounded || Math.abs(m.velocity?.y ?? 0) > 1.5) {
    return { rejected: 'Cannot board an airborne DRAG-OON.' };
  }
  if (!canReachDragOonForBoarding(player, m)) {
    return { rejected: 'Move closer to DRAG-OON to board.' };
  }
  if ((m.crewTransitions ?? []).some(t => t.playerId === player.id)) {
    return { rejected: 'Already entering DRAG-OON.' };
  }

  let resolvedRole = role;
  const operatorReserved = (m.crewTransitions ?? []).some(t => t.kind === 'board' && t.role === 'operator');
  if (resolvedRole === 'auto') {
    resolvedRole = (!m.operatorId && !operatorReserved) ? 'operator' : 'passenger';
  }
  let targetStation = null;
  if (resolvedRole === 'operator') {
    if (m.operatorId || operatorReserved) return { rejected: 'Operator seat is occupied.' };
  } else {
    const cap = clamp(m.passengerCapacity ?? DRAG_OON_TUNING.crew.defaultPassengerCapacity, 1, DRAG_OON_TUNING.crew.maxPassengerCapacity);
    if (Number.isInteger(station)) {
      const taken = station < 0 || station >= cap || Boolean(m.passengers?.[station]) ||
        (m.crewTransitions ?? []).some(t => t.kind === 'board' && t.station === station);
      if (taken) return { rejected: 'That passenger station is occupied.' };
      targetStation = station;
    } else {
      targetStation = dragOonFreeStation(m);
      if (targetStation == null) return { rejected: 'All passenger stations are full.' };
    }
  }

  const duration = DRAG_OON_TUNING.crew.boardDurationSec;
  const transition = {
    playerId: player.id,
    kind: 'board',
    role: resolvedRole,
    station: targetStation,
    route: 'rear_bay_aisle',
    startedAt: now,
    endsAt: now + duration,
  };
  m.crewTransitions ??= [];
  m.crewTransitions.push(transition);
  player.dragOonTransition = {
    machineId: m.id, kind: 'board', role: resolvedRole, station: targetStation,
    route: 'rear_bay_aisle', startedAt: now, endsAt: transition.endsAt,
  };
  room?.events?.push({ type: 'dragOonBoardStarted', machineId: m.id, playerId: player.id, role: resolvedRole, station: targetStation, route: 'rear_bay_aisle', endsAt: transition.endsAt, at: now });
  return { transition };
}

/**
 * Initiates time-consuming disembarkation. Occupants are NOT safe outside until
 * disembarkation finishes; rapid repeated clicks cannot skip the evacuation timer.
 */
export function requestDragOonDisembark(room, m, player, now) {
  if (!m || !player || !isDragOonOccupant(m, player.id)) {
    return { rejected: 'Not aboard this DRAG-OON.' };
  }
  if (m.rite?.active) {
    return { rejected: 'Evacuation is locked during Rite of Ascension.' };
  }
  if (!m.grounded && !m.campFire?.settled) {
    return { rejected: 'Cannot safely evacuate while DRAG-OON is airborne.' };
  }
  const existing = (m.crewTransitions ?? []).find(t => t.playerId === player.id && t.kind === 'disembark');
  if (existing) {
    return { transition: existing };
  }
  const sealed = Boolean(m.campFire?.sealed);
  const duration = sealed ? DRAG_OON_TUNING.crew.campFireDisembarkDurationSec : DRAG_OON_TUNING.crew.disembarkDurationSec;
  const transition = {
    playerId: player.id,
    kind: 'disembark',
    role: m.operatorId === player.id ? 'operator' : 'passenger',
    station: player.dragOonStation ?? null,
    route: 'rear_bay_aisle',
    startedAt: now,
    endsAt: now + duration,
  };
  m.crewTransitions ??= [];
  m.crewTransitions.push(transition);
  player.dragOonTransition = {
    machineId: m.id, kind: 'disembark', station: transition.station,
    route: 'rear_bay_aisle', startedAt: now, endsAt: transition.endsAt,
  };
  // Sealed exits trigger hatch unsealing without keeping anyone permanently trapped inside.
  if (sealed && m.campFire && !m.campFire.reopeningAt) {
    m.campFire.reopeningForExitAt = now;
  }
  room?.events?.push({ type: 'dragOonDisembarkStarted', machineId: m.id, playerId: player.id, endsAt: transition.endsAt, sealedExit: sealed, route: 'rear_bay_aisle', at: now });
  return { transition };
}

/** Immediate administrative or forced exit (disconnect / round reset / All Abort!). */
export function removeDragOonOccupant(room, m, player, { exitPos = null, at = 0, reason = 'dismount' } = {}) {
  if (!m || !player) return false;
  cancelCrewTransitionsForPlayer(m, player);
  const wasOperator = m.operatorId === player.id;
  if (wasOperator) {
    m.operatorId = null;
    m.sprayHeld = false;
    m.sprayPrepStartedAt = null;
    if (m.raze?.phase === 'holding') m.raze.interruptedBy = 'pilotDeparture';
  }
  if (Array.isArray(m.passengers)) {
    for (let i = 0; i < m.passengers.length; i++) {
      if (m.passengers[i] === player.id) m.passengers[i] = null;
    }
  }
  player.operatingDragOonId = null;
  player.aboardDragOonId = null;
  player.dragOonStation = null;
  player.dragOonTransition = null;
  player.dragOonPose = null;
  if (exitPos) {
    player.position = { ...exitPos };
    player.velocity = { x: 0, y: 0, z: 0 };
    player.impulse = { x: 0, z: 0 };
  }
  player.attackHeld = false;
  player.guardHeld = false;
  player.guarding = false;
  computeDragOonInfusions(room, m);
  room?.events?.push({ type: 'dragOonCrewExited', machineId: m.id, playerId: player.id, wasOperator, reason, at });
  return true;
}

export function stepDragOonCrew(room, m, dt, now) {
  if (!m || m.retired || m.health <= 0 || m.mode === 'DESTROYED') return;

  // Validate currently seated crew still exist & alive; handle disconnect/death cleanly.
  if (m.operatorId) {
    const op = room?.players?.get?.(m.operatorId);
    if (!op || !op.alive || op.operatingDragOonId !== m.id || (op.actorKind === 'human' && op.connected === false)) {
      if (op) removeDragOonOccupant(room, m, op, { at: now, reason: !op.alive ? 'operator_died' : 'operator_disconnected' });
      else m.operatorId = null;
    }
  }
  for (let i = 0; i < (m.passengers?.length ?? 0); i++) {
    const pid = m.passengers[i];
    if (!pid) continue;
    const p = room?.players?.get?.(pid);
    if (!p || !p.alive || p.aboardDragOonId !== m.id || (p.actorKind === 'human' && p.connected === false)) {
      if (p) removeDragOonOccupant(room, m, p, { at: now, reason: !p.alive ? 'passenger_died' : 'passenger_disconnected' });
      else m.passengers[i] = null;
    }
  }

  // Advance timed boarding and disembarkation transitions.
  const nextTransitions = [];
  for (const t of m.crewTransitions ?? []) {
    const p = room?.players?.get?.(t.playerId);
    if (!p || !p.alive || (p.actorKind === 'human' && p.connected === false)) {
      if (p?.dragOonTransition?.machineId === m.id) p.dragOonTransition = null;
      continue;
    }
    if (t.kind === 'board') {
      if (m.campFire?.sealed || !m.grounded || Math.hypot(p.position.x - m.x, p.position.z - m.z) > DRAG_OON_TUNING.crew.boardReachRadius + 1.5 || (p.staggerUntil ?? 0) > now) {
        p.dragOonTransition = null;
        room?.events?.push({ type: 'dragOonBoardCancelled', machineId: m.id, playerId: p.id, at: now });
        continue;
      }
      if (now + 1e-8 >= t.endsAt) {
        const assigned = assignDragOonCrewInstant(room, m, p, { role: t.role, station: t.station, now });
        if (!assigned) {
          p.dragOonTransition = null;
          room?.events?.push({ type: 'dragOonBoardCancelled', machineId: m.id, playerId: p.id, at: now });
        }
        continue;
      }
      nextTransitions.push(t);
    } else if (t.kind === 'disembark') {
      if (!isDragOonOccupant(m, p.id)) {
        p.dragOonTransition = null;
        continue;
      }
      // Mid-air launch pauses or cancels disembarkation so airborne players stay inside until grounded.
      if (!m.grounded && !m.campFire?.settled) {
        p.dragOonTransition = null;
        room?.events?.push({ type: 'dragOonDisembarkCancelled', machineId: m.id, playerId: p.id, reason: 'airborne', at: now });
        continue;
      }
      if (now + 1e-8 >= t.endsAt) {
        const rallySlot = Number.isInteger(t.station) ? t.station + 1 : 0;
        const exit = dragOonExit(room, m, p, [], { excludeHull: false, startIndex: rallySlot }) ??
          dragOonExit(room, m, p, [], { excludeHull: true, startIndex: rallySlot });
        if (exit) {
          removeDragOonOccupant(room, m, p, { exitPos: exit, at: now, reason: 'disembark' });
          if (m.campFire?.reopeningForExitAt) {
            m.campFire.reopeningForExitAt = null;
          }
          continue;
        }
        // Keep trying once clear exit appears rather than failing destructively at deadline.
        nextTransitions.push(t);
        continue;
      }
      nextTransitions.push(t);
    }
  }
  m.crewTransitions = nextTransitions;

  // Keep seated actors synchronized to authoritative chassis cockpit / aperture stations.
  if (m.operatorId) {
    const op = room?.players?.get?.(m.operatorId);
    if (op) {
      op.position = dragOonOperatorPose(m);
      op.velocity = { ...(m.velocity ?? { x: 0, y: 0, z: 0 }) };
      op.grounded = Boolean(m.grounded);
      op.sprinting = false;
      op.guarding = false;
      op.guardHeld = false;
      op.dragOonPose = 'braced_seat';
    }
  }
  for (let i = 0; i < (m.passengers?.length ?? 0); i++) {
    const pid = m.passengers[i];
    if (!pid) continue;
    const p = room?.players?.get?.(pid);
    if (!p) continue;
    const pose = dragOonPassengerStationPose(m, i, 'seat');
    p.position = { x: pose.x, y: pose.y, z: pose.z };
    p.velocity = { ...(m.velocity ?? { x: 0, y: 0, z: 0 }) };
    p.grounded = Boolean(m.grounded);
    p.sprinting = false;
    p.dragOonPose = 'braced_seat';
  }

  computeDragOonInfusions(room, m);
}

/** Validates whether an external passenger spell can currently clear their aperture port. */
export function dragOonPassengerCanCast(room, m, player, spellId, aimYaw, aimPitch = 0) {
  if (!m || !player || player.aboardDragOonId !== m.id) return { allowed: true };
  if (spellId === 'steel') return { allowed: true };
  if (m.campFire?.sealed) return { allowed: false, reason: 'Sorcery shutters sealed during Camp Fire.' };
  if (m.rite?.active) return { allowed: false, reason: 'Apertures locked during Rite of Ascension.' };
  const stationIdx = player.dragOonStation ?? 0;
  const seat = dragOonPassengerStationPose(m, stationIdx, 'seat');
  const aperture = dragOonPassengerStationPose(m, stationIdx, 'aperture');
  const clamped = clampDragOonPassengerAim(m, stationIdx, aimYaw ?? aperture.yaw, aimPitch ?? 0);
  const muzzle = {
    x: aperture.x + clamped.direction.x * 0.95,
    y: aperture.y + clamped.direction.y * 0.95,
    z: aperture.z + clamped.direction.z * 0.95,
  };
  const blocked = (room?.world?.solids ?? []).some(box => {
    if (String(box.id ?? '').startsWith('dragoon-')) return false;
    return Boolean(segmentAabbHit([seat.x, seat.y + 0.55, seat.z], [muzzle.x, muzzle.y, muzzle.z], box));
  });
  return blocked ? { allowed: false, reason: 'Aperture port blocked by obstacle.' } : { allowed: true, aperture, clamped };
}

/**
 * Ejects surviving occupants into valid nearby positions on All Abort! destruction
 * after damage accounting settles. Occupants who die stay dead (no duplicate ejection).
 */
export function ejectDragOonSurvivors(room, m, survivors, now) {
  const frame = dragOonFrame(m);
  let idx = 0;
  for (const p of survivors) {
    const startIndex = Number.isInteger(p.dragOonStation) ? p.dragOonStation + 1 : idx;
    removeDragOonOccupant(room, m, p, { at: now, reason: 'all-abort' });
    p.dragOonPose = null;
    if (!p.alive) continue;
    const exit = dragOonExit(room, m, p, [], { excludeHull: true, startIndex });
    if (exit) {
      p.position = exit;
    } else {
      const side = (idx % 2 === 0 ? 1 : -1) * (1.8 + idx * 0.4);
      const back = frame.axes[2];
      const right = frame.axes[0];
      p.position = {
        x: m.x + back[0] * 2.4 + right[0] * side,
        y: Math.max(m.y + 0.5, p.position.y),
        z: m.z + back[2] * 2.4 + right[2] * side,
      };
    }
    const dx = p.position.x - m.x;
    const dz = p.position.z - m.z;
    const len = Math.hypot(dx, dz) || 1;
    launchBody(p, {
      x: (dx / len) * DRAG_OON_TUNING.destruction.ejectLaunchSpeed,
      y: DRAG_OON_TUNING.destruction.ejectLaunchUp,
      z: (dz / len) * DRAG_OON_TUNING.destruction.ejectLaunchSpeed,
    }, DRAG_OON_TUNING.destruction.ejectLaunchUp);
    p.ejectionFallExempt = true;
    idx += 1;
  }
}
