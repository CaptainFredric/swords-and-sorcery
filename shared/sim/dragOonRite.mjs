// Collective terminal synergy for DRAG-OON: Rite of Ascension.
// Requirements:
// - Flight Like Hell equipped on DRAG-OON
// - Full Gale infusion (tier >= 2)
// - Operator AND every actual seated passenger have Spells & Chivalry ready (prowess >= 100)
//   and explicitly opted in (minimum participating crew configurable; defaults to 1 operator + 2 Gale pax = 3;
//   never requires empty seats to be filled and never silently spends an unconsented ally's Prowess).
// - Upon activation: drains Prowess atomically across participants, locks crew entry/exit,
//   propels DRAG-OON skyward under operator trajectory control, and resolves deliberately or upon
//   impact/timeout/hazard through All Abort!'s single atomic destruction blast (scaled up cleanly).
import { PROWESS } from '../src/prowess.mjs';
import { surfaceHeightAt } from '../src/collision.mjs';
import { edgeMachineProgressAllowed } from '../src/edgeBoundary.mjs';
import { DRAG_OON_TUNING } from '../src/dragOonConfig.mjs';
import { dragOonClear, dragOonSolids } from './dragOonGeometry.mjs';
import { computeDragOonInfusions, cancelCrewTransitionsForPlayer, isDragOonOccupant } from './dragOonCrew.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function isChivalryReady(player) {
  if (!player || !player.alive) return false;
  if (player.actorKind === 'human' && player.connected === false) return false;
  return player.ultimate === 'chivalry' && (player.prowess ?? 0) >= PROWESS.full;
}

export function collectRiteParticipants(room, m) {
  const op = m?.operatorId ? room?.players?.get?.(m.operatorId) : null;
  const operator = op && op.alive && op.operatingDragOonId === m.id ? op : null;
  const passengers = [];
  for (let i = 0; i < (m?.passengers?.length ?? 0); i++) {
    const pid = m.passengers[i];
    if (!pid) continue;
    const p = room?.players?.get?.(pid);
    if (!p || !p.alive || p.aboardDragOonId !== m.id) continue;
    passengers.push({ station: i, player: p });
  }
  const all = [
    ...(operator ? [{ role: 'operator', station: null, player: operator }] : []),
    ...passengers.map(({ station, player }) => ({ role: 'passenger', station, player })),
  ];
  return { operator, passengers, all };
}

/**
 * Evaluates current collective Rite readiness, auto-cancelling stale commitments
 * whenever crew changes or someone loses Chivalry readiness (never spending Prowess).
 */
export function evaluateDragOonRiteReadiness(room, m, now = 0) {
  if (!m) return null;
  const t = DRAG_OON_TUNING.riteOfAscension;
  if (m.rite?.active) {
    return m.riteStatus;
  }

  m.riteCommitments ??= {};
  const { operator, all } = collectRiteParticipants(room, m);
  const activeIds = new Set(all.map(entry => entry.player.id));

  // Auto-prune commitments from departed or non-ready crew members cleanly
  for (const cid of Object.keys(m.riteCommitments)) {
    const entry = all.find(e => e.player.id === cid);
    if (!activeIds.has(cid) || !entry || !isChivalryReady(entry.player)) {
      delete m.riteCommitments[cid];
    }
  }

  const skillOk = m.skill?.id === t.requiredSkillId;
  const galeTier = m.infusions?.tiers?.gale ?? 0;
  const galeOk = galeTier >= t.requiredGaleTier;
  const campBlocked = Boolean(m.campFire?.active);
  const dead = Boolean(m.retired || m.health <= 0 || m.mode === 'DESTROYED');
  const minCrew = clamp(m.riteMinCrew ?? t.minParticipants, 2, 5);

  if (!skillOk || !galeOk || dead) {
    // Drop stale pre-flight commitments cleanly if foundational conditions disappear
    if (Object.keys(m.riteCommitments).length > 0 && (!skillOk || dead)) {
      m.riteCommitments = {};
      room?.events?.push({ type: 'dragOonRiteCancelled', machineId: m.id, reason: !skillOk ? 'skill_changed' : 'destroyed', at: now });
    }
  }

  const participants = all.map(({ role, station, player }) => ({
    id: player.id,
    name: player.name ?? player.id,
    role,
    station,
    chivalryReady: isChivalryReady(player),
    committed: Boolean(m.riteCommitments[player.id]) && isChivalryReady(player),
  }));

  const readyCount = participants.filter(p => p.chivalryReady).length;
  const committedCount = participants.filter(p => p.committed).length;
  const allReady = participants.length >= minCrew && participants.every(p => p.chivalryReady);
  const allCommitted = allReady && participants.every(p => p.committed);

  let reason = null;
  if (dead) reason = 'DRAG-OON is destroyed.';
  else if (!operator) reason = 'An operator is required.';
  else if (!skillOk) reason = 'Requires Flight Like Hell Skill.';
  else if (!galeOk) reason = 'Requires Full Gale infusion.';
  else if (campBlocked) reason = 'Unseal Camp Fire first.';
  else if (participants.length < minCrew) reason = `Needs ${minCrew} active crew (${participants.length}/${minCrew}).`;
  else if (!allReady) reason = 'Every seated crewmate needs Spells & Chivalry at full Prowess.';
  else if (!allCommitted) reason = `Awaiting crew consent (${committedCount}/${participants.length}).`;

  m.riteStatus = {
    eligible: Boolean(!reason),
    reason,
    skillOk,
    galeOk,
    minCrew,
    participantCount: participants.length,
    readyCount,
    committedCount,
    participants,
  };
  return m.riteStatus;
}

/** Toggle/set an individual crewmate's opt-in commitment toward Rite of Ascension. */
export function setDragOonRiteCommit(room, m, player, committed, now = 0) {
  if (!m || m.retired || m.health <= 0 || m.mode === 'DESTROYED') {
    return { rejected: 'DRAG-OON is destroyed.' };
  }
  if (!player || !isDragOonOccupant(m, player.id)) {
    return { rejected: 'Board DRAG-OON to commit to Rite of Ascension.' };
  }
  if (m.rite?.active) {
    return { rejected: 'Rite of Ascension is already underway.' };
  }

  computeDragOonInfusions(room, m);
  const t = DRAG_OON_TUNING.riteOfAscension;
  m.riteCommitments ??= {};

  if (!committed) {
    const had = Boolean(m.riteCommitments[player.id]);
    delete m.riteCommitments[player.id];
    const status = evaluateDragOonRiteReadiness(room, m, now);
    if (had) {
      room?.events?.push({ type: 'dragOonRiteWithdrawn', machineId: m.id, playerId: player.id, at: now });
    }
    return { committed: false, status };
  }

  if (m.skill?.id !== t.requiredSkillId) {
    return { rejected: 'Equip Flight Like Hell to commit to Rite of Ascension.' };
  }
  if ((m.infusions?.tiers?.gale ?? 0) < t.requiredGaleTier) {
    return { rejected: 'Full Gale infusion is required for Rite of Ascension.' };
  }
  if (!isChivalryReady(player)) {
    return { rejected: 'Requires Spells & Chivalry at 100% Prowess.' };
  }

  m.riteCommitments[player.id] = true;
  const status = evaluateDragOonRiteReadiness(room, m, now);
  room?.events?.push({ type: 'dragOonRiteCommitted', machineId: m.id, playerId: player.id, committedCount: status.committedCount, total: status.participantCount, at: now });
  return { committed: true, status };
}

/**
 * Operator triggers Rite of Ascension once all occupied crewmates have opted in with full Chivalry Prowess.
 * Calling again midair once minDetonateAt passes triggers deliberate detonation.
 */
export function activateDragOonRite(room, m, player, now = 0, { onDetonate } = {}) {
  if (!m || m.retired || m.health <= 0 || m.mode === 'DESTROYED' || m.operatorId !== player?.id) {
    return { rejected: 'Operate DRAG-OON to initiate Rite of Ascension.' };
  }
  if (m.rite?.active) {
    return detonateDragOonRite(room, m, player, now, 'manual', { onDetonate });
  }

  computeDragOonInfusions(room, m);
  const status = evaluateDragOonRiteReadiness(room, m, now);
  if (!status?.eligible) {
    return { rejected: status?.reason ?? 'Rite of Ascension conditions are not met.' };
  }

  const { all } = collectRiteParticipants(room, m);
  if (!all.every(e => isChivalryReady(e.player) && m.riteCommitments?.[e.player.id])) {
    return { rejected: 'Every crewmate must hold full Spells & Chivalry and opt in.' };
  }

  // Atomically spend Prowess from ALL participating crew (no partial refunds on disconnect/abort)
  const participantIds = [];
  for (const { player: p } of all) {
    p.prowess = 0;
    p.ultimateWantedUntil = -Infinity;
    p.ultimateState = null;
    p.pendingSpell = null;
    participantIds.push(p.id);
  }

  // Lock crew transitions so nobody disembarks cleanly after ignition
  for (const tr of [...(m.crewTransitions ?? [])]) {
    const actor = room?.players?.get?.(tr.playerId);
    if (actor) cancelCrewTransitionsForPlayer(m, actor);
  }
  m.crewTransitions = [];

  m.sprayHeld = false;
  m.sprayPrepStartedAt = null;
  m.sprayActiveAt = null;
  m.raze = null;
  m.flightLikeHell = null;
  m.campFire = null;
  m.leap = null;
  m.riteCommitments = {};

  const frozenTiers = { ...(m.infusions?.tiers ?? { fire: 0, frost: 0, gale: 0, lightning: 0, steel: 0 }) };
  const t = DRAG_OON_TUNING.riteOfAscension;
  const speedScale = (frozenTiers.lightning ?? 0) >= 2 ? t.lightningSpeedMult : (frozenTiers.lightning ?? 0) >= 1 ? 1.14 : 1;

  const yaw = m.heading ?? 0;
  const fwdX = -Math.sin(yaw);
  const fwdZ = -Math.cos(yaw);
  m.grounded = false;
  m.cannonPitch = -1.32;
  m.cannonYaw = 0;
  m.velocity = {
    x: fwdX * t.ascentForwardSpeed * 0.55 * speedScale,
    y: t.ascentUpSpeed * speedScale,
    z: fwdZ * t.ascentForwardSpeed * 0.55 * speedScale,
  };

  m.rite = {
    active: true,
    phase: 'ascending',
    startedAt: now,
    minDetonateAt: now + t.minDetonateDelaySec,
    maxEndAt: now + t.maxFlightSec,
    initiatorId: player.id,
    participantIds,
    frozenTiers,
    speedScale,
    detonated: false,
  };
  m.skill = { ...(m.skill ?? {}), phase: 'rite' };

  room?.events?.push({
    type: 'dragOonRiteAscended',
    machineId: m.id,
    initiatorId: player.id,
    participantIds,
    frozenTiers,
    point: { x: m.x, y: m.y, z: m.z },
    at: now,
  });
  return { rite: m.rite };
}

export function detonateDragOonRite(room, m, player, now = 0, reason = 'manual', { onDetonate } = {}) {
  const rite = m?.rite;
  if (!rite?.active || rite.detonated) {
    return { rejected: 'Rite of Ascension is not active.' };
  }
  if (reason === 'manual') {
    if (player && m.operatorId !== player.id) {
      return { rejected: 'Only the operator can detonate Rite of Ascension.' };
    }
    if (now + 1e-8 < rite.minDetonateAt) {
      return { rejected: 'Ascension ignition stabilizing…' };
    }
  }
  rite.detonated = true;
  rite.phase = 'detonated';
  const payload = {
    attackerId: rite.initiatorId ?? m.operatorId ?? null,
    source: 'dragoon-rite-of-ascension',
    point: { x: m.x, y: m.y + 1.0, z: m.z },
    isRiteOfAscension: true,
    riteReason: reason,
    riteTiers: rite.frozenTiers,
    riteParticipantIds: rite.participantIds,
  };
  if (onDetonate) onDetonate(payload);
  return { detonated: true, reason };
}

/**
 * Steps active Rite of Ascension trajectory, operator guidance, and collision/timeout detonation.
 * Returns true while Rite owns machine kinematics (suppressing ground driving/ordinary leaps).
 */
export function stepDragOonRite(room, m, dt, now, world = room?.world, { onDetonate } = {}) {
  if (!m || m.retired || m.health <= 0 || m.mode === 'DESTROYED') return false;
  if (!m.rite?.active) {
    evaluateDragOonRiteReadiness(room, m, now);
    return false;
  }

  const rite = m.rite;
  if (rite.detonated) return true;

  const t = DRAG_OON_TUNING.riteOfAscension;
  const op = m.operatorId ? room?.players?.get?.(m.operatorId) : null;
  if (!op || !op.alive || (op.actorKind === 'human' && op.connected === false)) {
    detonateDragOonRite(room, m, null, now, 'pilot_lost', { onDetonate });
    return true;
  }

  if (now + 1e-9 >= rite.maxEndAt) {
    detonateDragOonRite(room, m, null, now, 'timeout', { onDetonate });
    return true;
  }

  // Guide skyward rocket arc using operator steering inputs
  const input = op.input ?? {};
  const steerYaw = clamp(input.right ?? 0, -1, 1);
  const pitchIn = clamp(input.pitch ?? 0.15, t.steerPitchMin, t.steerPitchMax);
  const thrustIn = clamp(input.forward ?? 1, -0.35, 1);
  m.heading = (m.heading ?? 0) - steerYaw * t.steerTurnRate * dt;
  const targetYaw = Number.isFinite(input.yaw) ? input.yaw : m.heading;
  const yawDiff = Math.atan2(Math.sin(targetYaw - m.heading), Math.cos(targetYaw - m.heading));
  m.heading += clamp(yawDiff, -t.steerTurnRate * 0.7 * dt, t.steerTurnRate * 0.7 * dt);

  const age = Math.max(0, now - rite.startedAt);
  const speed = t.ascentForwardSpeed * (rite.speedScale ?? 1) * (0.65 + 0.35 * clamp(thrustIn, 0, 1));
  const climbPhase = age < 0.85;
  const aimPitch = climbPhase ? Math.max(0.32, pitchIn) : pitchIn;
  const fwd = { x: -Math.sin(m.heading) * Math.cos(aimPitch), y: Math.sin(aimPitch), z: -Math.cos(m.heading) * Math.cos(aimPitch) };

  const targetVx = fwd.x * speed;
  const targetVy = climbPhase ? Math.max(fwd.y * speed, t.ascentUpSpeed * 0.75) : fwd.y * speed;
  const targetVz = fwd.z * speed;
  const blend = clamp(dt * 4.5, 0, 1);
  m.velocity.x += (targetVx - m.velocity.x) * blend;
  m.velocity.y += (targetVy - m.velocity.y) * blend;
  m.velocity.z += (targetVz - m.velocity.z) * blend;

  m.chassisPitch = clamp(-aimPitch * 0.55, -0.45, 0.45);
  m.chassisRoll = clamp(steerYaw * 0.25, -0.32, 0.32);

  const nextX = m.x + m.velocity.x * dt;
  const nextY = m.y + m.velocity.y * dt;
  const nextZ = m.z + m.velocity.z * dt;
  const candidate = { ...m, x: nextX, y: nextY, z: nextZ };

  // Check world boundary / abyss safeguard
  if (nextY < (world?.abyssY ?? -15)) {
    detonateDragOonRite(room, m, null, now, 'abyss', { onDetonate });
    return true;
  }
  if (world?.edgeBoundary && !edgeMachineProgressAllowed(dragOonSolids(m), dragOonSolids(candidate), world.edgeBoundary)) {
    detonateDragOonRite(room, m, null, now, 'boundary', { onDetonate });
    return true;
  }

  // Impact terrain or solid structures after brief initial lift-off clearance
  const floor = surfaceHeightAt(nextX, nextZ, nextY + 0.9, world);
  const pastInitialLift = age > 0.22;
  if (pastInitialLift && floor != null && nextY <= floor + 0.08) {
    m.x = nextX; m.y = floor; m.z = nextZ; m.position = { x: m.x, y: m.y, z: m.z };
    detonateDragOonRite(room, m, null, now, 'impact_ground', { onDetonate });
    return true;
  }
  if (pastInitialLift && !dragOonClear(candidate, world)) {
    detonateDragOonRite(room, m, null, now, 'impact_solid', { onDetonate });
    return true;
  }

  m.x = nextX;
  m.y = nextY;
  m.z = nextZ;
  m.position = { x: m.x, y: m.y, z: m.z };
  return true;
}
