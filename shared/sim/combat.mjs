import { queueDefeatVoice, stepDefeatVoices } from './defeatChorus.mjs';
import {stepFightFlight,dismountFightFlight} from './fightFlight.mjs';
import {modeCall} from './modeRuntime.mjs';
import {withRestlessLadders,damageRestlessLadder,constrainRestlessCarry} from './restlessDayMode.mjs';
import { playerMovementWorld } from './playerMovementWorld.mjs';
import {lostSiegeMachines} from './siegeAbyss.mjs';
import {stepFightFlightWeapons,stepFightFlightProjectiles} from './fightFlightWeapons.mjs';
import {stepFightFlightSkill} from './fightFlightSkill.mjs';
import {stepFlightRun} from './fightFlightRun.mjs';
import {stepTerminalPreparation,advanceTerminalFlight,resolveTerminalFlight,stepFlightBurnZones,terminalFlightSteps} from './fightFlightTerminal.mjs';
import {stepFightFlightRotor} from './fightFlightRotor.mjs';
import {fightFlightHitVolumes,damageFightFlight} from './fightFlightComponents.mjs';
import { galeDose } from '../src/galeDamage.mjs';
import { galeProfile, galeLift, sustainGaleRecoil } from '../src/galeModes.mjs';
import { structureWorld, damageStructureSolid } from './structures.mjs';
import {stepSoFistication,dismountSoFistication,soFistOperator,damageSoFistication,blastSoFistication} from './soFistication.mjs';
import {soFistVolumes,soFistFirstHit} from './soFistGeometry.mjs';
import {resolveWorldImpact} from './worldImpact.mjs';
import { biByeHitVolumes, biByeFirstHit } from './biByeComponents.mjs';
import {
  DAMAGE_LEVELS, GAME, HEALTH_REGEN, MAX_FORCE, MELEE_CONTACT, SWORD_CHAIN, SWORD_STRIKE_TIMES, closingImpact, guardProfile, nextChainStep,
  nextChainVariant, strikeKind,
  resolveSwordVsGuard, swordDamage, swordDamageFor, swordForce,
} from '../src/combat.mjs';
import { STAGGER, addStagger, drainStagger, freshStagger, staggerShove } from '../src/stagger.mjs';
import { PROWESS, gainProwess, prowessForDamage } from '../src/prowess.mjs';
import { lineOfConductDamage, ONE_HIT_RULES } from '../src/oneHitOfWondersRules.mjs';
import { ONE_HIT_BASE_DAMAGE, ONE_HIT_GROUND_RADIUS, ONE_HIT_AERIAL_DURATION,
  oneHitDamage, oneHitForm, oneHitCommit, oneHitBacklashRemaining, applyOneHitShaken,
  shakenSprintFactor, creditOneHitEncounter, elementForSpell, normalizeInfusions,
  oneHitGlide, oneHitChargingLightning, oneHitSteelFloorActive, emptyInfusions, ONE_HIT_STATUS_SECONDS } from '../src/oneHitInfusions.mjs';
import { ONE_HIT_FIELD, ONE_HIT_BLUSTER, ONE_HIT_STEEL, fieldStrength, fieldContact, shakenHeldBack, fieldGuardLoss,
  burnZoneLick, fieldFrostDepth, mergeFrostSlow, frostSlowScale, directConduct, mergeConduct, fieldConduct,
  blusterSeverity, blusteredFacing, steelFractureRules, ONE_HIT_REACH, ONE_HIT_FROST_LINGER_SEC, fieldSeconds, groundReach,
  fireGaleShove } from '../src/oneHitStatus.mjs';
import {
  ULTIMATES, ULTIMATE_PRESS_KEPT_SEC, chivalryParries, dizzy, stepVortexEmphasis, sundering, ultimateFor, ultimateStartup, ultimateWhirl, vortexEmphasisWanted, vortexTune, vortexing,
} from '../src/ultimates.mjs';
import { combatActionPolicy, combatBlocksSprint } from '../src/combatActionPolicy.mjs';
import { vortexBladeGuards } from '../src/vortexGuard.mjs';
import { heldActions } from '../src/heldActions.mjs';
import { recordChallengeFact } from './challenges.mjs';
import { recordPerryParry, recordPerryDamage, assessPerryDefeat } from './StPerry.mjs';
import { preparedSpellMember } from '../src/preparedSpells.mjs';
import { RUPTURE, fissureHit, onTornGround, planRupture } from '../src/rupture.mjs';
import { recastReady, recordUse } from '../src/practiceRecast.mjs';
import { GAME_MODES } from '../src/modes.mjs';
import { renownTrialCombatOpen } from './renownTrials.mjs';
import { eliminateEdgePlayer, edgeConstrainActor, stepEdgeOfVictory } from './edgeOfVictory.mjs';
import { edgeHandleMountedOperators } from './edgeSiegeDismount.mjs';
import { edgeInside, edgeLimitPoint } from '../src/edgeBoundary.mjs';
import { oneHitAlong, oneHitWorldContact, planOneHitTeleport } from '../src/oneHitTrajectory.mjs';
import { blastDamage, blastDistance, burnFrom, chillFrom, chillScale, nominalSpellDamage, spellExposure, spellFor, strongerChill } from '../src/spells.mjs';
import { STEEL, callSteel, steelBlunt, steelExposure, steelMitigate, steelQuality, steelStrength, steelTakes, STEEL_DAMAGE_RANGES } from '../src/steel.mjs';
import {operatedSiegeSteelMachine,beginSiegeSteel,stepSiegeSteel} from './siegeSteel.mjs';
import { galeBend, galeCarry, galeOnBody, galeRecoil, galeShove, galeWindOnBody } from '../src/gale.mjs';
import { GAUNTLET, gauntletGeometry, gauntletTarget, withinGauntlet } from '../src/gauntlet.mjs';
import { postureOf } from '../src/body.mjs';
import { resolvePlayerWorld, segmentAabbHit, surfaceHeightAt } from '../src/collision.mjs';
import { BLADE, aimFrame, aimQuality, bladeDirection, bladeTouches, evaluateBladeHeatmap, offAimDegrees, sweepBlade } from '../src/blade.mjs';
import { MOVEMENT, SPRINT, launchBody, movePlayer, resolveSprint, shoveBody, tryStartDash } from '../src/movement.mjs';
import { separatePlayers } from '../src/separation.mjs';
import { STEEL_RAM, chargeTarget, ramContact, ramEffect, ramStrength } from '../src/steelRam.mjs';
import { chooseSpawn, worldSpawnPoints } from './spawns.mjs';
import { recordTransform, sampleTransform } from './history.mjs';
import { TEAMS, areAllies, areEnemies } from '../src/teams.mjs';
import { stepObjectives } from './objectives.mjs';
import { stepHighGrounds, availableHighGroundsSpawns } from './highGroundsMode.mjs';
import { stepBiByeLlista, stepBiByeProjectiles, dismountBiByeLlista, damageBiByeLlista, blastBiByeLlista } from './biByeLlista.mjs';
import { WORLD_IDS, getWorld } from '../worlds/registry.mjs';
import { bastionBreachForObjective } from '../worlds/bastionBreach.mjs';

const SWORD_ARC_COS = Math.cos((110 * Math.PI / 180) / 2);
const RESPAWN_SEC = 3;
const SPAWN_PROTECTION_SEC = 1;
// a guard's stamina comes back once the pressure on it has let up for a moment (a blow on it, a gust, a sprint all
// start the wait again), whether or not the guard is still raised; held up, it comes back a little slower
const GUARD_REGEN_DELAY_SEC = 1;
const GUARD_REGEN_PER_SEC = 40;
const GUARD_REGEN_GUARDING = 0.6;
const HEALTH_REGEN_DELAY_SEC = HEALTH_REGEN.delaySec;
const HEALTH_REGEN_PER_SEC = HEALTH_REGEN.perSec;
const ABYSS_ATTRIBUTION_SEC = 5;
let projectileCounter = 0;

function forwardFromYaw(yaw) {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

function normalize3(v) {
  const m = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

// the middle of a body as it stands (or crouches): a blast's heart, a spell's aim
function playerCenter(player) {
  return { x: player.position.x, y: player.position.y + postureOf(player).center, z: player.position.z };
}

function resetAtSpawn(player, spawn, nowSec, room) {
  player.position = { x: spawn.x, y: spawn.y, z: spawn.z };
  player.deathFlight=null;
  player.ejectionFallExempt=false;
  player.flightInputAt=null;
  player.velocity = { x: 0, y: 0, z: 0 };
  player.impulse = { x: 0, z: 0 };
  player.grounded = true;
  player.jumpHeld = false;
  player.yaw = spawn.yaw ?? 0;
  player.pitch = 0;
  player.input = { forward: 0, right: 0, jump: false, yaw: player.yaw, pitch: 0 };
  player.health = 100;
  player.guardStamina = guardProfile(player.knightClass).capacity;
  player.guarding = false;
  player.guardHeld = false;
  releaseButtons(player);
  player.sprinting = false;
  player.sprintBlend = 0;
  player.guardStartedAt = -Infinity;
  player.lastGuardDrainAt = -Infinity;
  stopSwordChain(player, {}, room, nowSec);
  player.attackStartedAt = -Infinity;
  player.attackRestartAt = -Infinity;
  player.staggerUntil = -Infinity;
  player.spellReadyAt = Math.max(player.spellReadyById?.[player.spell] ?? player.spellReadyAt ?? 0, nowSec);
  player.chivalryProjectileReadyAt = 0;
  player.castEndsAt = 0;
  player.pendingSpell = null;
  player.gust = null;
  player.gauntlet = null;
  player.gauntletReadyAt = -Infinity;
  player.crouched = false;
  player.burn = null;
  player.chill = null;
  player.steel = null;
  player.dashRam = null;
  player.speedScale = 1;
  // balance found again; an ultimate still bracing or active is over (the prowess earned is kept)
  player.stagger = freshStagger();
  player.ultimateState = null;
  // Infusions and Prowess deliberately persist across ordinary deaths.
  player.shaken = null;
  player.electricalBacklash = null;
  player.oneHitFrostSlow = null;
  player.blustered = null;
  player.oneHitField = null;
  player.oneHitFrozenUntil = -Infinity;
  player.damageTakenThisLife = 0;
  player.spawnProtectionUntil = nowSec + SPAWN_PROTECTION_SEC;
  player.alive = true;
  player.respawnAt = 0;
  player.lastDamageAt = -Infinity;
  player.coreRegenPausedUntil = -Infinity;
  player.lastAttackerId = null;
  player.lastKnockbackAt = -Infinity;
  player.worldImpact = null;
  player.history = [];
  recordTransform(player, nowSec);
}

// The sword chain (SWORD_CHAIN in shared/src/combat.mjs): a press starts one or asks for its next strike; a release
// only lets go, and the swing under way still lands. Stopping one outright is for a parry, a wall, a guard, a spell
// and a fall.
//
// However a chain ends, no new attack (a sword chain, or the gauntlet) begins before the chain's next strike would
// have begun had the button been held (attackRestartAt): letting go and pressing again, or cancelling into a guard or
// a spell, can never bring the sword round sooner than holding it would. A press the player made while a let-go
// chain was still running, whose word only arrived after it had ended, carries that chain on exactly as a timely
// press would have (it asked for the chain's next strike, not a fresh first one).
function startSwordChain(player, nowSec) {
  player.attackActive = true;
  player.attackChainSerial = (player.attackChainSerial ?? 0) + 1;
  player.attackChainId = `${player.id}:${player.attackChainSerial}`;
  player.attackStartedAt = nowSec;
  // a chain begun Sundering is swung as slams to its end (the ground splits under them only while Sundering)
  player.attackSlam = sundering(player, nowSec);
  player.attackChivalry = combatActionPolicy(player, nowSec).concurrent;
  // its form: straight on from a chain that ran its course, the other one; otherwise the falling chain (a Sundering
  // chain is slams, and Chivalry's guarded cuts keep the falling one's)
  player.attackVariant = player.attackSlam || player.attackChivalry ? 0 : nextChainVariant(player.attackRun, nowSec);
  player.attackRun = null;
  player.attackNextStrike = 0;
  player.attackCommitted = 1;
  player.attackCommitBy = null;
  player.attackQueued = false;
  player.attackOpened = -1;
  player.attackSweep = null;
  player.attackLastChain = null;
  // (for the body that shows it: how many of this chain's strikes have landed, and how it ended; kept after it ends)
  player.attackLanded = 0;
  player.attackEnd = null;
}

// when the chain under way would begin its next strike: every strike that has gone live counts (a swing broken off
// after it could already have hit is spent all the same). -Infinity when none has.
function nextStrikeDue(player) {
  if (!player.attackActive) return -Infinity;
  const spent = Math.max(player.attackNextStrike ?? 0, (player.attackOpened ?? -1) + 1);
  if (spent <= 0) return -Infinity;
  const begin = SWORD_CHAIN.starts[spent];
  const cycle = SWORD_STRIKE_TIMES[SWORD_STRIKE_TIMES.length - 1] + SWORD_CHAIN.restart;
  return player.attackStartedAt + (Number.isFinite(begin) ? begin : cycle);
}

// keepSweep: the chain has simply run its course, and its last strike's blade is still going through its sweep.
// letGo: it ended because the button was let go (not broken off), so a late word of a press made before its end can
// still carry it on
function stopSwordChain(player, { keepSweep = false, letGo = false, done = false } = {}, room = null, nowSec = 0) {
  if (!keepSweep && !letGo && (player.attackActive || player.attackSweep)) {
    recordChallengeFact(room, { type: 'swordChainInterrupted', playerId: player.id, chainId: player.attackChainId, at: nowSec });
  }
  const due = nextStrikeDue(player);
  if (due > (player.attackRestartAt ?? -Infinity)) player.attackRestartAt = due;
  player.attackLastChain = letGo && player.attackActive && (player.attackCommitted ?? 0) < SWORD_STRIKE_TIMES.length
    ? { startedAt: player.attackStartedAt, committed: player.attackCommitted, landed: player.attackNextStrike, endedAt: due, slam: Boolean(player.attackSlam), chainId: player.attackChainId }
    : null;
  // how it ended, for the body that shows it (presentation only: a chain run to its end or let go plays its last
  // swing out; one broken off gives way at once to whatever broke it)
  if (player.attackActive) player.attackEnd = done ? 'done' : letGo ? 'letGo' : 'broken';
  // (a chain that ran its whole course: the next, begun straight on from it, takes the other form)
  player.attackRun = done && player.attackActive ? { variant: player.attackVariant ?? 0, restartAt: player.attackStartedAt + SWORD_STRIKE_TIMES[SWORD_STRIKE_TIMES.length - 1] + SWORD_CHAIN.restart } : null;
  player.attackActive = false;
  player.attackHeld = false;
  player.attackQueued = false;
  player.attackNextStrike = 0;
  player.attackCommitted = 0;
  player.attackCommitBy = null;
  if (!keepSweep) player.attackSweep = null;
}

// a let-go chain carried on by a press made before it ended: its next strike, as if that press had been in time
function resumeSwordChain(player, last) {
  player.attackActive = true;
  player.attackStartedAt = last.startedAt;
  player.attackChainId = last.chainId;
  player.attackSlam = Boolean(last.slam);
  player.attackNextStrike = last.landed;
  player.attackCommitted = last.committed + 1;
  player.attackCommitBy = 'queued';
  player.attackQueued = false;
  player.attackOpened = last.landed - 1;
  player.attackLastChain = null;
  player.attackLanded = last.landed;
  player.attackEnd = null;
}

// Flash Freeze (Full Frost's direct hit): the knight is held, not interrupted. They cannot move, turn, or begin a
// sword blow, a spell, a fist, a dash, a guard or an ultimate until it lets go; whatever they were already doing is
// held where it was (holdFlashFrozen) and carries on from there. Nothing is cancelled: that is Steel's.
function flashFrozen(player, nowSec) {
  return nowSec < (player?.oneHitFrozenUntil ?? -Infinity);
}
// One tick of a freeze: every clock of an action under way is carried forward by the tick, so it is no further on
// when the ice lets go than when it took hold (the same hold the yard's inspection freeze uses). A spell already
// loosed is the world's, and flies on.
function holdFlashFrozen(player, dt, nowSec) {
  if (player.attackActive) player.attackStartedAt = (player.attackStartedAt ?? nowSec) + dt;
  if (Number.isFinite(player.attackRestartAt) && player.attackRestartAt > nowSec - dt) player.attackRestartAt += dt;
  if (player.attackSweep && Number.isFinite(player.attackSweep.sampledTo)) player.attackSweep.sampledTo += dt;
  if (player.attackLastChain) player.attackLastChain = { ...player.attackLastChain, startedAt: player.attackLastChain.startedAt + dt, endedAt: player.attackLastChain.endedAt + dt };
  if (player.pendingSpell) {
    player.castEndsAt = (player.castEndsAt ?? nowSec) + dt;
    if (Number.isFinite(player.pendingSpell.startedAt)) player.pendingSpell.startedAt += dt;
  }
  if (player.gauntlet) player.gauntlet.landAt = (player.gauntlet.landAt ?? nowSec) + dt;
  if (Number.isFinite(player.gauntletReadyAt) && player.gauntletReadyAt > nowSec - dt) player.gauntletReadyAt += dt;
  if (Number.isFinite(player.dashUntil) && nowSec - dt < player.dashUntil) player.dashUntil += dt;
  const state = player.ultimateState;
  if (state?.phase === 'startup') {
    if (Number.isFinite(state.commitAt) && state.commitAt < 1e6) state.commitAt += dt;
    if (Number.isFinite(state.startedAt)) state.startedAt += dt;
    if (Number.isFinite(state.teleportHoldAt)) state.teleportHoldAt += dt;
    if (state.groundRelease) state.groundRelease = { readyAt: state.groundRelease.readyAt + dt, until: state.groundRelease.until + dt };
  }
  if (Number.isFinite(player.ultimateWantedUntil) && player.ultimateWantedUntil > nowSec - dt) player.ultimateWantedUntil += dt;
}

export function beginAttack(room, playerId, nowSec) {
  const player = room.players.get(playerId);
  if (room.state !== 'PLAYING' || !player || !player.alive || nowSec < player.staggerUntil) return false;
  if (flashFrozen(player, nowSec)) return false;
  // a Vortex has both hands from the moment it is lit to the end of its recovery: a press then is nothing (and is
  // not kept: no swing comes of it later)
  if (ultimateFor(player.ultimateState?.id).spin && player.ultimateState || nowSec < (player.recoverUntil ?? -Infinity)) return false;
  // bracing into an ultimate: the press is kept, and the sword comes round as it takes hold
  if (ultimateStartup(player, nowSec)) {
    player.attackHeld = true;
    return false;
  }
  player.attackHeld = true;
  // a fresh press: a chain begins, or (mid-chain, or still recovering from one) its next strike is asked for; one
  // made before a let-go chain ended carries that chain on
  const last = player.attackLastChain;
  if (!player.attackActive && last && nowSec < last.endedAt - 1e-9) resumeSwordChain(player, last);
  else if (!player.attackActive && nowSec >= (player.attackRestartAt ?? -Infinity)) startSwordChain(player, nowSec);
  else player.attackQueued = true;
  if (!combatActionPolicy(player, nowSec).concurrent) {
    player.guarding = false;
    player.pendingSpell = null;
    player.castEndsAt = 0;
  }
  player.spawnProtectionUntil = Math.min(player.spawnProtectionUntil, nowSec);
  room.events.push({ type: 'attackStarted', playerId, at: nowSec });
  return true;
}

/**
 * The attack button let go: the swing under way still lands, but no further strike begins (outside play: all stops).
 * releasedAt: when it was let go (the word takes a moment to arrive). A swing that began after that, only because the
 * button still seemed held, never really began: it is taken back (the player's own view ended the chain there).
 */
export function endAttack(room, playerId, nowSec, releasedAt = nowSec) {
  const player = room.players.get(playerId);
  if (!player) return;
  player.attackHeld = false;
  if (room.state !== 'PLAYING' || !player.alive) {
    const was = player.attackActive;
    stopSwordChain(player, {}, room, nowSec);
    if (was) room.events.push({ type: 'attackEnded', playerId, at: nowSec });
    return;
  }
  const committed = player.attackCommitted ?? 0;
  const began = player.attackStartedAt + (SWORD_CHAIN.starts[committed - 1] ?? Infinity);
  if (player.attackActive && committed > 1 && player.attackCommitBy === 'held' && player.attackNextStrike < committed && releasedAt < began - 1e-9) {
    player.attackCommitted = committed - 1;
    // the swing before it has landed, so the chain is over (where the next would have begun)
    if (player.attackNextStrike >= player.attackCommitted) {
      stopSwordChain(player, { letGo: true }, room, nowSec);
      room.events.push({ type: 'attackEnded', playerId, at: nowSec });
    }
  }
}

/** Stop a sword chain outright: nothing further lands (a practice dummy told to stop, for one). */
export function cancelAttack(room, playerId, nowSec) {
  const player = room.players.get(playerId);
  if (!player) return;
  const was = player.attackActive;
  stopSwordChain(player, {}, room, nowSec);
  if (was) room.events.push({ type: 'attackEnded', playerId, at: nowSec });
}

/**
 * Raise or lower a knight's guard. auto: the raise is the ultimate's own (Spells & Chivalry's commit), not the
 * knight's hand: it lasts no longer than the ultimate does (stepUltimate). A guard broken in Chivalry cannot be raised
 * again until `guardBrokenUntil` (breakGuard).
 */
export function setGuard(room, playerId, guarding, nowSec, { auto = false } = {}) {
  const player = room.players.get(playerId);
  if (!player || !player.alive) return false;
  player.guardHeld = Boolean(guarding);
  player.guardAuto = Boolean(guarding) && auto;
  if (guarding && room.state !== 'PLAYING') return false;
  if (guarding && flashFrozen(player, nowSec)) return false;
  if (guarding && (player.guardStamina <= 0 || nowSec < player.staggerUntil || nowSec < (player.guardBrokenUntil ?? -Infinity)
    || ultimateStartup(player, nowSec) || vortexing(player, nowSec) ||
      (player.ultimateState?.id==='one_hit_of_wonders' && player.ultimateState.phase==='active'))) return false;
  if (player.guarding === Boolean(guarding)) return true;
  player.guarding = Boolean(guarding);
  if (guarding) {
    player.guardStartedAt = nowSec;
    if (!combatActionPolicy(player, nowSec).concurrent) stopSwordChain(player, {}, room, nowSec);
  }
  room.events.push({ type: guarding ? 'guardStarted' : 'guardEnded', playerId, at: nowSec });
  if (guarding) recordChallengeFact(room, { type: 'guardRaised', playerId, auto: Boolean(auto), at: nowSec });
  return true;
}

/**
 * The player's own buttons, as their presses and releases arrive (heldActions.mjs): an attack or a guard still held
 * comes back by itself as soon as it can. Only a player's own presses set these; a bot presses for itself.
 */
export function pressButton(room, playerId, button, down, atSec) {
  const player = room.players.get(playerId);
  if (!player) return;
  if (button === 'attack') {
    player.attackButton = Boolean(down);
    if (down) player.attackPressedAt = atSec;
  } else if (button === 'guard') {
    player.guardButton = Boolean(down);
    if (down) player.guardPressedAt = atSec;
  }
}

/** The buttons let go (a death, a reset, a match over, an action taken away): nothing held comes back. */
export function releaseButtons(player) {
  player.attackButton = false;
  player.guardButton = false;
}

// a held button's action, broken off, taken up again the moment it may be (not before: the reel, the cast, the fist
// and the chain's own restart all run their course first). The sword comes round exactly when it could have (at most a
// tick back), as a held chain does; a guard comes back up as a held one, so it blocks and cannot Parry.
function resumeHeldActions(room, player, nowSec, dt) {
  if (!player.attackButton && !player.guardButton) return;
  if (nowSec < player.staggerUntil || player.pendingSpell || player.gauntlet) return;
  const concurrent = combatActionPolicy(player, nowSec).concurrent;
  const wanted = heldActions({ attack: player.attackButton, guard: player.guardButton,
    attackPressedAt: player.attackPressedAt, guardPressedAt: player.guardPressedAt, concurrent });
  const swinging = player.attackActive || player.attackHeld || player.attackQueued;
  if (wanted.attack && !swinging && (concurrent || !player.guarding)) {
    beginAttack(room, player.id, Math.min(nowSec, Math.max(nowSec - dt, player.staggerUntil)));
  }
  if (wanted.guard && !player.guarding && (concurrent || !(swinging || player.attackSweep))) {
    if (setGuard(room, player.id, true, nowSec) && player.guarding) player.guardStartedAt = -Infinity;
  }
}

// both hands are the Vortex's while it spins, and for a moment after it ends (its recovery): no spell, no fist
function handsTaken(player, nowSec) {
  return Boolean(vortexing(player, nowSec)) ||
    (player.ultimateState?.id==='one_hit_of_wonders' && player.ultimateState?.phase==='active') ||
    nowSec < (player.recoverUntil ?? -Infinity);
}

// the Practice Yard lets abilities be used again after a moment, their real cooldowns still shown (practiceRecast.mjs)
function inPractice(room) {
  return room.mode === GAME_MODES.PRACTICE;
}

// that leave is the knight's who came to practise: the yard's own opponents keep their real cooldowns (or they would
// throw a spell every time the gate opened: a fireball every half second)
function practising(room, player) {
  return inPractice(room) && !room.localTutorial && (player?.actorKind === 'human' || (room.inspectionEnabled && player?.id === room.inspectionControlId));
}

export function tryDash(room, playerId, direction, nowSec) {
  const player = room.players.get(playerId);
  if (room.state !== 'PLAYING' || !player || !player.alive || nowSec < player.staggerUntil || ultimateStartup(player, nowSec) || vortexing(player, nowSec) ||
    (player.ultimateState?.id==='one_hit_of_wonders' && player.ultimateState.phase==='active')) return false;
  if (flashFrozen(player, nowSec)) return false;
  if(player.practiceMode==='ULTIMATE_KNIGHT'&&player.ultimateKnight?.behavior==='stay')return false;
  const practice = practising(room, player);
  if (!recastReady(player, 'dash', nowSec, practice)) return false;
  // (the dash itself as ever; its real cooldown as the yard's rule has it)
  const running = player.dashReadyAt;
  player.dashReadyAt = -Infinity;
  const ok = tryStartDash(player, direction, nowSec);
  player.dashReadyAt = running;
  if (!ok) return false;
  player.dashStartedAt = nowSec;
  recordUse(player, 'dash', nowSec, MOVEMENT.dashCooldown, practice);
  // Sheathed in Steel, the dash is a ram, as strong as the plate is now and for all of it (steelRam.mjs); whom it was
  // begun at goes with it (for the voice)
  const ram = ramStrength(player.steel, nowSec);
  player.dashRam = ram > 0 ? { strength: ram } : null;
  const toward = ram > 0 ? chargeTarget(player.position, player.dashDir, rammable(room, player, nowSec)) : null;
  room.events.push({ type: 'dash', playerId, direction, ...(ram > 0 ? { ram: round2(ram) } : {}), ...(toward ? { toward } : {}), at: nowSec });
  return true;
}

const round2 = (value) => Math.round(value * 100) / 100;

/** Identity clocks remain ordinary; the temporary projectile gate is shared across the arsenal. */
function spellReady(player, spell, nowSec, practice) {
  const policy = combatActionPolicy(player, nowSec);
  if (policy.projectileGateSec && !spell.kind) return nowSec + 1e-9 >= (player.chivalryProjectileReadyAt ?? 0);
  const readyAt = player.spellReadyAt ?? 0;
  return recastReady({ ...player, spellReadyAt: readyAt }, 'spell', nowSec, practice);
}

function recordSpellUse(player, spell, nowSec, practice) {
  recordUse(player, 'spell', nowSec, spell.cooldownSec, practice, { readyAt: nowSec + (spell.gatherSec ?? 0) });
  player.spellReadyById ??= {};
  player.spellReadyById[spell.id] = player.spellReadyAt;
  const policy = combatActionPolicy(player, nowSec);
  if (policy.projectileGateSec && !spell.kind) player.chivalryProjectileReadyAt = nowSec + policy.projectileGateSec;
}

/**
 * Gather the Spellblade's spell in the palm; it flies when the gather ends (see stepRoom). A ward carried in the
 * spell's place is called at once instead (sheatheInSteel).
 */
export function tryCastSpell(room, playerId, direction, nowSec) {
  const player = room.players.get(playerId);
  if (room.state !== 'PLAYING' || !player || !player.alive || nowSec < player.staggerUntil) return false;
  if (flashFrozen(player, nowSec)) return false;
  const practice = practising(room, player);
  const spell = spellFor(player.spell);
  // Even a direct simulation caller cannot cast arbitrary ordinary spells
  // from the operator's station; only a real mounted Steel ward is allowed.
  const seated=Boolean(player.operatingFightFlightId||player.operatingBallistaId||player.operatingRamId);
  if(seated&&(spell.id!=='steel'||!operatedSiegeSteelMachine(room,player)))return false;
  if (player.pendingSpell && nowSec >= player.castEndsAt && !ultimateStartup(player, nowSec)) spawnSpell(room, player, nowSec, room.world);
  if (player.pendingSpell || !spellReady(player, spell, nowSec, practice) || ultimateStartup(player, nowSec) || handsTaken(player, nowSec)) return false;
  if (spell.kind === 'ward') return sheatheInSteel(room, player, spell, nowSec);
  recordSpellUse(player, spell, nowSec, practice);
  player.castEndsAt = nowSec + spell.gatherSec;
  const policy = combatActionPolicy(player, nowSec);
  player.pendingSpell = { spell: spell.id, direction: normalize3(direction),
    ...(spell.id === 'line_of_conduct' ? { origin: {
      x: player.position.x, y: player.position.y + postureOf(player).eye - 0.1, z: player.position.z,
    } } : {}),
    ...(policy.concurrent ? { ultimate: true } : {}) };
  if (!policy.concurrent) {
    player.guarding = false;
    stopSwordChain(player, {}, room, nowSec);
  }
  player.spawnProtectionUntil = Math.min(player.spawnProtectionUntil, nowSec);
  room.events.push({ type: 'spellCast', playerId, spell: spell.id, at: nowSec, castEndsAt: player.castEndsAt });
  return true;
}

function preparedSelectionAllowed(room, player, spellId, nowSec) {
  return room.state === 'PLAYING' && player?.alive && preparedSpellMember(player, spellId)
    && (ultimateStartup(player, nowSec)?.id === 'chivalry' || combatActionPolicy(player, nowSec).concurrent);
}

/** Preselection changes the match spell, even when that identity is cooling. */
export function selectPreparedSpell(room, playerId, spellId, nowSec) {
  const player = room.players.get(playerId);
  if (!preparedSelectionAllowed(room, player, spellId, nowSec)) return false;
  if((player.operatingFightFlightId||player.operatingBallistaId||player.operatingRamId)&&
    (spellId!=='steel'||!operatedSiegeSteelMachine(room,player)))return false;
  player.spellReadyById ??= {};
  // Capture legacy state before switching, for hosts that restored an older player shape.
  player.spellReadyById[player.spell] ??= player.spellReadyAt ?? 0;
  player.spell = spellId;
  player.preparedSpellSelected = true;
  player.spellReadyAt = player.spellReadyById[spellId] ?? 0;
  return true;
}

/** Select a valid prepared identity and attempt its cast in the same authoritative command. */
export function castPreparedSpell(room, playerId, spellId, direction, nowSec) {
  if (!selectPreparedSpell(room, playerId, spellId, nowSec)) return false;
  const player = room.players.get(playerId);
  if (!combatActionPolicy(player, nowSec).concurrent) return false;
  return tryCastSpell(room, playerId, direction, nowSec);
}

// Steel keeps its ordinary identity clock and mechanics.
function sheatheInSteel(room, player, spell, nowSec) {
  if (player.pendingSpell) return false;
  const seated=Boolean(player.operatingFightFlightId||player.operatingBallistaId||player.operatingRamId);
  const operating=seated?operatedSiegeSteelMachine(room,player):null;
  if(seated&&!operating)return false;
  if(operating&&!beginSiegeSteel(room,operating.machine,operating.kind,player,nowSec))
    return false; // a previous ward cannot be duplicated during the training recast window
  player.steel = callSteel(nowSec);
  // (a knight carrying All-Natural Disaster, on their own feet, may earn a Steel stage with this use: stepSteelInfusion)
  if (!seated && player.ultimate === 'one_hit_of_wonders') player.steel.earning = true;
  recordSpellUse(player, spell, nowSec, practising(room, player));
  player.spawnProtectionUntil = Math.min(player.spawnProtectionUntil, nowSec);
  room.events.push({ type: 'steelOn', playerId: player.id, at: nowSec, readyAt: player.spellReadyAt });
  return true;
}

/**
 * Steel, the fifth infusion. One Sheathe in Steel use, worn through its whole fully hardened spell without the knight
 * being staggered or killed, earns one stage (two such uses: Full Steel). A use that qualifies, by a knight who then
 * holds a Steel stage, also keeps its plate fully hardened until Steel's own cooldown is over; then it wears off as
 * it always does. The longer plate is the one use's: it earns nothing further.
 */
function stepSteelInfusion(room, player, nowSec) {
  const steel = player.steel;
  if (!steel?.earning || !player.alive) return;
  if (nowSec < player.staggerUntil) { player.steel = { ...steel, earning: false }; return; }
  if (nowSec < steel.calledAt + STEEL.fullSec) return;
  const earned = creditOneHitEncounter(player, 'steel', `steel:${player.id}:${steel.calledAt}`);
  const held = normalizeInfusions(player.oneHitInfusions).steel >= 1;
  player.steel = { ...steel, earning: false,
    ...(held ? { fullUntil: Math.max(steel.fullUntil, steel.calledAt + STEEL.cooldownSec), extended: true } : {}) };
  if (earned) room.events.push({ type: 'oneHitInfusion', playerId: player.id, element: 'steel', tier: player.oneHitInfusions.steel, at: nowSec });
  if (held) room.events.push({ type: 'steelExtended', playerId: player.id, fullUntil: player.steel.fullUntil, at: nowSec });
}

/**
 * The spell's key: the spell, if it is ready; while it is on its cooldown, the gauntlet, on command
 * (shared/src/gauntlet.mjs). pressedAt: the player's own moment.
 */
export function tryCastOrGauntlet(room, playerId, direction, nowSec, pressedAt = nowSec) {
  const player = room.players.get(playerId);
  if (!player) return false;
  // A cooling mounted Steel key never becomes a free gauntlet strike.
  if(player.operatingFightFlightId||player.operatingBallistaId||player.operatingRamId)
    return tryCastSpell(room,playerId,direction,nowSec);
  if (player.preparedSpellSelected || combatActionPolicy(player, nowSec).concurrent || spellReady(player, spellFor(player.spell), nowSec, practising(room, player))) return tryCastSpell(room, playerId, direction, nowSec);
  // (in the yard the key is the spell's: it comes back after a moment; the gauntlet keeps its own key)
  if (practising(room, player)) return false;
  return tryGauntletStrike(room, playerId, nowSec, pressedAt);
}

/**
 * The magic hand's armoured fist, thrown whenever it is asked for: at the nearest foe within reach (judged where
 * everyone stood at the player's moment), or at the air. Never through the sword: not while a committed strike has
 * yet to land, nor while a blade is live. Thrown in a chain's recovery, it ends the chain; and nothing attacks again
 * before its own recovery is over.
 */
export function tryGauntletStrike(room, playerId, nowSec, pressedAt = nowSec) {
  const player = room.players.get(playerId);
  if (room.state !== 'PLAYING' || !player || !player.alive) return false;
  if (nowSec < player.staggerUntil || player.pendingSpell || player.gauntlet || ultimateStartup(player, nowSec) || handsTaken(player, nowSec)) return false;
  if (flashFrozen(player, nowSec)) return false;
  if (nowSec < (player.gauntletReadyAt ?? -Infinity)) return false;
  if (player.attackSweep || (player.attackActive && player.attackNextStrike < player.attackCommitted)) return false;
  const at = Math.min(nowSec, pressedAt);
  const from = transformFor(player, at);
  const foes = [];
  for (const other of room.players.values()) {
    if (other.id === player.id || !other.alive) continue;
    foes.push({ id: other.id, position: transformFor(other, at).position });
  }
  const best = gauntletTarget(from.position, from.yaw, foes);
  const aimed = best && !targetBlockedByWorld(from, transformFor(room.players.get(best.foe.id), at), room.world ?? {}) ? best.foe.id : null;
  if (player.attackActive) {
    stopSwordChain(player, {}, room, nowSec);
    room.events.push({ type: 'attackEnded', playerId, at: nowSec });
  }
  player.guarding = false;
  const landAt = at + GAUNTLET.startup;
  player.gauntlet = { targetId: aimed, landAt };
  player.gauntletReadyAt = landAt + GAUNTLET.recovery;
  player.attackRestartAt = Math.max(player.attackRestartAt ?? -Infinity, player.gauntletReadyAt);
  player.spawnProtectionUntil = Math.min(player.spawnProtectionUntil, nowSec);
  room.events.push({ type: 'gauntletStrike', playerId, targetId: aimed, at: nowSec, landAt });
  return true;
}

// the fist lands: on the foe it was thrown at if they are still within reach (it follows through a little), else on
// whoever is nearest within reach now, on a guard facing it, or on nothing (the air)
function landGauntlet(room, player, nowSec, world) {
  const blow = player.gauntlet;
  player.gauntlet = null;
  const miss = (reason) => room.events.push({ type: 'gauntletMiss', playerId: player.id, targetId: blow.targetId, reason, at: nowSec });
  if (!player.alive) return miss('gone');
  const at = Math.min(nowSec, blow.landAt);
  const from = transformFor(player, at);
  let target = null;
  let g = null;
  for (const other of room.players.values()) {
    if (other.id === player.id || !other.alive || areAllies(room, player.id, other.id)) continue;
    const to = transformFor(other, at);
    const placed = gauntletGeometry(from.position, from.yaw, to.position);
    if (!withinGauntlet(placed, GAUNTLET.landSlack) || targetBlockedByWorld(from, to, world)) continue;
    // the one it was thrown at first; otherwise the nearest
    const better = !target || other.id === blow.targetId || (target.id !== blow.targetId && placed.distance < g.distance);
    if (better) { target = other; g = placed; }
  }
  if (!target) return miss(blow.targetId ? 'reach' : 'air');
  if (target.spawnProtectionUntil > nowSec) return miss('protected');
  if (target.guarding && isInGuardCone(target, player, at)) {
    guardChallengeContact(room, target, player, nowSec);
    // a guard facing it pays a little; one spent by it is lowered, never broken (no stagger)
    target.guardStamina = Math.max(0, target.guardStamina - GAUNTLET.guardCost);
    target.lastGuardDrainAt = nowSec;
    if (target.guardStamina <= 0) target.guarding = false;
    room.events.push({ type: 'gauntletHit', playerId: player.id, targetId: target.id, guarded: true, at: nowSec });
    return;
  }
  // (a fist is a melee blow too: a shocked knight's lands on themselves)
  if (dischargeShockingConduct(room, player, target, nowSec, { gauntlet: true })) return;
  // hardened plate blunts it as it would a sword's clean blow
  const armour = steelBlunt(target.steel, GAUNTLET.damage, nowSec);
  target.steel = steelTakes(target.steel, nowSec);
  const push = { x: g.direction.x * GAUNTLET.shove, y: 0.1, z: g.direction.z * GAUNTLET.shove };
  applyDamage(room, player.id, target.id, armour.amount, 'gauntlet', nowSec, push, {
    steel: armour.strength, turned: GAUNTLET.damage - armour.amount, rawDamage: GAUNTLET.damage,
  });
  staggerBy(room, target, STAGGER.gain.gauntlet, nowSec, player.id);
  room.events.push({ type: 'gauntletHit', playerId: player.id, targetId: target.id, guarded: false, steel: armour.strength, at: nowSec });
}

// --- the Steel dash ram (steelRam.mjs) -------------------------------------------------------------------------------

// the knights a ram could meet: the living other than the rammer, none just risen
function rammable(room, player, nowSec) {
  const bodies = [];
  for (const other of room.players.values()) {
    if (other.id === player.id || !other.alive || other.spawnProtectionUntil > nowSec || areAllies(room, player.id, other.id)) continue;
    bodies.push({ id: other.id, position: other.position });
  }
  return bodies;
}

// a Steel dash carried from `from` to where it is now: the first knight it met is rammed (never one through a wall)
function ramThrough(room, player, from, nowSec, world) {
  const met = ramContact(from, player.position, rammable(room, player, nowSec));
  if (!met) return;
  const target = room.players.get(met.id);
  const start = [met.at.x, met.at.y + postureOf(player).center, met.at.z];
  const end = [target.position.x, target.position.y + postureOf(target).center, target.position.z];
  if ((world.solids ?? []).some((box) => segmentAabbHit(start, end, box))) return;
  landRam(room, player, target, met, nowSec, world);
}

/**
 * A ram lands on `target`: the rammer stops dead where they met (set back a little), the one met takes the momentum
 * (a light blow, the shove, a part of their balance), or braces against it with a guard facing it.
 */
function landRam(room, player, target, met, nowSec, world) {
  const { strength } = player.dashRam;
  const dash = { ...player.dashDir };
  // the rammer: stopped dead where they met, set back a little (the momentum is theirs now)
  player.position = resolvePlayerWorld({ ...met.at }, MOVEMENT.playerRadius, world.solids ?? [], postureOf(player).height);
  player.dashUntil = nowSec;
  player.dashRam = null;
  player.velocity.x = 0;
  player.velocity.z = 0;
  shoveBody(player, { x: -dash.x * STEEL_RAM.setback, z: -dash.z * STEEL_RAM.setback });
  // (a ram is an attack: a just-risen knight's protection ends with it, as with any other)
  player.spawnProtectionUntil = Math.min(player.spawnProtectionUntil, nowSec);
  // the one met: a dash of their own ends there, and nothing else does (unless their balance breaks)
  if (nowSec < (target.dashUntil ?? -Infinity)) {
    target.dashUntil = nowSec;
    target.dashRam = null;
  }
  // thrown the way the rammer was going, a little toward where the two met (a glancing ram throws them aside)
  const wayX = dash.x * 0.6 + met.normal.x * 0.4;
  const wayZ = dash.z * 0.6 + met.normal.z * 0.4;
  const length = Math.hypot(wayX, wayZ) || 1;
  const way = { x: wayX / length, z: wayZ / length };
  const guarded = Boolean(target.guarding) && isInGuardCone(target, player, nowSec);
  const effect = ramEffect(strength, { guarded });
  const plate = steelStrength(target.steel, nowSec);
  const armour = guarded ? { amount: 0, strength: plate } : steelBlunt(target.steel, effect.damage, nowSec);
  let guardBroken = false;
  if (guarded) {
    guardChallengeContact(room, target, player, nowSec);
    target.guardStamina = Math.max(0, target.guardStamina - effect.guardStamina);
    target.lastGuardDrainAt = nowSec;
    guardBroken = target.guardStamina <= 0;
  }
  const scale = staggerShove(target.stagger);
  const push = { x: way.x * effect.shove * scale, y: effect.lift, z: way.z * effect.shove * scale };
  // where the two met: between them, chest high
  const point = {
    x: met.at.x + met.normal.x * STEEL_RAM.reach * 0.5,
    y: Math.max(met.at.y, target.position.y) + 1.15,
    z: met.at.z + met.normal.z * STEEL_RAM.reach * 0.5,
  };
  // (said after what it did: a blow's damage comes first, as a sword's does before its swordHit)
  const rammed = {
    type: 'steelRam', playerId: player.id, targetId: target.id, point, direction: way, strength: round2(strength), guarded,
    ...(guardBroken ? { guardBroken: true } : {}), steel: round2(plate), amount: armour.amount, push, at: nowSec,
  };
  if (guarded) {
    shoveBody(target, push);
    target.lastAttackerId = player.id;
    target.lastKnockbackAt = nowSec;
    target.lastKnockbackSource = 'ram';
    target.lastKnockbackBy = player.id;
    if (guardBroken) {
      // a guard spent by it breaks, as any guard does
      breakGuard(target, GAME.guardBreakStaggerMs / 1000, nowSec);
      if (!combatActionPolicy(player, nowSec).concurrent) gainProwess(room, player, PROWESS.guardBreak);
      room.events.push({ type: 'guardBreak', attackerId: player.id, defenderId: target.id, ram: true, at: nowSec });
      staggerBy(room, target, STAGGER.gain.guardBreak, nowSec, player.id);
    } else {
      staggerBy(room, target, effect.stagger, nowSec, player.id);
    }
    room.events.push(rammed);
    return;
  }
  // hardened plate on them takes from the hurt only: the shove and the balance are the ram's
  target.steel = steelTakes(target.steel, nowSec);
  applyDamage(room, player.id, target.id, armour.amount, 'ram', nowSec, { x: way.x * effect.shove, y: effect.lift, z: way.z * effect.shove }, {
    steel: armour.strength, turned: effect.damage - armour.amount, rawDamage: effect.damage,
    ultimate: combatActionPolicy(player, nowSec).concurrent,
    contactFacts: challengeContact(player, nowSec, { ram: round2(strength) }),
  });
  staggerBy(room, target, effect.stagger, nowSec, player.id);
  room.events.push(rammed);
}

function transformFor(player, atSec) {
  return sampleTransform(player, atSec);
}

export function isInGuardCone(defender, attacker, atSec) {
  const d = transformFor(defender, atSec);
  const a = transformFor(attacker, atSec);
  const toAttackerX = a.position.x - d.position.x;
  const toAttackerZ = a.position.z - d.position.z;
  const mag = Math.hypot(toAttackerX, toAttackerZ) || 1;
  const f = forwardFromYaw(d.yaw);
  const dot = f.x * (toAttackerX / mag) + f.z * (toAttackerZ / mag);
  return dot >= Math.cos((115 * Math.PI / 180) / 2);
}

function targetBlockedByWorld(attackerTransform, targetTransform, world) {
  const start = [attackerTransform.position.x, attackerTransform.position.y + postureOf(attackerTransform).eye, attackerTransform.position.z];
  const end = [targetTransform.position.x, targetTransform.position.y + postureOf(targetTransform).center, targetTransform.position.z];
  for (const box of world.solids ?? []) {
    if (segmentAabbHit(start, end, box)) return true;
  }
  return false;
}

function recoilFromWall(attacker, hit, nowSec, room) {
  const f = forwardFromYaw(attacker.yaw);
  attacker.velocity.x = -f.x * 3.1;
  attacker.velocity.z = -f.z * 3.1;
  stopSwordChain(attacker, {}, room, nowSec);
  attacker.attackRestartAt = Math.max(attacker.attackRestartAt ?? -Infinity, nowSec + 0.22);
  room.events.push({
    type: 'swordWorldImpact',
    playerId: attacker.id,
    point: { x: hit.point[0], y: hit.point[1], z: hit.point[2] },
    normal: { x: hit.normal[0], y: hit.normal[1], z: hit.normal[2] },
    surfaceId: hit.box.id,
    // what the blade struck (stone rings and sparks; timber thunks; a hedge or cloth only takes it)
    material: hit.box.material ?? 'stone',
    ...(hit.snag ? { snag: true } : {}),
    at: nowSec,
  });
}

// a blade that met the world this far or more off its aim, on a furnishing marked incidental (shared/worlds/props.mjs),
// was caught in passing: a snag (for a rare line of the knight's; the blow is stopped as any other)
export const SNAG = Object.freeze({ offAimDeg: 12 });

// --- the sword strike -------------------------------------------------------------------------------------------
// A strike is live for a short stretch around its contact (from where its swing begins to MELEE_CONTACT.follow past
// the contact: its driven part, not its follow-through): its blade (shared/src/blade.mjs) sweeps through the strike's
// arc in the attacker's view, and the first thing it passes through takes it: a knight takes the blow; anything solid
// stops the blade up to its contact (it rings off, and the knight recoils), and nothing beyond it is touched. How cleanly a knight is caught is how far off the attacker's aim they were; how hard the two were closing
// adds to the impact. Everything is judged on the lag-compensated transforms of the moment (history.mjs), a sixtieth
// of a second apart, and the blade is swept between those moments in steps of a couple of degrees (it cannot pass
// through anything between them).

const SWEEP_STEP = 1 / 60;

// the next moment to judge after `after`: the live stretch in even steps of about SWEEP_STEP, the contact itself
// always one of them
function nextSample(window, after) {
  const leg = (from, to) => {
    const steps = Math.max(1, Math.ceil((to - from) / SWEEP_STEP - 1e-9));
    const step = (to - from) / steps;
    return from + (Math.floor((after - from) / step + 1e-9) + 1) * step;
  };
  return after < window.contact - 1e-9 ? Math.min(window.contact, leg(window.from, window.contact)) : Math.min(window.to, leg(window.contact, window.to));
}

// where a strike's live stretch lies (absolute seconds): from where its swing begins to `follow` past its contact
// (the rest of the swing is follow-through); a slam's is its whole swing, driven on down into the ground
function strikeWindow(player, strike, slam = false) {
  const contact = player.attackStartedAt + SWORD_STRIKE_TIMES[strike];
  return { contact, from: contact - MELEE_CONTACT.window.early, to: contact + (slam ? MELEE_CONTACT.window.late : MELEE_CONTACT.follow) };
}

// a knight's eyes and aim at a moment (lag-compensated): where the blade swings from, and where they look from
function bladeOrigin(transform) {
  const body = postureOf(transform);
  const at = transform.position;
  return {
    eye: { x: at.x, y: at.y + body.eye, z: at.z },
    view: { x: at.x, y: at.y + body.camera, z: at.z },
    frame: aimFrame(transform.yaw, transform.pitch ?? 0),
  };
}

// the chain's chop: a slam is swung as this strike, whichever of the chain it is
const SLAM_STRIKE = 2;

// What stops a Sundering blade. A blow of the greatest force is not turned by what it brushes on its way. Only what
// truly stands in the way of the blow being driven down stops it: a face met squarely (a wall dead ahead), close about
// its aim. Never a small loose furnishing; never a face it only glances along; and the top of anything it comes down
// onto (a terrace's lip, a heap, a step, a beam, or over such an edge) is ground to it: it is driven in there, and
// ruptures what floor there is. A wall still hides whoever stands behind it. The stretch of blade nearest the hands
// sweeps a little wider (a knight pressed close beside the cut is struck), the rest is as narrow as ever. These are
// rules of the geometry, so they hold on any map. An ordinary blade is as it was.
const SUNDER_SWEEP = Object.freeze({
  blade: Object.freeze({ ...BLADE, worldStopDeg: ULTIMATES.sunder.worldStopDeg, hilt: ULTIMATES.sunder.hilt }),
  spares: (solid) => Boolean(solid.incidental),
  topsAreGround: true,
  corner: ULTIMATES.sunder.cornerM,
  stopIncidence: ULTIMATES.sunder.stopIncidence,
});

// the aim a strike is swung along: a slam's is driven down to at least the ultimate's slamPitch
function strikeFrame(transform, slam) {
  const pitch = transform.pitch ?? 0;
  return aimFrame(transform.yaw, slam ? Math.min(pitch, ultimateFor('sunder').slamPitch) : pitch);
}

/** Begin a strike's live stretch (its swing is heard from here). */
function openStrike(room, player, strike, nowSec) {
  player.attackOpened = strike;
  const window = strikeWindow(player, strike, Boolean(player.attackSlam));
  // (a chain begun Sundering: the strike is a slam, whichever of the chain it is; driven into the ground while the
  // Sunder lasts, it splits it)
  const slam = Boolean(player.attackSlam);
  // (which cut it is: the blade swept, the contact judged and the swing heard by the cut, not its place in the chain)
  const kind = slam ? SLAM_STRIKE : strikeKind(player.attackVariant ?? 0, strike);
  player.attackSweep = { strike, kind, sampledTo: window.from, direction: null, slam, ruptures: slam && sundering(player, nowSec), struck: null };
  room.events.push({ type: 'swordSwing', playerId: player.id, strikeIndex: strike, kind, ...(slam ? { slam: true } : {}), at: nowSec });
  // (for Seize Thy Slayer: whether a damaging spell was there to be thrown as this strike began, and what it would do)
  const spell = spellFor(player.spell);
  const castable = spell.kind !== 'ward' && !player.pendingSpell && spellReady(player, spell, nowSec, practising(room, player));
  recordChallengeFact(room, { type: 'swordSwing', playerId: player.id, chainId: player.attackChainId, strikeIndex: strike,
    spellReady: castable, spellNominal: castable ? nominalSpellDamage(spell) : 0, at: nowSec });
}

/**
 * A grounded Fight-and-Flight pilot's Guard. The apparatus stands round its rider (braces either side, pan, rear plate,
 * crossmembers), so a blade aimed at a guarding pilot usually met a brace first and was taken by the machine, and the
 * pilot's Guard never came into it. A blade that meets one of those parts within the pilot's defensive reach (`reach`
 * from the line of their body, `low` to `high` above their feet), from inside their guard cone, is met by the pilot's
 * Guard instead: blocked, parried or breaking it at the ordinary cost. Nothing else changes: the rotor overhead, parts
 * out of reach, blows from outside the cone, a pilot not guarding and an airborne machine (whose rider cannot guard)
 * all stay the machine's, as before.
 */
export const PILOT_GUARD = Object.freeze({ reach: 0.85, low: 0.45, high: 1.85, parts: Object.freeze(['braceL', 'braceR', 'main']) });

export function pilotGuardTakes(room, attacker, met, atSec) {
  const machine = room.fightFlight;
  if (!machine?.grounded || !met?.solid?.componentId || !String(met.solid.id ?? '').startsWith('fight-flight-')) return null;
  if (!PILOT_GUARD.parts.includes(met.solid.componentId)) return null;
  const pilot = room.players.get(machine.operatorId);
  if (!pilot?.alive || !pilot.guarding || pilot.id === attacker.id || areAllies(room, attacker.id, pilot.id)) return null;
  if (!isInGuardCone(pilot, attacker, atSec)) return null;
  const feet = transformFor(pilot, atSec).position;
  const y = Math.max(feet.y + PILOT_GUARD.low, Math.min(feet.y + PILOT_GUARD.high, met.point.y));
  return Math.hypot(met.point.x - feet.x, met.point.y - y, met.point.z - feet.z) <= PILOT_GUARD.reach ? pilot : null;
}

/**
 * Carry a live strike's sweep on to `nowSec`: it meets a body, meets something solid, or runs out (a miss). A slam
 * (Sundering) that meets a body goes on through: unless it was parried, it is carried on down into the ground, where
 * its rupture catches whoever stands on its line, the knight it struck among them.
 */
function sweepStrike(room, player, nowSec, world) {
  const live = player.attackSweep;
  if (!live) return;
  const window = strikeWindow(player, live.strike, live.slam);
  const until = Math.min(nowSec, window.to);
  // Incoming blades must actually meet rotor/braces/chassis before a covered
  // rider. The mounted knight may swing *out* through their own hardware.
  const flightCover=room.fightFlight?.operatorId===player.id?[]:fightFlightHitVolumes(room.fightFlight);
  const solids = [...(world.solids ?? []), ...biByeHitVolumes(room.biByeLlista, nowSec),
    ...soFistVolumes(room.soFistication,nowSec),...flightCover];
  const blade = live.slam ? SLAM_STRIKE : live.kind ?? live.strike;
  while (player.attackSweep === live && live.sampledTo < until - 1e-9) {
    const at = Math.min(until, nextSample(window, live.sampledTo));
    const transform = transformFor(player, at);
    const { eye } = bladeOrigin(transform);
    const frame = strikeFrame(transform, live.slam);
    // (the blade is carried round with the knight as they turn: where it was is where it was in their hands)
    const from = live.direction ?? bladeDirection(blade, live.sampledTo - window.contact, frame);
    const to = bladeDirection(blade, at - window.contact, frame);
    const bodies = [];
    for (const target of live.struck ? [] : room.players.values()) {
      if (target.id === player.id || !target.alive || areAllies(room, player.id, target.id)) continue;
      const placed = transformFor(target, at);
      bodies.push({ id: target.id, base: placed.position, top: postureOf(placed).crown });
    }
    // (a Sundering slam strikes the ground too: a blade driven into it ruptures it)
    const ground = live.ruptures ? world.floors ?? null : null;
    // (the world stops the blade only up to its contact: past that it is swinging through, not driven)
    const driven = live.sampledTo < window.contact + MELEE_CONTACT.worldFollow - 1e-9;
    // (and a Sundering blade only where it is driven straight into something: SUNDER_SWEEP)
    const met = sweepBlade(eye, from, to, bodies, solids, { aim: frame.forward, ground, world: driven, ...(live.ruptures ? SUNDER_SWEEP : {}) });
    const prevSampled = live.sampledTo;
    live.sampledTo = at;
    live.direction = to;
    if (met?.kind === 'body') {
      const contactAt = Number.isFinite(met.stepFraction)
        ? prevSampled + (at - prevSampled) * met.stepFraction
        : at;
      const outcome = landStrike(room, player, live.slam ? SLAM_STRIKE : live.strike, room.players.get(met.id), contactAt, nowSec, met, window.contact, blade);
      if (!live.slam || outcome === 'parry' || player.attackSweep !== live) {
        if (player.attackSweep === live) player.attackSweep = null;
        return;
      }
      live.struck = met.id;
      continue;
    }
    if (met?.kind === 'solid') {
      // a grounded pilot's Guard meets a blade on the apparatus within their defensive reach (PILOT_GUARD)
      const metAt = Number.isFinite(met.stepFraction) ? prevSampled + (at - prevSampled) * met.stepFraction : at;
      const pilot = pilotGuardTakes(room, player, met, metAt);
      if (pilot) {
        landStrike(room, player, live.slam ? SLAM_STRIKE : live.strike, pilot, metAt, nowSec, met, window.contact, blade);
        if (player.attackSweep === live) player.attackSweep = null;
        return;
      }
      player.attackSweep = null;
      if (met.solid.componentId) {
        const quality = aimQuality(Math.acos(Math.max(-1,Math.min(1,met.direction.x*frame.forward.x+met.direction.y*frame.forward.y+met.direction.z*frame.forward.z))) * 180/Math.PI);
        const ram=met.solid.id?.startsWith('sofist-');
        const flight=met.solid.id?.startsWith('fight-flight-');
        const damage=swordDamage({quality,level:live.ruptures?DAMAGE_LEVELS.elevated:DAMAGE_LEVELS.normal});
        (flight?damageFightFlight:ram?damageSoFistication:damageBiByeLlista)(
          room,flight?room.fightFlight:ram?room.soFistication:room.biByeLlista,
          damage,player.id,'sword',nowSec,
          {componentId:met.solid.componentId,point:met.point,material:met.solid.material});
      }
      if(String(met.solid.id??'').startsWith('siege-ladder-'))damageRestlessLadder(room,met.solid.id.split('-').slice(2,4).join('-'),swordDamage({level:DAMAGE_LEVELS.normal}),player.id,nowSec);
      damageStructureSolid(room,met.solid,swordDamage({quality:aimQuality(Math.acos(Math.max(-1,Math.min(1,met.direction.x*frame.forward.x+met.direction.y*frame.forward.y+met.direction.z*frame.forward.z)))*180/Math.PI),level:live.ruptures?DAMAGE_LEVELS.elevated:DAMAGE_LEVELS.normal}),player.id,'sword',nowSec,{point:met.point});
      // a snag: the blade caught on some small incidental furnishing as it came round, not driven at it (SNAG)
      const offAim = Math.acos(Math.max(-1, Math.min(1, met.direction.x * frame.forward.x + met.direction.y * frame.forward.y + met.direction.z * frame.forward.z))) * 180 / Math.PI;
      const snag = Boolean(met.solid.incidental) && offAim >= SNAG.offAimDeg;
      recoilFromWall(player, { point: [met.point.x, met.point.y, met.point.z], normal: met.normal, box: met.solid, snag }, nowSec, room);
      return;
    }
    if (met?.kind === 'ground') {
      player.attackSweep = null;
      groundStrike(room, player, live.strike, met, nowSec, world, { through: live.struck });
      return;
    }
  }
  if (player.attackSweep === live && live.sampledTo >= window.to - 1e-9) {
    player.attackSweep = null;
    // (a slam that went through someone and found no ground beneath was no miss)
    if (!live.struck) room.events.push({ type: 'swordMiss', playerId: player.id, strikeIndex: live.strike, kind: blade, at: nowSec });
  }
}

/** A counterfactual made at the instant we kill this foe: was their own
 * already-live sword/gauntlet contact about to kill us? No animation flags,
 * client hints or speculative future input. Sample the same swept blade,
 * geometry, walls and mitigation rules as a normal authoritative hit. */
function lethalIncomingCounter(room, defender, opponent, atSec) {
  if (!(defender?.alive && opponent?.alive) || defender.guarding
    || atSec < (defender.spawnProtectionUntil ?? -Infinity)) return false;
  // A prepared gauntlet strike is already committed to its actual target.
  const gauntlet = opponent.gauntlet;
  if (gauntlet && gauntlet.targetId === defender.id
    && gauntlet.landAt >= atSec && gauntlet.landAt - atSec <= .18) {
    const from = transformFor(opponent, gauntlet.landAt);
    const to = transformFor(defender, gauntlet.landAt);
    const placed = gauntletGeometry(from.position, from.yaw, to.position);
    if (withinGauntlet(placed, GAUNTLET.landSlack)
      && !targetBlockedByWorld(from, to, room.world ?? {})
      && steelBlunt(defender.steel, GAUNTLET.damage, gauntlet.landAt).amount >= defender.health) return true;
  }
  const active = opponent.attackSweep;
  if (!active || active.struck || !opponent.attackActive) return false;
  const win = strikeWindow(opponent, active.strike, active.slam);
  const fromAt = Math.max(atSec, active.sampledTo, win.from);
  const toAt = Math.min(atSec + .18, win.to);
  if (!(toAt > fromAt + 1e-9)) return false;
  const blade = active.slam ? SLAM_STRIKE : active.kind ?? active.strike;
  const solids = [...(room.world?.solids ?? []), ...biByeHitVolumes(room.biByeLlista, atSec),
    ...soFistVolumes(room.soFistication, atSec), ...fightFlightHitVolumes(room.fightFlight)];
  const target = transformFor(defender, atSec);
  const bodies = [{ id: defender.id, base: target.position, top: postureOf(target).crown }];
  const enemy = transformFor(opponent, atSec);
  const frame = strikeFrame(enemy, active.slam);
  const { eye } = bladeOrigin(enemy);
  const empowered = sundering(opponent, atSec) && steelStrength(defender.steel, atSec) <= .005;
  for (let t = fromAt; t < toAt - 1e-9; t += SWEEP_STEP) {
    const next = Math.min(toAt, t + SWEEP_STEP);
    const met = sweepBlade(eye,
      bladeDirection(blade, t - win.contact, frame),
      bladeDirection(blade, next - win.contact, frame),
      bodies, solids, { aim: frame.forward, world: t < win.contact + MELEE_CONTACT.worldFollow - 1e-9,
        ...(active.ruptures ? SUNDER_SWEEP : {}) });
    if (!met) continue;
    // If real geometry hits a wall first, the blade cannot subsequently hit us.
    if (met.kind !== 'body' || met.id !== defender.id) return false;
    const at = t + (next - t) * (met.stepFraction ?? 1);
    const q = evaluateBladeHeatmap(blade, { dt: at - win.contact, along: met.along,
      point: met.point, direction: met.direction, eye, frame: bladeOrigin(enemy).frame,
      targetBase: target.position, targetTop: postureOf(target).crown }).quality;
    const effective = empowered ? GAME.swordElevated
      : swordDamage({ quality: steelQuality(defender.steel, q, at).quality, level: DAMAGE_LEVELS.normal });
    return Number.isFinite(effective) && effective >= defender.health;
  }
  return false;
}

/** The blow lands on `target`: parried, blocked or a hit, as cleanly and as hard as it was met. */
// strikeIndex: its place in the chain; kind: which cut it is (strikeKind), by which its contact is judged
function landStrike(room, attacker, strikeIndex, target, atSec, nowSec, met = null, contactSec = null, kind = strikeIndex) {
  if (target.spawnProtectionUntil > nowSec) {
    room.events.push({ type: 'swordProtected', playerId: attacker.id, targetId: target.id, strikeIndex, at: nowSec });
    return 'protected';
  }
  const attackerTransform = transformFor(attacker, atSec);
  const targetTransform = transformFor(target, atSec);
  const { view, eye, frame: viewFrame } = bladeOrigin(attackerTransform);
  const frame = strikeFrame(attackerTransform, Boolean(attacker.attackSweep?.slam));
  const dx = targetTransform.position.x - attackerTransform.position.x;
  const dz = targetTransform.position.z - attackerTransform.position.z;
  const horizontal = Math.hypot(dx, dz);
  // how cleanly: continuous curved heatmap when met contact geometry is known;
  // falling back to legacy aim quality if called directly without sweep contact.
  let quality;
  // (how it was judged, for the F3 debugger: where along the blade, how early or late, at what angle)
  let heat = null;
  if (met && Number.isFinite(contactSec)) {
    const dt = atSec - contactSec;
    // Accurate physical contact distance along the blade ray.
    // We strictly use met.along to measure cutting node reach rather than allowing
    // center-to-center horizontal body distance to artificially promote cramped or hilt contact.
    const along = met.along;
    const evalRes = evaluateBladeHeatmap(kind, {
      dt,
      along,
      point: met.point,
      direction: met.direction,
      eye,
      frame: viewFrame,
      targetBase: targetTransform.position,
      targetTop: postureOf(targetTransform).crown,
    });
    quality = evalRes.quality;
    heat = { along: +along.toFixed(3), reach: evalRes.reach, dt: evalRes.dt, qReach: evalRes.qReach, qPhase: evalRes.qPhase, qAngle: evalRes.qAngle };
  } else {
    const offAim = offAimDegrees(view, frame.forward, targetTransform.position, postureOf(targetTransform).crown);
    quality = aimQuality(offAim);
  }
  const f = forwardFromYaw(attackerTransform.yaw);
  const g = { direction: horizontal > 1e-6 ? { x: dx / horizontal, z: dz / horizontal } : { x: f.x, z: f.z } };
  // how hard they were closing on each other along the line between them
  const closing = ((attacker.velocity?.x ?? 0) - (target.velocity?.x ?? 0)) * g.direction.x
    + ((attacker.velocity?.z ?? 0) - (target.velocity?.z ?? 0)) * g.direction.z;
  const impact = closingImpact(closing);

  // Sundering, every blow is the most forceful it could be, struck at the elevated level. Against hardened plate the
  // two meet halfway: an ordinary blow by ordinary rules (the plate turns nothing, Sunder adds nothing, and the
  // plate's own clock is left as it was).
  const sunder = sundering(attacker, nowSec);
  const hardened = steelStrength(target.steel, nowSec) > 0.005;
  const cancelled = sunder && hardened;
  const empowered = sunder && !hardened;
  const physical = empowered ? MAX_FORCE : { quality, impact };
  const level = empowered ? DAMAGE_LEVELS.elevated : DAMAGE_LEVELS.normal;
  const force = swordForce(physical);

  const automaticParry=chivalryParries({...target,yaw:targetTransform.yaw},nowSec,{
    x:attackerTransform.position.x-targetTransform.position.x,
    z:attackerTransform.position.z-targetTransform.position.z,
  });
  const bladeGuard=vortexBladeGuards(target,attacker,nowSec);
  if (automaticParry || target.guarding && isInGuardCone(target, attacker, atSec) || bladeGuard) {
    guardChallengeContact(room, target, attacker, nowSec);
    // a Sundering blow lands on a guard as two (the guard pays for both; it is still one blow)
    const impacts = empowered ? ultimateFor('sunder').guardImpacts : 1;
    // a glancing blow bears less on the guard, a collision more.
    // Ordinary contact (quality >= 0.35) applies full baseline pressure (22 stamina, 5 blocks to break),
    // while marginal/glancing contact scales smoothly down to 0.6 pressure (13 stamina).
    const guardQuality = Math.min(1, physical.quality / 0.35);
    const pressure = (0.6 + 0.4 * guardQuality) * (1 + MELEE_CONTACT.impactGuard * physical.impact);
      const guardResult = resolveSwordVsGuard({
        guarding: true,
        // Sunder simply cannot be perfect-parried, even with Chivalry's
        // automatic parry. A successful timing gesture becomes the same
        // two-impact Guard block it would have been if held normally.
        // Vortex's moving sword also guards, but is never a perfect parry.
        guardAgeMs: empowered || bladeGuard ? Infinity :
          automaticParry ? 0 : (nowSec - target.guardStartedAt) * 1000,
        stamina: target.guardStamina,
        profile: guardProfile(target.knightClass),
        pressure,
        impacts,
      });
    target.guardStamina = guardResult.staminaAfter;
    if (bladeGuard)room.events.push({type:'vortexBladeGuard',attackerId:attacker.id,
      defenderId:target.id,point:met?.point??null,at:nowSec});
    if (guardResult.kind === 'parry') {
      target.parries += 1;
      const { suppressParryReel } = combatActionPolicy(attacker, nowSec);
      if (!suppressParryReel) {
        // (a Sundering knight turned by a perfect guard is stopped, and staggered for less: the blow is theirs to lose,
        // not the whole of their Sunder)
        attacker.staggerUntil = nowSec + (sunder ? ultimateFor('sunder').parriedSec : GAME.parryStaggerMs / 1000);
        stopSwordChain(attacker, {}, room, nowSec);
      }
      gainProwess(room, target, PROWESS.parry);
      room.events.push({
        type: 'parry', attackerId: attacker.id, defenderId: target.id, kind, strikeIndex, ...(heat ? { heat } : {}), suppressParryReel,
        ...(automaticParry?{automatic:true}:{}),
        ...(met?.point ? { point: { x: met.point.x, y: met.point.y, z: met.point.z } } : {}), at: nowSec,
      });
      recordChallengeFact(room, { type: 'parry', attackerId: attacker.id, defenderId: target.id, at: nowSec });
      recordPerryParry(room, attacker, target, nowSec);
      staggerBy(room, attacker, STAGGER.gain.parried, nowSec, target.id);
      return 'parry';
    }
    target.lastGuardDrainAt = nowSec;
    if (guardResult.kind === 'guardBreak') {
      breakGuard(target, (GAME.guardBreakStaggerMs / 1000) * (1 + MELEE_CONTACT.impactBreakStagger * physical.impact), nowSec);
      if (!combatActionPolicy(attacker, nowSec).concurrent && !attacker.attackChivalry) gainProwess(room, attacker, PROWESS.guardBreak);
      room.events.push({
        type: 'guardBreak', attackerId: attacker.id, defenderId: target.id, kind, strikeIndex, ...(heat ? { heat } : {}), impact: physical.impact, impacts,
        ...(bladeGuard?{vortexBlade:true}:{}), ...(sunder?{sunder:true}:{}),
        ...(met?.point ? { point: { x: met.point.x, y: met.point.y, z: met.point.z } } : {}), at: nowSec,
      });
      staggerBy(room, target, STAGGER.gain.guardBreak, nowSec, attacker.id);
    } else {
      room.events.push({
        type: 'block', attackerId: attacker.id, defenderId: target.id, kind, strikeIndex, ...(heat ? { heat } : {}), quality, impact: physical.impact, impacts,
        ...(bladeGuard?{vortexBlade:true}:{}), ...(sunder?{sunder:true}:{}),
        ...(met?.point ? { point: { x: met.point.x, y: met.point.y, z: met.point.z } } : {}), at: nowSec,
      });
      staggerBy(room, target, STAGGER.gain.sword * force * STAGGER.gain.blocked * impacts, nowSec, attacker.id);
    }
    return guardResult.kind === 'guardBreak' ? 'guardBreak' : 'block';
  }

  // Shocking Conduct: a shocked knight's own blow, at the moment it would really land (a miss, a parry or a blocked
  // blow is not one), is stopped before it does any harm and what is left of the potential goes into them instead.
  // It is the ATTACKER's status that is read here, never the defender's.
  if (dischargeShockingConduct(room, attacker, target, nowSec, { strikeIndex, kind })) return 'backlash';
  const shove = 1.7 * (1 + MELEE_CONTACT.impactKnockback * physical.impact);
  // (the chop, and every Sundering slam, comes down heavily enough to lift)
  const push = { x: g.direction.x * shove, y: kind === 2 || sunder ? 0.8 : 0.2, z: g.direction.z * shove };
  // hardened plate turns an ordinary blow toward a glancing one (never the shove); a cancelled Sunder is left alone
  const armour = cancelled ? { quality, strength: 0 } : steelQuality(target.steel, quality, nowSec);
  if (!cancelled) target.steel = steelTakes(target.steel, nowSec);
  const damage = swordDamage({ quality: armour.quality, level });
  const lethalCounter = damage >= target.health && lethalIncomingCounter(room, attacker, target, atSec);
  applyDamage(room, attacker.id, target.id, damage, 'sword', nowSec, push, {
    steel: armour.strength,
    turned: level === DAMAGE_LEVELS.normal ? swordDamageFor(quality) - damage : 0,
    clean: armour.quality >= CLEAN_CONTACT.sword,
    level,
    skipSteel: cancelled || armour.strength > 0,
    ultimate: sunder || Boolean(attacker.attackChivalry) || combatActionPolicy(attacker, nowSec).concurrent,
    rawDamage: sunder ? GAME.swordElevated : GAME.swordGlance + (GAME.swordDamage - GAME.swordGlance) * quality,
    contactFacts: challengeContact(attacker, atSec, { ordinary: !attacker.attackSlam && !sunder,
      chainId: attacker.attackChainId, strikeIndex, lethalThreat: lethalCounter,
      steel: cancelled ? steelStrength(target.steel, nowSec) : armour.strength }),
  });
  // (a Sundering blow on the body shakes a balance by its own measure: the heaviest single contact there is)
  staggerBy(room, target, empowered ? ultimateFor('sunder').stagger : STAGGER.gain.sword * force, nowSec, attacker.id);
  // and it ends what they were doing, there and then (whether or not their balance has broken), and leaves them reeling
  if (empowered) interruptHitActions(room, target, attacker.id, nowSec, 'sunder');
  room.events.push({
    type: 'swordHit', playerId: attacker.id, targetId: target.id, strikeIndex, kind, ...(heat ? { heat, judged: quality } : {}), quality: armour.quality, impact: physical.impact, steel: armour.strength,
    ...(level !== DAMAGE_LEVELS.normal ? { level } : {}), ...(cancelled ? { sunderMet: true } : {}),
    ...(met?.point ? { point: { x: met.point.x, y: met.point.y, z: met.point.z } } : {}), at: nowSec,
  });
  return 'hit';
}

/**
 * Shocking Conduct discharged: `attacker` (who carries it) was about to land a melee blow on `spared`. The blow is
 * stopped, the chain with it, and the potential left shocks the attacker (credited to whoever shocked them). Once.
 */
function dischargeShockingConduct(room, attacker, spared, nowSec, facts = {}) {
  const status = attacker.electricalBacklash;
  const charge = oneHitBacklashRemaining(status, nowSec);
  if (!(charge > 0)) return false;
  attacker.electricalBacklash = null;
  stopSwordChain(attacker, {}, room, nowSec);
  attacker.gauntlet = null;
  const source = room.players.has(status.sourceId) && !areAllies(room, status.sourceId, attacker.id) ? status.sourceId : null;
  applyDamage(room, source, attacker.id, charge, 'electrical_backlash', nowSec, null, { ultimate: true, ongoing: true });
  // (`attackerId`: who put the Conduct on them; `victimId`: the knight shocked by their own swing; `sparedId`: whom
  // that swing would have hit)
  room.events.push({ type: 'oneHitBacklash', attackerId: source, victimId: attacker.id, sparedId: spared.id,
    amount: charge, ...facts, at: nowSec });
  return true;
}

/**
 * A Sundering blow lands on a knight's body: whatever they were in the middle of ends. A spell gathering is lost, a
 * sword chain stops, a fist thrown never lands, a dash ends where it is, a sprint is broken (its speed gone with it),
 * and an ultimate still being braced into is interrupted as any other (its charge kept, the usual lockout). One
 * already committed is not undone. Then they reel for a moment (the Sunder's `reelSec`: the same "cannot act" as a
 * broken balance, only brief), so that what was cut short is felt to have been; after it they may begin again.
 */
export function interruptHitActions(room, target, attackerId, nowSec, source = 'sunder') {
  if (!target.alive) return;
  const what = [];
  if (stopSustainedGale(room,target,nowSec)) what.push('spell');
  if (target.guarding) { target.guarding = false; what.push('guard'); }
  if (target.pendingSpell) {
    target.pendingSpell = null;
    target.castEndsAt = 0;
    what.push('spell');
  }
  if (target.attackActive || target.attackSweep || target.attackHeld || target.attackQueued) {
    const swinging = target.attackActive || Boolean(target.attackSweep);
    stopSwordChain(target, {}, room, nowSec);
    if (swinging) {
      room.events.push({ type: 'attackEnded', playerId: target.id, at: nowSec });
      what.push('sword');
    }
  }
  if (target.gauntlet) {
    target.gauntlet = null;
    what.push('gauntlet');
  }
  if (nowSec < (target.dashUntil ?? -Infinity)) {
    target.dashUntil = nowSec;
    what.push('dash');
  }
  if (target.sprinting || (target.sprintBlend ?? 0) > 0) {
    target.sprinting = false;
    target.sprintBlend = 0;
    what.push('sprint');
  }
  if (interruptUltimate(room, target, nowSec, attackerId, source)) what.push('ultimate');
  const reelUntil = nowSec + ultimateFor('sunder').reelSec;
  target.staggerUntil = Math.max(target.staggerUntil ?? -Infinity, reelUntil);
  room.events.push({ type: 'actionInterrupted', playerId: target.id, by: attackerId, what, reelUntil: target.staggerUntil, at: nowSec });
}

// how clean a contact must be (as it was felt: after any hardened plate) to count as the cleanest there is, for the
// precise ring that marks it: a sword blow caught dead centre, a spell square on, a gust's heart at point blank
export const CLEAN_CONTACT = Object.freeze({ sword: 0.91, spell: 0.9, gale: 0.85 });

// A guard broken, for `seconds`. In Spells & Chivalry only the guard breaks: it drops and cannot be raised again for
// that long, while the sword, the spells and the dash carry on (every verb at once is the ultimate). Otherwise the
// knight reels for that long (nothing new begins). Either way the blow still shakes their balance (staggerBy), and a
// balance that breaks stops everything, Chivalry or not.
export function breakGuard(target, seconds, nowSec) {
  target.guarding = false;
  target.guardAuto = false;
  if (combatActionPolicy(target, nowSec).concurrent) target.guardBrokenUntil = Math.max(target.guardBrokenUntil ?? -Infinity, nowSec + seconds);
  else target.staggerUntil = nowSec + seconds;
}

function interruptOrdinaryActions(room, player, nowSec) {
  stopSustainedGale(room,player,nowSec);
  player.guarding = false;
  player.pendingSpell = null;
  player.castEndsAt = 0;
  player.gauntlet = null;
  player.dashUntil = Math.min(player.dashUntil ?? nowSec, nowSec);
  stopSwordChain(player, {}, room, nowSec);
}

/**
 * Shake a knight's balance by `amount` (shared/src/stagger.mjs), `by` whoever did it; more while they brace into an
 * ultimate. When it breaks, they are staggered: the sword stops, the guard drops, a gathering spell is lost, a
 * bracing ultimate is interrupted (stepRoom), for about a second.
 */
export function staggerBy(room, player, amount, nowSec, by = null) {
  if (!player?.alive || !(amount > 0)) return false;
  if (by && areAllies(room, player.id, by)) return false;
  const bracing = ultimateStartup(player, nowSec);
  player.stagger ??= freshStagger();
  // (a Steel-infused Disaster's wind-up is braced in plate: ordinary blows do not shake it loose)
  if (oneHitSteelBraced(player, nowSec)) return false;
  if (!addStagger(player.stagger, amount * (bracing ? bracing.startupStagger : 1), nowSec)) return false;
  player.staggerUntil = Math.max(player.staggerUntil ?? -Infinity, nowSec + STAGGER.breakSec);
  interruptOrdinaryActions(room, player, nowSec);
  if (bracing && !Number.isFinite(player.ultimateInterruptionAt)) {
    player.ultimateInterruptionBy = by;
    player.ultimateInterruptionAt = nowSec;
    player.ultimateInterruptionSource = 'stagger';
  }
  // (and who broke it, when someone did)
  room.events.push({ type: 'staggerBreak', playerId: player.id, ...(by && by !== player.id ? { by } : {}), until: player.staggerUntil, at: nowSec });
  return true;
}

/**
 * `steel`: how strong the victim's hardened plate was as the blow met it (0: none), for the clang it makes; `turned`:
 * the damage the plate took off the blow, for its owner to see; `clean`: the contact was the cleanest there is;
 * `level`: the level it was struck at (DAMAGE_LEVELS); `ultimate`: an active ultimate's own damage (it earns no
 * prowess). Health taken earns prowess for both (prowess.mjs); a shove carries further on an unsteady knight.
 */
function challengeContact(player, nowSec, extra = {}) {
  return {
    chivalry: combatActionPolicy(player, nowSec).concurrent,
    guarding: Boolean(player?.guarding),
    dashing: nowSec >= (player?.dashStartedAt ?? Infinity) && nowSec < (player?.dashUntil ?? -Infinity),
    ...extra,
  };
}

function guardChallengeContact(room, defender, attacker, nowSec) {
  recordChallengeFact(room, { type: 'guardContact', playerId: defender.id, enemyId: attacker.id,
    chivalry: combatActionPolicy(defender, nowSec).concurrent, at: nowSec });
}

export function applyDamage(room, attackerId, victimId, amount, source, nowSec, knockback = null, {
  steel = 0, turned = 0, clean = false, level = DAMAGE_LEVELS.normal, ultimate = false, rawDamage = amount, contactFacts = null,
  minDamage = null, skipSteel = false, ongoing = false, infusionCastKey = null,
  killVariant = null,
} = {}) {
  if (attackerId && areAllies(room, attackerId, victimId)) return false;
  const victim = room.players.get(victimId);
  if (!victim || !victim.alive || victim.spawnProtectionUntil > nowSec) return false;

  let finalAmount = amount;
  let finalSteel = steel;
  let finalTurned = turned;

  // Apply centralized Steel mitigation if victim is Sheathed in Steel and not already mitigated
  if (!skipSteel && !steel && victim.steel && finalAmount > 0) {
    const mit = steelMitigate(victim.steel, finalAmount, source, nowSec, minDamage);
    if (mit.turned > 0) {
      if (source !== 'burn' && source !== 'rupture') {
        victim.steel = steelTakes(victim.steel, nowSec);
      }
      finalAmount = mit.amount;
      finalSteel = mit.strength;
      finalTurned = mit.turned;
    }
  }

  const healthBefore = victim.health;
  // Full Steel temporarily makes the LAST HP invulnerable. This is damage
  // prevention, NOT a deferred debt: it never kills the knight when the
  // Ultimate, its Gale wave, or its protection expires.
  // Ordinary damage/mitigation, knockback and stagger still work normally.
  const steelFloor = finalAmount > Math.max(0, victim.health - 1) &&
    oneHitSteelFloorActive(victim, nowSec);
  if (steelFloor) {
    finalAmount = Math.max(0, victim.health - 1);
    const state = victim.ultimateState;
    if (!state.steelFloorAnnounced) {
      state.steelFloorAnnounced = true;
      // Retain the visible steel-on-impact sparks for both clients, but no
      // repeated explanatory screen text or future lethal settlement.
      room.events.push({ type: 'oneHitLastStand', playerId: victimId, attackerId, source,
        until: state.until ?? null, at: nowSec });
    }
  }
  const taken = Math.min(victim.health, finalAmount);
  victim.health = Math.max(0, victim.health - finalAmount);
  if (taken > 0) victim.damageTakenThisLife = (victim.damageTakenThisLife || 0) + taken;
  // HP lost inside a hostile Disaster field takes Guard stamina with it, by what is left of the field (the field a
  // knight stands in is read once a tick, stepOneHitFields: one field, one loss, however many overlap)
  const field = taken > 0 ? victim.oneHitField : null;
  if (field && field.strength > 0 && field.ownerId !== victimId) {
    const loss = fieldGuardLoss(taken, field.strength);
    victim.guardStamina = Math.max(0, victim.guardStamina - loss);
    victim.lastGuardDrainAt = nowSec;
    if (victim.guardStamina <= 0 && victim.guarding) breakGuard(victim, 0.4, nowSec);
    room.events.push({ type: 'oneHitFieldGuard', playerId: victimId, fieldId: field.id, amount: Math.round(loss * 10) / 10, at: nowSec });
  }
  // Only successfully applied ordinary elemental spell uses count. One source use
  // counts once for each participant, regardless of AoE victims, burn or DoT ticks.
  const element = !ultimate && !ongoing ? elementForSpell(source) : null;
  if (element && taken > 0) {
    const key = infusionCastKey || `${source}:${attackerId}:${nowSec}`;
    const caster = room.players.get(attackerId);
    for (const participant of [caster, victim]) {
      if (creditOneHitEncounter(participant, element, key)) {
        room.events.push({ type: 'oneHitInfusion', playerId: participant.id, element,
          tier: participant.oneHitInfusions[element], at: nowSec });
      }
    }
  }
  // Only the locally staged Tutorial Rival survives until its final fight begins.
  // Contact, damage events, afflictions and physical response still resolve normally.
  if (room.localTutorial && room.tutorialRival?.id === victimId && room.tutorialRival.protected) victim.health = Math.max(1, victim.health);
  victim.lastDamageAt = nowSec;
  victim.lastAttackerId = attackerId;
  if (!ongoing) prowessForDamage(room, room.players.get(attackerId), victim, taken, { ultimate });
  if (knockback) {
    const scale = staggerShove(victim.stagger);
    shoveBody(victim, { x: knockback.x * scale, y: knockback.y, z: knockback.z * scale });
    victim.lastKnockbackAt = nowSec;
    if (Math.hypot(knockback.x, knockback.y, knockback.z) > 1e-6) {
      victim.lastKnockbackSource = source;
      victim.lastKnockbackBy = attackerId;
    }
  }
  const event = { type: 'damage', attackerId, victimId, source, amount: finalAmount, health: victim.health, push: knockback ?? null, at: nowSec };
  if (ongoing) event.ongoing = true;
  if (finalSteel > 0.005) {
    if (source !== 'burn') event.steel = finalSteel;
    event.turned = Math.max(0, Math.round(finalTurned));
  }
  if (clean) event.clean = true;
  if (level !== DAMAGE_LEVELS.normal) event.level = level;
  if (ultimate) event.ultimate = true;
  room.events.push(event);
  recordChallengeFact(room, {
    ...contactFacts, type: 'damage', attackerId, victimId, source, amount: taken, rawDamage,
    healthBefore, healthAfter: victim.health, steel: contactFacts?.steel ?? finalSteel, contact: source !== 'burn', at: nowSec,
  });
  recordPerryDamage(room, attackerId, victimId, source, nowSec, taken, healthBefore);
  if (victim.health <= 0) killPlayer(room, victimId, attackerId, source, nowSec, killVariant);
  return true;
}

export function killPlayer(room, victimId, attackerId, source, nowSec, killVariant = null) {
  const victim = room.players.get(victimId);
  if (!victim || !victim.alive) return false;
  let credited = attackerId;
  if (!credited && victim.lastAttackerId && nowSec - victim.lastKnockbackAt <= ABYSS_ATTRIBUTION_SEC) credited = victim.lastAttackerId;
  // (for the voice: whether their plate was still hardened as the blow that felled them landed)
  const steeled = steelStrength(victim.steel, nowSec) > 0.005;
  // (and whether they fell spinning, or still dizzy from it)
  const spun = Boolean(vortexing(victim, nowSec)) || dizzy(victim, nowSec);
  // Capture the actual finishing context while its attacker and the machine
  // state still exist. Afterwards a death may dismount the victim and clear
  // active abilities, making client-side guesses unreliable.
  const killer=room.players.get(credited);
  const special=killVariant||
    (source==='fight-flight-rotor'&&room.fightFlight?.operatorId===credited&&
     room.fightFlight?.offensiveRun?'rotorDash':null)||
    (killer&&['sword','ram','gauntlet','fireball','burn','frostfire','gale',
       'coreflagration','line_of_conduct'].includes(source)&&
       combatActionPolicy(killer,nowSec).concurrent?'chivalry':null)||
    (source==='sword'&&killer&&sundering(killer,nowSec)?'sunder':null);
  recordChallengeFact(room, { type: 'death', victimId, killerId: credited, source, at: nowSec,
    displacementSource: victim.lastKnockbackSource ?? null, displacementBy: victim.lastKnockbackBy ?? null,
    displacementAt: victim.lastKnockbackAt });
  assessPerryDefeat(room, victim, credited, nowSec);
  if (victim.ultimateState?.phase === 'startup' && !Number.isFinite(victim.ultimateInterruptionAt)) {
    victim.ultimateInterruptionBy = credited;
    victim.ultimateInterruptionAt = nowSec;
    victim.ultimateInterruptionSource = 'death';
  }
  victim.alive = false;
  victim.health = 0;
  if (victim.operatingBallistaId && room.biByeLlista) {
    dismountBiByeLlista(room.biByeLlista, victim);
  }
  if (victim.operatingFightFlightId && room.fightFlight) dismountFightFlight(room,room.fightFlight,victim,{force:true,at:nowSec});
  if (victim.operatingRamId && room.soFistication) {
    dismountSoFistication(room, room.soFistication, victim, { administrative: false, force: true });
  }
  victim.guarding = false;
  victim.steel = null;
  stopSustainedGale(room,victim,nowSec);
  victim.gust = null;
  victim.pendingSpell = null;
  victim.castEndsAt = 0;
  victim.gauntlet = null;
  victim.guardHeld = false;
  releaseButtons(victim);
  victim.dashUntil = Math.min(victim.dashUntil ?? nowSec, nowSec);
  victim.dashRam = null;
  victim.chivalryProjectileReadyAt = 0;
  stopSwordChain(victim, {}, room, nowSec);
  // an ultimate still bracing is interrupted (its charge kept); one active is over
  stepUltimate(room, victim, nowSec);
  // A Renown Trial has one life and finite wave enemies. Dead rivals cannot
  // respawn to make a cleared wave impossible; the player ends the run instead.
  victim.respawnAt = room.mode === GAME_MODES.RENOWN_TRIALS
    ? Infinity : nowSec + (room.policy?.respawnSec ?? RESPAWN_SEC);
  const diver=room.fightFlight;
  if(diver?.terminalDive&&!diver.terminalDive.resolved&&diver.terminalDive.operatorId===victim.id){
    victim.terminalRespawnDeferredFor=diver.id;
    // A finite failsafe protects reconnects and corrupted/unresolved dive state;
    // normal resolution replaces this deadline with a fresh post-impact respawn.
    victim.respawnAt=Math.max(nowSec,diver.terminalDive.expiresAt+30)+(room.policy?.respawnSec??RESPAWN_SEC);
  }
  const playing = room.state === 'PLAYING';
  if (playing && room.policy?.teamMode && credited && credited !== victimId) {
    const killer = room.players.get(credited);
    const wasMarked = room.teamMarks?.some((m) => m.kind === 'enemy' && m.targetId === victimId && m.team === killer?.team && m.expiresAt > nowSec);
    if (wasMarked) {
      room.teamMarks = room.teamMarks.filter((m) => !(m.kind === 'enemy' && m.targetId === victimId));
      room.events.push({ type: 'markedTargetFelled', killerId: credited, victimId, at: nowSec });
    }
    if (killer?.team) {
      for (const ally of room.players.values()) {
        if (ally.id !== credited && ally.alive && ally.team === killer.team && ally.lastAttackerId === victimId && nowSec - (ally.lastDamageAt ?? -Infinity) <= 3.5 && ally.health <= 50) {
          room.events.push({ type: 'allySaved', saviorId: credited, allyId: ally.id, enemyId: victimId, at: nowSec });
          break;
        }
      }
    }
  }
  if (credited && credited !== victimId) {
    room.recordKill(credited, victimId, nowSec);
    if (source === 'abyss') {
      const killer = room.players.get(credited);
      if (killer) killer.abyssKills += 1;
    }
  } else {
    victim.deaths += 1;
  }
  if (room.mode === GAME_MODES.EDGE_OF_VICTORY) {
    // A defeated knight is eliminated, never placed on a respawn clock.
    victim.respawnAt = Infinity;
    eliminateEdgePlayer(room, victimId, nowSec);
  }
  // (decisive: the fall lost the match, which that kill has just won)
  const decisive = playing && room.state === 'FINISHED' && Boolean(credited) && credited !== victimId && room.winnerId === credited;
  const death = { type: 'death', victimId, killerId: credited, source,
    ...(special?{killContext:special}:{}), ...(decisive ? { decisive: true } : {}), ...(steeled ? { steeled: true } : {}), ...(spun ? { dizzy: true } : {}), respawnAt: victim.respawnAt, at: nowSec };
  const vortex = spun || Boolean(room.players.get(credited) && vortexing(room.players.get(credited), nowSec)) || ['ember','vortexFire','vortexBlaze'].includes(source);
  const voicePending = playing && queueDefeatVoice(room, death, victim.position, {vortex});
  room.events.push({...death, ...(voicePending ? {voicePending:true} : {})});
  return true;
}

function spawnSpell(room, player, nowSec, world) {
  const pending = player.pendingSpell;
  if (!pending) return;
  const spell = spellFor(pending.spell);
  if (spell.kind === 'line') {
    dischargeLineOfConduct(room, player, pending, nowSec, world);
    player.pendingSpell = null; player.castEndsAt = 0;
    return;
  }
  if (spell.kind === 'cone') {
    releaseGale(room, player, spell, nowSec, world);
    return;
  }
  const { direction: normalized } = galeAim(player);
  const id = `f${++projectileCounter}`;
  const projectile = {
    id,
    ownerId: player.id,
    spell: spell.id,
    // (from the casting hand, a little below the eyes)
    position: { x: player.position.x + normalized.x * 0.7, y: player.position.y + postureOf(player).eye - 0.1, z: player.position.z + normalized.z * 0.7 },
    velocity: { x: normalized.x * spell.speed, y: normalized.y * spell.speed, z: normalized.z * spell.speed },
    bornAt: nowSec,
    ...(pending.ultimate ? { ultimate: true } : {}),
  };
  room.projectiles.set(id, projectile);
  player.pendingSpell = null;
  player.castEndsAt = 0;
  room.events.push({ type: 'projectileSpawned', projectile: structuredClone(projectile), at: nowSec });
}

// Gale Garner lets go, where its caster is aiming as it goes (the breath is drawn first; the gust leaves the hand
// where the hand then points). The gust blows briefly (cone.lastsSec), from the caster's hand along their aim,
// following both, dying away at its very end: every body it reaches is caught once, as hard as the gust still is, and
// then carried on by its wind for as long as it stands in it. Caught, a body is shoved (its heart also stings a
// little); a raised guard facing it keeps most of its footing but pays for it like a blow; hardened steel turns the
// sting, not the shove; walls stop it. A spell flying through it is bent off its line. Driven into the ground close by,
// the gust throws its caster back off it (once, as it leaves the hand).
function stopSustainedGale(room,player,nowSec) {
  if(player.gust?.mode!=='sustained') return false;
  player.gust=null;
  room.events.push({type:'galeEnded',playerId:player.id,at:nowSec});
  return true;
}

function releaseGale(room, player, spell, nowSec, world) {
  const mode = player.pendingSpell?.galeMode ?? 'balanced';
  spell = galeProfile(mode);
  const ultimate = Boolean(player.pendingSpell?.ultimate);
  player.pendingSpell = null;
  player.castEndsAt = 0;
  player.gust = { ultimate, mode, spell: spell.id, bornAt: nowSec, until: nowSec + (spell.cone.lastsSec ?? 0), caught: [] };
  const { eye, direction } = galeAim(player);
  const affected = blowGale(room, player, nowSec, world);
  const recoil = galeRecoil(spell, eye, direction, world);
  if (recoil) launchBody(player, recoil, recoil.maxUp);
  const origin = galeOrigin(eye, direction);
  room.events.push({ type: 'galeBlast', playerId: player.id, spell: spell.id, mode, origin, direction, affected, recoil, at: nowSec });
}

// where a caster's gust comes from and goes: their eyes, and where they aim
function galeAim(player) {
  const eye = { x: player.position.x, y: player.position.y + postureOf(player).eye, z: player.position.z };
  const pitch = player.pitch ?? 0;
  const direction = normalize3({ x: -Math.sin(player.yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(player.yaw) * Math.cos(pitch) });
  return { eye, direction };
}

// (the gust leaves the hand, a little in front of the eyes)
function galeOrigin(eye, direction) {
  return { x: eye.x + direction.x * 0.35, y: eye.y + direction.y * 0.35, z: eye.z + direction.z * 0.35 };
}

/** How hard a gust still blows `age` seconds after it left the hand: full, then dying away over its last fadeSec. */
export function galeStrength(spell, age) {
  const lasts = spell.cone.lastsSec ?? 0;
  if (!(lasts > 0)) return age <= 0 ? 1 : 0;
  if (age > lasts) return 0;
  const fade = Math.min(lasts, spell.cone.fadeSec ?? 0);
  if (!(fade > 0) || age <= lasts - fade) return 1;
  return Math.max(0, (lasts - age) / fade);
}

// how quickly a gust's bend is given to a spell it caught (most of it within a tenth of a second or so)
const GALE_BEND_SEC = 0.05;

// the gust blows on, `dt` seconds of it: every body it reaches now that it has not caught yet is caught (as hard as the
// gust still blows); every body in it is carried on by the wind (galeCarry); every spell in flight through it is bent
// off its line. The bodies it caught now, for the event
function blowGale(room, player, nowSec, world, dt = 0) {
  const gust = player.gust;
  const spell = galeProfile(gust.mode);
  const strength = galeStrength(spell, nowSec - gust.bornAt);
  const affected = [];
  const doseWindow = gust.mode === 'sustained' && dt > 0 && nowSec - dt < gust.until && nowSec > gust.bornAt;
  if (strength <= 0 && !doseWindow) return affected;
  const { direction, eye } = galeAim(player);
  const origin = galeOrigin(eye, direction);
  if (gust.mode === 'sustained') sustainGaleRecoil(spell, player, direction, world, dt, strength);
  const sheltered = (at) => (world.solids ?? []).some((box) => segmentAabbHit([origin.x, origin.y, origin.z], [at.x, at.y, at.z], box));
  for (const target of room.players.values()) {
    if (target.id === player.id || !target.alive || target.spawnProtectionUntil > nowSec || areAllies(room, player.id, target.id)) continue;
    const caught = galeOnBody(spell, origin, direction, target.position, postureOf(target).crown);
    const pressure = caught.pressure * strength;
    const blown = galeWindOnBody(spell, origin, direction, target.position, postureOf(target).crown);
    const wind = blown.wind * strength;
    if (pressure <= 0.01 && wind <= 0.01 && !(doseWindow && caught.exposure > 0)) continue;
    const guarded = target.guarding && isInGuardCone(target, player, nowSec);
    // the wind carries them on for as long as they stand in it (and a fall it carries them into is its doing)
    if (dt > 0 && wind > 0.01 && !sheltered(blown.point)) {
      target.impulse = galeCarry(spell, target.impulse, origin, direction, blown.point, wind, dt, { guarded });
      if (gust.mode === 'sustained') target.velocity.y = galeLift(target.velocity.y, direction.y, wind, dt, guarded);
      target.lastAttackerId = player.id;
      target.lastKnockbackAt = nowSec;
      target.lastKnockbackSource = 'gale'; target.lastKnockbackBy = player.id;
    }
    const at = caught.point;
    if (doseWindow && !sheltered(at)) {
      const steel = steelStrength(target.steel, nowSec);
      const dose = galeDose(gust, target.id, nowSec, dt, caught.exposure, {guarded, steel});
      if (dose.amount > 0) {
        if (steel > .005) target.steel = steelTakes(target.steel, nowSec);
        applyDamage(room, player.id, target.id, dose.amount, spell.id, nowSec, null, {
          steel, skipSteel: true, ongoing: true, ultimate: Boolean(gust.ultimate), rawDamage: dose.rawDamage,
        });
      }
      if (!target.alive) continue;
    }
    if (pressure <= 0.01 || sheltered(at) || gust.caught.includes(target.id)) continue;
    gust.caught.push(target.id);
    if (creditOneHitEncounter(player, 'gale', `gale:${player.id}:${gust.bornAt}`))
      room.events.push({type:'oneHitInfusion',playerId:player.id,element:'gale',tier:player.oneHitInfusions.gale,at:nowSec});
    if (creditOneHitEncounter(target, 'gale', `gale:${player.id}:${gust.bornAt}`))
      room.events.push({type:'oneHitInfusion',playerId:target.id,element:'gale',tier:target.oneHitInfusions.gale,at:nowSec});
    let shove = galeShove(spell, origin, direction, at, pressure);
    if (guarded) {
      guardChallengeContact(room, target, player, nowSec);
      // it holds its ground behind the guard, and the guard pays for it like a blow (its breath waits again)
      shove = { x: shove.x * spell.cone.guarded, y: shove.y * spell.cone.guarded, z: shove.z * spell.cone.guarded };
      target.guardStamina = Math.max(0, target.guardStamina - spell.cone.guardCost * pressure);
      target.lastGuardDrainAt = nowSec;
      if (target.guardStamina <= 1e-9) {
        breakGuard(target, GAME.guardBreakStaggerMs / 1000, nowSec);
        room.events.push({ type: 'guardBreak', attackerId: player.id, defenderId: target.id, at: nowSec });
        if (!gust.ultimate) gainProwess(room, player, PROWESS.guardBreak);
        staggerBy(room, target, STAGGER.gain.guardBreak, nowSec, player.id);
      }
    }
    // the gust takes their balance with it (less so behind a guard), and one caught in its heart is thrown well off
    // their feet
    staggerBy(room, target, STAGGER.gain.gale * pressure * (guarded ? STAGGER.gain.blocked : 1), nowSec, player.id);
    if (!gust.ultimate && !guarded && pressure >= 0.5) gainProwess(room, player, PROWESS.displaced);
    // its heart stings a little (steel turns that aside, never the shove)
    const exposure = guarded ? 0 : caught.exposure * strength;
    const rawDamage = gust.mode === 'sustained' ? 0 : Math.round(spell.cone.damage * exposure);
    const armour = steelBlunt(target.steel, rawDamage, nowSec);
    if (rawDamage > armour.amount) target.steel = steelTakes(target.steel, nowSec);
    const damage = armour.amount;
    if (damage >= 1) {
      const turned = rawDamage - damage;
      applyDamage(room, player.id, target.id, damage, spell.id, nowSec, shove, {
        steel: armour.strength, turned, clean: exposure >= CLEAN_CONTACT.gale && armour.strength <= 0.005, ultimate: Boolean(gust.ultimate),
        rawDamage: spell.cone.damage * exposure,
        contactFacts: challengeContact(player, nowSec, { prepared: preparedSpellMember(player, spell.id) }),
      });
    } else {
      shoveBody(target, shove);
      target.lastAttackerId = player.id;
      target.lastKnockbackAt = nowSec;
      if (Math.hypot(shove.x, shove.y, shove.z) > 1e-6) { target.lastKnockbackSource = 'gale'; target.lastKnockbackBy = player.id; }
    }
    affected.push({ id: target.id, pressure, guarded, shove });
  }
  if (strength <= 0) return affected;
  // spells in flight through it: each bent once, as it flies in, by as much as the gust would meet it with on its
  // course (galeBend), the bend given over a moment so it curves rather than kinks; whose spell it is does not change
  gust.bent ??= {};
  for (const projectile of room.projectiles.values()) {
    if (projectile.corePhase === 'armed') continue;
    let bend = gust.bent[projectile.id];
    if (!bend) {
      if (sheltered(projectile.position)) continue;
      const given = galeBend(spell, origin, direction, projectile.position, projectile.velocity, strength, spellFor(projectile.spell).windResist ?? 1);
      if (!given) continue;
      bend = gust.bent[projectile.id] = { left: given };
    }
    if (!(dt > 0)) continue;
    const share = 1 - Math.exp(-dt / GALE_BEND_SEC);
    const now = { x: bend.left.x * share, y: bend.left.y * share, z: bend.left.z * share };
    const before = projectile.velocity;
    projectile.velocity = { x: before.x + now.x, y: before.y + now.y, z: before.z + now.z };
    const turned = Math.hypot(before.y * now.z - before.z * now.y, before.z * now.x - before.x * now.z, before.x * now.y - before.y * now.x);
    if (!bend.recorded && turned > 1e-6) {
      bend.recorded = true;
      recordChallengeFact(room, { type: 'projectileBent', ownerId: projectile.ownerId, benderId: player.id,
        projectileId: projectile.id, ordinary: ['fireball', 'frostfire'].includes(projectile.spell), at: nowSec });
    }
    bend.left = { x: bend.left.x - now.x, y: bend.left.y - now.y, z: bend.left.z - now.z };
  }
  return affected;
}

// the blast: damage by distance, a shove away from its heart, then what the spell leaves behind (a burn, a chill)
function explodeSpell(room, projectile, point, nowSec, worldHit = false, directVictimId = null, directComponent = null, directRamComponent = null) {
  room.projectiles.delete(projectile.id);
  const spell = spellFor(projectile.spell);
  // fire throws a body back; cold only staggers it a little (and an ember is a small fire)
  const shove = spell.shove ?? (spell.chill ? 0.5 : 1);
  // (an ultimate's own fire earns its thrower no prowess)
  const ultimate = Boolean(projectile.ultimate);
  for (const player of room.players.values()) {
    if (!player.alive || player.id === projectile.ownerId || areAllies(room, projectile.ownerId, player.id)) continue;
    const center = playerCenter(player);
    const direct = player.id === directVictimId;
    const distance = direct ? 0 : blastDistance(point, player.position, postureOf(player).crown);
    if (distance > spell.radius) continue;
    // how directly it caught them decides everything it leaves (hardened armour turns some of it aside)
    const bare = spellExposure(spell, distance);
    const armour = steelExposure(player.steel, bare, nowSec);
    const exposure = armour.exposure;
    if (armour.turned > 0.02) {
      player.steel = steelTakes(player.steel, nowSec);
      room.events.push({ type: 'steelTurn', playerId: player.id, spell: spell.id, turned: armour.turned, point, at: nowSec });
    }
    const amount = blastDamage(spell, exposure);
    const away = normalize3({ x: center.x - point.x, y: Math.max(0.15, center.y - point.y), z: center.z - point.z });
    const hit = applyDamage(room, projectile.ownerId, player.id, amount, spell.id, nowSec, {
      x: away.x * 4.3 * shove, y: away.y * 2.3 * shove, z: away.z * 4.3 * shove,
    }, { steel: armour.strength, turned: blastDamage(spell, bare) - amount, clean: exposure >= CLEAN_CONTACT.spell, ultimate,
      rawDamage: bare > 0 ? spell.directDamage + (spell.edgeDamage - spell.directDamage) * (1 - Math.min(1, bare)) ** 2 : 0,
      infusionCastKey: projectile.id,
      contactFacts: challengeContact(room.players.get(projectile.ownerId), nowSec, {
        ordinaryProjectile: !spell.conjured && !spell.kind,
        prepared: preparedSpellMember(room.players.get(projectile.ownerId), spell.id), projectileId: projectile.id,
      }),
    });
    if (!hit || !player.alive) continue;
    staggerBy(room, player, STAGGER.gain.blast * bare * shove, nowSec, projectile.ownerId);
    if (exposure >= 0.8 && shove >= 1 && !ultimate) gainProwess(room, room.players.get(projectile.ownerId), PROWESS.displaced);
    // a fresh burn replaces one already licking (it never stacks); a blast too far out to catch leaves any burn be
    const burn = burnFrom(spell, exposure, projectile.ownerId, nowSec);
    if (burn) player.burn = ultimate ? { ...burn, ultimate: true } : burn;
    const chill = chillFrom(spell, exposure, nowSec);
    if (chill) {
      player.chill = strongerChill(player.chill, chill, nowSec);
      // (a chill that took hold, and whose frost it was: how cold, for how long; for the thrower's voice)
      if (player.chill === chill) room.events.push({ type: 'chilled', playerId: player.id, by: projectile.ownerId, spell: spell.id, slow: chill.slow, until: chill.until, at: nowSec });
    }
  }
  if(directRamComponent)damageSoFistication(room,room.soFistication,spell.directDamage,projectile.ownerId,spell.id,nowSec,{componentId:directRamComponent,point});
  else blastSoFistication(room,room.soFistication,{point,radius:spell.radius,damage:spell.directDamage},projectile.ownerId,spell.id,nowSec);
  if (directComponent) {
    damageBiByeLlista(room,room.biByeLlista,spell.directDamage,projectile.ownerId,spell.id,nowSec,{componentId:directComponent,point});
  } else {
    blastBiByeLlista(room,room.biByeLlista,{point,radius:spell.radius,damage:spell.directDamage},projectile.ownerId,spell.id,nowSec,room.world?.solids ?? []);
  }

  room.events.push({
    type: 'projectileImpact', projectileId: projectile.id, ownerId: projectile.ownerId, spell: spell.id, radius: spell.radius, point, worldHit, at: nowSec,
  });
}


// Coreflagration belongs to this real projectile simulation, rather than a second standalone combat engine.
// Its first burst is deliberately weak; the armed core occupies the same projectile map until the final blast.
function coreflagrationBurst(room, projectile, point, nowSec, damage, final = false) {
  const spell = spellFor(projectile.spell);
  for (const player of room.players.values()) {
    if (!player.alive || player.id === projectile.ownerId || areAllies(room, projectile.ownerId, player.id)) continue;
    if (blastDistance(point, player.position, postureOf(player).crown) > spell.radius) continue;
    // A successful parry negates this defender's first burst on landing; the later explosion remains dangerous.
    if (!final && projectile.coreParriedDefenderId === player.id) continue;
    // No falloff anywhere in the body-intersection radius. Sheathe in Steel and spawn protection still apply.
    const hit = applyDamage(room, projectile.ownerId, player.id, damage, spell.id, nowSec, null, {
      killVariant:final?'coreflagration-final':'coreflagration-first',
      contactFacts: challengeContact(room.players.get(projectile.ownerId), nowSec, {
        ordinaryProjectile: true, prepared: preparedSpellMember(room.players.get(projectile.ownerId), spell.id),
        projectileId: projectile.id,
      }),
      infusionCastKey: projectile.id,
    });
    if (hit && final && player.alive) {
      player.burn = {
        attackerId: projectile.ownerId,
        perLick: spell.burn.damage / spell.burn.licks,
        licksLeft: spell.burn.licks,
        interval: spell.burn.seconds / spell.burn.licks,
        nextAt: nowSec + spell.burn.seconds / spell.burn.licks,
        until: nowSec + spell.burn.seconds,
      };
    }
  }
  if (room.soFistication) blastSoFistication(room, room.soFistication, { point, radius: spell.radius, damage }, projectile.ownerId, spell.id, nowSec);
  if (room.biByeLlista) blastBiByeLlista(room, room.biByeLlista, { point, radius: spell.radius, damage }, projectile.ownerId, spell.id, nowSec, room.world?.solids ?? []);
}

function armCoreflagration(room, projectile, point, nowSec, worldHit = false) {
  const spell = spellFor(projectile.spell);
  projectile.position = { ...point };
  projectile.velocity = { x: 0, y: 0, z: 0 };
  projectile.corePhase = 'armed';
  projectile.armedAt = nowSec;
  projectile.detonateAt = nowSec + spell.core.fuseSec;
  coreflagrationBurst(room, projectile, point, nowSec, spell.core.initialDamage);
  room.events.push({
    type: 'coreflagrationArmed', projectileId: projectile.id, ownerId: projectile.ownerId,
    point: { ...point }, radius: spell.radius, detonateAt: projectile.detonateAt, worldHit, at: nowSec,
  });
}

function detonateCoreflagration(room, projectile, nowSec) {
  const spell = spellFor(projectile.spell);
  coreflagrationBurst(room, projectile, projectile.position, nowSec, spell.directDamage, true);
  room.projectiles.delete(projectile.id);
  room.events.push({
    type: 'projectileImpact', stage: 'final', projectileId: projectile.id, ownerId: projectile.ownerId,
    spell: spell.id, radius: spell.radius, point: { ...projectile.position }, worldHit: true, at: nowSec,
  });
}

function coreflagrationParry(room, projectile, defender, nowSec) {
  const automatic=chivalryParries(defender,nowSec,{x:-projectile.velocity.x,z:-projectile.velocity.z});
  if ((!defender?.guarding&&!automatic) || !(defender.guardStamina > 0) || projectile.coreParried) return false;
  const age = automatic ? 0 : (nowSec - defender.guardStartedAt) * 1000;
  if (!(age >= 0 && age <= GAME.parryWindowMs)) return false;
  const face = forwardFromYaw(defender.yaw ?? 0);
  const speed = Math.hypot(projectile.velocity.x, projectile.velocity.z);
  if (speed < 0.001) return false;
  const incomingX = -projectile.velocity.x / speed;
  const incomingZ = -projectile.velocity.z / speed;
  if (face.x * incomingX + face.z * incomingZ < Math.cos(65 * Math.PI / 180)) return false;
  const core = spellFor(projectile.spell).core;
  projectile.coreParried = true;
  projectile.coreParriedDefenderId = defender.id;
  projectile.corePhase = 'knocked';
  projectile.coreKnockedAt = nowSec;
  // A lateral hop, not a change of allegiance. Ownership, kill credit and friendly-fire rules stay intact.
  projectile.velocity = { x: incomingZ * core.parryKnockSpeed, y: core.parryKnockUp, z: -incomingX * core.parryKnockSpeed };
  defender.coreRegenPausedUntil = Math.max(defender.coreRegenPausedUntil ?? -Infinity, nowSec + core.parryRegenPauseSec);
  room.events.push({
    type: 'coreflagrationParried', projectileId: projectile.id, defenderId: defender.id,
    ownerId: projectile.ownerId, point: { ...projectile.position }, ...(automatic?{automatic:true}:{}), at: nowSec,
  });
  return true;
}

// burns lick at their victims (credited to whoever threw the fire); chills thaw on their own
function stepAfflictions(room, player, nowSec) {
  const burn = player.burn;
  if (burn && nowSec >= burn.nextAt) {
    burn.licksLeft -= 1;
    burn.nextAt += burn.interval;
    if (burn.licksLeft <= 0) player.burn = null;
    // (a Vortex's scorch is the ultimate's own: it earns its user nothing)
    applyDamage(room, burn.attackerId, player.id, burn.perLick, 'burn', nowSec, null, { ultimate: Boolean(burn.ultimate) });
  }
  if (player.chill && nowSec >= player.chill.until) player.chill = null;
  if (player.oneHitFrostSlow && nowSec >= player.oneHitFrostSlow.until) player.oneHitFrostSlow = null;
  if (player.shaken && nowSec >= player.shaken.at + 3) player.shaken = null;
  if (player.electricalBacklash && oneHitBacklashRemaining(player.electricalBacklash, nowSec) <= 0)
    player.electricalBacklash = null;
  if (player.blustered && blusterSeverity(player.blustered, nowSec) <= 0) player.blustered = null;
  player.speedScale = chillScale(player.chill, nowSec) * frostSlowScale(player.oneHitFrostSlow, nowSec);
}

function stepProjectiles(room, dt, nowSec, world, { filterOwnerId = null } = {}) {
  for (const projectile of [...room.projectiles.values()]) {
    if (filterOwnerId !== null && projectile.ownerId !== filterOwnerId) {
      projectile.bornAt = (projectile.bornAt ?? nowSec) + dt;
      if (projectile.detonateAt) projectile.detonateAt += dt;
      if (projectile.coreKnockedAt) projectile.coreKnockedAt += dt;
      if (projectile.armedAt) projectile.armedAt += dt;
      continue;
    }
    if (projectile.corePhase === 'armed') {
      if (nowSec + 1e-9 >= projectile.detonateAt) detonateCoreflagration(room, projectile, nowSec);
      continue;
    }
    if (projectile.corePhase === 'knocked') {
      projectile.position = {
        x: projectile.position.x + projectile.velocity.x * dt,
        y: projectile.position.y + projectile.velocity.y * dt,
        z: projectile.position.z + projectile.velocity.z * dt,
      };
      if (nowSec - projectile.coreKnockedAt >= spellFor(projectile.spell).core.parryKnockSec) {
        const ground = surfaceHeightAt(projectile.position.x, projectile.position.z, projectile.position.y, world);
        armCoreflagration(room, projectile, { ...projectile.position, y: ground === null ? projectile.position.y : ground + 0.05 }, nowSec);
      }
      continue;
    }
    world = structureWorld(world, room.structures);
    const before = { ...projectile.position };
    const after = {
      x: before.x + projectile.velocity.x * dt,
      y: before.y + projectile.velocity.y * dt,
      z: before.z + projectile.velocity.z * dt,
    };
    const hits = [];
    const a=[before.x,before.y,before.z],b=[after.x,after.y,after.z];
    for (const box of world.solids ?? []) {
      if (String(box.id??'').startsWith('bibye-')) continue;
      const hit=segmentAabbHit(a,b,box);if(hit)hits.push({...hit,box,kind:'world'});
    }
    const machine=biByeFirstHit(room.biByeLlista,a,b,nowSec);
    if(machine)hits.push({...machine,kind:'machine'});
    const ram=soFistFirstHit(room.soFistication,a,b,nowSec);if(ram)hits.push({...ram,kind:'ram'});
    const ground=surfaceHeightAt(after.x,after.z,before.y,world);
    if(ground!==null&&after.y<=ground&&before.y>ground){
      const t=(before.y-ground)/(before.y-after.y);
      hits.push({t,kind:'world',point:[before.x+(after.x-before.x)*t,ground+.05,before.z+(after.z-before.z)*t]});
    }
    for(const target of room.players.values()){
      if(!target.alive||target.id===projectile.ownerId||target.spawnProtectionUntil>nowSec||areAllies(room,projectile.ownerId,target.id))continue;
      // Preserve the existing ordinary spell body shape and endpoint eligibility.
      const center=playerCenter(target),radius=Math.min(.75,postureOf(target).height/2);
      if(Math.hypot(center.x-after.x,center.y-after.y,center.z-after.z)>=radius)continue;
      const d={x:after.x-before.x,y:after.y-before.y,z:after.z-before.z};
      const o={x:before.x-center.x,y:before.y-center.y,z:before.z-center.z};
      const A=d.x*d.x+d.y*d.y+d.z*d.z,B=2*(o.x*d.x+o.y*d.y+o.z*d.z),C=o.x*o.x+o.y*o.y+o.z*o.z-radius*radius;
      const t=C<=0?0:Math.max(0,Math.min(1,(-B-Math.sqrt(Math.max(0,B*B-4*A*C)))/(2*A||1)));
      hits.push({t,point:[before.x+d.x*t,before.y+d.y*t,before.z+d.z*t],kind:'player',player:target});
    }
    hits.sort((a,b)=>a.t-b.t);
    if(hits.length){
      const hit=hits[0],point={x:hit.point[0],y:hit.point[1],z:hit.point[2]};
      if (projectile.spell === 'coreflagration' && hit.kind === 'player' && coreflagrationParry(room, projectile, hit.player, nowSec)) { projectile.position = { ...point }; continue; }
      if(hit.kind==='world'&&hit.box&&String(hit.box.id??'').startsWith('siege-ladder-'))damageRestlessLadder(room,hit.box.id.split('-').slice(2,4).join('-'),spellFor(projectile.spell).directDamage??30,projectile.ownerId,nowSec);
       if(hit.kind==='world'&&hit.box)damageStructureSolid(room,hit.box,projectile.spell==='coreflagration'?spellFor(projectile.spell).core.initialDamage:spellFor(projectile.spell).directDamage,projectile.ownerId,projectile.spell,nowSec,{point});
      if (projectile.spell === 'coreflagration') armCoreflagration(room, projectile, point, nowSec, hit.kind !== 'player');
      else explodeSpell(room,projectile,point,nowSec,hit.kind!=='player',hit.player?.id??null,hit.kind==='machine'?hit.box.componentId:null,hit.kind==='ram'?hit.box.componentId:null);
      continue;
    }

    projectile.position = after;
    if (nowSec - projectile.bornAt > 4) room.projectiles.delete(projectile.id);
  }
}

// --- ultimates (shared/src/ultimates.mjs) ----------------------------------------------------------------------

/**
 * The ultimate key: a knight with a full prowess meter begins to brace into their ultimate (its startup). The charge
 * is spent only at the commit point (stepUltimate); staggered or killed before it, they keep it.
 */

// Shared room-authoritative One Hit implementation. This intentionally uses
// Castleward's normal applyDamage / Steel / team rules, not Argon's isolated state.
function oneHitVisible(room, caster, target, world, nowSec, origin) {
  if (!target.alive || target.id === caster.id || areAllies(room,caster.id,target.id) ||
      target.spawnProtectionUntil > nowSec) return false;
  return !oneHitWorldContact(origin,oneHitChest(target),world);
}

// The bounded part of a Disaster's wind-up: all of an ordinary one, and no more than an ordinary one's length of a
// held Full Lightning aim (which may be held for ever, and so gives nothing for ever).
function oneHitPrepTiers(player,nowSec) {
  const state=player?.ultimateState;
  if(state?.id!=='one_hit_of_wonders'||state.phase!=='startup')return null;
  if(nowSec-state.startedAt>ultimateFor(state.id).startupSec+1e-9)return null;
  return state.preparedTiers??null;
}
// Half Steel: ordinary blows do not stagger a knight out of the wind-up.
function oneHitSteelBraced(player,nowSec) {
  return (oneHitPrepTiers(player,nowSec)?.steel??0)>=1;
}
// Full Steel's HP floor is provided by oneHitSteelFloorActive, shared with
// the HUD. A blocked killing blow is never saved as future damage.

function oneHitGuard(room,caster,target,origin,nowSec) {
  if(!target.guarding || !isInGuardCone(target,{position:origin},nowSec))return false;
  // (40 for a guarded Disaster, whatever it carries: no infusion bears harder on a Guard)
  target.guardStamina=Math.max(0,target.guardStamina-40);
  target.lastGuardDrainAt=nowSec;
  if(target.guardStamina<=0)breakGuard(target,.4,nowSec);
  room.events.push({type:'block',attackerId:caster.id,defenderId:target.id,oneHit:true,at:nowSec});
  return true;
}

function oneHitConduct(room,target,offered,nowSec) {
  const merged=mergeConduct(target.electricalBacklash,offered,nowSec);
  if(merged===target.electricalBacklash)return false;
  target.electricalBacklash=merged;
  room.events.push({type:'oneHitConduct',playerId:target.id,sourceId:merged.sourceId,
    initial:Math.round(merged.initial*10)/10,...(merged.fieldId?{fieldId:merged.fieldId}:{}),at:nowSec});
  return true;
}

// Full Steel: every Skill the struck knight carries starts its cooldown again from now, ready or not. Nothing else
// of theirs (Prowess, the dash, the match) is touched.
function restartSkillCooldowns(room,caster,target,nowSec) {
  const ids=[...new Set([target.spell,...(target.preparedSpells??[]),...Object.keys(target.spellReadyById??{})])]
    .filter(id=>typeof id==='string'&&spellFor(id).id===id);
  target.spellReadyById??={};
  for(const id of ids)target.spellReadyById[id]=nowSec+spellFor(id).cooldownSec;
  if(target.spell&&target.spellReadyById[target.spell]!==undefined)target.spellReadyAt=target.spellReadyById[target.spell];
  room.events.push({type:'oneHitCooldownsRestarted',playerId:target.id,by:caster.id,skills:ids,at:nowSec});
}

// What the blow leaves on a knight it reached. `direct`: they were genuinely struck by the decisive hit itself (the
// slam, or the wave's own blade), not merely caught by a wave's landing splash.
// The splash carries the elements as it always has (burn, frost and its freeze, Conduct, Shaken); Blustered and
// Steel's interruption and cooldown restart belong to the decisive hit alone.
function oneHitAfflict(room,caster,target,tiers,nowSec,{shaken=0,direct=false}={}) {
  if(!target.alive)return;
  if(shaken)applyOneHitShaken(target,nowSec,shaken);
  // (Fire leaves no burn on the knight: Half Fire is reach, and Full Fire's ground does the burning)
  if(tiers.frost>=1) {
    const frozen=tiers.frost===2;
    target.oneHitFrostSlow=mergeFrostSlow(target.oneHitFrostSlow,
      {until:nowSec+(tiers.frost===2?3.8:2.5),depth:ONE_HIT_FIELD.frostDepth},nowSec);
    if(frozen)target.oneHitFrozenUntil=nowSec+.9;
  }
  if(tiers.lightning>=1)oneHitConduct(room,target,directConduct(caster.id,nowSec),nowSec);
  if(!direct)return;
  if(tiers.gale>=1){
    target.blustered={at:nowSec,severity:1,sourceId:caster.id};
    room.events.push({type:'oneHitBlustered',playerId:target.id,sourceId:caster.id,at:nowSec});
  }
  if((tiers.steel??0)>=1){
    interruptHitActions(room,target,caster.id,nowSec,'all_natural_disaster');
    if(tiers.steel===2)restartSkillCooldowns(room,caster,target,nowSec);
  }
}

const oneHitChest=actor=>({...actor.position,y:actor.position.y+1});
function oneHitTouch(room,caster,target,tiers,nowSec,world,{
  aerial=false,distance=0,origin=oneHitChest(caster),direction=null,processed=null,blast=null,
}={}) {
  if(!oneHitVisible(room,caster,target,world,nowSec,origin))return false;
  processed?.push(target.id); // Guard also spends this wave's single contact.
  const incoming=direction?{x:target.position.x-direction.x,y:origin.y,z:target.position.z-direction.z}:origin;
  if(oneHitGuard(room,caster,target,incoming,nowSec))return false;
  const falloff=aerial?Math.max(.45,1-distance/40):1;
  const damage=oneHitDamage(tiers,aerial?36:ONE_HIT_BASE_DAMAGE)*falloff;
  const dx=direction?.x??(target.position.x-origin.x),dz=direction?.z??(target.position.z-origin.z);
  const d=Math.hypot(dx,dz)||1;
  // (Half Gale: the blow carries them further the way it was going)
  // Fire and Gale together (`blast`: how far from the heart of a blast of what radius they stood): thrown the whole
  // way from its heart, less and less toward its edge, so the fire's ground is where they tend to come down
  const shove=3.4*(tiers.gale>=1?ONE_HIT_BLUSTER.knockback:1)*
    (blast&&tiers.gale>=1&&tiers.fire>=1?fireGaleShove(blast.distance,blast.radius):1);
  if(!applyDamage(room,caster.id,target.id,damage,'one_hit_of_wonders',nowSec,
    {x:dx/d*shove,y:.6,z:dz/d*shove},{ultimate:true,rawDamage:damage}))return false;
  oneHitAfflict(room,caster,target,tiers,nowSec,{shaken:distance<1.9?1:.6,direct:true});
  return true;
}
function oneHitBurnZone(room,caster,id,position,nowSec,tiers,radius=ONE_HIT_REACH.fire.radius) {
  (room.oneHitBurnZones??=[]).push({
    id,ownerId:caster.id,position,radius,bornAt:nowSec,nextAt:nowSec+.5,until:nowSec+fieldSeconds(tiers),
  });
}
// The grounded blow's contact: every enemy in its reach it has not yet met (`processed`: this attack's one registry,
// a Guard that spent its contact included). Returns whom it struck now.
function oneHitGroundContact(room,caster,center,tiers,nowSec,world,processed) {
  const reach=groundReach(tiers),struck=[];
  for(const target of room.players.values()) {
    if(processed.includes(target.id))continue;
    const distance=Math.hypot(target.position.x-center.x,target.position.z-center.z);
    const rise=target.position.y-center.y;
    if(distance>reach.radius||rise>reach.up||rise<-reach.down)continue;
    if(oneHitTouch(room,caster,target,tiers,nowSec,world,{distance,processed,
      origin:{...center,y:center.y+1},blast:{distance,radius:reach.radius}}))struck.push(target.id);
  }
  return struck;
}
// In order: the impact and any Guard, the one decisive hit, Shaken and the statuses (oneHitTouch); then the rupture;
// then what is left behind (burning ground, the field). Nothing left behind exists while the blow itself lands.
function oneHitSlam(room,caster,tiers,nowSec,world) {
  const reach=groundReach(tiers),radius=reach.radius;
  // Full Gale draws enemies toward the destination, then the same decisive
  // contact tests run exactly once. No second base-damage hit from a vortex.
  if(tiers.gale===2)for(const target of room.players.values()) {
    if(!oneHitVisible(room,caster,target,world,nowSec,oneHitChest(caster)))continue;
    const dx=caster.position.x-target.position.x,dz=caster.position.z-target.position.z;
    const d=Math.hypot(dx,dz);
    if(d>6.8||d<.1||Math.abs(target.position.y-caster.position.y)>3)continue;
    const travel=Math.min(2.8,Math.max(0,d-1));
    const next={...target.position,x:target.position.x+dx/d*travel,
      z:target.position.z+dz/d*travel};
    const clear=resolvePlayerWorld(next,MOVEMENT.playerRadius,world?.solids??[]);
    if(Math.hypot(clear.x-next.x,clear.z-next.z)<.1 &&
      !oneHitWorldContact(oneHitChest(target),{...next,y:next.y+1},world))target.position=next;
  }
  const center={...caster.position},processed=[];
  const struck=oneHitGroundContact(room,caster,center,tiers,nowSec,world,processed);
  // Reuse the game's actual rupture simulation and its visible fissure events.
  // The same enemy is never dealt the full decisive strike twice by its fissure.
  // Steel turns the lopsided star into a fracture all the way round (its arms still stop at whatever the ground
  // and the walls stop them at); whoever one of its arms catches is Shaken by it.
  const steel=tiers.steel??0;
  const before=room.ruptures?.length??0;
  groundStrike(room,caster,2,{point:{...center},floor:{y:center.y}},nowSec,world,
    steel>=1?{rules:steelFractureRules(RUPTURE,steel),oneHit:{steel}}:{});
  const rupture=(room.ruptures?.length??0)>before?room.ruptures.at(-1):null;
  rupture?.caught.push(...struck);
  if(tiers.fire===2)oneHitBurnZone(room,caster,`oh-burn:${caster.id}:${nowSec}`,{...center},nowSec,tiers);
  // The field it leaves: laid down after the blow has landed, so the decisive hit is never counted against it.
  const field={id:`oh-field:${caster.id}:${nowSec}`,ownerId:caster.id,position:{...center},radius,
    bornAt:nowSec,until:nowSec+fieldSeconds(tiers),tiers:{...tiers},conducted:{},shakenContact:{}};
  (room.oneHitFields??=[]).push(field);
  // (whoever the blow itself struck has had its Conduct whole: its field owes them nothing more)
  if(tiers.lightning>=1)for(const id of struck)field.conducted[id]=1;
  for(const id of struck)field.shakenContact[id]=1;
  // Frost: the same contact stays open a moment longer for whoever it has not met (never a second hit on one it has)
  if(tiers.frost>=1)(room.oneHitLingers??=[]).push({kind:'ground',ownerId:caster.id,center,tiers:{...tiers},
    until:nowSec+ONE_HIT_FROST_LINGER_SEC,processed,ruptureId:rupture?.id??null,fieldId:field.id});
  room.events.push({type:'oneHitImpact',playerId:caster.id,point:{...center},
    tiers:{...tiers},form:'ground',radius,height:reach.up,struck,fieldId:field.id,at:nowSec});
  return processed; // Shared with Frost late contact and Full Gale's wave.
}

// Each tick: which hostile field each knight stands in (the strongest, if several overlap), and what it does to
// them there. Nothing here deals HP damage; Full Fire's burning ground is the room's burn zones.
function stepOneHitFields(room,dt,nowSec,world) {
  const fields=room.oneHitFields=(room.oneHitFields??[]).filter(f=>nowSec<f.until);
  for(const player of room.players.values()) {
    player.oneHitField=null;
    if(!player.alive||!fields.length)continue;
    for(const field of fields) {
      const owner=room.players.get(field.ownerId);
      if(!owner||field.ownerId===player.id||areAllies(room,field.ownerId,player.id)||
        player.spawnProtectionUntil>nowSec)continue;
      const contact=fieldContact(field,player.position);
      if(!(contact>0))continue;
      if(oneHitWorldContact({...field.position,y:field.position.y+.5},oneHitChest(player),world))continue;
      const strength=fieldStrength(field,nowSec);
      if(!player.oneHitField||strength>player.oneHitField.strength)
        player.oneHitField={id:field.id,ownerId:field.ownerId,strength,contact};
      // The base field REALLY shakes newly entering enemies. The visual
      // shattered ground warns of this, including when there are no elements.
      // Keep the deepest offered effect per target/field: walking out and
      // returning cannot refresh Shaken indefinitely. A target of the initial
      // blow has already been shaken and is marked when the field is created.
      const offered=strength*contact;
      const previous=field.shakenContact?.[player.id]??0;
      if(offered>.015&&(previous===0||offered>=previous+ONE_HIT_FIELD.shakenStep)){
        (field.shakenContact??={})[player.id]=offered;
        const prior=player.shaken;
        applyOneHitShaken(player,nowSec,offered);
        if(prior!==player.shaken)room.events.push({
          type:'oneHitFieldShaken',playerId:player.id,fieldId:field.id,
          strength:Math.round(offered*100)/100,at:nowSec,
        });
      }
      if(field.tiers.frost===2)player.oneHitFrostSlow=mergeFrostSlow(player.oneHitFrostSlow,
        {until:nowSec+ONE_HIT_FIELD.frostLingerSec,depth:fieldFrostDepth(strength,contact)},nowSec);
      if(field.tiers.lightning===2){
        const offered=fieldConduct(field,player.id,contact,nowSec);
        if(offered)oneHitConduct(room,player,offered,nowSec);
      }
    }
    if(player.oneHitField&&player.shaken)
      player.shaken=shakenHeldBack(player.shaken,player.oneHitField.strength,dt);
  }
}

// Half Gale's defensive wind: while the attack is being prepared (and through an aerial form's own vortex), a
// hostile spell flying in at the knight is turned off its line, once, by this wind. It stays its caster's spell and
// flies on; the wind is over when the preparation is. Nothing is turned during a held Full Lightning aim's long wait.
const ONE_HIT_WIND={radius:2.6,outward:.45};
function oneHitDefensiveWind(room,player,nowSec) {
  const state=player.ultimateState;
  const tiers=oneHitPrepTiers(player,nowSec)??
    (state?.phase==='active'&&state.oneHit?.form==='aerial'&&!state.oneHit.hit?state.oneHit.tiers:null);
  if(!tiers||(tiers.gale??0)<1)return;
  const turned=state.windTurned??=[];
  const chest=oneHitChest(player);
  for(const projectile of room.projectiles.values()) {
    if(projectile.corePhase||projectile.ownerId===player.id||areAllies(room,projectile.ownerId,player.id)||
      turned.includes(projectile.id))continue;
    const r={x:projectile.position.x-chest.x,y:projectile.position.y-chest.y,z:projectile.position.z-chest.z};
    const distance=Math.hypot(r.x,r.y,r.z);
    if(distance>ONE_HIT_WIND.radius||distance<1e-6)continue;
    const n={x:r.x/distance,y:r.y/distance,z:r.z/distance};
    const v=projectile.velocity,speed=Math.hypot(v.x,v.y,v.z);
    const inward=v.x*n.x+v.y*n.y+v.z*n.z;
    if(!(speed>0)||inward>=0)continue; // already leaving
    turned.push(projectile.id);
    // its approach is taken out of it and a share of its speed is turned outward: it slides round and away
    let out={x:v.x-inward*n.x+n.x*speed*ONE_HIT_WIND.outward,y:v.y-inward*n.y+n.y*speed*ONE_HIT_WIND.outward+speed*.12,
      z:v.z-inward*n.z+n.z*speed*ONE_HIT_WIND.outward};
    const length=Math.hypot(out.x,out.y,out.z)||1;
    projectile.velocity={x:out.x/length*speed,y:out.y/length*speed,z:out.z/length*speed};
    room.events.push({type:'oneHitDeflect',playerId:player.id,projectileId:projectile.id,ownerId:projectile.ownerId,
      point:{...projectile.position},velocity:{...projectile.velocity},at:nowSec});
    recordChallengeFact(room,{type:'projectileBent',ownerId:projectile.ownerId,benderId:player.id,
      projectileId:projectile.id,at:nowSec});
  }
}
function oneHitTeleport(room,player,state,nowSec,world=room.world) {
  const origin={...player.position};
  const vertical=state.preparedTiers?.gale===2;
  const teleportWorld=room.edgeOfVictory
    ?playerMovementWorld(world,{ballista:room.biByeLlista,ram:room.soFistication,flight:room.fightFlight})
    :world;
  const plan=planOneHitTeleport({origin,yaw:player.input?.yaw??player.yaw,pitch:player.input?.pitch??player.pitch,
    aerial:!player.grounded&&vertical,allowVertical:vertical,
    holdSec:nowSec-(state.teleportHoldAt??nowSec),world,
    solids:teleportWorld.solids,edge:room.edgeOfVictory});
  if(!plan.legal)return false;
  player.position=plan.end;
  player.grounded=plan.grounded;
  player.velocity={x:0,y:0,z:0};
  state.teleportSucceeded=true;
  room.events.push({type:'oneHitTeleport',playerId:player.id,from:origin,to:{...plan.end},
    grounded:player.grounded,tiers:{...state.preparedTiers},at:nowSec});
  return true;
}
function commitOneHitAttack(room,player,state,nowSec,world=room.world) {
  const tiers=state.preparedTiers??oneHitCommit(player);
  if(state.preparedTiers&&!player.practiceOneHit?.enabled){
    player.oneHitInfusions=emptyInfusions();
    player.oneHitSeenUses={};
    player.practiceOneHit=null;
  }
  if(Number.isFinite(state.teleportHoldAt)&&state.teleportReleased)
    oneHitTeleport(room,player,state,nowSec,world);
  // Classification is made AFTER the teleport (or an external shove during
  // preparation). The origin's former grounded state no longer decides it.
  const form=oneHitForm(player.grounded,tiers)??'plunge';
  const teleported=Boolean(state.teleportSucceeded);
  const aerial=form==='aerial',groundWave=form==='ground'&&tiers.gale===2;
  if(form==='plunge'){
    // The original preparation committed successfully, but its knight lost
    // the ground. No Gale => NO aerial projectile. Accelerate straight down
    // through ordinary world collision; the next real landing is the slam.
    // A fall over the abyss still kills, rather than granting a rescue blink.
    state.until=Math.max(state.until??0,nowSec+6);
    room.events.push({type:'oneHitPlunge',playerId:player.id,at:nowSec});
  }
  const aimUntil=aerial&&teleported?nowSec+ONE_HIT_RULES.postTeleportAimSec:null;
  state.oneHit={
    tiers,form,startedAt:nowSec,hit:false,waveLaunched:false,
    awaitingWave:aerial||groundWave,waveResolved:false,
    aimUntil,
    waveAt:aerial?(aimUntil??nowSec+ONE_HIT_AERIAL_DURATION):
      groundWave?nowSec+ONE_HIT_RULES.groundedGaleWaveDelaySec:null,
    vortexLastAt:nowSec,vortexTicks:{},hitIds:[],
  };
  if(form==='ground'){
    state.oneHit.hitIds=oneHitSlam(room,player,tiers,nowSec,world);
    state.oneHit.hit=true;
  }
  room.events.push({type:'oneHitCommitted',playerId:player.id,tiers:{...tiers},form,at:nowSec});
}
function oneHitLaunchWave(room,player,tiers,nowSec,action) {
  const yaw=player.input?.yaw??player.yaw,pitch=player.input?.pitch??player.pitch;
  const direction={x:-Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)};
  const fromGround=action.form==='ground';
  const wave={id:'oh-wave:'+player.id+':'+nowSec,ownerId:player.id,
    position:{x:player.position.x,y:player.position.y+(fromGround?.65:1),z:player.position.z},
    direction,tiers:{...tiers},bornAt:nowSec,distance:0,
    hitIds:action.hitIds,fromGround,
  };
  (room.oneHitWaves??=[]).push(wave);
  action.hit=true;
  action.waveLaunched=true;
  action.waveLaunchedAt=nowSec;
  action.aimUntil=null;
  const speed=tiers.lightning?48:28;
  // Full Steel protects the last HP through finite wave flight. This
  // protection simply ends on impact; no stored lethal damage exists.
  const state=player.ultimateState;
  if(state?.id==='one_hit_of_wonders')
    state.until=Math.max(state.until??0,nowSec+ONE_HIT_RULES.waveMaxReach/speed+.18);
  room.events.push({type:'oneHitWave',playerId:player.id,waveId:wave.id,
    origin:{...wave.position},direction,tiers:{...tiers},fromGround,at:nowSec});
}
function stepOneHitActor(room,player,dt,nowSec,world) {
  const state=player.ultimateState;
  if(state?.id==='one_hit_of_wonders'&&player.alive)oneHitDefensiveWind(room,player,nowSec);
  const action=state?.phase==='active'&&state.id==='one_hit_of_wonders'?state.oneHit:null;
  if(!action||!player.alive)return;
  if(action.form==='plunge'){
    if(player.grounded){
      action.form='ground';
      action.hitIds=oneHitSlam(room,player,action.tiers,nowSec,world);
      action.hit=true;
      action.landedAt=nowSec;
      // The landing is authoritative, not a projected ground under the
      // ledge; hit registry and field begin here, at the actual contact.
      state.until=Math.min(state.until,nowSec+ULTIMATES.one_hit_of_wonders.activeSec);
      room.events.push({type:'oneHitPlungeLanded',playerId:player.id,at:nowSec});
    }
    return;
  }
  if(!action.awaitingWave||action.waveLaunched)return;
  // Original aerial Gale gets its vortex; teleport arrivals get a 0.35s
  // aiming hover rather than a second lengthy animation.
  if(action.form==='aerial'&&nowSec<action.waveAt &&
     nowSec-action.vortexLastAt>=.28){
    action.vortexLastAt=nowSec;
    for(const target of room.players.values()){
      if(target.id===player.id||!target.alive)continue;
      const count=action.vortexTicks[target.id]??0;
      if(count>=2||Math.hypot(target.position.x-player.position.x,target.position.y-player.position.y,
          target.position.z-player.position.z)>3.2)continue;
      if(!oneHitVisible(room,player,target,world,nowSec,oneHitChest(player)))continue;
      action.vortexTicks[target.id]=count+1;
      applyDamage(room,player.id,target.id,5,'one_hit_vortex',nowSec,null,{ultimate:true,ongoing:true});
    }
  }
  if(nowSec>=action.waveAt)oneHitLaunchWave(room,player,action.tiers,nowSec,action);
}
// A second Ultimate tap may fire sooner while the post-teleport aiming
// interval is active; otherwise the server fires automatically at the end.
export function fireOneHitWave(room,playerId,nowSec){
  const player=room.players.get(playerId),state=player?.ultimateState;
  const action=state?.oneHit;
  if(room.state!=='PLAYING'||!player?.alive||state?.id!=='one_hit_of_wonders'||
     state.phase!=='active'||action?.form!=='aerial'||!Number.isFinite(action.aimUntil)||
     action.waveLaunched||nowSec>action.aimUntil)return false;
  oneHitLaunchWave(room,player,action.tiers,nowSec,action);
  return true;
}
// The wave pierces bodies. Terrain contact or an intentional second press
// ends it; at maximum range it explodes at its endpoint. Splash contributes
// no second decisive hit, even on targets who spent Guard on the moving blade.
// Where the wave ends. Without Fire: its landing gust, which afflicts whoever it has not met and deals no HP. With
// Fire: an explosion, a wider one all round, and part of the same decisive contact: whoever the wave had not yet met
// takes the one decisive hit here, with everything the wave carries. `rec.hitIds` is the attack's one registry.
function oneHitTerminalContact(room,caster,rec,nowSec,world) {
  const fire=(rec.tiers.fire??0)>=1,caught=[];
  for(const target of room.players.values()) {
    if(rec.hitIds.includes(target.id))continue;
    const center=oneHitChest(target);
    if(Math.hypot(center.x-rec.origin.x,center.y-rec.origin.y,center.z-rec.origin.z)>rec.radius)continue;
    if(fire){
      if(oneHitTouch(room,caster,target,rec.tiers,nowSec,world,{aerial:true,origin:rec.origin,direction:rec.direction,
        distance:rec.distance,processed:rec.hitIds}))caught.push(target.id);
      continue;
    }
    if(!oneHitVisible(room,caster,target,world,nowSec,rec.origin))continue;
    rec.hitIds.push(target.id);
    if(oneHitGuard(room,caster,target,rec.guardSource,nowSec))continue;
    // A sword wave's terminal gust carries ALL of its infused on-contact
    // properties, even without Fire's bonus HP blast. Steel still disrupts
    // Skills, Gale still Blusters, Frost freezes, and Lightning conducts.
    // Only the Fire tier creates new decisive HP damage at the endpoint.
    oneHitAfflict(room,caster,target,rec.tiers,nowSec,{shaken:.6,direct:true});
    const scale=staggerShove(target.stagger);
    shoveBody(target,{x:rec.direction.x*2.2*scale,y:.35,z:rec.direction.z*2.2*scale});
    target.lastKnockbackAt=nowSec;
    target.lastKnockbackBy=caster.id;
    target.lastKnockbackSource='one_hit_wave_impact';
    target.lastAttackerId=caster.id;
    caught.push(target.id);
  }
  return caught;
}
function oneHitWaveImpact(room,caster,wave,point,contact,nowSec,world,cause=null) {
  const fire=(wave.tiers.fire??0)>=1;
  const radius=fire?ONE_HIT_RULES.waveTerminalFireRadius:ONE_HIT_RULES.waveTerminalRadius;
  const floor=surfaceHeightAt(point.x,point.z,point.y+1,world);
  const groundBlast=contact?.kind==='ground'||
    (floor!==null&&point.y>=floor-.04&&point.y-floor<=1.25);
  const origin=contact ? {x:point.x-wave.direction.x*.06,y:point.y-wave.direction.y*.06,z:point.z-wave.direction.z*.06} : point;
  const guardSource=contact ? {x:point.x-wave.direction.x,y:origin.y,z:point.z-wave.direction.z} : point;
  const rec={kind:'terminal',ownerId:caster.id,origin,guardSource,direction:wave.direction,tiers:{...wave.tiers},radius,
    hitIds:wave.hitIds,distance:wave.distance};
  const struck=oneHitTerminalContact(room,caster,rec,nowSec,world);
  // A ground-contacting wave leaves the SAME decaying Shaken terrain as a
  // slam, but over its smaller terminal radius. The ground retains full
  // Frost/Lightning field consequences and its own visible rubble. A wave
  // bursting in free air cannot create a floating patch of earth.
  let terminalFieldId=null;
  if(groundBlast&&floor!==null){
    const field={id:wave.id+':field',ownerId:caster.id,
      position:{x:point.x,y:floor,z:point.z},radius,
      bornAt:nowSec,until:nowSec+fieldSeconds(wave.tiers),
      tiers:{...wave.tiers},conducted:{},shakenContact:{}};
    if(wave.tiers.lightning>=1)for(const id of wave.hitIds)field.conducted[id]=1;
    for(const id of wave.hitIds)field.shakenContact[id]=1;
    (room.oneHitFields??=[]).push(field);
    terminalFieldId=field.id;
  }
  // Half Frost's late decisive contacts share this very field; the field
  // must remember them as direct victims rather than offering fresh Shaken
  // and Conduct all over again on the next tick.
  if(wave.tiers.frost>=1)(room.oneHitLingers??=[]).push({
    ...rec,fieldId:terminalFieldId,until:nowSec+ONE_HIT_FROST_LINGER_SEC,
  });
  // (burning ground only where there is ground under it: nothing burns in the air)
  if(wave.tiers.fire===2&&groundBlast) {
    const floor=surfaceHeightAt(origin.x,origin.z,origin.y,world);
    if(floor!==null&&origin.y-floor>=-.03&&origin.y-floor<=1.25&&
      !oneHitWorldContact(origin,{...origin,y:floor+.035},world))
      oneHitBurnZone(room,caster,`${wave.id}:fire`,{...origin,y:floor},nowSec,wave.tiers,radius);
  }
  // Preserve the REAL projectile impact coordinate for damage, interpolation
  // and playback. Only the rubble/frost/Fire ground footprint uses groundPoint.
  const groundPoint=groundBlast&&floor!==null?{...point,y:floor}:null;
  room.events.push({type:'oneHitImpact',impactId:wave.id,playerId:caster.id,point:{...point},
    ...(groundPoint?{groundPoint}:{}),
    cause:cause??(contact?'terrain':'manual'),normal:contact?.normal??null,direction:wave.direction,
    tiers:{...wave.tiers},form:'aerial',groundBlast,fromGround:Boolean(wave.fromGround),
    radius,struck,fieldId:terminalFieldId,at:nowSec});
  resolveOneHitWave(room,caster,wave,nowSec);
}
// Full Steel lasts THROUGH the outgoing wave; the protection ends at its
// terminal impact, manual detonation or maximum range, without lethal debt.
function resolveOneHitWave(room,caster,wave,nowSec){
  const state=caster.ultimateState;
  if(state?.id!=='one_hit_of_wonders'||state.oneHit?.waveResolved||
     !state.oneHit?.awaitingWave)return;
  state.oneHit.waveResolved=true;
  state.oneHit.aimUntil=null;
  room.events.push({type:'oneHitWaveResolved',playerId:caster.id,waveId:wave.id,at:nowSec});
  // No deferred lethal settlement: the protected HP remains the player's.
}
// Half Frost's longer contact, each tick until it closes: the same blow meeting whoever has come into it since.
function stepOneHitLingers(room,nowSec,world) {
  const lingers=room.oneHitLingers;
  if(!lingers?.length)return;
  for(const rec of lingers) {
    const caster=room.players.get(rec.ownerId);
    if(!caster||nowSec>rec.until+1e-9)continue;
    const late=rec.kind==='ground'
      ?oneHitGroundContact(room,caster,rec.center,rec.tiers,nowSec,world,rec.processed)
      :oneHitTerminalContact(room,caster,rec,nowSec,world);
    if(!late.length)continue;
    if(rec.ruptureId)room.ruptures?.find(r=>r.id===rec.ruptureId)?.caught.push(...late);
    const field=rec.fieldId&&rec.tiers.lightning>=1?room.oneHitFields?.find(f=>f.id===rec.fieldId):null;
    if(field)for(const id of late)field.conducted[id]=1;
    const shakeField=rec.fieldId?room.oneHitFields?.find(f=>f.id===rec.fieldId):null;
    if(shakeField)for(const id of late)(shakeField.shakenContact??={})[id]=1;
    room.events.push({type:'oneHitLateContact',playerId:caster.id,targets:late,form:rec.kind==='ground'?'ground':'aerial',at:nowSec});
  }
  room.oneHitLingers=lingers.filter(rec=>nowSec<rec.until);
}

export function detonateOneHitWave(room,playerId,waveId,nowSec) {
  const player=room.players.get(playerId);
  if(room.state!=='PLAYING'||!player?.alive||room.freezeProjectiles||
    player.operatingBallistaId||player.operatingRamId||player.operatingFightFlightId||player.restlessCarrying||
    typeof waveId!=='string')return false;
  const waves=room.oneHitWaves??[];
  const index=waves.findIndex(w=>w.id===waveId&&w.ownerId===playerId);
  if(index<0)return false;
  const [wave]=waves.splice(index,1);
  oneHitWaveImpact(room,player,wave,{...wave.position},null,nowSec,structureWorld(room.world,room.structures));
  return true;
}

function stepOneHitWorld(room,dt,nowSec,world) {
  for(const wave of room.oneHitWaves??[]) {
    const caster=room.players.get(wave.ownerId);
    if(!caster){wave.distance=ONE_HIT_RULES.waveMaxReach;continue;}
    const old=wave.position,speed=wave.tiers.lightning?48:28;
    const step=Math.min(Math.max(0,ONE_HIT_RULES.waveMaxReach-wave.distance),speed*dt);
    if(step<=0)continue;
    const next={x:old.x+wave.direction.x*step,y:old.y+wave.direction.y*step,z:old.z+wave.direction.z*step};
    const contact=oneHitWorldContact(old,next,world);
    const stop=contact?.t??1;
    for(const target of room.players.values()){
      if(wave.hitIds.includes(target.id)||!target.alive||target.id===caster.id)continue;
      const center=oneHitChest(target);
      const frac=Math.max(0,Math.min(stop,((center.x-old.x)*wave.direction.x+
        (center.y-old.y)*wave.direction.y+(center.z-old.z)*wave.direction.z)/step));
      const near=oneHitAlong(old,next,frac);
      if(Math.hypot(center.x-near.x,center.y-near.y,center.z-near.z)>((wave.tiers.fire??0)>=1?ONE_HIT_REACH.waveFire:ONE_HIT_REACH.wave))continue;
      const origin={x:near.x-wave.direction.x*.06,y:near.y-wave.direction.y*.06,z:near.z-wave.direction.z*.06};
      oneHitTouch(room,caster,target,wave.tiers,nowSec,world,{aerial:true,origin,direction:wave.direction,
        distance:wave.distance+step*frac,processed:wave.hitIds});
    }
    wave.position=oneHitAlong(old,next,stop);
    wave.distance+=step*stop;
    if(contact){
      oneHitWaveImpact(room,caster,wave,wave.position,contact,nowSec,world);
      wave.distance=ONE_HIT_RULES.waveMaxReach;
    }else if(wave.distance>=ONE_HIT_RULES.waveMaxReach-1e-8){
      // Never silently despawn: a missed shot gets its smaller terminal
      // explosion as well, and Full Steel's protection closes here.
      oneHitWaveImpact(room,caster,wave,wave.position,null,nowSec,world,'range');
    }
  }
  room.oneHitWaves=(room.oneHitWaves??[]).filter(w=>w.distance<ONE_HIT_RULES.waveMaxReach);
  for(const zone of room.oneHitBurnZones??[]) {
    if(nowSec<zone.nextAt||zone.nextAt>zone.until)continue;
    zone.nextAt+=.5;
    const caster=room.players.get(zone.ownerId);
    if(!caster)continue;
    const origin={...zone.position,y:zone.position.y+.08};
    for(const target of room.players.values()){
      if(Math.abs(target.position.y-zone.position.y)>1.25||
        Math.hypot(target.position.x-zone.position.x,target.position.z-zone.position.z)>zone.radius||
        !oneHitVisible(room,caster,target,world,nowSec,origin))continue;
      applyDamage(room,zone.ownerId,target.id,burnZoneLick(fieldStrength(zone,nowSec)),'one_hit_ground_fire',nowSec,null,
        {ultimate:true,ongoing:true});
    }
  }
  room.oneHitBurnZones=(room.oneHitBurnZones??[]).filter(z=>nowSec<z.until);
  stepOneHitLingers(room,nowSec,world);
  stepOneHitFields(room,dt,nowSec,world);
  for(const wire of room.lineConductWires??[]) {
    if(nowSec>=wire.until)continue;
    const caster=room.players.get(wire.ownerId);
    if(!caster)continue;
    for(const target of room.players.values()) {
      if(!target.alive||target.id===wire.ownerId||areAllies(room,wire.ownerId,target.id))continue;
      const center={x:target.position.x,y:target.position.y+1,z:target.position.z};
      const dx=wire.end.x-wire.origin.x,dy=wire.end.y-wire.origin.y,dz=wire.end.z-wire.origin.z;
      const lenSq=dx*dx+dy*dy+dz*dz||1;
      const t=Math.max(0,Math.min(1,((center.x-wire.origin.x)*dx+(center.y-wire.origin.y)*dy+
        (center.z-wire.origin.z)*dz)/lenSq));
      const near={x:wire.origin.x+dx*t,y:wire.origin.y+dy*t,z:wire.origin.z+dz*t};
      const distance=Math.hypot(center.x-near.x,center.y-near.y,center.z-near.z);
      wire.inside??=new Set();
      if(distance>.36)wire.inside.delete(target.id);
      else if(distance<=.18 && !wire.inside.has(target.id)){
        wire.inside.add(target.id);
        const power=Math.max(0,(wire.until-nowSec));
        const hit=applyDamage(room,wire.ownerId,target.id,(3+12*power),'line_of_conduct',nowSec,null,
          {ongoing:true,infusionCastKey:wire.id});
        if(hit)for(const actor of [caster,target]){
          if(creditOneHitEncounter(actor,'lightning',wire.id))
            room.events.push({type:'oneHitInfusion',playerId:actor.id,element:'lightning',
              tier:actor.oneHitInfusions.lightning,at:nowSec});
        }
      }
    }
  }
  room.lineConductWires=(room.lineConductWires??[]).filter(w=>nowSec<w.until);
}
function dischargeLineOfConduct(room,player,pending,nowSec,world) {
  const origin={...pending.origin};
  const direction=normalize3(pending.direction);
  const reach=240,end={x:origin.x+direction.x*reach,
    y:origin.y+direction.y*reach,z:origin.z+direction.z*reach};
  let wall=1;
  for(const box of world?.solids??[]){
    const hit=segmentAabbHit([origin.x,origin.y,origin.z],[end.x,end.y,end.z],box);
    if(hit)wall=Math.min(wall,hit.t);
  }
  const stop={x:origin.x+(end.x-origin.x)*wall,y:origin.y+(end.y-origin.y)*wall,
    z:origin.z+(end.z-origin.z)*wall};
  const wire={id:`conduct:${player.id}:${room.tickNumber}`,ownerId:player.id,
    origin,end:stop,until:nowSec+1,inside:new Set()};
  (room.lineConductWires??=[]).push(wire);
  for(const target of room.players.values()){
    if(!target.alive||target.id===player.id||areAllies(room,player.id,target.id))continue;
    const center={x:target.position.x,y:target.position.y+1,z:target.position.z};
    const ab={x:stop.x-origin.x,y:stop.y-origin.y,z:stop.z-origin.z};
    const lenSq=ab.x**2+ab.y**2+ab.z**2||1;
    const t=Math.max(0,Math.min(1,((center.x-origin.x)*ab.x+(center.y-origin.y)*ab.y+
      (center.z-origin.z)*ab.z)/lenSq));
    const near={x:origin.x+ab.x*t,y:origin.y+ab.y*t,z:origin.z+ab.z*t};
    if(Math.hypot(center.x-near.x,center.y-near.y,center.z-near.z)>.7)continue;
    wire.inside.add(target.id);
    const dist=t*Math.sqrt(lenSq);
    applyDamage(room,player.id,target.id,lineOfConductDamage(dist),'line_of_conduct',nowSec,
      null,{infusionCastKey:wire.id});
  }
  room.events.push({type:'lineConductDischarge',playerId:player.id,origin,end:stop,at:nowSec});
}
export function releaseOneHitCharge(room,playerId,nowSec,{cancel=false}={}) {
  const player=room.players.get(playerId),state=player?.ultimateState;
  if(room.state!=='PLAYING'||!player?.alive)return false;
  if(!state&&player.ultimate==='one_hit_of_wonders'&&player.disasterWantedHeld&&
     nowSec<(player.ultimateWantedUntil??-Infinity)){
    if(cancel){player.ultimateWantedUntil=-Infinity;player.disasterWantedHeld=false;}
    else player.disasterWantedReleased=true;
    return true;
  }
  if(state?.id!=='one_hit_of_wonders'||state.phase!=='startup')return false;
  if(!state.groundRelease&&!Number.isFinite(state.teleportHoldAt)&&
     !Number.isFinite(state.partialLightningHoldAt))return false;
  if(cancel)return interruptUltimate(room,player,nowSec);
  if(Number.isFinite(state.teleportHoldAt)){
    if(state.teleportReleased)return false;
    state.teleportReleased=true;
    state.commitAt=nowSec;
  }else if(Number.isFinite(state.partialLightningHoldAt)){
    if(state.partialLightningReleased)return false;
    state.partialLightningReleased=true;
    // Releasing a near-tap schedules the blow when the FULL .36s minimum
    // has elapsed; holding can delay it, but NEVER accelerate it.
    state.commitAt=Math.max(state.partialLightningReadyAt,nowSec);
  }else{
    const {readyAt}=state.groundRelease;
    state.groundRelease=null;
    if(nowSec<readyAt)return true; // ordinary tap: original windup still owns the commit
    state.commitAt=nowSec;
  }
  stepUltimate(room,player,nowSec,structureWorld(room.world,room.structures));
  return true;
}

export function tryUltimate(room, playerId, nowSec, {held=false,released=false}={}) {
  const player = room.players.get(playerId);
  if (room.state !== 'PLAYING' || !player || !player.alive) return false;
  if (nowSec < player.staggerUntil || nowSec < (player.ultimateLockedUntil ?? -Infinity)) return false;
  if (flashFrozen(player, nowSec)) return false;
  if (player.ultimateState) return false;
  // (nor in the moment after a Vortex, while both hands are still its)
  if (nowSec < (player.recoverUntil ?? -Infinity)) return false;
  // a fist in the air, or a spell gathering (Chivalry alone takes a gathering spell into itself), has the hand: the key
  // is kept a moment, and taken as soon as it is free (stepRoom), rather than lost
  if (player.gauntlet || (player.pendingSpell && ultimateFor(player.ultimate).id !== 'chivalry')) {
    const full = (player.prowess ?? 0) >= PROWESS.full || practising(room, player);
    if(full){
      player.ultimateWantedUntil=nowSec+ULTIMATE_PRESS_KEPT_SEC;
      player.disasterWantedHeld=held&&player.ultimate==='one_hit_of_wonders';
      player.disasterWantedReleased=false;
    }
    return false;
  }
  // in the Practice Yard the key readies the ultimate itself: whoever came to practise can call it again as soon as
  // the last has run its course (the yard earns no prowess; a real match's meter is untouched)
  if (practising(room, player)) player.prowess = PROWESS.full;
  if ((player.prowess ?? 0) < PROWESS.full) return false;
  const ultimate = ultimateFor(player.ultimate);
  const plannedTiers=normalizeInfusions(player.practiceOneHit?.stages ?? player.oneHitInfusions);
  if(ultimate.id==='one_hit_of_wonders' && !oneHitForm(player.grounded,plannedTiers))return false;
  player.ultimateInterruptionBy = null;
  player.ultimateInterruptionAt = null;
  player.ultimateInterruptionSource = null;
  const isDisaster=ultimate.id==='one_hit_of_wonders';
  const teleport=isDisaster&&plannedTiers.lightning===2;
  const partialHeld=isDisaster&&plannedTiers.lightning===1&&held&&!released;
  const commitAt=nowSec+(teleport?3600000:partialHeld?ONE_HIT_RULES.halfLightningHoldMaxSec:
    isDisaster&&plannedTiers.lightning===1?ONE_HIT_RULES.halfLightningStartupSec:ultimate.startupSec);
  player.ultimateState = { id: ultimate.id, phase: 'startup', startedAt: nowSec, commitAt,
    until: null,
    ...(isDisaster?{preparedTiers:plannedTiers}:{}),
    ...(teleport?{teleportHoldAt:nowSec}:{}),
    ...(partialHeld?{
      partialLightningHoldAt:nowSec,
      partialLightningReadyAt:nowSec+ONE_HIT_RULES.halfLightningStartupSec,
    }:{}),
    ...(isDisaster&&held&&!released&&player.grounded&&!teleport&&!partialHeld?{
      groundRelease:{readyAt:commitAt,until:commitAt+ONE_HIT_RULES.groundReleaseWindowSec},
    }:{}),
  };
  // the brace: sword and guard put up, the knight gathers himself. Whatever the sword was doing is over there and
  // then: the ultimate has the knight from this moment. A button still held is still held (Sunder's first slam is its:
  // it comes as the brace ends, not after the old chain's own recovery); a Vortex takes both hands and keeps no press
  player.ultimateWantedUntil = -Infinity;
  player.disasterWantedHeld=false;
  player.disasterWantedReleased=false;
  const heldAttack = Boolean(player.attackHeld || player.attackQueued || player.input?.attack) && !ultimate.spin;
  player.guardHeld = player.guardHeld || player.guarding || Boolean(player.input?.guard);
  player.guarding = false;
  stopSwordChain(player, {}, room, nowSec);
  player.attackHeld = heldAttack;
  if (!ultimate.spin) player.attackRestartAt = Math.min(player.attackRestartAt ?? -Infinity, nowSec + ultimate.startupSec);
  player.pendingSpell = null;
  player.castEndsAt = 0;
  player.dashUntil = Math.min(player.dashUntil ?? nowSec, nowSec);
  player.spawnProtectionUntil = Math.min(player.spawnProtectionUntil, nowSec);
  // (a Vortex begins with a small hop, from the ground only: a knight already in the air is not thrown up again)
  const hop = ultimate.hop && player.grounded ? ultimate.hop : 0;
  if (hop) {
    player.velocity.y = hop;
    player.grounded = false;
  }
  room.events.push({ type: 'ultimateStart', playerId, ultimate: ultimate.id, commitAt: player.ultimateState.commitAt, ...(hop ? { hop } : {}), ...(player.ultimateState.preparedTiers ? { preparedTiers: { ...player.ultimateState.preparedTiers } } : {}), at: nowSec });
  recordChallengeFact(room, { type: 'ultimateStart', playerId, ultimate: ultimate.id, at: nowSec });
  if(teleport&&released)releaseOneHitCharge(room,playerId,nowSec);
  return true;
}

// an ultimate's course, each tick: interrupted before its commit point (charge kept, a short lockout), committed (the
// charge spent), or run out
function stepUltimate(room, player, nowSec, world=room.world) {
  const state = player.ultimateState;
  if (!state) return;
  const ultimate = ultimateFor(state.id);
  if (state.phase === 'startup') {
    if (!player.alive || nowSec < player.staggerUntil) {
      interruptUltimate(room, player, nowSec);
      return;
    }
    if(state.id==='one_hit_of_wonders'&&(state.groundRelease||Number.isFinite(state.teleportHoldAt))&&
       (player.operatingBallistaId||player.operatingRamId||player.operatingFightFlightId||player.restlessCarrying)){
      interruptUltimate(room,player,nowSec);
      return;
    }
    if(state.groundRelease&&nowSec+1e-9>=state.commitAt){
      if(player.grounded&&nowSec+1e-9<state.groundRelease.until)return;
      state.groundRelease=null;
      state.commitAt=nowSec;
    }
    if (nowSec + 1e-9 >= state.commitAt) {
      player.prowess = 0;
      state.phase = 'active';
      state.until = state.commitAt + ultimate.activeSec;
      if (ultimate.id === 'one_hit_of_wonders') commitOneHitAttack(room,player,state,nowSec,world);
      // (a Vortex's blade starts round from where the knight faces as it commits, balanced)
      if (ultimate.spin) {
        state.angle = player.yaw;
        state.travel = 0; // active angular travel, independent of facing and visual wrapping
        state.angleAt = state.commitAt;
        state.rate = 2 * Math.PI * vortexTune(0, ultimate).revPerSec;
        state.emphasis = 0;
      }
      // (a Sunder with the button held: its first slam was already on its way up through the brace, and comes down
      // `firstSlamLead` after this; nothing of it could land before the commit)
      if (ultimate.firstSlamLead && (player.attackHeld || player.attackQueued) && !player.attackActive && nowSec >= player.staggerUntil) {
        startSwordChain(player, state.commitAt - ultimate.firstSlamLead);
      }
      if (combatActionPolicy(player, nowSec).concurrent) {
        player.attackRestartAt = Math.max(player.attackRestartAt ?? -Infinity, state.commitAt);
        // Commit is the sole automatic raise. Later release and interruption stay down.
        setGuard(room, player.id, true, nowSec, { auto: true });
      }
      room.events.push({ type: 'ultimateActive', playerId: player.id, ultimate: ultimate.id, until: state.until, at: nowSec });
    }
    return;
  }
  if (!player.alive || nowSec >= state.until) {
    player.ultimateState = null;
    if (ultimate.id === 'chivalry') {
      player.chivalryProjectileReadyAt = 0;
      player.guardBrokenUntil = -Infinity;
      // its automatic raise ends with it: Guard is now whatever the knight's own hand is doing (held, it stays up)
      if (player.guardAuto) {
        player.guardAuto = false;
        if (player.alive && !player.input?.guard) setGuard(room, player.id, false, nowSec);
      }
      if (player.guarding || player.pendingSpell) stopSwordChain(player, { keepSweep: true }, room, nowSec);
    }
    // a Vortex run its course winds down: a moment with no sword, spell or fist, and a little longer dizzy
    const spent = player.alive && ultimate.recoverSec ? { recoverUntil: nowSec + ultimate.recoverSec, dizzyUntil: nowSec + (ultimate.dizzySec ?? 0) } : null;
    if (spent) {
      player.recoverUntil = spent.recoverUntil;
      player.dizzyUntil = spent.dizzyUntil;
      player.attackRestartAt = Math.max(player.attackRestartAt ?? -Infinity, spent.recoverUntil);
    }
    room.events.push({ type: 'ultimateEnded', playerId: player.id, ultimate: ultimate.id, ...(spent ?? {}), at: nowSec });
  }
}

// an ultimate still in its startup is broken off: the charge kept, a short lockout before it can be tried again
function interruptUltimate(room, player, nowSec, by = null, source = null) {
  const state = player.ultimateState;
  if (!state || state.phase !== 'startup') return false;
  const ultimate = ultimateFor(state.id);
  recordChallengeFact(room, {
    type: 'ultimateInterrupted', victimId: player.id, phase: state.phase, commitAt: state.commitAt,
    by: player.ultimateInterruptionBy ?? by, source: player.ultimateInterruptionSource ?? source,
    at: player.ultimateInterruptionAt ?? nowSec,
  });
  player.ultimateState = null;
  player.ultimateLockedUntil = nowSec + ultimate.lockoutSec;
  room.events.push({ type: 'ultimateInterrupted', playerId: player.id, ultimate: ultimate.id, lockedUntil: player.ultimateLockedUntil, at: nowSec });
  return true;
}

// --- Blazing Vortex (shared/src/ultimates.mjs) ------------------------------------------------------------------
// While it spins, the blade is a real one going round the knight (blade.mjs), swept from where it was to where it is
// each tick: whoever it passes through is cut, each knight no more often than the Vortex's own cadence, a wall
// between them and the knight's eyes sparing them. What it clips of the world on the way rings (an event, for the
// eye and the ear) and does not stop it. Its fire leaves along the aim once per completed active revolution. How fast it turns, how it
// falls and what fire it throws follow its emphasis, which the knight steers by what they hold (the host's own
// reading of it, eased). Staggered, the spin cuts nothing and throws nothing until the knight has their feet again.

// where the blade points when turned to `angle` (a yaw): level, drooping a little, leaning the way the knight looks
function vortexBlade(angle, player, vortex) {
  const flat = { x: -Math.sin(angle), z: -Math.cos(angle) };
  const f = forwardFromYaw(player.yaw);
  const rad = Math.PI / 180;
  const lean = Math.max(-vortex.spin.leanDeg * rad, Math.min(vortex.spin.leanDeg * rad, player.pitch ?? 0));
  return normalize3({ x: flat.x, y: Math.tan(lean) * (flat.x * f.x + flat.z * f.z) - Math.tan(vortex.spin.droopDeg * rad), z: flat.z });
}

// the knight steers their Vortex by what they hold (before they are moved: how it falls follows from it)
function steerVortex(player, dt, nowSec) {
  const vortex = vortexing(player, nowSec);
  const state = player.ultimateState;
  if (!vortex || !state) return;
  state.emphasis = stepVortexEmphasis(state.emphasis, vortexEmphasisWanted(player.input), dt, vortex);
}

// the sword as it is seen (shorter than the reach it cuts at): what it clips of the world is looked for along this
const VORTEX_WORLD_BLADE = Object.freeze({ ...BLADE, to: ULTIMATES.vortex.world.reach });

function stepVortex(room, player, dt, nowSec, world) {
  const vortex = vortexing(player, nowSec);
  const state = player.ultimateState;
  if (!vortex || !state) return;
  const tune = vortexTune(state.emphasis, vortex);
  // the blade turns on, at the pace its emphasis gives it
  const from = state.angle;
  state.rate = 2 * Math.PI * tune.revPerSec;
  const turned = state.rate * Math.max(0, nowSec - state.angleAt);
  state.angle = from + turned;
  state.angleAt = nowSec;
  // Count boundaries in continuous active travel, never in the facing/visual angle.
  // Consume even suppressed boundaries during Stagger so recovery cannot release a backlog.
  const previousTravel = state.travel;
  state.travel += turned;
  const revolutions = Math.floor(state.travel / (2 * Math.PI)) - Math.floor(previousTravel / (2 * Math.PI));
  if (nowSec < player.staggerUntil || !(turned > 0)) return;
  const eye = { x: player.position.x, y: player.position.y + postureOf(player).eye, z: player.position.z };
  const hits = (state.hits ??= {});
  // (a few degrees at a time, so the sweep between two moments is the way the blade really went)
  const legs = Math.max(1, Math.ceil(turned / (vortex.world.stepDeg * Math.PI / 180)));
  for (let leg = 0; leg < legs && player.alive; leg += 1) {
    let a = vortexBlade(from + turned * leg / legs, player, vortex);
    const b = vortexBlade(from + turned * (leg + 1) / legs, player, vortex);
    for (;;) {
      const bodies = [];
      for (const target of room.players.values()) {
        if (target.id === player.id || !target.alive || nowSec < (hits[target.id] ?? -Infinity) + vortex.contact.everySec - 1e-9 || areAllies(room, player.id, target.id)) continue;
        bodies.push({ id: target.id, base: target.position, top: postureOf(target).crown });
      }
      const met = bodies.length ? sweepBlade(eye, a, b, bodies, world.solids ?? [], { world: false }) : null;
      if (met?.kind !== 'body') break;
      hits[met.id] = nowSec;
      landVortex(room, player, room.players.get(met.id), met, nowSec);
      a = met.direction;
    }
    vortexWorld(room, player, state, eye, b, world, nowSec);
  }
  // Every completed revolution emits along the current authoritative aim.
  // A large simulation step may legitimately complete several revolutions.
  for (let revolution = 0; revolution < revolutions; revolution += 1) {
    throwVortexFire(room, player, tune.fire, nowSec);
  }
}

// what the blade clips of the world as it comes round: a ring and sparks where it first touches a thing (an event:
// nothing is stopped, nothing is hurt), once for each time it comes into it, never two close together, and never
// again off the same thing within a moment (a blade turning inside one wall is not a bell rung four times a second)
function vortexWorld(room, player, state, eye, direction, world, nowSec) {
  const rules = ULTIMATES.vortex.world;
  const seen = (state.world ??= { touching: new Set(), lastAt: -Infinity, rang: new Map() });
  const now = new Set();
  for (const touch of bladeTouches(eye, direction, world.solids ?? [], VORTEX_WORLD_BLADE)) {
    const key = touch.solid.id ?? touch.solid;
    now.add(key);
    if (seen.touching.has(key)) continue;
    if (nowSec < seen.lastAt + rules.everySec - 1e-9 || nowSec < (seen.rang.get(key) ?? -Infinity) + rules.sameSec - 1e-9) continue;
    seen.lastAt = nowSec;
    seen.rang.set(key, nowSec);
    room.events.push({
      type: 'vortexWorldContact', playerId: player.id, point: touch.point,
      normal: { x: touch.normal[0], y: touch.normal[1], z: touch.normal[2] },
      surfaceId: touch.solid.id ?? null, material: touch.solid.material ?? 'stone', at: nowSec,
    });
  }
  seen.touching = now;
}

// the Vortex's blade meets a knight: on a guard facing it (never a perfect one: it only pays, and the third breaks a
// fresh guard), or on the knight, who is cut and left scorched
function landVortex(room, attacker, target, met, nowSec) {
  if (target.spawnProtectionUntil > nowSec) return;
  const vortex = ULTIMATES.vortex;
  const contact = vortex.contact;
  const point = met.point;
  const bladeGuard=vortexBladeGuards(target,attacker,nowSec);
  if ((target.guarding && isInGuardCone(target, attacker, nowSec)) || bladeGuard) {
    guardChallengeContact(room, target, attacker, nowSec);
    const result = resolveSwordVsGuard({
      guarding: true, guardAgeMs: Infinity, stamina: target.guardStamina, profile: guardProfile(target.knightClass), pressure: contact.guardPressure,
    });
    target.guardStamina = result.staminaAfter;
    target.lastGuardDrainAt = nowSec;
    if (result.kind === 'guardBreak') {
      breakGuard(target, GAME.guardBreakStaggerMs / 1000, nowSec);
      room.events.push({ type: 'guardBreak', attackerId: attacker.id, defenderId: target.id, impact: 0, impacts: 1, vortex: true, ...(bladeGuard?{vortexBlade:true}:{}), point, at: nowSec });
      staggerBy(room, target, STAGGER.gain.guardBreak, nowSec, attacker.id);
    } else {
      room.events.push({ type: 'block', attackerId: attacker.id, defenderId: target.id, quality: 1, impact: 0, impacts: 1, vortex: true, ...(bladeGuard?{vortexBlade:true}:{}), point, at: nowSec });
      staggerBy(room, target, contact.stagger * STAGGER.gain.blocked, nowSec, attacker.id);
    }
    return;
  }
  // full within the blade's inner stretch, less out toward its point
  const reach = met.along <= contact.inner ? 1 : 1 - (1 - contact.tip) * Math.min(1, (met.along - contact.inner) / (BLADE.to - contact.inner));
  const raw = contact.damage * reach;
  // hardened plate blunts it as it would any blow
  const armour = steelBlunt(target.steel, raw, nowSec);
  target.steel = steelTakes(target.steel, nowSec);
  const dx = target.position.x - attacker.position.x;
  const dz = target.position.z - attacker.position.z;
  const apart = Math.hypot(dx, dz);
  const f = forwardFromYaw(attacker.yaw);
  const away = apart > 1e-6 ? { x: dx / apart, z: dz / apart } : { x: f.x, z: f.z };
  applyDamage(room, attacker.id, target.id, armour.amount, 'vortex', nowSec, { x: away.x * contact.shove, y: contact.lift, z: away.z * contact.shove }, {
    steel: armour.strength, turned: Math.round(raw) - armour.amount, ultimate: true, rawDamage: raw,
  });
  // the scorch a burning blade leaves: begun again by each cut, never two at once (and never in place of a worse burn
  // already on them); hardened plate takes fewer licks of it
  const scorch = vortex.scorch;
  const licks = Math.round(scorch.licks * (1 - armour.strength));
  if (target.alive && licks >= 1) {
    const interval = scorch.seconds / scorch.licks;
    const perLick = scorch.damage / scorch.licks;
    const left = target.burn ? target.burn.perLick * target.burn.licksLeft : 0;
    if (left <= perLick * licks + 1e-9) {
      target.burn = { attackerId: attacker.id, perLick, licksLeft: licks, interval, nextAt: nowSec + interval, until: nowSec + interval * licks, ultimate: true };
    }
  }
  staggerBy(room, target, contact.stagger, nowSec, attacker.id);
  room.events.push({ type: 'vortexHit', playerId: attacker.id, targetId: target.id, point, steel: armour.strength, at: nowSec });
}

// the Vortex's fire leaves the spin toward where the knight aims now: a small Fireball of the kind its emphasis
// gives it, its owner's, and the ultimate's own (it earns no prowess)
function throwVortexFire(room, player, spellId, nowSec) {
  const spell = spellFor(spellId);
  const { eye, direction } = galeAim(player);
  const id = `f${++projectileCounter}`;
  const projectile = {
    id,
    ownerId: player.id,
    spell: spell.id,
    ultimate: true,
    position: { x: eye.x + direction.x * 0.7, y: eye.y - 0.1, z: eye.z + direction.z * 0.7 },
    velocity: { x: direction.x * spell.speed, y: direction.y * spell.speed, z: direction.z * spell.speed },
    bornAt: nowSec,
  };
  room.projectiles.set(id, projectile);
  room.events.push({ type: 'projectileSpawned', projectile: structuredClone(projectile), at: nowSec });
}

// a Sundering blade driven into the ground: it ruptures (shared/src/rupture.mjs), splitting outward the way the blow
// was going; the strike ends there (no recoil: the ground took it). `through`: the knight the slam's blade struck on
// its way down (for the event: the rupture catches them as it would anyone)
let ruptureCounter = 0;
function groundStrike(room, player, strikeIndex, met, nowSec, world, { through = null, rules = RUPTURE, oneHit = null } = {}) {
  const point = { x: met.point.x, y: met.floor.y, z: met.point.z };
  const f = forwardFromYaw(player.yaw);
  const fissures = planRupture(world, point, { x: f.x, z: f.z }, rules);
  room.events.push({ type: 'groundStrike', playerId: player.id, strikeIndex, point, ...(through ? { through } : {}), ...(oneHit ? { oneHit } : {}), at: nowSec });
  if (!fissures.length) return;
  const rupture = { id: `r${++ruptureCounter}`, ownerId: player.id, origin: point, fissures, bornAt: nowSec, reached: 0, caught: [], ...(through ? { through } : {}), ...(oneHit ? { oneHit } : {}) };
  (room.ruptures ??= []).push(rupture);
  room.events.push({
    type: 'rupture', id: rupture.id, ownerId: player.id, origin: point, speed: RUPTURE.speed,
    fissures: fissures.map((fissure) => ({ dir: fissure.dir, length: fissure.length, core: fissure.core })),
    ...(oneHit?.steel ? { radial: true, steel: oneHit.steel } : {}), at: nowSec,
  });
}

// each rupture's fissures run on; whoever stands on the ground they split as they pass is caught, once by each rupture
// (every slam's rupture is its own: standing in one after another, a knight is caught by every one). The knight the
// slam was driven through is caught where it struck the ground (they stood at its impact), as the blade passes into it.
function stepRuptures(room, nowSec) {
  if (!room.ruptures?.length) return;
  for (const rupture of [...room.ruptures]) {
    const longest = Math.max(...rupture.fissures.map((fissure) => fissure.length));
    const reached = Math.min(longest, (nowSec - rupture.bornAt) * RUPTURE.speed);
    for (const target of room.players.values()) {
      if (target.id === rupture.ownerId || !target.alive || rupture.caught.includes(target.id) || target.spawnProtectionUntil > nowSec || areAllies(room, rupture.ownerId, target.id)) continue;
      const struck = target.id === rupture.through && Math.hypot(target.position.x - rupture.origin.x, target.position.z - rupture.origin.z) <= RUPTURE.throughReach;
      // (the worst of the arms that reach them: a core over a trailing crack; the knight it was driven through, the core)
      let hit = struck ? 'core' : null;
      for (const fissure of rupture.fissures) {
        const part = fissureHit(rupture.origin, fissure, rupture.reached, reached, target.position);
        if (part === 'core') { hit = 'core'; break; }
        hit ??= part;
      }
      if (!hit) continue;
      rupture.caught.push(target.id);
      const core = hit === 'core';
      applyDamage(room, rupture.ownerId, target.id, core ? RUPTURE.damage : RUPTURE.trailDamage, 'rupture', nowSec,
        { x: 0, y: core ? RUPTURE.jolt : RUPTURE.trailJolt, z: 0 }, { ultimate: true });
      staggerBy(room, target, core ? RUPTURE.stagger : RUPTURE.trailStagger, nowSec, rupture.ownerId);
      // (a Steel-infused Disaster's radial fracture: whoever an arm catches is Shaken; the rupture's own small hurt
      // above is all the HP it takes, never the decisive hit again)
      if (rupture.oneHit?.steel && target.alive) {
        const part = core ? 'core' : 'trail';
        applyOneHitShaken(target, nowSec, ONE_HIT_STEEL.fissureShaken[part]);
        room.events.push({ type: 'oneHitFissure', playerId: target.id, ownerId: rupture.ownerId, ruptureId: rupture.id, part, at: nowSec });
      }
    }
    rupture.reached = reached;
    // its fissures have stopped: the ground stays torn a while (markTornGround), then it is only ground again
    if (reached >= longest - 1e-9) rupture.stoppedAt ??= nowSec;
    if (rupture.stoppedAt !== undefined && nowSec >= rupture.stoppedAt + RUPTURE.lastsSec) room.ruptures.splice(room.ruptures.indexOf(rupture), 1);
  }
}

// Torn ground: while a rupture's fissures run and for a while after they stop, a knight other than the one who split
// it, with their feet on one of them, cannot sprint (they may walk, run, dash and jump as ever; a knight in the air
// over it is not on it; nothing more is taken from them, and nothing hurts them for standing there).
function markTornGround(room) {
  for (const player of room.players.values()) {
    player.tornGround = Boolean(player.alive && player.grounded
      && room.ruptures?.some((rupture) => rupture.ownerId !== player.id && !areAllies(room, rupture.ownerId, player.id) && onTornGround(rupture, player.position, rupture.reached)));
  }
}

function respawnPlayer(room, player, nowSec, world) {
  const enemies = [...room.players.values()].filter((p) => p.id !== player.id && p.alive && areEnemies(room, player, p));
  const allSpawns = worldSpawnPoints(world ?? room.world, room.mode);
  if (allSpawns.length === 0) throw new Error(`World ${room.worldId ?? 'unknown'} has no spawn points`);
  let spawnPoints = allSpawns;
  if (room.policy?.teamMode && player.team) {
    const custom=modeCall(room,'spawn',player,allSpawns);
    if(custom?.length)spawnPoints=custom;
    const currentPhase = room.objectiveState?.phase ?? 0;
    if (room.mode === 'HIGH_GROUNDS') spawnPoints = availableHighGroundsSpawns(room, player, allSpawns);
    const matching = allSpawns.filter((s) => s.team === player.team && (s.phase === undefined || s.phase === currentPhase));
    if (matching.length && room.mode !== 'HIGH_GROUNDS' && !custom?.length) spawnPoints = matching;
    else if (room.mode !== 'HIGH_GROUNDS' && !custom?.length) {
      const anyTeamSpawns = allSpawns.filter((s) => s.team === player.team);
      if (anyTeamSpawns.length) spawnPoints = anyTeamSpawns;
    }
  }
  const choice = chooseSpawn(spawnPoints, enemies, room.recentSpawnUse, nowSec);
  const spawn = choice?.spawn ?? spawnPoints[0];
  if (choice) {
    const globalIdx = allSpawns.indexOf(spawn);
    room.recentSpawnUse.set(globalIdx >= 0 ? globalIdx : choice.index, nowSec);
  }
  resetAtSpawn(player, spawn, nowSec, room);
  room.events.push({ type: 'respawn', playerId: player.id, position: { ...player.position }, at: nowSec });
}

export function stepRoom(room, dt, nowSec, world = room.world) {
  if (!world) throw new Error(`Room ${room.code ?? 'unknown'} has no world`);
  stepDefeatVoices(room, nowSec);
  room.tick(nowSec);
  if (room.state !== 'PLAYING') return room.events;
  // An ongoing wave uses wholly ordinary Spellblade combat. Preparation and
  // the Renowner ceremony do not advance combat, hazards or input physics.
  if (room.mode === GAME_MODES.RENOWN_TRIALS && !renownTrialCombatOpen(room)) return room.events;
  if (room.mode === GAME_MODES.EDGE_OF_VICTORY) {
    stepEdgeOfVictory(room, nowSec, world);
    edgeHandleMountedOperators(room, nowSec);
  }
  if (room.state !== 'PLAYING') return room.events;

  if (room.mode === 'HIGH_GROUNDS') stepHighGrounds(room, dt, nowSec);
  else if(!modeCall(room,'ownsTeamObjectives'))stepObjectives(room, dt, nowSec);
  if (room.state !== 'PLAYING') return room.events;
  // Preserve the world argument for ordinary and custom/test combat worlds.
  // Only objective phase transitions deliberately replace it with canonical geometry.
  if (room.worldId === WORLD_IDS.OUTERWORKS && room.objectiveState) {
    room.world = getWorld(WORLD_IDS.OUTERWORKS).forObjective(room.objectiveState, nowSec);
    world = room.world;
  } else if (room.worldId === WORLD_IDS.BASTION_BREACH && room.objectiveState) {
    room.world = bastionBreachForObjective(room.objectiveState, nowSec);
    world = room.world;
  }
  // Always compose from canonical structure geometry; do not feed the last
  // frame's dynamic ladder rails into the next structural rebuild.
  world = modeCall(room, 'baseWorld', world) ?? world;
  world = structureWorld(world, room.structures);
  world = modeCall(room, 'composeWorld', world) ?? world;
  if (room.edgeOfVictory) world = { ...world, edgeBoundary: {
    center: room.edgeOfVictory.center, radius: room.edgeOfVictory.radius } };
  room.world = world;
  markTornGround(room);
  const effectiveWorld = playerMovementWorld(world, {ballista:room.biByeLlista,ram:room.soFistication,flight:room.fightFlight});

  for (const player of room.players.values()) {
    const isFrozenActor = Boolean(room.inspectionFrozenActors?.has(player.id));
    player.inspectionFrozen = isFrozenActor;
    if (isFrozenActor) {
      if (!player.alive) {
        player.respawnAt = (player.respawnAt ?? nowSec) + dt;
        continue;
      }
      if (player.ultimateWantedUntil) player.ultimateWantedUntil += dt;
      if (player.pendingSpell) {
        player.castEndsAt = (player.castEndsAt ?? nowSec) + dt;
        player.pendingSpell.startedAt = (player.pendingSpell.startedAt ?? nowSec) + dt;
      }
      if (player.gust) {
        player.gust.until = (player.gust.until ?? nowSec) + dt;
        player.gust.bornAt = (player.gust.bornAt ?? nowSec) + dt;
      }
      if (player.burn) {
        player.burn.until = (player.burn.until ?? nowSec) + dt;
        if (Array.isArray(player.burn.ticks)) {
          for (const t of player.burn.ticks) t.at = (t.at ?? nowSec) + dt;
        }
      }
      if (player.chill) {
        player.chill.until = (player.chill.until ?? nowSec) + dt;
      }
      player.lastGuardDrainAt = (player.lastGuardDrainAt ?? nowSec) + dt;
      player.lastDamageAt = (player.lastDamageAt ?? nowSec) + dt;
      if (player.staggerUntil && nowSec < player.staggerUntil) {
        player.staggerUntil += dt;
      }
      if (player.ultimateState) {
        if (player.ultimateState.commitAt) player.ultimateState.commitAt += dt;
        if (player.ultimateState.until) player.ultimateState.until += dt;
      }
      if (player.attackActive) {
        player.attackStartedAt = (player.attackStartedAt ?? nowSec) + dt;
        if (player.attackRestartAt) player.attackRestartAt += dt;
      }
      if (player.gauntlet) {
        player.gauntlet.landAt = (player.gauntlet.landAt ?? nowSec) + dt;
      }
      if (player.dashUntil && nowSec < player.dashUntil) {
        player.dashUntil += dt;
      }
      player.velocity = { x: 0, y: 0, z: 0 };
      player.impulse = { x: 0, z: 0 };
      recordTransform(player, nowSec);
      continue;
    }
    if (!player.alive) {
      if (room.mode !== GAME_MODES.EDGE_OF_VICTORY && nowSec >= player.respawnAt && room.state === 'PLAYING') respawnPlayer(room, player, nowSec, world);
      else if(player.deathFlight){
        // A lethal piston strike leaves real momentum in the defeated body.
        // Reuse normal gravity, substepped world collision and shove damping;
        // never rerun damage/scoring or change the respawn deadline.
        const flight=player.deathFlight;
        if(nowSec<=flight.until){
          const moved=movePlayer(player,{forward:0,right:0,jump:false,crouch:false,flight:false,yaw:player.yaw},dt,nowSec,world);
          player.position=moved.position;player.velocity=moved.velocity;
          player.impulse=moved.impulse;player.grounded=moved.grounded;
          if(moved.grounded&&Math.hypot(moved.impulse.x,moved.impulse.z)<.12&&nowSec-flight.at>.45)player.deathFlight=null;
        }else player.deathFlight=null;
      }
      continue;
    }
    if (flashFrozen(player, nowSec)) holdFlashFrozen(player, dt, nowSec);
    // the ultimate's key, kept while the hand was busy: taken now if it is free
    if(nowSec<(player.ultimateWantedUntil??-Infinity)&&!player.pendingSpell&&!player.gauntlet)
      tryUltimate(room,player.id,nowSec,{held:player.disasterWantedHeld,released:player.disasterWantedReleased});

    if (player.pendingSpell && spellFor(player.pendingSpell.spell).kind === 'cone' && nowSec >= player.castEndsAt) spawnSpell(room, player, nowSec, world);
    // a gust still blowing catches whoever it reaches now
    if (player.gust) {
      const gust = player.gust;
      if (nowSec > gust.bornAt && (nowSec <= gust.until || gust.mode === 'sustained' && nowSec - dt < gust.until)) {
        const affected = blowGale(room, player, nowSec, world, dt);
        if (affected.length) room.events.push({ type: 'galeCatch', playerId: player.id, spell: gust.spell, affected, at: nowSec });
      }
      if (nowSec >= gust.until) player.gust = null;
    }
    stepAfflictions(room, player, nowSec);
    if (!player.alive) continue;
    stepSteelInfusion(room, player, nowSec);

    const guardCapacity = guardProfile(player.knightClass).capacity;
    if (nowSec - player.lastGuardDrainAt >= GUARD_REGEN_DELAY_SEC && player.guardStamina < guardCapacity) {
      const rate = GUARD_REGEN_PER_SEC * (player.guarding ? GUARD_REGEN_GUARDING : 1);
      player.guardStamina = Math.min(guardCapacity, player.guardStamina + rate * dt);
    }
    // balance comes back once nothing has shaken it for a moment; an ultimate braces, commits and runs its course
    drainStagger(player.stagger, dt, nowSec);
    stepUltimate(room, player, nowSec, world);
    const staggered = nowSec < player.staggerUntil;
    // sprint: its own state, decided from the real stamina; it spends the guard's bar slowly and holds off regen
    player.sprinting = resolveSprint({
      wantsSprint: Boolean(player.input?.sprint),
      forward: player.input?.forward,
      right: player.input?.right,
      grounded: player.grounded,
      stamina: player.guardStamina,
      sprinting: player.sprinting,
      blocked: combatBlocksSprint(player, nowSec) || Boolean(player.tornGround) || Boolean(player.operatingRamId) || Boolean(player.operatingFightFlightId),
      crouched: Boolean(player.crouched),
    });
    // (torn ground breaks a sprint outright: the speed it had built goes with it)
    if (player.tornGround) player.sprintBlend = 0;
    if (player.sprinting) {
      player.guardStamina = Math.max(0, player.guardStamina - SPRINT.staminaPerSec * dt *
        shakenSprintFactor(player.shaken,nowSec));
      player.lastGuardDrainAt = nowSec;
    }
    // Resolve sprint before healing, using the simulation's true sprint state (not world velocity).
    if (!player.sprinting && nowSec - player.lastDamageAt >= HEALTH_REGEN_DELAY_SEC
      && nowSec >= (player.coreRegenPausedUntil ?? -Infinity) && player.health < GAME.maxHealth) {
      player.health = Math.min(GAME.maxHealth, player.health + HEALTH_REGEN_PER_SEC * dt);
    }

    // (bracing into an ultimate, a knight moves only a little: the startup is exposed)
    // (spinning in a Vortex, they move at its pace and fall slowly, as they have steered it: no sprint, no crouch)
    steerVortex(player, dt, nowSec);
    const bracing = ultimateStartup(player, nowSec);
    const whirl = ultimateWhirl(player, nowSec) ?? oneHitGlide(player,MOVEMENT.runSpeed);
    const freelyCharging=oneHitChargingLightning(player,nowSec);
    const plunging=player.ultimateState?.id==='one_hit_of_wonders'&&
      player.ultimateState.phase==='active'&&player.ultimateState.oneHit?.form==='plunge';
    player.shakenNow=nowSec;
    const frozen=nowSec < (player.oneHitFrozenUntil??-Infinity);
    const input = frozen ? { forward:0,right:0,jump:false,sprint:false,yaw:player.yaw,pitch:player.pitch }
      : staggered
      ? { forward: 0, right: 0, jump: false, crouch: Boolean(player.input?.crouch), yaw: player.yaw, pitch: player.pitch }
      : plunging
        ? { ...player.input, forward:0, right:0, jump:false, sprint:false, yaw:player.yaw, pitch:player.pitch }
        : freelyCharging
          ? { ...player.input, sprint:false }
        : bracing
          ? { ...player.input, forward: (player.input?.forward ?? 0) * bracing.startupMove, right: (player.input?.right ?? 0) * bracing.startupMove, jump: false, sprint: false }
        : whirl
          ? { ...player.input, sprint: false, crouch: false }
          : player.input;
    player.whirl = whirl;
    // The non-Gale Ultimate is a deliberate DOWNWARD plunge, not a free
    // aerial attack or an unvalidated teleport into the nearest platform.
    // Collisions and the abyss still govern its descent.
    if(plunging&&!player.grounded)player.velocity.y=Math.min(player.velocity.y??0,
      -ONE_HIT_RULES.groundPlungeFallSpeed);
    const from = { ...player.position };
    const dashing = nowSec < (player.dashUntil ?? -Infinity);
    const aboardFlight=Boolean(player.operatingFightFlightId && room.fightFlight?.operatorId === player.id);
    if (aboardFlight) {
      // Flight uses Jump for ascent, not accidental ejection. Keep the existing
      // sword chain/swept contact logic below, *only* skip ordinary foot locomotion.
      player.position={x:room.fightFlight.x,y:room.fightFlight.y,z:room.fightFlight.z};
      player.velocity={...room.fightFlight.velocity};player.yaw=input.yaw??player.yaw;player.pitch=input.pitch??player.pitch;
      player.sprinting=false;player.sprintBlend=0;
    }
    if (player.operatingRamId && room.soFistication?.operatorId === player.id) {
      if(input.jump)dismountSoFistication(room,room.soFistication,player);
      if(player.operatingRamId){player.position=soFistOperator(room.soFistication);player.yaw=input.yaw??player.yaw;player.pitch=input.pitch??player.pitch;player.sprinting=false;player.sprintBlend=0;continue;}
    }
    if (player.operatingBallistaId && room.biByeLlista?.operatorId === player.id) {
      if (input.jump) {
        dismountBiByeLlista(room.biByeLlista, player);
        const moved = movePlayer(player, input, dt, nowSec, world);
        player.position = moved.position;
        player.velocity = moved.velocity;
        player.grounded = moved.grounded;
        player.jumpHeld = moved.jumpHeld;
        player.dashUntil = moved.dashUntil;
        player.dashReadyAt = moved.dashReadyAt;
        player.dashDir = moved.dashDir;
        player.sprintBlend = moved.sprintBlend;
        player.impulse = moved.impulse;
        player.crouched = moved.crouched;
        player.yaw = input.yaw ?? player.yaw;
        player.pitch = input.pitch ?? player.pitch;
      } else {
        const bl = room.biByeLlista;
        const cos = Math.cos(bl.heading - bl.baseYaw);
        const sin = Math.sin(bl.heading - bl.baseYaw);
        const ox = bl.operatorOffset.x * cos - bl.operatorOffset.z * sin;
        const oz = bl.operatorOffset.x * sin + bl.operatorOffset.z * cos;
        player.position = {
          x: bl.x + ox,
          y: bl.y + bl.operatorOffset.y,
          z: bl.z + oz,
        };
        player.velocity = { x: 0, y: 0, z: 0 };
        player.grounded = true;
        player.sprinting = false;
        player.crouched = false;
        player.yaw = bl.yaw;
        player.pitch = bl.pitch;
      }
    } else if (!aboardFlight) {
      const moved = movePlayer(player, input, dt, nowSec, effectiveWorld);
      player.position = moved.position;
      player.velocity = moved.velocity;
      player.grounded = moved.grounded;
      player.ejectionFallExempt = Boolean(moved.ejectionFallExempt);
      player.jumpHeld = moved.jumpHeld;
      player.dashUntil = moved.dashUntil;
      player.dashReadyAt = moved.dashReadyAt;
      player.dashDir = moved.dashDir;
      player.sprintBlend = moved.sprintBlend;
      player.impulse = moved.impulse;
      player.crouched = moved.crouched;
      // (Blustered: the fighting facing turns only so fast toward the look; the look and the legs are not slowed)
      player.yaw = player.blustered ? blusteredFacing(player.yaw, input.yaw, player.blustered, dt, nowSec) : input.yaw ?? player.yaw;
      player.pitch = input.pitch ?? player.pitch;
      player.flight = moved.flight;
      if(player.restlessCarrying)constrainRestlessCarry(player,from,effectiveWorld,player.yaw);
      resolveWorldImpact(room,player,from,moved,nowSec);
    }
    if (room.mode === GAME_MODES.EDGE_OF_VICTORY && !player.operatingRamId && !player.operatingFightFlightId && !player.operatingBallistaId)
      edgeConstrainActor(room, player, from, nowSec, effectiveWorld);
    // a Steel dash driven into someone: it meets them, gives them its momentum, and stops there (steelRam.mjs)
    if (player.dashRam) {
      if (dashing) ramThrough(room, player, from, nowSec, world);
      if (nowSec >= (player.dashUntil ?? -Infinity)) player.dashRam = null;
    }
    recordTransform(player, nowSec);

    // A gathered projectile leaves the current hand along the latest authoritative aim. Once released its
    // velocity belongs to the projectile; turning or moving the caster never steers it.
    if (player.pendingSpell && spellFor(player.pendingSpell.spell).kind !== 'cone' && nowSec >= player.castEndsAt) spawnSpell(room, player, nowSec, world);

    if (player.position.y < (world.abyssY ?? -9) && !player.flight) {
      killPlayer(room, player.id, null, 'abyss', nowSec);
      continue;
    }

    resumeHeldActions(room, player, nowSec, dt);
    if (player.attackActive && nowSec >= player.staggerUntil) {
      // the chain in time order: committed strikes land; as each next swing would begin, it is committed if the
      // button is still held (or was pressed again), or the chain ends there, the swing before it having landed
      const elapsed = nowSec - player.attackStartedAt;
      // the next committed strike goes live a moment before its contact
      const next = player.attackNextStrike;
      if (next < (player.attackCommitted ?? 0) && (player.attackOpened ?? -1) < next
        && elapsed + 1e-9 >= SWORD_STRIKE_TIMES[next] - MELEE_CONTACT.window.early) {
        openStrike(room, player, next, nowSec);
      }
      for (;;) {
        const step = player.attackActive ? nextChainStep({ committed: player.attackCommitted ?? 1, landed: player.attackNextStrike }, elapsed) : null;
        if (!step) break;
        if (step.kind === 'land') {
          // its contact has come (the strike went live a moment before, and sweeps on a moment after)
          if ((player.attackOpened ?? -1) < step.strike) openStrike(room, player, step.strike, nowSec);
          player.attackNextStrike += 1;
          player.attackLanded = player.attackNextStrike;
        } else if (player.attackHeld || player.attackQueued) {
          player.attackCommitted = (player.attackCommitted ?? 1) + 1;
          // (a fresh press asked for it outright; a hold may yet turn out to have been let go just before)
          player.attackCommitBy = player.attackQueued ? 'queued' : 'held';
          player.attackQueued = false;
        } else {
          stopSwordChain(player, { letGo: true }, room, nowSec);
          room.events.push({ type: 'attackEnded', playerId: player.id, at: nowSec });
        }
      }
      if (player.attackActive && player.attackNextStrike >= SWORD_STRIKE_TIMES.length) {
        // the whole chain is done: a held (or pressed again) button starts the next one a beat later
        const again = player.attackHeld || player.attackQueued;
        const held = player.attackHeld;
        // (its restart is the chain's own: SWORD_CHAIN.restart after the third contact, not after this tick)
        stopSwordChain(player, { keepSweep: true, done: true }, room, nowSec);
        player.attackHeld = held;
        player.attackQueued = again;
      }
    } else if ((player.attackHeld || player.attackQueued) && !player.attackActive && nowSec >= (player.attackRestartAt ?? -Infinity) && nowSec >= player.staggerUntil
      && !ultimateStartup(player, nowSec)) {
      // a held or waiting press starts the chain the moment it became legal (at most a tick back), not at the tick
      // that noticed: holding comes round exactly on time
      const legal = Math.max(player.attackRestartAt ?? -Infinity, player.staggerUntil ?? -Infinity);
      startSwordChain(player, Math.min(nowSec, Math.max(nowSec - dt, legal)));
    }
    // a live strike sweeps on to the end of its stretch (the last one past the chain's own end)
    if (player.attackSweep) sweepStrike(room, player, nowSec, world);
    // a thrown fist lands
    if (player.gauntlet && nowSec + 1e-9 >= player.gauntlet.landAt) landGauntlet(room, player, nowSec, world);
    // a Vortex's blade goes round, and its embers leave
    if (player.ultimateState?.angle !== undefined) stepVortex(room, player, dt, nowSec, world);
    stepOneHitActor(room,player,dt,nowSec,world);
  }

  stepRuptures(room, nowSec);
  // bodies do not share space: overlapping Spellblades are eased apart (never off a ledge or into a wall)
  separatePlayers([...room.players.values()].filter((p) => !p.operatingBallistaId&&!p.operatingRamId&&!p.operatingFightFlightId), effectiveWorld);
  const activeActorId = room.inspectionActorId ?? room.inspectionControlId ?? [...room.players.values()].find(p => p.actorKind === 'human')?.id ?? null;
  const isOthersFreeze = room.inspectionFreezeMode === 'others';
  if(room.fightFlight && (!isOthersFreeze || room.fightFlight.operatorId === activeActorId)){
    stepTerminalPreparation(room,room.fightFlight,nowSec);
    stepFlightRun(room,room.fightFlight,dt,nowSec);
    const flight=room.fightFlight,dive=flight.terminalDive;
    if(dive&&!dive.resolved){
      // At 30Hz multiplayer advances one frame. A throttled solo browser can
      // skip wall-clock seconds while still delivering fixed 1/30s host ticks.
      // Catch up ONLY the committed machine's physical trajectory; never allow
      // the physical charge to be skipped by a stalled browser host.
      const frames=terminalFlightSteps(dive,nowSec,dt);
      for(let i=0;i<frames&&!dive.resolved;i++){
        const physicsNow=dive.startedAt+(dive.simulatedSec??0)+dt;
        advanceTerminalFlight(room,flight,dt,physicsNow);
        stepFightFlight(room,flight,dt,physicsNow,world);
        stepFightFlightRotor(room,flight,dt,physicsNow);
        resolveTerminalFlight(room,flight,nowSec);
      }
    }else{
      stepFightFlight(room,flight,dt,nowSec,world);
      stepFightFlightRotor(room,flight,dt,nowSec);
    }
    stepFightFlightSkill(room,flight,nowSec);
    stepFightFlightWeapons(room,flight,dt,nowSec);
    const op=room.players.get(room.fightFlight.operatorId);if(op)recordTransform(op,nowSec);
  }
  if(room.soFistication && (!isOthersFreeze || room.soFistication.operatorId === activeActorId)){stepSoFistication(room,room.soFistication,dt,nowSec,world);const op=room.players.get(room.soFistication.operatorId);if(op)recordTransform(op,nowSec);}
  if (room.biByeLlista && (!isOthersFreeze || room.biByeLlista.operatorId === activeActorId)) {
    stepBiByeLlista(room, room.biByeLlista, dt, nowSec);
  }
  // Run AFTER vehicle physics, BEFORE damage/projectiles/Steel. Removing a
  // machine beyond abyssY here avoids zombie Practice build/rebuild slots and
  // guarantees later systems never operate an out-of-world chassis.
  if(!isOthersFreeze)lostSiegeMachines(room,nowSec,killPlayer);
  // One shared authoritative repair clock per machine; never per pilot or
  // per rendered frame. Damage entrypoints also use the same ward object.
  if(room.fightFlight)stepSiegeSteel(room,room.fightFlight,nowSec);
  if(room.biByeLlista)stepSiegeSteel(room,room.biByeLlista,nowSec);
  if(room.soFistication)stepSiegeSteel(room,room.soFistication,nowSec);
  if (!room.freezeProjectiles) {
    const filterOwnerId = isOthersFreeze ? activeActorId : null;
    // (a spell loosed this very tick from close by is inside a Disaster's wind before it has moved at all: the wind
    // has its say first)
    for (const knight of room.players.values())
      if (knight.alive && knight.ultimateState?.id === 'one_hit_of_wonders') oneHitDefensiveWind(room, knight, nowSec);
    stepProjectiles(room, dt, nowSec, world, { filterOwnerId });
    stepFightFlightProjectiles(room,dt,nowSec,world,{filterOwnerId});
    if (room.biByeLlista) {
      stepBiByeProjectiles(room, dt, nowSec, world, { filterOwnerId });
    }
  } else {
    for (const projectile of room.projectiles.values()) {
      projectile.bornAt = (projectile.bornAt ?? nowSec) + dt;
      if (projectile.detonateAt) projectile.detonateAt += dt;
      if (projectile.coreKnockedAt) projectile.coreKnockedAt += dt;
      if (projectile.armedAt) projectile.armedAt += dt;
    }
    if (room.bibyeProjectiles) {
      for (const bp of room.bibyeProjectiles.values()) {
        bp.bornAt = (bp.bornAt ?? nowSec) + dt;
      }
    }
  }
  if(!room.freezeProjectiles) stepOneHitWorld(room,dt,nowSec,world);
  stepFlightBurnZones(room,nowSec);
  if (room.mode === GAME_MODES.EDGE_OF_VICTORY) {
    stepEdgeOfVictory(room, nowSec, world);
    edgeHandleMountedOperators(room, nowSec);
  }
  // The actual resource is always full for living (or respawning) human
  // trainees; active Ultimate state still prevents reactivation. This runs
  // AFTER vehicle/terminal physics so a consumed terminal chord is never
  // mistaken for another start within the same simulation frame.
  if(room.mode===GAME_MODES.PRACTICE && !room.localTutorial){
    for(const trainee of room.players.values())
      if(trainee.actorKind==='human')trainee.prowess=PROWESS.full;
  }
  modeCall(room,'step',dt,nowSec,{damage:applyDamage});
  room.tickNumber += 1;
  return room.events;
}
