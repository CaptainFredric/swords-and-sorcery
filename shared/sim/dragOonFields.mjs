// Bounded, server-authoritative spatial field simulation for DRAG-OON:
// - Desolation Spray volumetric flame segments + Steel/Gale barricades + Frostfire interference
// - Steam the Team expanding annular waves with terrain occlusion + elemental behaviors
// - Raze the Pasture ignited denial fields (inverse area vs duration)
// - Flight Like Hell scorched suppression regions (precision overlap "field against fields")
// - Full Fire machine-centered radiant heat DoT aura
import { areAllies } from '../src/teams.mjs';
import { postureOf } from '../src/body.mjs';
import { segmentAabbHit, surfaceHeightAt } from '../src/collision.mjs';
import { DRAG_OON_TUNING } from '../src/dragOonConfig.mjs';
import { applyDamage, isInGuardCone } from './combat.mjs';
import { launchBody, shoveBody } from '../src/movement.mjs';
import { getFleetMachines, getMachineKind, damageFleetMachine } from './fleetGeometry.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function actorCenter(p) {
  return { x: p.position.x, y: p.position.y + postureOf(p).height * 0.5, z: p.position.z };
}

function lineBlocked(world, a, b) {
  const solids = world?.solids ?? [];
  const p0 = [a.x, a.y, a.z], p1 = [b.x, b.y, b.z];
  return solids.some(s => {
    if (String(s.id ?? '').startsWith('dragoon-')) return false;
    const hit = segmentAabbHit(p0, p1, s);
    return hit && hit.t > 0.02 && hit.t < 0.98;
  });
}

function sameTeam(room, aId, teamA, b) {
  if (!b) return false;
  if (aId && b.id === aId) return true;
  if (aId && areAllies(room, aId, b.id)) return true;
  if (teamA && b.team && teamA === b.team) return true;
  return false;
}

export function applyDragOonFrostInterference(room, victim, sourceId, now, durationSec = DRAG_OON_TUNING.spray.frostRecoveryDurationSec) {
  if (!victim?.alive || (victim.spawnProtectionUntil ?? 0) > now) return false;
  const until = now + durationSec;
  const prev = victim.dragOonFrostInterference;
  if (!prev || prev.until < until) {
    victim.dragOonFrostInterference = {
      at: now,
      until,
      sourceId: sourceId ?? null,
      cooldownFactor: DRAG_OON_TUNING.spray.frostCooldownScale,
      staminaRegenFactor: DRAG_OON_TUNING.spray.frostStaminaRegenScale,
    };
    room?.events?.push({ type: 'dragOonFrostInterference', playerId: victim.id, until, at: now });
  }
  return true;
}

/**
 * Checks whether a point lies inside any active Flight Like Hell scorched suppression region.
 * Spatial overlap is evaluated strictly within each zone's bounds so small scorch marks
 * never wipe outer parts of much larger fields.
 */
export function isPointSuppressedByDragOon(room, point, nowSec) {
  const zones = room?.dragOonSuppressionZones;
  if (!zones?.length || !point) return false;
  for (const z of zones) {
    if (nowSec >= z.expiresAt || nowSec < z.bornAt) continue;
    const dXZ = Math.hypot(point.x - z.center.x, point.z - z.center.z);
    if (dXZ > z.radius) continue;
    if (point.y < (z.bottomY ?? z.center.y - 1.8) || point.y > (z.topY ?? z.center.y + 3.2)) continue;
    return true;
  }
  return false;
}

export function addSuppressionZone(room, m, center, nowSec, { radius = DRAG_OON_TUNING.flightLikeHell.scorchRadius, durationSec = DRAG_OON_TUNING.flightLikeHell.scorchDurationSec } = {}) {
  room.dragOonSuppressionZones ??= [];
  // Merge/refresh nearby zones from same machine to keep zone count strictly bounded.
  const maxZones = DRAG_OON_TUNING.flightLikeHell.maxScorchZonesPerMachine;
  const existing = room.dragOonSuppressionZones.find(
    z => z.machineId === m.id && Math.hypot(z.center.x - center.x, z.center.z - center.z) < radius * 0.55 && Math.abs(z.center.y - center.y) < 1.8
  );
  if (existing) {
    existing.bornAt = nowSec;
    existing.expiresAt = Math.max(existing.expiresAt, nowSec + durationSec);
    existing.radius = Math.max(existing.radius, radius);
    return existing;
  }
  const sameMachineZones = room.dragOonSuppressionZones.filter(z => z.machineId === m.id);
  if (sameMachineZones.length >= maxZones) {
    const oldest = sameMachineZones[0];
    const idx = room.dragOonSuppressionZones.indexOf(oldest);
    if (idx >= 0) room.dragOonSuppressionZones.splice(idx, 1);
  }
  const zone = {
    id: `scorch:${m.id}:${++m.fieldSeq}`,
    machineId: m.id,
    ownerId: m.operatorId ?? null,
    team: m.team ?? null,
    center: { x: center.x, y: center.y, z: center.z },
    radius,
    bottomY: center.y - 1.5,
    topY: center.y + 2.8,
    bornAt: nowSec,
    expiresAt: nowSec + durationSec,
  };
  room.dragOonSuppressionZones.push(zone);
  room.events?.push({ type: 'dragOonScorchZone', machineId: m.id, zoneId: zone.id, center: zone.center, radius, expiresAt: zone.expiresAt, at: nowSec });
  return zone;
}

/** Evaluates incoming projectile attenuation through Steel flames, Steel+Gale barricades, or Steel steam. */
export function dragOonProjectileAttenuation(room, from, to, projectile, nowSec) {
  let speedScale = 1;
  let damageScale = 1;
  const mid = { x: (from.x + to.x) * 0.5, y: (from.y + to.y) * 0.5, z: (from.z + to.z) * 0.5 };
  for (const seg of room?.dragOonFlames ?? []) {
    if (nowSec >= seg.expiresAt || !(seg.steelTier >= 1)) continue;
    if (seg.team && room?.players?.get?.(projectile.ownerId)?.team === seg.team && seg.ownerId === projectile.ownerId) continue;
    const d = Math.hypot(mid.x - seg.position.x, mid.y - seg.position.y, mid.z - seg.position.z);
    if (d <= seg.radius + 0.35) {
      const atten = DRAG_OON_TUNING.spray.steelAttenuation[clamp(seg.steelTier, 0, 2)];
      speedScale = Math.min(speedScale, 1 - atten * 0.65);
      damageScale = Math.min(damageScale, 1 - atten * 0.45);
    }
  }
  for (const ring of room?.dragOonSteamRings ?? []) {
    if (nowSec >= ring.visualUntil || !(ring.tiers?.steel >= 1)) continue;
    const curR = ringRadiusAt(ring, nowSec);
    const halfThick = ring.thickness * 0.5;
    const dXZ = Math.hypot(mid.x - ring.origin.x, mid.z - ring.origin.z);
    if (Math.abs(dXZ - curR) <= halfThick + 0.3 && mid.y >= ring.origin.y - 0.5 && mid.y <= ring.origin.y + ring.height) {
      const atten = DRAG_OON_TUNING.steam.steelProjectileSlow[clamp(ring.tiers.steel, 0, 2)];
      speedScale = Math.min(speedScale, 1 - atten * 0.65);
      damageScale = Math.min(damageScale, 1 - atten * 0.45);
    }
  }
  return { speedScale, damageScale };
}

/** Near-solid Steel+Gale flame barricades & Steel steam barriers resist movement & optionally inflict push. */
export function applyDragOonBarricadeResistance(room, player, dt, nowSec) {
  if (!player?.alive || player.operatingDragOonId || player.aboardDragOonId) return;
  let dragFactor = 1;
  let pushX = 0, pushY = 0, pushZ = 0;

  for (const seg of room?.dragOonFlames ?? []) {
    if (nowSec >= seg.expiresAt) continue;
    if (sameTeam(room, seg.ownerId, seg.team, player)) continue;
    const center = actorCenter(player);
    const d = Math.hypot(center.x - seg.position.x, center.y - seg.position.y, center.z - seg.position.z);
    const reach = seg.radius + 0.45 + (seg.tiers?.gale >= 2 ? 0.55 : 0);
    if (d > reach) continue;

    // Steel >= 1 (+ especially Steel+Gale barricade): physical core resistance against passing through.
    if ((seg.steelTier ?? 0) >= 1 && d <= seg.radius + 0.35) {
      const resist = DRAG_OON_TUNING.spray.steelMoveDrag[clamp(seg.steelTier, 0, 2)];
      dragFactor = Math.min(dragFactor, 1 - resist);
      // Gentle outward elastic push if deep inside near-solid Steel+Gale barricade (not an invisible brick wall).
      if (seg.barricade) {
        const dx = center.x - seg.position.x, dz = center.z - seg.position.z;
        const len = Math.hypot(dx, dz) || 1;
        pushX += (dx / len) * 5.2;
        pushZ += (dz / len) * 5.2;
      }
    }
    // Gale tier 2: continuous repulsive force pushing away along nozzle direction / windbox.
    if ((seg.tiers?.gale ?? 0) >= 2 && (!seg.guardedBy?.includes?.(player.id))) {
      const push = DRAG_OON_TUNING.spray.galePushSpeed;
      pushX += seg.direction.x * push;
      pushZ += seg.direction.z * push;
    }
  }

  for (const ring of room?.dragOonSteamRings ?? []) {
    if (nowSec >= ring.expiresAt) continue;
    if (sameTeam(room, ring.ownerId, ring.team, player)) continue;
    const curR = ringRadiusAt(ring, nowSec);
    const halfThick = ring.thickness * 0.5;
    const dXZ = Math.hypot(player.position.x - ring.origin.x, player.position.z - ring.origin.z);
    if (Math.abs(dXZ - curR) > halfThick + 0.45 || player.position.y < ring.origin.y - 0.6 || player.position.y > ring.origin.y + ring.height) continue;
    if ((ring.tiers?.steel ?? 0) >= 1) {
      const resist = DRAG_OON_TUNING.steam.steelMoveResist[clamp(ring.tiers.steel, 0, 2)];
      dragFactor = Math.min(dragFactor, 1 - resist);
    }
    if ((ring.tiers?.gale ?? 0) >= 1 && !lineBlocked(room.world, { x: ring.origin.x, y: ring.origin.y + 1.0, z: ring.origin.z }, actorCenter(player))) {
      const len = dXZ || 1;
      const wind = DRAG_OON_TUNING.steam.galeOutwardWindSpeed * (ring.tiers.gale >= 2 ? 1.3 : 0.8);
      pushX += ((player.position.x - ring.origin.x) / len) * wind;
      pushZ += ((player.position.z - ring.origin.z) / len) * wind;
    }
  }

  if (dragFactor < 1 && player.velocity) {
    player.velocity.x *= dragFactor;
    player.velocity.z *= dragFactor;
  }
  if (pushX !== 0 || pushZ !== 0) {
    player.impulse ??= { x: 0, z: 0 };
    player.impulse.x += pushX * dt * 2.2;
    player.impulse.z += pushZ * dt * 2.2;
  }
}

export function ringRadiusAt(ring, nowSec) {
  const age = Math.max(0, nowSec - ring.bornAt);
  return Math.min(ring.maxRadius, age * ring.speed);
}

/** Extinguishes environmental fire strictly along the expanding steam annulus where unblocked by terrain. */
export function extinguishWithSteamRing(room, ring, nowSec) {
  const curR = ringRadiusAt(ring, nowSec);
  const inner = Math.max(0, curR - ring.thickness * 0.6);
  const outer = curR + ring.thickness * 0.65;
  const origin = { x: ring.origin.x, y: ring.origin.y + 0.9, z: ring.origin.z };
  const inRing = (pos) => {
    const dXZ = Math.hypot(pos.x - ring.origin.x, pos.z - ring.origin.z);
    if (dXZ > outer || dXZ < inner * 0.45) return false;
    if (Math.abs(pos.y - ring.origin.y) > ring.height) return false;
    return !lineBlocked(room.world, origin, { x: pos.x, y: pos.y + 0.5, z: pos.z });
  };

  // Extinguish active flame segments & lingering flames
  if (room.dragOonFlames?.length) {
    room.dragOonFlames = room.dragOonFlames.filter(seg => !inRing(seg.position));
  }
  // Extinguish ignited Raze the Pasture zones (leaves unrelated abilities untouched)
  if (room.dragOonRazeFields?.length) {
    room.dragOonRazeFields = room.dragOonRazeFields.filter(f => !inRing(f.center));
  }
  // Extinguish active Camp Fire protective exterior flames without removing armor or healing pool
  for (const m of getFleetMachines(room)) {
    if (getMachineKind(m) === 'dragoon' && m.campFire?.flamesActive && inRing({ x: m.x, y: m.y, z: m.z })) {
      m.campFire.flamesActive = false;
      room.events?.push({ type: 'dragOonCampFireExtinguished', machineId: m.id, byMachineId: ring.machineId, at: nowSec });
    }
  }
  // Extinguish active burning zones (Valkyrie + Disaster fire fields) where ring reaches cleanly
  if (room.oneHitBurnZones?.length) {
    room.oneHitBurnZones = room.oneHitBurnZones.filter(z => !inRing(z.position));
  }
  if (room.flightBurnZones?.length) {
    room.flightBurnZones = room.flightBurnZones.filter(z => !inRing(z.point));
  }
  // Extinguish active burns on actors inside the ring without wiping unrelated chills/staggers
  for (const p of room.players?.values?.() ?? []) {
    if (p.burn && inRing(p.position)) {
      p.burn = null;
      room.events?.push({ type: 'dragOonFireExtinguished', playerId: p.id, at: nowSec });
    }
  }
}

export function createRazeField(room, m, center, radius, { initialDamage, burnDuration, at }) {
  room.dragOonRazeFields ??= [];
  if (isPointSuppressedByDragOon(room, center, at)) {
    room.events?.push({ type: 'dragOonFieldSuppressed', machineId: m.id, point: center, at });
    return null;
  }
  const same = room.dragOonRazeFields.filter(f => f.machineId === m.id);
  if (same.length >= DRAG_OON_TUNING.raze.maxFieldsPerMachine) {
    const oldest = room.dragOonRazeFields.indexOf(same[0]);
    if (oldest >= 0) room.dragOonRazeFields.splice(oldest, 1);
  }
  const field = {
    id: `raze:${m.id}:${++m.fieldSeq}`,
    machineId: m.id,
    ownerId: m.operatorId ?? null,
    team: m.team ?? null,
    center: { ...center },
    radius,
    initialDamage,
    bornAt: at,
    expiresAt: at + burnDuration,
    hitAt: {},
    infusions: { ...(m.infusions?.tiers ?? {}) },
  };
  room.dragOonRazeFields.push(field);

  // Apply initial burst damage to hostile Spellblades & enemy machines within unobstructed radius.
  for (const target of room.players.values()) {
    if (!target.alive || target.operatingDragOonId === m.id || target.aboardDragOonId === m.id) continue;
    if (sameTeam(room, field.ownerId, field.team, target)) continue;
    const dXZ = Math.hypot(target.position.x - center.x, target.position.z - center.z);
    if (dXZ > radius + 0.4 || Math.abs(target.position.y - center.y) > 2.2) continue;
    if (lineBlocked(room.world, { x: center.x, y: center.y + 0.5, z: center.z }, actorCenter(target))) continue;
    const falloff = clamp(1 - (dXZ / (radius || 1)) * 0.35, 0.55, 1);
    const dmg = initialDamage * falloff * (m.brimmingBonusMult ?? 1);
    applyDamage(room, field.ownerId, target.id, dmg, 'dragoon-raze', at, null, {
      infusionTiers: field.infusions,
    });
  }
  room.events?.push({ type: 'dragOonRazeIgnited', machineId: m.id, fieldId: field.id, center, radius, initialDamage, duration: burnDuration, expiresAt: field.expiresAt, at });
  return field;
}

export function stepDragOonFields(room, dt, nowSec, world = room.world) {
  if (!room) return;
  const machinesById = new Map(getFleetMachines(room).map(mach => [mach.id, mach]));

  // 1. Prune expired scorched suppression zones first & trim newly overlapped ground fields cleanly.
  if (room.dragOonSuppressionZones?.length) {
    room.dragOonSuppressionZones = room.dragOonSuppressionZones.filter(z => nowSec < z.expiresAt);
  }
  if (room.dragOonRazeFields?.length) {
    room.dragOonRazeFields = room.dragOonRazeFields.filter(f => nowSec < f.expiresAt);
  }

  // 2. Advance & resolve Desolation Spray segments (including Steel+Gale lingering barricades).
  if (room.dragOonFlames?.length) {
    const aliveFlames = [];
    const perTargetHitCheck = new Map(); // Deduplicate overlapping segments/nozzles in the same tick step
    for (const seg of room.dragOonFlames) {
      if (nowSec >= seg.expiresAt) continue;
      if (isPointSuppressedByDragOon(room, seg.position, nowSec)) continue;

      if (!seg.stopped && seg.travelled < seg.maxRange) {
        const stepDist = Math.min(seg.maxRange - seg.travelled, seg.speed * dt);
        const nextPos = {
          x: seg.position.x + seg.direction.x * stepDist,
          y: seg.position.y + seg.direction.y * stepDist,
          z: seg.position.z + seg.direction.z * stepDist,
        };
        if (lineBlocked(world, seg.position, nextPos)) {
          seg.stopped = true;
        } else {
          const ground = surfaceHeightAt(nextPos.x, nextPos.z, nextPos.y + 0.5, world);
          if (ground != null && nextPos.y < ground + 0.15) {
            nextPos.y = ground + 0.18;
            seg.stopped = true;
          }
          seg.position = nextPos;
          seg.travelled += stepDist;
          if (seg.travelled >= seg.maxRange - 1e-4) seg.stopped = true;
        }
      }
      aliveFlames.push(seg);

      // Hostile Spellblade damage & Steel sweep / Frostfire interference evaluation
      const sourceMachine = machinesById.get(seg.machineId);
      const cycleMap = sourceMachine ? (sourceMachine.sprayVictimCadence ??= {}) : {};
      for (const target of room.players.values()) {
        if (!target.alive || target.operatingDragOonId === seg.machineId || target.aboardDragOonId === seg.machineId) continue;
        if (sameTeam(room, seg.ownerId, seg.team, target)) continue;
        const center = actorCenter(target);
        const d = Math.hypot(center.x - seg.position.x, center.y - seg.position.y, center.z - seg.position.z);
        if (d > seg.radius + 0.45) continue;
        if (lineBlocked(world, seg.position, center)) continue;

        const key = `${seg.machineId}:${target.id}`;
        const guarded = target.guarding && isInGuardCone(target, { position: seg.origin }, nowSec);

        // Full Steel sweeping physical impact (distinct from Gale push; limited by cadence)
        if ((seg.steelTier ?? 0) >= 2 && (seg.sweepSpeed ?? 0) >= DRAG_OON_TUNING.spray.steelSweepMinSpeed && sourceMachine) {
          sourceMachine.sweepImpactAt ??= {};
          if (nowSec - (sourceMachine.sweepImpactAt[target.id] ?? -Infinity) >= DRAG_OON_TUNING.spray.steelSweepImpactCooldownSec) {
            sourceMachine.sweepImpactAt[target.id] = nowSec;
            const lat = seg.sweepTangent ?? { x: -seg.direction.z, z: seg.direction.x };
            applyDamage(room, seg.ownerId, target.id, DRAG_OON_TUNING.spray.steelSweepImpactDamage * (guarded ? 0.55 : 1), 'dragoon-steel-sweep', nowSec, {
              x: lat.x * 7.5 * (guarded ? 0.45 : 1),
              y: 1.8,
              z: lat.z * 7.5 * (guarded ? 0.45 : 1),
            }, { infusionTiers: seg.tiers });
          }
        }

        // Deduplicated sustained flame tick across all 4 nozzle origins per machine
        const lastAt = cycleMap[target.id] ?? -Infinity;
        if (nowSec - lastAt < DRAG_OON_TUNING.spray.damageTickIntervalSec - 1e-6) continue;
        if (perTargetHitCheck.has(key)) continue;
        perTargetHitCheck.set(key, seg);

        cycleMap[target.id] = nowSec;
        const falloff = (seg.steelTier ?? 0) >= 2
          ? 1
          : clamp(1 - (seg.travelled / Math.max(0.1, seg.maxRange)) * (1 - DRAG_OON_TUNING.spray.minFalloffRatio), DRAG_OON_TUNING.spray.minFalloffRatio, 1);
        const dps = DRAG_OON_TUNING.spray.damagePerSecNear * falloff * (seg.powerMult ?? 1);
        const dmg = dps * DRAG_OON_TUNING.spray.damageTickIntervalSec;

        if (guarded) {
          target.guardStamina = Math.max(0, (target.guardStamina ?? 0) - dmg * 0.75);
          target.lastGuardDrainAt = nowSec;
        }
        applyDamage(room, seg.ownerId, target.id, dmg * (guarded ? 0.42 : 1), 'dragoon-flame-dot', nowSec, null, {
          ongoing: true,
          infusionTiers: seg.tiers,
        });
        if (target.alive && (seg.tiers?.frost ?? 0) >= 2) {
          applyDragOonFrostInterference(room, target, seg.ownerId, nowSec, DRAG_OON_TUNING.spray.frostRecoveryDurationSec);
        }
      }

      // Enemy siege machines damaged once per cadence interval per target machine
      if (sourceMachine) {
        sourceMachine.sprayMachineCadence ??= {};
        for (const other of getFleetMachines(room)) {
          if (!other || other.id === seg.machineId || other.retired || other.health <= 0) continue;
          if (seg.team && other.team && seg.team === other.team) continue;
          const d = Math.hypot(other.x - seg.position.x, other.y + 1.0 - seg.position.y, other.z - seg.position.z);
          if (d > seg.radius + 2.2) continue;
          const lastM = sourceMachine.sprayMachineCadence[other.id] ?? -Infinity;
          if (nowSec - lastM < DRAG_OON_TUNING.spray.damageTickIntervalSec - 1e-6) continue;
          sourceMachine.sprayMachineCadence[other.id] = nowSec;
          const falloff = (seg.steelTier ?? 0) >= 2 ? 1 : clamp(1 - (seg.travelled / Math.max(0.1, seg.maxRange)) * 0.54, 0.46, 1);
          const dmg = DRAG_OON_TUNING.spray.damagePerSecNear * falloff * (seg.powerMult ?? 1) * DRAG_OON_TUNING.spray.damageTickIntervalSec;
          damageFleetMachine(room, other, dmg, seg.ownerId, 'fireball', nowSec, { point: seg.position });
        }
      }
    }
    room.dragOonFlames = aliveFlames;
  }

  // 3. Step expanding annular Steam the Team discharges.
  if (room.dragOonSteamRings?.length) {
    const activeRings = [];
    for (const ring of room.dragOonSteamRings) {
      if (nowSec >= ring.visualUntil) continue;
      activeRings.push(ring);
      extinguishWithSteamRing(room, ring, nowSec);
      if (nowSec >= ring.expiresAt) continue; // Visual linger past damaging expiration

      const curR = ringRadiusAt(ring, nowSec);
      const halfThick = ring.thickness * 0.5;
      const tiers = ring.tiers ?? {};
      const originEye = { x: ring.origin.x, y: ring.origin.y + 1.1, z: ring.origin.z };

      for (const target of room.players.values()) {
        if (!target.alive || target.operatingDragOonId === ring.machineId || target.aboardDragOonId === ring.machineId) continue;
        if (sameTeam(room, ring.ownerId, ring.team, target)) continue;
        if (Math.abs(target.position.y - ring.origin.y) > ring.height) continue;

        const dXZ = Math.hypot(target.position.x - ring.origin.x, target.position.z - ring.origin.z);
        const inAnnulus = Math.abs(dXZ - curR) <= halfThick + 0.45 && dXZ <= ring.maxRadius + 0.45;
        if (!inAnnulus) continue;

        const targetEye = actorCenter(target);
        const directBlocked = lineBlocked(world, originEye, targetEye);
        // Normal steam stops at walls. Lightning >= 1 permits affecting enemies partially veiled behind obstacle
        // edges if they intersect the ring volume AND have at least one valid angled/elevated sightline, never full cover.
        let exposed = !directBlocked;
        if (!exposed && (tiers.lightning ?? 0) >= 1) {
          const midCheckA = { x: originEye.x, y: originEye.y + 1.1, z: originEye.z };
          const crown = { x: target.position.x, y: target.position.y + postureOf(target).crown, z: target.position.z };
          exposed = !lineBlocked(world, midCheckA, crown);
        }
        if (!exposed) continue;

        const alreadyHit = ring.hitIds.includes(target.id);
        const withinInitialWindow = nowSec <= ring.initialWindowUntil;

        // Fire-infused ring converts single hit to front-loaded + ongoing exposure DoT.
        if ((tiers.fire ?? 0) >= 1 && alreadyHit) {
          ring.fireDotAt ??= {};
          const prevDot = ring.fireDotAt[target.id] ?? ring.bornAt;
          if (nowSec - prevDot >= 0.25) {
            ring.fireDotAt[target.id] = nowSec;
            const dScale = clamp(1 - (dXZ / Math.max(1, ring.maxRadius)) * (1 - DRAG_OON_TUNING.steam.minDistanceFalloff), DRAG_OON_TUNING.steam.minDistanceFalloff, 1);
            const dotDmg = DRAG_OON_TUNING.steam.fireDotPerSec * dScale * 0.25 * (ring.heatMultiplier ?? 1);
            applyDamage(room, ring.ownerId, target.id, dotDmg, 'dragoon-steam-fire-dot', nowSec, null, {
              ongoing: true,
              infusionTiers: tiers,
            });
          }
          continue;
        }

        if (alreadyHit || !withinInitialWindow) continue;
        ring.hitIds.push(target.id);

        const distFactor = clamp(1 - (dXZ / Math.max(1, ring.maxRadius)) * (1 - DRAG_OON_TUNING.steam.minDistanceFalloff), DRAG_OON_TUNING.steam.minDistanceFalloff, 1);
        let dmg = ring.baseDamage * distFactor;
        if ((tiers.fire ?? 0) >= 1) dmg *= DRAG_OON_TUNING.steam.fireFrontloadShare;

        const len = dXZ || 1;
        const knock = ring.knockback * distFactor;
        const guarded = target.guarding && isInGuardCone(target, { position: ring.origin }, nowSec);
        const actualDmg = dmg * (guarded ? 0.55 : 1);

        applyDamage(room, ring.ownerId, target.id, actualDmg, 'dragoon-steam', nowSec, null, {
          infusionTiers: tiers,
        });
        if (target.alive) {
          const pushScale = guarded ? 0.45 : 1;
          shoveBody(target, {
            x: ((target.position.x - ring.origin.x) / len) * knock * pushScale,
            y: 1.5 * pushScale,
            z: ((target.position.z - ring.origin.z) / len) * knock * pushScale,
          });
          target.lastKnockbackAt = nowSec;
          target.lastKnockbackBy = ring.ownerId;
          target.lastKnockbackSource = 'dragoon-steam';
          if ((tiers.frost ?? 0) >= 1) {
            applyDragOonFrostInterference(room, target, ring.ownerId, nowSec, DRAG_OON_TUNING.spray.frostRecoveryDurationSec);
          }
        }
      }
    }
    room.dragOonSteamRings = activeRings;
  }

  // 4. Step ignited Raze the Pasture areas (subject to spatial suppression by Flight Like Hell).
  if (room.dragOonRazeFields?.length) {
    for (const field of room.dragOonRazeFields) {
      for (const target of room.players.values()) {
        if (!target.alive || target.operatingDragOonId === field.machineId || target.aboardDragOonId === field.machineId) continue;
        if (sameTeam(room, field.ownerId, field.team, target)) continue;
        if (Math.hypot(target.position.x - field.center.x, target.position.z - field.center.z) > field.radius + 0.35) continue;
        if (Math.abs(target.position.y - field.center.y) > 2.0) continue;
        // Suppressed sub-regions do not burn inside their boundary without erasing outer field area.
        if (isPointSuppressedByDragOon(room, target.position, nowSec)) continue;
        if (lineBlocked(world, { x: field.center.x, y: field.center.y + 0.5, z: field.center.z }, actorCenter(target))) continue;

        const lastHit = field.hitAt[target.id] ?? -Infinity;
        if (nowSec - lastHit < DRAG_OON_TUNING.raze.burnIntervalSec - 1e-6) continue;
        field.hitAt[target.id] = nowSec;
        applyDamage(room, field.ownerId, target.id, DRAG_OON_TUNING.raze.burnDps * DRAG_OON_TUNING.raze.burnIntervalSec, 'dragoon-raze-dot', nowSec, null, {
          ongoing: true,
          infusionTiers: field.infusions,
        });
      }
    }
  }
}
