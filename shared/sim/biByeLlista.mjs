import { segmentAabbHit, surfaceHeightAt, resolvePlayerWorld } from '../src/collision.mjs';
import { applyDamage, staggerBy } from './combat.mjs';
import { strongerChill } from '../src/spells.mjs';
import { GAME } from '../src/combat.mjs';

/**
 * Bi-Bye-llista (Two-Bolt Ballista) Configuration & Tuning.
 * Authoritative mobile siege engine parameters.
 */
export const BI_BYE_LLISTA_CONFIG = Object.freeze({
  emplacement: Object.freeze({
    id: 'bibye-practice-01',
    x: 5.5,
    y: 0,
    z: -14.6,
    baseYaw: -Math.PI / 2, // Facing East (+X) across the Tourney Field
    interactRadius: 2.8,
    operatorOffset: Object.freeze({ x: -1.2, y: 0, z: 0 }),
  }),

  durability: Object.freeze({
    maxHealth: 400,
    radius: 1.6,
    bounds: Object.freeze({ width: 2.2, height: 1.6, depth: 3.2 }),
  }),

  modes: Object.freeze({
    MOBILE: 'MOBILE',
    DEPLOYING: 'DEPLOYING',
    DEPLOYED: 'DEPLOYED',
    RETRACTING: 'RETRACTING',
    DESTROYED: 'DESTROYED',
  }),

  timing: Object.freeze({
    deployDurationSec: 1.200,     // Time to plant outriggers into ground
    retractDurationSec: 1.200,    // Time to stow outriggers
    smallBoltFireDelaySec: 0.450, // Matches Argon 02_BiBye_TwoStage_Fire string release
    mainBoltFireDelaySec: 0.650,  // Matches Argon 02_BiBye_TwoStage_Fire string release (0.200s after small bolt)
    mobileRecockSec: 3.000,       // Independent reload for Shot I while in mobile mode
    spentRecoverySec: 0.250,      // Spent recovery before mechanical reload
    reloadDurationSec: 6.000,     // 6.0s mechanical reload (Argon 04_BiBye_Mechanical_Reload)
  }),

  mobility: Object.freeze({
    forwardSpeed: 3.2,            // m/s forward travel
    reverseSpeed: 2.0,            // m/s reverse travel
    steerSpeed: 1.6,              // rad/s steering speed
    traverseMobileMax: Math.PI / 5, // +/- 36 deg horizontal traverse while mobile
    pitchMobileMin: -0.15,
    pitchMobileMax: 0.35,
  }),

  traverse: Object.freeze({
    yawLimit: Math.PI / 4,        // +/- 45 deg deployed horizontal traverse
    pitchMin: -0.15,              // ~-8.6 deg depression
    pitchMax: 0.35,               // ~+20.0 deg elevation
  }),

  shotI: Object.freeze({
    id: 'bibye-conditioning',
    name: 'Frost Conditioning Bolt',
    speed: 48,                    // m/s
    radius: 0.60,
    blastRadius: 2.0,             // 2.0m frost blast
    directDamage: 18,             // 18 direct health damage
    edgeDamage: 12,               // 12 edge health damage
    maxStaminaDrain: 22,          // 22 stamina drain at blast center (solid sword strike equivalent)
    chill: Object.freeze({
      slow: 0.40,                 // Gentler initial slow (regular frostfire is 0.55)
      edgeSlow: 0.20,
      durationSec: 5.0,           // Longer thaw duration (regular frostfire is 3.0s)
      edgeDurationSec: 2.0,
    }),
  }),

  shotII: Object.freeze({
    id: 'bibye-siege',
    name: 'Main Siege Bolt',
    speed: 55,                    // m/s massive physical projectile
    radius: 0.85,                 // Heavy cross section
    directDamage: 85,             // Enormous direct penetrating damage (18 + 85 = 103 defeats 100 HP Spellblade)
    pierceMaxTargets: 2,          // Can pierce up to 2 targets
    pierceDamageFalloff: 0.70,    // 85 -> ~60 for second target
    shove: 8.5,                   // Violent physical knockback
    staggerGain: 45,              // Heavy balance compromise
    shockwave: Object.freeze({
      radius: 3.5,                // 3.5m radial shockwave
      centerDamage: 35,
      edgeDamage: 10,
      centerPush: 7.0,
      edgePush: 2.0,
    }),
  }),
});

export const BI_BYE_MODES = BI_BYE_LLISTA_CONFIG.modes;

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
    heading: conf.baseYaw,          // Carriage chassis orientation
    baseYaw: conf.baseYaw,
    yaw: conf.baseYaw,              // Launcher aim yaw
    pitch: 0,                       // Launcher aim pitch
    speed: 0,
    steer: 0,
    operatorId: null,

    // Operational mode
    mode: BI_BYE_MODES.MOBILE,
    modeTransitionStartedAt: -Infinity,
    modeTransitionEndsAt: -Infinity,

    // Durability
    health: BI_BYE_LLISTA_CONFIG.durability.maxHealth,
    maxHealth: BI_BYE_LLISTA_CONFIG.durability.maxHealth,

    // Weapon state
    state: BI_BYE_STATES.LOADED,
    smallBoltReadyAt: 0,            // Shot I mobile recock timer
    mainBoltLoaded: true,           // Shot II status
    committedAim: null,             // Locked aim during firing

    // Volley timers
    firedAt: -Infinity,
    shotIPendingAt: -Infinity,
    shotIIPendingAt: -Infinity,
    reloadStartedAt: -Infinity,
    reloadEndsAt: -Infinity,

    interactRadius: conf.interactRadius,
    operatorOffset: conf.operatorOffset,
  };
}

/**
 * Mount / operate the ballista if player is in range and ballista is not destroyed.
 */
export function mountBiByeLlista(ballista, player, nowSec = 0) {
  if (!ballista || !player || !player.alive) return false;
  if (ballista.mode === BI_BYE_MODES.DESTROYED) return false;
  if (ballista.operatorId && ballista.operatorId !== player.id) return false;

  const dist = Math.hypot(player.position.x - ballista.x, player.position.z - ballista.z);
  if (dist > ballista.interactRadius) return false;

  ballista.operatorId = player.id;
  player.operatingBallistaId = ballista.id;

  // Align player to operator station
  syncOperatorPosition(ballista, player);
  player.velocity = { x: 0, y: 0, z: 0 };

  return true;
}

/**
 * Dismount the ballista and return control to the Spellblade.
 */
export function dismountBiByeLlista(ballista, player, safeDisplace = false) {
  if (!ballista || !player) return false;
  if (ballista.operatorId === player.id) {
    ballista.operatorId = null;
  }
  if (player.operatingBallistaId === ballista.id) {
    player.operatingBallistaId = null;
  }
  if (safeDisplace) {
    // Offset player safely to the left of the carriage
    const nx = Math.cos(ballista.heading);
    const nz = -Math.sin(ballista.heading);
    player.position.x = ballista.x + nx * 2.2;
    player.position.z = ballista.z + nz * 2.2;
    player.velocity = { x: 0, y: 0, z: 0 };
  }
  return true;
}

function syncOperatorPosition(ballista, player) {
  // Rotate operator offset according to carriage heading
  const cos = Math.cos(ballista.heading - ballista.baseYaw);
  const sin = Math.sin(ballista.heading - ballista.baseYaw);
  const ox = ballista.operatorOffset.x * cos - ballista.operatorOffset.z * sin;
  const oz = ballista.operatorOffset.x * sin + ballista.operatorOffset.z * cos;

  player.position.x = ballista.x + ox;
  player.position.y = ballista.y + ballista.operatorOffset.y;
  player.position.z = ballista.z + oz;
  player.velocity = { x: 0, y: 0, z: 0 };
  player.yaw = ballista.yaw;
  player.pitch = ballista.pitch;
}

/**
 * Toggle operational mode between MOBILE and DEPLOYED.
 */
export function toggleBiByeDeploy(ballista, nowSec) {
  if (!ballista || ballista.mode === BI_BYE_MODES.DESTROYED) return false;

  if (ballista.mode === BI_BYE_MODES.MOBILE) {
    ballista.mode = BI_BYE_MODES.DEPLOYING;
    ballista.modeTransitionStartedAt = nowSec;
    ballista.modeTransitionEndsAt = nowSec + BI_BYE_LLISTA_CONFIG.timing.deployDurationSec;
    ballista.speed = 0;
    return true;
  }

  if (ballista.mode === BI_BYE_MODES.DEPLOYED) {
    // If currently firing or reloading, retraction is delayed until ready or interrupts cleanly
    if (ballista.state === BI_BYE_STATES.FIRING) return false;
    ballista.mode = BI_BYE_MODES.RETRACTING;
    ballista.modeTransitionStartedAt = nowSec;
    ballista.modeTransitionEndsAt = nowSec + BI_BYE_LLISTA_CONFIG.timing.retractDurationSec;
    return true;
  }

  return false;
}

/**
 * Damage the siege machine. Destroys it at 0 HP.
 */
export function damageBiByeLlista(room, ballista, amount, attackerId, source, nowSec) {
  if (!ballista || ballista.mode === BI_BYE_MODES.DESTROYED || !(amount > 0)) return false;

  ballista.health = Math.max(0, ballista.health - amount);
  room.events?.push({
    type: 'bibyeDamaged',
    ballistaId: ballista.id,
    amount,
    health: ballista.health,
    attackerId,
    source,
    at: nowSec,
  });

  if (ballista.health <= 0) {
    ballista.mode = BI_BYE_MODES.DESTROYED;
    ballista.state = BI_BYE_STATES.SPENT;
    if (ballista.operatorId) {
      const op = room.players?.get(ballista.operatorId);
      dismountBiByeLlista(ballista, op, true);
    }
    room.events?.push({
      type: 'bibyeDestroyed',
      ballistaId: ballista.id,
      killerId: attackerId,
      at: nowSec,
    });
  }

  return true;
}

/**
 * Trigger mobile Shot I (Conditioning Bolt) while moving.
 */
export function fireBiByeMobile(room, ballista, nowSec) {
  if (!ballista || ballista.mode !== BI_BYE_MODES.MOBILE || ballista.mode === BI_BYE_MODES.DESTROYED) return false;
  if (nowSec < ballista.smallBoltReadyAt) return false;

  const aim = { yaw: ballista.yaw, pitch: ballista.pitch };
  spawnShotI(room, ballista, aim, nowSec);
  ballista.smallBoltReadyAt = nowSec + BI_BYE_LLISTA_CONFIG.timing.mobileRecockSec;

  room.events?.push({
    type: 'bibyeFired',
    ballistaId: ballista.id,
    operatorId: ballista.operatorId,
    shot: 'I_MOBILE',
    aim,
    at: nowSec,
  });

  return true;
}

/**
 * Trigger full two-stage volley in DEPLOYED mode.
 * Shot I discharges at nowSec + 0.450s (small bolt string release).
 * Shot II discharges at nowSec + 0.650s (main bolt string release, 0.200s gap).
 */
export function fireBiByeFullVolley(room, ballista, nowSec) {
  if (!ballista || ballista.mode !== BI_BYE_MODES.DEPLOYED || ballista.state !== BI_BYE_STATES.LOADED) return false;
  if (!ballista.mainBoltLoaded || nowSec < ballista.smallBoltReadyAt) return false;

  const aim = { yaw: ballista.yaw, pitch: ballista.pitch };
  ballista.committedAim = aim;
  ballista.state = BI_BYE_STATES.FIRING;
  ballista.firedAt = nowSec;
  ballista.shotIPendingAt = nowSec + BI_BYE_LLISTA_CONFIG.timing.smallBoltFireDelaySec;
  ballista.shotIIPendingAt = nowSec + BI_BYE_LLISTA_CONFIG.timing.mainBoltFireDelaySec;

  room.events?.push({
    type: 'bibyeVolleyInitiated',
    ballistaId: ballista.id,
    operatorId: ballista.operatorId,
    aim,
    at: nowSec,
  });

  return true;
}

/**
 * Primary attack dispatch: mobile Shot I or full deployed volley.
 */
export function fireBiByeLlista(room, ballista, nowSec) {
  if (!ballista || ballista.mode === BI_BYE_MODES.DESTROYED) return false;
  if (ballista.mode === BI_BYE_MODES.MOBILE) {
    return fireBiByeMobile(room, ballista, nowSec);
  }
  if (ballista.mode === BI_BYE_MODES.DEPLOYED) {
    return fireBiByeFullVolley(room, ballista, nowSec);
  }
  return false;
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
    blastRadius: cfg.blastRadius,
    directDamage: cfg.directDamage,
    edgeDamage: cfg.edgeDamage,
    maxStaminaDrain: cfg.maxStaminaDrain,
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
    directDamage: cfg.directDamage,
    pierceMaxTargets: cfg.pierceMaxTargets,
    pierceCount: 0,
    piercedVictimIds: [],
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
 * Step ballista locomotion, transitions, and firing cycle.
 */
export function stepBiByeLlista(room, ballista, dt, nowSec, world = room.world) {
  if (!ballista) return;

  // Handle destroyed state
  if (ballista.mode === BI_BYE_MODES.DESTROYED) {
    if (ballista.operatorId) {
      const op = room.players?.get(ballista.operatorId);
      dismountBiByeLlista(ballista, op, true);
    }
    return;
  }

  // Handle mode transitions
  if (ballista.mode === BI_BYE_MODES.DEPLOYING) {
    if (nowSec >= ballista.modeTransitionEndsAt) {
      ballista.mode = BI_BYE_MODES.DEPLOYED;
      room.events?.push({ type: 'bibyeModeChanged', ballistaId: ballista.id, mode: BI_BYE_MODES.DEPLOYED, at: nowSec });
    }
  } else if (ballista.mode === BI_BYE_MODES.RETRACTING) {
    if (nowSec >= ballista.modeTransitionEndsAt) {
      ballista.mode = BI_BYE_MODES.MOBILE;
      room.events?.push({ type: 'bibyeModeChanged', ballistaId: ballista.id, mode: BI_BYE_MODES.MOBILE, at: nowSec });
    }
  }

  // Handle operator controls & vehicle movement
  if (ballista.operatorId) {
    const operator = room.players?.get(ballista.operatorId);
    if (!operator || !operator.alive) {
      dismountBiByeLlista(ballista, operator);
    } else {
      const input = operator.input ?? {};

      if (ballista.mode === BI_BYE_MODES.MOBILE) {
        // Steering
        let steer = 0;
        if (input.left) steer += 1;
        if (input.right) steer -= 1;
        ballista.heading += steer * BI_BYE_LLISTA_CONFIG.mobility.steerSpeed * dt;

        // Driving forward / back
        let drive = 0;
        if (input.forward) drive += 1;
        if (input.backward || input.back) drive -= 1;
        const speed = drive > 0
          ? BI_BYE_LLISTA_CONFIG.mobility.forwardSpeed
          : (drive < 0 ? -BI_BYE_LLISTA_CONFIG.mobility.reverseSpeed : 0);
        ballista.speed = speed;

        if (speed !== 0) {
          const moveDist = speed * dt;
          const targetX = ballista.x - Math.sin(ballista.heading) * moveDist;
          const targetZ = ballista.z - Math.cos(ballista.heading) * moveDist;

          // Check world collision for vehicle chassis using swept/sliding resolution
          const solids = (world?.solids ?? []).filter(
            (s) => s.id !== 'bibye-practice-chassis' && s.id !== 'bibye-chassis-solid'
          );
          const resolved = resolvePlayerWorld({ x: targetX, y: ballista.y, z: targetZ }, 0.8, solids, 1.4);
          ballista.x = resolved.x;
          ballista.z = resolved.z;
          const ground = surfaceHeightAt(resolved.x, resolved.z, ballista.y + 1.0, world);
          if (ground !== null) ballista.y = ground;
        }

        // Aim upper launcher with traverse limits relative to carriage heading
        const cfgMob = BI_BYE_LLISTA_CONFIG.mobility;
        ballista.yaw = clampAngle(input.yaw ?? ballista.heading, ballista.heading, cfgMob.traverseMobileMax);
        ballista.pitch = clamp(input.pitch ?? 0, cfgMob.pitchMobileMin, cfgMob.pitchMobileMax);
      } else if (ballista.mode === BI_BYE_MODES.DEPLOYED) {
        // Stationary: swivel turret within deployed traverse limits
        if (ballista.state !== BI_BYE_STATES.FIRING) {
          const cfgTrav = BI_BYE_LLISTA_CONFIG.traverse;
          ballista.yaw = clampAngle(input.yaw ?? ballista.heading, ballista.heading, cfgTrav.yawLimit);
          ballista.pitch = clamp(input.pitch ?? 0, cfgTrav.pitchMin, cfgTrav.pitchMax);
        }
      }

      // Sync operator position to carriage station
      syncOperatorPosition(ballista, operator);
    }
  }

  // Firing state machine (DEPLOYED mode)
  if (ballista.state === BI_BYE_STATES.FIRING) {
    if (nowSec >= ballista.shotIPendingAt) {
      spawnShotI(room, ballista, ballista.committedAim, nowSec);
      ballista.shotIPendingAt = Infinity;
      room.events?.push({
        type: 'bibyeFired',
        ballistaId: ballista.id,
        operatorId: ballista.operatorId,
        shot: 'I',
        aim: ballista.committedAim,
        at: nowSec,
      });
    }

    if (nowSec >= ballista.shotIIPendingAt) {
      spawnShotII(room, ballista, ballista.committedAim, nowSec);
      ballista.shotIIPendingAt = Infinity;
      ballista.mainBoltLoaded = false;
      ballista.state = BI_BYE_STATES.SPENT;
      ballista.reloadStartedAt = nowSec + BI_BYE_LLISTA_CONFIG.timing.spentRecoverySec;
      ballista.reloadEndsAt = ballista.reloadStartedAt + BI_BYE_LLISTA_CONFIG.timing.reloadDurationSec;

      room.events?.push({
        type: 'bibyeFired',
        ballistaId: ballista.id,
        operatorId: ballista.operatorId,
        shot: 'II',
        aim: ballista.committedAim,
        at: nowSec,
      });
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
      ballista.mainBoltLoaded = true;
      ballista.smallBoltReadyAt = nowSec;
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
 * Continuous swept projectile simulation.
 * Handles Frost blast (Shot I) and Physical Siege Bolt with penetration & shockwave (Shot II).
 */
export function stepBiByeProjectiles(room, dt, nowSec, world = room.world) {
  if (!room.bibyeProjectiles || room.bibyeProjectiles.size === 0) return;

  for (const projectile of [...room.bibyeProjectiles.values()]) {
    const before = { ...projectile.position };
    const after = {
      x: before.x + projectile.velocity.x * dt,
      y: before.y + projectile.velocity.y * dt,
      z: before.z + projectile.velocity.z * dt,
    };

    // 1. World solids continuous swept ray test
    let nearestSolid = null;
    for (const box of world?.solids ?? []) {
      if (box.id === 'bibye-practice-chassis' || box.id === 'bibye-chassis-solid') continue;
      const hit = segmentAabbHit([before.x, before.y, before.z], [after.x, after.y, after.z], box);
      if (hit && (!nearestSolid || hit.t < nearestSolid.t)) {
        nearestSolid = { ...hit, box };
      }
    }

    // 2. Ground terrain collision
    const ground = surfaceHeightAt(after.x, after.z, before.y, world);
    const groundHit = ground !== null && after.y <= ground && before.y > ground;

    // Handle Shot I: Enchanted Frost Conditioning Bolt
    if (projectile.subKind === 'conditioning') {
      let impactPoint = null;
      let hitPlayer = null;

      if (nearestSolid) {
        impactPoint = { x: nearestSolid.point[0], y: nearestSolid.point[1], z: nearestSolid.point[2] };
      } else if (groundHit) {
        const t = (before.y - ground) / (before.y - after.y || 1);
        impactPoint = {
          x: before.x + (after.x - before.x) * t,
          y: ground + 0.05,
          z: before.z + (after.z - before.z) * t,
        };
      } else {
        // Check player direct hit
        for (const player of room.players.values()) {
          if (!player.alive || player.id === projectile.ownerId) continue;
          const targetCenter = { x: player.position.x, y: player.position.y + 0.9, z: player.position.z };
          const dist = Math.hypot(targetCenter.x - after.x, targetCenter.y - after.y, targetCenter.z - after.z);
          if (dist <= projectile.radius) {
            impactPoint = { ...after };
            hitPlayer = player;
            break;
          }
        }
      }

      if (impactPoint) {
        room.bibyeProjectiles.delete(projectile.id);
        room.events?.push({
          type: 'bibyeBoltImpact',
          projectileId: projectile.id,
          subKind: 'conditioning',
          point: impactPoint,
          hitKind: hitPlayer ? 'player' : (nearestSolid ? 'solid' : 'ground'),
          solidId: nearestSolid?.box?.id ?? null,
          victimId: hitPlayer?.id ?? null,
          at: nowSec,
        });
        detonateFrostBlast(room, projectile, impactPoint, nowSec, hitPlayer?.id, world);
        continue;
      }
    }

    // Handle Shot II: Physical Siege Bolt
    if (projectile.subKind === 'siege') {
      let solidHit = nearestSolid;
      let impactPoint = null;

      if (groundHit && (!solidHit || (before.y - ground) / (before.y - after.y || 1) < solidHit.t)) {
        const t = (before.y - ground) / (before.y - after.y || 1);
        impactPoint = {
          x: before.x + (after.x - before.x) * t,
          y: ground + 0.05,
          z: before.z + (after.z - before.z) * t,
        };
      } else if (solidHit) {
        impactPoint = { x: solidHit.point[0], y: solidHit.point[1], z: solidHit.point[2] };
      }

      // Check swept hit against players/dummies
      let sweptVictim = null;
      for (const player of room.players.values()) {
        if (!player.alive || player.id === projectile.ownerId) continue;
        if (projectile.piercedVictimIds.includes(player.id)) continue;

        const targetCenter = { x: player.position.x, y: player.position.y + 0.9, z: player.position.z };
        const dist = Math.hypot(targetCenter.x - after.x, targetCenter.y - after.y, targetCenter.z - after.z);
        if (dist <= projectile.radius) {
          sweptVictim = player;
          break;
        }
      }

      // If swept victim hit occurred before solid hit
      if (sweptVictim) {
        projectile.piercedVictimIds.push(sweptVictim.id);
        projectile.pierceCount += 1;

        // Apply direct penetrating damage
        const damage = projectile.pierceCount === 1
          ? projectile.directDamage
          : Math.round(projectile.directDamage * BI_BYE_LLISTA_CONFIG.shotII.pierceDamageFalloff);

        const len = Math.hypot(projectile.velocity.x, projectile.velocity.z) || 1;
        const push = {
          x: (projectile.velocity.x / len) * projectile.shove,
          y: 0.6,
          z: (projectile.velocity.z / len) * projectile.shove,
        };

        applyDamage(room, projectile.ownerId, sweptVictim.id, damage, 'bibye-siege', nowSec, push, {
          minDamage: 55,
        });

        // Apply heavy stagger
        staggerBy(room, sweptVictim, projectile.staggerGain, nowSec, projectile.ownerId);

        room.events?.push({
          type: 'bibyeBoltImpact',
          projectileId: projectile.id,
          subKind: 'siege',
          victimId: sweptVictim.id,
          damage,
          point: { ...after },
          hitKind: 'player',
          at: nowSec,
        });

        // Detonate impact shockwave on first hit (limited to one full shockwave per bolt)
        if (!projectile.shockwaveSpawned) {
          projectile.shockwaveSpawned = true;
          detonateSiegeShockwave(room, projectile, after, projectile.piercedVictimIds, nowSec, world);
        }

        // Pierce limit reached: destroy projectile
        if (projectile.pierceCount >= projectile.pierceMaxTargets) {
          room.bibyeProjectiles.delete(projectile.id);
          continue;
        }
      }

      // Solid stone/ground stop
      if (impactPoint) {
        room.bibyeProjectiles.delete(projectile.id);
        room.events?.push({
          type: 'bibyeBoltImpact',
          projectileId: projectile.id,
          subKind: 'siege',
          point: impactPoint,
          hitKind: solidHit ? 'solid' : 'ground',
          solidId: solidHit?.box?.id ?? null,
          at: nowSec,
        });
        if (!projectile.shockwaveSpawned) {
          projectile.shockwaveSpawned = true;
          detonateSiegeShockwave(room, projectile, impactPoint, projectile.piercedVictimIds, nowSec, world);
        }
        continue;
      }
    }

    // Step position forward
    projectile.position = after;

    // Lifespan expiry (4.0s)
    if (nowSec - projectile.bornAt > 4.0) {
      room.bibyeProjectiles.delete(projectile.id);
    }
  }
}

/**
 * Detonates the Frost Conditioning blast.
 * Drains Guard/Sprint stamina, applies fading chill, deals moderate radial damage.
 */
function detonateFrostBlast(room, projectile, point, nowSec, directVictimId = null, world = null) {
  const cfg = BI_BYE_LLISTA_CONFIG.shotI;
  const radius = cfg.blastRadius;

  room.events?.push({
    type: 'bibyeFrostBlast',
    projectileId: projectile.id,
    point,
    radius,
    directVictimId,
    at: nowSec,
  });

  for (const victim of room.players.values()) {
    if (!victim.alive) continue;

    const isDirect = directVictimId && victim.id === directVictimId;
    const targetCenter = { x: victim.position.x, y: victim.position.y + 0.9, z: victim.position.z };
    const dist = Math.hypot(targetCenter.x - point.x, targetCenter.y - point.y, targetCenter.z - point.z);
    if (!isDirect && dist > radius) continue;

    // Check solid line of sight occlusion for non-direct victims
    if (!isDirect && world?.solids) {
      let occluded = false;
      for (const solid of world.solids) {
        if (solid.id === 'bibye-practice-chassis' || solid.id === 'bibye-chassis-solid') continue;
        if (segmentAabbHit([point.x, point.y, point.z], [targetCenter.x, targetCenter.y, targetCenter.z], solid)) {
          occluded = true;
          break;
        }
      }
      if (occluded) continue;
    }

    const exposure = isDirect ? 1.0 : Math.max(0, 1 - dist / radius);

    // 1. Health damage (12 edge to 18 center)
    const rawDamage = isDirect
      ? cfg.directDamage
      : Math.round(cfg.edgeDamage + (cfg.directDamage - cfg.edgeDamage) * exposure);
    applyDamage(room, projectile.ownerId, victim.id, rawDamage, 'bibye-conditioning', nowSec, null, {
      minDamage: cfg.edgeDamage,
    });

    // 2. Stamina drain (once per blast contact, without double-charging raised Guard)
    const staminaDrain = Math.round(cfg.maxStaminaDrain * exposure);
    if (staminaDrain > 0) {
      if (victim.guarding) {
        victim.guardStamina = Math.max(0, victim.guardStamina - staminaDrain);
        victim.lastGuardDrainAt = nowSec;
        if (victim.guardStamina <= 0) {
          victim.guarding = false;
          room.events?.push({ type: 'guardBreak', attackerId: projectile.ownerId, defenderId: victim.id, at: nowSec });
        }
      } else {
        victim.sprintStamina = Math.max(0, (victim.sprintStamina ?? 100) - staminaDrain);
      }
    }

    // 3. Fading chill
    const chillCfg = cfg.chill;
    const slow = isDirect ? chillCfg.slow : chillCfg.edgeSlow + (chillCfg.slow - chillCfg.edgeSlow) * exposure;
    const duration = isDirect ? chillCfg.durationSec : chillCfg.edgeDurationSec + (chillCfg.durationSec - chillCfg.edgeDurationSec) * exposure;
    victim.chill = strongerChill(victim.chill, {
      slow,
      startedAt: nowSec,
      until: nowSec + duration,
    }, nowSec);

    room.events?.push({
      type: 'chilled',
      playerId: victim.id,
      by: projectile.ownerId,
      spell: 'bibye-conditioning',
      slow,
      until: nowSec + duration,
      at: nowSec,
    });
  }
}

/**
 * Detonates the Main Siege Bolt shockwave.
 * Proximity-based damage and knockback, strictly excluding directly pierced victims.
 */
function detonateSiegeShockwave(room, projectile, point, excludedVictimIds, nowSec, world = null) {
  const cfg = BI_BYE_LLISTA_CONFIG.shotII.shockwave;
  const radius = cfg.radius;

  room.events?.push({
    type: 'bibyeSiegeShockwave',
    projectileId: projectile.id,
    point,
    radius,
    at: nowSec,
  });

  for (const victim of room.players.values()) {
    if (!victim.alive || excludedVictimIds.includes(victim.id)) continue;

    const targetCenter = { x: victim.position.x, y: victim.position.y + 0.9, z: victim.position.z };
    const dist = Math.hypot(targetCenter.x - point.x, targetCenter.y - point.y, targetCenter.z - point.z);
    if (dist > radius) continue;

    // Check line of sight occlusion by solid stone world geometry
    if (world?.solids) {
      let occluded = false;
      for (const solid of world.solids) {
        if (solid.id === 'bibye-practice-chassis' || solid.id === 'bibye-chassis-solid') continue;
        if (segmentAabbHit([point.x, point.y, point.z], [targetCenter.x, targetCenter.y, targetCenter.z], solid)) {
          occluded = true;
          break;
        }
      }
      if (occluded) continue;
    }

    const exposure = Math.max(0, 1 - dist / radius);
    const rawDamage = Math.round(cfg.edgeDamage + (cfg.centerDamage - cfg.edgeDamage) * exposure);
    const pushDist = cfg.edgePush + (cfg.centerPush - cfg.edgePush) * exposure;

    const dx = targetCenter.x - point.x;
    const dz = targetCenter.z - point.z;
    const len = Math.hypot(dx, dz) || 1;
    const push = {
      x: (dx / len) * pushDist,
      y: 0.5 * exposure,
      z: (dz / len) * pushDist,
    };

    applyDamage(room, projectile.ownerId, victim.id, rawDamage, 'bibye-shockwave', nowSec, push, {
      minDamage: cfg.edgeDamage,
    });
  }
}
