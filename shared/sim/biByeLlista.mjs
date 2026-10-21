import { segmentAabbHit } from '../src/collision.mjs';
import { surfaceHeightAt } from '../src/collision.mjs';
import { applyDamage } from './combat.mjs';

/**
 * Bi-Bye-llista (Two-Bolt Ballista) Configuration & Tuning.
 * Provisional values for Practice Yard gameplay prototype.
 */
export const BI_BYE_LLISTA_CONFIG = Object.freeze({
  emplacement: Object.freeze({
    id: 'bibye-practice-01',
    x: 5.5,
    y: 0,
    z: -14.6,
    baseYaw: -Math.PI / 2, // Facing East (+X) toward the tourney archery targets
    yawLimit: Math.PI / 4, // +/- 45 degree horizontal traverse arc
    pitchMin: -0.15, // ~-8.6 degrees downward depression
    pitchMax: 0.35,  // ~20.0 degrees upward elevation
    interactRadius: 2.5, // Distance to mount/operate
    operatorOffset: Object.freeze({ x: -1.2, y: 0, z: 0 }), // Operator standing position
  }),

  timing: Object.freeze({
    shotIntervalSec: 0.200, // Exactly 200ms between Shot I and Shot II
    spentRecoverySec: 0.250, // Spent recovery before mechanical reload begins
    reloadDurationSec: 6.000, // 6.0s mechanical reload (matches Argon 04_BiBye_Mechanical_Reload clip)
  }),

  shotI: Object.freeze({
    id: 'bibye-conditioning',
    name: 'Conditioning Bolt',
    speed: 48, // Fast enchanted projectile (m/s)
    radius: 0.60, // Hit detection radius
    directDamage: 18,
    vulnerability: Object.freeze({
      durationSec: 4.0, // Vulnerability window lasts 4.0s
      damageMultiplier: 1.5, // 50% bonus damage on subsequent hits
      staggerMultiplier: 1.4, // 40% bonus balance damage
    }),
  }),

  shotII: Object.freeze({
    id: 'bibye-siege',
    name: 'Main Siege Bolt',
    speed: 52, // Massive physical siege bolt (m/s)
    radius: 0.85, // Heavy projectile cross-section
    directDamage: 65, // Enormous physical finishing strike
    shove: 7.5, // Heavy knockback
    staggerGain: 35, // Massive balance compromise
  }),
});

export const BI_BYE_STATES = Object.freeze({
  LOADED: 'LOADED',
  FIRING: 'FIRING',
  SPENT: 'SPENT',
  RELOADING: 'RELOADING',
});

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function clampAngle(angle, base, limit) {
  let diff = angle - base;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const clamped = clamp(diff, -limit, limit);
  return base + clamped;
}

/**
 * Creates a new Bi-Bye-llista state instance.
 */
export function createBiByeLlista(overrides = {}) {
  const conf = { ...BI_BYE_LLISTA_CONFIG.emplacement, ...overrides };
  return {
    id: conf.id,
    x: conf.x,
    y: conf.y,
    z: conf.z,
    baseYaw: conf.baseYaw,
    yawLimit: conf.yawLimit,
    pitchMin: conf.pitchMin,
    pitchMax: conf.pitchMax,
    interactRadius: conf.interactRadius,
    operatorOffset: conf.operatorOffset,

    // Dynamic state
    state: BI_BYE_STATES.LOADED,
    operatorId: null,
    yaw: conf.baseYaw,
    pitch: 0,
    committedAim: null, // Locked { yaw, pitch } once firing begins

    // Timers
    firedAt: -Infinity,
    shotIIPendingAt: -Infinity,
    reloadStartedAt: -Infinity,
    reloadEndsAt: -Infinity,
  };
}

/**
 * Mount / operate the ballista if player is in range.
 */
export function mountBiByeLlista(ballista, player) {
  if (!ballista || !player || !player.alive) return false;
  if (ballista.operatorId && ballista.operatorId !== player.id) return false; // Occupied

  const dist = Math.hypot(player.position.x - ballista.x, player.position.z - ballista.z);
  if (dist > ballista.interactRadius) return false;

  ballista.operatorId = player.id;
  player.operatingBallistaId = ballista.id;

  // Snap operator to station
  player.position.x = ballista.x + ballista.operatorOffset.x;
  player.position.y = ballista.y + ballista.operatorOffset.y;
  player.position.z = ballista.z + ballista.operatorOffset.z;
  player.velocity = { x: 0, y: 0, z: 0 };

  // Align ballista yaw/pitch to player or default
  ballista.yaw = clampAngle(player.yaw ?? ballista.baseYaw, ballista.baseYaw, ballista.yawLimit);
  ballista.pitch = clamp(player.pitch ?? 0, ballista.pitchMin, ballista.pitchMax);
  player.yaw = ballista.yaw;
  player.pitch = ballista.pitch;

  return true;
}

/**
 * Dismount the ballista and return control to the Spellblade.
 */
export function dismountBiByeLlista(ballista, player) {
  if (!ballista || !player) return false;
  if (ballista.operatorId === player.id) {
    ballista.operatorId = null;
  }
  if (player.operatingBallistaId === ballista.id) {
    player.operatingBallistaId = null;
  }
  return true;
}

/**
 * Trigger the two-stage firing sequence.
 * Shot I discharges immediately.
 * Shot II is scheduled at nowSec + 0.200s along the exact committed line.
 */
export function fireBiByeLlista(room, ballista, nowSec) {
  if (!ballista || ballista.state !== BI_BYE_STATES.LOADED) return false;

  // Commit aim line for both shots
  const aim = { yaw: ballista.yaw, pitch: ballista.pitch };
  ballista.committedAim = aim;
  ballista.state = BI_BYE_STATES.FIRING;
  ballista.firedAt = nowSec;
  ballista.shotIIPendingAt = nowSec + BI_BYE_LLISTA_CONFIG.timing.shotIntervalSec;

  // Spawn Shot I immediately
  spawnShotI(room, ballista, aim, nowSec);

  room.events?.push({
    type: 'bibyeFired',
    ballistaId: ballista.id,
    operatorId: ballista.operatorId,
    shot: 'I',
    aim,
    at: nowSec,
  });

  return true;
}

function aimToDirection(yaw, pitch) {
  return {
    x: -Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * Math.cos(pitch),
  };
}

let bibyeProjCounter = 0;

function spawnShotI(room, ballista, aim, nowSec) {
  const dir = aimToDirection(aim.yaw, aim.pitch);
  const cfg = BI_BYE_LLISTA_CONFIG.shotI;
  const id = `bibye-bolt-${++bibyeProjCounter}`;

  // Upper launcher muzzle offset
  const muzzlePos = {
    x: ballista.x + dir.x * 1.5,
    y: ballista.y + 1.45 + dir.y * 1.5,
    z: ballista.z + dir.z * 1.5,
  };

  const projectile = {
    id,
    kind: 'bibye',
    subKind: 'conditioning',
    ballistaId: ballista.id,
    ownerId: ballista.operatorId ?? 'ballista',
    position: muzzlePos,
    velocity: { x: dir.x * cfg.speed, y: dir.y * cfg.speed, z: dir.z * cfg.speed },
    bornAt: nowSec,
    radius: cfg.radius,
    damage: cfg.directDamage,
  };

  if (!room.bibyeProjectiles) room.bibyeProjectiles = new Map();
  room.bibyeProjectiles.set(id, projectile);

  room.events?.push({
    type: 'bibyeBoltSpawned',
    projectile: structuredClone(projectile),
    at: nowSec,
  });
}

function spawnShotII(room, ballista, aim, nowSec) {
  const dir = aimToDirection(aim.yaw, aim.pitch);
  const cfg = BI_BYE_LLISTA_CONFIG.shotII;
  const id = `bibye-bolt-${++bibyeProjCounter}`;

  // Lower main launcher muzzle offset
  const muzzlePos = {
    x: ballista.x + dir.x * 1.8,
    y: ballista.y + 0.95 + dir.y * 1.8,
    z: ballista.z + dir.z * 1.8,
  };

  const projectile = {
    id,
    kind: 'bibye',
    subKind: 'siege',
    ballistaId: ballista.id,
    ownerId: ballista.operatorId ?? 'ballista',
    position: muzzlePos,
    velocity: { x: dir.x * cfg.speed, y: dir.y * cfg.speed, z: dir.z * cfg.speed },
    bornAt: nowSec,
    radius: cfg.radius,
    damage: cfg.directDamage,
    shove: cfg.shove,
    staggerGain: cfg.staggerGain,
  };

  if (!room.bibyeProjectiles) room.bibyeProjectiles = new Map();
  room.bibyeProjectiles.set(id, projectile);

  room.events?.push({
    type: 'bibyeBoltSpawned',
    projectile: structuredClone(projectile),
    at: nowSec,
  });
}

/**
 * Steps the Bi-Bye-llista state machine and reload cycle.
 */
export function stepBiByeLlista(room, ballista, dt, nowSec) {
  if (!ballista) return;

  // Sync operator aim if mounted
  if (ballista.operatorId) {
    const operator = room.players.get(ballista.operatorId);
    if (!operator || !operator.alive) {
      dismountBiByeLlista(ballista, operator);
    } else {
      // Keep operator clamped to station
      operator.position.x = ballista.x + ballista.operatorOffset.x;
      operator.position.y = ballista.y + ballista.operatorOffset.y;
      operator.position.z = ballista.z + ballista.operatorOffset.z;
      operator.velocity = { x: 0, y: 0, z: 0 };

      // Update aim if not firing
      if (ballista.state !== BI_BYE_STATES.FIRING) {
        ballista.yaw = clampAngle(operator.yaw ?? ballista.baseYaw, ballista.baseYaw, ballista.yawLimit);
        ballista.pitch = clamp(operator.pitch ?? 0, ballista.pitchMin, ballista.pitchMax);
        operator.yaw = ballista.yaw;
        operator.pitch = ballista.pitch;
      }
    }
  }

  // Firing sequence state machine
  if (ballista.state === BI_BYE_STATES.FIRING) {
    if (nowSec >= ballista.shotIIPendingAt) {
      // Discharge Shot II along committed aim
      spawnShotII(room, ballista, ballista.committedAim, nowSec);
      ballista.shotIIPendingAt = -Infinity;

      room.events?.push({
        type: 'bibyeFired',
        ballistaId: ballista.id,
        operatorId: ballista.operatorId,
        shot: 'II',
        aim: ballista.committedAim,
        at: nowSec,
      });

      // Enter SPENT state
      ballista.state = BI_BYE_STATES.SPENT;
      ballista.reloadStartedAt = nowSec + BI_BYE_LLISTA_CONFIG.timing.spentRecoverySec;
      ballista.reloadEndsAt = ballista.reloadStartedAt + BI_BYE_LLISTA_CONFIG.timing.reloadDurationSec;
    }
  } else if (ballista.state === BI_BYE_STATES.SPENT) {
    if (nowSec >= ballista.reloadStartedAt) {
      ballista.state = BI_BYE_STATES.RELOADING;
      room.events?.push({
        type: 'bibyeReloadStarted',
        ballistaId: ballista.id,
        durationSec: BI_BYE_LLISTA_CONFIG.timing.reloadDurationSec,
        at: nowSec,
      });
    }
  } else if (ballista.state === BI_BYE_STATES.RELOADING) {
    if (nowSec >= ballista.reloadEndsAt) {
      ballista.state = BI_BYE_STATES.LOADED;
      ballista.committedAim = null;
      room.events?.push({
        type: 'bibyeReloadCompleted',
        ballistaId: ballista.id,
        at: nowSec,
      });
    }
  }
}

/**
 * Authoritative projectile simulation for Bi-Bye-llista bolts.
 * Detects world solids, ground terrain, and target players/dummies.
 */
export function stepBiByeProjectiles(room, dt, nowSec, world) {
  if (!room.bibyeProjectiles || room.bibyeProjectiles.size === 0) return;

  for (const projectile of [...room.bibyeProjectiles.values()]) {
    const before = { ...projectile.position };
    const after = {
      x: before.x + projectile.velocity.x * dt,
      y: before.y + projectile.velocity.y * dt,
      z: before.z + projectile.velocity.z * dt,
    };

    // 1. World solids intersection
    let nearestSolid = null;
    for (const box of world.solids ?? []) {
      const hit = segmentAabbHit([before.x, before.y, before.z], [after.x, after.y, after.z], box);
      if (hit && (!nearestSolid || hit.t < nearestSolid.t)) nearestSolid = hit;
    }

    if (nearestSolid) {
      room.bibyeProjectiles.delete(projectile.id);
      room.events?.push({
        type: 'bibyeBoltImpact',
        projectileId: projectile.id,
        subKind: projectile.subKind,
        point: { x: nearestSolid.point[0], y: nearestSolid.point[1], z: nearestSolid.point[2] },
        hitKind: 'solid',
        solidId: nearestSolid.box?.id ?? null,
        at: nowSec,
      });
      continue;
    }

    // 2. Ground terrain collision
    const ground = surfaceHeightAt(after.x, after.z, before.y, world);
    if (ground !== null && after.y <= ground && before.y > ground) {
      const t = (before.y - ground) / (before.y - after.y);
      const hitPoint = {
        x: before.x + (after.x - before.x) * t,
        y: ground + 0.05,
        z: before.z + (after.z - before.z) * t,
      };
      room.bibyeProjectiles.delete(projectile.id);
      room.events?.push({
        type: 'bibyeBoltImpact',
        projectileId: projectile.id,
        subKind: projectile.subKind,
        point: hitPoint,
        hitKind: 'ground',
        at: nowSec,
      });
      continue;
    }

    // 3. Player / Dummy hit detection
    let directHit = null;
    for (const player of room.players.values()) {
      if (!player.alive || player.id === projectile.ownerId) continue;
      const targetCenter = {
        x: player.position.x,
        y: player.position.y + 0.9,
        z: player.position.z,
      };
      const dist = Math.hypot(
        targetCenter.x - after.x,
        targetCenter.y - after.y,
        targetCenter.z - after.z
      );
      if (dist <= projectile.radius) {
        directHit = player;
        break;
      }
    }

    if (directHit) {
      room.bibyeProjectiles.delete(projectile.id);
      applyBiByeDamage(room, projectile, directHit, after, nowSec);
      continue;
    }

    // Move projectile forward
    projectile.position = after;

    // Lifespan expiry (4.0s)
    if (nowSec - projectile.bornAt > 4.0) {
      room.bibyeProjectiles.delete(projectile.id);
    }
  }
}

/**
 * Applies authoritative damage and status consequences upon bolt impact.
 */
function applyBiByeDamage(room, projectile, victim, point, nowSec) {
  let damage = projectile.damage;
  const isConditioning = projectile.subKind === 'conditioning';
  const isSiege = projectile.subKind === 'siege';

  // Check if victim is currently vulnerable from Shot I
  const isVulnerable = Boolean(victim.bibyeVulnerable && nowSec < victim.bibyeVulnerable.until);
  let exploited = false;

  if (isSiege && isVulnerable) {
    const mult = victim.bibyeVulnerable.multiplier ?? BI_BYE_LLISTA_CONFIG.shotI.vulnerability.damageMultiplier;
    damage = Math.round(damage * mult);
    exploited = true;
  }

  // Apply vulnerability condition if Shot I lands
  if (isConditioning) {
    const vulnCfg = BI_BYE_LLISTA_CONFIG.shotI.vulnerability;
    victim.bibyeVulnerable = {
      attackerId: projectile.ownerId,
      until: nowSec + vulnCfg.durationSec,
      multiplier: vulnCfg.damageMultiplier,
    };
  }

  let knockback = null;
  if (isSiege && projectile.shove) {
    const len = Math.hypot(projectile.velocity.x, projectile.velocity.z) || 1;
    knockback = {
      x: (projectile.velocity.x / len) * projectile.shove,
      y: 0.5,
      z: (projectile.velocity.z / len) * projectile.shove,
    };
  }

  // Authoritative damage through combat system
  applyDamage(
    room,
    projectile.ownerId,
    victim.id,
    damage,
    isConditioning ? 'bibye-conditioning' : 'bibye-siege',
    nowSec,
    knockback
  );

  room.events?.push({
    type: 'bibyeBoltImpact',
    projectileId: projectile.id,
    subKind: projectile.subKind,
    victimId: victim.id,
    damage,
    point,
    hitKind: 'player',
    exploitedVulnerability: exploited,
    inflictedVulnerability: isConditioning,
    at: nowSec,
  });
}
