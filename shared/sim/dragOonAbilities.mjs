// Authoritative DRAG-OON innate combat & movement abilities:
// - Desolation Spray (articulated 4-nozzle flame emitter + rare aerosol gag + radiant heat aura)
// - Fire's the Limit (grounded self-exempt explosive launch, aerial control, landing slam + rupture)
// - Steam the Team (heat-driven expanding annular steam discharge, cooling, extinguishing, infusions)
import { DRAG_OON_TUNING } from '../src/dragOonConfig.mjs';
import { areAllies } from '../src/teams.mjs';
import { postureOf } from '../src/body.mjs';
import { surfaceHeightAt, segmentAabbHit } from '../src/collision.mjs';
import { launchBody, shoveBody } from '../src/movement.mjs';
import { RUPTURE, planRupture } from '../src/rupture.mjs';
import { applyDamage } from './combat.mjs';
import { getFleetMachines, getMachineKind, damageFleetMachine } from './fleetGeometry.mjs';
import { dragOonCannonRays, dragOonUndersideOrigin, dragOonTerrainPose, dragOonClear } from './dragOonGeometry.mjs';
import { addDragOonHeat, spendDragOonFuel, ventDragOonHeat } from './dragOonThermal.mjs';
import { addSuppressionZone, isPointSuppressedByDragOon } from './dragOonFields.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function sameTeam(room, ownerId, teamA, b) {
  if (!b) return false;
  if (ownerId && b.id === ownerId) return true;
  if (ownerId && areAllies(room, ownerId, b.id)) return true;
  if (teamA && b.team && teamA === b.team) return true;
  return false;
}

export function triggerDesolationSpray(room, m, player, down, now) {
  if (!m || m.retired || m.health <= 0 || m.mode === 'DESTROYED' || m.operatorId !== player?.id) return false;
  if (m.campFire?.active || m.raze?.phase === 'holding' || m.flightLikeHell?.active) {
    m.sprayHeld = false;
    return false;
  }
  const want = Boolean(down);
  if (want === Boolean(m.sprayHeld)) return true;
  m.sprayHeld = want;
  if (want) {
    if ((m.fuel ?? 0) <= 0.1 || (m.components?.Cannons?.health ?? 1) <= 0) {
      m.sprayHeld = false;
      return false;
    }
    const lightningTier = m.infusions?.tiers?.lightning ?? 0;
    const delay = lightningTier >= DRAG_OON_TUNING.spray.lightningZeroDelayTier ? 0 : DRAG_OON_TUNING.spray.prepDelaySec;
    m.sprayPrepStartedAt = now;
    m.sprayActiveAt = now + delay;
    m.sprayEmitAt = -Infinity;
    // Rare household aerosol gag (<1% probability): purely audio/cosmetic hook,
    // never modifies attack delay, damage, fuel consumption, or control.
    const rng = room?.siegeRandom?.() ?? Math.random();
    const aerosolGag = rng < DRAG_OON_TUNING.spray.rareAerosolProbability;
    room?.events?.push({
      type: 'dragOonSprayStarted',
      machineId: m.id,
      operatorId: player.id,
      activeAt: m.sprayActiveAt,
      delay,
      aerosolGag,
      at: now,
    });
  } else {
    m.sprayPrepStartedAt = null;
    m.sprayActiveAt = null;
    room?.events?.push({ type: 'dragOonSprayEnded', machineId: m.id, reason: 'released', at: now });
  }
  return true;
}

export function stepDesolationSpray(room, m, dt, now) {
  if (!m.sprayHeld || m.retired || m.health <= 0 || m.campFire?.active || m.raze?.phase === 'holding' || m.flightLikeHell?.active) {
    if (m.sprayHeld) {
      m.sprayHeld = false;
      m.sprayPrepStartedAt = null;
      m.sprayActiveAt = null;
    }
    return false;
  }
  const op = room?.players?.get?.(m.operatorId);
  if (!op?.alive || (m.components?.Cannons?.health ?? 1) <= 0) {
    m.sprayHeld = false;
    room?.events?.push({ type: 'dragOonSprayEnded', machineId: m.id, reason: 'unavailable', at: now });
    return false;
  }
  if (now + 1e-9 < (m.sprayActiveAt ?? Infinity)) return false;

  const t = DRAG_OON_TUNING.spray;
  const tiers = m.infusions?.tiers ?? {};
  const fuelNeeded = t.fuelPerSec * dt;
  if (!spendDragOonFuel(m, fuelNeeded)) {
    m.sprayHeld = false;
    m.sprayPrepStartedAt = null;
    m.sprayActiveAt = null;
    room?.events?.push({ type: 'dragOonSprayEnded', machineId: m.id, reason: 'fuel_exhausted', at: now });
    return false;
  }

  addDragOonHeat(m, t.heatPerSec * dt, tiers.frost ?? 0);

  if (now - (m.sprayEmitAt ?? -Infinity) >= t.emitIntervalSec - 1e-6) {
    m.sprayEmitAt = now;
    const rays = dragOonCannonRays(m);
    const yawRate = (m.cannonYawVel ?? 0) + (m.turnVel ?? 0);
    const speed = t.baseSpeed * (t.lightningSpeedMult[clamp(tiers.lightning ?? 0, 0, 2)] ?? 1);
    const radius = t.baseSwathRadius * (t.fireRadiusMult[clamp(tiers.fire ?? 0, 0, 2)] ?? 1);
    const lifetime = t.galeLifetimeSec[clamp(tiers.gale ?? 0, 0, 2)] ?? t.baseSegmentLifetimeSec;
    const steelTier = tiers.steel ?? 0;
    const galeTier = tiers.gale ?? 0;
    const barricade = steelTier >= 2 && galeTier >= 2;
    const powerMult = m.brimmingBonusMult ?? 1;

    room.dragOonFlames ??= [];
    for (const r of rays) {
      if (isPointSuppressedByDragOon(room, r.origin, now)) continue;
      if (room.dragOonFlames.length >= t.maxActiveSegments * Math.max(1, getFleetMachines(room).length)) {
        room.dragOonFlames.shift();
      }
      const sweepTangent = {
        x: -r.direction.z * (yawRate >= 0 ? -1 : 1),
        z: r.direction.x * (yawRate >= 0 ? -1 : 1),
      };
      room.dragOonFlames.push({
        id: `fl:${m.id}:${++m.fieldSeq}`,
        machineId: m.id,
        ownerId: m.operatorId ?? null,
        team: m.team ?? null,
        cannonId: r.cannonId,
        nozzleId: r.nozzleId,
        origin: { ...r.origin },
        position: { ...r.origin },
        direction: { ...r.direction },
        speed,
        maxRange: t.baseRange,
        travelled: 0,
        radius,
        steelTier,
        barricade,
        sweepSpeed: Math.abs(yawRate),
        sweepTangent,
        powerMult,
        tiers: { ...tiers },
        bornAt: now,
        expiresAt: now + lifetime,
        stopped: false,
      });
    }
    room?.events?.push({ type: 'dragOonSprayPulse', machineId: m.id, rays: rays.map(r => r.origin), tiers: { ...tiers }, at: now });
  }
  return true;
}

/** Full Fire passive radiant heat damaging nearby foes while crew contributes >=2 Fire. */
export function stepDragOonRadiantHeat(room, m, now) {
  const fireTier = m.infusions?.tiers?.fire ?? 0;
  if (fireTier < 2 || m.retired || m.health <= 0) return;
  const t = DRAG_OON_TUNING.spray;
  if (now - (m.lastRadiantHeatAt ?? -Infinity) < t.radiantBurnIntervalSec - 1e-6) return;
  m.lastRadiantHeatAt = now;
  const heatBonus = 1 + clamp((m.heat ?? 0) / 140, 0, 1);
  const dmg = t.radiantHeatDpsBase * heatBonus * t.radiantBurnIntervalSec;
  for (const target of room.players?.values?.() ?? []) {
    if (!target.alive || target.operatingDragOonId === m.id || target.aboardDragOonId === m.id) continue;
    if (sameTeam(room, m.operatorId, m.team, target)) continue;
    const d = Math.hypot(target.position.x - m.x, target.position.y - m.y, target.position.z - m.z);
    if (d > t.radiantHeatRadius) continue;
    applyDamage(room, m.operatorId, target.id, dmg, 'dragoon-radiant-heat', now, null, {
      ongoing: true,
      infusionTiers: { fire: fireTier },
    });
  }
}

/**
 * Innate: Fire's the Limit — ignite underside fuel for explosive leap + heavy slam.
 * Uses explicit self-launch exception (never damages owning DRAG-OON).
 */
export function requestFiresTheLimit(room, m, player, now) {
  if (!m || m.retired || m.health <= 0 || m.mode === 'DESTROYED' || m.operatorId !== player?.id) {
    return { rejected: 'Operate DRAG-OON to use Fire’s the Limit.' };
  }
  if (m.campFire?.active) return { rejected: 'Unseal Camp Fire before launching.' };
  if (m.raze?.phase === 'holding') return { rejected: 'Release Raze the Pasture before launching.' };
  if (!m.grounded) return { rejected: 'Fire’s the Limit requires grounded ignition.' };
  if (m.leap && ['prep', 'airborne', 'recovery'].includes(m.leap.phase)) {
    return { rejected: 'Fire’s the Limit is already active.' };
  }
  if (now + 1e-8 < (m.leapReadyAt ?? 0)) {
    return { rejected: 'Fire’s the Limit is cooling down.' };
  }
  if ((m.fuel ?? 0) + 1e-8 < DRAG_OON_TUNING.leap.fuelCost) {
    return { rejected: 'Insufficient fuel for Fire’s the Limit.' };
  }

  const f = clamp(player.input?.forward ?? 0, -1, 1);
  const r = clamp(player.input?.right ?? 0, -1, 1);
  const yaw = m.heading ?? 0;
  const fwd = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  // Default toward forward facing unless player explicitly steers backward/sideways intent.
  let ix = Math.abs(f) + Math.abs(r) > 0.15 ? fwd.x * f + right.x * r : fwd.x;
  let iz = Math.abs(f) + Math.abs(r) > 0.15 ? fwd.z * f + right.z * r : fwd.z;
  const len = Math.hypot(ix, iz) || 1;
  ix /= len; iz /= len;

  m.leap = {
    phase: 'prep',
    startedAt: now,
    igniteAt: now + DRAG_OON_TUNING.leap.prepSec,
    dir: { x: ix, z: iz },
    selfBlastExempt: true,
    launchAnimState: 'shutters_opening',
    flightCushioned: false,
  };
  m.leapReadyAt = now + DRAG_OON_TUNING.leap.cooldownSec;
  room?.events?.push({
    type: 'dragOonLeapPhase',
    machineId: m.id,
    phase: 'shutters_opening',
    at: now,
  });
  return { leap: m.leap };
}

export function stepFiresTheLimit(room, m, dt, now, world = room.world) {
  const leap = m?.leap;
  if (!leap) return false;
  const t = DRAG_OON_TUNING.leap;

  if (leap.phase === 'prep') {
    leap.launchAnimState = now - leap.startedAt > t.prepSec * 0.5 ? 'fuel_discharge' : 'shutters_opening';
    if (now + 1e-9 < leap.igniteAt) return true;
    if (!spendDragOonFuel(m, t.fuelCost)) {
      m.leap = null;
      return false;
    }
    const tiers = m.infusions?.tiers ?? {};
    addDragOonHeat(m, t.heatGain, tiers.frost ?? 0);
    leap.phase = 'airborne';
    leap.launchAnimState = 'ignition';
    leap.launchedAt = now;
    m.grounded = false;
    m.velocity = {
      x: leap.dir.x * t.launchForwardSpeed,
      y: t.launchUpSpeed,
      z: leap.dir.z * t.launchForwardSpeed,
    };

    // Apply underside ignition blast ONLY to nearby enemies / enemy machines (explicit self-exempt!)
    const origin = dragOonUndersideOrigin(m);
    for (const target of room.players?.values?.() ?? []) {
      if (!target.alive || sameTeam(room, m.operatorId, m.team, target) || target.operatingDragOonId === m.id || target.aboardDragOonId === m.id) continue;
      const d = Math.hypot(target.position.x - origin.x, target.position.y - origin.y, target.position.z - origin.z);
      if (d > t.launchBlastRadius) continue;
      const falloff = clamp(1 - d / t.launchBlastRadius, 0.35, 1);
      const len = Math.hypot(target.position.x - origin.x, target.position.z - origin.z) || 1;
      applyDamage(room, m.operatorId, target.id, t.launchBlastDamage * falloff, 'dragoon-leap-ignition', now, {
        x: ((target.position.x - origin.x) / len) * t.launchKnockback * falloff,
        y: 4.5,
        z: ((target.position.z - origin.z) / len) * t.launchKnockback * falloff,
      });
    }
    // Damage enemy siege machines in underside blast radius while exempting self (`m.id`).
    for (const other of getFleetMachines(room)) {
      if (!other || other.id === m.id || other.retired || other.health <= 0) continue;
      if (m.team && other.team && m.team === other.team) continue;
      const d = Math.hypot(other.x - origin.x, other.y - origin.y, other.z - origin.z);
      if (d <= t.launchBlastRadius + 2) {
        damageFleetMachine(room, other, t.launchBlastDamage * 0.75, m.operatorId, 'fireball', now, { point: origin });
      }
    }
    room?.events?.push({
      type: 'dragOonLeapPhase',
      machineId: m.id,
      phase: 'launch',
      origin,
      direction: leap.dir,
      selfExempt: true,
      at: now,
    });
    return true;
  }

  if (leap.phase === 'airborne') {
    leap.launchAnimState = 'airborne';
    // Track whether Flight Like Hell cushioned this descent.
    if (m.flightLikeHell?.active) leap.flightCushioned = true;

    const op = room?.players?.get?.(m.operatorId);
    const input = op?.alive && op.operatingDragOonId === m.id ? op.input ?? {} : {};
    // Limited ballistic midair control (never turns Drag-oon into a nimble flyer).
    const fwd = { x: -Math.sin(m.heading ?? 0), z: -Math.cos(m.heading ?? 0) };
    const right = { x: Math.cos(m.heading ?? 0), z: -Math.sin(m.heading ?? 0) };
    const wishX = fwd.x * clamp(input.forward ?? 0, -1, 1) + right.x * clamp(input.right ?? 0, -1, 1);
    const wishZ = fwd.z * clamp(input.forward ?? 0, -1, 1) + right.z * clamp(input.right ?? 0, -1, 1);
    m.velocity.x += wishX * t.airControlAccel * dt;
    m.velocity.z += wishZ * t.airControlAccel * dt;

    // Gravity (modified while Flight Like Hell is firing downward).
    const flightActive = Boolean(m.flightLikeHell?.active);
    if (!flightActive) {
      m.velocity.y -= t.gravity * dt;
    }

    const nextX = m.x + m.velocity.x * dt;
    const nextZ = m.z + m.velocity.z * dt;
    const nextY = m.y + m.velocity.y * dt;

    // Horizontal solid obstacle containment
    const canSlideX = dragOonClear({ ...m, x: nextX, y: Math.max(m.y, nextY), z: m.z }, world);
    const canSlideZ = dragOonClear({ ...m, x: canSlideX ? nextX : m.x, y: Math.max(m.y, nextY), z: nextZ }, world);
    if (canSlideX) m.x = nextX; else m.velocity.x = 0;
    if (canSlideZ) m.z = nextZ; else m.velocity.z = 0;

    // Terrain landing detection
    const floor = surfaceHeightAt(m.x, m.z, Math.max(m.y, nextY) + 1.2, world);
    if (floor != null && nextY <= floor + 0.02 && m.velocity.y <= 0 && (now - (leap.launchedAt ?? now) > 0.08)) {
      m.y = floor;
      const pose = dragOonTerrainPose(m, world);
      if (pose) Object.assign(m, pose);
      m.grounded = true;
      const slamMult = leap.flightCushioned ? t.flightSlamReductionFactor : 1;
      const steelTier = m.infusions?.tiers?.steel ?? 0;
      const radius = steelTier >= 2 ? t.slamRadiusSteel2 : t.slamRadiusBase;
      const dmg = t.slamDamageBase * slamMult;
      const center = { x: m.x, y: floor, z: m.z };

      // Landing Slam!
      for (const target of room.players?.values?.() ?? []) {
        if (!target.alive || sameTeam(room, m.operatorId, m.team, target) || target.operatingDragOonId === m.id || target.aboardDragOonId === m.id) continue;
        const d = Math.hypot(target.position.x - center.x, target.position.z - center.z);
        if (d > radius || Math.abs(target.position.y - center.y) > 2.8) continue;
        const falloff = clamp(1 - (d / radius) * 0.45, 0.5, 1);
        const len = d || 1;
        applyDamage(room, m.operatorId, target.id, dmg * falloff, 'dragoon-landing-slam', now, {
          x: ((target.position.x - center.x) / len) * t.slamKnockback * falloff * slamMult,
          y: 4.0 * slamMult,
          z: ((target.position.z - center.z) / len) * t.slamKnockback * falloff * slamMult,
        }, { infusionTiers: m.infusions?.tiers });
      }
      for (const other of getFleetMachines(room)) {
        if (!other || other.id === m.id || other.retired || other.health <= 0) continue;
        if (m.team && other.team && m.team === other.team) continue;
        const d = Math.hypot(other.x - center.x, other.z - center.z);
        if (d <= radius + 2.2) {
          damageFleetMachine(room, other, dmg * 0.85, m.operatorId, 'ram', now, { point: center });
        }
      }

      // Full Steel triggers landing ground rupture waves!
      if (steelTier >= 2) {
        const fwdDir = { x: -Math.sin(m.heading ?? 0), z: -Math.cos(m.heading ?? 0) };
        const fissures = planRupture(world, center, fwdDir, RUPTURE);
        if (fissures.length) {
          room.ruptures ??= [];
          const r = {
            id: `dragoon-rup-${m.id}-${++m.fieldSeq}`,
            ownerId: m.operatorId ?? null,
            origin: { ...center },
            fissures,
            bornAt: now,
            reached: 0,
            caught: [],
            oneHit: { steel: 2, radial: true, tiers: { ...(m.infusions?.tiers ?? {}) } },
          };
          room.ruptures.push(r);
          room.events?.push({ type: 'rupture', id: r.id, ownerId: r.ownerId, origin: center, speed: RUPTURE.speed, fissures, radial: true, steel: 2, at: now });
        }
      }

      m.velocity = { x: 0, y: 0, z: 0 };
      m.cannonPitch = DRAG_OON_TUNING.cannonLandingSafePitch;
      m.cannonYaw = DRAG_OON_TUNING.cannonLandingSafeYaw;
      leap.phase = 'recovery';
      leap.launchAnimState = 'landing';
      leap.recoveryEndsAt = now + t.recoverySec;
      // Cleanly end Flight Like Hell upon unexpected / normal landing
      if (m.flightLikeHell?.active) {
        m.flightLikeHell.active = false;
        m.flightLikeHell.endedAt = now;
        m.cannonPitch = DRAG_OON_TUNING.cannonLandingSafePitch;
        m.cannonYaw = DRAG_OON_TUNING.cannonLandingSafeYaw;
        room?.events?.push({ type: 'dragOonSkillEnded', machineId: m.id, skill: 'flightLikeHell', reason: 'landed', at: now });
      }
      room?.events?.push({ type: 'dragOonLeapPhase', machineId: m.id, phase: 'landing', point: center, cushioned: leap.flightCushioned, steelRupture: steelTier >= 2, at: now });
    } else {
      m.y = nextY;
      // Airborne vertical burn scorches suppression beneath Drag-oon while Flight Like Hell fires
      if (flightActive && floor != null && m.y - floor <= DRAG_OON_TUNING.flightLikeHell.coneLength) {
        addSuppressionZone(room, m, { x: m.x, y: floor, z: m.z }, now);
      }
    }
    return true;
  }

  if (leap.phase === 'recovery') {
    leap.launchAnimState = 'recovery';
    if (now >= (leap.recoveryEndsAt ?? 0)) {
      m.leap = null;
    }
    return true;
  }
  return false;
}

/**
 * Innate: Steam the Team — circumferential expanding ring, radial damage/push scaled by heat,
 * terrain-occluded extinguishing, partial cooling/overheat relief, cooldown on discharge.
 */
export function requestSteamTheTeam(room, m, player, now) {
  if (!m || m.retired || m.health <= 0 || m.mode === 'DESTROYED' || m.operatorId !== player?.id) {
    return { rejected: 'Operate DRAG-OON to use Steam the Team.' };
  }
  if (now + 1e-8 < (m.steamReadyAt ?? 0)) {
    return { rejected: 'Steam the Team is cooling down.' };
  }

  const t = DRAG_OON_TUNING.steam;
  const tiers = { ...(m.infusions?.tiers ?? {}) };
  const vented = ventDragOonHeat(m);
  const heatFactor = clamp(vented.heatFraction, 0, 1.8);
  const speed = t.baseSpeed * (t.lightningSpeedMult[clamp(tiers.lightning ?? 0, 0, 2)] ?? 1);
  const thickness = t.baseThickness * (t.fireThicknessMult[clamp(tiers.fire ?? 0, 0, 2)] ?? 1);
  const height = t.baseHeight * (t.fireHeightMult[clamp(tiers.fire ?? 0, 0, 2)] ?? 1);
  const duration = t.baseDurationSec + (t.galeDurationBonusSec[clamp(tiers.gale ?? 0, 0, 2)] ?? 0);
  const contactWindow = (t.maxRadius / speed) + (t.frostContactBonusSec[clamp(tiers.frost ?? 0, 0, 2)] ?? 0);

  const ring = {
    id: `steam:${m.id}:${++m.fieldSeq}`,
    machineId: m.id,
    ownerId: m.operatorId ?? null,
    team: m.team ?? null,
    origin: { x: m.x, y: m.y, z: m.z },
    bornAt: now,
    expiresAt: now + Math.max(duration, contactWindow),
    visualUntil: now + Math.max(duration, contactWindow) + t.visualLingerExtraSec,
    initialWindowUntil: now + contactWindow,
    maxRadius: t.maxRadius,
    speed,
    thickness,
    height,
    baseDamage: (t.coldBaseDamage + t.hotBonusDamage * heatFactor) * (m.brimmingBonusMult ?? 1),
    knockback: t.baseKnockback * (0.55 + 0.65 * clamp(heatFactor, 0, 1.2)),
    heatMultiplier: 1 + 0.5 * heatFactor,
    tiers,
    hitIds: [],
  };

  room.dragOonSteamRings ??= [];
  room.dragOonSteamRings.push(ring);
  // Cooldown begins on discharge, even if cold!
  m.steamReadyAt = now + t.cooldownSec;

  room?.events?.push({
    type: 'dragOonSteam',
    machineId: m.id,
    ringId: ring.id,
    origin: ring.origin,
    ventedHeat: vented.ventedHeat,
    remainingHeat: vented.remainingHeat,
    overheatRelief: vented.overheatRelief,
    tiers,
    at: now,
  });
  return { ring, vented };
}
