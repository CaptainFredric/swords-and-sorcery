// Core authoritative DRAG-OON chassis lifecycle:
// - 8-wheel pivot-in-place and slow translational steering kinematics
// - Perpetual Sheathed in Steel armor & DoT immunity on armored hull
// - Integrated thermal/fuel state, abilities, cooperative crew, and Skills stepping
// - Single authoritative All Abort! destruction event, crew explosion damage & survivor ejection
import { GAME } from '../src/combat.mjs';
import { STEEL_DAMAGE_RANGES } from '../src/steel.mjs';
import { areAllies } from '../src/teams.mjs';
import { DRAG_OON_GEOMETRY, DRAG_OON_ID, DRAG_OON_KIND, DRAG_OON_TUNING } from '../src/dragOonConfig.mjs';
import { selectedSiegeSkill } from '../src/siegeLoadout.mjs';
import { edgeMachineProgressAllowed } from '../src/edgeBoundary.mjs';
import { applyDamage } from './combat.mjs';
import { getFleetSolids } from './fleetGeometry.mjs';
import { beginSiegeWreck, stepSiegeWreck } from './siegeWreck.mjs';
import { mitigateSiegeSteel, endSiegeSteel } from './siegeSteel.mjs';
import {
  dragOonFrame,
  dragOonSolids,
  dragOonTerrainPose,
  dragOonClear,
} from './dragOonGeometry.mjs';
import {
  createDragOonThermal,
  stepDragOonThermal,
} from './dragOonThermal.mjs';
import {
  computeDragOonInfusions,
  dragOonOccupantIds,
  ejectDragOonSurvivors,
  stepDragOonCrew,
} from './dragOonCrew.mjs';
import {
  stepDesolationSpray,
  stepDragOonRadiantHeat,
  stepFiresTheLimit,
} from './dragOonAbilities.mjs';
import {
  stepDragOonSkills,
} from './dragOonSkills.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const HULL_DOT_IMMUNE_SET = new Set(DRAG_OON_TUNING.hullDotImmuneSources);

export function createDragOon(overrides = {}) {
  const thermal = createDragOonThermal();
  const passengerCapacity = clamp(
    overrides.passengerCapacity ?? DRAG_OON_TUNING.crew.defaultPassengerCapacity,
    1,
    DRAG_OON_TUNING.crew.maxPassengerCapacity
  );
  const wheelComponents = Object.fromEntries(
    DRAG_OON_GEOMETRY.wheels.map(w => [w.id, { health: 180, maxHealth: 180 }])
  );
  const m = {
    id: overrides.id ?? 'dragoon-practice',
    type: DRAG_OON_ID,
    class: DRAG_OON_ID,
    kind: DRAG_OON_KIND,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    z: overrides.z ?? 0,
    position: { x: overrides.x ?? 0, y: overrides.y ?? 0, z: overrides.z ?? 0 },
    heading: overrides.heading ?? 0,
    chassisPitch: 0,
    chassisRoll: 0,
    speed: 0,
    turnVel: 0,
    velocity: { x: 0, y: 0, z: 0 },
    grounded: true,
    cannonYaw: 0,
    cannonPitch: 0,
    cannonYawVel: 0,
    steer: 0,
    operatorId: null,
    passengers: new Array(passengerCapacity).fill(null),
    passengerCapacity,
    crewTransitions: [],
    health: DRAG_OON_TUNING.maxHealth,
    maxHealth: DRAG_OON_TUNING.maxHealth,
    mode: 'MOBILE',
    retired: false,
    destroyedAt: null,
    destroyedProcessed: false,
    allAbortResolved: false,
    perpetualSteel: true,
    fieldSeq: 0,
    wheelRolls: new Array(8).fill(0),
    components: {
      ...wheelComponents,
      Drive: { health: 360, maxHealth: 360 },
      Cannons: { health: 420, maxHealth: 420 },
    },
    skill: { id: overrides.skillId ?? 'razeThePasture', phase: 'idle', readyAt: 0 },
    sprayHeld: false,
    sprayPrepStartedAt: null,
    sprayActiveAt: null,
    sprayEmitAt: -Infinity,
    leap: null,
    leapReadyAt: 0,
    steamReadyAt: 0,
    raze: null,
    flightLikeHell: null,
    campFire: null,
    brimming: null,
    brimmingBonusMult: 1,
    infusions: { counts: { fire: 0, frost: 0, gale: 0, lightning: 0, steel: 0 }, tiers: { fire: 0, frost: 0, gale: 0, lightning: 0, steel: 0 } },
    practiceOverrides: null,
    ...thermal,
    ...overrides,
  };
  m.position = { x: m.x, y: m.y, z: m.z };
  return m;
}

export function stepDragOon(room, m, dt, now, world = room.world) {
  if (!m || m.retired) return;
  if (m.health <= 0 || m.mode === 'DESTROYED') {
    stepSiegeWreck(room, m, now);
    return;
  }

  m.poseTime = now;
  stepDragOonCrew(room, m, dt, now);
  const { tiers } = computeDragOonInfusions(room, m);

  // Pilot aims dual low cannon assemblies independently within ±60° yaw and pitch arc
  const pilot = m.operatorId ? room?.players?.get?.(m.operatorId) : null;
  const input = pilot?.alive && (pilot.staggerUntil ?? 0) <= now ? pilot.input ?? {} : {};
  if (pilot?.alive && !m.campFire?.active && !m.flightLikeHell?.active && m.raze?.phase !== 'holding') {
    const yawDiff = Math.atan2(Math.sin((input.yaw ?? m.heading) - m.heading), Math.cos((input.yaw ?? m.heading) - m.heading));
    const targetCannonYaw = clamp(yawDiff, -DRAG_OON_TUNING.cannonYawMax, DRAG_OON_TUNING.cannonYawMax);
    const targetCannonPitch = clamp(input.pitch ?? 0, DRAG_OON_TUNING.cannonPitchMin, DRAG_OON_TUNING.cannonPitchMax);
    const oldYaw = m.cannonYaw ?? 0;
    const maxStep = 2.6 * dt;
    m.cannonYaw = clamp(oldYaw + clamp(targetCannonYaw - oldYaw, -maxStep, maxStep), -DRAG_OON_TUNING.cannonYawMax, DRAG_OON_TUNING.cannonYawMax);
    m.cannonPitch = clamp((m.cannonPitch ?? 0) + clamp(targetCannonPitch - (m.cannonPitch ?? 0), -maxStep, maxStep), DRAG_OON_TUNING.cannonPitchMin, DRAG_OON_TUNING.cannonPitchMax);
    m.cannonYawVel = dt > 1e-6 ? (m.cannonYaw - oldYaw) / dt : 0;
  } else {
    m.cannonYawVel = 0;
  }

  // Advance airborne leap (self-exempt ballistic physics) or grounded 8-wheel pivot-in-place movement
  const leaping = stepFiresTheLimit(room, m, dt, now, world);

  if (!leaping && m.grounded) {
    const wheelsFailed = DRAG_OON_GEOMETRY.wheels.filter(w => (m.components?.[w.id]?.health ?? 1) <= 0).length;
    const driveAlive = (m.components?.Drive?.health ?? 1) > 0;
    const immobilised = wheelsFailed >= 6 || m.campFire?.active || m.raze?.phase === 'holding';
    const driveScale = immobilised ? 0 : clamp((1 - wheelsFailed * 0.1) * (driveAlive ? 1 : 0.45), 0.35, 1);

    const forwardIn = pilot?.alive ? clamp(input.forward ?? 0, -1, 1) : 0;
    const rightIn = pilot?.alive ? clamp(input.right ?? 0, -1, 1) : 0;
    const targetSpeed = immobilised
      ? 0
      : forwardIn > 0
      ? DRAG_OON_TUNING.forwardSpeed * forwardIn * driveScale
      : forwardIn < 0
      ? -DRAG_OON_TUNING.reverseSpeed * Math.abs(forwardIn) * driveScale
      : 0;

    m.speed += clamp(targetSpeed - m.speed, -DRAG_OON_TUNING.acceleration * dt, DRAG_OON_TUNING.acceleration * dt);
    if (Math.abs(m.speed) < 0.005) m.speed = 0;
    m.steer = rightIn;

    // Zero-radius in-place pivoting via independent left/right wheel assemblies!
    // Never requires forward motion to rotate heading.
    const turnRate = immobilised
      ? 0
      : -rightIn * (Math.abs(m.speed) < 0.25 ? DRAG_OON_TUNING.pivotTurnRate : DRAG_OON_TUNING.cruiseTurnRate) * (driveAlive ? 1 : 0.55);
    m.turnVel = turnRate;

    const obstacles = getFleetSolids(room, m.id);
    const stepHeading = m.heading + turnRate * dt;
    const stepX = m.x - Math.sin(stepHeading) * m.speed * dt;
    const stepZ = m.z - Math.cos(stepHeading) * m.speed * dt;

    const candidate = { ...m, x: stepX, z: stepZ, heading: stepHeading };
    const pose = dragOonTerrainPose(candidate, world);
    const withinBounds = !world?.edgeBoundary || !pose || edgeMachineProgressAllowed(
      dragOonSolids(m),
      dragOonSolids({ ...candidate, ...pose }),
      world.edgeBoundary
    );

    if (pose && withinBounds && Math.abs(pose.y - m.y) <= 0.25 && dragOonClear({ ...candidate, ...pose }, world, obstacles)) {
      Object.assign(m, candidate, pose);
    } else if (Math.abs(turnRate) > 1e-4) {
      // Allow pure in-place heading pivot even up against a low lip or curb when forward translation is blocked
      const pivotOnly = { ...m, heading: stepHeading };
      const pivotPose = dragOonTerrainPose(pivotOnly, world);
      if (pivotPose && dragOonClear({ ...pivotOnly, ...pivotPose }, world, obstacles)) {
        Object.assign(m, pivotOnly, pivotPose);
      }
      m.speed = 0;
    } else {
      m.speed = 0;
    }
    m.velocity = {
      x: -Math.sin(m.heading) * m.speed,
      y: 0,
      z: -Math.cos(m.heading) * m.speed,
    };

    for (let i = 0; i < 8; i++) {
      const w = DRAG_OON_GEOMETRY.wheels[i];
      const sideSign = w.side === 'L' ? -1 : 1;
      const wheelSpeed = m.speed + turnRate * sideSign * 1.85;
      m.wheelRolls[i] = (m.wheelRolls[i] ?? 0) + (wheelSpeed * dt) / DRAG_OON_GEOMETRY.wheelRadius;
    }
  }

  m.position = { x: m.x, y: m.y, z: m.z };

  // Innate weapons & radiant heat
  const spraying = stepDesolationSpray(room, m, dt, now);
  stepDragOonRadiantHeat(room, m, now);

  // Equippable Skills (Raze, Flight Like Hell, Camp Fire, Brimming)
  stepDragOonSkills(room, m, dt, now, world);

  // Shared thermal & fuel system
  const spendingFuel = Boolean(
    spraying ||
    m.flightLikeHell?.active ||
    m.raze?.phase === 'holding' ||
    m.campFire?.flamesActive
  );
  stepDragOonThermal(m, dt, now, {
    frostTier: tiers.frost ?? 0,
    fireTier: tiers.fire ?? 0,
    spendingFuel,
    brimmingActive: Boolean(m.brimming?.active),
    flightActive: Boolean(m.flightLikeHell?.active),
    sprayActive: spraying,
  });

  // Sync operator yaw/pitch once physics settled
  if (pilot?.alive && pilot.operatingDragOonId === m.id) {
    pilot.yaw = input.yaw ?? pilot.yaw;
    pilot.pitch = input.pitch ?? pilot.pitch;
  }
}

/**
 * Authoritative damage receiver for DRAG-OON.
 * - Grants hull immunity ONLY to ongoing DoT sources (direct hits, physical blows, spells apply normally).
 * - Applies perpetual Sheathed in Steel armor mitigation + active Steel ward integration.
 * - Triggers ONE atomic All Abort! destruction explosion, crew damage, and survivor ejection when hull HP hits 0.
 */
export function damageDragOon(room, m, amount, attackerId, source, now, {
  componentId = 'hull',
  point = null,
  isSelfLaunch = false,
} = {}) {
  if (!m || m.retired || m.health <= 0 || m.mode === 'DESTROYED') return false;
  if (!Number.isFinite(amount) || !(amount > 0)) return false;

  // Explicit Fire's the Limit self-launch exemption (never unconditional explosion immunity).
  if (isSelfLaunch || source === 'dragoon-leap-ignition-self') return false;

  // Own operator/passenger friendly fire check outside Practice self-testing
  if (attackerId && (attackerId === m.operatorId || m.passengers?.includes?.(attackerId))) return false;
  if (room?.mode !== 'PRACTICE' && attackerId && (areAllies(room, m.operatorId, attackerId) || (m.team && room?.players?.get?.(attackerId)?.team === m.team))) {
    return false;
  }

  // Armored shell immunity to damage over time (burn/DoTs), WITHOUT granting immunity to direct Fire/spells/physical hits!
  if (HULL_DOT_IMMUNE_SET.has(source)) {
    room?.events?.push({ type: 'dragOonDotResisted', machineId: m.id, source, at: now });
    return false;
  }

  if (componentId !== 'hull' && !m.components?.[componentId]) return false;
  const target = componentId === 'hull' ? m : m.components[componentId];
  if (target.health <= 0) return false;

  // Perpetual innate Sheathed in Steel armor mitigation on armored enclosure + active crew Steel ward
  const perpetualScale = 1 - DRAG_OON_TUNING.innateSteelStrength * 0.45;
  const steelRange = STEEL_DAMAGE_RANGES[source];
  const innateMitigated = steelRange
    ? Math.max(steelRange.min ?? 1, Math.min(amount * perpetualScale, steelRange.max ?? amount))
    : amount * perpetualScale;

  const ward = mitigateSiegeSteel(room, m, amount, source, now, {
    innateAmount: innateMitigated,
    componentId,
    point,
  });
  const finalAmount = Math.max(0, Math.round(ward.amount * 10) / 10);
  if (!(finalAmount > 0)) return false;

  const old = target.health;
  target.health = Math.max(0, target.health - finalAmount);
  target.lastHitAt = now;

  room?.events?.push({
    type: 'dragOonDamaged',
    machineId: m.id,
    componentId,
    amount: old - target.health,
    health: target.health,
    maxHealth: target.maxHealth ?? m.maxHealth,
    point,
    attackerId,
    source,
    at: now,
  });

  if (target.health === 0 && componentId !== 'hull') {
    target.failedAt = now;
    room?.events?.push({ type: 'dragOonComponentDestroyed', machineId: m.id, componentId, at: now });
    if (componentId === 'Cannons' && m.flightLikeHell?.active) {
      m.flightLikeHell.active = false;
      m.cannonPitch = 0;
      m.cannonYaw = 0;
    }
  }

  if (componentId === 'hull' && target.health === 0) {
    triggerAllAbortDestruction(room, m, now, { attackerId, source, point });
  }
  return true;
}

export function triggerAllAbortDestruction(room, m, now, { attackerId = null, source = 'destruction', point = null } = {}) {
  if (!m || m.allAbortResolved) return false;
  m.allAbortResolved = true;
  m.destroyedProcessed = true;
  m.health = 0;
  m.mode = 'DESTROYED';
  m.sprayHeld = false;
  m.raze = null;
  m.flightLikeHell = null;
  m.campFire = null;

  endSiegeSteel(room, m, now, 'destroyed');
  beginSiegeWreck(room, m, 'drag-oon', now, { attackerId, source, point: point ?? { x: m.x, y: m.y, z: m.z } });

  const d = DRAG_OON_TUNING.destruction;
  const brimming = Boolean(m.brimming?.active) || (m.heat ?? 0) > DRAG_OON_TUNING.heatMax;
  const heat = Math.max(0, m.heat ?? 0);
  const fuel = Math.max(0, m.fuel ?? 0);

  const radius = (d.baseRadius + heat * d.heatRadiusScale) * (brimming ? d.brimmingRadiusMult : 1);
  const blastDamage = (d.baseDamage + heat * d.heatDamageScale + fuel * d.fuelDamageScale) * (brimming ? d.brimmingDamageMult : 1);
  const crewDamage = (d.baseCrewDamage + Math.max(0, heat - 40) * d.overpressureCrewDamageScale) * (brimming ? d.brimmingCrewDamageMult : 1);

  const origin = { x: m.x, y: m.y + 1.0, z: m.z };
  const occupantIds = dragOonOccupantIds(m);
  const survivors = [];

  // Cancel any in-progress boarding cleanly (players not aboard yet are NOT executed as occupants)
  for (const tr of [...(m.crewTransitions ?? [])]) {
    if (tr.kind === 'board') {
      const p = room?.players?.get?.(tr.playerId);
      if (p) cancelCrewTransitionsForPlayer(m, p);
    }
  }

  // 1. Apply single authoritative All Abort! trauma to every occupant STILL aboard
  //    (including anyone whose disembarkation has NOT completed!).
  for (const oid of occupantIds) {
    const crewMember = room?.players?.get?.(oid);
    if (!crewMember || !crewMember.alive) continue;
    // Attribute explosion kill credit fairly without inflated multi-credit
    applyDamage(room, attackerId, crewMember.id, crewDamage, 'dragoon-all-abort-crew', now, null, {
      skipSteel: brimming,
    });
    if (crewMember.alive) survivors.push(crewMember);
  }

  // 2. Apply blast explosion to nearby enemies & enemy machines outside (excluding own occupants already resolved!)
  for (const target of room?.players?.values?.() ?? []) {
    if (!target.alive || occupantIds.includes(target.id)) continue;
    if (m.team && target.team && m.team === target.team) continue;
    const dist3 = Math.hypot(target.position.x - origin.x, target.position.y - origin.y, target.position.z - origin.z);
    if (dist3 > radius) continue;
    const falloff = clamp(1 - (dist3 / radius) * 0.55, 0.35, 1);
    const len = Math.hypot(target.position.x - origin.x, target.position.z - origin.z) || 1;
    applyDamage(room, attackerId ?? m.operatorId, target.id, blastDamage * falloff, 'dragoon-all-abort', now, {
      x: ((target.position.x - origin.x) / len) * 12 * falloff,
      y: 4.5,
      z: ((target.position.z - origin.z) / len) * 12 * falloff,
    });
  }

  // 3. Eject surviving occupants safely into valid nearby exits
  ejectDragOonSurvivors(room, m, survivors, now);

  // Stop any lingering spray emission from destroyed chassis
  if (room?.dragOonFlames?.length) {
    room.dragOonFlames = room.dragOonFlames.filter(f => f.machineId !== m.id || f.tiers?.gale >= 1);
  }

  room?.events?.push({
    type: 'dragOonDestroyed',
    machineId: m.id,
    attackerId,
    source,
    point: origin,
    radius,
    blastDamage: Math.round(blastDamage),
    crewDamage: Math.round(crewDamage),
    brimming,
    occupantsKilled: occupantIds.length - survivors.length,
    survivorsEjected: survivors.length,
    at: now,
  });
  return true;
}

export function blastDragOon(room, m, { point, radius, damage }, attackerId, source, now) {
  if (!m || !(radius > 0)) return false;
  const dist = Math.hypot((m.x ?? 0) - point.x, (m.y ?? 0) + 1.1 - point.y, (m.z ?? 0) - point.z);
  const reach = radius + 2.8;
  if (dist > reach) return false;
  const e = clamp(1 - Math.max(0, dist - 2.2) / Math.max(0.5, radius), 0.15, 1);
  return damageDragOon(room, m, damage * e, attackerId, source, now, { componentId: 'hull', point });
}
