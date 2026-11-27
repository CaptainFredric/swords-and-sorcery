// Authoritative implementation of DRAG-OON's FOUR equippable Siege Skills:
// 1. Raze the Pasture (stationary charge, inverse area/duration tradeoff, denial field)
// 2. Flight Like Hell (airborne inferno, descent hover + Full Gale climb, reversible maxHealth reduction,
//    environmental suppression regions, long cooldown + overheat capacity cap)
// 3. Camp Fire (sealed armored fortification, perimeter fire, uninterrupted Steel repair exception, timed reopen)
// 4. Brimming with Potential (escalating excess heat, progressive damage boost, crew internal DoT,
//    All Abort! amplification, Full Fire persistent slow cooling until dissipated)
import { DRAG_OON_TUNING } from '../src/dragOonConfig.mjs';
import { areAllies } from '../src/teams.mjs';
import { postureOf } from '../src/body.mjs';
import { surfaceHeightAt, segmentAabbHit } from '../src/collision.mjs';
import { applyDamage } from './combat.mjs';
import { getFleetMachines, damageFleetMachine } from './fleetGeometry.mjs';
import { addDragOonHeat, addDragOonOverheatPenalty, spendDragOonFuel } from './dragOonThermal.mjs';
import { addSuppressionZone, createRazeField } from './dragOonFields.mjs';
import { dragOonOccupantIds, cancelCrewTransitionsForPlayer } from './dragOonCrew.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const SKILL_COOLDOWNS = Object.freeze({
  razeThePasture: DRAG_OON_TUNING.raze.cooldownSec,
  flightLikeHell: DRAG_OON_TUNING.flightLikeHell.cooldownSec,
  campFire: DRAG_OON_TUNING.campFire.cooldownSec,
  brimmingWithPotential: DRAG_OON_TUNING.brimming.cooldownSec,
});

function sameTeam(room, ownerId, teamA, b) {
  if (!b) return false;
  if (ownerId && b.id === ownerId) return true;
  if (ownerId && areAllies(room, ownerId, b.id)) return true;
  if (teamA && b.team && teamA === b.team) return true;
  return false;
}

/**
 * Reversible, server-authoritative maxHealth reduction for Flight Like Hell prototype testing.
 * Distinct from %maxHP damage: caps target.maxHealth below ordinary 100 until respawn/round reset.
 */
export function applyDragOonMaxHealthDamage(room, victim, reductionAmount, now) {
  if (!victim || !victim.alive || !(reductionAmount > 0)) return 0;
  const baseMax = victim.baseMaxHealth ?? 100;
  victim.baseMaxHealth = baseMax;
  const curMax = victim.maxHealth ?? baseMax;
  const nextMax = Math.max(DRAG_OON_TUNING.flightLikeHell.maxHealthFloor, curMax - reductionAmount);
  const delta = Math.max(0, curMax - nextMax);
  if (delta <= 0) return 0;
  victim.maxHealth = nextMax;
  victim.dragOonMaxHealthLoss = Math.max(0, baseMax - nextMax);
  if (victim.health > nextMax) victim.health = nextMax;
  room?.events?.push({
    type: 'dragOonMaxHealthDamaged',
    playerId: victim.id,
    maxHealth: victim.maxHealth,
    loss: victim.dragOonMaxHealthLoss,
    at: now,
  });
  return delta;
}

/** Exposed predicate used by shared/sim/siegeSteel.mjs when Camp Fire protects Steel repairs. */
export function isDragOonCampFireUninterrupted(m, now = 0) {
  return Boolean(m?.campFire?.active && !m.campFire.reopeningAt && m.health > 0 && !m.retired && (now <= (m.campFire.until ?? Infinity)));
}

function stowCannonsSafe(m) {
  if (!m) return;
  m.cannonPitch = DRAG_OON_TUNING.cannonLandingSafePitch;
  m.cannonYaw = DRAG_OON_TUNING.cannonLandingSafeYaw;
}

function razeRadiusForHold(holdSec) {
  const t = DRAG_OON_TUNING.raze;
  // Diminishing radial expansion: approaches maxRadius asymptotically over hold duration.
  const k = 1 - Math.exp(-Math.max(0, holdSec) * 0.78);
  return t.minRadius + (t.maxRadius - t.minRadius) * k;
}

function razeStatsForRadius(radius) {
  const t = DRAG_OON_TUNING.raze;
  const frac = clamp((radius - t.minRadius) / Math.max(0.01, t.maxRadius - t.minRadius), 0, 1);
  // Larger radius -> higher initial burst damage; smaller radius -> significantly longer fire retention!
  const initialDamage = t.initialDamageSmall + (t.initialDamageLarge - t.initialDamageSmall) * frac;
  const burnDuration = t.burnDurationSmall + (t.burnDurationLarge - t.burnDurationSmall) * frac;
  return { initialDamage, burnDuration, frac };
}

export function requestDragOonSkill(room, m, player, message, now) {
  if (!m || m.retired || m.health <= 0 || m.mode === 'DESTROYED' || m.operatorId !== player?.id) {
    return 'Operate DRAG-OON to use its Skill.';
  }
  const skillId = m.skill?.id ?? 'razeThePasture';
  const down = message?.down !== false;

  // 1. RAZE THE PASTURE (hold to expand, release to delay+ignite)
  if (skillId === 'razeThePasture') {
    if (!down) {
      if (m.raze?.phase !== 'holding') return null;
      const t = DRAG_OON_TUNING.raze;
      m.raze.phase = 'delay';
      m.raze.igniteAt = now + t.ignitionDelaySec;
      m.skill.phase = 'releasing';
      room?.events?.push({ type: 'dragOonRazeReleased', machineId: m.id, radius: m.raze.radius, igniteAt: m.raze.igniteAt, at: now });
      return null;
    }
    if (m.raze?.phase === 'holding' || m.raze?.phase === 'delay') return null;
    if (now + 1e-8 < (m.skill?.readyAt ?? 0)) return 'Raze the Pasture is cooling down.';
    if (!m.grounded || m.campFire?.active || m.flightLikeHell?.active) return 'Raze the Pasture requires grounded open operation.';
    if ((m.fuel ?? 0) < DRAG_OON_TUNING.raze.fuelBaseCost) return 'Insufficient fuel for Raze the Pasture.';
    spendDragOonFuel(m, DRAG_OON_TUNING.raze.fuelBaseCost);
    m.sprayHeld = false;
    m.raze = {
      phase: 'holding',
      startedAt: now,
      radius: DRAG_OON_TUNING.raze.minRadius,
      fuelSpent: DRAG_OON_TUNING.raze.fuelBaseCost,
      center: { x: m.x, y: m.y, z: m.z },
    };
    m.skill.phase = 'primed';
    room?.events?.push({ type: 'dragOonRazeStarted', machineId: m.id, center: m.raze.center, at: now });
    return null;
  }

  // 2. FLIGHT LIKE HELL (usable while airborne; press/toggle or hold)
  if (skillId === 'flightLikeHell') {
    if (m.flightLikeHell?.active) {
      if (!down || message?.toggle !== false) {
        m.flightLikeHell.active = false;
        m.flightLikeHell.endedAt = now;
        m.skill.phase = 'idle';
        m.skill.readyAt = now + SKILL_COOLDOWNS.flightLikeHell;
        stowCannonsSafe(m);
        room?.events?.push({ type: 'dragOonSkillEnded', machineId: m.id, skill: 'flightLikeHell', reason: 'manual', at: now });
      }
      return null;
    }
    if (!down) return null;
    if (m.grounded) return 'Flight Like Hell can only engage while airborne.';
    if (now + 1e-8 < (m.skill?.readyAt ?? 0)) return 'Flight Like Hell is recovering.';
    if ((m.fuel ?? 0) < 6) return 'Insufficient fuel for Flight Like Hell.';
    if ((m.components?.Cannons?.health ?? 1) <= 0) return 'Cannons must be functional for Flight Like Hell.';

    m.sprayHeld = false;
    m.flightLikeHell = {
      active: true,
      startedAt: now,
      endedAt: null,
      hitCadence: {},
      aimYawOffset: 0,
    };
    m.skill.phase = 'active';
    m.cannonPitch = -1.25;
    room?.events?.push({ type: 'dragOonSkillStarted', machineId: m.id, skill: 'flightLikeHell', at: now });
    return null;
  }

  // 3. CAMP FIRE (fortified ground seal)
  if (skillId === 'campFire') {
    if (!down) return null;
    if (m.campFire?.active) {
      if (!m.campFire.reopeningAt) {
        m.campFire.reopeningAt = now + DRAG_OON_TUNING.campFire.reopenSec;
        room?.events?.push({ type: 'dragOonCampFireReopening', machineId: m.id, endsAt: m.campFire.reopeningAt, at: now });
      }
      return null;
    }
    if (!m.grounded || m.leap?.phase === 'airborne') return 'Camp Fire requires solid ground.';
    if (now + 1e-8 < (m.skill?.readyAt ?? 0)) return 'Camp Fire is cooling down.';
    if ((m.fuel ?? 0) < 8) return 'Insufficient fuel for Camp Fire flames.';
    // Cancel pending outdoor boarding so nobody glitches halfway through the sealed hatch
    for (const tr of [...(m.crewTransitions ?? [])]) {
      if (tr.kind === 'board') {
        const actor = room.players?.get?.(tr.playerId);
        if (actor) cancelCrewTransitionsForPlayer(m, actor);
      }
    }
    m.sprayHeld = false;
    m.campFire = {
      active: true,
      sealed: true,
      settled: false,
      flamesActive: true,
      startedAt: now,
      settledAt: now + DRAG_OON_TUNING.campFire.settleSec,
      until: now + DRAG_OON_TUNING.campFire.durationSec,
      reopeningAt: null,
      lastBurnAt: -Infinity,
    };
    m.skill.phase = 'active';
    room?.events?.push({ type: 'dragOonSkillStarted', machineId: m.id, skill: 'campFire', at: now });
    return null;
  }

  // 4. BRIMMING WITH POTENTIAL (toggleable escalating overpressure)
  if (skillId === 'brimmingWithPotential') {
    if (!down) return null;
    if (m.brimming?.active) {
      m.brimming.active = false;
      m.brimming.deactivatedAt = now;
      m.skill.phase = 'idle';
      m.skill.readyAt = now + SKILL_COOLDOWNS.brimmingWithPotential;
      room?.events?.push({ type: 'dragOonSkillEnded', machineId: m.id, skill: 'brimmingWithPotential', heat: m.heat, at: now });
      return null;
    }
    if (now + 1e-8 < (m.skill?.readyAt ?? 0)) return 'Brimming with Potential is cooling down.';
    m.brimming = {
      active: true,
      startedAt: now,
      lastCrewBurnAt: -Infinity,
      lastWarnLevel: 0,
    };
    m.skill.phase = 'active';
    room?.events?.push({ type: 'dragOonSkillStarted', machineId: m.id, skill: 'brimmingWithPotential', at: now });
    return null;
  }

  return 'Unknown DRAG-OON Skill.';
}

export function stepDragOonSkills(room, m, dt, now, world = room.world) {
  if (!m || m.retired || m.health <= 0 || m.mode === 'DESTROYED') return;
  const tiers = m.infusions?.tiers ?? {};

  // ---- 1. Raze the Pasture ----
  if (m.raze) {
    const t = DRAG_OON_TUNING.raze;
    if (m.raze.phase === 'holding') {
      const held = Math.max(0, now - m.raze.startedAt);
      const wantFuel = t.fuelPerSecHeld * dt;
      if (!spendDragOonFuel(m, wantFuel) || held >= t.maxHoldSec || !m.grounded || !m.operatorId) {
        // Fuel exhausted or max hold or lost pilot/grounding -> trigger ignition delay with current accumulated radius!
        m.raze.phase = 'delay';
        m.raze.igniteAt = now + t.ignitionDelaySec;
        m.skill.phase = 'releasing';
        room?.events?.push({ type: 'dragOonRazeReleased', machineId: m.id, radius: m.raze.radius, igniteAt: m.raze.igniteAt, at: now });
      } else {
        m.raze.fuelSpent += wantFuel;
        m.raze.radius = razeRadiusForHold(held);
        m.raze.center = { x: m.x, y: m.y, z: m.z };
      }
    } else if (m.raze.phase === 'delay') {
      if (now + 1e-9 >= m.raze.igniteAt) {
        const stats = razeStatsForRadius(m.raze.radius);
        addDragOonHeat(m, t.heatGainOnIgnite, tiers.frost ?? 0);
        createRazeField(room, m, m.raze.center, m.raze.radius, {
          initialDamage: stats.initialDamage,
          burnDuration: stats.burnDuration,
          at: now,
        });
        m.raze = null;
        m.skill.phase = 'idle';
        m.skill.readyAt = now + SKILL_COOLDOWNS.razeThePasture;
      }
    }
  }

  // ---- 2. Flight Like Hell ----
  if (m.flightLikeHell?.active) {
    const t = DRAG_OON_TUNING.flightLikeHell;
    const fuelSpend = t.fuelPerSec * dt;
    const hasPilot = Boolean(m.operatorId && room?.players?.get?.(m.operatorId)?.alive);
    const cannonsIntact = (m.components?.Cannons?.health ?? 1) > 0;
    if (m.grounded || !hasPilot || !cannonsIntact || !spendDragOonFuel(m, fuelSpend)) {
      m.flightLikeHell.active = false;
      m.flightLikeHell.endedAt = now;
      m.skill.phase = 'idle';
      m.skill.readyAt = now + SKILL_COOLDOWNS.flightLikeHell;
      stowCannonsSafe(m);
      room?.events?.push({
        type: 'dragOonSkillEnded',
        machineId: m.id,
        skill: 'flightLikeHell',
        reason: m.grounded ? 'grounded' : !cannonsIntact ? 'cannons_destroyed' : !hasPilot ? 'pilot_lost' : 'fuel_exhausted',
        at: now,
      });
    } else {
      addDragOonHeat(m, t.heatPerSec * dt, tiers.frost ?? 0);
      addDragOonOverheatPenalty(m, t.overheatCapPenaltyPerSec * dt);
      if (m.leap?.phase === 'airborne') m.leap.flightCushioned = true;

      // Gravity counter / hover / Full Gale powered climb!
      const galeTier = tiers.gale ?? 0;
      if (galeTier >= 2) {
        m.velocity.y = clamp(m.velocity.y + 18 * dt, -2.0, t.galeAscentSpeed);
      } else {
        m.velocity.y = Math.max(-t.maxDescentSpeed, m.velocity.y + (t.hoverGravityCounter - 22.0) * dt);
      }

      // Aimable downward cone origin -> scorch ground + concentrated inferno DPS + maxHP reduction
      const op = room?.players?.get?.(m.operatorId);
      const aimOffsetYaw = clamp(m.cannonYaw ?? 0, -0.5, 0.5);
      const forwardTilt = clamp((op?.pitch ?? -0.8) + 0.8, -0.35, 0.35);
      const dirX = -Math.sin((m.heading ?? 0) + aimOffsetYaw) * forwardTilt;
      const dirZ = -Math.cos((m.heading ?? 0) + aimOffsetYaw) * forwardTilt;
      const dirLen = Math.hypot(dirX, -1, dirZ) || 1;
      const coneDir = { x: dirX / dirLen, y: -1 / dirLen, z: dirZ / dirLen };

      const floorY = surfaceHeightAt(m.x + dirX * 2.5, m.z + dirZ * 2.5, m.y + 0.5, world);
      if (floorY != null && m.y - floorY <= t.coneLength) {
        const scorchCenter = { x: m.x + coneDir.x * (m.y - floorY), y: floorY, z: m.z + coneDir.z * (m.y - floorY) };
        addSuppressionZone(room, m, scorchCenter, now);
      }

      // Periodic cone DPS + shield/guard burn + maxHealth loss + structure burning
      const tickInterval = 0.25;
      m.flightLikeHell.lastTickAt ??= now - tickInterval;
      if (now - m.flightLikeHell.lastTickAt >= tickInterval - 1e-6) {
        m.flightLikeHell.lastTickAt = now;
        const rawDmg = t.damagePerSec * tickInterval * (m.brimmingBonusMult ?? 1);
        for (const target of room.players?.values?.() ?? []) {
          if (!target.alive || sameTeam(room, m.operatorId, m.team, target) || target.operatingDragOonId === m.id || target.aboardDragOonId === m.id) continue;
          const chest = { x: target.position.x, y: target.position.y + postureOf(target).height * 0.5, z: target.position.z };
          const dx = chest.x - m.x, dy = chest.y - (m.y + 0.5), dz = chest.z - m.z;
          const dist3 = Math.hypot(dx, dy, dz);
          if (dist3 > t.coneLength || dist3 < 0.01) continue;
          const dot = (dx * coneDir.x + dy * coneDir.y + dz * coneDir.z) / dist3;
          if (dot < Math.cos((t.coneHalfAngleDeg * Math.PI) / 180)) continue;
          if ((world?.solids ?? []).some(s => !String(s.id ?? '').startsWith('dragoon-') && segmentAabbHit([m.x, m.y + 0.4, m.z], [chest.x, chest.y, chest.z], s))) continue;

          if (target.guarding) {
            target.guardStamina = Math.max(0, (target.guardStamina ?? 0) - t.guardDrainPerSec * tickInterval);
            target.lastGuardDrainAt = now;
          }
          // Burns cleanly through Guards/pavises; deal full DoT + reversible max-HP loss!
          const actualDmg = rawDmg * (target.guarding && target.guardStamina > 0 ? 0.65 : 1);
          const beforeHp = target.health;
          applyDamage(room, m.operatorId, target.id, actualDmg, 'dragoon-flight-like-hell', now, null, {
            ongoing: true,
            infusionTiers: tiers,
          });
          if (target.alive) {
            const dealt = Math.max(0, beforeHp - target.health);
            applyDragOonMaxHealthDamage(room, target, (dealt > 0 ? dealt : actualDmg) * t.maxHealthReductionShare, now);
          }
        }
        for (const other of getFleetMachines(room)) {
          if (!other || other.id === m.id || other.retired || other.health <= 0) continue;
          if (m.team && other.team && m.team === other.team) continue;
          const dXZ = Math.hypot(other.x - m.x, other.z - m.z);
          if (dXZ <= 5.2 && other.y <= m.y + 1.0 && m.y - other.y <= t.coneLength) {
            damageFleetMachine(room, other, rawDmg, m.operatorId, 'fireball', now, { point: { x: other.x, y: other.y, z: other.z } });
          }
        }
      }
    }
  }

  // ---- 3. Camp Fire ----
  if (m.campFire?.active) {
    const cf = m.campFire;
    const t = DRAG_OON_TUNING.campFire;
    if (!cf.settled && now >= cf.settledAt) cf.settled = true;

    // Auto-expire, fuel depletion, or manual/crew-exit reopen
    if ((cf.reopeningAt && now >= cf.reopeningAt) || now >= cf.until || (cf.flamesActive && !spendDragOonFuel(m, t.fuelPerSec * dt))) {
      const reason = cf.reopeningAt ? 'reopened' : now >= cf.until ? 'expired' : 'fuel_exhausted';
      m.campFire = null;
      m.skill.phase = 'idle';
      m.skill.readyAt = now + SKILL_COOLDOWNS.campFire;
      room?.events?.push({ type: 'dragOonSkillEnded', machineId: m.id, skill: 'campFire', reason, at: now });
    } else if (cf.flamesActive && now - (cf.lastBurnAt ?? -Infinity) >= t.perimeterIntervalSec - 1e-6) {
      cf.lastBurnAt = now;
      const dmg = t.perimeterDps * t.perimeterIntervalSec;
      for (const target of room.players?.values?.() ?? []) {
        if (!target.alive || sameTeam(room, m.operatorId, m.team, target) || target.operatingDragOonId === m.id || target.aboardDragOonId === m.id) continue;
        const d = Math.hypot(target.position.x - m.x, target.position.y - m.y, target.position.z - m.z);
        if (d > t.perimeterRadius) continue;
        applyDamage(room, m.operatorId, target.id, dmg, 'dragoon-camp-fire', now, null, { ongoing: true });
      }
    }
  }

  // ---- 4. Brimming with Potential ----
  if (m.brimming?.active) {
    const t = DRAG_OON_TUNING.brimming;
    // Freeze excess heat growth smoothly when heat >= 100 reaches extreme overpressure cap.
    addDragOonHeat(m, t.heatPerSec * dt, tiers.frost ?? 0);
    if ((tiers.fire ?? 0) >= 2 && (m.heat ?? 0) > DRAG_OON_TUNING.heatMax) {
      m.retainedOverpressureHeat = true;
      m.retainedFireHeatFactor = t.fullFireCooldownDecayMult;
    }
    const opLost = !m.operatorId || !room?.players?.get?.(m.operatorId)?.alive;
    if (opLost) {
      m.brimming.active = false;
      m.skill.phase = 'idle';
      m.skill.readyAt = now + SKILL_COOLDOWNS.brimmingWithPotential;
    }
  }

  // Output amplification & internal crew heat hazard apply whenever heat is above normal max
  // (including lingering overpressure heat after turning Brimming off!).
  const overpressure = Math.max(0, (m.heat ?? 0) - DRAG_OON_TUNING.heatMax);
  const maxOver = Math.max(1, DRAG_OON_TUNING.overpressureHeatMax - DRAG_OON_TUNING.heatMax);
  const overFrac = clamp(overpressure / maxOver, 0, 1);
  m.brimmingBonusMult = m.brimming?.active || overpressure > 0
    ? 1 + DRAG_OON_TUNING.brimming.outputBonusMax * overFrac
    : 1;

  // Crew internal thermal trauma above insulation threshold (bypasses hull DoT immunity!).
  if ((m.heat ?? 0) >= DRAG_OON_TUNING.brimming.insulationHeatThreshold) {
    m.lastInternalHeatBurnAt ??= now - 0.5;
    if (now - m.lastInternalHeatBurnAt >= 0.5 - 1e-6) {
      m.lastInternalHeatBurnAt = now;
      const crewDps = DRAG_OON_TUNING.brimming.crewDpsMin +
        (DRAG_OON_TUNING.brimming.crewDpsMax - DRAG_OON_TUNING.brimming.crewDpsMin) * overFrac;
      const hurt = crewDps * 0.5;
      for (const oid of dragOonOccupantIds(m)) {
        const crewActor = room?.players?.get?.(oid);
        if (!crewActor?.alive) continue;
        // Internal overpressure heat hazard — intentional self/crew hazard without PvP attacker award.
        applyDamage(room, null, oid, hurt, 'brimming-internal-heat', now, null, {
          ongoing: true,
          skipSteel: true,
        });
      }
    }
  }
}
