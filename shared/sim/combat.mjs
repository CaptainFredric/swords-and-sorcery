import {
  GAME, MELEE_CONTACT, SWORD_CHAIN, SWORD_STRIKE_TIMES, bladeAngleAt, closingImpact, guardProfile, meleeContactQuality, nextChainStep,
  resolveSwordVsGuard, swordDamageFor,
} from '../src/combat.mjs';
import { blastDamage, blastDistance, burnFrom, chillFrom, chillScale, spellExposure, spellFor, strongerChill } from '../src/spells.mjs';
import { STEEL, callSteel, chipSteel, steelExposure } from '../src/steel.mjs';
import { galeOnBody, galeRecoil, galeShove } from '../src/gale.mjs';
import { findSwordWorldHit, segmentAabbHit, surfaceHeightAt } from '../src/collision.mjs';
import { SPRINT, movePlayer, resolveSprint, shoveBody, tryStartDash } from '../src/movement.mjs';
import { separatePlayers } from '../src/separation.mjs';
import { chooseSpawn } from './spawns.mjs';
import { recordTransform, sampleTransform } from './history.mjs';

const EYE_HEIGHT = 1.35;
const SWORD_ARC_COS = Math.cos((110 * Math.PI / 180) / 2);
const RESPAWN_SEC = 3;
const SPAWN_PROTECTION_SEC = 1;
const GUARD_REGEN_DELAY_SEC = 1;
const GUARD_REGEN_PER_SEC = 40;
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

function playerCenter(player) {
  return { x: player.position.x, y: player.position.y + 0.9, z: player.position.z };
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
  player.burn = null;
  player.chill = null;
  player.steel = null;
  player.speedScale = 1;
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
  if (guarding && (player.guardStamina <= 0 || nowSec < player.staggerUntil)) return false;
  player.guarding = Boolean(guarding);
  if (guarding) {
    player.guardStartedAt = nowSec;
    stopSwordChain(player);
  }
  room.events.push({ type: guarding ? 'guardStarted' : 'guardEnded', playerId, at: nowSec });
  return true;
}

export function tryDash(room, playerId, direction, nowSec) {
  const player = room.players.get(playerId);
  if (room.state !== 'PLAYING' || !player || !player.alive || nowSec < player.staggerUntil) return false;
  const ok = tryStartDash(player, direction, nowSec);
  if (ok) room.events.push({ type: 'dash', playerId, direction, at: nowSec });
  return ok;
}

/**
 * Sheathe in Steel: the magic hand clenches and the armour hardens at once (shared/src/steel.mjs). It needs that
 * hand free (not gathering a spell); it does not stop a sword or drop a guard.
 */
export function tryActivateSteel(room, playerId, nowSec) {
  const player = room.players.get(playerId);
  if (room.state !== 'PLAYING' || !player || !player.alive || nowSec < player.staggerUntil) return false;
  if (nowSec < (player.steelReadyAt ?? 0) || player.pendingSpell) return false;
  player.steel = callSteel(nowSec);
  player.steelReadyAt = nowSec + STEEL.cooldownSec;
  player.spawnProtectionUntil = Math.min(player.spawnProtectionUntil, nowSec);
  room.events.push({ type: 'steelOn', playerId, at: nowSec, readyAt: player.steelReadyAt });
  return true;
}

/** Gather the Spellblade's spell in the palm; it flies when the gather ends (see stepRoom). */
export function tryCastSpell(room, playerId, direction, nowSec) {
  const player = room.players.get(playerId);
  if (room.state !== 'PLAYING' || !player || !player.alive || nowSec < player.staggerUntil || nowSec < player.spellReadyAt) return false;
  const spell = spellFor(player.spell);
  player.spellReadyAt = nowSec + spell.cooldownSec;
  player.castEndsAt = nowSec + spell.gatherSec;
  player.pendingSpell = { spell: spell.id, direction: normalize3(direction) };
  player.guarding = false;
  stopSwordChain(player);
  player.spawnProtectionUntil = Math.min(player.spawnProtectionUntil, nowSec);
  room.events.push({ type: 'spellCast', playerId, spell: spell.id, at: nowSec, castEndsAt: player.castEndsAt });
  return true;
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
  const start = [attackerTransform.position.x, attackerTransform.position.y + EYE_HEIGHT, attackerTransform.position.z];
  const end = [targetTransform.position.x, targetTransform.position.y + 0.9, targetTransform.position.z];
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
    at: nowSec,
  });
}

// --- the sword strike -------------------------------------------------------------------------------------------
// A strike is live for a short stretch around its contact (MELEE_CONTACT.window): its blade sweeps across the legal
// arc (the third comes straight down), and the first body it meets takes the blow. Where the body sat in the arc and
// how far into the swing it was met decide how cleanly it lands; how hard the two were closing adds to the impact.
// Everything is judged on the lag-compensated transforms of the moment (history.mjs), a sixtieth of a second apart.

const SWEEP_STEP = 1 / 60;
const ARC_TOLERANCE = 3 * Math.PI / 180;

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

// a target's place in a strike seen from the attacker at `atSec`: angle off the facing (+ to the attacker's left),
// distance, and whether anything solid stands between them
function strikeGeometry(attackerTransform, target, atSec, world) {
  const targetTransform = transformFor(target, atSec);
  const dx = targetTransform.position.x - attackerTransform.position.x;
  const dz = targetTransform.position.z - attackerTransform.position.z;
  const dy = (targetTransform.position.y + 0.9) - (attackerTransform.position.y + EYE_HEIGHT);
  const horizontal = Math.hypot(dx, dz);
  const f = forwardFromYaw(attackerTransform.yaw);
  const across = dx * -f.z + dz * f.x;
  const along = dx * f.x + dz * f.z;
  return {
    angle: Math.atan2(-across, along),
    distance: Math.hypot(horizontal, dy),
    horizontal,
    direction: horizontal > 1e-6 ? { x: dx / horizontal, z: dz / horizontal } : { x: f.x, z: f.z },
    blocked: () => targetBlockedByWorld(attackerTransform, targetTransform, world),
  };
}

/** Begin a strike's live stretch (its swing is heard from here). */
function openStrike(room, player, strike, nowSec) {
  player.attackOpened = strike;
  const window = strikeWindow(player, strike);
  const sweep = MELEE_CONTACT.sweep[strike] ?? 0;
  const half = MELEE_CONTACT.arcHalfDeg * Math.PI / 180;
  player.attackSweep = { strike, sampledTo: window.from, bladeAngle: sweep ? sweep * -half : 0, wallChecked: false };
  room.events.push({ type: 'swordSwing', playerId: player.id, strikeIndex: strike, at: nowSec });
}

/** Carry a live strike's sweep on to `nowSec`: it meets a body, meets a wall, or runs out (a miss). */
function sweepStrike(room, player, nowSec, world) {
  const live = player.attackSweep;
  if (!live) return;
  const window = strikeWindow(player, live.strike);
  const half = MELEE_CONTACT.arcHalfDeg * Math.PI / 180;
  const sweep = MELEE_CONTACT.sweep[live.strike] ?? 0;
  const until = Math.min(nowSec, window.to);
  while (player.attackSweep === live && live.sampledTo < until - 1e-9) {
    const at = Math.min(until, nextSample(window, live.sampledTo));
    const dt = at - window.contact;
    const bladeAngle = bladeAngleAt(live.strike, dt);
    const attackerTransform = transformFor(player, at);
    let best = null;
    // a chop meets whatever is in the arc once it is down at body height; a sweep, whoever its blade passes
    const chopping = !sweep && dt >= -MELEE_CONTACT.chopLead;
    const low = Math.min(live.bladeAngle, bladeAngle) - ARC_TOLERANCE;
    const high = Math.max(live.bladeAngle, bladeAngle) + ARC_TOLERANCE;
    if (sweep || chopping) {
      for (const target of room.players.values()) {
        if (target.id === player.id || !target.alive) continue;
        const g = strikeGeometry(attackerTransform, target, at, world);
        if (g.distance > GAME.swordRange || g.horizontal < 1e-6 || Math.abs(g.angle) > half) continue;
        if (sweep && (g.angle < low || g.angle > high)) continue;
        if (g.blocked()) continue;
        if (!best || g.distance < best.g.distance) best = { target, g };
      }
    }
    live.sampledTo = at;
    live.bladeAngle = bladeAngle;
    if (best) {
      player.attackSweep = null;
      landStrike(room, player, live.strike, best.target, best.g, at, nowSec);
      return;
    }
    // at the contact with nobody met yet, a wall in the way stops the blade (and the knight recoils)
    if (!live.wallChecked && dt >= -1e-9) {
      live.wallChecked = true;
      const f = forwardFromYaw(attackerTransform.yaw);
      const origin = [attackerTransform.position.x, attackerTransform.position.y + EYE_HEIGHT, attackerTransform.position.z];
      const worldHit = findSwordWorldHit(origin, [f.x, 0, f.z], GAME.swordRange, world.solids ?? []);
      if (worldHit) {
        player.attackSweep = null;
        recoilFromWall(player, worldHit, nowSec, room);
        return;
      }
    }
  }
  if (player.attackSweep === live && live.sampledTo >= window.to - 1e-9) {
    player.attackSweep = null;
    room.events.push({ type: 'swordMiss', playerId: player.id, strikeIndex: live.strike, at: nowSec });
  }
}

/** The blow lands on `target`: parried, blocked or a hit, as cleanly and as hard as it was met. */
function landStrike(room, attacker, strikeIndex, target, g, atSec, nowSec) {
  if (target.spawnProtectionUntil > nowSec) {
    room.events.push({ type: 'swordProtected', playerId: attacker.id, targetId: target.id, strikeIndex, at: nowSec });
    return;
  }
  const window = strikeWindow(attacker, strikeIndex);
  const quality = meleeContactQuality({ angle: g.angle, distance: g.distance, reach: GAME.swordRange, dt: atSec - window.contact });
  // how hard they were closing on each other along the line between them
  const closing = ((attacker.velocity?.x ?? 0) - (target.velocity?.x ?? 0)) * g.direction.x
    + ((attacker.velocity?.z ?? 0) - (target.velocity?.z ?? 0)) * g.direction.z;
  const impact = closingImpact(closing);

  if (target.guarding && isInGuardCone(target, attacker, atSec)) {
    const guardResult = resolveSwordVsGuard({
      guarding: true,
      guardAgeMs: (nowSec - target.guardStartedAt) * 1000,
      stamina: target.guardStamina,
      profile: guardProfile(target.knightClass),
      // a glancing blow bears less on the guard, a collision more
      pressure: (0.6 + 0.4 * quality) * (1 + MELEE_CONTACT.impactGuard * impact),
    });
    target.guardStamina = guardResult.staminaAfter;
    if (guardResult.kind === 'parry') {
      target.parries += 1;
      attacker.staggerUntil = nowSec + GAME.parryStaggerMs / 1000;
      stopSwordChain(attacker);
      room.events.push({ type: 'parry', attackerId: attacker.id, defenderId: target.id, at: nowSec });
      return;
    }
    target.lastGuardDrainAt = nowSec;
    if (guardResult.kind === 'guardBreak') {
      target.guarding = false;
      target.staggerUntil = nowSec + (GAME.guardBreakStaggerMs / 1000) * (1 + MELEE_CONTACT.impactBreakStagger * impact);
      room.events.push({ type: 'guardBreak', attackerId: attacker.id, defenderId: target.id, impact, at: nowSec });
    } else {
      room.events.push({ type: 'block', attackerId: attacker.id, defenderId: target.id, quality, impact, at: nowSec });
    }
    return;
  }

  const shove = 1.7 * (1 + MELEE_CONTACT.impactKnockback * impact);
  const push = { x: g.direction.x * shove, y: strikeIndex === 2 ? 0.8 : 0.2, z: g.direction.z * shove };
  // hardened armour does not turn a sword (it is a guard against sorcery), but each blow wears some of it away
  if (target.steel) target.steel = chipSteel(target.steel, STEEL.swordChip * quality, nowSec);
  applyDamage(room, attacker.id, target.id, swordDamageFor(quality), 'sword', nowSec, push);
  room.events.push({ type: 'swordHit', playerId: attacker.id, targetId: target.id, strikeIndex, quality, impact, at: nowSec });
}

export function applyDamage(room, attackerId, victimId, amount, source, nowSec, knockback = null) {
  const victim = room.players.get(victimId);
  if (!victim || !victim.alive || victim.spawnProtectionUntil > nowSec) return false;
  victim.health = Math.max(0, victim.health - amount);
  victim.lastDamageAt = nowSec;
  victim.lastAttackerId = attackerId;
  if (knockback) {
    shoveBody(victim, knockback);
    victim.lastKnockbackAt = nowSec;
  }
  room.events.push({ type: 'damage', attackerId, victimId, source, amount, health: victim.health, push: knockback ?? null, at: nowSec });
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
  stopSwordChain(victim);
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
    position: { x: player.position.x + normalized.x * 0.7, y: player.position.y + 1.25, z: player.position.z + normalized.z * 0.7 },
    velocity: { x: normalized.x * spell.speed, y: normalized.y * spell.speed, z: normalized.z * spell.speed },
    bornAt: nowSec,
  };
  room.projectiles.set(id, projectile);
  player.pendingSpell = null;
  player.castEndsAt = 0;
  room.events.push({ type: 'projectileSpawned', projectile: structuredClone(projectile), at: nowSec });
}

// Gale Garner lets go: every body its gust reaches is shoved (its heart also stings a little); a raised guard facing it
// keeps most of its footing but pays for it like a blow; hardened steel turns the sting, not the shove; walls stop it.
// Driven into the ground close by, it throws its caster back off it.
function releaseGale(room, player, spell, nowSec, world) {
  const pending = player.pendingSpell;
  player.pendingSpell = null;
  player.castEndsAt = 0;
  const f = forwardFromYaw(player.yaw);
  const direction = Math.hypot(pending.direction.x, pending.direction.y, pending.direction.z) > 0.01
    ? normalize3(pending.direction) : { x: f.x, y: 0, z: f.z };
  const eye = { x: player.position.x, y: player.position.y + EYE_HEIGHT, z: player.position.z };
  const origin = { x: eye.x + direction.x * 0.35, y: eye.y + direction.y * 0.35, z: eye.z + direction.z * 0.35 };
  const affected = [];
  for (const target of room.players.values()) {
    if (target.id === player.id || !target.alive || target.spawnProtectionUntil > nowSec) continue;
    const caught = galeOnBody(spell, origin, direction, target.position);
    if (caught.pressure <= 0.01) continue;
    const at = caught.point;
    let walled = false;
    for (const box of world.solids ?? []) {
      if (segmentAabbHit([origin.x, origin.y, origin.z], [at.x, at.y, at.z], box)) { walled = true; break; }
    }
    if (walled) continue;
    let shove = galeShove(spell, origin, direction, at, caught.pressure);
    const guarded = target.guarding && isInGuardCone(target, player, nowSec);
    if (guarded) {
      // it holds its ground behind the guard, and the guard pays for it like a blow (its breath waits again)
      shove = { x: shove.x * spell.cone.guarded, y: shove.y * spell.cone.guarded, z: shove.z * spell.cone.guarded };
      target.guardStamina = Math.max(0, target.guardStamina - spell.cone.guardCost * caught.pressure);
      target.lastGuardDrainAt = nowSec;
      if (target.guardStamina <= 1e-9) {
        target.guarding = false;
        target.staggerUntil = nowSec + GAME.guardBreakStaggerMs / 1000;
        room.events.push({ type: 'guardBreak', attackerId: player.id, defenderId: target.id, at: nowSec });
      }
    }
    // its heart stings a little (steel turns that aside, never the shove)
    const armour = steelExposure(target.steel, guarded ? 0 : caught.exposure, nowSec);
    if (armour.turned > 0.1) target.steel = chipSteel(target.steel, STEEL.spellChip * armour.turned, nowSec);
    const damage = Math.round(spell.cone.damage * armour.exposure);
    if (damage >= 1) {
      applyDamage(room, player.id, target.id, damage, spell.id, nowSec, shove);
    } else {
      shoveBody(target, shove);
      target.lastAttackerId = player.id;
      target.lastKnockbackAt = nowSec;
    }
    affected.push({ id: target.id, pressure: caught.pressure, guarded, shove });
  }
  const recoil = galeRecoil(spell, eye, direction, world);
  if (recoil) shoveBody(player, recoil);
  room.events.push({ type: 'galeBlast', playerId: player.id, spell: spell.id, origin, direction, affected, recoil, at: nowSec });
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
    const distance = direct ? 0 : blastDistance(point, player.position);
    if (distance > spell.radius) continue;
    // how directly it caught them decides everything it leaves (hardened armour turns some of it aside)
    const armour = steelExposure(player.steel, spellExposure(spell, distance), nowSec);
    const exposure = armour.exposure;
    if (armour.turned > 0.02) {
      player.steel = chipSteel(player.steel, STEEL.spellChip * armour.turned, nowSec);
      room.events.push({ type: 'steelTurn', playerId: player.id, spell: spell.id, turned: armour.turned, point, at: nowSec });
    }
    const amount = blastDamage(spell, exposure);
    const away = normalize3({ x: center.x - point.x, y: Math.max(0.15, center.y - point.y), z: center.z - point.z });
    const hit = applyDamage(room, projectile.ownerId, player.id, amount, spell.id, nowSec, {
      x: away.x * 4.3 * shove, y: away.y * 2.3 * shove, z: away.z * 4.3 * shove,
    });
    if (!hit || !player.alive) continue;
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
      const c = playerCenter(target);
      const d = Math.hypot(c.x - after.x, c.y - after.y, c.z - after.z);
      if (d < 0.75) { direct = target; break; }
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
    stepAfflictions(room, player, nowSec);
    if (!player.alive) continue;

    const guardCapacity = guardProfile(player.knightClass).capacity;
    if (!player.guarding && nowSec - player.lastGuardDrainAt >= GUARD_REGEN_DELAY_SEC && player.guardStamina < guardCapacity) {
      player.guardStamina = Math.min(guardCapacity, player.guardStamina + GUARD_REGEN_PER_SEC * dt);
    }
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
    });
    if (player.sprinting) {
      player.guardStamina = Math.max(0, player.guardStamina - SPRINT.staminaPerSec * dt);
      player.lastGuardDrainAt = nowSec;
    }

    const input = staggered
      ? { forward: 0, right: 0, jump: false, yaw: player.yaw, pitch: player.pitch }
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
    } else if ((player.attackHeld || player.attackQueued) && !player.attackActive && nowSec >= (player.attackRestartAt ?? -Infinity) && nowSec >= player.staggerUntil) {
      // a held or waiting press starts the chain the moment it became legal (at most a tick back), not at the tick
      // that noticed: holding comes round exactly on time
      const legal = Math.max(player.attackRestartAt ?? -Infinity, player.staggerUntil ?? -Infinity);
      startSwordChain(player, Math.min(nowSec, Math.max(nowSec - dt, legal)));
    }
    // a live strike sweeps on to the end of its stretch (the last one past the chain's own end)
    if (player.attackSweep) sweepStrike(room, player, nowSec, world);
  }

  // bodies do not share space: overlapping Spellblades are eased apart (never off a ledge or into a wall)
  separatePlayers([...room.players.values()], world);
  stepProjectiles(room, dt, nowSec, world);
  room.tickNumber += 1;
  return room.events;
}
