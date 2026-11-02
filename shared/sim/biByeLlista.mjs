import {selectedSiegeSkill} from '../src/siegeLoadout.mjs';
import {endSiegeSkill} from './siegeSkills.mjs';
import {earliestFrostProximity} from './biByeProximity.mjs';
import {SIEGE_IMPACT} from './siegeImpact.mjs';
import {mitigateSiegeSteel,endSiegeSteel} from './siegeSteel.mjs';
import {frostGuardFaces,frostParryContact} from './biByeFrostGuard.mjs';
import { structureWorld, damageStructureSolid } from './structures.mjs';
import {soFistFirstHit,soFistSolids} from './soFistGeometry.mjs';
import {damageSoFistication,blastSoFistication} from './soFistication.mjs';
import { postureOf } from '../src/body.mjs';
import { sampleTransform } from './history.mjs';
import { biByeTerrainContext, biByeTerrainPose, biByeTerrainClear, biByeDeploymentSupport } from './biByeTerrain.mjs';
import { biByeWeaponState, requestBiByeIndependent, requestBiByeVolley, stepBiByeWeapons, cancelBiByeCoupling, interruptBiByeSupport } from './biByeWeapons.mjs';
import { biByeCondition, createBiByeComponents, biByeDeployProgress, biByeAimPose, biByeFrames, biByeHitVolumes, biByeFirstHit, biByeBlastAllocations, biByeWheelTravel, biByeWheelSteering, biByeConstrainAim } from './biByeComponents.mjs';
import { boxWorld } from '../src/orientedBox.mjs';
import {fightFlightFirstHit,damageFightFlight,fightFlightHitVolumes} from './fightFlightComponents.mjs';
import { segmentAabbHit, surfaceHeightAt, resolvePlayerWorld } from '../src/collision.mjs';
import { applyDamage, staggerBy, interruptHitActions, breakGuard } from './combat.mjs';
import { strongerChill } from '../src/spells.mjs';
import { GAME } from '../src/combat.mjs';
import { areAllies } from '../src/teams.mjs';

/**
 * Bi-Bye-llista (Two-Bolt Ballista) Configuration & Tuning.
 * Authoritative mobile siege engine parameters.
 */
export const BI_BYE_LLISTA_CONFIG = Object.freeze({
  emplacement: Object.freeze({
    id: 'bibye-practice-01',
    x: 9.0,
    y: 0,
    z: -14.6,
    baseYaw: -Math.PI / 2, // Facing East (+X) across the Tourney Field
    interactRadius: 3.2,
    operatorOffset: Object.freeze({ x: 0, y: -.05, z: -1.880 }),
  }),

  stations: Object.freeze({
    operator: Object.freeze({ x: 0, y: -.05, z: -1.880 }), // Production pelvis [0,1.03,-.02] meets seat anchor.
    transportPush: Object.freeze({ x: 0, y: -.05, z: -1.880 }), // Same seated cockpit during travel.
  }),

  durability: Object.freeze({
    maxHealth: 650,
    radius: 1.6,
    bounds: Object.freeze({ width: 2.46, height: 1.66, depth: 4.022 }),
    deployedBounds: Object.freeze({ width: 3.669, height: 1.66, depth: 4.022 }),
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
    mobileSmallBoltDelaySec: 0.200, // Matches Argon 09_BiBye_Mobile_Shot1_Fire string release
    smallBoltFireDelaySec: 0.450, // Matches Argon 02_BiBye_TwoStage_Fire string release
    mainBoltFireDelaySec: 0.650,  // Matches Argon 02_BiBye_TwoStage_Fire string release (0.200s after small bolt)
    recoilRecoveryDurationSec: 2.200, // Matches Argon 02_BiBye_TwoStage_Fire recovery_complete (2.200s)
    spentRecoverySec: 1.550,      // Spent recovery before mechanical reload (2.200 - 0.650 = 1.550s)
    mobileRecockSec: 2.500,       // Recock from actual Shot I discharge in either mode
    reloadDurationSec: 4.500,     // 4.5s main reload; presentation retimes authored clip
  }),

  mobility: Object.freeze({
    forwardSpeed: 3.2,            // m/s forward travel
    reverseSpeed: 2.0,            // m/s reverse travel
    minTurningRadius: 4.25,       // Minimum Ackermann turning radius (m)
    wheelRadius: 0.550,           // 0.55m wheel radius
    trackWidth: 2.150,            // 2.15m lateral track width
    wheelbase: 2.915,             // 2.915m front-to-rear axle wheelbase
    steerSpeed: 1.6,              // rad/s steering speed
    traverseMobileMax: Math.PI / 5, // +/- 36 deg horizontal traverse while mobile
    pitchMobileMin: -0.35,
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
    guardArcDeg: 90,             // Independent of the melee Guard cone
    guardedDamageScale: 0.25,    // A central ordinary block takes 5 HP before Steel
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
    ...biByeWeaponState(conf.baseYaw),
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
    externalVelocity:{x:0,z:0},impactReaction:null,
    operatorId: null,
    team: conf.team ?? null,
    mobileFiredAt: null,
    destroyedAt: null,

    // Operational mode
    mode: BI_BYE_MODES.MOBILE,
    modeTransitionStartedAt: -Infinity,
    modeTransitionEndsAt: -Infinity,

    components: createBiByeComponents(),
    wheelRolls: [0,0,0,0,0,0],
    poseTime: 0,
    chassisPitch:0,chassisRoll:0,wheelOffsets:[0,0,0,0,0,0],stabilizerTilts:[0,0,0,0],
    terrainInitialized:false,deploymentSupported:true,deploymentReason:null,deploymentRejectedAt:null,
    retractFrom: 1,
    retractAim: null,

    // Durability
    health: BI_BYE_LLISTA_CONFIG.durability.maxHealth,
    lastHitAt: null,
    maxHealth: BI_BYE_LLISTA_CONFIG.durability.maxHealth,

    // Weapon state
    state: BI_BYE_STATES.LOADED,
    smallBoltReadyAt: 0,            // Shot I mobile recock timer
    mainBoltLoaded: true,           // Shot II status
    committedAim: null,             // Locked aim during firing
    committedMobileAim: null,
    mobileShotPendingAt: null,
    mobileOperatorId: null,
    firingOperatorId: null,

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
 * Closed-form 3D continuous swept segment vs vertical cylinder intersection.
 * Cylinder: center (cx, cz), base cy, height ch, radius cr.
 * Segment: from (x0, y0, z0) to (x1, y1, z1).
 * Returns earliest entry t in [0, 1] or null.
 */
export function sweptSegmentCylinderHit(start, end, cylinder) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;

  const ox = start.x - cylinder.x;
  const oz = start.z - cylinder.z;
  const r = cylinder.radius;

  const A = dx * dx + dz * dz;
  const B = 2 * (ox * dx + oz * dz);
  const C = ox * ox + oz * oz - r * r;

  let tEnterXz = 0;
  let tExitXz = 1;

  if (A < 1e-12) {
    if (C > 0) return null;
    tEnterXz = 0;
    tExitXz = 1;
  } else {
    const discr = B * B - 4 * A * C;
    if (discr < 0) return null;
    const sqrtD = Math.sqrt(discr);
    const t0 = (-B - sqrtD) / (2 * A);
    const t1 = (-B + sqrtD) / (2 * A);
    tEnterXz = Math.min(t0, t1);
    tExitXz = Math.max(t0, t1);
    if (tExitXz < 0 || tEnterXz > 1) return null;
  }

  const yMin = cylinder.y;
  const yMax = cylinder.y + (cylinder.height ?? 1.8);
  let tEnterY = 0;
  let tExitY = 1;

  if (Math.abs(dy) < 1e-12) {
    if (start.y < yMin || start.y > yMax) return null;
    tEnterY = 0;
    tExitY = 1;
  } else {
    const ty0 = (yMin - start.y) / dy;
    const ty1 = (yMax - start.y) / dy;
    tEnterY = Math.min(ty0, ty1);
    tExitY = Math.max(ty0, ty1);
    if (tExitY < 0 || tEnterY > 1) return null;
  }

  const tEnter = Math.max(tEnterXz, tEnterY);
  const tExit = Math.min(tExitXz, tExitY);

  if (tEnter <= tExit && tExit >= 0 && tEnter <= 1) {
    const t = Math.max(0, tEnter);
    return {
      t,
      point: {
        x: start.x + dx * t,
        y: start.y + dy * t,
        z: start.z + dz * t,
      },
    };
  }
  return null;
}

/**
 * Returns dynamic collision geometry for the Bi-Bye-llista carriage.
 * Replaces the static obstacle with oriented footprint collision.
 */
export function getBiByeSolids(ballista) {
  if (!ballista) return [];
  // Separate occupied pieces retain the open space around the cockpit and
  // outriggers. The movement solver accepts AABBs, so conservatively project each OBB.
  return biByeHitVolumes(ballista).map(box=>({
    id:box.id,center:box.center,
    size:[0,1,2].map(axis=>box.axes.reduce((sum,basis,i)=>sum+Math.abs(basis[axis])*box.size[i],0)),
    material:box.material,kind:'siege-chassis',
  }));
}

/**
 * Mount / operate the ballista if player is in range and ballista is not destroyed.
 */
export function mountBiByeLlista(ballista, player, nowSec = 0) {
  if (!ballista || !player || !player.alive) return false;
  if (player.pendingSpell || player.gauntlet || player.ultimateState || player.attackActive) return false;
  if (ballista.mode === BI_BYE_MODES.DESTROYED) return false;
  if (ballista.operatorId && ballista.operatorId !== player.id) return false;
  // Owned machines remain restricted to their side when unattended.
  if (ballista.team && ballista.team !== player.team) return false;

  const dist = Math.hypot(player.position.x - ballista.x, player.position.z - ballista.z);
  if (dist > ballista.interactRadius) return false;

  if(player.queuedSiegeLoadout){
    player.siegeLoadout={...player.queuedSiegeLoadout};player.queuedSiegeLoadout=null;
  }
  // Only technique selection changes. In particular never recreate skill,
  // readyAt, loading state, committed bolt, or the chassis.
  if(ballista.skill?.phase==='idle')ballista.skill.id=selectedSiegeSkill(player,'biBye');
  ballista.operatorId = player.id;
  if (!ballista.team && player.team) ballista.team = player.team;
  player.operatingBallistaId = ballista.id;

  // Align player to operator station
  syncOperatorPosition(ballista, player);
  player.velocity = { x: 0, y: 0, z: 0 };
  player.guarding = false;
  player.guardHeld = false;
  player.guardButton = false;
  player.input = { ...player.input, forward: 0, right: 0, jump: false, sprint: false,
    crouch: false, attack: false, guard: false, yaw: ballista.yaw, pitch: ballista.pitch };

  return true;
}

/**
 * Dismount the ballista and return control to the Spellblade.
 * Clears the machine's operator station even if the player entity has disconnected.
 */
export function dismountBiByeLlista(ballista, player = null, safeDisplace = false, world = null, nowSec = ballista?.poseTime ?? 0) {
  if (!ballista) return false;
  if (ballista.operatorId && (!player || ballista.operatorId === player.id)) {
    ballista.operatorId = null;
  }
  if (player && player.operatingBallistaId === ballista.id) {
    player.operatingBallistaId = null;
  }
  // Once Bolt II is committed, the mechanism owes that physical shot even
  // if the rider changes. Destruction may still arrest the mechanism.
  const committedHeavy=Boolean(ballista.heavySkill&&ballista.skill?.phase==='releasing');
  if(!committedHeavy){ballista.heavySkill=null;endSiegeSkill(ballista,nowSec);}
  ballista.pendingIndependent=null;
  cancelBiByeCoupling(ballista);
  if(ballista.mobileShotPendingAt != null){ballista.mobileShotPendingAt=null;ballista.mobileFiredAt=null;ballista.upperFiredAt=null;}
  ballista.speed = 0;
  ballista.steer = 0;
  if (player && safeDisplace) {
    const heading = ballista.heading;
    const rgtX = Math.cos(heading);
    const rgtZ = -Math.sin(heading);
    const fwdX = -Math.sin(heading);
    const fwdZ = -Math.cos(heading);

    // Prioritize clean egress directly behind the operator station along the vehicle approach path,
    // ensuring complete visual and physical clearance from the 3.985m chassis and collapsed wreckage
    // while comfortably clearing the Tourney Field embankment (south-road-east-bank).
    const candidates = [
      // 1. Primary: 3.0m behind carriage center (1.0m behind rear chassis timber, clear of terrain banks)
      { x: ballista.x - fwdX * 3.0, z: ballista.z - fwdZ * 3.0 },
      // 2. Slightly tighter behind carriage (0.8m behind rear chassis timber)
      { x: ballista.x - fwdX * 2.8, z: ballista.z - fwdZ * 2.8 },
      // 3. Rear-left quarter
      { x: ballista.x - fwdX * 3.0 - rgtX * 1.8, z: ballista.z - fwdZ * 3.0 - rgtZ * 1.8 },
      // 4. Rear-right quarter
      { x: ballista.x - fwdX * 3.0 + rgtX * 1.8, z: ballista.z - fwdZ * 3.0 + rgtZ * 1.8 },
      // 5. Rear lateral left flank
      { x: ballista.x - fwdX * 2.0 - rgtX * 2.8, z: ballista.z - fwdZ * 2.0 - rgtZ * 2.8 },
      // 6. Rear lateral right flank
      { x: ballista.x - fwdX * 2.0 + rgtX * 2.8, z: ballista.z - fwdZ * 2.0 + rgtZ * 2.8 },
    ];

    let chosen = candidates[0];
    const solids = world?.solids ?? [];
    for (const c of candidates) {
      const res = resolvePlayerWorld({ x: c.x, y: ballista.y, z: c.z }, 0.45, solids, 1.8);
      if (Math.hypot(res.x - c.x, res.z - c.z) < 0.1) {
        chosen = res;
        break;
      }
    }

    player.position.x = chosen.x;
    player.position.z = chosen.z;
    player.position.y = surfaceHeightAt(chosen.x, chosen.z, ballista.y + 2, world) ?? ballista.y;
    player.velocity = { x: 0, y: 0, z: 0 };
    if (typeof player.pitch === 'number') {
      player.pitch = 0;
    }
  }
  return true;
}

export function getBiByeOperatorTransform(ballista) {
  const station = ballista.mode === BI_BYE_MODES.MOBILE
    ? BI_BYE_LLISTA_CONFIG.stations.transportPush : BI_BYE_LLISTA_CONFIG.stations.operator;
  const root=biByeFrames(ballista).root,point=boxWorld(root,[station.x,station.y,station.z]);
  // The character faces -Z while the carriage asset faces +Z.
  return {position:{x:point[0],y:point[1],z:point[2]},yaw:ballista.heading,pitch:0,
    axes:[root.axes[0].map(v=>-v),root.axes[1],root.axes[2].map(v=>-v)]};
}
function syncOperatorPosition(ballista, player) {
  const pose=getBiByeOperatorTransform(ballista);
  Object.assign(player.position,pose.position);
  player.velocity={x:0,y:0,z:0};player.yaw=pose.yaw;player.pitch=0;
}

/**
 * Toggle operational mode between MOBILE and DEPLOYED.
 */
export function toggleBiByeDeploy(ballista, nowSec, world=null) {
  if (!ballista || ballista.retired || ballista.mode === BI_BYE_MODES.DESTROYED) return false;

  if (ballista.mode === BI_BYE_MODES.MOBILE) {
    if (ballista.mobileShotPendingAt != null || !biByeCondition(ballista).canDeploy) return false;
    const support=biByeDeploymentSupport(ballista,world);
    ballista.deploymentSupported=support.ok;
    if(!support.ok){ballista.deploymentReason=support.reason;ballista.deploymentRejectedAt=nowSec;return false;}
    ballista.stabilizerTilts=support.tilts;ballista.deploymentReason=null;
    ballista.mode = BI_BYE_MODES.DEPLOYING;
    ballista.modeTransitionStartedAt = nowSec;
    ballista.modeTransitionEndsAt = nowSec + BI_BYE_LLISTA_CONFIG.timing.deployDurationSec;
    ballista.speed = 0;
    return true;
  }

  if (ballista.mode === BI_BYE_MODES.DEPLOYED) {
    // Once the string releases, keep the machine planted through the heavy delay.
    if (ballista.coupling === 'FIRING' && ballista.upperReleasedAt != null) return false;
    ballista.pendingIndependent=null;
    cancelBiByeCoupling(ballista, nowSec);
    ballista.retractFrom = biByeDeployProgress(ballista, nowSec);
    ballista.retractAim = { yaw: biByeAimPose(ballista, nowSec).mainYaw, pitch: biByeAimPose(ballista, nowSec).mainPitch };
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
export function biByeCanDamage(room, ballista, attackerId) {
  if (!ballista || ballista.retired || ballista.mode === BI_BYE_MODES.DESTROYED) return false;
  if (room.mode === 'PRACTICE') return true;
  if (ballista.operatorId === attackerId) return false;
  const attacker = room.players?.get(attackerId);
  const team = ballista.team ?? room.players?.get(ballista.operatorId)?.team;
  return !(team && attacker?.team === team);
}

export function damageBiByeLlista(room, ballista, amount, attackerId, source, nowSec, { componentId = 'hull', point = null, material = componentId.startsWith('Stabilizer') ? 'metal' : 'timber' } = {}) {
  if (!biByeCanDamage(room, ballista, attackerId) || !Number.isFinite(amount) || !(amount > 0)) return false;
  const component = componentId === 'hull' ? ballista : ballista.components?.[componentId];
  if (!component || component.health <= 0) return false;
  // Apply machine-linked Steel only after contact eligibility; hull, wheels,
  // stabilizers and surviving assemblies all use this same damage entrypoint.
  const ward=mitigateSiegeSteel(room,ballista,amount,source,now,{componentId,point});
  const dealt=Math.min(ward.amount,component.health);
  component.health -= dealt;
  component.lastHitAt = nowSec;
  room.events?.push({ type: 'bibyeDamaged', ballistaId: ballista.id, componentId, amount: dealt,
    health: component.health, attackerId, source, material, point: point ?? {x:ballista.x,y:ballista.y+1,z:ballista.z}, at: nowSec });
  if (componentId !== 'hull' && component.health === 0) {
    component.failedAt = nowSec;
    room.events?.push({type:'bibyeComponentFailed',ballistaId:ballista.id,componentId,point,at:nowSec});
    const condition = biByeCondition(ballista);
    if (!condition.canDrive) ballista.speed = 0;
    if (!condition.canDeploy && (ballista.mode === BI_BYE_MODES.DEPLOYED || ballista.mode === BI_BYE_MODES.DEPLOYING)) {
      const progress = biByeDeployProgress(ballista, nowSec);
      const pose = biByeAimPose(ballista, nowSec);
      ballista.retractFrom = progress;
      ballista.retractAim = {yaw:pose.mainYaw,pitch:pose.mainPitch};
      ballista.mode = BI_BYE_MODES.RETRACTING;
      ballista.modeTransitionStartedAt = nowSec;
      ballista.modeTransitionEndsAt = nowSec + Math.max(.1,progress * BI_BYE_LLISTA_CONFIG.timing.retractDurationSec);
      interruptBiByeSupport(ballista, nowSec);
      room.events?.push({type:'bibyeSupportFailed',ballistaId:ballista.id,at:nowSec});
    }
  }
  if (ballista.health <= 0) {
    endSiegeSteel(room,ballista,nowSec);
    ballista.destroyedAt = nowSec;
    ballista.mode = BI_BYE_MODES.DESTROYED;
    ballista.state = BI_BYE_STATES.SPENT;
    ballista.mobileShotPendingAt = null;
    ballista.shotIPendingAt = Infinity;
    ballista.shotIIPendingAt = Infinity;
    if (ballista.operatorId) {
      const op = room.players?.get(ballista.operatorId);
      const cold=ballista.skill?.id==='coldHowTouching'&&ballista.skill?.phase==='active';
      dismountBiByeLlista(ballista, op, true, room.world, nowSec);
      if(cold)room.events?.push({type:'siegeSkill',machineId:ballista.id,
        skill:'coldHowTouching',action:'ended',reason:'destroyed',at:nowSec});
    }
    room.events?.push({type:'bibyeDestroyed',ballistaId:ballista.id,killerId:attackerId,at:nowSec});
  }
  return true;
}

export function blastBiByeLlista(room, ballista, blast, attackerId, source, nowSec, solids = room.world?.solids ?? []) {
  if (!biByeCanDamage(room, ballista, attackerId)) return;
  for (const hit of biByeBlastAllocations(ballista, blast, nowSec, solids)) {
    damageBiByeLlista(room, ballista, hit.amount, attackerId, source, nowSec, {...hit,point:blast.point});
  }
}

/**
 * Trigger mobile Shot I (Conditioning Bolt) while moving.
 * Discharges at nowSec + 0.200s (matching Argon 09_BiBye_Mobile_Shot1_Fire string release).
 */
export function fireBiByeMobile(room, ballista, nowSec) {
  return requestBiByeIndependent(room, ballista, nowSec);
}
export function fireBiByeFullVolley(room, ballista, nowSec) {
  return requestBiByeVolley(room, ballista, nowSec);
}
export function fireBiByeLlista(room, ballista, nowSec) {
  if (!ballista || ballista.retired || ballista.mode === BI_BYE_MODES.DESTROYED) return false;
  // A primed Skill always routes ATTACK to the independent upper bolt.
  // Never let the ordinary deployed MAIN focus arm a coupled automatic Bolt II.
  if(ballista.skill?.phase==='primed')return fireBiByeMobile(room,ballista,nowSec);
  return ballista.mode === BI_BYE_MODES.DEPLOYED && ballista.weaponFocus === 'MAIN'
    ? fireBiByeFullVolley(room, ballista, nowSec) : fireBiByeMobile(room, ballista, nowSec);
}

/**
 * Release-frame locators from the checksum-verified v3.2 export.
 * Traverse [0,1.24,0] -> cradle [0,.38,-.12] -> upper [0,.92,.20].
 * The exported +Z firing axis becomes Castleward forward through heading + PI.
 * Recoil starts AFTER release, so authoritative projectiles use these rest pivots.
 */
function biByeAimedCopy(b, kind, aim) {
  aim ??= kind === 'conditioning' ? {yaw:b.upperYaw??b.yaw,pitch:b.upperPitch??b.pitch} : {yaw:b.mainYaw??b.yaw,pitch:b.mainPitch??b.pitch};
  if (b.mainYaw == null) return {...b, yaw: aim.yaw, pitch: aim.pitch};
  return kind === 'conditioning'
    ? {...b, upperYaw: aim.upperYaw ?? aim.yaw ?? b.upperYaw, upperPitch: aim.upperPitch ?? aim.pitch ?? b.upperPitch}
    : {...b, mainYaw: aim.yaw ?? b.mainYaw, mainPitch: aim.pitch ?? b.mainPitch};
}
// Converge on the main rail's sightline at 35 m without changing bolt speeds.
// Solve against each real composed muzzle, keeping correction in the mechanism.
export function biByeCoupledAim(b, range = 35) {
  const main = {yaw:b.mainYaw,pitch:b.mainPitch};
  if(b.aimTarget){const p=getBiByeMuzzlePosition(b,'siege',main);range=clamp(Math.hypot(b.aimTarget.x-p.x,b.aimTarget.y-p.y,b.aimTarget.z-p.z),4,200);}
  const muzzle = getBiByeMuzzlePosition(b,'siege',main),dir = getBiByeMuzzleDirection(b,'siege',main);
  const target = {x:muzzle.x+dir.x*range,y:muzzle.y+dir.y*range,z:muzzle.z+dir.z*range};
  let aim = main;
  for(let i=0;i<4;i++){
    const p=getBiByeMuzzlePosition(b,'conditioning',aim),x=target.x-p.x,y=target.y-p.y,z=target.z-p.z;
    aim={yaw:Math.atan2(-x,-z),pitch:Math.atan2(y,Math.hypot(x,z))};
  }
  return aim;
}
export function biByeTargetAim(b,kind,aim,target){
 if(!target||!['x','y','z'].every(k=>Number.isFinite(target[k]))||Math.hypot(target.x-b.x,target.y-b.y,target.z-b.z)>210)return {...biByeConstrainAim(b,aim,kind==='conditioning'),limited:false};
 let limited=false;
 for(let i=0;i<5;i++){
  const p=getBiByeMuzzlePosition(b,kind,aim),x=target.x-p.x,y=target.y-p.y,z=target.z-p.z;
  const requested={yaw:Math.atan2(-x,-z),pitch:Math.atan2(y,Math.hypot(x,z))};
  aim=biByeConstrainAim(b,requested,kind==='conditioning');
  limited=Math.abs(Math.atan2(Math.sin(aim.yaw-requested.yaw),Math.cos(aim.yaw-requested.yaw)))>.002||Math.abs(aim.pitch-requested.pitch)>.002;
 }
 return {...aim,limited};
}
export function getBiByeMuzzlePosition(ballista, subKind, aim = null) {
  const copy = biByeAimedCopy(ballista, subKind, aim);
  const frames = biByeFrames(copy);
  const point = subKind === 'conditioning' ? boxWorld(frames.upper,[0,.165,.84]) : boxWorld(frames.cradle,[0,.215,1.64]);
  return {x:point[0],y:point[1],z:point[2]};
}

export function getBiByeMuzzleDirection(ballista, subKind, aim = null) {
  const frames = biByeFrames(biByeAimedCopy(ballista, subKind, aim));
  const [x,y,z] = (subKind === 'conditioning' ? frames.upper : frames.cradle).axes[2];
  return {x,y,z};
}

let bibyeProjCounter = 0;

function spawnShotI(room, ballista, aim, nowSec, ownerId = ballista.firingOperatorId) {
  const dir = getBiByeMuzzleDirection(ballista, 'conditioning', aim);
  const cfg = BI_BYE_LLISTA_CONFIG.shotI;
  const id = `bibye-bolt-${++bibyeProjCounter}`;

  const muzzlePos = getBiByeMuzzlePosition(ballista, 'conditioning', aim);

  const projectile = {
    id,
    kind: 'bibye',
    subKind: 'conditioning',
    ballistaId: ballista.id,
    ownerId: ownerId ?? ballista.operatorId ?? 'ballista',
    position: muzzlePos,
    velocity: { x: dir.x * cfg.speed, y: dir.y * cfg.speed, z: dir.z * cfg.speed },
    bornAt: nowSec,
    // Capture the Skill on physical release, not aim or target impact.
    proximityFrost:ballista.skill?.id==='coldHowTouching'&&ballista.skill.phase==='active',
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
  const dir = getBiByeMuzzleDirection(ballista, 'siege', aim);
  const cfg = BI_BYE_LLISTA_CONFIG.shotII;
  const id = `bibye-bolt-${++bibyeProjCounter}`;

  const muzzlePos = getBiByeMuzzlePosition(ballista, 'siege', aim);

  const projectile = {
    id,
    kind: 'bibye',
    subKind: 'siege',
    ballistaId: ballista.id,
    ownerId: ballista.firingOperatorId ?? ballista.operatorId ?? 'ballista',
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
  if(ballista?.retired)return;
  if (!ballista) return;
  ballista.poseTime = nowSec;
  const previousPose = {...ballista};
  if(!ballista.terrainInitialized){const initial=biByeTerrainPose(ballista,biByeTerrainContext(world,ballista));if(initial)Object.assign(ballista,initial);ballista.terrainInitialized=true;}

  // Handle destroyed state
  if (ballista.mode === BI_BYE_MODES.DESTROYED) {
    if (ballista.operatorId) {
      const op = room.players?.get(ballista.operatorId);
      dismountBiByeLlista(ballista, op, true, room.world);
    }
    return;
  }

  if(ballista.mode==='DEPLOYING'||ballista.mode==='DEPLOYED'){
    const support=biByeDeploymentSupport(ballista,world);
    ballista.deploymentSupported=support.ok;
    if(!support.ok){
      ballista.deploymentReason=support.reason;ballista.deploymentRejectedAt=nowSec;
      ballista.retractFrom=biByeDeployProgress(ballista,nowSec);
      const aim=biByeAimPose(ballista,nowSec);ballista.retractAim={yaw:aim.mainYaw,pitch:aim.mainPitch};
      interruptBiByeSupport(ballista,nowSec);ballista.mode='RETRACTING';
      ballista.modeTransitionStartedAt=nowSec;ballista.modeTransitionEndsAt=nowSec+Math.max(.1,ballista.retractFrom*1.2);
    }else ballista.stabilizerTilts=support.tilts;
  }

  // Handle mode transitions
  if (ballista.mode === BI_BYE_MODES.DEPLOYING) {
    if (nowSec >= ballista.modeTransitionEndsAt) {
      ballista.mode = BI_BYE_MODES.DEPLOYED;
      ballista.weaponFocus = 'MAIN';ballista.focusRevision++;
      const op = room.players?.get(ballista.operatorId);
      if(op)op.input={...op.input,yaw:ballista.mainYaw,pitch:ballista.mainPitch};
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
        // Input consumption: signed numbers in [-1, 1]
        // (Supporting boolean legacy, number protocol, and touch joystick)
        let forwardVal = 0;
        if (typeof input.forward === 'number') forwardVal = input.forward;
        else if (input.forward) forwardVal = 1;
        else if (input.backward || input.back) forwardVal = -1;

        let rightVal = 0;
        if (typeof input.right === 'number') rightVal = input.right;
        else if (input.right) rightVal = 1;
        else if (input.left) rightVal = -1;

        const forward = Math.max(-1, Math.min(1, forwardVal));
        const steer = Math.max(-1, Math.min(1, rightVal));

        const driveScale=biByeCondition(ballista).driveScale;
        const baseSpeed=driveScale*forward*(forward>=0?BI_BYE_LLISTA_CONFIG.mobility.forwardSpeed:BI_BYE_LLISTA_CONFIG.mobility.reverseSpeed);
        const ascent=Math.sin(ballista.chassisPitch??0)*Math.sign(forward);
        const gradeScale=1-.55*Math.max(0,Math.min(1,ascent/Math.sin(22*Math.PI/180)));
        const speed=baseSpeed*gradeScale*Math.cos(ballista.chassisPitch??0);
        ballista.steer=steer;
        const others=soFistSolids(room.soFistication);
        for(const other of room.players?.values()??[]){if(other.alive&&other.id!==ballista.operatorId)others.push({center:[other.position.x,other.position.y+.9,other.position.z],size:[.9,1.8,.9]});}
        const ctx=biByeTerrainContext(world,ballista,others),old={...ballista};
        const slices=Math.max(1,Math.ceil(Math.abs(speed*dt)/.05));
        for(let i=0;i<slices&&Math.abs(speed)>1e-5;i++){
          const distance=speed*dt/slices,heading=ballista.heading-distance/BI_BYE_LLISTA_CONFIG.mobility.minTurningRadius*steer;
          let moved=false;
          for(const h of [heading,ballista.heading]){
            const candidate={...ballista,heading:h,x:ballista.x-Math.sin(h)*distance,z:ballista.z-Math.cos(h)*distance};
            const contact=biByeTerrainPose(candidate,ctx);if(!contact)continue;
            Object.assign(candidate,contact);
            if(Math.abs(candidate.y-ballista.y)>.07||!biByeTerrainClear(candidate,ctx))continue;
            Object.assign(ballista,{x:candidate.x,y:candidate.y,z:candidate.z,heading:candidate.heading,...contact});moved=true;break;
          }
          if(!moved)break;
        }
        ballista.speed=((ballista.x-old.x)*-Math.sin(ballista.heading)+(ballista.z-old.z)*-Math.cos(ballista.heading))/Math.max(dt,1e-6);
        if(Math.abs(ballista.speed-speed)<1e-5)ballista.speed=speed;
        if(Math.abs(ballista.speed)<1e-9)ballista.speed=0;

      } else {
        ballista.speed = 0;
        ballista.steer = 0;
      }

      // Sync operator position to carriage station
      syncOperatorPosition(ballista, operator);
    }
  }

  // Authoritative momentum transferred by a real piston contact. This is
  // separate from the driver's requested speed: ordinary input cannot erase
  // the shove in the following tick. Unoccupied machines obey it as well.
  const impulse=ballista.externalVelocity??{x:0,z:0};
  if(ballista.mode==='MOBILE'&&Math.hypot(impulse.x,impulse.z)>SIEGE_IMPACT.restSpeed){
    const others=soFistSolids(room.soFistication);
    for(const other of room.players?.values()??[])if(other.alive&&other.id!==ballista.operatorId)
      others.push({center:[other.position.x,other.position.y+.9,other.position.z],size:[.9,1.8,.9]});
    const ctx=biByeTerrainContext(world,ballista,others);
    const initiallyBlocked=!biByeTerrainClear(ballista,ctx);
    const slices=Math.max(1,Math.ceil(Math.hypot(impulse.x,impulse.z)*dt/.05));
    for(let i=0;i<slices;i++){
      const next={...ballista,x:ballista.x+impulse.x*dt/slices,z:ballista.z+impulse.z*dt/slices};
      const pose=biByeTerrainPose(next,ctx);
      if(!pose||Math.abs(pose.y-ballista.y)>.07)break;
      const proposed={...next,...pose};
      let safe=biByeTerrainClear(proposed,ctx);
      // A piston contact can begin at the boundary of the ram's hit volumes.
      // Escape from an initial overlap is safe only if separating from the
      // ram AND clearing the permanent world + player obstacles.
      if(!safe&&initiallyBlocked&&room.soFistication){
        const ram=room.soFistication;
        const away=Math.hypot(proposed.x-ram.x,proposed.z-ram.z)>
          Math.hypot(ballista.x-ram.x,ballista.z-ram.z)+1e-6;
        if(away) safe=biByeTerrainClear(proposed,biByeTerrainContext(world,proposed,others.filter(s=>s.kind!=='siege-chassis')));
      }
      if(!safe){ballista.externalVelocity={x:0,z:0};break;}
      Object.assign(ballista,{x:proposed.x,y:proposed.y,z:proposed.z,chassisPitch:pose.chassisPitch,chassisRoll:pose.chassisRoll,wheelOffsets:pose.wheelOffsets});
    }
    if(ballista.operatorId){
      const operator=room.players?.get(ballista.operatorId);
      if(operator?.alive)syncOperatorPosition(ballista,operator);
    }
    const fade=Math.exp(-SIEGE_IMPACT.mobileDrag*dt);
    ballista.externalVelocity={x:(ballista.externalVelocity?.x??0)*fade,z:(ballista.externalVelocity?.z??0)*fade};
  }else ballista.externalVelocity={x:0,z:0};

  const roll = biByeWheelTravel(previousPose, ballista, biByeWheelSteering(ballista.steer??0));
  ballista.wheelRolls = ballista.wheelRolls.map((v,i)=>v + (ballista.components[Object.keys(ballista.components)[i]].health > 0 ? roll[i] : 0));

  stepBiByeWeapons(room, ballista, dt, nowSec, {shotI:spawnShotI,shotII:spawnShotII,coupledAim:biByeCoupledAim,targetAim:biByeTargetAim});

}

/**
 * Continuous swept projectile simulation.
 * Calculates exact impact time t in [0, 1] against world geometry, terrain, and player hit cylinders.
 * Resolves impacts in spatial order (earliest t first).
 */
export function stepBiByeProjectiles(room, dt, nowSec, world = room.world, { filterOwnerId = null } = {}) {
  if (!room.bibyeProjectiles || room.bibyeProjectiles.size === 0) return;

  for (const projectile of [...room.bibyeProjectiles.values()]) {
    if (filterOwnerId !== null && projectile.ownerId !== filterOwnerId) {
      projectile.bornAt = (projectile.bornAt ?? nowSec) + dt;
      continue;
    }
    const before = { ...projectile.position };
    // A release can occur between host ticks. Advance only the fraction of this
    // tick during which the projectile actually existed.
    const flightDt = Math.min(dt, Math.max(0, nowSec - projectile.bornAt));
    const after = {
      x: before.x + projectile.velocity.x * flightDt,
      y: before.y + projectile.velocity.y * flightDt,
      z: before.z + projectile.velocity.z * flightDt,
    };

    const hits = [];

    // 1. World solids continuous swept ray test
    world = structureWorld(world, room.structures);
    for (const box of world?.solids ?? []) {
      if (String(box.id ?? '').startsWith('bibye-') || String(box.id ?? '').startsWith('sofist-')) continue;
      const hit = segmentAabbHit([before.x, before.y, before.z], [after.x, after.y, after.z], box);
      if (hit && hit.t >= 0 && hit.t <= 1) {
        hits.push({
          t: hit.t,
          kind: 'solid',
          box,
          point: { x: hit.point[0], y: hit.point[1], z: hit.point[2] },
        });
      }
    }

    const machine = room.biByeLlista;
    if (machine) {
      // The launching rail/limbs may initially contain their own bolt. Exempt
      // that assembly only until it clears the rail, never the entire carriage.
      const own = projectile.ballistaId === machine.id;
      const railClearTime = projectile.subKind === 'conditioning' ? 1.65 / 48 : 3.75 / 55;
      const assembly = own && nowSec - projectile.bornAt <= railClearTime + dt ? (projectile.subKind === 'conditioning' ? 'upper' : 'main') : null;
      const hit = biByeFirstHit(machine, [before.x,before.y,before.z], [after.x,after.y,after.z], nowSec, 0, assembly);
      if (hit) hits.push({...hit,kind:"machine",point:{x:hit.point[0],y:hit.point[1],z:hit.point[2]}});
    }

    const flightHit=fightFlightFirstHit(room.fightFlight,[before.x,before.y,before.z],[after.x,after.y,after.z],projectile.radius??0);
    if(flightHit)hits.push({t:flightHit.t,kind:'flight',box:flightHit.box,point:{x:flightHit.point[0],y:flightHit.point[1],z:flightHit.point[2]}});
    const ramHit=soFistFirstHit(room.soFistication,[before.x,before.y,before.z],[after.x,after.y,after.z],nowSec);
    if(ramHit)hits.push({...ramHit,kind:'ram',point:{x:ramHit.point[0],y:ramHit.point[1],z:ramHit.point[2]}});

    // 2. Ground terrain collision
    const ground = surfaceHeightAt(after.x, after.z, before.y, world);
    if (ground !== null && before.y > ground && after.y <= ground) {
      const t = Math.max(0, Math.min(1, (before.y - ground) / (before.y - after.y || 1)));
      hits.push({
        t,
        kind: 'ground',
        box: null,
        point: {
          x: before.x + (after.x - before.x) * t,
          y: ground + 0.05,
          z: before.z + (after.z - before.z) * t,
        },
      });
    }

    // 3. Player hit cylinders swept collision
    for (const player of room.players.values()) {
      if (!player.alive || player.id === projectile.ownerId) continue;
      if (areAllies(room, projectile.ownerId, player.id)) continue;
      if (projectile.piercedVictimIds?.includes(player.id)) continue;

      const rad = projectile.radius ?? 0;
      const cylinder = {
        x: player.position.x,
        y: player.position.y - rad,
        z: player.position.z,
        radius: 0.45 + rad,
        height: postureOf(player).height + 2 * rad,
      };

      // Sweep relative to the target's actual motion over this bolt's flight interval.
      // A teleport/reset is not travel through every intervening point.
      const old=sampleTransform(player,nowSec-flightDt).position;
      const moved=Math.hypot(player.position.x-old.x,player.position.y-old.y,player.position.z-old.z);
      const start=moved<2?{x:before.x+player.position.x-old.x,y:before.y+player.position.y-old.y,z:before.z+player.position.z-old.z}:before;
      const hit = sweptSegmentCylinderHit(start, after, cylinder);
      if(hit)hit.point={x:before.x+(after.x-before.x)*hit.t,y:before.y+(after.y-before.y)*hit.t,z:before.z+(after.z-before.z)*hit.t};
      if (hit && hit.t >= 0 && hit.t <= 1) {
        hits.push({
          t: hit.t,
          kind: 'player',
          player,
          parryContact: projectile.subKind==='conditioning'?frostParryContact(player,projectile,start,{x:start.x+(after.x-start.x)*hit.t,y:start.y+(after.y-start.y)*hit.t,z:start.z+(after.z-start.z)*hit.t},nowSec,BI_BYE_LLISTA_CONFIG.shotI.guardArcDeg):null,
          point: hit.point,
        });
      }
    }

    // Proximity and real impacts compete on the same continuous swept path.
    if(projectile.proximityFrost){
      const near=earliestFrostProximity(room,projectile,before,after,world,nowSec,flightDt);
      if(near)hits.push(near);
    }
    hits.sort((a, b) => a.t - b.t);

    // Handle Shot I: Enchanted Frost Conditioning Bolt
    if (projectile.subKind === 'conditioning') {
      if (hits.length > 0) {
        const first = hits[0];
        const impactPoint = first.point;
        const hitPlayer = first.kind === 'player' ? first.player : null;

        room.bibyeProjectiles.delete(projectile.id);
        room.events?.push({
          type: 'bibyeBoltImpact',
          ballistaId: projectile.ballistaId,
          projectileId: projectile.id,
          subKind: 'conditioning',
          point: impactPoint,
          hitKind: hitPlayer ? 'player' : first.kind,
          solidId: first.box?.id ?? null,
          victimId: hitPlayer?.id ?? null,
          at: nowSec,
        });
        if(first.kind==='proximity'){
          room.events?.push({type:'bibyeFrostProximity',ballistaId:projectile.ballistaId,
            projectileId:projectile.id,targetKind:first.targetKind,targetId:first.targetId,
            point:impactPoint,at:nowSec});
          // Explosion remains at the actual bolt; unchanged falloff and guard.
          const impactAt=nowSec-flightDt+flightDt*first.t;
          detonateFrostBlast(room,projectile,impactPoint,nowSec,null,world,false,impactAt);
          if(room.soFistication&&room.soFistication.operatorId!==projectile.ownerId&&
             !areAllies(room,projectile.ownerId,room.soFistication.operatorId)&&
             !frostHasCover(world,impactPoint,{x:room.soFistication.x,
               y:room.soFistication.y+1,z:room.soFistication.z}))
            blastSoFistication(room,room.soFistication,{point:impactPoint,
              radius:projectile.blastRadius,damage:projectile.directDamage},
              projectile.ownerId,'bibye-conditioning',nowSec);
          if(machine?.id!==projectile.ballistaId)
            blastBiByeLlista(room,machine,{point:impactPoint,
              radius:projectile.blastRadius,damage:projectile.directDamage},
              projectile.ownerId,'bibye-conditioning',nowSec,world?.solids??[]);
          frostBlastFlight(room,room.fightFlight,projectile,impactPoint,nowSec,world);
          continue;
        }
        if(first.kind==='solid')damageStructureSolid(room,first.box,projectile.directDamage,projectile.ownerId,'bibye-conditioning',nowSec,{point:impactPoint});
        if(first.kind==='ram')damageSoFistication(room,room.soFistication,projectile.directDamage,projectile.ownerId,'bibye-conditioning',nowSec,{componentId:first.box.componentId,point:impactPoint});
        if(first.kind==='flight')damageFightFlight(room,room.fightFlight,projectile.directDamage,projectile.ownerId,'bibye-conditioning',nowSec,{componentId:first.box.componentId,point:impactPoint,steelMinimum:2});
        if (first.kind === 'machine') damageBiByeLlista(room,machine,projectile.directDamage,projectile.ownerId,'bibye-conditioning',nowSec,{componentId:first.box.componentId,point:impactPoint});
        else if (machine?.id !== projectile.ballistaId) blastBiByeLlista(room,machine,{point:impactPoint,radius:projectile.blastRadius,damage:projectile.directDamage},projectile.ownerId,'bibye-conditioning',nowSec);
        detonateFrostBlast(room, projectile, impactPoint, nowSec, hitPlayer?.id, world, Boolean(first.parryContact));
        continue;
      }
    }

    // Handle Shot II: Physical Siege Bolt
    if (projectile.subKind === 'siege') {
      let projectileTerminated = false;

      for (const hit of hits) {
        // Solid world obstacle or ground decisively stops the physical bolt
        if (hit.kind === 'solid' || hit.kind === 'ground' || hit.kind === 'machine' || hit.kind === 'ram' || hit.kind === 'flight') {
          if(hit.kind==='solid')damageStructureSolid(room,hit.box,projectile.directDamage,projectile.ownerId,'bibye-siege',nowSec,{point:hit.point});
          if(hit.kind==='ram')damageSoFistication(room,room.soFistication,projectile.directDamage,projectile.ownerId,'bibye-siege',nowSec,{componentId:hit.box.componentId,point:hit.point});
          if(hit.kind==='flight')damageFightFlight(room,room.fightFlight,projectile.directDamage,projectile.ownerId,'bibye-siege',nowSec,{componentId:hit.box.componentId,point:hit.point,steelMinimum:8});
          if (hit.kind === 'machine') damageBiByeLlista(room,machine,projectile.directDamage,projectile.ownerId,'bibye-siege',nowSec,{componentId:hit.box.componentId,point:hit.point});
          else if (machine?.id !== projectile.ballistaId) blastBiByeLlista(room,machine,{point:hit.point,radius:BI_BYE_LLISTA_CONFIG.shotII.shockwave.radius,damage:BI_BYE_LLISTA_CONFIG.shotII.shockwave.centerDamage},projectile.ownerId,'bibye-shockwave',nowSec);
          room.bibyeProjectiles.delete(projectile.id);
          projectileTerminated = true;

          room.events?.push({
            type: 'bibyeBoltImpact',
            ballistaId: projectile.ballistaId,
            projectileId: projectile.id,
            subKind: 'siege',
            point: hit.point,
            hitKind: hit.kind,
            solidId: hit.box?.id ?? null,
            at: nowSec,
          });

          if (!projectile.shockwaveSpawned) {
            projectile.shockwaveSpawned = true;
            detonateSiegeShockwave(room, projectile, hit.point, projectile.piercedVictimIds, nowSec, world);
          }
          break; // Stop completely: players behind the wall receive no damage!
        }

        // Player direct / pierced hit
        if (hit.kind === 'player') {
          const sweptVictim = hit.player;
          if (projectile.piercedVictimIds.includes(sweptVictim.id)) continue;

          projectile.piercedVictimIds.push(sweptVictim.id);
          projectile.pierceCount += 1;

          // Piercing damage falloff for second target
          const damage = projectile.pierceCount === 1
            ? projectile.directDamage
            : Math.round(projectile.directDamage * BI_BYE_LLISTA_CONFIG.shotII.pierceDamageFalloff);

          const len = Math.hypot(projectile.velocity.x, projectile.velocity.z) || 1;
          const push = {
            x: (projectile.velocity.x / len) * projectile.shove,
            y: 0.6,
            z: (projectile.velocity.z / len) * projectile.shove,
          };

          // Heavy physical impact compromises raised Guard
          if (sweptVictim.guarding) {
            sweptVictim.guardStamina = Math.max(0, sweptVictim.guardStamina - 45);
            sweptVictim.lastGuardDrainAt = nowSec;
            if (sweptVictim.guardStamina <= 0) {
              sweptVictim.guarding = false;
              room.events?.push({ type: 'guardBreak', attackerId: projectile.ownerId, defenderId: sweptVictim.id, at: nowSec });
            }
          }

          const landed = applyDamage(room, projectile.ownerId, sweptVictim.id, damage, 'bibye-siege', nowSec, push, {
            minDamage: 55,
          });

          if (landed) {
            staggerBy(room, sweptVictim, projectile.staggerGain, nowSec, projectile.ownerId);
            interruptHitActions(room, sweptVictim, projectile.ownerId, nowSec, 'bibye-siege');
          }

          room.events?.push({
            type: 'bibyeBoltImpact',
            ballistaId: projectile.ballistaId,
            projectileId: projectile.id,
            subKind: 'siege',
            victimId: sweptVictim.id,
            damage,
            point: hit.point,
            hitKind: 'player',
            at: nowSec,
          });

          // Detonate shockwave on first victim hit, strictly excluding pierced victims
          if (!projectile.shockwaveSpawned) {
            projectile.shockwaveSpawned = true;
            detonateSiegeShockwave(room, projectile, hit.point, projectile.piercedVictimIds, nowSec, world);
          }

          // Max pierce capacity reached (up to 2 targets)
          if (projectile.pierceCount >= projectile.pierceMaxTargets) {
            room.bibyeProjectiles.delete(projectile.id);
            projectileTerminated = true;
            break;
          }
        }
      }

      if (projectileTerminated) continue;
    }

    // Step position forward
    projectile.position = after;

    // Lifespan expiry (4.0s)
    if (nowSec - projectile.bornAt > 4.0) {
      room.bibyeProjectiles.delete(projectile.id);
    }
  }
}

function frostHasCover(world,from,to){
 return (world?.solids??[]).some(solid=>{
  if(String(solid.id??'').startsWith('bibye-')||String(solid.id??'').startsWith('sofist-'))return false;
  const h=segmentAabbHit([from.x,from.y,from.z],[to.x,to.y,to.z],solid);
  return h&&h.t>1e-5&&h.t<1-1e-5;
 });
}
// One damage budget across every damaged flight component; rotor blades
// are not independent 18-HP targets within a single detonation.
function frostBlastFlight(room,m,projectile,point,now,world){
 if(!m||m.retired||m.mode==='DESTROYED'||m.operatorId===projectile.ownerId||
   m.team&&room.players.get(projectile.ownerId)?.team===m.team)return;
 const exposures=new Map(),radius=projectile.blastRadius;
 for(const box of fightFlightHitVolumes(m)){
  const d=[point.x-box.center[0],point.y-box.center[1],point.z-box.center[2]];
  let outside=0;
  for(let i=0;i<3;i++){
   const projection=d.reduce((sum,x,k)=>sum+x*box.axes[i][k],0);
   outside+=Math.max(0,Math.abs(projection)-box.size[i]/2)**2;
  }
  const exposure=Math.max(0,1-Math.sqrt(outside)/radius);
  if(exposure<=0)continue;
  const nearest=[...box.center];
  for(let j=0;j<3;j++){
   const projection=d.reduce((sum,x,k)=>sum+x*box.axes[j][k],0);
   const offset=Math.max(-box.size[j]/2,Math.min(box.size[j]/2,projection));
   for(let k=0;k<3;k++)nearest[k]+=offset*box.axes[j][k];
  }
  if(frostHasCover(world,point,{x:nearest[0],y:nearest[1],z:nearest[2]}))continue;
  exposures.set(box.componentId,Math.max(exposures.get(box.componentId)??0,exposure));
 }
 const total=[...exposures.values()].reduce((a,e)=>a+e,0);
 for(const [componentId,exposure]of exposures)if(exposure>0)
  damageFightFlight(room,m,projectile.directDamage*exposure/Math.max(1,total),
    projectile.ownerId,'bibye-conditioning',now,{componentId,point,steelMinimum:0});
}
/**
 * Detonates the Frost Conditioning blast.
 * Continuous linear damage falloff (18 -> 0 at perimeter), stamina drain, and fading chill.
 * Frontal Guard chips health, drains stamina and chills lightly. Direct timed physical parries exclude their defender.
 * Excludes friendly fire and self-damage.
 */
function detonateFrostBlast(room, projectile, point, nowSec, directVictimId = null, world = null, directParry = false, impactAt = null) {
  const cfg = BI_BYE_LLISTA_CONFIG.shotI;
  const radius = cfg.blastRadius;

  room.events?.push({
    type: 'bibyeFrostBlast',
    ballistaId: projectile.ballistaId,
    projectileId: projectile.id,
    point,
    radius,
    directVictimId,
    at: nowSec,
  });

  for (const victim of room.players.values()) {
    if (!victim.alive || victim.spawnProtectionUntil > nowSec) continue;
    // Proximity never makes the protected operator a second chassis target.
    if(projectile.proximityFrost&&
      (victim.operatingBallistaId||victim.operatingRamId||victim.operatingFightFlightId))continue;
    if (victim.id === projectile.ownerId) continue;
    if (areAllies(room, projectile.ownerId, victim.id)) continue;

    const isDirect = directVictimId && victim.id === directVictimId;
    // Resolve the exposure at the swept event, not at the end of the
    // frame: a fast lateral dodge cannot retroactively evade an explosion
    // that occurred midway through this projectile tick.
    const position=impactAt!=null&&victim.history?.length
      ? sampleTransform(victim,impactAt).position : victim.position;
    const targetCenter = { x: position.x, y: position.y + 0.9, z: position.z };
    const dist = Math.hypot(targetCenter.x - point.x, targetCenter.y - point.y, targetCenter.z - point.z);
    if (!isDirect && dist > radius) continue;

    // Check solid line of sight occlusion for non-direct victims
    if (!isDirect && world?.solids) {
      let occluded = false;
      for (const solid of world.solids) {
        if (String(solid.id ?? '').startsWith('bibye-') || String(solid.id ?? '').startsWith('sofist-')) continue;
        if (segmentAabbHit([point.x, point.y, point.z], [targetCenter.x, targetCenter.y, targetCenter.z], solid)) {
          occluded = true;
          break;
        }
      }
      if (occluded) continue;
    }

    // Continuous exposure from 1.0 at center to 0.0 at perimeter
    const exposure = isDirect ? 1.0 : Math.max(0, 1 - dist / radius);
    if (exposure <= 0) continue;

    // 1. Health damage (smooth continuous falloff from 18 to 0 at perimeter)
    const rawDamage = Math.round(cfg.directDamage * exposure);

    // 2. Stamina drain (22 at blast center, scaled by exposure)
    const staminaDrain = Math.round(cfg.maxStaminaDrain * exposure);

    const guarded=frostGuardFaces(victim,point,projectile.velocity,isDirect,cfg.guardArcDeg);
    const healthBefore=victim.health;
    const contact={type:'bibyeFrostContact',ballistaId:projectile.ballistaId,projectileId:projectile.id,attackerId:projectile.ownerId,defenderId:victim.id,point,direct:Boolean(isDirect),exposure,at:nowSec};
    if(isDirect&&directParry){
      victim.parries=(victim.parries??0)+1;
      room.events?.push({...contact,outcome:'parry',damage:0,staminaDrain:0});
      continue;
    }
    if (guarded) {
      const chip=Math.round(rawDamage*cfg.guardedDamageScale);
      if(chip>0)applyDamage(room,projectile.ownerId,victim.id,chip,'bibye-conditioning',nowSec,null,{minDamage:Math.min(chip,cfg.edgeDamage*cfg.guardedDamageScale)});
      let broken=false;
      if (staminaDrain > 0) {
        victim.guardStamina = Math.max(0, victim.guardStamina - staminaDrain);
        victim.lastGuardDrainAt = nowSec;
        if (victim.guardStamina <= 0) {
          broken=true;breakGuard(victim,GAME.guardBreakStaggerMs/1000,nowSec);
          room.events?.push({ type: 'guardBreak', attackerId: projectile.ownerId, defenderId: victim.id, source:'bibye-conditioning', at: nowSec });
        }
      }

      // Edge chill for guarded target
      const chillCfg = cfg.chill;
      victim.chill = strongerChill(victim.chill, {
        slow: chillCfg.edgeSlow,
        startedAt: nowSec,
        until: nowSec + chillCfg.edgeDurationSec,
      }, nowSec);

      room.events?.push({
        type: 'bibyeFrostBlastAbsorbed',
        ballistaId: projectile.ballistaId,
        projectileId: projectile.id,
        victimId: victim.id,
        staminaDrain,
        at: nowSec,
      });
      room.events?.push({...contact,outcome:broken?'guardBreak':'block',damage:healthBefore-victim.health,staminaDrain});
    } else {
      // Unprotected target takes health damage
      if (rawDamage > 0) {
        applyDamage(room, projectile.ownerId, victim.id, rawDamage, 'bibye-conditioning', nowSec, null, {
          minDamage: projectile.proximityFrost&&!isDirect?0:cfg.edgeDamage,
        });
      }

      if (staminaDrain > 0) {
        victim.guardStamina = Math.max(0, victim.guardStamina - staminaDrain);
        victim.lastGuardDrainAt = nowSec;
      }

      // Fading chill scaled by exposure
      const chillCfg = cfg.chill;
      const slow = isDirect ? chillCfg.slow : chillCfg.edgeSlow + (chillCfg.slow - chillCfg.edgeSlow) * exposure;
      const duration = isDirect ? chillCfg.durationSec : chillCfg.edgeDurationSec + (chillCfg.durationSec - chillCfg.edgeDurationSec) * exposure;
      victim.chill = strongerChill(victim.chill, {
        slow,
        startedAt: nowSec,
        until: nowSec + duration,
      }, nowSec);

      room.events?.push({...contact,outcome:'hit',damage:healthBefore-victim.health,staminaDrain});
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
}

/**
 * Detonates the Main Siege Bolt shockwave.
 * Proximity-based damage and knockback, strictly excluding directly pierced victims.
 * Excludes friendly fire and self-damage.
 */
function detonateSiegeShockwave(room, projectile, point, excludedVictimIds, nowSec, world = null) {
  const cfg = BI_BYE_LLISTA_CONFIG.shotII.shockwave;
  const radius = cfg.radius;

  room.events?.push({
    type: 'bibyeSiegeShockwave',
    ballistaId: projectile.ballistaId,
    projectileId: projectile.id,
    point,
    radius,
    at: nowSec,
  });

  for (const victim of room.players.values()) {
    if (!victim.alive || excludedVictimIds.includes(victim.id)) continue;
    if (victim.id === projectile.ownerId) continue;
    if (areAllies(room, projectile.ownerId, victim.id)) continue;

    const targetCenter = { x: victim.position.x, y: victim.position.y + 0.9, z: victim.position.z };
    const dist = Math.hypot(targetCenter.x - point.x, targetCenter.y - point.y, targetCenter.z - point.z);
    if (dist > radius) continue;

    // Check line of sight occlusion by solid stone world geometry
    if (world?.solids) {
      let occluded = false;
      for (const solid of world.solids) {
        if (String(solid.id ?? '').startsWith('bibye-') || String(solid.id ?? '').startsWith('sofist-')) continue;
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
