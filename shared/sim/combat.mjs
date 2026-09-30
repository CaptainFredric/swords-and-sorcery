import {
  DAMAGE_LEVELS, GAME, MAX_FORCE, MELEE_CONTACT, SWORD_CHAIN, SWORD_STRIKE_TIMES, closingImpact, guardProfile, nextChainStep,
  resolveSwordVsGuard, swordDamage, swordDamageFor, swordForce,
} from '../src/combat.mjs';
import { STAGGER, addStagger, drainStagger, freshStagger, staggerShove } from '../src/stagger.mjs';
import { PROWESS, gainProwess, prowessForDamage } from '../src/prowess.mjs';
import { activeUltimate, sundering, ultimateFor, ultimateStartup } from '../src/ultimates.mjs';
import { RUPTURE, fissureCatches, planRupture } from '../src/rupture.mjs';
import { recastReady, recordUse } from '../src/practiceRecast.mjs';
import { GAME_MODES } from '../src/modes.mjs';
import { blastDamage, blastDistance, burnFrom, chillFrom, chillScale, spellExposure, spellFor, strongerChill } from '../src/spells.mjs';
import { callSteel, steelBlunt, steelExposure, steelQuality, steelStrength, steelTakes } from '../src/steel.mjs';
import { galeOnBody, galeRecoil, galeShove } from '../src/gale.mjs';
import { GAUNTLET, gauntletGeometry, gauntletTarget, withinGauntlet } from '../src/gauntlet.mjs';
import { postureOf } from '../src/body.mjs';
import { segmentAabbHit, surfaceHeightAt } from '../src/collision.mjs';
import { aimFrame, aimQuality, bladeDirection, offAimDegrees, sweepBlade } from '../src/blade.mjs';
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
const HEALTH_REGEN_DELAY_SEC = 5;
const HEALTH_REGEN_PER_SEC = 20;
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

function resetAtSpawn(player, spawn, nowSec) {
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
  player.sprinting = false;
  player.sprintBlend = 0;
  player.guardStartedAt = -Infinity;
  player.lastGuardDrainAt = -Infinity;
  stopSwordChain(player);
  player.attackStartedAt = -Infinity;
  player.attackRestartAt = -Infinity;
  player.staggerUntil = -Infinity;
  player.spellReadyAt = Math.max(player.spellReadyAt ?? 0, nowSec);
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
  player.attackStartedAt = nowSec;
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
function stopSwordChain(player, { keepSweep = false, letGo = false } = {}) {
  const due = nextStrikeDue(player);
  if (due > (player.attackRestartAt ?? -Infinity)) player.attackRestartAt = due;
  player.attackLastChain = letGo && player.attackActive && (player.attackCommitted ?? 0) < SWORD_STRIKE_TIMES.length
    ? { startedAt: player.attackStartedAt, committed: player.attackCommitted, landed: player.attackNextStrike, endedAt: due }
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
  player.guarding = false;
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
    stopSwordChain(player);
    if (was) room.events.push({ type: 'attackEnded', playerId, at: nowSec });
    return;
  }
  const committed = player.attackCommitted ?? 0;
  const began = player.attackStartedAt + (SWORD_CHAIN.starts[committed - 1] ?? Infinity);
  if (player.attackActive && committed > 1 && player.attackCommitBy === 'held' && player.attackNextStrike < committed && releasedAt < began - 1e-9) {
    player.attackCommitted = committed - 1;
    // the swing before it has landed, so the chain is over (where the next would have begun)
    if (player.attackNextStrike >= player.attackCommitted) {
      stopSwordChain(player, { letGo: true });
      room.events.push({ type: 'attackEnded', playerId, at: nowSec });
    }
  }
}

/** Stop a sword chain outright: nothing further lands (a practice dummy told to stop, for one). */
export function cancelAttack(room, playerId, nowSec) {
  const player = room.players.get(playerId);
  if (!player) return;
  const was = player.attackActive;
  stopSwordChain(player);
  if (was) room.events.push({ type: 'attackEnded', playerId, at: nowSec });
}

export function setGuard(room, playerId, guarding, nowSec) {
  const player = room.players.get(playerId);
  if (!player || !player.alive) return false;
  if (guarding && room.state !== 'PLAYING') return false;
  if (guarding && (player.guardStamina <= 0 || nowSec < player.staggerUntil || ultimateStartup(player, nowSec))) return false;
  player.guarding = Boolean(guarding);
  if (guarding) {
    player.guardStartedAt = nowSec;
    stopSwordChain(player);
  }
  room.events.push({ type: guarding ? 'guardStarted' : 'guardEnded', playerId, at: nowSec });
  return true;
}

// the Practice Yard lets abilities be used again after a moment, their real cooldowns still shown (practiceRecast.mjs)
function inPractice(room) {
  return room.mode === GAME_MODES.PRACTICE;
}

export function tryDash(room, playerId, direction, nowSec) {
  const player = room.players.get(playerId);
  if (room.state !== 'PLAYING' || !player || !player.alive || nowSec < player.staggerUntil || ultimateStartup(player, nowSec)) return false;
  const practice = inPractice(room);
  if (!recastReady(player, 'dash', nowSec, practice)) return false;
  // (the dash itself as ever; its real cooldown as the yard's rule has it)
  const running = player.dashReadyAt;
  player.dashReadyAt = -Infinity;
  const ok = tryStartDash(player, direction, nowSec);
  player.dashReadyAt = running;
  if (!ok) return false;
  recordUse(player, 'dash', nowSec, MOVEMENT.dashCooldown, practice);
  room.events.push({ type: 'dash', playerId, direction, at: nowSec });
  return true;
}

/**
 * Gather the Spellblade's spell in the palm; it flies when the gather ends (see stepRoom). A ward carried in the
 * spell's place is called at once instead (sheatheInSteel).
 */
export function tryCastSpell(room, playerId, direction, nowSec) {
  const player = room.players.get(playerId);
  if (room.state !== 'PLAYING' || !player || !player.alive || nowSec < player.staggerUntil) return false;
  if (!recastReady(player, 'spell', nowSec, inPractice(room)) || ultimateStartup(player, nowSec)) return false;
  const spell = spellFor(player.spell);
  if (spell.kind === 'ward') return sheatheInSteel(room, player, spell, nowSec);
  // (in the yard a spell can come back before the last has left the palm: one at a time; its gate opens as it goes)
  if (inPractice(room) && player.pendingSpell) return false;
  recordUse(player, 'spell', nowSec, spell.cooldownSec, inPractice(room), { readyAt: nowSec + spell.gatherSec });
  player.castEndsAt = nowSec + spell.gatherSec;
  player.pendingSpell = { spell: spell.id, direction: normalize3(direction) };
  player.guarding = false;
  stopSwordChain(player);
  player.spawnProtectionUntil = Math.min(player.spawnProtectionUntil, nowSec);
  room.events.push({ type: 'spellCast', playerId, spell: spell.id, at: nowSec, castEndsAt: player.castEndsAt });
  return true;
}

// Sheathe in Steel: the magic hand clenches and the armour hardens at once (shared/src/steel.mjs). It needs that hand
// free (not gathering a spell); it does not stop a sword or drop a guard.
function sheatheInSteel(room, player, spell, nowSec) {
  if (player.pendingSpell) return false;
  player.steel = callSteel(nowSec);
  recordUse(player, 'spell', nowSec, spell.cooldownSec, inPractice(room));
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
  if (recastReady(player, 'spell', nowSec, inPractice(room))) return tryCastSpell(room, playerId, direction, nowSec);
  // (in the yard the key is the spell's: it comes back after a moment; the gauntlet keeps its own key)
  if (inPractice(room)) return false;
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
  if (nowSec < player.staggerUntil || player.pendingSpell || player.gauntlet || ultimateStartup(player, nowSec)) return false;
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
    stopSwordChain(player);
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
    steel: armour.strength, turned: GAUNTLET.damage - armour.amount,
  });
  staggerBy(room, target, STAGGER.gain.gauntlet, nowSec);
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
  stopSwordChain(attacker);
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
// A strike is live for a short stretch around its contact (MELEE_CONTACT.window): its blade (shared/src/blade.mjs)
// sweeps through the strike's arc in the attacker's view, and the first thing it passes through takes it: a knight
// takes the blow; anything solid stops the blade (it rings off, and the knight recoils), and nothing beyond it is
// touched. How cleanly a knight is caught is how far off the attacker's aim they were; how hard the two were closing
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

// where a strike's live stretch lies (absolute seconds)
function strikeWindow(player, strike) {
  const contact = player.attackStartedAt + SWORD_STRIKE_TIMES[strike];
  return { contact, from: contact - MELEE_CONTACT.window.early, to: contact + MELEE_CONTACT.window.late };
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

/** Begin a strike's live stretch (its swing is heard from here). */
function openStrike(room, player, strike, nowSec) {
  player.attackOpened = strike;
  const window = strikeWindow(player, strike);
  player.attackSweep = { strike, sampledTo: window.from, direction: null };
  room.events.push({ type: 'swordSwing', playerId: player.id, strikeIndex: strike, at: nowSec });
}

/** Carry a live strike's sweep on to `nowSec`: it meets a body, meets something solid, or runs out (a miss). */
function sweepStrike(room, player, nowSec, world) {
  const live = player.attackSweep;
  if (!live) return;
  const window = strikeWindow(player, live.strike);
  const until = Math.min(nowSec, window.to);
  const solids = world.solids ?? [];
  while (player.attackSweep === live && live.sampledTo < until - 1e-9) {
    const at = Math.min(until, nextSample(window, live.sampledTo));
    const { eye, frame } = bladeOrigin(transformFor(player, at));
    // (the blade is carried round with the knight as they turn: where it was is where it was in their hands)
    const from = live.direction ?? bladeDirection(live.strike, live.sampledTo - window.contact, frame);
    const to = bladeDirection(live.strike, at - window.contact, frame);
    const bodies = [];
    for (const target of room.players.values()) {
      if (target.id === player.id || !target.alive) continue;
      const placed = transformFor(target, at);
      bodies.push({ id: target.id, base: placed.position, top: postureOf(placed).crown });
    }
    // (Sundering, the ground is struck too: a blade driven into it ruptures it)
    const ground = sundering(player, at) ? world.floors ?? null : null;
    const met = sweepBlade(eye, from, to, bodies, solids, { aim: frame.forward, ground });
    live.sampledTo = at;
    live.direction = to;
    if (met?.kind === 'body') {
      player.attackSweep = null;
      landStrike(room, player, live.strike, room.players.get(met.id), at, nowSec);
      return;
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
      groundStrike(room, player, live.strike, met, nowSec, world);
      return;
    }
  }
  if (player.attackSweep === live && live.sampledTo >= window.to - 1e-9) {
    player.attackSweep = null;
    room.events.push({ type: 'swordMiss', playerId: player.id, strikeIndex: live.strike, at: nowSec });
  }
}

/** The blow lands on `target`: parried, blocked or a hit, as cleanly and as hard as it was met. */
function landStrike(room, attacker, strikeIndex, target, atSec, nowSec) {
  if (target.spawnProtectionUntil > nowSec) {
    room.events.push({ type: 'swordProtected', playerId: attacker.id, targetId: target.id, strikeIndex, at: nowSec });
    return;
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
      attacker.staggerUntil = nowSec + GAME.parryStaggerMs / 1000;
      stopSwordChain(attacker);
      gainProwess(room, target, PROWESS.parry);
      room.events.push({ type: 'parry', attackerId: attacker.id, defenderId: target.id, at: nowSec });
      staggerBy(room, attacker, STAGGER.gain.parried, nowSec);
      return;
    }
    target.lastGuardDrainAt = nowSec;
    if (guardResult.kind === 'guardBreak') {
      target.guarding = false;
      target.staggerUntil = nowSec + (GAME.guardBreakStaggerMs / 1000) * (1 + MELEE_CONTACT.impactBreakStagger * physical.impact);
      gainProwess(room, attacker, PROWESS.guardBreak);
      room.events.push({ type: 'guardBreak', attackerId: attacker.id, defenderId: target.id, impact: physical.impact, impacts, at: nowSec });
      staggerBy(room, target, STAGGER.gain.guardBreak, nowSec);
    } else {
      room.events.push({ type: 'block', attackerId: attacker.id, defenderId: target.id, quality, impact: physical.impact, impacts, at: nowSec });
      staggerBy(room, target, STAGGER.gain.sword * force * STAGGER.gain.blocked * impacts, nowSec);
    }
    return;
  }

  const shove = 1.7 * (1 + MELEE_CONTACT.impactKnockback * physical.impact);
  const push = { x: g.direction.x * shove, y: strikeIndex === 2 ? 0.8 : 0.2, z: g.direction.z * shove };
  // hardened plate turns an ordinary blow toward a glancing one (never the shove); a cancelled Sunder is left alone
  const armour = cancelled ? { quality, strength: 0 } : steelQuality(target.steel, quality, nowSec);
  if (!cancelled) target.steel = steelTakes(target.steel, nowSec);
  const damage = swordDamage({ quality: armour.quality, level });
  applyDamage(room, attacker.id, target.id, damage, 'sword', nowSec, push, {
    steel: armour.strength,
    turned: level === DAMAGE_LEVELS.normal ? swordDamageFor(quality) - damage : 0,
    clean: armour.quality >= CLEAN_CONTACT.sword,
    level,
    ultimate: sunder,
  });
  staggerBy(room, target, STAGGER.gain.sword * force, nowSec);
  room.events.push({
    type: 'swordHit', playerId: attacker.id, targetId: target.id, strikeIndex, quality: armour.quality, impact: physical.impact, steel: armour.strength,
    ...(level !== DAMAGE_LEVELS.normal ? { level } : {}), ...(cancelled ? { sunderMet: true } : {}), at: nowSec,
  });
}

// how clean a contact must be (as it was felt: after any hardened plate) to count as the cleanest there is, for the
// precise ring that marks it: a sword blow caught dead centre, a spell square on, a gust's heart at point blank
export const CLEAN_CONTACT = Object.freeze({ sword: 0.91, spell: 0.9, gale: 0.85 });

/**
 * Shake a knight's balance by `amount` (shared/src/stagger.mjs); more while they brace into an ultimate. When it
 * breaks, they are staggered: the sword stops, the guard drops, a gathering spell is lost, a bracing ultimate is
 * interrupted (stepRoom), for about a second.
 */
export function staggerBy(room, player, amount, nowSec) {
  if (!player?.alive || !(amount > 0)) return false;
  const bracing = ultimateStartup(player, nowSec);
  player.stagger ??= freshStagger();
  if (!addStagger(player.stagger, amount * (bracing ? bracing.startupStagger : 1), nowSec)) return false;
  player.staggerUntil = Math.max(player.staggerUntil ?? -Infinity, nowSec + STAGGER.breakSec);
  player.guarding = false;
  player.pendingSpell = null;
  stopSwordChain(player);
  room.events.push({ type: 'staggerBreak', playerId: player.id, until: player.staggerUntil, at: nowSec });
  return true;
}

/**
 * `steel`: how strong the victim's hardened plate was as the blow met it (0: none), for the clang it makes; `turned`:
 * the damage the plate took off the blow, for its owner to see; `clean`: the contact was the cleanest there is;
 * `level`: the level it was struck at (DAMAGE_LEVELS); `ultimate`: an active ultimate's own damage (it earns no
 * prowess). Health taken earns prowess for both (prowess.mjs); a shove carries further on an unsteady knight.
 */
export function applyDamage(room, attackerId, victimId, amount, source, nowSec, knockback = null, {
  steel = 0, turned = 0, clean = false, level = DAMAGE_LEVELS.normal, ultimate = false,
} = {}) {
  const victim = room.players.get(victimId);
  if (!victim || !victim.alive || victim.spawnProtectionUntil > nowSec) return false;
  const taken = Math.min(victim.health, amount);
  victim.health = Math.max(0, victim.health - amount);
  victim.lastDamageAt = nowSec;
  victim.lastAttackerId = attackerId;
  prowessForDamage(room, room.players.get(attackerId), victim, taken, { ultimate });
  if (knockback) {
    const scale = staggerShove(victim.stagger);
    shoveBody(victim, { x: knockback.x * scale, y: knockback.y, z: knockback.z * scale });
    victim.lastKnockbackAt = nowSec;
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
  if (victim.health <= 0) killPlayer(room, victimId, attackerId, source, nowSec);
  return true;
}

export function killPlayer(room, victimId, attackerId, source, nowSec) {
  const victim = room.players.get(victimId);
  if (!victim || !victim.alive) return false;
  let credited = attackerId;
  if (!credited && victim.lastAttackerId && nowSec - victim.lastKnockbackAt <= ABYSS_ATTRIBUTION_SEC) credited = victim.lastAttackerId;
  victim.alive = false;
  victim.health = 0;
  victim.guarding = false;
  victim.steel = null;
  victim.gust = null;
  stopSwordChain(victim);
  // an ultimate still bracing is interrupted (its charge kept); one active is over
  stepUltimate(room, victim, nowSec);
  victim.respawnAt = nowSec + RESPAWN_SEC;
  if (credited && credited !== victimId) {
    room.recordKill(credited, victimId, nowSec);
    if (source === 'abyss') {
      const killer = room.players.get(credited);
      if (killer) killer.abyssKills += 1;
    }
  } else {
    victim.deaths += 1;
  }
  room.events.push({ type: 'death', victimId, killerId: credited, source, respawnAt: victim.respawnAt, at: nowSec });
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
  const direction = pending.direction;
  const id = `f${++projectileCounter}`;
  const f = forwardFromYaw(player.yaw);
  const horizontalFallback = { x: f.x, y: 0, z: f.z };
  const dir = Math.hypot(direction.x, direction.y, direction.z) > 0.01 ? direction : horizontalFallback;
  const normalized = normalize3(dir);
  const projectile = {
    id,
    ownerId: player.id,
    spell: spell.id,
    // (from the casting hand, a little below the eyes)
    position: { x: player.position.x + normalized.x * 0.7, y: player.position.y + postureOf(player).eye - 0.1, z: player.position.z + normalized.z * 0.7 },
    velocity: { x: normalized.x * spell.speed, y: normalized.y * spell.speed, z: normalized.z * spell.speed },
    bornAt: nowSec,
  };
  room.projectiles.set(id, projectile);
  player.pendingSpell = null;
  player.castEndsAt = 0;
  room.events.push({ type: 'projectileSpawned', projectile: structuredClone(projectile), at: nowSec });
}

// Gale Garner lets go, where its caster is aiming as it goes (the breath is drawn first; the gust leaves the hand
// where the hand then points). The gust blows for a moment (cone.lastsSec), from the caster's hand along their aim,
// following both, fading as it goes: every body it reaches in that moment is caught once, as hard as the gust still
// is. Caught, a body is shoved (its heart also stings a little); a raised guard facing it keeps most of its footing but
// pays for it like a blow; hardened steel turns the sting, not the shove; walls stop it. Driven into the ground close
// by, the gust throws its caster back off it (once, as it leaves the hand).
function releaseGale(room, player, spell, nowSec, world) {
  player.pendingSpell = null;
  player.castEndsAt = 0;
  player.gust = { spell: spell.id, bornAt: nowSec, until: nowSec + (spell.cone.lastsSec ?? 0), caught: [] };
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

/** How hard a gust still blows `age` seconds after it left the hand (1 at first, fading to its tail). */
export function galeStrength(spell, age) {
  const lasts = spell.cone.lastsSec ?? 0;
  if (!(lasts > 0)) return age <= 0 ? 1 : 0;
  if (age > lasts) return 0;
  return 1 - (1 - (spell.cone.tail ?? 1)) * Math.max(0, age) / lasts;
}

// the gust blows on: every body it reaches now that it has not caught yet (as hard as it still blows); the bodies it
// caught, for the event
function blowGale(room, player, nowSec, world) {
  const gust = player.gust;
  const spell = spellFor(gust.spell);
  const strength = galeStrength(spell, nowSec - gust.bornAt);
  const affected = [];
  if (strength <= 0) return affected;
  const { direction, eye } = galeAim(player);
  const origin = galeOrigin(eye, direction);
  for (const target of room.players.values()) {
    if (target.id === player.id || !target.alive || target.spawnProtectionUntil > nowSec || gust.caught.includes(target.id)) continue;
    const caught = galeOnBody(spell, origin, direction, target.position, postureOf(target).crown);
    const pressure = caught.pressure * strength;
    if (pressure <= 0.01) continue;
    const at = caught.point;
    let walled = false;
    for (const box of world.solids ?? []) {
      if (segmentAabbHit([origin.x, origin.y, origin.z], [at.x, at.y, at.z], box)) { walled = true; break; }
    }
    if (walled) continue;
    gust.caught.push(target.id);
    let shove = galeShove(spell, origin, direction, at, pressure);
    const guarded = target.guarding && isInGuardCone(target, player, nowSec);
    if (guarded) {
      // it holds its ground behind the guard, and the guard pays for it like a blow (its breath waits again)
      shove = { x: shove.x * spell.cone.guarded, y: shove.y * spell.cone.guarded, z: shove.z * spell.cone.guarded };
      target.guardStamina = Math.max(0, target.guardStamina - spell.cone.guardCost * pressure);
      target.lastGuardDrainAt = nowSec;
      if (target.guardStamina <= 1e-9) {
        target.guarding = false;
        target.staggerUntil = nowSec + GAME.guardBreakStaggerMs / 1000;
        room.events.push({ type: 'guardBreak', attackerId: player.id, defenderId: target.id, at: nowSec });
        gainProwess(room, player, PROWESS.guardBreak);
        staggerBy(room, target, STAGGER.gain.guardBreak, nowSec);
      }
    }
    // the gust takes their balance with it (less so behind a guard), and one caught in its heart is thrown well off
    // their feet
    staggerBy(room, target, STAGGER.gain.gale * pressure * (guarded ? STAGGER.gain.blocked : 1), nowSec);
    if (!guarded && pressure >= 0.5) gainProwess(room, player, PROWESS.displaced);
    // its heart stings a little (steel turns that aside, never the shove)
    const exposure = guarded ? 0 : caught.exposure * strength;
    const armour = steelExposure(target.steel, exposure, nowSec);
    if (armour.turned > 0.1) target.steel = steelTakes(target.steel, nowSec);
    const damage = Math.round(spell.cone.damage * armour.exposure);
    if (damage >= 1) {
      const turned = Math.round(spell.cone.damage * exposure) - damage;
      applyDamage(room, player.id, target.id, damage, spell.id, nowSec, shove, {
        steel: armour.strength, turned, clean: armour.exposure >= CLEAN_CONTACT.gale,
      });
    } else {
      shoveBody(target, shove);
      target.lastAttackerId = player.id;
      target.lastKnockbackAt = nowSec;
    }
    affected.push({ id: target.id, pressure, guarded, shove });
  }
  return affected;
}

// the blast: damage by distance, a shove away from its heart, then what the spell leaves behind (a burn, a chill)
function explodeSpell(room, projectile, point, nowSec, worldHit = false, directVictimId = null) {
  room.projectiles.delete(projectile.id);
  const spell = spellFor(projectile.spell);
  // fire throws a body back; cold only staggers it a little
  const shove = spell.chill ? 0.5 : 1;
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
    }, { steel: armour.strength, turned: blastDamage(spell, bare) - amount, clean: exposure >= CLEAN_CONTACT.spell });
    if (!hit || !player.alive) continue;
    staggerBy(room, player, STAGGER.gain.blast * exposure * shove, nowSec);
    if (exposure >= 0.8 && shove >= 1) gainProwess(room, room.players.get(projectile.ownerId), PROWESS.displaced);
    // a fresh burn replaces one already licking (it never stacks); a blast too far out to catch leaves any burn be
    const burn = burnFrom(spell, exposure, projectile.ownerId, nowSec);
    if (burn) player.burn = burn;
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
    applyDamage(room, burn.attackerId, player.id, burn.perLick, 'burn', nowSec);
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
  if (player.ultimateState || player.pendingSpell || player.gauntlet) return false;
  if ((player.prowess ?? 0) < PROWESS.full) return false;
  const ultimate = ultimateFor(player.ultimate);
  player.ultimateState = { id: ultimate.id, phase: 'startup', startedAt: nowSec, commitAt: nowSec + ultimate.startupSec, until: null };
  // the brace: sword and guard put up, the knight gathers himself
  player.guarding = false;
  stopSwordChain(player);
  player.spawnProtectionUntil = Math.min(player.spawnProtectionUntil, nowSec);
  room.events.push({ type: 'ultimateStart', playerId, ultimate: ultimate.id, commitAt: player.ultimateState.commitAt, at: nowSec });
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
      player.ultimateState = null;
      player.ultimateLockedUntil = nowSec + ultimate.lockoutSec;
      room.events.push({ type: 'ultimateInterrupted', playerId: player.id, ultimate: ultimate.id, lockedUntil: player.ultimateLockedUntil, at: nowSec });
      return;
    }
    if (nowSec + 1e-9 >= state.commitAt) {
      player.prowess = 0;
      state.phase = 'active';
      state.until = state.commitAt + ultimate.activeSec;
      room.events.push({ type: 'ultimateActive', playerId: player.id, ultimate: ultimate.id, until: state.until, at: nowSec });
    }
    return;
  }
  if (!player.alive || nowSec >= state.until) {
    player.ultimateState = null;
    room.events.push({ type: 'ultimateEnded', playerId: player.id, ultimate: ultimate.id, at: nowSec });
  }
}

// a Sundering blade driven into the ground: it ruptures (shared/src/rupture.mjs), splitting outward the way the blow
// was going; the strike ends there (no recoil: the ground took it)
let ruptureCounter = 0;
function groundStrike(room, player, strikeIndex, met, nowSec, world) {
  const point = { x: met.point.x, y: met.floor.y, z: met.point.z };
  const f = forwardFromYaw(player.yaw);
  const fissures = planRupture(world, point, { x: f.x, z: f.z });
  room.events.push({ type: 'groundStrike', playerId: player.id, strikeIndex, point, at: nowSec });
  if (!fissures.length) return;
  const rupture = { id: `r${++ruptureCounter}`, ownerId: player.id, origin: point, fissures, bornAt: nowSec, reached: 0, caught: [] };
  (room.ruptures ??= []).push(rupture);
  room.events.push({
    type: 'rupture', id: rupture.id, ownerId: player.id, origin: point, speed: RUPTURE.speed,
    fissures: fissures.map((fissure) => ({ dir: fissure.dir, length: fissure.length })), at: nowSec,
  });
}

// each rupture's fissures run on; whoever stands on the ground they split as they pass is caught, once
function stepRuptures(room, nowSec) {
  if (!room.ruptures?.length) return;
  for (const rupture of [...room.ruptures]) {
    const longest = Math.max(...rupture.fissures.map((fissure) => fissure.length));
    const reached = Math.min(longest, (nowSec - rupture.bornAt) * RUPTURE.speed);
    for (const target of room.players.values()) {
      if (target.id === rupture.ownerId || !target.alive || rupture.caught.includes(target.id) || target.spawnProtectionUntil > nowSec) continue;
      if (!rupture.fissures.some((fissure) => fissureCatches(rupture.origin, fissure, rupture.reached, reached, target.position))) continue;
      rupture.caught.push(target.id);
      applyDamage(room, rupture.ownerId, target.id, RUPTURE.damage, 'rupture', nowSec, { x: 0, y: RUPTURE.jolt, z: 0 }, { ultimate: true });
      staggerBy(room, target, RUPTURE.stagger, nowSec);
    }
    rupture.reached = reached;
    if (reached >= longest - 1e-9) room.ruptures.splice(room.ruptures.indexOf(rupture), 1);
  }
}

function respawnPlayer(room, player, nowSec, world) {
  const enemies = [...room.players.values()].filter((p) => p.id !== player.id && p.alive);
  const spawnPoints = world?.spawnPoints ?? room.world?.spawnPoints ?? [];
  if (spawnPoints.length === 0) throw new Error(`World ${room.worldId ?? 'unknown'} has no spawn points`);
  const choice = chooseSpawn(spawnPoints, enemies, room.recentSpawnUse, nowSec);
  const spawn = choice?.spawn ?? spawnPoints[0];
  if (choice) room.recentSpawnUse.set(choice.index, nowSec);
  resetAtSpawn(player, spawn, nowSec);
  room.events.push({ type: 'respawn', playerId: player.id, position: { ...player.position }, at: nowSec });
}

export function stepRoom(room, dt, nowSec, world = room.world) {
  if (!world) throw new Error(`Room ${room.code ?? 'unknown'} has no world`);
  room.tick(nowSec);
  if (room.state !== 'PLAYING') return room.events;

  for (const player of room.players.values()) {
    if (!player.alive) {
      if (nowSec >= player.respawnAt && room.state === 'PLAYING') respawnPlayer(room, player, nowSec, world);
      continue;
    }

    if (player.pendingSpell && nowSec >= player.castEndsAt) spawnSpell(room, player, nowSec, world);
    // a gust still blowing catches whoever it reaches now
    if (player.gust) {
      if (nowSec > player.gust.until) player.gust = null;
      else if (nowSec > player.gust.bornAt) {
        const affected = blowGale(room, player, nowSec, world);
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
      blocked: staggered || player.guarding || player.attackActive || Boolean(player.pendingSpell),
      crouched: Boolean(player.crouched),
    });
    if (player.sprinting) {
      player.guardStamina = Math.max(0, player.guardStamina - SPRINT.staminaPerSec * dt);
      player.lastGuardDrainAt = nowSec;
    }

    // (bracing into an ultimate, a knight moves only a little: the startup is exposed)
    const bracing = ultimateStartup(player, nowSec);
    const input = staggered
      ? { forward: 0, right: 0, jump: false, crouch: Boolean(player.input?.crouch), yaw: player.yaw, pitch: player.pitch }
      : bracing
        ? { ...player.input, forward: (player.input?.forward ?? 0) * bracing.startupMove, right: (player.input?.right ?? 0) * bracing.startupMove, jump: false, sprint: false }
        : player.input;
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
          stopSwordChain(player, { letGo: true });
          room.events.push({ type: 'attackEnded', playerId: player.id, at: nowSec });
        }
      }
      if (player.attackActive && player.attackNextStrike >= SWORD_STRIKE_TIMES.length) {
        // the whole chain is done: a held (or pressed again) button starts the next one a beat later
        const again = player.attackHeld || player.attackQueued;
        const held = player.attackHeld;
        // (its restart is the chain's own: SWORD_CHAIN.restart after the third contact, not after this tick)
        stopSwordChain(player, { keepSweep: true });
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
  }

  stepRuptures(room, nowSec);
  // bodies do not share space: overlapping Spellblades are eased apart (never off a ledge or into a wall)
  separatePlayers([...room.players.values()], world);
  stepProjectiles(room, dt, nowSec, world);
  room.tickNumber += 1;
  return room.events;
}
