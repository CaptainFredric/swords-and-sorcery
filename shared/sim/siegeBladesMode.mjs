import { TEAMS, areAllies, assignTeam } from '../src/teams.mjs';
import { createSoFistication, primeSoFistSkill, fireSoFistication } from './soFistication.mjs';
import {
  createBiByeLlista, toggleBiByeDeploy, fireBiByeMobile, fireBiByeFullVolley, biByeTargetAim,
} from './biByeLlista.mjs';
import { requestBiByeHeavySkill, setBiByeWeaponFocus } from './biByeWeapons.mjs';
import { createFightFlight } from './fightFlight.mjs';
import { requestFightFlightFire, flightMuzzle, flightRepeaterAim } from './fightFlightWeapons.mjs';
import { requestFightFlightSkill } from './fightFlightSkill.mjs';
import { requestFlightDash } from './fightFlightRun.mjs';
import { getFleetMachines, getMachineKind } from './fleetGeometry.mjs';
import { surfaceHeightAt, segmentAabbHit } from '../src/collision.mjs';
import { GAME_MODES } from '../src/modes.mjs';

export const SIEGE_BLADES_FORMATS = Object.freeze({
  MATCH: 'MATCH',
  ENDLESS: 'ENDLESS',
});

export const SIEGE_MACHINE_CLASSES = Object.freeze({
  RAM: 'so-fist-ication',
  BALLISTA: 'bi-bye-llista',
  FLIGHT: 'fight-and-flight',
});

export const SIEGE_BOT_DIFFICULTIES = Object.freeze({
  squire: Object.freeze({ reaction: 0.48, lead: 0.25, preferred: 16, error: 0.065 }),
  knight: Object.freeze({ reaction: 0.24, lead: 0.75, preferred: 18, error: 0.02 }),
  champion: Object.freeze({ reaction: 0.10, lead: 1.0, preferred: 20, error: 0 }),
});

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const dist3d = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
const bearing = (a, b) => Math.atan2(-(b.x - a.x), -(b.z - a.z));
const difference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

function blocked(room, a, b) {
  const solids = room.world?.solids ?? [];
  return solids.some(s => segmentAabbHit([a.x, a.y + 1.45, a.z], [b.x, b.y + 1.05, b.z], s));
}

function predicted(from, target, speed, tuning, delay = 0) {
  const v = target.velocity ?? {};
  const t = clamp(dist(from, target.position) / speed + delay, 0, 3) * (tuning.lead ?? 0.5);
  return {
    x: target.position.x + (v.x ?? 0) * t,
    y: target.position.y + (v.y ?? 0) * t,
    z: target.position.z + (v.z ?? 0) * t,
  };
}

function aimInput(from, target, ai, tuning, speed = 48) {
  const point = predicted(from, target, speed, tuning);
  const error = Math.sin((ai.decisions ?? 0) * 2.71 + (ai.seed ?? 1)) * (tuning.error ?? 0);
  const yaw = bearing(from, point) + error;
  return {
    point,
    yaw,
    pitch: Math.atan2(point.y + 1.0 - (from.y + 1.5), dist(from, point)) + error * 0.5,
  };
}

function drive(room, m, target, ai, tuning, { ideal = 10, deadZone = 2, reverse = true } = {}) {
  const point = predicted({ x: m.x, y: m.y, z: m.z }, target.position ? target : { position: target, velocity: {} }, 36, tuning);
  const at = { x: m.x, y: m.y, z: m.z };
  const d = dist(at, point);
  const yaw = bearing(at, point);
  const err = difference(yaw, m.heading);
  let forward = d > ideal + deadZone ? 1 : d < ideal - deadZone && reverse ? -0.7 : 0;
  if (Math.abs(err) > 1.4 && forward > 0) forward = 0.4;
  let right = clamp(-err * 1.25, -1, 1);
  const look = 4.2;
  const front = { x: at.x - Math.sin(m.heading) * look, y: at.y, z: at.z - Math.cos(m.heading) * look };
  if (forward > 0 && blocked(room, at, front)) {
    right = ai.side ?? 1;
    forward = 0.45;
  }
  if (ai.stuckUntil > 0 && ai.stuckUntil > (ai.now ?? 0)) {
    right = ai.side ?? 1;
    forward = -0.65;
  }
  const moved = dist(at, ai.lastPosition ?? at);
  if ((ai.now ?? 0) - (ai.lastSampleAt ?? ai.now ?? 0) > 1.8) {
    if (forward > 0.3 && moved < 0.35) {
      ai.side = -(ai.side ?? 1);
      ai.stuckUntil = (ai.now ?? 0) + 1.3;
    }
    ai.lastPosition = { ...at };
    ai.lastSampleAt = ai.now ?? 0;
  }
  return { forward, right, err, d };
}

/**
 * Creates and initializes the authoritative Siege Blades state.
 */
export function createSiegeBladesState(room, options = {}) {
  const settings = { ...(room.siegeBladesSettings ?? {}), ...options };
  const format = settings.format ?? (settings.practice || settings.isBotMatch ? SIEGE_BLADES_FORMATS.ENDLESS : SIEGE_BLADES_FORMATS.MATCH);
  const matchRounds = settings.matchRounds ?? (settings.scoreToWin ? settings.scoreToWin * 2 - 1 : 3);
  const roundsToWin = Math.ceil(matchRounds / 2);
  const endlessRoundCap = settings.endlessRoundCap ?? 0;
  const teamSize = settings.teamSize ?? (room.policy?.teamSize ?? 1);
  const botDifficulty = settings.botDifficulty ?? (room.botSkill ?? 'knight');
  const machineSelection = settings.machineSelection ?? 'random';
  const clashStarts = settings.clashStarts ?? null;

  return {
    format,
    matchRounds,
    roundsToWin,
    endlessRoundCap,
    teamSize,
    botDifficulty,
    machineSelection,
    clashStarts,

    roundNumber: 1,
    roundStartedAt: 0,
    scores: {
      [TEAMS.ATTACKERS]: 0,
      [TEAMS.DEFENDERS]: 0,
    },
    roundWinner: null,
    roundResetCountdown: null,
    matchFinished: false,
    matchWinner: null,

    overtimeActive: false,
    overtimeHoldRequired: 12.0,
    zone: {
      center: { x: 0, y: 0, z: 0 },
      radius: 14.0,
      controllingTeam: null,
      holdSec: 0,
      contested: false,
      altitudeLimit: 4.0,
    },

    eliminated: new Map(),
    spawnAssignments: new Map(),
    clashActiveThisRound: false,
  };
}

export function getSiegeBladesSpawns(worldId, clash = false) {
  if (clash) {
    if (worldId === 'blackbell-foundry') {
      return {
        [TEAMS.ATTACKERS]: [{ x: 0, y: 0, z: -11, yaw: Math.PI }],
        [TEAMS.DEFENDERS]: [{ x: 0, y: 0, z: 11, yaw: 0 }],
      };
    }
    if (worldId === 'outerworks') {
      return {
        [TEAMS.ATTACKERS]: [{ x: 0, y: 0, z: -22, yaw: Math.PI }],
        [TEAMS.DEFENDERS]: [{ x: 0, y: 0, z: 2, yaw: 0 }],
      };
    }
    // high-grounds (and default)
    return {
      [TEAMS.ATTACKERS]: [{ x: 0, y: 0, z: -12, yaw: Math.PI }],
      [TEAMS.DEFENDERS]: [{ x: 0, y: 0, z: 12, yaw: 0 }],
    };
  }

  // Normal mirrored team spawns
  if (worldId === 'blackbell-foundry') {
    return {
      [TEAMS.ATTACKERS]: [
        { x: -4, y: 0, z: -26, yaw: Math.PI },
        { x: 0, y: 0, z: -28, yaw: Math.PI },
        { x: 4, y: 0, z: -26, yaw: Math.PI },
      ],
      [TEAMS.DEFENDERS]: [
        { x: -4, y: 0, z: 18, yaw: 0 },
        { x: 0, y: 0, z: 20, yaw: 0 },
        { x: 4, y: 0, z: 18, yaw: 0 },
      ],
    };
  }
  if (worldId === 'outerworks') {
    return {
      [TEAMS.ATTACKERS]: [
        { x: -4, y: 0, z: -40, yaw: Math.PI },
        { x: 0, y: 0, z: -42, yaw: Math.PI },
        { x: 4, y: 0, z: -40, yaw: Math.PI },
      ],
      [TEAMS.DEFENDERS]: [
        { x: -4, y: 0, z: 12, yaw: 0 },
        { x: 0, y: 0, z: 14, yaw: 0 },
        { x: 4, y: 0, z: 12, yaw: 0 },
      ],
    };
  }
  // high-grounds default
  return {
    [TEAMS.ATTACKERS]: [
      { x: -4, y: 0, z: -38, yaw: Math.PI },
      { x: 0, y: 0, z: -42, yaw: Math.PI },
      { x: 4, y: 0, z: -38, yaw: Math.PI },
    ],
    [TEAMS.DEFENDERS]: [
      { x: -4, y: 0, z: 38, yaw: 0 },
      { x: 0, y: 0, z: 42, yaw: 0 },
      { x: 4, y: 0, z: 38, yaw: 0 },
    ],
  };
}

export function provisionSiegeBladesFleet(room, nowSec) {
  const state = room.siegeBlades;
  if (!state) return;

  room.resetFleet(nowSec);
  state.spawnAssignments.clear();

  // Determine Clash Start eligibility:
  // 12% probability in 1v1 Endless only, or forced via state.clashStarts
  const is1v1Endless = state.format === SIEGE_BLADES_FORMATS.ENDLESS && state.teamSize === 1;
  const triggerClash = state.clashStarts !== null ? state.clashStarts : (is1v1Endless && Math.random() < 0.12);
  state.clashActiveThisRound = triggerClash;

  const spawns = getSiegeBladesSpawns(room.worldId ?? 'high-grounds', triggerClash);
  const teamIndices = { [TEAMS.ATTACKERS]: 0, [TEAMS.DEFENDERS]: 0 };

  const machineTypes = [
    SIEGE_MACHINE_CLASSES.RAM,
    SIEGE_MACHINE_CLASSES.BALLISTA,
    SIEGE_MACHINE_CLASSES.FLIGHT,
  ];

  for (const player of room.players.values()) {
    if (!player.team) {
      player.team = assignTeam(room, null, player.actorKind === 'human');
    }
    const team = player.team;
    const teamList = spawns[team] ?? spawns[TEAMS.ATTACKERS];
    const spawnIndex = teamIndices[team] % teamList.length;
    teamIndices[team]++;
    const spawnPoint = teamList[spawnIndex];

    const NORM_CLASS = {
      'so-fist-ication': SIEGE_MACHINE_CLASSES.RAM,
      'ram': SIEGE_MACHINE_CLASSES.RAM,
      'bi-bye-llista': SIEGE_MACHINE_CLASSES.BALLISTA,
      'ballista': SIEGE_MACHINE_CLASSES.BALLISTA,
      'fight-and-flight': SIEGE_MACHINE_CLASSES.FLIGHT,
      'flight': SIEGE_MACHINE_CLASSES.FLIGHT,
    };
    let chosenClass = NORM_CLASS[state.machineSelection] ?? (Object.values(SIEGE_MACHINE_CLASSES).includes(state.machineSelection) ? state.machineSelection : null);
    if (!chosenClass) {
      const pref = NORM_CLASS[player.preferredSiegeMachine] ?? player.preferredSiegeMachine;
      if (pref && Object.values(SIEGE_MACHINE_CLASSES).includes(pref)) {
        chosenClass = pref;
      } else {
        chosenClass = machineTypes[spawnIndex % machineTypes.length];
      }
    }

    const machineId = `sb-${player.id}-r${state.roundNumber}`;
    let machine = null;

    if (chosenClass === SIEGE_MACHINE_CLASSES.BALLISTA) {
      machine = createBiByeLlista({
        id: machineId,
        x: spawnPoint.x,
        y: spawnPoint.y,
        z: spawnPoint.z,
        heading: spawnPoint.yaw,
        baseYaw: spawnPoint.yaw,
        team,
      });
      player.operatingBallistaId = machine.id;
    } else if (chosenClass === SIEGE_MACHINE_CLASSES.FLIGHT) {
      machine = createFightFlight({
        id: machineId,
        x: spawnPoint.x,
        y: spawnPoint.y,
        z: spawnPoint.z,
        heading: spawnPoint.yaw,
        team,
      });
      player.operatingFightFlightId = machine.id;
    } else {
      machine = createSoFistication({
        id: machineId,
        position: { x: spawnPoint.x, y: spawnPoint.y, z: spawnPoint.z },
        heading: spawnPoint.yaw,
        team,
      });
      machine.x = spawnPoint.x;
      machine.y = spawnPoint.y;
      machine.z = spawnPoint.z;
      player.operatingRamId = machine.id;
    }

    machine.operatorId = player.id;
    room.addMachine(machine);

    player.alive = true;
    player.health = 100;
    player.stamina = 100;
    player.position = { x: spawnPoint.x, y: spawnPoint.y, z: spawnPoint.z };
    player.yaw = spawnPoint.yaw;
    player.pitch = 0;
    player.spawnProtectionUntil = nowSec + (triggerClash ? 1.0 : 2.5);

    state.spawnAssignments.set(player.id, {
      machineId: machine.id,
      machineType: chosenClass,
      spawnPoint,
    });

    if (player.actorKind === 'bot') {
      player.siegeAi = {
        seed: Math.random() * 100,
        decisions: 0,
        side: Math.random() < 0.5 ? 1 : -1,
        stuckUntil: 0,
        lastPosition: { ...spawnPoint },
        lastSampleAt: nowSec,
        nextRamAt: 0,
        lastVolleyAt: 0,
        lastShotIAt: 0,
        now: nowSec,
      };
    }
  }

  room.events?.push({
    type: 'siegeBladesRoundStarted',
    roundNumber: state.roundNumber,
    clash: state.clashActiveThisRound,
    format: state.format,
    at: nowSec,
  });
}

function handleRoundWin(room, winningTeam, nowSec, reason = 'elimination') {
  const state = room.siegeBlades;
  if (!state || state.roundWinner) return;

  state.roundWinner = winningTeam;
  state.scores[winningTeam] = (state.scores[winningTeam] ?? 0) + 1;

  room.events?.push({
    type: 'siegeBladesRoundWon',
    winnerTeam: winningTeam,
    scores: { ...state.scores },
    roundNumber: state.roundNumber,
    reason,
    at: nowSec,
  });

  if (state.format === SIEGE_BLADES_FORMATS.MATCH) {
    if (state.scores[winningTeam] >= state.roundsToWin) {
      state.matchFinished = true;
      state.matchWinner = winningTeam;
      room.finish(winningTeam, nowSec, 'siege-blades-victory');
      return;
    }
    // Match format: short 3.5s transition to next round
    state.roundResetCountdown = 3.5;
  } else {
    // Endless format: automatic 6-second reset countdown
    if (state.endlessRoundCap > 0 && state.roundNumber >= state.endlessRoundCap) {
      state.matchFinished = true;
      state.matchWinner = winningTeam;
      room.finish(winningTeam, nowSec, 'siege-blades-endless-complete');
      return;
    }
    state.roundResetCountdown = 6.0;
  }
}

export function resetSiegeBladesRound(room, nowSec) {
  const state = room.siegeBlades;
  if (!state) return;

  state.roundNumber += 1;
  state.roundStartedAt = nowSec;
  state.roundWinner = null;
  state.roundResetCountdown = null;
  state.overtimeActive = false;
  state.zone.controllingTeam = null;
  state.zone.holdSec = 0;
  state.zone.contested = false;
  state.eliminated.clear();

  provisionSiegeBladesFleet(room, nowSec);
}

function stepSiegeBladesBots(room, nowSec) {
  const state = room.siegeBlades;
  if (!state || state.roundResetCountdown > 0) return;

  const tuning = SIEGE_BOT_DIFFICULTIES[state.botDifficulty] ?? SIEGE_BOT_DIFFICULTIES.knight;

  for (const bot of room.players.values()) {
    if (bot.actorKind !== 'bot' || !bot.alive || state.eliminated.has(bot.id)) continue;
    const m = room.getMachineForPlayer(bot.id);
    if (!m || m.health <= 0 || m.retired || m.mode === 'DESTROYED') continue;

    const enemies = [...room.players.values()].filter(
      p => p.alive && !state.eliminated.has(p.id) && !areAllies(room, bot.id, p.id)
    );
    if (!enemies.length) continue;

    enemies.sort((a, b) => dist(bot.position, a.position) - dist(bot.position, b.position));
    const target = enemies[0];
    const ai = bot.siegeAi ?? { seed: 1, decisions: 0, side: 1, stuckUntil: 0, now: nowSec };
    ai.now = nowSec;
    ai.decisions++;

    const kind = getMachineKind(m);
    if (kind === 'ram') {
      stepUppercuff(room, bot, m, target, ai, tuning, nowSec);
    } else if (kind === 'ballista') {
      stepBallistefan(room, bot, m, target, ai, tuning, nowSec);
    } else if (kind === 'flight') {
      stepDonte(room, bot, m, target, ai, tuning, nowSec);
    }
  }
}

function stepUppercuff(room, a, m, target, ai, tuning, now) {
  const at = { x: m.x, z: m.z };
  const d = dist(at, target.position);
  const approach = drive(room, m, target, ai, tuning, { ideal: 2.8, deadZone: 1.2, reverse: true });

  if (m.strikeAt != null && now - m.strikeAt < 1.1) {
    approach.forward = 0.82;
    approach.right = clamp(-approach.err * 0.42, -0.5, 0.5);
  } else if (d < 3.8) {
    approach.forward = -0.8;
    approach.right = clamp(-approach.err * 0.5, -1, 1);
  }
  const forwardFacing = Math.abs(approach.err) < 0.5;
  a.input = {
    ...a.input,
    forward: approach.forward,
    right: approach.right,
    sprint: forwardFacing && d > 5 && d < 22 && m.pressure > 28 && (m.components?.Drive?.health ?? 1) > 0,
    yaw: m.heading,
    pitch: 0,
  };

  const visibleThreat = Boolean(target.attackActive || target.pendingSpell || (target.dashUntil ?? -Infinity) > now);
  if (forwardFacing && d < 11 && visibleThreat && m.skill?.phase === 'idle' && (m.components?.Fist?.health ?? 1) > 0) {
    primeSoFistSkill(room, m, a, now);
  }
  if (forwardFacing && d >= 2.1 && d < 6.2 && now >= (ai.nextRamAt ?? 0) && (m.strikeAt == null || now - m.strikeAt >= 3.95)) {
    if (fireSoFistication(room, m, now)) ai.nextRamAt = now + 3.95;
  }
}

function stepBallistefan(room, a, m, target, ai, tuning, now) {
  const at = { x: m.x, y: m.y, z: m.z };
  const d = dist(at, target.position);
  const los = !blocked(room, at, target.position);
  const desired = aimInput(at, target, ai, tuning, 48);

  if (m.mode === 'MOBILE') {
    const wheel = drive(room, m, target, ai, tuning, { ideal: tuning.preferred ?? 18, deadZone: 3 });
    a.input = {
      ...a.input,
      ...wheel,
      yaw: desired.yaw,
      pitch: desired.pitch,
      siegeTarget: { ...desired.point, y: desired.point.y + 1.15 },
    };
    if (d > 9 && d < 42 && Math.abs(wheel.err) < 0.4 && los && Math.abs(m.speed ?? 0) < 0.3) {
      toggleBiByeDeploy(m, now, room.world);
    }
  } else {
    a.input = {
      ...a.input,
      forward: 0,
      right: 0,
      sprint: false,
      yaw: desired.yaw,
      pitch: desired.pitch,
      siegeTarget: { ...desired.point, y: desired.point.y + 1.15 },
    };
    if (m.mode === 'DEPLOYED' && (!los || d < 7 || d > 47)) {
      toggleBiByeDeploy(m, now, room.world);
    }
  }

  if (!los || m.mode === 'DESTROYED' || m.mode === 'DEPLOYING' || m.mode === 'RETRACTING') return;
  const isAligned = Math.abs(difference(desired.yaw, m.mainYaw ?? m.heading)) < 0.2;

  if (m.mode === 'DEPLOYED' && m.mainBoltLoaded && m.skill?.phase === 'idle' && isAligned && (m.pendingVolley || (!(ai.lastVolleyAt ?? 0) && d < 17))) {
    setBiByeWeaponFocus(m, 'MAIN', now);
    if (fireBiByeFullVolley(room, m, now)) ai.lastVolleyAt = now;
    return;
  }

  if (m.mainBoltLoaded && m.skill?.phase === 'idle' && d < 55 && isAligned) {
    requestBiByeHeavySkill(room, m, a, now, biByeTargetAim);
  }
  if (m.skill?.phase === 'primed') {
    if (now >= (m.smallBoltReadyAt ?? 0) && m.mobileShotPendingAt == null && !m.pendingIndependent) {
      setBiByeWeaponFocus(m, 'UPPER', now);
      if (fireBiByeMobile(room, m, now)) ai.lastShotIAt = now;
    }
    if (now - (ai.lastShotIAt ?? 0) > 0.26 && isAligned && m.mainBoltLoaded && m.mobileShotPendingAt == null && now >= (m.mainSkillUntil ?? 0)) {
      requestBiByeHeavySkill(room, m, a, now, biByeTargetAim);
    }
  } else if (now >= (m.smallBoltReadyAt ?? 0) && m.mobileShotPendingAt == null && m.skill?.phase === 'idle' && Math.abs(difference(desired.yaw, m.upperYaw ?? m.heading)) < 0.25) {
    setBiByeWeaponFocus(m, 'UPPER', now);
    if (fireBiByeMobile(room, m, now)) ai.lastShotIAt = now;
  }
}

function stepDonte(room, a, m, target, ai, tuning, now) {
  const at = { x: m.x, y: m.y, z: m.z };
  const d = dist(at, target.position);
  const aim = aimInput(at, target, ai, tuning, 64);
  const charge = m.flightCharge ?? 0;

  const shootingAltitude = clamp(d * 0.28, 1.6, 5.4);
  const desiredHeight = target.position.y + shootingAltitude;
  const heading = bearing(at, aim.point);

  const impact = { ...aim.point, y: aim.point.y + 1.1 };
  let fireYaw = heading;
  let firePitch = 0;
  for (let iter = 0; iter < 3; iter++) {
    const legal = flightRepeaterAim(m, { yaw: fireYaw, pitch: firePitch });
    const muzzle = flightMuzzle(m, legal);
    fireYaw = bearing(muzzle, impact);
    firePitch = Math.atan2(impact.y - muzzle.y, Math.max(0.1, Math.hypot(impact.x - muzzle.x, impact.z - muzzle.z)));
  }

  const climb = m.grounded ? charge > 22 : charge > 18 && m.y < desiredHeight - 0.8;
  const descend = !m.grounded && (m.y > desiredHeight + 1.5 || charge < 17);
  const advance = d > 5 ? 1 : d < 2.1 ? -0.6 : 0.45;
  const flank = d < 13 ? (ai.side ?? 1) * 0.4 : 0;

  a.input = {
    ...a.input,
    forward: advance,
    right: flank,
    yaw: fireYaw,
    pitch: clamp(firePitch, -1.45, 1.45),
    jump: climb,
    crouch: descend,
    sprint: false,
  };

  if ((m.ammo ?? 0) < 4 && m.skill?.phase === 'idle' && d < 32) {
    requestFightFlightSkill(room, m, a, now);
  }
  requestFightFlightFire(room, m, a, d < 42 && !blocked(room, at, target.position), now);
}

/**
 * Main authoritative step for Siege Blades mode.
 */
export function stepSiegeBlades(room, dt, nowSec) {
  const state = room.siegeBlades;
  if (!state || room.state !== 'PLAYING') return;

  if (state.matchFinished) return;

  // Handle between-round countdown in Endless or Match format
  if (state.roundResetCountdown !== null) {
    state.roundResetCountdown -= dt;
    if (state.roundResetCountdown <= 0) {
      state.roundResetCountdown = null;
      resetSiegeBladesRound(room, nowSec);
    }
    return;
  }

  if (state.roundWinner) return;

  // Elimination Rule:
  // Operator death OR assigned machine destruction = exactly ONE elimination.
  // Non-hull component destruction cripples abilities but does not eliminate.
  for (const player of room.players.values()) {
    if (state.eliminated.has(player.id)) continue;

    let shouldEliminate = false;
    let reason = 'operator_death';

    if (!player.alive || player.health <= 0) {
      shouldEliminate = true;
      reason = 'operator_death';
    } else {
      const assignment = state.spawnAssignments.get(player.id);
      const m = room.getMachineForPlayer(player.id) || (assignment?.machineId ? room.getMachine(assignment.machineId) : null);
      if (!m || m.health <= 0 || m.retired || m.mode === 'DESTROYED') {
        shouldEliminate = true;
        reason = 'machine_destroyed';
      }
    }

    if (shouldEliminate) {
      state.eliminated.set(player.id, { at: nowSec, team: player.team, reason });
      room.dismountPlayerFromMachines(player, nowSec, false);
      player.alive = false;
      player.health = 0;

      room.events?.push({
        type: 'siegeBladesElimination',
        playerId: player.id,
        team: player.team,
        roundNumber: state.roundNumber,
        reason,
        at: nowSec,
      });
    }
  }

  // Check living team survivors
  const azureAlive = [...room.players.values()].filter(
    p => p.team === TEAMS.ATTACKERS && !state.eliminated.has(p.id)
  ).length;
  const crimsonAlive = [...room.players.values()].filter(
    p => p.team === TEAMS.DEFENDERS && !state.eliminated.has(p.id)
  ).length;

  if (azureAlive === 0 && crimsonAlive > 0) {
    handleRoundWin(room, TEAMS.DEFENDERS, nowSec, 'elimination');
    return;
  }
  if (crimsonAlive === 0 && azureAlive > 0) {
    handleRoundWin(room, TEAMS.ATTACKERS, nowSec, 'elimination');
    return;
  }
  if (azureAlive === 0 && crimsonAlive === 0 && room.players.size > 0) {
    handleRoundWin(room, null, nowSec, 'mutual_elimination');
    return;
  }

  // Overtime Engagement Zone (Match format only, activates at 180s)
  if (state.format === SIEGE_BLADES_FORMATS.MATCH && nowSec - state.roundStartedAt >= 180) {
    if (!state.overtimeActive) {
      state.overtimeActive = true;
      room.events?.push({
        type: 'siegeBladesOvertimeStarted',
        center: state.zone.center,
        radius: state.zone.radius,
        at: nowSec,
      });
    }

    let azureInZone = false;
    let crimsonInZone = false;

    for (const p of room.players.values()) {
      if (!p.alive || state.eliminated.has(p.id)) continue;
      const m = room.getMachineForPlayer(p.id);
      const pos = m ? { x: m.x, y: m.y, z: m.z } : p.position;
      const d = dist(pos, state.zone.center);

      if (d <= state.zone.radius) {
        let validContest = true;
        if (m && getMachineKind(m) === 'flight') {
          const groundY = surfaceHeightAt(m.x, m.z, m.y, room.world) ?? 0;
          const altitude = m.y - groundY;
          // Flight must be within altitudeLimit (4.0m) to count as contesting
          validContest = altitude <= state.zone.altitudeLimit;
        }
        if (validContest) {
          if (p.team === TEAMS.ATTACKERS) azureInZone = true;
          else if (p.team === TEAMS.DEFENDERS) crimsonInZone = true;
        }
      }
    }

    if (azureInZone && !crimsonInZone) {
      if (state.zone.controllingTeam !== TEAMS.ATTACKERS) {
        state.zone.controllingTeam = TEAMS.ATTACKERS;
        state.zone.holdSec = 0;
      }
      state.zone.holdSec += dt;
      state.zone.contested = false;
      if (state.zone.holdSec >= state.overtimeHoldRequired) {
        handleRoundWin(room, TEAMS.ATTACKERS, nowSec, 'overtime_hold');
        return;
      }
    } else if (crimsonInZone && !azureInZone) {
      if (state.zone.controllingTeam !== TEAMS.DEFENDERS) {
        state.zone.controllingTeam = TEAMS.DEFENDERS;
        state.zone.holdSec = 0;
      }
      state.zone.holdSec += dt;
      state.zone.contested = false;
      if (state.zone.holdSec >= state.overtimeHoldRequired) {
        handleRoundWin(room, TEAMS.DEFENDERS, nowSec, 'overtime_hold');
        return;
      }
    } else if (azureInZone && crimsonInZone) {
      state.zone.contested = true;
    } else {
      state.zone.contested = false;
    }
  }

  // Authoritative Bot Controllers
  stepSiegeBladesBots(room, nowSec);
}

export const SIEGE_BLADES_HANDLER = Object.freeze({
  ownsTeamObjectives: () => true,
  init: (room) => {
    room.siegeBlades = createSiegeBladesState(room);
  },
  reset: (room, nowSec) => {
    room.siegeBlades = createSiegeBladesState(room);
    room.siegeBlades.roundStartedAt = nowSec;
    provisionSiegeBladesFleet(room, nowSec);
  },
  step: (room, dt, nowSec) => {
    stepSiegeBlades(room, dt, nowSec);
  },
  spawn: (room, player, spawns) => {
    const assignment = room.siegeBlades?.spawnAssignments?.get(player.id);
    if (assignment?.spawnPoint) return [assignment.spawnPoint];
    return spawns.filter(p => p.team === player.team);
  },
  serialize: (room, nowSec) => {
    const s = room.siegeBlades;
    if (!s) return null;
    return {
      format: s.format,
      roundNumber: s.roundNumber,
      scores: { ...s.scores },
      roundsToWin: s.roundsToWin,
      roundWinner: s.roundWinner,
      roundResetCountdown: s.roundResetCountdown != null ? Math.max(0, s.roundResetCountdown) : null,
      overtimeActive: s.overtimeActive,
      clashActive: s.clashActiveThisRound,
      zone: s.overtimeActive ? {
        center: { ...s.zone.center },
        radius: s.zone.radius,
        controllingTeam: s.zone.controllingTeam,
        holdSec: s.zone.holdSec,
        contested: s.zone.contested,
        holdPercent: Math.min(100, Math.round((s.zone.holdSec / s.overtimeHoldRequired) * 100)),
      } : null,
      eliminated: [...s.eliminated.entries()].map(([id, info]) => ({ id, ...info })),
      matchFinished: s.matchFinished,
      matchWinner: s.matchWinner,
    };
  },
});
