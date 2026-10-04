import {
  DAMAGE_LEVELS, GAME, HEALTH_REGEN, MAX_FORCE, MELEE_CONTACT, SWORD_CHAIN, SWORD_STRIKE_TIMES, closingImpact, guardProfile, nextChainStep,
  resolveSwordVsGuard, swordDamage, swordDamageFor, swordForce,
} from '../src/combat.mjs';
import { STAGGER, addStagger, drainStagger, freshStagger, staggerShove } from '../src/stagger.mjs';
import { PROWESS, gainProwess, prowessForDamage } from '../src/prowess.mjs';
import {
  ULTIMATES, ULTIMATE_PRESS_KEPT_SEC, dizzy, stepVortexEmphasis, sundering, ultimateFor, ultimateStartup, ultimateWhirl, vortexEmphasisWanted, vortexTune, vortexing,
} from '../src/ultimates.mjs';
import { combatActionPolicy, combatBlocksSprint } from '../src/combatActionPolicy.mjs';
import { recordChallengeFact } from './challenges.mjs';
import { preparedSpellMember } from '../src/preparedSpells.mjs';
import { RUPTURE, fissureCatches, onTornGround, planRupture } from '../src/rupture.mjs';
import { recastReady, recordUse } from '../src/practiceRecast.mjs';
import { GAME_MODES } from '../src/modes.mjs';
import { blastDamage, blastDistance, burnFrom, chillFrom, chillScale, spellExposure, spellFor, strongerChill } from '../src/spells.mjs';
import { callSteel, steelBlunt, steelExposure, steelQuality, steelStrength, steelTakes } from '../src/steel.mjs';
import { galeBend, galeCarry, galeOnBody, galeRecoil, galeShove, galeWindOnBody } from '../src/gale.mjs';
import { GAUNTLET, gauntletGeometry, gauntletTarget, withinGauntlet } from '../src/gauntlet.mjs';
import { postureOf } from '../src/body.mjs';
import { segmentAabbHit, surfaceHeightAt } from '../src/collision.mjs';
import { BLADE, aimFrame, aimQuality, bladeDirection, bladeTouches, offAimDegrees, sweepBlade } from '../src/blade.mjs';
import { MOVEMENT, SPRINT, launchBody, movePlayer, resolveSprint, shoveBody, tryStartDash } from '../src/movement.mjs';
import { separatePlayers } from '../src/separation.mjs';
import { chooseSpawn } from './spawns.mjs';
import { recordTransform, sampleTransform } from './history.mjs';

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
  player.speedScale = 1;
  // balance found again; an ultimate still bracing or active is over (the prowess earned is kept)
  player.stagger = freshStagger();
  player.ultimateState = null;
  player.spawnProtectionUntil = nowSec + SPAWN_PROTECTION_SEC;
  player.alive = true;
  player.respawnAt = 0;
  player.lastDamageAt = -Infinity;
  player.lastAttackerId = null;
  player.lastKnockbackAt = -Infinity;
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
  player.attackNextStrike = 0;
  player.attackCommitted = 1;
  player.attackCommitBy = null;
  player.attackQueued = false;
  player.attackOpened = -1;
  player.attackSweep = null;
  player.attackLastChain = null;
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
function stopSwordChain(player, { keepSweep = false, letGo = false } = {}, room = null, nowSec = 0) {
  if (!keepSweep && !letGo && (player.attackActive || player.attackSweep)) {
    recordChallengeFact(room, { type: 'swordChainInterrupted', playerId: player.id, chainId: player.attackChainId, at: nowSec });
  }
  const due = nextStrikeDue(player);
  if (due > (player.attackRestartAt ?? -Infinity)) player.attackRestartAt = due;
  player.attackLastChain = letGo && player.attackActive && (player.attackCommitted ?? 0) < SWORD_STRIKE_TIMES.length
    ? { startedAt: player.attackStartedAt, committed: player.attackCommitted, landed: player.attackNextStrike, endedAt: due, slam: Boolean(player.attackSlam), chainId: player.attackChainId }
    : null;
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
}

export function beginAttack(room, playerId, nowSec) {
  const player = room.players.get(playerId);
  if (room.state !== 'PLAYING' || !player || !player.alive || nowSec < player.staggerUntil) return false;
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

export function setGuard(room, playerId, guarding, nowSec) {
  const player = room.players.get(playerId);
  if (!player || !player.alive) return false;
  player.guardHeld = Boolean(guarding);
  if (guarding && room.state !== 'PLAYING') return false;
  if (guarding && (player.guardStamina <= 0 || nowSec < player.staggerUntil || ultimateStartup(player, nowSec) || vortexing(player, nowSec))) return false;
  if (player.guarding === Boolean(guarding)) return true;
  player.guarding = Boolean(guarding);
  if (guarding) {
    player.guardStartedAt = nowSec;
    if (!combatActionPolicy(player, nowSec).concurrent) stopSwordChain(player, {}, room, nowSec);
  }
  room.events.push({ type: guarding ? 'guardStarted' : 'guardEnded', playerId, at: nowSec });
  return true;
}

// both hands are the Vortex's while it spins, and for a moment after it ends (its recovery): no spell, no fist
function handsTaken(player, nowSec) {
  return Boolean(vortexing(player, nowSec)) || nowSec < (player.recoverUntil ?? -Infinity);
}

// the Practice Yard lets abilities be used again after a moment, their real cooldowns still shown (practiceRecast.mjs)
function inPractice(room) {
  return room.mode === GAME_MODES.PRACTICE;
}

// that leave is the knight's who came to practise: the yard's own opponents keep their real cooldowns (or they would
// throw a spell every time the gate opened: a fireball every half second)
function practising(room, player) {
  return inPractice(room) && player?.actorKind === 'human';
}

export function tryDash(room, playerId, direction, nowSec) {
  const player = room.players.get(playerId);
  if (room.state !== 'PLAYING' || !player || !player.alive || nowSec < player.staggerUntil || ultimateStartup(player, nowSec) || vortexing(player, nowSec)) return false;
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
  room.events.push({ type: 'dash', playerId, direction, at: nowSec });
  return true;
}

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
  const practice = practising(room, player);
  const spell = spellFor(player.spell);
  if (player.pendingSpell && nowSec >= player.castEndsAt && !ultimateStartup(player, nowSec)) spawnSpell(room, player, nowSec, room.world);
  if (player.pendingSpell || !spellReady(player, spell, nowSec, practice) || ultimateStartup(player, nowSec) || handsTaken(player, nowSec)) return false;
  if (spell.kind === 'ward') return sheatheInSteel(room, player, spell, nowSec);
  recordSpellUse(player, spell, nowSec, practice);
  player.castEndsAt = nowSec + spell.gatherSec;
  const policy = combatActionPolicy(player, nowSec);
  player.pendingSpell = { spell: spell.id, direction: normalize3(direction), ...(policy.concurrent ? { ultimate: true } : {}) };
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
  player.steel = callSteel(nowSec);
  recordSpellUse(player, spell, nowSec, practising(room, player));
  player.spawnProtectionUntil = Math.min(player.spawnProtectionUntil, nowSec);
  room.events.push({ type: 'steelOn', playerId: player.id, at: nowSec, readyAt: player.spellReadyAt });
  return true;
}

/**
 * The spell's key: the spell, if it is ready; while it is on its cooldown, the gauntlet, on command
 * (shared/src/gauntlet.mjs). pressedAt: the player's own moment.
 */
export function tryCastOrGauntlet(room, playerId, direction, nowSec, pressedAt = nowSec) {
  const player = room.players.get(playerId);
  if (!player) return false;
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
    if (other.id === player.id || !other.alive) continue;
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

function transformFor(player, atSec) {
  return sampleTransform(player, atSec);
}

function isInGuardCone(defender, attacker, atSec) {
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

// What stops a Sundering blade. A blow of the greatest force is not turned by what it brushes on its way: the world
// stops it only close about its aim (where it is being driven: a wall dead ahead), and a small loose furnishing never
// does. A wall still hides whoever stands behind it, and the ground is still the ground (it ruptures). An ordinary
// blade is as it was.
const SUNDER_SWEEP = Object.freeze({
  blade: Object.freeze({ ...BLADE, worldStopDeg: ULTIMATES.sunder.worldStopDeg }),
  spares: (solid) => Boolean(solid.incidental),
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
  player.attackSweep = { strike, sampledTo: window.from, direction: null, slam, ruptures: slam && sundering(player, nowSec), struck: null };
  room.events.push({ type: 'swordSwing', playerId: player.id, strikeIndex: strike, ...(slam ? { slam: true } : {}), at: nowSec });
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
  const solids = world.solids ?? [];
  const blade = live.slam ? SLAM_STRIKE : live.strike;
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
      if (target.id === player.id || !target.alive) continue;
      const placed = transformFor(target, at);
      bodies.push({ id: target.id, base: placed.position, top: postureOf(placed).crown });
    }
    // (a Sundering slam strikes the ground too: a blade driven into it ruptures it)
    const ground = live.ruptures ? world.floors ?? null : null;
    // (the world stops the blade only up to its contact: past that it is swinging through, not driven)
    const driven = live.sampledTo < window.contact + MELEE_CONTACT.worldFollow - 1e-9;
    // (and a Sundering blade only where it is driven straight into something: SUNDER_SWEEP)
    const met = sweepBlade(eye, from, to, bodies, solids, { aim: frame.forward, ground, world: driven, ...(live.ruptures ? SUNDER_SWEEP : {}) });
    live.sampledTo = at;
    live.direction = to;
    if (met?.kind === 'body') {
      const outcome = landStrike(room, player, live.strike, room.players.get(met.id), at, nowSec);
      if (!live.slam || outcome === 'parry' || player.attackSweep !== live) {
        if (player.attackSweep === live) player.attackSweep = null;
        return;
      }
      live.struck = met.id;
      continue;
    }
    if (met?.kind === 'solid') {
      player.attackSweep = null;
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
    if (!live.struck) room.events.push({ type: 'swordMiss', playerId: player.id, strikeIndex: live.strike, at: nowSec });
  }
}

/** The blow lands on `target`: parried, blocked or a hit, as cleanly and as hard as it was met. */
function landStrike(room, attacker, strikeIndex, target, atSec, nowSec) {
  if (target.spawnProtectionUntil > nowSec) {
    room.events.push({ type: 'swordProtected', playerId: attacker.id, targetId: target.id, strikeIndex, at: nowSec });
    return 'protected';
  }
  const attackerTransform = transformFor(attacker, atSec);
  const targetTransform = transformFor(target, atSec);
  const { view, frame } = bladeOrigin(attackerTransform);
  // how cleanly: how far off the aim they were as the blade met them
  const offAim = offAimDegrees(view, frame.forward, targetTransform.position, postureOf(targetTransform).crown);
  const quality = aimQuality(offAim);
  const dx = targetTransform.position.x - attackerTransform.position.x;
  const dz = targetTransform.position.z - attackerTransform.position.z;
  const horizontal = Math.hypot(dx, dz);
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

  if (target.guarding && isInGuardCone(target, attacker, atSec)) {
    guardChallengeContact(room, target, attacker, nowSec);
    // a Sundering blow lands on a guard as two (the guard pays for both; it is still one blow)
    const impacts = empowered ? ultimateFor('sunder').guardImpacts : 1;
    const guardResult = resolveSwordVsGuard({
      guarding: true,
      guardAgeMs: (nowSec - target.guardStartedAt) * 1000,
      stamina: target.guardStamina,
      profile: guardProfile(target.knightClass),
      // a glancing blow bears less on the guard, a collision more
      pressure: (0.6 + 0.4 * physical.quality) * (1 + MELEE_CONTACT.impactGuard * physical.impact),
      impacts,
    });
    target.guardStamina = guardResult.staminaAfter;
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
      room.events.push({ type: 'parry', attackerId: attacker.id, defenderId: target.id, suppressParryReel, at: nowSec });
      recordChallengeFact(room, { type: 'parry', attackerId: attacker.id, defenderId: target.id, at: nowSec });
      staggerBy(room, attacker, STAGGER.gain.parried, nowSec, target.id);
      return 'parry';
    }
    target.lastGuardDrainAt = nowSec;
    if (guardResult.kind === 'guardBreak') {
      target.guarding = false;
      if (combatActionPolicy(target, nowSec).concurrent) interruptOrdinaryActions(room, target, nowSec);
      target.staggerUntil = nowSec + (GAME.guardBreakStaggerMs / 1000) * (1 + MELEE_CONTACT.impactBreakStagger * physical.impact);
      if (!combatActionPolicy(attacker, nowSec).concurrent && !attacker.attackChivalry) gainProwess(room, attacker, PROWESS.guardBreak);
      room.events.push({ type: 'guardBreak', attackerId: attacker.id, defenderId: target.id, impact: physical.impact, impacts, at: nowSec });
      staggerBy(room, target, STAGGER.gain.guardBreak, nowSec, attacker.id);
    } else {
      room.events.push({ type: 'block', attackerId: attacker.id, defenderId: target.id, quality, impact: physical.impact, impacts, at: nowSec });
      staggerBy(room, target, STAGGER.gain.sword * force * STAGGER.gain.blocked * impacts, nowSec, attacker.id);
    }
    return guardResult.kind === 'guardBreak' ? 'guardBreak' : 'block';
  }

  const shove = 1.7 * (1 + MELEE_CONTACT.impactKnockback * physical.impact);
  // (the chop, and every Sundering slam, comes down heavily enough to lift)
  const push = { x: g.direction.x * shove, y: strikeIndex === 2 || sunder ? 0.8 : 0.2, z: g.direction.z * shove };
  // hardened plate turns an ordinary blow toward a glancing one (never the shove); a cancelled Sunder is left alone
  const armour = cancelled ? { quality, strength: 0 } : steelQuality(target.steel, quality, nowSec);
  if (!cancelled) target.steel = steelTakes(target.steel, nowSec);
  const damage = swordDamage({ quality: armour.quality, level });
  applyDamage(room, attacker.id, target.id, damage, 'sword', nowSec, push, {
    steel: armour.strength,
    turned: level === DAMAGE_LEVELS.normal ? swordDamageFor(quality) - damage : 0,
    clean: armour.quality >= CLEAN_CONTACT.sword,
    level,
    ultimate: sunder || Boolean(attacker.attackChivalry) || combatActionPolicy(attacker, nowSec).concurrent,
    rawDamage: sunder ? GAME.swordElevated : GAME.swordGlance + (GAME.swordDamage - GAME.swordGlance) * quality,
    contactFacts: challengeContact(attacker, atSec, { ordinary: !attacker.attackSlam && !sunder,
      chainId: attacker.attackChainId, strikeIndex, steel: cancelled ? steelStrength(target.steel, nowSec) : armour.strength }),
  });
  // (a Sundering blow on the body shakes a balance by its own measure: the heaviest single contact there is)
  staggerBy(room, target, empowered ? ultimateFor('sunder').stagger : STAGGER.gain.sword * force, nowSec, attacker.id);
  // and it ends what they were doing, there and then (whether or not their balance has broken), and leaves them reeling
  if (empowered) cutShort(room, target, attacker, nowSec);
  room.events.push({
    type: 'swordHit', playerId: attacker.id, targetId: target.id, strikeIndex, quality: armour.quality, impact: physical.impact, steel: armour.strength,
    ...(level !== DAMAGE_LEVELS.normal ? { level } : {}), ...(cancelled ? { sunderMet: true } : {}), at: nowSec,
  });
  return 'hit';
}

/**
 * A Sundering blow lands on a knight's body: whatever they were in the middle of ends. A spell gathering is lost, a
 * sword chain stops, a fist thrown never lands, a dash ends where it is, a sprint is broken (its speed gone with it),
 * and an ultimate still being braced into is interrupted as any other (its charge kept, the usual lockout). One
 * already committed is not undone. Then they reel for a moment (the Sunder's `reelSec`: the same "cannot act" as a
 * broken balance, only brief), so that what was cut short is felt to have been; after it they may begin again.
 */
function cutShort(room, target, attacker, nowSec) {
  if (!target.alive) return;
  const what = [];
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
  if (interruptUltimate(room, target, nowSec, attacker.id, 'sunder')) what.push('ultimate');
  const reelUntil = nowSec + ultimateFor('sunder').reelSec;
  target.staggerUntil = Math.max(target.staggerUntil ?? -Infinity, reelUntil);
  room.events.push({ type: 'actionInterrupted', playerId: target.id, by: attacker.id, what, reelUntil: target.staggerUntil, at: nowSec });
}

// how clean a contact must be (as it was felt: after any hardened plate) to count as the cleanest there is, for the
// precise ring that marks it: a sword blow caught dead centre, a spell square on, a gust's heart at point blank
export const CLEAN_CONTACT = Object.freeze({ sword: 0.91, spell: 0.9, gale: 0.85 });

function interruptOrdinaryActions(room, player, nowSec) {
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
  const bracing = ultimateStartup(player, nowSec);
  player.stagger ??= freshStagger();
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
} = {}) {
  const victim = room.players.get(victimId);
  if (!victim || !victim.alive || victim.spawnProtectionUntil > nowSec) return false;
  const healthBefore = victim.health;
  const taken = Math.min(victim.health, amount);
  victim.health = Math.max(0, victim.health - amount);
  victim.lastDamageAt = nowSec;
  victim.lastAttackerId = attackerId;
  prowessForDamage(room, room.players.get(attackerId), victim, taken, { ultimate });
  if (knockback) {
    const scale = staggerShove(victim.stagger);
    shoveBody(victim, { x: knockback.x * scale, y: knockback.y, z: knockback.z * scale });
    victim.lastKnockbackAt = nowSec;
    if (Math.hypot(knockback.x, knockback.y, knockback.z) > 1e-6) {
      victim.lastKnockbackSource = source;
      victim.lastKnockbackBy = attackerId;
    }
  }
  const event = { type: 'damage', attackerId, victimId, source, amount, health: victim.health, push: knockback ?? null, at: nowSec };
  if (steel > 0.005) {
    event.steel = steel;
    event.turned = Math.max(0, Math.round(turned));
  }
  if (clean) event.clean = true;
  if (level !== DAMAGE_LEVELS.normal) event.level = level;
  if (ultimate) event.ultimate = true;
  room.events.push(event);
  recordChallengeFact(room, {
    ...contactFacts, type: 'damage', attackerId, victimId, source, amount: taken, rawDamage,
    healthBefore, healthAfter: victim.health, steel: contactFacts?.steel ?? steel, contact: source !== 'burn', at: nowSec,
  });
  if (victim.health <= 0) killPlayer(room, victimId, attackerId, source, nowSec);
  return true;
}

export function killPlayer(room, victimId, attackerId, source, nowSec) {
  const victim = room.players.get(victimId);
  if (!victim || !victim.alive) return false;
  let credited = attackerId;
  if (!credited && victim.lastAttackerId && nowSec - victim.lastKnockbackAt <= ABYSS_ATTRIBUTION_SEC) credited = victim.lastAttackerId;
  // (for the voice: whether their plate was still hardened as the blow that felled them landed)
  const steeled = steelStrength(victim.steel, nowSec) > 0.005;
  // (and whether they fell spinning, or still dizzy from it)
  const spun = Boolean(vortexing(victim, nowSec)) || dizzy(victim, nowSec);
  recordChallengeFact(room, { type: 'death', victimId, killerId: credited, source, at: nowSec,
    displacementSource: victim.lastKnockbackSource ?? null, displacementBy: victim.lastKnockbackBy ?? null,
    displacementAt: victim.lastKnockbackAt });
  if (victim.ultimateState?.phase === 'startup' && !Number.isFinite(victim.ultimateInterruptionAt)) {
    victim.ultimateInterruptionBy = credited;
    victim.ultimateInterruptionAt = nowSec;
    victim.ultimateInterruptionSource = 'death';
  }
  victim.alive = false;
  victim.health = 0;
  victim.guarding = false;
  victim.steel = null;
  victim.gust = null;
  victim.pendingSpell = null;
  victim.castEndsAt = 0;
  victim.gauntlet = null;
  victim.guardHeld = false;
  victim.dashUntil = Math.min(victim.dashUntil ?? nowSec, nowSec);
  victim.chivalryProjectileReadyAt = 0;
  stopSwordChain(victim, {}, room, nowSec);
  // an ultimate still bracing is interrupted (its charge kept); one active is over
  stepUltimate(room, victim, nowSec);
  victim.respawnAt = nowSec + RESPAWN_SEC;
  const playing = room.state === 'PLAYING';
  if (credited && credited !== victimId) {
    room.recordKill(credited, victimId, nowSec);
    if (source === 'abyss') {
      const killer = room.players.get(credited);
      if (killer) killer.abyssKills += 1;
    }
  } else {
    victim.deaths += 1;
  }
  // (decisive: the fall lost the match, which that kill has just won)
  const decisive = playing && room.state === 'FINISHED' && Boolean(credited) && credited !== victimId && room.winnerId === credited;
  room.events.push({ type: 'death', victimId, killerId: credited, source, ...(decisive ? { decisive: true } : {}), ...(steeled ? { steeled: true } : {}), ...(spun ? { dizzy: true } : {}), respawnAt: victim.respawnAt, at: nowSec });
  return true;
}

function spawnSpell(room, player, nowSec, world) {
  const pending = player.pendingSpell;
  if (!pending) return;
  const spell = spellFor(pending.spell);
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
function releaseGale(room, player, spell, nowSec, world) {
  const ultimate = Boolean(player.pendingSpell?.ultimate);
  player.pendingSpell = null;
  player.castEndsAt = 0;
  player.gust = { ultimate, spell: spell.id, bornAt: nowSec, until: nowSec + (spell.cone.lastsSec ?? 0), caught: [] };
  const { eye, direction } = galeAim(player);
  const affected = blowGale(room, player, nowSec, world);
  const recoil = galeRecoil(spell, eye, direction, world);
  if (recoil) launchBody(player, recoil, recoil.maxUp);
  const origin = galeOrigin(eye, direction);
  room.events.push({ type: 'galeBlast', playerId: player.id, spell: spell.id, origin, direction, affected, recoil, at: nowSec });
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
  const spell = spellFor(gust.spell);
  const strength = galeStrength(spell, nowSec - gust.bornAt);
  const affected = [];
  if (strength <= 0) return affected;
  const { direction, eye } = galeAim(player);
  const origin = galeOrigin(eye, direction);
  const sheltered = (at) => (world.solids ?? []).some((box) => segmentAabbHit([origin.x, origin.y, origin.z], [at.x, at.y, at.z], box));
  for (const target of room.players.values()) {
    if (target.id === player.id || !target.alive || target.spawnProtectionUntil > nowSec) continue;
    const caught = galeOnBody(spell, origin, direction, target.position, postureOf(target).crown);
    const pressure = caught.pressure * strength;
    const blown = galeWindOnBody(spell, origin, direction, target.position, postureOf(target).crown);
    const wind = blown.wind * strength;
    if (pressure <= 0.01 && wind <= 0.01) continue;
    const guarded = target.guarding && isInGuardCone(target, player, nowSec);
    // the wind carries them on for as long as they stand in it (and a fall it carries them into is its doing)
    if (dt > 0 && wind > 0.01 && !sheltered(blown.point)) {
      target.impulse = galeCarry(spell, target.impulse, origin, direction, blown.point, wind, dt, { guarded });
      target.lastAttackerId = player.id;
      target.lastKnockbackAt = nowSec;
      target.lastKnockbackSource = 'gale'; target.lastKnockbackBy = player.id;
    }
    const at = caught.point;
    if (pressure <= 0.01 || sheltered(at) || gust.caught.includes(target.id)) continue;
    gust.caught.push(target.id);
    let shove = galeShove(spell, origin, direction, at, pressure);
    if (guarded) {
      guardChallengeContact(room, target, player, nowSec);
      // it holds its ground behind the guard, and the guard pays for it like a blow (its breath waits again)
      shove = { x: shove.x * spell.cone.guarded, y: shove.y * spell.cone.guarded, z: shove.z * spell.cone.guarded };
      target.guardStamina = Math.max(0, target.guardStamina - spell.cone.guardCost * pressure);
      target.lastGuardDrainAt = nowSec;
      if (target.guardStamina <= 1e-9) {
        target.guarding = false;
        if (combatActionPolicy(target, nowSec).concurrent) interruptOrdinaryActions(room, target, nowSec);
        target.staggerUntil = nowSec + GAME.guardBreakStaggerMs / 1000;
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
    const rawDamage = Math.round(spell.cone.damage * exposure);
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
  // spells in flight through it: each bent once, as it flies in, by as much as the gust would meet it with on its
  // course (galeBend), the bend given over a moment so it curves rather than kinks; whose spell it is does not change
  gust.bent ??= {};
  for (const projectile of room.projectiles.values()) {
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
function explodeSpell(room, projectile, point, nowSec, worldHit = false, directVictimId = null) {
  room.projectiles.delete(projectile.id);
  const spell = spellFor(projectile.spell);
  // fire throws a body back; cold only staggers it a little (and an ember is a small fire)
  const shove = spell.shove ?? (spell.chill ? 0.5 : 1);
  // (an ultimate's own fire earns its thrower no prowess)
  const ultimate = Boolean(projectile.ultimate);
  for (const player of room.players.values()) {
    if (!player.alive || player.id === projectile.ownerId) continue;
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
    if (chill) player.chill = strongerChill(player.chill, chill, nowSec);
  }
  room.events.push({
    type: 'projectileImpact', projectileId: projectile.id, ownerId: projectile.ownerId, spell: spell.id, radius: spell.radius, point, worldHit, at: nowSec,
  });
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
  player.speedScale = chillScale(player.chill, nowSec);
}

function stepProjectiles(room, dt, nowSec, world) {
  for (const projectile of [...room.projectiles.values()]) {
    const before = { ...projectile.position };
    const after = {
      x: before.x + projectile.velocity.x * dt,
      y: before.y + projectile.velocity.y * dt,
      z: before.z + projectile.velocity.z * dt,
    };
    let nearestWorld = null;
    for (const box of world.solids ?? []) {
      const hit = segmentAabbHit([before.x, before.y, before.z], [after.x, after.y, after.z], box);
      if (hit && (!nearestWorld || hit.t < nearestWorld.t)) nearestWorld = hit;
    }
    if (nearestWorld) {
      explodeSpell(room, projectile, { x: nearestWorld.point[0], y: nearestWorld.point[1], z: nearestWorld.point[2] }, nowSec, true);
      continue;
    }
    // a spell thrown at the ground (at someone's feet) bursts where it meets it, instead of sinking through
    const ground = surfaceHeightAt(after.x, after.z, before.y, world);
    if (ground !== null && after.y <= ground && before.y > ground) {
      const t = (before.y - ground) / (before.y - after.y);
      explodeSpell(room, projectile, {
        x: before.x + (after.x - before.x) * t,
        y: ground + 0.05,
        z: before.z + (after.z - before.z) * t,
      }, nowSec, true);
      continue;
    }

    let direct = null;
    for (const target of room.players.values()) {
      if (!target.alive || target.id === projectile.ownerId || target.spawnProtectionUntil > nowSec) continue;
      // (the body as a ball about its middle: a crouched one is smaller, and a spell can fly over it)
      const c = playerCenter(target);
      const d = Math.hypot(c.x - after.x, c.y - after.y, c.z - after.z);
      if (d < Math.min(0.75, postureOf(target).height / 2)) { direct = target; break; }
    }
    if (direct) {
      projectile.position = after;
      explodeSpell(room, projectile, after, nowSec, false, direct.id);
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
export function tryUltimate(room, playerId, nowSec) {
  const player = room.players.get(playerId);
  if (room.state !== 'PLAYING' || !player || !player.alive) return false;
  if (nowSec < player.staggerUntil || nowSec < (player.ultimateLockedUntil ?? -Infinity)) return false;
  if (player.ultimateState) return false;
  // (nor in the moment after a Vortex, while both hands are still its)
  if (nowSec < (player.recoverUntil ?? -Infinity)) return false;
  // a fist in the air, or a spell gathering (Chivalry alone takes a gathering spell into itself), has the hand: the key
  // is kept a moment, and taken as soon as it is free (stepRoom), rather than lost
  if (player.gauntlet || (player.pendingSpell && ultimateFor(player.ultimate).id !== 'chivalry')) {
    const full = (player.prowess ?? 0) >= PROWESS.full || practising(room, player);
    if (full) player.ultimateWantedUntil = nowSec + ULTIMATE_PRESS_KEPT_SEC;
    return false;
  }
  // in the Practice Yard the key readies the ultimate itself: whoever came to practise can call it again as soon as
  // the last has run its course (the yard earns no prowess; a real match's meter is untouched)
  if (practising(room, player)) player.prowess = PROWESS.full;
  if ((player.prowess ?? 0) < PROWESS.full) return false;
  const ultimate = ultimateFor(player.ultimate);
  player.ultimateInterruptionBy = null;
  player.ultimateInterruptionAt = null;
  player.ultimateInterruptionSource = null;
  player.ultimateState = { id: ultimate.id, phase: 'startup', startedAt: nowSec, commitAt: nowSec + ultimate.startupSec, until: null };
  // the brace: sword and guard put up, the knight gathers himself. Whatever the sword was doing is over there and
  // then: the ultimate has the knight from this moment. A button still held is still held (Sunder's first slam is its:
  // it comes as the brace ends, not after the old chain's own recovery); a Vortex takes both hands and keeps no press
  player.ultimateWantedUntil = -Infinity;
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
  room.events.push({ type: 'ultimateStart', playerId, ultimate: ultimate.id, commitAt: player.ultimateState.commitAt, ...(hop ? { hop } : {}), at: nowSec });
  return true;
}

// an ultimate's course, each tick: interrupted before its commit point (charge kept, a short lockout), committed (the
// charge spent), or run out
function stepUltimate(room, player, nowSec) {
  const state = player.ultimateState;
  if (!state) return;
  const ultimate = ultimateFor(state.id);
  if (state.phase === 'startup') {
    if (!player.alive || nowSec < player.staggerUntil) {
      interruptUltimate(room, player, nowSec);
      return;
    }
    if (nowSec + 1e-9 >= state.commitAt) {
      player.prowess = 0;
      state.phase = 'active';
      state.until = state.commitAt + ultimate.activeSec;
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
        setGuard(room, player.id, true, nowSec);
      }
      room.events.push({ type: 'ultimateActive', playerId: player.id, ultimate: ultimate.id, until: state.until, at: nowSec });
    }
    return;
  }
  if (!player.alive || nowSec >= state.until) {
    player.ultimateState = null;
    if (ultimate.id === 'chivalry') {
      player.chivalryProjectileReadyAt = 0;
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
        if (target.id === player.id || !target.alive || nowSec < (hits[target.id] ?? -Infinity) + vortex.contact.everySec - 1e-9) continue;
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
  if (target.guarding && isInGuardCone(target, attacker, nowSec)) {
    guardChallengeContact(room, target, attacker, nowSec);
    const result = resolveSwordVsGuard({
      guarding: true, guardAgeMs: Infinity, stamina: target.guardStamina, profile: guardProfile(target.knightClass), pressure: contact.guardPressure,
    });
    target.guardStamina = result.staminaAfter;
    target.lastGuardDrainAt = nowSec;
    if (result.kind === 'guardBreak') {
      target.guarding = false;
      if (combatActionPolicy(target, nowSec).concurrent) interruptOrdinaryActions(room, target, nowSec);
      target.staggerUntil = nowSec + GAME.guardBreakStaggerMs / 1000;
      room.events.push({ type: 'guardBreak', attackerId: attacker.id, defenderId: target.id, impact: 0, impacts: 1, vortex: true, point, at: nowSec });
      staggerBy(room, target, STAGGER.gain.guardBreak, nowSec, attacker.id);
    } else {
      room.events.push({ type: 'block', attackerId: attacker.id, defenderId: target.id, quality: 1, impact: 0, impacts: 1, vortex: true, point, at: nowSec });
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
function groundStrike(room, player, strikeIndex, met, nowSec, world, { through = null } = {}) {
  const point = { x: met.point.x, y: met.floor.y, z: met.point.z };
  const f = forwardFromYaw(player.yaw);
  const fissures = planRupture(world, point, { x: f.x, z: f.z });
  room.events.push({ type: 'groundStrike', playerId: player.id, strikeIndex, point, ...(through ? { through } : {}), at: nowSec });
  if (!fissures.length) return;
  const rupture = { id: `r${++ruptureCounter}`, ownerId: player.id, origin: point, fissures, bornAt: nowSec, reached: 0, caught: [] };
  (room.ruptures ??= []).push(rupture);
  room.events.push({
    type: 'rupture', id: rupture.id, ownerId: player.id, origin: point, speed: RUPTURE.speed,
    fissures: fissures.map((fissure) => ({ dir: fissure.dir, length: fissure.length })), at: nowSec,
  });
}

// each rupture's fissures run on; whoever stands on the ground they split as they pass is caught, once (and by one
// knight's ruptures no more than once in RUPTURE.recatchSec)
function stepRuptures(room, nowSec) {
  if (!room.ruptures?.length) return;
  const lastCaught = (room.ruptureCaught ??= new Map());
  for (const rupture of [...room.ruptures]) {
    const longest = Math.max(...rupture.fissures.map((fissure) => fissure.length));
    const reached = Math.min(longest, (nowSec - rupture.bornAt) * RUPTURE.speed);
    for (const target of room.players.values()) {
      if (target.id === rupture.ownerId || !target.alive || rupture.caught.includes(target.id) || target.spawnProtectionUntil > nowSec) continue;
      if (!rupture.fissures.some((fissure) => fissureCatches(rupture.origin, fissure, rupture.reached, reached, target.position))) continue;
      rupture.caught.push(target.id);
      const pair = `${rupture.ownerId}>${target.id}`;
      if (nowSec < (lastCaught.get(pair) ?? -Infinity) + RUPTURE.recatchSec) continue;
      lastCaught.set(pair, nowSec);
      applyDamage(room, rupture.ownerId, target.id, RUPTURE.damage, 'rupture', nowSec, { x: 0, y: RUPTURE.jolt, z: 0 }, { ultimate: true });
      staggerBy(room, target, RUPTURE.stagger, nowSec, rupture.ownerId);
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
      && room.ruptures?.some((rupture) => rupture.ownerId !== player.id && onTornGround(rupture, player.position, rupture.reached)));
  }
}

function respawnPlayer(room, player, nowSec, world) {
  const enemies = [...room.players.values()].filter((p) => p.id !== player.id && p.alive);
  const spawnPoints = world?.spawnPoints ?? room.world?.spawnPoints ?? [];
  if (spawnPoints.length === 0) throw new Error(`World ${room.worldId ?? 'unknown'} has no spawn points`);
  const choice = chooseSpawn(spawnPoints, enemies, room.recentSpawnUse, nowSec);
  const spawn = choice?.spawn ?? spawnPoints[0];
  if (choice) room.recentSpawnUse.set(choice.index, nowSec);
  resetAtSpawn(player, spawn, nowSec, room);
  room.events.push({ type: 'respawn', playerId: player.id, position: { ...player.position }, at: nowSec });
}

export function stepRoom(room, dt, nowSec, world = room.world) {
  if (!world) throw new Error(`Room ${room.code ?? 'unknown'} has no world`);
  room.tick(nowSec);
  if (room.state !== 'PLAYING') return room.events;

  markTornGround(room);
  for (const player of room.players.values()) {
    if (!player.alive) {
      if (nowSec >= player.respawnAt && room.state === 'PLAYING') respawnPlayer(room, player, nowSec, world);
      continue;
    }
    // the ultimate's key, kept while the hand was busy: taken now if it is free
    if (nowSec < (player.ultimateWantedUntil ?? -Infinity) && !player.pendingSpell && !player.gauntlet) tryUltimate(room, player.id, nowSec);

    if (player.pendingSpell && spellFor(player.pendingSpell.spell).kind === 'cone' && nowSec >= player.castEndsAt) spawnSpell(room, player, nowSec, world);
    // a gust still blowing catches whoever it reaches now
    if (player.gust) {
      if (nowSec > player.gust.until) player.gust = null;
      else if (nowSec > player.gust.bornAt) {
        const affected = blowGale(room, player, nowSec, world, dt);
        if (affected.length) room.events.push({ type: 'galeCatch', playerId: player.id, spell: player.gust.spell, affected, at: nowSec });
      }
    }
    stepAfflictions(room, player, nowSec);
    if (!player.alive) continue;

    const guardCapacity = guardProfile(player.knightClass).capacity;
    if (nowSec - player.lastGuardDrainAt >= GUARD_REGEN_DELAY_SEC && player.guardStamina < guardCapacity) {
      const rate = GUARD_REGEN_PER_SEC * (player.guarding ? GUARD_REGEN_GUARDING : 1);
      player.guardStamina = Math.min(guardCapacity, player.guardStamina + rate * dt);
    }
    // balance comes back once nothing has shaken it for a moment; an ultimate braces, commits and runs its course
    drainStagger(player.stagger, dt, nowSec);
    stepUltimate(room, player, nowSec);
    if (nowSec - player.lastDamageAt >= HEALTH_REGEN_DELAY_SEC && player.health < GAME.maxHealth) {
      player.health = Math.min(GAME.maxHealth, player.health + HEALTH_REGEN_PER_SEC * dt);
    }

    const staggered = nowSec < player.staggerUntil;
    // sprint: its own state, decided from the real stamina; it spends the guard's bar slowly and holds off regen
    player.sprinting = resolveSprint({
      wantsSprint: Boolean(player.input?.sprint),
      forward: player.input?.forward,
      right: player.input?.right,
      grounded: player.grounded,
      stamina: player.guardStamina,
      sprinting: player.sprinting,
      blocked: combatBlocksSprint(player, nowSec) || Boolean(player.tornGround),
      crouched: Boolean(player.crouched),
    });
    // (torn ground breaks a sprint outright: the speed it had built goes with it)
    if (player.tornGround) player.sprintBlend = 0;
    if (player.sprinting) {
      player.guardStamina = Math.max(0, player.guardStamina - SPRINT.staminaPerSec * dt);
      player.lastGuardDrainAt = nowSec;
    }

    // (bracing into an ultimate, a knight moves only a little: the startup is exposed)
    // (spinning in a Vortex, they move at its pace and fall slowly, as they have steered it: no sprint, no crouch)
    steerVortex(player, dt, nowSec);
    const bracing = ultimateStartup(player, nowSec);
    const whirl = ultimateWhirl(player, nowSec);
    const input = staggered
      ? { forward: 0, right: 0, jump: false, crouch: Boolean(player.input?.crouch), yaw: player.yaw, pitch: player.pitch }
      : bracing
        ? { ...player.input, forward: (player.input?.forward ?? 0) * bracing.startupMove, right: (player.input?.right ?? 0) * bracing.startupMove, jump: false, sprint: false }
        : whirl
          ? { ...player.input, sprint: false, crouch: false }
          : player.input;
    player.whirl = whirl;
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
    recordTransform(player, nowSec);

    // A gathered projectile leaves the current hand along the latest authoritative aim. Once released its
    // velocity belongs to the projectile; turning or moving the caster never steers it.
    if (player.pendingSpell && spellFor(player.pendingSpell.spell).kind !== 'cone' && nowSec >= player.castEndsAt) spawnSpell(room, player, nowSec, world);

    if (player.position.y < (world.abyssY ?? -9)) {
      killPlayer(room, player.id, null, 'abyss', nowSec);
      continue;
    }

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
        stopSwordChain(player, { keepSweep: true }, room, nowSec);
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
  }

  stepRuptures(room, nowSec);
  // bodies do not share space: overlapping Spellblades are eased apart (never off a ledge or into a wall)
  separatePlayers([...room.players.values()], world);
  stepProjectiles(room, dt, nowSec, world);
  room.tickNumber += 1;
  return room.events;
}
