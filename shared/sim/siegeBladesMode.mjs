import { TEAMS, areAllies, assignTeam } from '../src/teams.mjs';
import { createSoFistication, primeSoFistSkill, fireSoFistication, flickSoFistication, shuntSoFistication } from './soFistication.mjs';
import {
  createBiByeLlista, toggleBiByeDeploy, fireBiByeMobile, fireBiByeFullVolley, biByeTargetAim,
} from './biByeLlista.mjs';
import {
  requestBiByeHeavySkill, setBiByeWeaponFocus, requestColdHowTouching,
} from './biByeWeapons.mjs';
import {
  requestBiByeSharpTurn, requestLookAroundAndFindOut, requestBiByeSweepStop,
} from './biByeSweep.mjs';
import { createFightFlight } from './fightFlight.mjs';
import { requestFightFlightFire, flightMuzzle, flightRepeaterAim, FLIGHT_REPEATER } from './fightFlightWeapons.mjs';
import { requestFightFlightSkill, endFightFlightSkill } from './fightFlightSkill.mjs';
import { requestFlightDash } from './fightFlightRun.mjs';
import { setFlightUltimateHold } from './fightFlightTerminal.mjs';
import { getFleetMachines, getMachineKind } from './fleetGeometry.mjs';
import { surfaceHeightAt, segmentAabbHit } from '../src/collision.mjs';
import { GAME_MODES } from '../src/modes.mjs';
import { normalizeSiegeLoadout, selectedSiegeSkill } from '../src/siegeLoadout.mjs';
import { beginAttack, endAttack } from './combat.mjs';
import { considerOperatorSteel } from './practiceSiegeOperators.mjs';

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
  squire: Object.freeze({ reaction: 0.48, lead: 0.25, preferred: 16, error: 0.065, burst: 3 }),
  knight: Object.freeze({ reaction: 0.24, lead: 0.75, preferred: 18, error: 0.02, burst: 5 }),
  champion: Object.freeze({ reaction: 0.10, lead: 1.0, preferred: 20, error: 0, burst: 7 }),
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
  const leadScale = tuning.lead ?? 0.5;
  const maxLead = 0.85 * leadScale + 0.15;
  const t = Math.min(maxLead, clamp(dist(from, target.position) / speed + delay, 0, 2.2) * leadScale);
  return {
    x: target.position.x + (v.x ?? 0) * t,
    y: target.position.y + clamp((v.y ?? 0) * t * 0.65, -2.5, 2.5),
    z: target.position.z + (v.z ?? 0) * t,
  };
}

function aimInput(from, target, ai, tuning, speed = 48, targetHeight = 1.0) {
  const point = predicted(from, target, speed, tuning);
  const error = Math.sin((ai.decisions ?? 0) * 2.71 + (ai.seed ?? 1)) * (tuning.error ?? 0);
  const yaw = bearing(from, point) + error;
  return {
    point,
    yaw,
    pitch: Math.atan2(point.y + targetHeight - (from.y + 1.5), Math.max(0.5, dist(from, point))) + error * 0.5,
  };
}

function drive(room, m, target, ai, tuning, { ideal = 10, deadZone = 2, reverse = true, checkBlocked = true } = {}) {
  const point = predicted({ x: m.x, y: m.y, z: m.z }, target.position ? target : { position: target, velocity: {} }, 36, tuning);
  const at = { x: m.x, y: m.y, z: m.z };
  const d = dist(at, point);
  const yaw = bearing(at, point);
  const err = difference(yaw, m.heading);
  let forward = d > ideal + deadZone ? 1 : d < ideal - deadZone && reverse ? -0.7 : 0;
  if (Math.abs(err) > 1.4 && forward > 0) forward = 0.4;
  let right = clamp(-err * 1.25, -1, 1);
  if (checkBlocked) {
    const look = 4.2;
    const front = { x: at.x - Math.sin(m.heading) * look, y: at.y, z: at.z - Math.cos(m.heading) * look };
    ai.frontBlocked = forward > 0 && blocked(room, at, front);
  }
  if (forward > 0 && ai.frontBlocked) {
    right = ai.side ?? 1;
    forward = 0.45;
  }
  if (ai.stuckUntil > 0 && ai.stuckUntil > (ai.now ?? 0)) {
    right = ai.side ?? 1;
    forward = -0.65;
  }
  const moved = dist(at, ai.lastPosition ?? at);
  if ((ai.now ?? 0) - (ai.lastSampleAt ?? ai.now ?? 0) > 1.5) {
    if (forward > 0.3 && moved < 0.4) {
      ai.side = -(ai.side ?? 1);
      ai.stuckUntil = (ai.now ?? 0) + 1.2;
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
  // MATCH is a fixed number of completed rounds, not best-of-N.
  const proposedRounds = Number(settings.matchRounds ?? 3);
  const matchRounds = Number.isInteger(proposedRounds) && proposedRounds >= 1 && proposedRounds <= 99 ? proposedRounds : 3;
  const endlessRoundCap = settings.endlessRoundCap ?? 0;
  const teamSize = settings.teamSize ?? (room.policy?.teamSize ?? 1);
  const botDifficulty = settings.botDifficulty ?? (room.botSkill ?? 'knight');
  const machineSelection = settings.machineSelection ?? 'random';
  const clashStarts = settings.clashStarts ?? null;

  const initialRadius = room.worldId === 'outerworks' ? 24.0 : room.worldId === 'blackbell-foundry' ? 26.0 : room.worldId === 'high-grounds' ? 28.0 : 26.0;
  return {
    format,
    matchRounds,
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
    selectionEndsAt: null,
    selectionChoices: new Map(),
    matchFinished: false,
    matchWinner: null,

    overtimeActive: false,
    overtimeStartedAt: null,
    overtimeHoldRequired: 20.0,
    zone: {
      center: { x: 0, y: 0, z: 0 },
      centerY: surfaceHeightAt(0, 0, 2.5, room.world) ?? 0,
      initialRadius,
      radius: initialRadius,
      controllingTeam: null,
      holdSec: 0,
      contested: false,
      initialAltitudeLimit: 4.0,
      altitudeLimit: 4.0,
    },

    eliminated: new Map(),
    spawnAssignments: new Map(),
    clashActiveThisRound: false,
  };
}

export const SIEGE_SELECTION_SECONDS = 6;
// After the first round each player's last machine is already chosen for them, so the draft is a chance to change it,
// not a first decision: five seconds is ample for a key or a tap, and the battle resumes sooner.
export const SIEGE_RESELECTION_SECONDS = 5;
export const siegeSelectionSeconds = (roundNumber) => (roundNumber > 1 ? SIEGE_RESELECTION_SECONDS : SIEGE_SELECTION_SECONDS);
const VALID_MACHINE_CLASSES = new Set(Object.values(SIEGE_MACHINE_CLASSES));

/** Server-owned selection phase before EVERY round, including the first. */
export function beginSiegeBladesSelection(room, nowSec) {
  const state = room.siegeBlades;
  if (!state) return false;
  state.selectionEndsAt = nowSec + siegeSelectionSeconds(state.roundNumber);
  state.selectionChoices = new Map();
  room.resetFleet(nowSec);
  state.spawnAssignments.clear();
  for (const player of room.players.values()) {
    player.operatingRamId = null;
    player.operatingBallistaId = null;
    player.operatingFightFlightId = null;
    player.input = { forward: 0, right: 0, jump: false, sprint: false, yaw: player.yaw ?? 0, pitch: 0 };
    const previous = player.preferredSiegeMachine;
    const configured = state.machineSelection;
    const suggestion = VALID_MACHINE_CLASSES.has(previous) ? previous
      : player.actorKind === 'human' && VALID_MACHINE_CLASSES.has(configured) ? configured : null;
    if (suggestion && player.actorKind === 'human') state.selectionChoices.set(player.id, suggestion);
  }
  room.events?.push({ type: 'siegeBladesSelectionStarted', roundNumber: state.roundNumber,
    endsAt: state.selectionEndsAt, at: nowSec });
  return true;
}

/** Human choice is authoritative, validated and mutable until the timer ends. */
export function selectSiegeBladesMachine(room, player, machine, nowSec) {
  const s = room.siegeBlades;
  if (!s || room.state !== 'PLAYING' || s.matchFinished ||
    s.selectionEndsAt === null || nowSec >= s.selectionEndsAt ||
    !player || player.actorKind !== 'human' || !s.selectionChoices ||
    !VALID_MACHINE_CLASSES.has(machine)) return false;
  s.selectionChoices.set(player.id, machine);
  player.preferredSiegeMachine = machine;
  return true;
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
  // 12% probability in casual 1v1 Endless mode only (when enabled; 0% in Match format)
  const is1v1Endless = state.format === SIEGE_BLADES_FORMATS.ENDLESS && state.teamSize === 1;
  const clashEnabled = state.clashStarts !== false;
  const triggerClash = is1v1Endless && clashEnabled && (Boolean(state.forceClash) || Math.random() < 0.12);
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
    const choice = state.selectionChoices?.get(player.id);
    const pref = player.preferredSiegeMachine;
    let chosenClass = NORM_CLASS[choice] ?? (VALID_MACHINE_CLASSES.has(choice) ? choice : null);
    if (!chosenClass) chosenClass = NORM_CLASS[pref] ?? (VALID_MACHINE_CLASSES.has(pref) ? pref : null);
    if (!chosenClass && player.actorKind === 'human') {
      const initial = state.machineSelection;
      chosenClass = NORM_CLASS[initial] ?? (VALID_MACHINE_CLASSES.has(initial) ? initial : null);
    }
    // Bots without a forced preference rotate their machinery across rounds,
    // rather than always picking the same class from one spawn index.
    if (!chosenClass) chosenClass = machineTypes[(spawnIndex + state.roundNumber - 1) % machineTypes.length];

    // Bots select real Armory skills. A Sharp Turn remains an innate ballista
    // attack, independent of the selected Skill.
    const skillSlot = chosenClass === SIEGE_MACHINE_CLASSES.BALLISTA ? 'biBye'
      : chosenClass === SIEGE_MACHINE_CLASSES.RAM ? 'soFist' : 'fightFlight';
    if (player.actorKind === 'bot') {
      const botSkill = chosenClass === SIEGE_MACHINE_CLASSES.BALLISTA
        ? (state.botDifficulty === 'champion' ? 'lookAroundAndFindOut' : 'boltToTheOccasion')
        : chosenClass === SIEGE_MACHINE_CLASSES.RAM
        ? (state.botDifficulty === 'champion' ? 'longArmToTheJaw' : 'beatToThePunch')
        : (state.botDifficulty === 'champion' ? 'narrowToOne' : 'fireAwayRightHere');
      player.siegeLoadout = normalizeSiegeLoadout({ ...player.siegeLoadout, [skillSlot]: botSkill });
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
        x: spawnPoint.x,
        y: spawnPoint.y,
        z: spawnPoint.z,
        position: { x: spawnPoint.x, y: spawnPoint.y, z: spawnPoint.z },
        heading: spawnPoint.yaw,
        team,
      });
      machine.x = spawnPoint.x;
      machine.y = spawnPoint.y;
      machine.z = spawnPoint.z;
      player.operatingRamId = machine.id;
    }

    // Provisioning skips normal mount functions; initialize the equipped
    // Skill here so the bot AI actually sees what its Armory loadout selected.
    machine.skill = { ...machine.skill, id: selectedSiegeSkill(player, skillSlot) };
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
      player.spell = (state.botDifficulty === 'squire' && Math.random() < 0.4) ? 'fireball' : 'steel';
      player.siegeAi = {
        seed: Math.random() * 100,
        decisions: 0,
        side: Math.random() < 0.5 ? 1 : -1,
        stuckUntil: 0,
        lastPosition: { ...spawnPoint },
        lastSampleAt: nowSec,
        nextDecisionAt: nowSec,
        nextRamAt: 0,
        nextSkillAt: 0,
        nextSweepAt: 0,
        nextDashAt: 0,
        nextSteelAt: 0,
        lastVolleyAt: 0,
        lastShotIAt: 0,
        burstStartSeq: null,
        nextFireAt: 0,
        regroupForCharge: false,
        difficulty: state.botDifficulty === 'champion' ? 'formidable' : state.botDifficulty === 'squire' ? 'learner' : 'skilled',
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

  if (!winningTeam) {
    state.roundWinner = 'DRAW';
    room.events?.push({
      type: 'siegeBladesRoundEnded',
      winnerTeam: null,
      scores: { ...state.scores },
      roundNumber: state.roundNumber,
      reason: 'mutual_elimination',
      at: nowSec,
    });
  } else {
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
  }

  if (state.format === SIEGE_BLADES_FORMATS.MATCH) {
    // Exactly N rounds are played even if one side already has a majority.
    // A tie (possible with mutual elimination) is an actual drawn match.
    if (state.roundNumber >= state.matchRounds) {
      const azure = state.scores[TEAMS.ATTACKERS];
      const crimson = state.scores[TEAMS.DEFENDERS];
      state.matchFinished = true;
      state.matchWinner = azure === crimson ? null : azure > crimson ? TEAMS.ATTACKERS : TEAMS.DEFENDERS;
      room.finish(state.matchWinner, nowSec, state.matchWinner ? 'siege-blades-victory' : 'siege-blades-draw');
      return;
    }
    state.roundResetCountdown = 2.0; // score presentation, then timed machine choice
  } else {
    // A capped exhibition counts completed rounds, INCLUDING draws.
    if (state.endlessRoundCap > 0 && state.roundNumber >= state.endlessRoundCap) {
      const azure = state.scores[TEAMS.ATTACKERS];
      const crimson = state.scores[TEAMS.DEFENDERS];
      state.matchFinished = true;
      state.matchWinner = azure === crimson ? null : azure > crimson ? TEAMS.ATTACKERS : TEAMS.DEFENDERS;
      room.finish(state.matchWinner, nowSec, 'siege-blades-endless-complete');
      return;
    }
    state.roundResetCountdown = 2.0;
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
  state.overtimeStartedAt = null;
  state.zone.radius = state.zone.initialRadius ?? state.zone.radius;
  state.zone.altitudeLimit = state.zone.initialAltitudeLimit ?? 4.0;
  state.zone.controllingTeam = null;
  state.zone.holdSec = 0;
  state.zone.contested = false;
  state.eliminated.clear();

  // Comprehensively reset every player's combat state, cooldowns, statuses, and pending abilities
  for (const player of room.players.values()) {
    player.alive = true;
    player.health = 100;
    player.guardStamina = 100;
    player.stamina = 100;
    player.prowess = 0;
    player.damageTakenThisLife = 0;
    player.lastAttackerId = null;
    player.lastDamageAt = -Infinity;
    player.lastKnockbackAt = -Infinity;
    player.lastKnockbackSource = null;
    player.lastKnockbackBy = null;
    player.spellReadyAt = 0;
    player.pendingSpell = null;
    player.burn = null;
    player.chill = null;
    player.steel = null;
    player.attackActive = false;
    player.attackHeld = false;
    player.attackRestartAt = 0;
    player.dashStartedAt = -Infinity;
    player.dashUntil = -Infinity;
    player.ultimateState = null;
    player.ultimateLockedUntil = -Infinity;
    player.recoverUntil = -Infinity;
    player.dizzyUntil = -Infinity;
    player.gauntlet = null;
    player.operatingRamId = null;
    player.operatingBallistaId = null;
    player.operatingFightFlightId = null;

    player.shaken = null;
    player.electricalBacklash = null;
    player.oneHitFrostSlow = null;
    player.blustered = null;
    player.oneHitField = null;
    player.oneHitInfusions = { fire: 0, frost: 0, gale: 0, lightning: 0, steel: 0 };
    player.oneHitSeenUses = {};
    player.practiceOneHit = null;

    player.history = [];
    player.input = { forward: 0, right: 0, jump: false, sprint: false, yaw: player.yaw ?? 0, pitch: 0 };
  }

  // A previous round's hazards may outlive its pilots; none may enter the
  // next round or hurt someone while they are choosing a fresh machine.
  room.projectiles?.clear();
  room.ruptures = [];
  room.oneHitBurnZones = [];
  room.oneHitFields = [];
  room.oneHitWaves = [];
  room.flightBurnZones = [];
  beginSiegeBladesSelection(room, nowSec);
}

function chooseBotTarget(room, bot, m, kind, enemies, ai, state) {
  const at = { x: m.x, y: m.y, z: m.z };
  let best = enemies[0], bestScore = Infinity;
  for (const foe of enemies) {
    const fm = room.getMachineForPlayer(foe.id);
    const fKind = fm ? getMachineKind(fm) : 'foot';
    const d = dist(at, foe.position);
    let score = d;
    const hpRatio = fm ? (fm.health / Math.max(1, fm.maxHealth)) : (foe.health / 100);
    score -= (1 - hpRatio) * 14;
    if (ai.targetId === foe.id) score -= 5.5; // prevent jitter swapping
    if (kind === 'ram' && fKind === 'ballista') score -= 4;
    if (kind === 'flight' && fKind === 'flight') score -= 6;
    if (kind === 'flight' && fm?.rotorHP > 0 && fm.rotorHP < 55) score -= 5;
    if (state?.overtimeActive && dist(foe.position, state.zone.center) <= state.zone.radius) score -= 8;
    if (score < bestScore) { bestScore = score; best = foe; }
  }
  ai.targetId = best?.id ?? null;
  return best;
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

    const ai = bot.siegeAi ?? { seed: 1, decisions: 0, side: 1, stuckUntil: 0, now: nowSec };
    ai.now = nowSec;
    const kind = getMachineKind(m);
    const decide = nowSec >= (ai.nextDecisionAt ?? 0);

    let target = ai.targetId ? enemies.find(e => e.id === ai.targetId) : null;
    if (!target || decide) {
      target = chooseBotTarget(room, bot, m, kind, enemies, ai, state);
    }

    if (bot.spell === 'steel') {
      considerOperatorSteel(room, bot, m, kind, target, nowSec);
    }

    if (decide) {
      ai.nextDecisionAt = nowSec + tuning.reaction;
      ai.decisions++;
    }

    if (kind === 'ram') {
      stepUppercuff(room, bot, m, target, ai, tuning, nowSec, decide, state);
    } else if (kind === 'ballista') {
      stepBallistefan(room, bot, m, target, ai, tuning, nowSec, decide, state);
    } else if (kind === 'flight') {
      stepDonte(room, bot, m, target, ai, tuning, nowSec, decide, state);
    }
  }
}

function stepUppercuff(room, a, m, target, ai, tuning, now, decide, state) {
  const at = { x: m.x, z: m.z };
  const targetM = room.getMachineForPlayer(target.id);
  const targetKind = targetM ? getMachineKind(targetM) : 'foot';
  const otNeeded = Boolean(state?.overtimeActive && dist(at, state.zone.center) > Math.max(4, state.zone.radius - 2));
  const dTarget = dist(at, target.position);
  const recoveringFist = m.skill?.id === 'longArmToTheJaw' && m.detachedFist?.state === 'resting';
  const destination = recoveringFist ? { position: m.detachedFist.position, velocity: {} }
    : (otNeeded && dTarget > state.zone.radius) ? { position: state.zone.center, velocity: {} }
    : target;

  const d = dist(at, target.position);
  const pistonAge = m.strikeAt == null ? 99 : Math.max(0, now - m.strikeAt);
  const pistonReady = pistonAge >= 3.95;
  const inCooldown = pistonAge >= 0.35 && pistonAge < 3.65;
  const approach = drive(room, m, destination, ai, tuning, {
    ideal: recoveringFist ? 1.0 : pistonReady ? 2.4 : 4.8,
    deadZone: recoveringFist ? 0.45 : 1.1,
    reverse: recoveringFist || (!inCooldown && d < 2.1),
    checkBlocked: decide,
  });

  // Smooth flanking turn during piston cooldown rather than oscillating back-and-forth at 3.8m
  if (inCooldown && d < 6.0 && !recoveringFist) {
    approach.forward = d < 3.4 ? 0.55 : 0.85;
    approach.right = clamp(-approach.err * 0.65 + (ai.side ?? 1) * 0.48, -1, 1);
  }
  const forwardFacing = Math.abs(approach.err) < 0.48;
  const healthy = (m.components?.Fist?.health ?? 0) > 0 && (m.components?.Drive?.health ?? 0) > 0;
  const targetAbove = target.position.y - m.y;
  const elevateUp = targetKind === 'flight' && targetAbove > 0.7 && d < 15;
  const lowerDown = !elevateUp && ((m.ramLiftY ?? 0) > 0.08 || (m.ramElevPitch ?? 0) > 0.05);

  a.input = {
    ...a.input,
    forward: approach.forward,
    right: approach.right,
    sprint: forwardFacing && d > 5.2 && d < 26 && (m.pressure ?? 0) > 25 && healthy && !inCooldown,
    ramRaise: elevateUp && (m.ramLiftY ?? 0) < 0.9,
    ramPitchUp: elevateUp,
    ramLower: lowerDown && (m.ramLiftY ?? 0) > 0.05,
    ramPitchDown: lowerDown && (m.ramElevPitch ?? 0) > 0.04,
    yaw: m.heading,
    pitch: 0,
  };

  if (!decide) return;

  // Tactical commitment: Shunt Dash gap closer / punish, Flick, Skills, and timed Piston strikes
  if (healthy && forwardFacing && Math.abs(approach.err) < 0.38 &&
      d > 4.6 && d < 9.5 && (m.pressure ?? 0) >= 22 && now >= (m.shuntReadyAt ?? 0) &&
      (pistonReady || (m.charging && d < 8.5)) && ai.difficulty !== 'learner') {
    shuntSoFistication(room, m, now, 1);
  }

  const chosen = m.skill?.id;
  const ready = now + 1e-8 >= (m.skill?.readyAt ?? 0);
  const visibleThreat = Boolean(target.attackActive || target.pendingSpell || (target.dashUntil ?? -Infinity) > now || (targetM && (targetM.speed ?? 0) > 4.5));

  if (chosen === 'beatToThePunch' && forwardFacing && d < 12 && visibleThreat && m.skill?.phase === 'idle' && healthy) {
    primeSoFistSkill(room, m, a, now);
  }
  if (chosen === 'longArmToTheJaw' && now >= (ai.nextSkillAt ?? 0)) {
    const antiAirWindow = targetKind === 'flight' && targetAbove < 4.2 && d < 20;
    if (m.detachedFist?.state === 'resting' || (m.fistMounted !== false && forwardFacing && (antiAirWindow || (d > 5.2 && d < 18)) && ready && healthy)) {
      const problem = primeSoFistSkill(room, m, a, now);
      ai.nextSkillAt = now + (problem ? 0.7 : 3.2);
    }
  }
  if (chosen === 'hellpingHand' && forwardFacing && d < 6.0 && healthy && (!m.hellping || m.hellping.phase === 'open') && now >= (ai.nextSkillAt ?? 0) && ready) {
    const problem = primeSoFistSkill(room, m, a, now);
    ai.nextSkillAt = now + (problem ? 0.7 : 0.3);
  }

  if (forwardFacing && targetAbove < 3.6 && d >= 1.9 && d < 6.1 && now >= (ai.nextRamAt ?? 0) && pistonReady) {
    if (fireSoFistication(room, m, now)) ai.nextRamAt = now + 3.95;
  } else if (ai.difficulty !== 'learner' && forwardFacing && d < 4.5 && targetAbove < 3.5 && now >= (ai.nextRamAt ?? 0) && pistonReady && Math.abs(approach.err) > 0.25) {
    if (flickSoFistication(room, m, now)) ai.nextRamAt = now + 3.95;
  }
}

function stepBallistefan(room, a, m, target, ai, tuning, now, decide, state) {
  const at = { x: m.x, y: m.y, z: m.z };
  const d = dist(at, target.position);
  const targetM = room.getMachineForPlayer(target.id);
  const targetKind = targetM ? getMachineKind(targetM) : 'foot';

  if (decide || ai.cachedLos == null) {
    ai.cachedLos = !blocked(room, at, target.position);
  }
  const los = ai.cachedLos;

  // Component targeting: Rotor on Fight-and-Flight, Gauntlet/Fist on Ram
  const aimH = targetKind === 'flight' && (targetM?.rotorHP ?? 0) > 0 ? 2.05
    : targetKind === 'ram' ? 1.25 : 1.15;
  const desired = aimInput(at, target, ai, tuning, 48, aimH);

  // Closing speed & Time-To-Impact threat assessment
  const tx = target.position.x - at.x, tz = target.position.z - at.z;
  const distNorm = Math.max(0.1, Math.hypot(tx, tz));
  const tvx = target.velocity?.x ?? 0, tvz = target.velocity?.z ?? 0;
  const closingSpeed = -((tvx * tx + tvz * tz) / distNorm);
  const tti = closingSpeed > 1.2 ? distNorm / closingSpeed : 99;
  const highThreat = (closingSpeed > 4.2 && tti < 2.25 && d < 16) || d < 9.5;

  const sweepFocus = m.skill?.id === 'lookAroundAndFindOut';
  const otNeeded = Boolean(state?.overtimeActive && dist(at, state.zone.center) > Math.max(4, state.zone.radius - 2));

  if (m.mode === 'MOBILE') {
    const dest = otNeeded && d > state.zone.radius ? { position: state.zone.center, velocity: {} }
      : highThreat && !sweepFocus ? {
          position: { x: at.x - (tx / distNorm) * 14 + (ai.side ?? 1) * (-tz / distNorm) * 6, y: at.y, z: at.z - (tz / distNorm) * 14 - (ai.side ?? 1) * (-tx / distNorm) * 6 },
          velocity: {},
        }
      : target;
    const wheel = drive(room, m, dest, ai, tuning, {
      ideal: highThreat ? 0 : (sweepFocus ? 3.2 : tuning.preferred ?? 19),
      deadZone: highThreat ? 0.5 : (sweepFocus ? 0.5 : 3.0),
      reverse: !highThreat,
      checkBlocked: decide,
    });
    a.input = {
      ...a.input,
      ...wheel,
      yaw: desired.yaw,
      pitch: desired.pitch,
      siegeTarget: { ...desired.point, y: desired.point.y + aimH },
    };
    if (decide && d > 13 && d < 42 && !highThreat && Math.abs(wheel.err) < 0.45 && los && Math.abs(m.speed ?? 0) < 0.4) {
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
      siegeTarget: { ...desired.point, y: desired.point.y + aimH },
    };
  }

  if (m.sweep) {
    if (m.sweep.kind === 'skill' && m.sweep.phase === 'loop' && now - m.sweep.startedAt > 2.35) {
      requestBiByeSweepStop(m, now, true);
    }
    return;
  }

  if (!decide || m.mode === 'DESTROYED' || m.mode === 'DEPLOYING' || m.mode === 'RETRACTING') return;

  const isAligned = Math.abs(difference(desired.yaw, m.mainYaw ?? m.heading)) < 0.22;
  const competent = ai.difficulty !== 'learner';

  // Defensive answer BEFORE retracting when attacker enters sweep reach
  if (los && m.skill?.id === 'lookAroundAndFindOut' && m.skill.phase === 'idle' && now + 1e-8 >= (m.skill.readyAt ?? 0) && d < (competent ? 4.2 : 3.0) && now >= (ai.nextSweepAt ?? 0) && (competent || ai.decisions % 3 === 0)) {
    const problem = requestLookAroundAndFindOut(room, m, a, now);
    ai.nextSweepAt = now + (problem ? 1.15 : 4.2);
    if (!problem) return;
  }
  if (d <= (competent ? 3.8 : 2.9) && now >= (ai.nextSweepAt ?? 0) && m.skill?.phase === 'idle' && (competent || ai.decisions % 3 === 0)) {
    const problem = requestBiByeSharpTurn(room, m, a, now);
    ai.nextSweepAt = now + (problem ? 1.05 : 4.0);
    if (!problem) return;
  }

  // Threat-aware early retraction (TTI & closing speed rather than naive d < 7)
  if (m.mode === 'DEPLOYED' && (otNeeded || !los || d > 47 || (highThreat && (!m.mainBoltLoaded || !isAligned || d < 8.5)))) {
    toggleBiByeDeploy(m, now, room.world);
    return;
  }

  if (!los) return;

  if (d < 43 && ['MOBILE', 'DEPLOYED'].includes(m.mode) && m.skill?.id === 'coldHowTouching' && m.skill.phase === 'idle' && now + 1e-8 >= (m.skill.readyAt ?? 0) && (highThreat || d < 24)) {
    requestColdHowTouching(room, m, a, now);
  }

  if (m.mode === 'DEPLOYED' && m.mainBoltLoaded && m.skill?.phase === 'idle' && isAligned && (m.pendingVolley || (!(ai.lastVolleyAt ?? 0) && d < 18))) {
    setBiByeWeaponFocus(m, 'MAIN', now);
    if (fireBiByeFullVolley(room, m, now)) ai.lastVolleyAt = now;
    return;
  }

  if (m.skill?.id === 'boltToTheOccasion' && m.mainBoltLoaded && m.skill.phase === 'idle' && d < 55 && isAligned) {
    requestBiByeHeavySkill(room, m, a, now, biByeTargetAim);
  }
  if (m.skill?.phase === 'primed') {
    if (now >= (m.smallBoltReadyAt ?? 0) && m.mobileShotPendingAt == null && !m.pendingIndependent) {
      setBiByeWeaponFocus(m, 'UPPER', now);
      if (fireBiByeMobile(room, m, now)) ai.lastShotIAt = now;
    }
    if (now - (ai.lastShotIAt ?? 0) > 0.24 && isAligned && m.mainBoltLoaded && m.mobileShotPendingAt == null && now >= (m.mainSkillUntil ?? 0)) {
      requestBiByeHeavySkill(room, m, a, now, biByeTargetAim);
    }
  } else if (m.mode === 'DEPLOYED' && m.mainBoltLoaded && m.skill?.phase === 'idle' && m.coupling === 'INDEPENDENT' && isAligned && now - (ai.lastVolleyAt ?? 0) > 4) {
    setBiByeWeaponFocus(m, 'MAIN', now);
    if (fireBiByeFullVolley(room, m, now)) ai.lastVolleyAt = now;
  } else if (now >= (m.smallBoltReadyAt ?? 0) && m.mobileShotPendingAt == null && (m.skill?.phase === 'idle' || (m.skill?.id === 'coldHowTouching' && m.skill?.phase === 'active')) && Math.abs(difference(desired.yaw, m.upperYaw ?? m.heading)) < 0.25) {
    setBiByeWeaponFocus(m, 'UPPER', now);
    if (fireBiByeMobile(room, m, now)) ai.lastShotIAt = now;
  }
}

function stepDonte(room, a, m, target, ai, tuning, now, decide, state) {
  const at = { x: m.x, y: m.y, z: m.z };
  const targetM = room.getMachineForPlayer(target.id);
  const targetKind = targetM ? getMachineKind(targetM) : 'foot';
  const otNeeded = Boolean(state?.overtimeActive && dist(at, state.zone.center) > Math.max(3, state.zone.radius - 2));
  const aimAnchor = otNeeded && dist(at, target.position) > state.zone.radius ? { position: state.zone.center, velocity: {} } : target;
  const d = dist(at, target.position);
  const charge = m.flightCharge ?? 0, ammo = m.ammo ?? 0;
  const skilled = ai.difficulty !== 'learner', formidable = ai.difficulty === 'formidable';
  const rotorIntact = (m.rotorHP ?? 0) > 0;

  // Target enemy Flight rotor overhead; hit ground hull otherwise
  const aimH = targetKind === 'flight' && (targetM?.rotorHP ?? 0) > 0 ? 2.05 : 1.05;
  const aim = aimInput(at, target, ai, tuning, FLIGHT_REPEATER.speed, aimH);
  const steerHeading = otNeeded && dist(at, target.position) > state.zone.radius ? bearing(at, state.zone.center) : bearing(at, aim.point);
  const facing = Math.abs(difference(bearing(at, aim.point), m.heading ?? 0));

  // Explicit flight charge & landing reserve budget (never hover straight to empty stall)
  const escapeReserve = formidable ? 24 : skilled ? 28 : 18;
  if (charge < escapeReserve || (ammo <= 1 && m.skill?.phase !== 'active' && charge < 48)) ai.regroupForCharge = true;
  if (ai.regroupForCharge && charge >= (formidable ? 70 : 62)) ai.regroupForCharge = false;
  const regroup = Boolean(ai.regroupForCharge);

  const attacking = Boolean(m.offensiveRun || m.flightDashHeld);
  const maxHover = state?.overtimeActive ? Math.max(1.2, (state.zone.altitudeLimit ?? 4.0) - 0.5) : 4.5;
  const optimalAltitude = clamp(d * 0.22, 1.3, maxHover);
  const desiredHeight = attacking ? target.position.y + 0.3 :
    regroup ? target.position.y : target.position.y + optimalAltitude;
  const climb = rotorIntact && !regroup && charge >= (skilled ? 34 : 22) &&
    (m.grounded || m.y < desiredHeight - 0.85);
  const descend = !m.grounded && (regroup || m.y > desiredHeight + 1.05 || charge < 20);
  const retreat = d < (targetKind === 'ram' ? 8.2 : skilled ? 5.8 : 2.1) && !attacking;
  const steer = otNeeded ? 1.0 : regroup ? (targetKind === 'ram' && d < 14 ? -0.85 : 0.25) : retreat ? -0.9 : d > (skilled ? 12 : 5) ? 1 : 0.28;
  const strafe = !attacking && d < 26 ? (ai.side ?? 1) * (targetKind === 'ram' ? 0.72 : 0.48) : 0;
  const impact = { x: aim.point.x, y: aim.point.y + aimH, z: aim.point.z };
  const solution = flightRepeaterAim(m, { siegeTarget: impact });

  if (decide || ai.cachedLos == null) {
    const muzzle = flightMuzzle(m, solution);
    ai.cachedLos = !blocked(room, muzzle, impact);
  }
  const clear = ai.cachedLos;

  a.input = {
    ...a.input,
    forward: steer,
    right: strafe,
    yaw: steerHeading,
    pitch: clamp(solution.pitch, -1.45, 1.45),
    siegeTarget: impact,
    jump: climb,
    crouch: descend,
    sprint: m.grounded && !rotorIntact && d > 5,
  };

  if (!decide) return;

  const readyDash = skilled && rotorIntact && !m.grounded && !m.offensiveRun &&
    !m.flightDashHeld && !(m.terminalDive || m.terminalPrep) &&
    charge > 55 && (a.prowess ?? 0) >= (formidable ? 44 : 70) &&
    d > 8 && d < 17 && facing < 0.21 &&
    Math.abs(m.y - target.position.y) < 2.6 && !regroup &&
    now >= (ai.nextDashAt ?? 0);
  if (readyDash && requestFlightDash(room, m, a, true, now)) {
    ai.dashDownAt = now;
    ai.nextDashAt = now + (formidable ? 4 : 7);
  }
  if (m.flightDashHeld &&
    ((!m.terminalPrep && now - (ai.dashDownAt ?? now) > 0.64) ||
      now - (ai.dashDownAt ?? now) > 2.4 || charge < 20 || !target.alive)) {
    requestFlightDash(room, m, a, false, now);
    ai.dashDownAt = null;
  }

  const accurate = solution.missDistance <= (formidable ? 0.34 : skilled ? 0.48 : 0.72) && !solution.limited;
  const visible = clear && d < Math.min(FLIGHT_REPEATER.speed * FLIGHT_REPEATER.lifespan, 43) && facing < 1.02;

  const shotSeq = m.shotSeq ?? 0;
  if (ai.burstStartSeq == null) ai.burstStartSeq = shotSeq;
  const maxBurst = formidable ? 5 : skilled ? 3 : 7;
  if (shotSeq - ai.burstStartSeq >= maxBurst) {
    ai.nextFireAt = now + (formidable ? 0.48 : skilled ? 0.72 : 0.22);
    ai.burstStartSeq = shotSeq;
  }
  const canSpend = ammo >= (skilled ? 2 : 1) || (d < 8 && ammo >= 1);

  const fireAway = m.skill?.id === 'fireAwayRightHere' && m.skill.phase === 'active';
  if (fireAway && (charge < 34 || !visible)) {
    endFightFlightSkill(room, m, now, charge < 34 ? 'chargeReserve' : 'lostSight');
  }
  const chosen = m.skill?.id;
  if (m.skill?.phase === 'idle' && now + 1e-8 >= (m.skill.readyAt ?? 0) && visible && accurate && !regroup) {
    const want = chosen === 'fireAwayRightHere'
      ? charge > 64 && ammo <= 8 && d > 8 && d < 28 && !attacking
      : chosen === 'narrowToOne' ? d > 7 && d < 34
      : chosen === 'doNotStopMyAscension' ? d > 4 && d < 20 && ammo > 3 && charge > 32
      : false;
    if (want) requestFightFlightSkill(room, m, a, now);
  }
  const skillActive = m.skill?.phase === 'active' && m.skill.id === 'narrowToOne';
  const blastMode = m.skill?.phase === 'active' && m.skill.id === 'fireAwayRightHere';
  const groundedSwordOpportunity = m.grounded && d < 3.0;
  const fire = visible && (!regroup || groundedSwordOpportunity) && !attacking && (accurate || skillActive) && now + 1e-8 >= (ai.nextFireAt ?? 0) && (blastMode ? charge > 34 : canSpend);
  requestFightFlightFire(room, m, a, fire, now);

  const close = d < 2.75 && Math.abs(m.y - target.position.y) < 2.5;
  if (close && !attacking && !a.attackHeld && now >= (a.attackRestartAt ?? 0)) {
    beginAttack(room, a.id, now);
  } else if (a.attackHeld && !close) endAttack(room, a.id, now);

  if (formidable && !regroup && !m.grounded && !m.offensiveRun &&
    !m.flightDashHeld && m.skill?.id === 'doNotStopMyAscension' &&
    m.skill.phase === 'active' && a.ultimate === 'chivalry' && a.prowess >= 100 &&
    !a.ultimateState && d < 13 && charge > 70 && rotorIntact &&
    now >= (ai.nextDiveAt ?? 0)) {
    if (requestFlightDash(room, m, a, true, now)) {
      setFlightUltimateHold(room, m, a, true, now);
      ai.dashDownAt = now;
      ai.nextDiveAt = now + 15;
    }
  }
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

  if (state.selectionEndsAt !== null) {
    if (nowSec >= state.selectionEndsAt) {
      state.selectionEndsAt = null;
      provisionSiegeBladesFleet(room, nowSec);
      state.roundStartedAt = nowSec;
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

  // Overtime Engagement Zone (180s in Match; 240s anti-stall safety in Endless).
  const overtimeAt = state.format === SIEGE_BLADES_FORMATS.MATCH ? 180 : 240;
  if (nowSec - state.roundStartedAt >= overtimeAt) {
    if (!state.overtimeActive) {
      state.overtimeActive = true;
      state.overtimeStartedAt = state.roundStartedAt + overtimeAt;
      room.events?.push({
        type: 'siegeBladesOvertimeStarted',
        center: state.zone.center,
        radius: state.zone.radius,
        at: nowSec,
      });
    }

    const otElapsed = Math.max(0, nowSec - (state.overtimeStartedAt ?? nowSec));
    const initialR = state.zone.initialRadius ?? 26.0;
    const initialAlt = state.zone.initialAltitudeLimit ?? 4.0;
    state.zone.radius = Math.max(8.5, initialR * (1 - Math.min(0.68, otElapsed / 55)));
    state.zone.altitudeLimit = Math.max(1.8, initialAlt - otElapsed * 0.045);
    const zoneBaseY = state.zone.centerY ?? 0;

    let azureInZone = false;
    let crimsonInZone = false;

    for (const p of room.players.values()) {
      if (!p.alive || state.eliminated.has(p.id)) continue;
      const m = room.getMachineForPlayer(p.id);
      const pos = m ? { x: m.x, y: m.y, z: m.z } : p.position;
      const d = dist(pos, state.zone.center);

      if (d <= state.zone.radius) {
        // Shared fighting plane prevents vertical-layer bridge/roof contest exploits
        // and gradually pulls low-hoverers into ground/melee reach.
        const planeOffset = Math.abs(pos.y - zoneBaseY);
        let validContest = planeOffset <= state.zone.altitudeLimit;
        if (validContest && m && getMachineKind(m) === 'flight') {
          const groundY = surfaceHeightAt(m.x, m.z, m.y, room.world) ?? 0;
          const altitude = m.y - groundY;
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
      // Contested breaks continuous control; hold progress decays steadily
      state.zone.holdSec = Math.max(0, state.zone.holdSec - dt * 2.0);
    } else {
      state.zone.contested = false;
      // Empty: hold progress decays toward zero
      state.zone.holdSec = Math.max(0, state.zone.holdSec - dt * 1.5);
      if (state.zone.holdSec === 0) state.zone.controllingTeam = null;
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
    beginSiegeBladesSelection(room, nowSec);
  },
  step: (room, dt, nowSec) => {
    stepSiegeBlades(room, dt, nowSec);
  },
  command: (room, player, message, nowSec) => {
    if (message.type !== 'siegeBladesChoose') return null;
    return selectSiegeBladesMachine(room, player, message.machine, nowSec)
      ? {} : { rejected: 'Choose one of the three siege machines during the selection phase.' };
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
      roundStartedAt: s.roundStartedAt,
      matchRounds: s.matchRounds,
      scores: { ...s.scores },
      selectionEndsAt: s.selectionEndsAt,
      selectionChoices: s.selectionEndsAt !== null ? Object.fromEntries(s.selectionChoices) : null,
      roundWinner: s.roundWinner,
      roundResetCountdown: s.roundResetCountdown != null ? Math.max(0, s.roundResetCountdown) : null,
      overtimeActive: s.overtimeActive,
      clashActive: s.clashActiveThisRound,
      zone: s.overtimeActive ? {
        center: { ...s.zone.center },
        radius: Number(s.zone.radius.toFixed(2)),
        altitudeLimit: Number((s.zone.altitudeLimit ?? 4.0).toFixed(2)),
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
